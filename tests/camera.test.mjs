import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { facePose, paintAvatar } from '../camera-avatar.js';
import { FACE_SUCCESS_MS } from '../camera-face-effect.js';
import { createFocusTracker } from '../camera-focus.js';
import {createStudyGuard as realCreateStudyGuard} from '../study-guard.js';
const createStudyGuard=options=>realCreateStudyGuard({...options,window:Object.assign(options.window,{
  screen:options.window.screen??{width:390,height:844},innerWidth:options.window.innerWidth??390,innerHeight:options.window.innerHeight??700})});
const healthySignals = { reliable:true, face:true, body:true, eyesClosed:false, phoneUse:false, studyActivity:true };

test('camera startup waits for both encrypted profile readiness and the first face match',async()=>{
  let finishAccount,finishPlayback,finishVerification,finishProfile,waiting=false,finished=false;
  const messages=[],frames=[],faceContext={uid:'owner'};
  class Worker {
    constructor(){messages.push('created');}
    postMessage(data){messages.push(data);}
  }
  const video={setAttribute(){},play:()=>new Promise(resolve=>{finishPlayback=resolve;}),remove(){}};
  const stream={getVideoTracks:()=>[],getTracks:()=>[]};
  const document={hidden:false,createElement:()=>video,querySelector:()=>null,addEventListener(){},body:{append(){}}};
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  const context=vm.createContext({createStudyGuard,document,crypto,Event,createFocusTracker,URL,Worker,setTimeout:()=>0,clearTimeout(){},recordFrame:()=>frames.push(true),performance:{now:()=>0},window:{addEventListener(){},dispatchEvent(){}},
    navigator:{mediaDevices:{getUserMedia:async()=>stream}},prepareFaceSession:()=>new Promise(resolve=>{finishAccount=resolve;}),faceWorkerContext:()=>faceContext,attachFacePreview(){},
    waitForFaceSessionReady:()=>new Promise(resolve=>{finishProfile=resolve;}),
    waitForFaceVerification:()=>{waiting=true;return new Promise(resolve=>{finishVerification=resolve;});}});
  vm.runInContext(`${source}\nstartCameraWatchdog=()=>{};frame=async()=>recordFrame();globalThis.startCamera=startCamera;globalThis.state=cameraState;globalThis.workerReady=()=>worker.onmessage({data:{type:'ready'}});`,context);
  const start=context.startCamera().then(result=>{finished=true;return result;});
  assert.equal(messages[0],'created');assert.equal(messages[1].type,'prepare');assert.equal(messages[1].faceSecurity,undefined);
  finishAccount(faceContext);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(messages.length,3);assert.equal(messages[2].type,'init');assert.equal(messages[2].faceSecurity,faceContext);
  context.workerReady();assert.equal(frames.length,0);
  finishPlayback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(frames.length,1);
  assert.equal(waiting,false);assert.equal(finished,false);finishProfile(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(waiting,true);assert.equal(finished,false);assert.equal(context.state().identityPhase,'loading');
  finishVerification(true);assert.equal(await start,true);
});

test('unranked camera starts local detection without loading a face profile or waiting for verification',async()=>{
  const messages=[],video={setAttribute(){},play:async()=>{},remove(){}};
  const stream={getVideoTracks:()=>[],getTracks:()=>[]};
  const document={hidden:false,createElement:()=>video,querySelector:()=>null,addEventListener(){},body:{append(){}}};
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  const forbidden=()=>assert.fail('pose-only startup must not use face identity');
  const context=vm.createContext({createStudyGuard,document,crypto,Event,createFocusTracker,URL,
    Worker:class {postMessage(data){messages.push(data);}},setTimeout:()=>0,performance:{now:()=>0},window:{addEventListener(){},dispatchEvent(){}},
    navigator:{mediaDevices:{getUserMedia:async()=>stream}},prepareFaceSession:async()=>({choice:'unranked'}),faceWorkerContext:forbidden,attachFacePreview:forbidden,
    waitForFaceSessionReady:forbidden,waitForFaceVerification:forbidden});
  vm.runInContext(`${source}\nstartCameraWatchdog=()=>{};globalThis.startCamera=startCamera;globalThis.state=cameraState;`,context);
  assert.equal(await context.startCamera({allowUnranked:true}),true);
  assert.equal(video.srcObject,stream);
  assert.equal(context.state().unranked,true);
  assert.equal(messages.length,1);
  assert.equal(messages[0].type,'init');
  assert.equal(messages[0].poseOnly,true);
  assert.equal(messages[0].faceSecurity,null);
});
test('account settings reenrollment replaces the profile without starting a study session',async()=>{
  const clicks=[],settings={open:true,close(){this.open=false;}},button={disabled:false};let options,toast;
  const video={setAttribute(){},remove(){}};
  const document={hidden:false,createElement:()=>video,querySelector:selector=>selector==='#account-settings'?settings:null,addEventListener:(name,handler)=>{if(name==='click')clicks.push(handler);}};
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  const context=vm.createContext({createStudyGuard,document,crypto,Event,createFocusTracker,performance:{now:()=>0},clearTimeout(){},clearInterval(){},showToast:text=>{toast=text;},window:{addEventListener(){},dispatchEvent(){}}});
  context.saveOptions=value=>{options=value;};
  vm.runInContext(`${source}\nstartCamera=async options=>{saveOptions(options);enabled=true;return true;};`,context);
  for(const click of clicks)await click({target:{closest:selector=>selector==='[data-face-reenroll]'?button:null}});
  assert.equal(options.replace,true);assert.equal(options.registrationOnly,true);assert.equal(settings.open,false);assert.equal(button.disabled,false);assert.match(toast,/재등록이 완료/);
  const html=await readFile(new URL('../account.html',import.meta.url),'utf8');
  assert.match(html,/<dialog[^>]*id="account-settings"[\s\S]*data-face-reenroll[\s\S]*<\/dialog>/);
});

test('inference requests are at least 400ms apart and never overlap a pending frame',async()=>{
  let now=0;const sent=[],delays=[],video={readyState:2,currentTime:0,setAttribute(){}};
  const document={hidden:false,createElement:()=>video,querySelector:()=>null,addEventListener(){}};
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  const context=vm.createContext({createStudyGuard,document,crypto,Event,createFocusTracker,performance:{now:()=>now},setTimeout:(_,delay)=>{delays.push(delay);return 1;},createImageBitmap:async()=>({close(){}}),send:data=>sent.push(data),window:{addEventListener(){},dispatchEvent(){}}});
  vm.runInContext(`${source}\nenabled=ready=true;worker={postMessage:send};globalThis.runFrame=()=>frame(revision);globalThis.ack=()=>{inFlight=false;};`,context);
  await context.runFrame();assert.equal(sent.length,1);
  context.ack();now=50;video.currentTime=.05;await context.runFrame();assert.equal(sent.length,1);
  now=399;video.currentTime=.399;await context.runFrame();assert.equal(sent.length,1);
  now=400;video.currentTime=.4;await context.runFrame();assert.equal(sent.length,2);
  now=800;video.currentTime=.8;await context.runFrame();assert.equal(sent.length,2);
  context.ack();await context.runFrame();assert.equal(sent.length,3);
  assert.deepEqual(sent.map(data=>data.time),[0,400,800]);assert.ok(delays.every(delay=>delay===400));
});

test('enrollment tracking runs at 80ms without overlapping requests or adding inference idle time',async()=>{
  let now=0;const sent=[],delays=[],video={readyState:2,currentTime:0,setAttribute(){}};
  const document={hidden:false,createElement:()=>video,querySelector:()=>null,addEventListener(){}};
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  const context=vm.createContext({createStudyGuard,document,crypto,Event,createFocusTracker,performance:{now:()=>now},setTimeout:(_,delay)=>{delays.push(delay);return 1;},createImageBitmap:async()=>({close(){}}),send:data=>sent.push(data),window:{addEventListener(){},dispatchEvent(){}}});
  vm.runInContext(`${source}\nenabled=ready=true;identityPhase='enrolling';worker={postMessage:send};globalThis.runFrame=()=>frame(revision);globalThis.phase=()=>identityPhase;globalThis.ack=(enrolled=false)=>acceptResult({time:performance.now(),inferenceMs:500,signals:{reliable:true,face:true,identity:{enrolled,matched:false,status:enrolled?'checking':'enrolling'}}});`,context);
  await context.runFrame();assert.equal(sent.length,1);
  now=80;video.currentTime=.08;await context.runFrame();assert.equal(sent.length,1);
  context.ack();assert.equal(context.phase(),'enrolling','the verification gate must not overwrite enrollment');await context.runFrame();assert.equal(sent.length,2,'no extra half-inference pause');
  context.ack();now=159;video.currentTime=.159;await context.runFrame();assert.equal(sent.length,2);
  now=160;video.currentTime=.16;await context.runFrame();assert.equal(sent.length,3);
  assert.ok(delays.every(delay=>delay===80));
  context.ack(true);assert.equal(context.phase(),'checking','completed enrollment still enters the identity verification gate');
  now=240;video.currentTime=.24;await context.runFrame();assert.equal(sent.filter(data=>data.type==='frame').length,3);
  assert.equal(delays.at(-1),400);
});

test('enrollment follows new video frames and cancels the callback on shutdown',async()=>{
  let now=0,sequence=0;const sent=[],callbacks=new Map(),cancelled=[];
  const video={readyState:2,currentTime:0,setAttribute(){},remove(){},
    requestVideoFrameCallback:fn=>{const id=++sequence;callbacks.set(id,fn);return id;},
    cancelVideoFrameCallback:id=>{cancelled.push(id);callbacks.delete(id);}};
  const document={hidden:false,createElement:()=>video,querySelector:()=>null,addEventListener(){}};
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  const context=vm.createContext({createStudyGuard,document,crypto,Event,createFocusTracker,clearTimeout(){},clearInterval(){},performance:{now:()=>now},setTimeout(){throw Error('Enrollment must use video delivery');},createImageBitmap:async()=>({close(){}}),send:data=>sent.push(data),window:{addEventListener(){},dispatchEvent(){}}});
  vm.runInContext(`${source}\nenabled=ready=true;identityPhase='enrolling';worker={postMessage:send,terminate(){}};globalThis.runFrame=()=>frame(revision);globalThis.ack=()=>acceptResult({time:performance.now(),signals:{reliable:true,face:true,identity:{enrolled:false}}});globalThis.stop=stopCamera;`,context);
  const deliver=async time=>{now=time;video.currentTime=time/1000;const [id,callback]=callbacks.entries().next().value;callbacks.delete(id);callback();await new Promise(resolve=>setImmediate(resolve));};
  await context.runFrame();assert.equal(sent.length,1);assert.equal(callbacks.size,1);
  context.ack();await deliver(100);assert.equal(sent.length,2);
  await deliver(200);assert.equal(sent.length,2,'never queue an older frame behind pending inference');
  context.ack();await deliver(300);assert.equal(sent.length,3);assert.equal(sent.at(-1).time,300);
  context.stop();assert.equal(callbacks.size,0);assert.equal(cancelled.length,1);
});

test('repeated slow phone inference switches once to the light worker and ignores the replaced worker',async()=>{
  const workers=[];
  class Worker{constructor(){workers.push(this);}postMessage(data){this.init=data;}terminate(){this.terminated=true;}}
  const document={hidden:false,createElement:()=>({setAttribute(){}}),querySelector:()=>null,addEventListener(){}};
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  const context=vm.createContext({createStudyGuard,URL,Worker,document,crypto,Event,createFocusTracker,setTimeout:()=>0,clearTimeout(){},performance:{now:()=>0},facePose:()=>null,window:{addEventListener(){},dispatchEvent(){}}});
  vm.runInContext(`${source}\nenabled=true;startRecognitionWorker(revision);`,context);
  workers[0].onmessage({data:{type:'phone-observation',slow:true,epoch:0,observation:{epoch:0}}});
  assert.equal(workers.length,2);assert.equal(workers[0].terminated,true);
  assert.equal(workers[1].init.light,true);assert.equal(workers[0].init.identityKey,workers[1].init.identityKey);
  workers[0].onmessage({data:{type:'phone-observation',slow:true,epoch:0,observation:{epoch:0}}});
  workers[1].onmessage({data:{type:'phone-observation',slow:false,epoch:0,observation:{epoch:0}}});
  assert.equal(workers.length,2);assert.notEqual(workers[1].terminated,true);
});

test('independent phone completion pauses immediately without releasing an in-flight face frame',async()=>{
  let now=0;
  const document={hidden:false,createElement:()=>({setAttribute(){}}),querySelector:()=>null,addEventListener(){}};
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  const context=vm.createContext({createStudyGuard,document,crypto,Event,createFocusTracker,performance:{now:()=>now},facePose:()=>null,window:{addEventListener(){},dispatchEvent(){}}});
  vm.runInContext(`${source}\nenabled=true;globalThis.camera={acceptResult,acceptPhoneObservation,cameraState};globalThis.pending=()=>{inFlight=true;};globalThis.flight=()=>({inFlight,lastResult});`,context);
  const camera=context.camera,box=[.3,.5,.12,.2];
  const face=()=>camera.acceptResult({signals:{...healthySignals,phonePolicy:'tracked'},time:now,epoch:4});
  const phone=(candidates)=>camera.acceptPhoneObservation({epoch:4,observation:{version:2,id:now,frameId:now,observedAt:now,completedAt:now,epoch:4,status:'ok',region:{x:0,y:0,width:1,height:1},candidates}});
  face();now=1000;face();phone([]);now=2000;face();phone([]);
  now=2200;face();phone([{box,score:.6}]);now=2600;face();context.pending();
  now=2700;phone([{box,score:.6}]);
  assert.equal(camera.cameraState().reason,'phone');assert.equal(camera.cameraState().tracking,false);
  assert.equal(context.flight().inFlight,true);assert.equal(context.flight().lastResult,2600);
});

test('worker serializes frames across epochs and maps completion to the capture clock',async()=>{
  let now=20,release;
  const sent=[],started=[],closed=[],discarded=[];
  const self={postMessage:message=>sent.push(message)};
  const engine={discardPendingFaceSample(){discarded.push(now);},async detect(_bitmap,time,epoch,timing){
    started.push([epoch,timing.receivedAt,timing.now()]);
    if(epoch===1)await new Promise(resolve=>{release=resolve;});
    if(!timing.isCurrent())return null;
    return {type:'result',time,completedAt:timing.now()};
  }};
  const source=await readFile(new URL('../camera-worker.js',import.meta.url),'utf8');
  const context=vm.createContext({self,engine,performance:{timeOrigin:1300,now:()=>now}});
  vm.runInContext(`${source}\ndetector=engine;`,context);
  const frame=(epoch,time)=>self.onmessage({data:{type:'frame',epoch,time,clockOrigin:1000,bitmap:{close:()=>closed.push(epoch)}}});
  const first=frame(1,100);
  await Promise.resolve();
  now=40;const obsolete=frame(2,110);
  now=50;const latest=frame(3,120);
  assert.deepEqual(started,[[1,320,320]]);
  now=80;release();
  await Promise.all([first,obsolete,latest]);
  assert.deepEqual(started,[[1,320,320],[3,350,380]]);
  assert.deepEqual(discarded,[40,50]);
  assert.deepEqual(closed,[1,2,3]);
  assert.equal(sent.length,1);assert.equal(sent[0].epoch,3);assert.equal(sent[0].completedAt,380);
});

test('manual pause during engine setup survives detection and visibility changes until explicit resume',async()=>{
  let now=0;
  const handlers={},document={hidden:false,createElement:()=>({setAttribute(){}}),querySelector:()=>null,addEventListener:(name,handler)=>{handlers[name]=handler;}};
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  const context=vm.createContext({createStudyGuard,document,crypto,Event,createFocusTracker,clearTimeout,performance:{now:()=>now},facePose:()=>null,window:{addEventListener(){},dispatchEvent(){}}});
  vm.runInContext(`${source}\nenabled=true;globalThis.camera={toggleCameraPause,cameraState,acceptResult,setStatus};`,context);
  const camera=context.camera;
  camera.toggleCameraPause();assert.equal(camera.cameraState().manuallyPaused,true);
  for(now=0;now<=10000;now+=1000)camera.acceptResult({signals:healthySignals,time:now});
  document.hidden=true;handlers.visibilitychange();document.hidden=false;handlers.visibilitychange();
  camera.setStatus('tracking','detected',true);
  assert.equal(camera.cameraState().tracking,false);assert.equal(camera.cameraState().status,'paused');
  camera.toggleCameraPause();assert.equal(camera.cameraState().manuallyPaused,false);
  camera.acceptResult({signals:healthySignals,time:now});assert.equal(camera.cameraState().tracking,false);
  now+=2000;camera.acceptResult({signals:healthySignals,time:now});assert.equal(camera.cameraState().tracking,true);
});

test('manual resume requires a fresh owner match before tracking restarts', async () => {
  let now = 1000;
  const sent = [];
  const worker = { postMessage: data => sent.push(data.type) };
  const document = { hidden: false, createElement: () => ({ setAttribute() {} }), querySelector: () => null, addEventListener() {} };
  const source = (await readFile(new URL('../camera.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '').replaceAll('import.meta.url', JSON.stringify(import.meta.url));
  const context = vm.createContext({ createStudyGuard, document, crypto, Event, URL, createFocusTracker, Worker: function () { return worker; },
    setTimeout: () => 1, clearTimeout() {}, performance: { now: () => now },
    window: { addEventListener() {}, dispatchEvent() {} } });
  vm.runInContext(`${source}\nenabled=true;startRecognitionWorker(revision);globalThis.camera={toggleCameraPause,cameraState};`, context);
  const receive = data => worker.onmessage({ data });
  const result = (epoch, matched, checkedAt = now) => receive({ type: 'result', epoch, time: now,
    signals: { ...healthySignals, identity: { enrolled: true, matched, checkedAt } } });
  receive({ type: 'ready' });
  receive({ type: 'models-ready' });
  result(0, false);
  now += 400;
  result(0, true);
  const camera = context.camera;
  assert.equal(camera.cameraState().tracking, true);

  camera.toggleCameraPause();
  now += 400;
  camera.toggleCameraPause();
  assert.equal(sent.at(-1), 'face-verification-reset');
  assert.equal(camera.cameraState().identityPhase, 'checking');
  result(0, true); // A frame requested before the resume click.
  assert.equal(camera.cameraState().tracking, false);
  result(1, true, 1400); // Cached match stamped before the new attempt.
  assert.equal(camera.cameraState().tracking, false);
  now += 2000;
  result(1, false);
  assert.equal(camera.cameraState().tracking, false);
  now += 400;
  result(1, true);
  assert.equal(camera.cameraState().tracking, true);
});

test('a live SP word companion cannot bypass the background study pause',async()=>{
  let now=1000;const handlers={},document={hidden:false,createElement:()=>({setAttribute(){}}),querySelector:()=>null,addEventListener:(name,handler)=>{handlers[name]=handler;}};
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  const context=vm.createContext({createStudyGuard,document,crypto,Event,createFocusTracker,performance:{now:()=>now},facePose:()=>null,window:{addEventListener(){},dispatchEvent(){}}});
  vm.runInContext(`${source}\nenabled=true;globalThis.camera={setCameraCompanion,cameraState,acceptResult,cameraVisible};`,context);
  const camera=context.camera;camera.setCameraCompanion(30000);document.hidden=true;handlers.visibilitychange();
  camera.acceptResult({signals:healthySignals,time:now});now+=2000;camera.acceptResult({signals:healthySignals,time:now});assert.equal(camera.cameraState().tracking,false);
  now+=30000;assert.equal(camera.cameraVisible(),false);camera.setCameraCompanion(0);assert.equal(camera.cameraState().tracking,false);
});

test('screen ratio pause defeats late worker results and requires fresh healthy recovery',async()=>{
  let now=0;const handlers={};
  const window={screen:{width:390,height:844},innerWidth:390,innerHeight:700,
    addEventListener:(type,handler)=>{handlers[type]=handler;},dispatchEvent(){}};
  const document={hidden:false,createElement:()=>({setAttribute(){}}),querySelector:()=>null,addEventListener(){}};
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  const context=vm.createContext({createStudyGuard,window,document,crypto,Event,createFocusTracker,performance:{now:()=>now},facePose:()=>null,clearTimeout(){}});
  vm.runInContext(`${source}\nenabled=true;studyGuard.start();globalThis.camera={cameraState,acceptResult};`,context);
  const result=()=>context.camera.acceptResult({signals:healthySignals,time:now});
  result();now=2000;result();assert.equal(context.camera.cameraState().tracking,true);
  window.innerWidth=200;handlers.resize();assert.equal(context.camera.cameraState().tracking,false);
  now+=500;result();assert.equal(context.camera.cameraState().tracking,false,'late worker cannot resume a changed viewport');
  window.innerWidth=390;handlers.resize();result();assert.equal(context.camera.cameraState().tracking,false);
  now+=2000;result();assert.equal(context.camera.cameraState().tracking,true);
});

test('avatar follows mirrored head position and tilt within safe display bounds', () => {
  assert.deepEqual(facePose({ 1: { x: .5, y: .5 }, 33: { x: .3, y: .4 }, 263: { x: .7, y: .4 } }), { x: 0, y: 0, roll: -0 });
  const pose = facePose({ 1: { x: 0, y: 1 }, 33: { x: .3, y: .2 }, 263: { x: .6, y: .6 } });
  assert.deepEqual(pose, { x: 24, y: 15, roll: -28 });
});

test('missing or non-finite face points produce a neutral avatar', () => {
  assert.equal(facePose(null), null);
  assert.equal(facePose({ 1: { x: NaN, y: .5 } }), null);
  assert.equal(facePose({ 1: { x: .5, y: .5 }, 33: { x: .3, y: .4 }, 263: { x: Infinity, y: .4 } }), null);
});

function avatarMount() {
  const element = () => ({ classList: { toggle() {} }, style: { setProperty() {} }, setAttribute() {} });
  const avatar = element(), recognition = element();
  return { dataset: {}, querySelector: selector => selector === '.cam-avatar' ? avatar : recognition, querySelectorAll: () => [] };
}

test('behavior warning and return use separate accessible indicators', () => {
  const mount = avatarMount(), pose = { x: 0, y: 0, roll: 0 };
  const warning = {}, recognition = {};
  const lookup = mount.querySelector;
  mount.querySelector = selector => selector === '.cam-warning'
    ? {setAttribute: (key, value) => {warning[key] = value;}}
    : selector === '.cam-recognition'
      ? {setAttribute: (key, value) => {recognition[key] = value;}} : lookup(selector);
  paintAvatar(mount, null, false, 'behavior-warning', 0);
  assert.equal(mount.dataset.avatarPhase, 'warning');
  assert.equal(warning['aria-hidden'], 'false');
  assert.equal(recognition['aria-hidden'], 'true');
  paintAvatar(mount, pose, false, 'returning', 1000, {remainingMs: 1000});
  assert.equal(mount.dataset.avatarPhase, 'returning');
  assert.equal(warning['aria-hidden'], 'true');
  assert.equal(recognition['aria-hidden'], 'false');
  assert.match(recognition['aria-label'], /1.0초 남음/);
  paintAvatar(mount, pose, true, 'tracking', 2200);
  assert.equal(mount.dataset.avatarPhase, 'avatar');
  paintAvatar(mount, null, false, 'manual-paused', 2300);
  assert.equal(mount.dataset.avatarPhase, 'paused');
  paintAvatar(mount, null, false, 'off', 2400);
  assert.equal(mount.dataset.avatarPhase, 'idle');
});

test('the study camera separates loading, failure, return countdown and authentication',async contextTest=>{
  contextTest.mock.timers.enable({ apis: ['setTimeout'] });
  const source=(await readFile(new URL('../camera.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  let now=0;
  const mount=avatarMount(),statusLine={textContent:''};
  const nodes={'[data-camera-video]':mount,'[data-camera-status]':statusLine,'[data-camera-resolution]':{}};
  const root={dataset:{},classList:{toggle(){}},querySelector:selector=>nodes[selector]};
  const document={hidden:false,createElement:()=>({setAttribute(){}}),querySelector:()=>root,addEventListener(){}};
  let verified=0;
  const context=vm.createContext({createStudyGuard,document,crypto,Event,createFocusTracker,paintAvatar,FOCUS_LIMITS:{resume:2000},
    handleFaceWorkerEvent:()=>{verified++;},
    performance:{now:()=>now},window:{addEventListener(){},dispatchEvent(){}}});
  vm.runInContext(`${source}\nenabled=true;identityPhase='loading';setStatus('opening','학습 준비 중…');globalThis.result=applyResult;globalThis.state=cameraState;`,context);
  assert.equal(mount.dataset.avatarPhase,'loading');
  const result=(time,matched,face=true)=>{now=time;context.result({time,signals:{...healthySignals,face,identity:{enrolled:true,matched,checkedAt:time}}},time);};
  for(let time=0;time<=4000;time+=1000)result(time,false);
  assert.equal(mount.dataset.avatarPhase,'rejected');assert.match(statusLine.textContent,/다시 시도/);
  result(5000,true);assert.equal(verified,0);
  result(5500,false);
  assert.equal(mount.dataset.avatarPhase,'searching');assert.match(statusLine.textContent,/얼굴인식 중/);
  result(6000,true);assert.equal(context.state().tracking,true);assert.equal(verified,1);
  assert.equal(mount.dataset.avatarPhase,'success');
  result(8000,true);
  result(8200,false,false);result(9200,true);
  assert.equal(context.state().tracking,true);assert.equal(verified,1);
  result(9400,false,false);result(10900,false,false);
  assert.equal(mount.dataset.avatarPhase,'warning');
  result(11100,true);
  assert.equal(mount.dataset.avatarPhase,'returning');assert.match(statusLine.textContent,/복귀 확인 중/);
  result(13099,true);assert.equal(context.state().tracking,false);assert.equal(verified,1);
  result(13100,true);
  assert.equal(mount.dataset.avatarPhase,'searching');assert.match(statusLine.textContent,/얼굴인식 중/);
  result(13600,true);assert.equal(context.state().tracking,true);assert.equal(verified,2);
  assert.equal(mount.dataset.avatarPhase,'success');
});

test('recognition check completes despite frequent tracking updates', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const mount = avatarMount(), pose = { x: 0, y: 0, roll: 0 };
  paintAvatar(mount, null, false, 'verifying');
  assert.equal(mount.dataset.avatarPhase, 'searching');
  paintAvatar(mount, pose, true, 'tracking', 0, null, true);
  assert.equal(mount.dataset.avatarPhase, 'success');
  context.mock.timers.tick(FACE_SUCCESS_MS);
  assert.equal(mount.dataset.avatarPhase, 'check');
  paintAvatar(mount, pose, true, 'tracking');
  context.mock.timers.tick(699);
  assert.equal(mount.dataset.avatarPhase, 'check');
  context.mock.timers.tick(1);
  assert.equal(mount.dataset.avatarPhase, 'avatar');
});

test('verification tilts the existing aurora ring and grows a second one from it', async () => {
  const source = (await readFile(new URL('../camera-face-effect.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
  let now = 0, frame, path, strokes, gradient;
  const ctx = {
    setTransform() {}, clearRect() { strokes = []; },
    beginPath() { path = []; gradient = null; },
    moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); }, closePath() {},
    createLinearGradient(...coordinates) { gradient = coordinates; return { addColorStop() {} }; },
    stroke() { strokes.push({ path, gradient, alpha: this.globalAlpha }); },
  };
  const canvas = { getContext: () => ctx, clientWidth: 206, clientHeight: 206, isConnected: true };
  const context = vm.createContext({canvas, devicePixelRatio: 1, getComputedStyle: () => ({getPropertyValue: () => '#196b3b'}),
    matchMedia: () => ({matches: false}), performance: {now: () => now},
    requestAnimationFrame: callback => { frame = callback; }, cancelAnimationFrame() { frame = null; },
  });
  const effect = vm.runInContext(`${source}\nstartFaceEffect(canvas);`, context);
  frame(now = 400);
  const scanning = strokes;
  effect.succeed();
  assert.deepEqual(strokes, scanning);
  frame(now = 440);
  assert.equal(strokes.length, 2);
  assert.equal(strokes[0].alpha, 1);
  assert.ok(strokes[1].alpha < .01);
  const splitting = strokes;
  frame(now = 620);
  assert.equal(strokes.length, 2);
  assert.ok(strokes[1].alpha > splitting[1].alpha);
  assert.notDeepEqual(strokes[0].path, splitting[0].path);
  assert.notDeepEqual(strokes[1].path, splitting[1].path);
});

test('losing a face cancels the check and reacquisition plays it again', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const mount = avatarMount(), pose = { x: 0, y: 0, roll: 0 };
  paintAvatar(mount, null, false, 'verifying');
  paintAvatar(mount, pose, true, 'tracking', 0, null, true);
  context.mock.timers.tick(300);
  paintAvatar(mount, null, false, 'behavior-warning');
  context.mock.timers.tick(1000);
  assert.equal(mount.dataset.avatarPhase, 'warning');
  paintAvatar(mount, pose, false, 'verifying');
  assert.equal(mount.dataset.avatarPhase, 'searching');
  paintAvatar(mount, pose, true, 'tracking', 0, null, true);
  assert.equal(mount.dataset.avatarPhase, 'success');
  context.mock.timers.tick(FACE_SUCCESS_MS);
  assert.equal(mount.dataset.avatarPhase, 'check');
  context.mock.timers.tick(700);
  assert.equal(mount.dataset.avatarPhase, 'avatar');
});

for (const gap of [200, 2999, 3000]) test(`face returning within ${gap}ms keeps the avatar without replaying recognition`, context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const mount = avatarMount(), pose = { x: 0, y: 0, roll: 0 };
  paintAvatar(mount, pose, true, 'tracking', 0);
  paintAvatar(mount, null, true, 'scanning', 5000);
  paintAvatar(mount, null, true, 'scanning', 5000 + gap);
  assert.equal(mount.dataset.avatarPhase, 'avatar');
  paintAvatar(mount, pose, true, 'tracking', 5000 + gap);
  assert.equal(mount.dataset.avatarPhase, 'avatar');
});

test('generic scanning without an authentication gate uses the plain spinner', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const mount = avatarMount(), pose = { x: 0, y: 0, roll: 0 };
  paintAvatar(mount, pose, true, 'tracking', 0);
  paintAvatar(mount, null, true, 'scanning', 5000);
  paintAvatar(mount, null, true, 'scanning', 8001);
  assert.equal(mount.dataset.avatarPhase, 'loading');
  paintAvatar(mount, pose, true, 'tracking', 8200);
  assert.equal(mount.dataset.avatarPhase, 'avatar');
});

test('a single missed frame during the grace period does not cancel the check', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const mount = avatarMount(), pose = { x: 0, y: 0, roll: 0 };
  paintAvatar(mount, null, false, 'verifying');
  paintAvatar(mount, pose, true, 'tracking', 0, null, true);
  context.mock.timers.tick(200);
  paintAvatar(mount, null, true, 'scanning');
  assert.equal(mount.dataset.avatarPhase, 'success');
  context.mock.timers.tick(FACE_SUCCESS_MS - 200);
  assert.equal(mount.dataset.avatarPhase, 'check');
  paintAvatar(mount, null, true, 'scanning');
  assert.equal(mount.dataset.avatarPhase, 'check');
});
