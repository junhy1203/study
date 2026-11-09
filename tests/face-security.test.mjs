import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {createFaceService,authorizeFaceStudy,envelopeHash,faceDayEnd,seoulDay} from '../functions/face-service.js';
import {FACE_MODEL,FACE_PREPROCESS,FACE_SCHEMA,FACE_ORIGIN,studyNonce} from '../functions/face-protocol.js';
import {createBrowserFaceKeys} from '../face-storage.js';
import {signFace,encryptFaceSamples as encryptStoredFace,decryptFaceSamples as decryptStoredFace,validateFaceSamples} from '../face-crypto.js';
import {sampleScanProfile,syntheticFace} from './scan-fixtures.mjs';
const encryptFaceSamples=async(samples,keys,binding)=>encryptStoredFace(binding.schemaVersion===5&&Array.isArray(samples)?sampleScanProfile(samples[0]):samples,keys,binding);
const decryptFaceSamples=async(...args)=>{const value=await decryptStoredFace(...args);return value.samples||value;};
import {createIdentityMatcher,createEnrollmentCollector,faceImageQuality,faceFrameGeometry,createLocalFaceGuard,normalized,eyeRegionImage,lightingNormalizedFace,IDENTITY_THRESHOLD} from '../camera-identity.js';
import {checkpointCamera} from '../functions/domain.js';
import {createStudyRevocationCheck} from '../functions/study-auth.js';

function memoryStore(){
  const rows=new Map();let tail=Promise.resolve();
  const snapshot=ref=>({exists:rows.has(ref.path),data:()=>structuredClone(rows.get(ref.path))});
  return {rows,doc:path=>({path,get:async()=>snapshot({path})}),runTransaction:fn=>{
    const result=tail.then(async()=>{const writes=new Map();const value=await fn({get:async ref=>snapshot(ref),set:(ref,data)=>writes.set(ref.path,structuredClone(data))});for(const [key,value]of writes)rows.set(key,value);return value;});tail=result.catch(()=>{});return result;
  }};
}
function testKms(){const key=randomBytes(32);return {
  async seal(value,aad){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));return Buffer.concat([iv,cipher.update(value,'base64'),cipher.final(),cipher.getAuthTag()]).toString('base64');},
  async open(value,aad){const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString('base64');},
};}
const owner=Array.from({length:1024},(_,i)=>i===0?1:0),other=Array.from({length:1024},(_,i)=>i===1?1:0);
const pairedOwner=normalized([...owner,...owner]);
async function harness(){
  const db=memoryStore(),keys=await createBrowserFaceKeys(),installationId=randomUUID(),uid='owner';let now=Date.parse('2026-10-26T10:00:00+09:00');
  const service=createFaceService({db,kms:testKms(),projectId:'demo-study',clock:()=>now});
  let authTime=Math.floor(now/1000),grant,ticket,sealed;
  const call=(action,data={},who=uid)=>service(action,{auth:{uid:who,token:{email_verified:true,auth_time:authTime,firebase:{sign_in_provider:'password'}}},data:{installationId,...data}});
  const sign=(purpose,nonce,k=keys)=>signFace(k,purpose,uid,installationId,nonce);
  async function daily(){const challenge=await call('beginDailyFaceAuth',{publicKey:keys.publicKey});authTime=Math.floor(now/1000);({grant}=await call('completeDailyFaceAuth',{challengeId:challenge.challengeId,signature:await sign('daily',challenge.challengeId)}));return challenge;}
  async function begin(){await daily();({ticket}=await call('beginFaceEnrollment',{idempotencyKey:randomUUID(),signature:await sign('enroll',grant.id)}));return ticket;}
  async function seal(){if(!ticket)await begin();const encrypted=await encryptFaceSamples(Array(12).fill(pairedOwner),keys,ticket.binding);sealed=await call('sealFaceKeyEnvelope',{ticketId:ticket.id,wrappedKey:encrypted.wrappedKey,signature:await sign('seal',`${ticket.id}:${envelopeHash(encrypted.wrappedKey)}`)});return {encrypted,...sealed};}
  async function commit(){if(!sealed)await seal();return call('commitFaceEnrollment',{ticketId:ticket.id,idempotencyKey:ticket.idempotencyKey,envelopeHash:sealed.envelopeHash,signature:await sign('commit',`${ticket.id}:${sealed.envelopeHash}`)});}
  return {db,keys,installationId,uid,call,sign,daily,begin,seal,commit,get ticket(){return ticket;},get grant(){return grant;},get sealed(){return sealed;},get now(){return now;},advance:ms=>{now+=ms;},setAuthTime:value=>{authTime=value;}};
}

