import test from 'node:test';
import assert from 'node:assert/strict';
import {createFocusTracker} from '../camera-focus.js';
import {createVerificationPolicy} from '../camera-verification.js';
import {extractFocusSignals} from '../camera-inference.js';
const owner={reliable:true,face:true,head:true,studyActivity:true,identity:{enrolled:true,matched:true}};
const head={...owner,face:false,headPosition:[.5,.4],identity:{enrolled:true,matched:false}};
function started(){const tracker=createFocusTracker();for(let t=0;t<=2000;t+=500)tracker.update(owner,t);return tracker;}
test('looking down keeps counting with head evidence and small movements',()=>{
  const tracker=started();for(let t=2500;t<=120000;t+=500){const result=tracker.update({...head,headPosition:[.5+(Math.floor(t/10000)%2)*.03,.4]},t);assert.equal(result.tracking,true);assert.equal(result.verification.required,false);}
});
test('head-only stillness pauses at 30 seconds and movement recovers',()=>{
  const tracker=started();tracker.update(head,2500);
  for(let t=3000;t<32500;t+=500)assert.equal(tracker.update(head,t).tracking,true);
  const asleep=tracker.update(head,32500);assert.equal(asleep.tracking,false);assert.equal(asleep.reason,'sleep');
  const moved={...head,headPosition:[.54,.4]};assert.equal(tracker.update(moved,33000).tracking,false);
  assert.equal(tracker.update(moved,35000).tracking,true);
});
test('head departure stops after 1.5 seconds and head return cannot bypass face gate',()=>{
  const tracker=started(),absent={...head,head:false,headPosition:null};tracker.update(absent,2500);assert.equal(tracker.update(absent,3999).tracking,true);
  const paused=tracker.update(absent,4000);assert.equal(paused.tracking,false);assert.equal(paused.verification.required,true);
  for(let t=4500;t<=8500;t+=500)assert.equal(tracker.update(head,t).tracking,false);
  assert.equal(tracker.update({...owner,identity:{...owner.identity,checkedAt:0}},9000).verification.required,true);
  tracker.update({...owner,identity:{...owner.identity,checkedAt:9500}},9500);
  assert.equal(tracker.update({...owner,identity:{...owner.identity,checkedAt:11500}},11500).tracking,true);
});
test('a torso without any head landmarks cannot establish head occupancy',()=>{
  const pose=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));pose[11].visibility=pose[12].visibility=1;
  const read=()=>extractFocusSignals({}, {landmarks:[pose]}, {}, [],640,480);
  assert.equal(read().head,false);pose[7].visibility=pose[8].visibility=1;
  assert.equal(read().head,true);assert.deepEqual(read().headPosition,[.5,.5]);
});
test('initial head-only occupancy never authenticates',()=>{const policy=createVerificationPolicy();for(let t=0;t<=12000;t+=500)assert.equal(policy.update(head,t).required,true);});
