import test from 'node:test';
import assert from 'node:assert/strict';
import {estimatedFaceShape,faceShapeScore} from '../face-mesh.js';
import {createFaceScanCollector,packScanProfile,unpackScanProfile} from '../face-scan.js';
import {createScanIdentityMatcher,normalized} from '../camera-identity.js';
import {sampleScanProfile,syntheticFace,scanPoses} from './scan-fixtures.mjs';
import {encryptFaceSamples,decryptFaceSamples,validateFaceBinding} from '../face-crypto.js';
import {createBrowserFaceKeys} from '../face-storage.js';
import {FACE_SCHEMA,FACE_PREPROCESS,FACE_MODEL} from '../functions/face-protocol.js';
import {scanRingSegments,updateScanRing,stopScanRing,scanArrowGuidance} from '../face-scan-guide.js';
const owner=normalized([...Array.from({length:1024},(_,i)=>i===0?1:0),...Array.from({length:1024},(_,i)=>i===0?1:0)]);

test('large center arrow guides alignment first and then the missing scan angle',()=>{
  assert.equal(scanArrowGuidance().tone,'hold');
  for(const [x,y,angle] of [[.3,0,90],[-.3,0,-90],[0,-.3,0],[0,.3,180]])assert.equal(scanArrowGuidance({alignment:{x,y}}).angle,angle);
  const aligned={alignment:{x:0,y:0},direction:'front'};
  assert.equal(scanArrowGuidance(aligned).tone,'ready');
  assert.match(scanArrowGuidance(aligned).label,/정면 유지/);
  const scanning={...aligned,direction:'circle',coverage:[2,2,0,0,0,0,0,0]};
  assert.equal(scanArrowGuidance(scanning).angle,0);assert.match(scanArrowGuidance(scanning).label,/위쪽/);
  assert.equal(scanArrowGuidance({...scanning,alignment:{x:-.3,y:0}}).tone,'adjust','position correction takes precedence over angle collection');
  assert.equal(scanArrowGuidance({...scanning,state:'QUALITY_HOLD'}).tone,'hold');
});

test('registration ring interpolates between observations and stops cleanly without repeat DOM writes',()=>{
  let sequence=0,writes=0;
  const frames=new Map(),view={requestAnimationFrame:fn=>{const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),matchMedia:()=>({matches:false})};
  const node=()=>({attrs:{},children:[],setAttribute(key,value){writes++;this.attrs[key]=value;},append(child){this.children.push(child);}});
  const ring={isConnected:true,ownerDocument:{defaultView:view,createElementNS:()=>node()},classList:{add(){}},replaceChildren(svg){this.svg=svg;}};
  const step=time=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));};
  updateScanRing(ring);
  const left=ring.svg.children[4+48],start=Number(left.attrs.x2);
  updateScanRing(ring,{orientation:{x:1,y:0}});assert.equal(frames.size,1);
  for(let i=0;i<5;i++)updateScanRing(ring,{orientation:{x:1,y:0}});
  assert.equal(frames.size,1,'incoming observations share one animation loop');
  step(0);const first=Number(left.attrs.x2);assert.ok(first<start&&first>2);
  step(16);assert.ok(Number(left.attrs.x2)<first,'motion continues without another observation');
  for(let time=32;time<700;time+=16)step(time);
  assert.equal(frames.size,0);
  const settledWrites=writes;updateScanRing(ring,{coverage:[]});assert.equal(writes,settledWrites);
  updateScanRing(ring,{orientation:{x:-1,y:1}});assert.equal(frames.size,1);
  updateScanRing(ring,{orientation:null});assert.equal(frames.size,0,'face loss stops interpolation immediately');
  updateScanRing(ring,{orientation:{x:1,y:1}});stopScanRing(ring);assert.equal(frames.size,0);
});

