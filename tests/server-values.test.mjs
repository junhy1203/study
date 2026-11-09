import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createTokenVerifier} from '../functions/token-verifier.js';
import {isNetworkFailure,readableNetworkError} from '../network-errors.js';
import {createReadCache} from '../client-cache.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('concurrent authenticated data requests share verification and one remote account lookup',async()=>{
  let checks=0,lookups=0,now=0;
  const verify=createTokenVerifier({verifyIdToken:async()=>{checks++;await settle();return {uid:'alice',auth_time:100};},getUser:async()=>{lookups++;await settle();return {disabled:false};}},{clock:()=>now});
  await Promise.all(Array.from({length:12},()=>verify('same-token')));
  assert.equal(checks,1);assert.equal(lookups,1);
  await verify('new-token');assert.equal(lookups,1);
  now=45000;await Promise.all([verify('next'),verify('other')]);assert.equal(lookups,2);
});
test('sensitive face checks remain fresh and rejected account lookups can retry',async()=>{
  let calls=0,fail=true;
  const verify=createTokenVerifier({verifyIdToken:async(_,fresh)=>{if(fresh)calls++;return {uid:'alice',auth_time:100};},getUser:async()=>{if(fail)throw Error('offline');return {disabled:false};}});
  await assert.rejects(verify('general'));fail=false;await verify('general');
  await Promise.all([verify('face',{checkRevoked:true}),verify('face',{checkRevoked:true})]);assert.equal(calls,2);
  const disabled=createTokenVerifier({verifyIdToken:async()=>({uid:'alice',auth_time:100}),getUser:async()=>({disabled:true})});
  await assert.rejects(disabled('token'),/revoked/);
});
async function clientFixture(){
  const requests=[];let uid='alice',reply=null;
  const source=(await readFile(new URL('../server-client.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const context=vm.createContext({URL,AbortSignal,AbortController,queueMicrotask,setTimeout,clearTimeout,TextDecoder,isNetworkFailure,readableNetworkError,authReady:Promise.resolve(true),getAuthUser:()=>({uid,getIdToken:async()=>uid}),backendConfig:{apiBaseUrl:'https://api.example.test'},fetch:async(url,options)=>{
    const body=JSON.parse(options.body);requests.push({path:new URL(url).pathname,body});
    if(typeof reply==='function')return reply(url,options);
    const value=ref=>ref.kind==='query'?{docs:[{id:'row',exists:true,data:{totalSeconds:42}}]}:{id:ref.path.split('/').at(-1),exists:true,data:{totalSeconds:7}};
    if(reply instanceof Response)return reply;
    const payload=reply||(body.reads?{results:body.reads.map(ref=>({value:value(ref)}))}:value(body));
    return body.reads?new Response(payload.results.map((row,index)=>JSON.stringify({index,...row})).join('\n')+'\n'):new Response(JSON.stringify(payload));
  }});
  vm.runInContext(source+'\nglobalThis.client={doc,collection,getDoc,getDocs,serverCallable,readLines,onSnapshot};',context);
  return {client:context.client,requests,setUid:value=>{uid=value;},setReply:value=>{reply=value;}};
}
test('parallel document/query reads share one batch and duplicate reads share their result',async()=>{
  const {client:c,requests}=await clientFixture(),doc=c.doc(null,'users','alice','stats','summary');
  const [a,b,rows]=await Promise.all([c.getDoc(doc),c.getDoc(doc),c.getDocs(c.collection(null,'leaderboards','week','entries'))]);
  assert.equal(requests.length,1);assert.equal(requests[0].path,'/api/v1/read-batch');assert.equal(requests[0].body.reads.length,2);
  assert.equal(a.data().totalSeconds,7);assert.equal(b.data().totalSeconds,7);assert.equal(rows.docs[0].data().totalSeconds,42);
});

test('face status retries one interrupted response body; study creation never repeats a potentially committed write',async()=>{
  const f=await clientFixture();let attempts=0;
  f.setReply(()=>++attempts===1?{ok:true,status:200,json:async()=>{throw new TypeError('Load failed');}}:new Response(JSON.stringify({data:{active:null}})));
  const status=await f.client.serverCallable('getFaceEnrollmentStatus')();
  assert.equal(status.data.active,null);assert.equal(attempts,2);
  attempts=0;f.setReply(()=>{attempts++;return {ok:true,status:200,json:async()=>{throw new TypeError('Load failed');}};});
  await assert.rejects(f.client.serverCallable('startStudySession')(),error=>error.code==='functions/unavailable'&&/서버 연결/.test(error.message));
  assert.equal(attempts,1,'lost write replies must not create a second session');
});