test('envelope round trip binds account, browser, profile, versions and ciphertext',async()=>{
  const h=await harness(),{encrypted,envelope}=await h.seal();await h.commit();
  const nonce=await h.call('beginFaceUnlock',{profileId:h.ticket.binding.profileId});
  const request={nonce:nonce.nonce,envelope,signature:await h.sign('unlock',`${nonce.nonce}:${envelopeHash(envelope)}`)};
  const opened=await h.call('unlockFaceKeyEnvelope',request);
  const restored=await decryptFaceSamples(encrypted,h.keys,opened.wrappedKey,h.uid,h.installationId);
  assert.equal(restored[0].length,2048);assert.ok(Math.abs(restored[0][0]-pairedOwner[0])<1e-7);
  await assert.rejects(h.call('unlockFaceKeyEnvelope',request),{code:'permission-denied'});
  await assert.rejects(decryptFaceSamples(encrypted,await createBrowserFaceKeys(),opened.wrappedKey,h.uid,h.installationId));
  for(const field of ['uid','installationId','profileId','generation','modelVersion','preprocessVersion','schemaVersion','appOrigin','projectId']){
    const corrupted={...encrypted,binding:{...encrypted.binding,[field]:`${encrypted.binding[field]}-tampered`}};
    await assert.rejects(decryptFaceSamples(corrupted,h.keys,opened.wrappedKey,h.uid,h.installationId),field);
  }
  await assert.rejects(decryptFaceSamples({...encrypted,ciphertext:(encrypted.ciphertext[0]==='A'?'B':'A')+encrypted.ciphertext.slice(1)},h.keys,opened.wrappedKey,h.uid,h.installationId));
  const stored=JSON.stringify([...h.db.rows.values()]);assert.ok(!stored.includes('samples'));assert.ok(!stored.includes(encrypted.wrappedKey));
});
test('historical profiles cannot unlock or authorize study and registrations have no daily quota',async()=>{
  const h=await harness();await h.commit();
  const state=h.db.rows.get(`faceSecurity/${h.uid}`);state.active.binding.schemaVersion=4;state.active.binding.preprocessVersion='full-aligned-rgb224-light-v3';
  state.registrations=[h.now-1,h.now-2,h.now-3];
  await assert.rejects(h.call('beginFaceUnlock',{profileId:h.ticket.binding.profileId}),/새 영상 3D/);
  const data={controllerId:'controller',tracking:true,faceAuthorization:{installationId:h.installationId,profileId:h.ticket.binding.profileId,generation:h.ticket.binding.generation,grantId:h.grant.id,issuedAt:h.now}};
  data.faceAuthorization.signature=await h.sign('study',studyNonce(data));
  await assert.rejects(h.db.runTransaction(tx=>authorizeFaceStudy(tx,h.db,h.uid,data,null,h.now)),/새 영상 3D/);
  await h.begin();assert.equal(h.ticket.binding.schemaVersion,5);await h.seal();await h.commit();
  await h.begin();assert.equal(h.ticket.binding.schemaVersion,5);
});
test('scan profiles encrypt both descriptors and geometry; historical crypto remains isolated',async()=>{
  const h=await harness();await h.begin();
  const samples=Array(12).fill(normalized([...owner,...owner]));
  const encrypted=await encryptFaceSamples(samples,h.keys,h.ticket.binding);
  const restored=await decryptFaceSamples(encrypted,h.keys,encrypted.wrappedKey,h.uid,h.installationId);
  assert.equal(restored[0].length,2048);
  assert.ok(Math.abs(restored[0][0]-samples[0][0])<1e-7);
  const twenty=await encryptFaceSamples(Array(20).fill(pairedOwner),h.keys,h.ticket.binding);
  assert.equal((await decryptFaceSamples(twenty,h.keys,twenty.wrappedKey,h.uid,h.installationId)).length,18);
  const binding={...h.ticket.binding,preprocessVersion:'eyes-aligned-rgb224-v1',schemaVersion:2};
  const legacy=await encryptFaceSamples(Array(12).fill(owner),h.keys,binding);
  assert.deepEqual(await decryptFaceSamples(legacy,h.keys,legacy.wrappedKey,h.uid,h.installationId),Array(12).fill(owner));
  const v3Binding={...h.ticket.binding,preprocessVersion:'eyes-aligned-rgb224-periocular-v2',schemaVersion:3};
  const v3=await encryptFaceSamples(samples,h.keys,v3Binding);
  assert.equal((await decryptFaceSamples(v3,h.keys,v3.wrappedKey,h.uid,h.installationId))[0].length,2048);
  await assert.rejects(encryptFaceSamples(Array(12).fill(owner),h.keys,h.ticket.binding),/두 전체 얼굴/);
  await assert.rejects(encryptFaceSamples(samples,h.keys,binding));
  assert.throws(()=>validateFaceSamples([owner,...samples.slice(1)]));
  assert.throws(()=>validateFaceSamples(Array(12).fill([...owner,...Array(1024).fill(0)])));
});

