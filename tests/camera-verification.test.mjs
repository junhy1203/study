import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createVerificationPolicy,VERIFICATION_LIMITS} from '../camera-verification.js';
import {createFocusTracker} from '../camera-focus.js';
import {createOwnerFaceTrack} from '../camera-identity.js';
import {phoneCandidateEvidence,createPhoneTracker,FULL_FRAME} from '../camera-phone.js';
import {privateBadgeAwards,accountBadges,provisionPrivateBadges} from '../functions/account-badges.js';
const owner={reliable:true,face:true,studyActivity:true,identity:{enrolled:true,matched:true}},wrong={...owner,identity:{enrolled:true,matched:false,status:'mismatch'}};

test('a visible replacement immediately blocks credit and rejects a cached match',()=>{
  const t=createFocusTracker();
  assert.equal(t.update({...owner,identity:{...owner.identity,checkedAt:0}},0).tracking,true);
  const lost=t.update({...wrong,identity:{...wrong.identity,ownerLost:true}},500);
  assert.equal(lost.tracking,false);
  assert.equal(lost.verification.resetRequested,true);
  assert.equal(t.update({...owner,identity:{...owner.identity,checkedAt:0}},1000).tracking,false);
  assert.equal(t.update({...owner,identity:{...owner.identity,checkedAt:1500}},1500).tracking,true);
});

test('face loss requires return authentication at exactly 1500ms even with head and shoulders visible',()=>{
  for(const returned of [false,true]){
    const tracker=createFocusTracker();
    for(let now=0;now<=2000;now+=500)tracker.update({...owner,identity:{...owner.identity,checkedAt:0}},now);
    const missing={...owner,face:false,head:true,body:true,identity:{...owner.identity,checkedAt:0}};
    assert.equal(tracker.update(missing,2100).tracking,true);
    assert.equal(tracker.update(missing,3599).verification.required,false);
    const result=tracker.update(returned?{...missing,face:true}:missing,3600);
    assert.equal(result.tracking,false);assert.equal(result.reason,'away');
    assert.equal(result.verification.phase,returned?'returning':'waiting');
    assert.equal(result.verification.resetRequested,false);
    const firstReturn=returned?3600:3700;
    const matchAt=time=>({...owner,identity:{...owner.identity,checkedAt:time}});
    if(!returned)assert.equal(tracker.update(owner,firstReturn).verification.phase,'returning');
    assert.equal(tracker.update(matchAt(firstReturn+1999),firstReturn+1999).verification.returnRemainingMs,1);
    const scanning=tracker.update(matchAt(firstReturn+1999),firstReturn+2000);
    assert.equal(scanning.verification.phase,'scanning');assert.equal(scanning.verification.resetRequested,true);
    assert.equal(scanning.tracking,false);
    assert.equal(tracker.update(matchAt(firstReturn+1999),firstReturn+2200).tracking,false);
    const verified=tracker.update(matchAt(firstReturn+2500),firstReturn+2500);
    assert.equal(verified.verification.required,false);assert.equal(verified.tracking,true);
  }
});

test('face returning just before 1500ms preserves authentication',()=>{
  const tracker=createFocusTracker();for(let now=0;now<=2000;now+=500)tracker.update(owner,now);
  tracker.update({...owner,face:false,head:true},2100);
  const result=tracker.update(owner,3599);
  assert.equal(result.tracking,true);assert.equal(result.verification.required,false);
});

test('a continuously visible lowered head keeps authorization but earns no credit until a fresh face match',()=>{
  const lowered={...owner,head:true,body:true,headDown:true,headPosition:[.5,.4],identity:{...owner.identity,checkedAt:0}};
  const hidden={...lowered,face:false,headPosition:[.5,.49]};
  const tracker=createFocusTracker();
  assert.equal(tracker.update(lowered,0).tracking,true);
  tracker.update(hidden,500);
  const held=tracker.update(hidden,2000);
  assert.equal(held.verification.poseHeld,true);assert.equal(held.verification.required,false);assert.equal(held.tracking,false);
  assert.equal(tracker.update(lowered,2500).tracking,false,'cached face match cannot resume');
  const returned=tracker.update({...lowered,identity:{...owner.identity,checkedAt:2900}},3000);
  assert.equal(returned.verification.poseHeld,false);assert.equal(returned.verification.required,false);
  assert.equal(tracker.update(lowered,5000).tracking,true);
});