test('interrupted streams and document bodies expose an actionable connection error',async()=>{
  const f=await clientFixture();
  f.setReply(()=>({ok:true,status:200,json:async()=>{throw new TypeError('Load failed');}}));
  await assert.rejects(f.client.getDoc(f.client.doc(null,'users','alice')),error=>error.code==='functions/unavailable'&&!error.message.includes('Load failed'));
  const stream=new ReadableStream({start(controller){controller.error(new TypeError('Load failed'));}});
  await assert.rejects(async()=>{for await(const value of f.client.readLines(new Response(stream)))void value;},error=>error.code==='functions/unavailable'&&/다시 시도/.test(error.message));
});
test('batch errors are isolated and a single read keeps the existing endpoint',async()=>{
  const {client:c,requests,setReply}=await clientFixture();await c.getDoc(c.doc(null,'users','alice'));
  assert.equal(requests[0].path,'/api/v1/read');
  setReply({results:[{error:{code:'permission-denied',message:'denied'}},{value:{id:'ok',exists:true,data:{totalSeconds:9}}}]});
  const result=await Promise.allSettled([c.getDoc(c.doc(null,'users','bob')),c.getDoc(c.doc(null,'users','alice','stats','summary'))]);
  assert.equal(result[0].status,'rejected');assert.equal(result[0].reason.code,'functions/permission-denied');assert.equal(result[1].value.data().totalSeconds,9);
});
test('a fast batch value resolves while another value is still streaming',async()=>{
  const f=await clientFixture();let streamController,fast=false,slow=false;
  const stream=new ReadableStream({start(controller){streamController=controller;controller.enqueue(new TextEncoder().encode(JSON.stringify({index:0,value:{id:'fast',exists:true,data:{totalSeconds:9}}})+'\n'));}});
  f.setReply(new Response(stream));
  const a=f.client.getDoc(f.client.doc(null,'users','alice','stats','fast')).then(value=>{fast=true;return value;});
  const b=f.client.getDoc(f.client.doc(null,'users','alice','stats','slow')).then(value=>{slow=true;return value;});
  await settle();assert.equal(fast,true);assert.equal(slow,false);
  streamController.enqueue(new TextEncoder().encode(JSON.stringify({index:1,value:{id:'slow',exists:true,data:{totalSeconds:4}}})+'\n'));streamController.close();
  await Promise.all([a,b]);assert.equal(slow,true);
});
test('queued reads never cross accounts and large bursts split at sixteen references',async()=>{
  const f=await clientFixture(),pending=f.client.getDoc(f.client.doc(null,'users','alice'));f.setUid('bob');await assert.rejects(pending,/계정/);assert.equal(f.requests.length,0);
  await Promise.all(Array.from({length:35},(_,i)=>f.client.getDoc(f.client.doc(null,'users','bob','stats',String(i)))));
  assert.deepEqual(f.requests.map(r=>r.body.reads?.length||1),[16,16,3]);
});
test('statistics remain available for display after expiration without counting as fresh',()=>{
  let now=0;
  const cache=createReadCache({storage:null,now:()=>now});
  cache.set('today',{totalSeconds:123},100,500);
  now=200;
  assert.equal(cache.get('today'),undefined);
  assert.equal(cache.get('today',{allowStale:true}).totalSeconds,123);
  now=500;
  assert.equal(cache.get('today',{allowStale:true}),undefined);
});
test('initial statistics arrive through the profile stream and older servers release pending reads',async()=>{
  const fixture=await clientFixture(),ref=fixture.client.doc(null,'users','alice');
  for(const supported of [true,false]){
    const profile={type:'snapshot',exists:true,id:'alice',data:{studyRevision:1}};
    const value={exists:true,id:'summary',data:{totalSeconds:123}};
    fixture.setReply(new Response([supported?{...profile,initialReads:true}:profile,...(supported?[{type:'read',index:0,value}]:[])].map(row=>JSON.stringify(row)).join('\n')+'\n'));
    const result=await new Promise(resolve=>{
      const stop=fixture.client.onSnapshot(ref,()=>{},assert.fail,{
        initialReads:[fixture.client.doc(null,'users','alice','stats','summary')],
        onInitialRead:(_,item)=>{resolve(item);queueMicrotask(stop);},
      });
    });
    assert.equal(result?.data.totalSeconds,supported?123:undefined);
  }
  assert.ok(fixture.requests.every(request=>request.path==='/api/v1/watch'&&request.body.initialReads.length===1));
});
test('fast values from the initial stream render before a slow ranking request finishes',async()=>{
  const source=await readFile(new URL('../data.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('function statsRef('),source.indexOf('\nasync function connectUser()'));
  let releaseRanking,paints=0;
  const context=vm.createContext({focusReceiptEpoch:0,state:{profile:{},pending:new Set(['today','ranking']),available:new Set(),failed:new Set()},sdk:{getDoc:assert.fail,getDocs:assert.fail},db:{},connectedUid:'alice',generation:1,document:{hidden:false},dateKey:()=> '2026-11-02',visibleDataKeys:()=>new Set(['today','ranking']),statsRevision:()=>0,readCache:createReadCache({storage:null}),dataRequests:new Map(),paint(){paints++;},notice(error){throw error;},errorText:e=>e});
  const reads=new Map([['today',Promise.resolve({data:{totalSeconds:123}})],['ranking',new Promise(resolve=>{releaseRanking=()=>resolve({docs:[]});})]]);
  vm.runInContext(fn+'\nglobalThis.load=loadVisibleData;',context);const loading=context.load(reads);await settle();
  assert.equal(context.state.today.totalSeconds,123);assert.ok(paints>0);assert.equal(context.state.pending.has('ranking'),true);
  releaseRanking();await loading;assert.equal(context.state.pending.size,0);
});
