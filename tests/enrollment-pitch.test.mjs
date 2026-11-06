import test from 'node:test';
import assert from 'node:assert/strict';
import {enrollmentPose,createEnrollmentCollector} from '../camera-identity.js';
const descriptor=Array.from({length:1024},(_,i)=>i===0?1:0);
function faceAtPitch(angle,width=640,height=480){
  const face=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
  face[33]={x:.4,y:.4,z:0};face[263]={x:.6,y:.4,z:0};
  face[10]={x:.5,y:.2,z:0};face[152]={x:.5,y:.8,z:.6*height/width*Math.tan(angle)};
  // Looking down can shorten the nose/eye distance: the previous measure points the wrong way.
  face[1]={x:.5,y:.5-angle*.1,z:-.05};return face;
}
test('forehead/chin depth recognizes downward tilt even when the 2D nose distance shrinks',()=>{
  const front=enrollmentPose(faceAtPitch(0),640,480),down=enrollmentPose(faceAtPitch(.12),640,480);
  assert.ok(down.pitch>front.pitch+.1);
  assert.ok(enrollmentPose(faceAtPitch(-.12),640,480).pitch<front.pitch-.1);
});
test('pitch has the same sign and angle on portrait and landscape cameras',()=>{
  for(const [width,height]of [[640,480],[480,640],[1920,1080]]){
    assert.ok(Math.abs(enrollmentPose(faceAtPitch(.12,width,height),width,height).pitch-.12)<1e-9);
  }
});
test('four slight downward angles finish enrollment without requiring a deep bow',()=>{
  const c=createEnrollmentCollector();let time=0,state;
  const groups=[Array.from({length:4},(_,i)=>({yaw:i*.04,pitch:0})),Array.from({length:4},(_,i)=>({yaw:.2+i*.06,pitch:0})),Array.from({length:4},(_,i)=>({yaw:-.2-i*.06,pitch:0})),Array.from({length:4},(_,i)=>({yaw:0,pitch:-.05-i*.025})),Array.from({length:4},(_,i)=>({yaw:0,pitch:.05+i*.025}))];
  for(const poses of groups)for(const pose of poses){state=c.observe(descriptor,{time:time+=700,pose});assert.equal(c.observe(descriptor,{time:time+=700,pose}).progress,state.progress);}
  assert.equal(state.complete,true);assert.deepEqual(state.counts,[4,4,4,4,4]);
});