test('lowered-head hold ends on departure or expiry and never accepts a replacement',()=>{
  const lowered={...owner,head:true,body:true,headDown:true,headPosition:[.5,.4],identity:{...owner.identity,checkedAt:0}};
  const hidden={...lowered,face:false};
  for(const [time,signals,reason]of [[2100,{...hidden,head:false},'away'],
    [2100,{...lowered,identity:{...wrong.identity,ownerLost:true}},'replacement'],
    [VERIFICATION_LIMITS.loweredHold,hidden,'away']]){
    const policy=createVerificationPolicy();policy.update(lowered,0);policy.update(hidden,500);
    assert.equal(policy.update(hidden,2000).poseHeld,true);
    const result=policy.update(signals,time);
    assert.equal(result.poseHeld,false);assert.equal(result.required,true);assert.equal(result.reason,reason);
  }
});

test('the guard follows the owner while another face enters, then checks the last face before keeping authorization',async()=>{
  const source=await readFile(new URL('../camera-identity.js',import.meta.url),'utf8');
  let descriptions=0,comparisons=0,accept=true;
  const context=vm.createContext({
    createFaceVault:()=>({load:async()=>({}),close(){}}),
    createOwnerFaceTrack,
    VERIFICATION_LIMITS,
    createScanIdentityMatcher:()=>({enrolled:true,reset(){},observeCandidates(){comparisons++;return {matched:accept,accepted:accept,faceIndex:0};}}),
    MODEL:'test',normalized:value=>value,faceFrameGeometry:()=>({transform:[1,0,0,1,0,0]}),
    estimatedFaceShape:()=>[1],faceImageQuality:()=>null,lightingNormalizedFace:image=>image,enrollmentPose:()=>({}),
    OffscreenCanvas:class{getContext(){return {setTransform(){},fillRect(){},drawImage(){},getImageData:()=>({})};}},
  });
  vm.runInContext(source.slice(source.indexOf('export async function createLocalFaceGuard')).replace('export async function','async function'),context);
  const guard=await context.createLocalFaceGuard({}, {uid:'test',record:{binding:{schemaVersion:5}}},()=>{},()=>{},
    {describerFactory:async()=>({describe:async()=>{descriptions++;return [1];},close(){}})});
  const face=(x,yaw=0)=>{
    const points=Array(478).fill({x,y:.5});
    const dx=.06*Math.cos(yaw),dz=.06*Math.sin(yaw);
    points[33]={x:x-dx,y:.5,z:-dz};points[263]={x:x+dx,y:.5,z:dz};return points;
  };
  const frame={width:640,height:480},result={faceLandmarks:[face(.32)]};
  try{
    assert.equal((await guard.check(frame,result,0)).matched,true);
    assert.equal(descriptions,2);assert.equal(comparisons,1);
    for(const [time,faces,index]of [[400,{faceLandmarks:[face(.32,Math.PI/2.5)]},0],[800,{faceLandmarks:[]},undefined],[1000,result,0],[1400,{faceLandmarks:[face(.72),face(.34)]},1]]){
      const state=await guard.check(frame,faces,time);
      assert.equal(state.matched,true);assert.equal(state.checkedAt,0);assert.equal(state.faceIndex,index);
    }
    assert.equal(descriptions,2);assert.equal(comparisons,1);
    const stays=await guard.check(frame,{faceLandmarks:[face(.35)]},1800);
    assert.equal(stays.matched,true);assert.equal(descriptions,4);
    await guard.check(frame,{faceLandmarks:[face(.72),face(.36)]},2200);
    accept=false;
    const lost=await guard.check(frame,{faceLandmarks:[face(.42)]},2600);
    assert.equal(lost.matched,false);assert.equal(lost.ownerLost,true);assert.equal(descriptions,6);
    guard.resetVerification();
    accept=true;
    assert.equal((await guard.check(frame,result,3000)).checkedAt,3000);
    assert.equal(descriptions,8);assert.equal(comparisons,4);
    const lowered=face(.32);
    lowered[33].y=lowered[263].y=.66;
    lowered[10]={x:.32,y:.58,z:-.08};lowered[152]={x:.32,y:.73,z:.08};
    const loweredResult={faceLandmarks:[lowered]};
    assert.equal((await guard.check(frame,loweredResult,3400)).checkedAt,3000);
    assert.equal(descriptions,8,'a vertical head tilt does not trigger comparison');
    await guard.check(frame,{faceLandmarks:[]},3800);
    const partial=lowered.slice(0,470);
    const pending=await guard.check(frame,{faceLandmarks:[partial]},5400);
    assert.equal(pending.matched,false);assert.equal(pending.ownerLost,undefined);
    assert.equal((await guard.check(frame,result,5800)).checkedAt,5800);
    assert.equal(descriptions,10,'face recovery after a longer gap requires fresh comparison');
  }finally{guard.close();}
});
test('enrollment time does not consume the first authentication attempt or show a premature failure',()=>{
  const p=createVerificationPolicy(),enrolling={...wrong,identity:{enrolled:false,status:'enrolling'}};
  for(let now=0;now<=20000;now+=1000)assert.equal(p.update(enrolling,now).phase,'scanning');
  assert.equal(p.update(wrong,21000).phase,'scanning');assert.equal(p.update(wrong,24999).phase,'scanning');
  assert.equal(p.update(wrong,25000).phase,'failed');
});
test('occupied sessions keep running across pose-related identity misses for multiple windows',()=>{
  const policy=createVerificationPolicy();policy.update(owner,0);
  for(let now=1000;now<=270000;now+=1000)assert.equal(policy.update({...wrong,head:true},now).required,false);
});