test('legacy eye descriptors cannot authenticate a different whole face',()=>{
  const combined=(full,eyes)=>normalized([...full,...eyes]);
  const matcher=createIdentityMatcher(Array(12).fill(combined(owner,owner)));
  for(let i=0;i<5;i++)matcher.observe(combined(other,owner));
  const masked=matcher.observe(combined(other,owner));
  assert.equal(masked.matched,false);assert.equal(masked.score,0);
  for(let i=0;i<5;i++)matcher.observe(combined(owner,other));
  assert.equal(matcher.observe(combined(owner,other)).matched,true);
  assert.equal(matcher.observe(owner).matched,true,'legacy eye profiles use their original full-face features');
  const legacy=createIdentityMatcher(Array(12).fill(owner));
  for(let i=0;i<5;i++)legacy.observe(combined(owner,other));
  assert.equal(legacy.observe(combined(owner,other)).matched,true);
});

const withCosine=score=>{const value=Array(1024).fill(0);value[0]=score;value[1]=Math.sqrt(1-score*score);return value;};
test('lighting view tolerates exposure changes but cannot rescue an unrelated full face',()=>{
  const matcher=createIdentityMatcher(Array(12).fill(pairedOwner),{dualFull:true});
  const changed=normalized([...withCosine(.76),...withCosine(.92)]);
  for(let i=0;i<5;i++)matcher.observe(changed);
  assert.equal(matcher.observe(changed).matched,true);
  assert.equal(matcher.observe(normalized([...withCosine(.55),...owner])).matched,false);
  assert.equal(matcher.observe(owner).matched,false,'new profiles require both complete views');
  assert.equal(matcher.observe(changed).threshold,IDENTITY_THRESHOLD);
});

test('high background similarity and isolated matches across poses do not pass',()=>{
  const matcher=createIdentityMatcher(Array(12).fill(owner));
  for(let i=0;i<8;i++)assert.equal(matcher.observe(withCosine(.76)).matched,false);
  const isolated=Array(12).fill(other);isolated[0]=isolated[4]=isolated[6]=owner;
  const scattered=createIdentityMatcher(isolated);
  for(let i=0;i<8;i++)assert.equal(scattered.observe(owner).matched,false);
});

test('a genuine side pose needs its own pair, not matching frontal samples',()=>{
  const templates=[...Array(4).fill(owner),...Array(2).fill(other),...Array(6).fill(owner)];
  const matcher=createIdentityMatcher(templates);
  for(let i=0;i<5;i++)matcher.observe(other);
  assert.equal(matcher.observe(other).matched,true);
  assert.deepEqual(matcher.samples,templates,'verification never changes the enrollment');
});

test('whole-face lighting normalization preserves features across exposure and contrast changes',()=>{
  const image=smoothFaceImage(),changed={...image,data:new Uint8ClampedArray(image.data)};
  for(let i=0;i<changed.data.length;i+=4)for(let c=0;c<3;c++)changed.data[i+c]=image.data[i+c]*.75+30;
  const first=lightingNormalizedFace(image),second=lightingNormalizedFace(changed);
  let error=0;
  for(let i=0;i<first.data.length;i+=4){error+=Math.abs(first.data[i]-second.data[i]);assert.equal(first.data[i],first.data[i+1]);}
  assert.ok(error/(224*224)<4,'normalization removes moderate exposure/contrast differences');
  assert.notEqual(first.data[(150*224+112)*4],first.data[(130*224+112)*4],'lower face remains visible');
  assert.deepEqual(image,smoothFaceImage(),'raw input is not modified');
});