test('optional wide-angle sweep captures an extreme view and finishes on its fixed deadline even without further turns',()=>{
  const collector=createFaceScanCollector({refineMs:6000}),shape=estimatedFaceShape(syntheticFace(),640,480);let time=0,result;
  for(const pose of scanPoses())result=collector.observe(owner,{time:time+=700,pose,shape});
  assert.equal(result.progress,18);assert.equal(result.complete,false);assert.equal(result.refining,true);
  const finishAt=time+6000;
  collector.observe(owner,{time:time+=700,pose:{yaw:.7,pitch:0},shape});
  for(;time<finishAt;time+=700)result=collector.observe(owner,{time,pose:{yaw:0,pitch:0},shape});
  result=collector.observe(owner,{time:finishAt,pose:{yaw:0,pitch:0},shape});
  assert.equal(result.complete,true);assert.ok(result.profile.poses.some(p=>p[0]>.6));assert.equal(result.profile.samples.length,18);
});
test('estimated 3D shape is invariant to translation, scale and rigid head rotation',()=>{
  const base=syntheticFace(),shape=estimatedFaceShape(base,640,480),angle=.28;
  const moved=base.map(p=>{const x=p.x*640,y=p.y*480,z=p.z*640;return {x:(x*1.2+40)/640,y:((y*Math.cos(angle)-z*Math.sin(angle))*1.2+20)/480,z:((y*Math.sin(angle)+z*Math.cos(angle))*1.2+10)/640};});
  assert.ok(faceShapeScore(shape,estimatedFaceShape(moved,640,480))>.9999);
  assert.equal(estimatedFaceShape(base.map(p=>({x:p.x,y:p.y})),640,480),null,'no measured or fabricated depth fallback');
});
test('continuous scan accepts either circle direction, distinct angles, and preserves interrupted progress',()=>{
  for(const reverse of [false,true]){
    const c=createFaceScanCollector(),poses=scanPoses(),shape=estimatedFaceShape(syntheticFace(),640,480);let time=0,result;
    for(const p of poses.slice(0,2))result=c.observe(owner,{time:time+=700,pose:p,shape});
    assert.equal(result.center,2);assert.equal(result.progress,2);
    assert.equal(c.observe(null,{time:time+=700,quality:false,multiple:true}).progress,2);
    const ring=reverse?poses.slice(2).toReversed():poses.slice(2);
    for(const pose of ring){result=c.observe(owner,{time:time+=1000,pose,shape});assert.equal(c.observe(owner,{time:time+=500,pose,shape}).progress,result.progress);}
    assert.equal(result.complete,true);assert.equal(result.progress,18);assert.deepEqual(result.coverage,Array(8).fill(2));
    assert.equal(c.result().profile.samples.length,18,'save retry retains the complete profile');
  }
});
test('static, center-only, missing geometry and fast movements cannot complete a scan',()=>{
  const c=createFaceScanCollector(),shape=estimatedFaceShape(syntheticFace(),640,480);
  for(let time=0;time<30000;time+=500)c.observe(owner,{time,pose:{yaw:0,pitch:0},shape});
  assert.equal(c.status().progress,2);assert.equal(c.result().complete,false);
  assert.equal(c.observe(owner,{time:31000,pose:{yaw:.2,pitch:0}}).progress,2);
  c.observe(owner,{time:32000,pose:{yaw:.2,pitch:0},shape});
  const fast=c.observe(owner,{time:32100,pose:{yaw:-.2,pitch:0},shape});assert.match(fast.label,/천천히/);
});

test('natural circles complete across small, large and vertically stretched head movements',()=>{
  const shape=estimatedFaceShape(syntheticFace(),640,480);
  for(const [yaw,pitch]of [[.12,.08],[.3,.3],[.6,.5],[.12,.45],[.15,.5]])for(const direction of [-1,1])for(const phase of [0,.1,.3]){
    const collector=createFaceScanCollector(),baseline={yaw:.06,pitch:.35};let time=0,result;
    for(let i=0;i<2;i++)collector.observe(owner,{time:time+=700,pose:baseline,shape});
    for(let frame=0;frame<96&&!result?.complete;frame++){
      const angle=phase+direction*frame*Math.PI/16;
      result=collector.observe(owner,{time:time+=500,pose:{yaw:baseline.yaw+yaw*Math.cos(angle),pitch:baseline.pitch-pitch*Math.sin(angle)},shape});
    }
    assert.equal(result.complete,true,`ellipse ${yaw}/${pitch}, direction ${direction}: ${result.coverage}`);
    assert.deepEqual(result.coverage,Array(8).fill(2));
    assert.equal(unpackScanProfile(packScanProfile(result.profile)).samples.length,18);
  }
});

test('duplicate poses cannot fill neighboring windows and an incomplete direction remains incomplete',()=>{
  const c=createFaceScanCollector(),shape=estimatedFaceShape(syntheticFace(),640,480);let time=0;
  for(let i=0;i<2;i++)c.observe(owner,{time:time+=700,pose:{yaw:0,pitch:0},shape});
  const pose={yaw:.2*Math.cos(.3),pitch:-.1*Math.sin(.3)};
  const first=c.observe(owner,{time:time+=1000,pose,shape});
  for(let i=0;i<30;i++)c.observe(owner,{time:time+=700,pose,shape});
  assert.equal(c.status().progress,first.progress);
  assert.equal(c.result().complete,false);
  assert.match(c.observe(owner,{time:time+=700,pose:{yaw:0,pitch:0},shape}).label,/크게/);
  assert.equal(c.trackPose({yaw:-.2,pitch:.1}).orientation.x,-1);
  assert.equal(c.status().progress,first.progress,'tracking alone never captures a sample');
});

