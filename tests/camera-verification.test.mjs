import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerificationPolicy} from '../camera-verification.js';
import {createFocusTracker} from '../camera-focus.js';
import {phoneCandidateEvidence,createPhoneTracker,FULL_FRAME} from '../camera-phone.js';
import {privateBadgeAwards,accountBadges,provisionPrivateBadges} from '../functions/account-badges.js';
const owner={reliable:true,face:true,studyActivity:true,identity:{enrolled:true,matched:true}},wrong={...owner,identity:{enrolled:true,matched:false,status:'mismatch'}};
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
  const cached=p.update({...owner,identity:{...owner.identity,checkedAt:500}},7000);assert.equal(cached.required,true);assert.equal(cached.reason,'away');
  assert.equal(p.update({...owner,identity:{...owner.identity,checkedAt:7500}},7500).required,false);
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
test('sleep and phone pauses resume without opening a face authentication gate',()=>{
  for(const behavior of [{eyesClosed:true},{phoneUse:true}]){
    const t=createFocusTracker();for(let now=0;now<=3000;now+=500)t.update(owner,now);
    for(let now=3500;now<=10000;now+=500)t.update({...owner,...behavior},now);
    assert.equal(t.update(wrong,10500).verification.required,false);
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