test('eye input excludes masks and hair while retaining both aligned eyes',()=>{
  const image=smoothFaceImage(),eyes=eyeRegionImage(image),at=(input,x,y)=>input.data[(y*224+x)*4];
  for(const [x,y] of [[80,85],[144,85]])assert.equal(at(eyes,x,y),at(image,x,y));
  for(const [x,y] of [[80,20],[112,150],[10,85]])assert.equal(at(eyes,x,y),128);
  assert.notEqual(at(image,112,150),128,'source pixels remain intact');
  assert.equal(faceImageQuality(eyes),null);
  const dark={...image,data:new Uint8ClampedArray(image.data)};
  for(let y=48;y<122;y++)for(let x=32;x<192;x++)for(let c=0;c<3;c++)dark.data[(y*224+x)*4+c]=10;
  assert.match(faceImageQuality(dark,{eyesOnly:true}),/밝게/);
  const mask={...image,data:new Uint8ClampedArray(image.data)};
  for(let y=122;y<224;y++)for(let x=0;x<224;x++)for(let c=0;c<3;c++)mask.data[(y*224+x)*4+c]=245;
  assert.equal(faceImageQuality(mask,{eyesOnly:true}),null);
});

test('browser keys stay nonextractable after structured cloning and use AES-KW',async()=>{
  const keys=structuredClone(await createBrowserFaceKeys());
  await assert.rejects(crypto.subtle.exportKey('raw',keys.wrappingKey));
  await assert.rejects(crypto.subtle.exportKey('jwk',keys.signingKey));
  assert.equal(keys.wrappingKey.algorithm.name,'AES-KW');
  assert.ok(await signFace(keys,'daily','u',randomUUID(),randomUUID()));
});
test('refresh-only, old, future, previous-day and pre-challenge auth_time fail',async()=>{
  for(const offset of [-301000,2000,-3600000]){const h=await harness(),challenge=await h.call('beginDailyFaceAuth',{publicKey:h.keys.publicKey});h.setAuthTime(Math.floor((h.now+offset)/1000));await assert.rejects(h.call('completeDailyFaceAuth',{challengeId:challenge.challengeId,signature:await h.sign('daily',challenge.challengeId)}),{code:'failed-precondition'});}
  const h=await harness(),challenge=await h.call('beginDailyFaceAuth',{publicKey:h.keys.publicKey});h.advance(10000);h.setAuthTime(Math.floor((h.now-20000)/1000));await assert.rejects(h.call('completeDailyFaceAuth',{challengeId:challenge.challengeId,signature:await h.sign('daily',challenge.challengeId)}));
});
test('daily challenge is one-use and requires the pinned browser key',async()=>{
  const h=await harness(),challenge=await h.call('beginDailyFaceAuth',{publicKey:h.keys.publicKey});
  await assert.rejects(h.call('completeDailyFaceAuth',{challengeId:challenge.challengeId,signature:await h.sign('daily',challenge.challengeId,await createBrowserFaceKeys())}),{code:'permission-denied'});
  const data={challengeId:challenge.challengeId,signature:await h.sign('daily',challenge.challengeId)};await h.call('completeDailyFaceAuth',data);await assert.rejects(h.call('completeDailyFaceAuth',data));
});
test('cross-account, cross-installation, wrong hash and expired unlock are rejected',async()=>{
  const h=await harness();await h.commit();const nonce=await h.call('beginFaceUnlock',{profileId:h.ticket.binding.profileId});
  const data={nonce:nonce.nonce,envelope:h.sealed.envelope,signature:await h.sign('unlock',`${nonce.nonce}:${h.sealed.envelopeHash}`)};
  await assert.rejects(h.call('unlockFaceKeyEnvelope',data,'another-user'));
  await assert.rejects(h.call('unlockFaceKeyEnvelope',{...data,installationId:randomUUID()}));
  await assert.rejects(h.call('unlockFaceKeyEnvelope',{...data,envelope:'bad'}));
  h.advance(60001);await assert.rejects(h.call('unlockFaceKeyEnvelope',data));
});
test('concurrent commits consume one ticket; response-loss retry returns same generation',async()=>{
  const h=await harness();await h.seal();const results=await Promise.all([h.commit(),h.commit()]);assert.equal(results[0].active.profileId,results[1].active.profileId);
  const state=h.db.rows.get(`faceSecurity/${h.uid}`);assert.equal(state.registrations.length,1);assert.equal(state.audit.length,1);assert.equal(state.generation,1);
  const again=await h.commit();assert.equal(again.active.generation,1);
});
test('more than three replacements per day succeed while failed and cancelled replacement preserves the active profile',async()=>{
  const h=await harness();await h.commit();const original=h.ticket.binding.profileId;
  for(let i=0;i<5;i++){await h.begin();await h.seal();await h.commit();}
  const active=h.db.rows.get(`faceSecurity/${h.uid}`).active;assert.notEqual(active.profileId,original);
  assert.equal(h.db.rows.get(`faceSecurity/${h.uid}`).registrations.length,6);
  await h.begin();await h.seal();
  await assert.rejects(h.call('commitFaceEnrollment',{ticketId:h.ticket.id,idempotencyKey:h.ticket.idempotencyKey,envelopeHash:h.sealed.envelopeHash,signature:'invalid'}),{code:'permission-denied'});
  await h.call('cancelFaceEnrollment',{ticketId:h.ticket.id,signature:await h.sign('cancel',h.ticket.id)});
  assert.equal(h.db.rows.get(`faceSecurity/${h.uid}`).active.profileId,active.profileId);
});
test('study authorization binds signature to sequence, tracking and active generation',async()=>{
  const h=await harness();const committed=await h.commit();
  const data={controllerId:randomUUID(),sessionId:randomUUID(),sequence:1,tracking:true,faceAuthorization:{installationId:h.installationId,profileId:committed.active.profileId,generation:1,grantId:committed.grant.id,issuedAt:h.now}};
  data.faceAuthorization.signature=await h.sign('study',studyNonce(data));
  const authorized=await h.db.runTransaction(tx=>authorizeFaceStudy(tx,h.db,h.uid,data,null,h.now));assert.equal(authorized.faceLeaseUntilMs,h.now+60000);
  for(const modified of [{...data,sequence:2},{...data,tracking:false},{...data,faceAuthorization:{...data.faceAuthorization,generation:2}}])await assert.rejects(h.db.runTransaction(tx=>authorizeFaceStudy(tx,h.db,h.uid,modified,null,h.now)));
  h.setAuthTime(Math.floor(h.now/1000)-86400);await h.call('revokeFaceEnrollment');await assert.rejects(h.db.runTransaction(tx=>authorizeFaceStudy(tx,h.db,h.uid,data,null,h.now)));
});
test('server Seoul date and midnight clip credit even after delayed sync and finalization',()=>{
  const midnight=Date.parse('2026-10-27T00:00:00+09:00');assert.equal(faceDayEnd(midnight-1),midnight);assert.equal(seoulDay(midnight),'2026-10-27');
  const session={startedAtMs:midnight-20000,activeSinceMs:midnight-5000,leaseUntilMs:midnight+20000,faceAuthUntilMs:midnight,faceLeaseUntilMs:midnight+60000};
  for(const now of [midnight,midnight+60000,midnight+86400000]){const result=checkpointCamera(session,now,true);assert.equal(result.accumulatedSeconds,5);assert.equal(result.activeSinceMs,null);assert.equal(result.canResume,false);}
});
test('collector automatically collects four distinct angles per direction and completes on the last downward frame',()=>{
  const collector=createEnrollmentCollector();let time=0,result;
  assert.equal(collector.confirm(),false);
  const groups=[Array.from({length:4},(_,i)=>({yaw:0,pitch:i*.04})),Array.from({length:4},(_,i)=>({yaw:.10+i*.06,pitch:0})),Array.from({length:4},(_,i)=>({yaw:-.10-i*.06,pitch:0})),Array.from({length:4},(_,i)=>({yaw:0,pitch:-.10-i*.06})),Array.from({length:4},(_,i)=>({yaw:0,pitch:.10+i*.06}))];
  for(const [index,poses] of groups.entries()){
    for(const pose of poses){result=collector.observe(owner,{time:time+=700,pose});assert.equal(collector.observe(owner,{time:time+=700,pose}).progress,result.progress);}
    assert.equal(result.progress,(index+1)*4);
  }
  assert.equal(result.progress,20);assert.equal(result.complete,true);
  assert.deepEqual(result.counts,[4,4,4,4,4]);
});