test('live green ticks follow the mirrored head direction while red outer ticks mark only missing coverage',()=>{
  const coverage=[2,0,1,0,0,0,0,0];
  for(const [pose,index]of [[{x:1,y:0},48],[{x:-1,y:0},16],[{x:0,y:-1},0],[{x:0,y:1},32]]){
    const segments=scanRingSegments(pose,coverage),peak=segments.reduce((a,b)=>a.active>b.active?a:b);
    assert.equal(segments[index],peak);
    assert.ok(Math.hypot(peak.x2-112,peak.y2-112)>109);
    for(const segment of segments){assert.ok(Math.hypot(segment.missing.x1-112,segment.missing.y1-112)>112);assert.equal(segment.missing.opacity,coverage[segment.sector]===2?0:coverage[segment.sector]===1?.45:.9);}
  }
  assert.ok(scanRingSegments(null,Array(8).fill(2)).every(s=>s.active===0&&s.missing.opacity===0));
});
test('scan identity requires both RGB and 3D agreement with five fresh votes',()=>{
  const profile=sampleScanProfile(owner),shape=profile.shapes[0],wrong=normalized([...Array.from({length:1024},(_,i)=>i===1?1:0),...Array.from({length:1024},(_,i)=>i===1?1:0)]);
  const matcher=createScanIdentityMatcher(profile),candidate={values:owner,shape};
  for(let i=0;i<4;i++)assert.equal(matcher.observeCandidates([candidate]).matched,false);
  assert.equal(matcher.observeCandidates([candidate]).matched,true);
  assert.equal(matcher.observeCandidates([{values:wrong,shape}]).matched,false,'3D similarity cannot rescue a different RGB face');
  matcher.reset();const different=shape.map((v,i)=>v+(i%3===2?1:0));
  for(let i=0;i<6;i++)assert.equal(matcher.observeCandidates([{values:owner,shape:different}]).matched,false,'incompatible 3D geometry cannot authenticate on RGB alone');
  matcher.reset();for(let i=0;i<5;i++)matcher.observeCandidates([candidate],{vote:false});assert.equal(matcher.observeCandidates([candidate],{vote:false}).matched,false);
});
test('face shape matching rejects 79% and accepts exactly 80%',()=>{
  const profile=sampleScanProfile(owner);
  const shape=profile.shapes[0].map((value,index)=>index%3===2?0:value);
  profile.shapes=profile.shapes.map(()=>shape);
  const matcher=createScanIdentityMatcher(profile);
  for(const [score,expected] of [[.79,false],[.8,true]]){
    const observed=shape.map((value,index)=>index%3===2?-.25*Math.log(score):value);
    assert.equal(faceShapeScore(shape,observed),score);
    matcher.reset();
    for(let i=0;i<4;i++)assert.equal(matcher.observeCandidates([{values:owner,shape:observed}]).matched,false);
    const result=matcher.observeCandidates([{values:owner,shape:observed}]);
    assert.equal(result.meshThreshold,.8);assert.equal(result.matched,expected);
  }
});
test('multi-face scan matching selects the owner rather than another visible face',()=>{
  const profile=sampleScanProfile(owner),matcher=createScanIdentityMatcher(profile),shape=profile.shapes[0],wrong=normalized(Array(2048).fill(1));
  for(let i=0;i<5;i++)matcher.observeCandidates([{values:wrong,shape},{values:owner,shape}]);
  const result=matcher.observeCandidates([{values:owner,shape},{values:wrong,shape}]);assert.equal(result.matched,true);assert.equal(result.faceIndex,0);
});
test('scan codec and encryption preserve geometry and reject malformed or incomplete profiles',async()=>{
  const profile=sampleScanProfile(owner),roundtrip=unpackScanProfile(packScanProfile(profile));assert.equal(roundtrip.samples.length,18);assert.equal(roundtrip.shapes[0].length,96);
  assert.throws(()=>packScanProfile({...profile,shapes:profile.shapes.map(()=>Array(96).fill(0))}));
  assert.throws(()=>packScanProfile({...profile,poses:profile.poses.map(()=>[0,0])}));
  const keys=await createBrowserFaceKeys(),binding={uid:'scan-owner',installationId:'scan-browser',purpose:'face-profile',modelVersion:FACE_MODEL,preprocessVersion:FACE_PREPROCESS,schemaVersion:FACE_SCHEMA};
  const sealed=await encryptFaceSamples(profile,keys,binding),restored=await decryptFaceSamples(sealed,keys,sealed.wrappedKey,binding.uid,binding.installationId);
  assert.equal(restored.kind,profile.kind);assert.ok(faceShapeScore(restored.shapes[0],profile.shapes[0])>.999);
  await assert.rejects(encryptFaceSamples(Array(20).fill(owner),keys,binding));
  assert.throws(()=>validateFaceBinding({...binding,schemaVersion:5,preprocessVersion:'old'},binding.uid,binding.installationId));
});