test('initial verification failure stays failed for exactly 1.5 seconds',()=>{
  const p=createVerificationPolicy();assert.equal(p.update(wrong,0).required,true);
  assert.equal(p.update(wrong,4000).phase,'failed');assert.equal(p.update(owner,5499).phase,'failed');
  assert.equal(p.update(wrong,5500).phase,'scanning');assert.equal(p.update(owner,6000).required,false);
});
test('away return requires a fresh match and cached pre-pause recognition cannot unlock',()=>{
  const p=createVerificationPolicy();p.update({...owner,identity:{...owner.identity,checkedAt:0}},0);
  const away={...wrong,face:false};for(let t=1000;t<=6000;t+=1000)p.update(away,t);
  const cached={...owner,identity:{...owner.identity,checkedAt:500}};
  assert.equal(p.update(cached,7000).phase,'returning');
  assert.equal(p.update(cached,9000).phase,'scanning');
  assert.equal(p.update(cached,9500).required,true);
  assert.equal(p.update({...owner,identity:{...owner.identity,checkedAt:10000}},10000).required,false);
});
test('long unobserved intervals and duplicate timestamps do not earn owner seconds',()=>{
  const p=createVerificationPolicy();p.update(owner,0);p.update(owner,0);assert.equal(p.update(owner,10000).recognizedSeconds,0);
  assert.equal(p.update(owner,11000).recognizedSeconds,1);assert.equal(p.update(wrong,11000).recognizedSeconds,1);
});
test('manual resume preserves authentication while away recovery requests it',()=>{
  const t=createFocusTracker();for(let now=0;now<=3000;now+=500)t.update(owner,now);
  t.reset(true,false);assert.equal(t.update(wrong,30000).verification.required,false);
  t.reset(true);assert.equal(t.update(wrong,31000).verification.required,true);
});
test('sleep and phone pauses require a fresh face match after healthy recovery',()=>{
  for(const behavior of [{eyesClosed:true},{phoneUse:true}]){
    const t=createFocusTracker();for(let now=0;now<=3000;now+=500)t.update(owner,now);
    let result;
    for(let now=3500;now<=10000;now+=500)result=t.update({...owner,...behavior},now);
    assert.equal(result.tracking,false);
    assert.equal(result.verification.required,false);
    const cached={...owner,identity:{...owner.identity,checkedAt:3000}};
    for(let now=10500;now<=12500;now+=500)result=t.update(cached,now);
    assert.equal(result.tracking,false);
    assert.equal(result.verification.phase,'scanning');
    assert.equal(result.verification.resetRequested,true);
    assert.equal(t.update(cached,13000).tracking,false);
    assert.equal(t.update({...owner,identity:{...owner.identity,checkedAt:13500}},13500).tracking,true);
  }
});
test('palm evidence needs both skin-filled pixels and palm overlap; dark phones retain their scores',()=>{
  const image={width:32,height:48,data:new Uint8ClampedArray(32*48*4)};
  for(let i=0;i<image.data.length;i+=4)image.data.set([180,130,100,255],i);
  const phone={score:.9,bbox:[0,0,32,48]};
  assert.equal(phoneCandidateEvidence(image,phone,{palmOverlap:.9}).palmLike,true);
  assert.ok(phoneCandidateEvidence(image,phone,{palmOverlap:.9}).score<.28);
  assert.equal(phoneCandidateEvidence(image,phone).score,.9);
  image.data.fill(0);assert.equal(phoneCandidateEvidence(image,phone,{palmOverlap:1}).score,.9);
});
test('weak phone detections need three independent frames, low confidence noise never confirms',()=>{
  const t=createPhoneTracker(),box=[.2,.2,.1,.2];
  const see=(now,score)=>t.observe({id:now,frameId:now,observedAt:now,completedAt:now,region:FULL_FRAME,status:'ok',candidates:[{box,score}]},now);
  assert.equal(see(0,.32).confirmed,false);assert.equal(see(400,.32).confirmed,false);assert.equal(see(800,.32).confirmed,true);
  const low=createPhoneTracker();for(let now=0;now<=3000;now+=500)assert.equal(low.observe({id:now,frameId:now,observedAt:now,completedAt:now,region:FULL_FRAME,status:'ok',candidates:[{box,score:.22}]},now).confirmed,false);
  const sparse=createPhoneTracker();let state;
  for(let now=0;now<=3200;now+=800)state=sparse.observe({id:now,frameId:now,observedAt:now,completedAt:now,region:FULL_FRAME,status:'ok',candidates:[{box,score:now%1600===0?.35:.08}]},now);
  assert.equal(state.confirmed,true,'low full-frame scores must preserve independent magnified-crop positives');
});
test('hidden badges are awarded only to the verified designated email and persisted server-side',async()=>{
  const token={email:'tntgame1203@gmail.com',email_verified:true};
  assert.deepEqual(privateBadgeAwards(token),['ADMIN','Contributor']);
  assert.deepEqual(privateBadgeAwards({...token,email_verified:false}),[]);assert.deepEqual(privateBadgeAwards({...token,email:'someone@example.com'}),[]);
  let data={uid:'owner'};const ref={path:'users/owner'},db={doc:()=>ref,runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>data}),update:(_,patch)=>{data={...data,...patch};}})};
  const result=await accountBadges(db,'owner',token);assert.deepEqual(data.privateBadges,['ADMIN','Contributor']);assert.ok(result.badges.every(b=>b.private));
  data.privateBadges=['ADMIM','ADMIN','Contributor'];
  const migrated=await accountBadges(db,'owner',token);assert.deepEqual(data.privateBadges,['ADMIN','Contributor']);assert.deepEqual(migrated.badges.map(row=>row.id),['ADMIN','Contributor']);
  assert.equal((await provisionPrivateBadges(db,{getUserByEmail:async email=>({uid:'owner',email,emailVerified:true})})).persisted,true);
  assert.deepEqual((await provisionPrivateBadges(db,{getUserByEmail:async email=>({uid:'owner',email,emailVerified:false})})).badges,[]);
});