test('enrollment preserves collected samples when a later descriptor changes',()=>{
  const collector=createEnrollmentCollector();let result;
  collector.confirm();
  for(let i=0;i<4;i++)result=collector.observe(owner,{time:i*700,pose:{yaw:i*.04,pitch:0}});
  assert.equal(result.progress,4);
  result=collector.observe(other,{time:3500,pose:{yaw:.2,pitch:0}});
  assert.equal(result.progress,5);assert.equal(result.counts[0],4);assert.equal(result.counts[1],1);
  assert.equal(result.reset,undefined);assert.deepEqual(result.samples[0],owner);assert.deepEqual(result.samples[4],other);
});

test('automatic face framing aligns translated, resized and tilted faces without asking for a fixed outline',()=>{
  const makeFace=(cx,cy,size,angle)=>{
    const face=Array.from({length:478},()=>({x:cx/1280,y:cy/720}));
    const point=(x,y)=>({x:(cx+size*(x*Math.cos(angle)-y*Math.sin(angle)))/1280,y:(cy+size*(x*Math.sin(angle)+y*Math.cos(angle)))/720});
    for(const i of [33,133])face[i]=point(-.5,0);
    for(const i of [362,263])face[i]=point(.5,0);
    face[1]=point(0,.48);face[10]=point(0,-.8);face[152]=point(0,1.3);face[234]=point(-1,.4);face[454]=point(1,.4);
    return face;
  };
  for(const [x,y,size,angle]of [[640,240,130,0],[340,200,65,.2],[850,250,150,-.2]]){
    const face=makeFace(x,y,size,angle),framing=faceFrameGeometry(face,1280,720);assert.ok(framing);
    const [a,b,c,d,e,f]=framing.transform;
    assert.ok(Math.abs(a*x+c*y+e-112)<1e-8);assert.ok(Math.abs(b*x+d*y+f-85)<1e-8);
  }
  assert.equal(faceFrameGeometry(makeFace(640,240,10,0),1280,720),null);
  assert.equal(faceFrameGeometry(makeFace(15,200,100,0),1280,720),null);
});

function smoothFaceImage(){
  const data=new Uint8ClampedArray(224*224*4);
  const spot=(x,y,cx,cy,sx,sy)=>Math.exp(-.5*((x-cx)**2/sx**2+(y-cy)**2/sy**2));
  for(let y=0;y<224;y++)for(let x=0;x<224;x++){
    const value=135-45*spot(x,y,76,85,12,5)-45*spot(x,y,148,85,12,5)-28*spot(x,y,112,150,25,6)+15*spot(x,y,112,119,10,17),index=(y*224+x)*4;
    data[index]=data[index+1]=data[index+2]=value;data[index+3]=255;
  }
  return {data,width:224,height:224};
}

test('soft webcam texture can pass quality while blank, dark and overexposed frames are held',()=>{
  assert.equal(faceImageQuality(smoothFaceImage()),null);
  const solid=value=>({data:new Uint8ClampedArray(224*224*4).fill(value),width:224,height:224});
  assert.match(faceImageQuality(solid(128)),/윤곽/);
  assert.match(faceImageQuality(solid(20)),/밝게/);
  assert.match(faceImageQuality(solid(245)),/강한 빛/);
});

for(const schemaVersion of [5])test(`soft webcam frames collect 3D scan references with server schema ${schemaVersion}`,async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'OffscreenCanvas'),events=[],image=smoothFaceImage();
  const previousImageData=Object.getOwnPropertyDescriptor(globalThis,'ImageData');
  globalThis.ImageData=class {constructor(data,width,height){Object.assign(this,{data,width,height});}};
  const context={setTransform(){},fillRect(){},drawImage(){},getImageData:()=>image};
  globalThis.OffscreenCanvas=class{getContext(){return context;}};
  let guard,descriptions=0;
  try{
    const input={toFloat(){return this;},expandDims(){return this;},dispose(){}};
    const tf={loadGraphModel:async()=>({execute:()=>{descriptions++;return {data:async()=>owner,dispose(){}};},dispose(){}}),tidy:fn=>fn(),browser:{fromPixels:pixels=>{assert.ok(pixels instanceof ImageData);return input;}}};
    guard=await createLocalFaceGuard(tf,{uid:'owner',ticket:{id:'enrollment-test',binding:{schemaVersion}}},()=>{throw Error('No server call should be made before all directions are collected');},event=>events.push(event));
    guard.confirmCapture();
    const face=syntheticFace();
    let state;
    for(let time=0;time<=4500;time+=500){face[1].x=.5+Math.min(3,Math.floor(time/1000))*.04*.125;state=await guard.check({width:640,height:480},{faceLandmarks:[face]},time);}
    assert.ok(state.progress>=2);assert.equal(state.enrolled,false);
    assert.equal(descriptions,schemaVersion>=3?10:5);
    assert.equal(events.filter(event=>event.type==='face-progress').at(-1).direction,'circle');
    assert.ok(!events.some(event=>event.label?.includes('가리는 물체')));
  }finally{
    guard?.close();if(previous)Object.defineProperty(globalThis,'OffscreenCanvas',previous);else delete globalThis.OffscreenCanvas;
    if(previousImageData)Object.defineProperty(globalThis,'ImageData',previousImageData);else delete globalThis.ImageData;
  }
});

test('isolated enrollment keeps tracking without queuing samples and discards samples after face loss',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'OffscreenCanvas'),events=[],image=smoothFaceImage(),jobs=[];
  globalThis.OffscreenCanvas=class{getContext(){return {setTransform(){},fillRect(){},drawImage(){},getImageData:()=>image};}};
  let guard,closed=false;
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  try{
    guard=await createLocalFaceGuard({loadGraphModel(){throw Error('Must use isolated model');}},
      {uid:'owner',ticket:{binding:{schemaVersion:5}}},()=>{throw Error('No incomplete profile may be saved');},event=>events.push(event),
      {describerFactory:async()=>({describe:frame=>new Promise((resolve,reject)=>jobs.push({frame,resolve,reject})),close(){closed=true;}})});
    const source={width:640,height:480},result={faceLandmarks:[syntheticFace()]};
    const initial=await guard.check(source,result,0);
    assert.equal(initial.matched,false);assert.equal(initial.enrolled,false);assert.equal(jobs.length,1);
    for(const time of [400,800,1200])await guard.check(source,result,time);
    assert.equal(jobs.length,1,'no backlog while descriptor is pending');
    assert.equal(events.filter(e=>e.type==='face-scan-direction').length,4,'live directions do not await descriptors');
    jobs[0].resolve(owner);await settle();
    assert.equal(jobs.length,2,'lighting-normalized descriptor is still required');
    assert.deepEqual(jobs[0].frame,image);
    assert.deepEqual(jobs[1].frame,lightingNormalizedFace(image));
    await guard.check(source,{faceLandmarks:[]},1600);
    jobs[1].resolve(owner);await settle();
    assert.equal(events.filter(e=>e.type==='face-progress').at(-1).state,'QUALITY_HOLD');
    await guard.check(source,result,2000);
    jobs[2].resolve(owner);await settle();jobs[3].resolve(owner);await settle();
    assert.equal(events.filter(e=>e.type==='face-progress').at(-1).progress,1);
    await guard.check(source,result,2800);
    await guard.check(source,{faceLandmarks:[syntheticFace(),syntheticFace()]},3200);
    jobs[4].resolve(owner);await settle();jobs[5].resolve(owner);await settle();
    assert.equal(events.filter(e=>e.type==='face-progress').at(-1).state,'QUALITY_HOLD');
    await guard.check(source,result,4000);jobs[6].reject(Error('descriptor failed'));await settle();
    await assert.rejects(guard.check(source,result,4400),/descriptor failed/);
  }finally{guard?.close();if(previous)Object.defineProperty(globalThis,'OffscreenCanvas',previous);else delete globalThis.OffscreenCanvas;}
  assert.equal(closed,true);
});

test('multi-face matching selects the owner regardless of order and counts each frame once',()=>{
  const matcher=createIdentityMatcher(Array(12).fill(owner));
  for(let i=0;i<8;i++)assert.equal(matcher.observeFaces([other,owner],{vote:false}).matched,false);
  for(let i=0;i<4;i++)assert.equal(matcher.observeFaces([other,owner,other]).matched,false);
  const matched=matcher.observeFaces([owner,other]);
  assert.equal(matched.matched,true);assert.equal(matched.faceIndex,0);
  const reordered=matcher.observeFaces([other,owner]);
  assert.equal(reordered.matched,true);assert.equal(reordered.faceIndex,1);
  assert.equal(matcher.observeFaces([other,other]).matched,false);
  assert.equal(matcher.observeFaces([null,owner]).faceIndex,1);
  matcher.observeFaces([]);
  assert.equal(matcher.observeFaces([other,owner]).matched,false);
  assert.deepEqual(matcher.samples,Array(12).fill(owner));
});

test('quality, multi-face and repeated-frame holds cannot add enrollment samples',()=>{
  const c=createEnrollmentCollector();c.confirm();for(let time=0;time<2000;time+=500)c.observe(owner,{time,direction:'front'});
  const before=c.observe(owner,{time:2000,direction:'front'}).progress;
  assert.equal(c.observe(owner,{time:2000,direction:'front'}).progress,before);
  assert.equal(c.observe(owner,{time:2500,direction:'front',quality:false}).progress,before);
  assert.equal(c.observe(owner,{time:3000,direction:'front',multiple:true}).progress,0);
  assert.match(faceImageQuality({data:new Uint8ClampedArray(224*224*4),width:224,height:224}),/밝게/);
});
test('matcher never auto-enrolls, requires 4/5 votes, rejects one lucky maximum and keeps templates',()=>{
  assert.equal(createIdentityMatcher().observe(owner).matched,false);
  const matcher=createIdentityMatcher(Array(12).fill(owner));for(let i=0;i<4;i++)assert.equal(matcher.observe(owner).matched,false);assert.equal(matcher.observe(owner).matched,true);
  assert.equal(matcher.observe(other).matched,false);assert.deepEqual(matcher.samples,Array(12).fill(owner));
  matcher.reset();assert.equal(matcher.observe(owner).matched,false);
  const mixed=createIdentityMatcher([owner,...Array(11).fill(other)]);for(let i=0;i<8;i++)assert.equal(mixed.observe(owner).matched,false);
});
test('missing KMS cannot silently select a local encryption fallback',async()=>{
  const db=memoryStore(),service=createFaceService({db,kms:testKms(),configured:()=>false,projectId:'demo'});
  const request={auth:{uid:'a',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}},data:{installationId:randomUUID()}};
  assert.equal((await service('getFaceEnrollmentStatus',request)).enabled,false);await assert.rejects(service('beginDailyFaceAuth',request),{code:'failed-precondition'});
});
test('cancelled candidates keep the previous generation and are unusable afterwards',async()=>{
  const h=await harness();await h.commit();const original=h.db.rows.get(`faceSecurity/${h.uid}`).active;
  const ticket=await h.begin();
  await h.call('cancelFaceEnrollment',{ticketId:ticket.id,signature:await h.sign('cancel',ticket.id)});
  assert.deepEqual(h.db.rows.get(`faceSecurity/${h.uid}`).active,original);
  await assert.rejects(h.seal(),{code:'failed-precondition'});
});
test('lost local keys allow recent-auth enrollment recovery but cannot unlock the old generation',async()=>{
  const h=await harness();await h.commit();const replacement=await createBrowserFaceKeys();
  const challenge=await h.call('beginDailyFaceAuth',{publicKey:replacement.publicKey,enrollmentOnly:true});
  const signature=await h.sign('daily',challenge.challengeId,replacement);
  const {grant}=await h.call('completeDailyFaceAuth',{challengeId:challenge.challengeId,signature});assert.equal(grant.generation,0);
  await assert.rejects(h.call('beginFaceUnlock',{profileId:h.ticket.binding.profileId}));
  const pending=await h.call('beginFaceEnrollment',{idempotencyKey:randomUUID(),signature:await h.sign('enroll',grant.id,replacement)});assert.equal(pending.ticket.binding.generation,2);
});
test('failed signature attempts count against the UID rate limit',async()=>{
  const h=await harness(),challenge=await h.call('beginDailyFaceAuth',{publicKey:h.keys.publicKey});
  for(let i=0;i<59;i++)await assert.rejects(h.call('completeDailyFaceAuth',{challengeId:challenge.challengeId,signature:'invalid'}),{code:'permission-denied'});
  await assert.rejects(h.call('completeDailyFaceAuth',{challengeId:challenge.challengeId,signature:await h.sign('daily',challenge.challengeId)}),{code:'resource-exhausted'});
});
test('disabled and reset accounts lose future study leases within the revocation cache bound',async()=>{
  let now=100000,disabled=false,validSince=0,lookups=0;
  const check=createStudyRevocationCheck({clock:()=>now,lookup:async()=>{lookups++;return {disabled,tokensValidAfterTime:new Date(validSince).toISOString()};}});
  const request={auth:{uid:'owner',token:{auth_time:100}}};
  await check(request);disabled=true;now+=44000;await check(request);assert.equal(lookups,1);
  now+=1000;await assert.rejects(check(request),{code:'unauthenticated'});
  disabled=false;validSince=200000;now+=45000;await assert.rejects(check(request),{code:'unauthenticated'});
});
