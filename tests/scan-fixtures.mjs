import {estimatedFaceShape} from '../face-mesh.js';
import {SCAN_KIND,validateScanProfile} from '../face-scan.js';
export function scanPoses(){
  return [{yaw:0,pitch:0},{yaw:0,pitch:0},...Array.from({length:8},(_,sector)=>[-.15,.15].map(offset=>{const angle=sector*Math.PI/4+offset;return {yaw:.2*Math.cos(angle),pitch:-.1*Math.sin(angle)};})).flat()];
}
export function syntheticFace(pose={yaw:0,pitch:0}){
  const face=Array.from({length:478},(_,i)=>{const a=i*2.399963;return {x:.5+.12*Math.cos(a),y:.4+.16*Math.sin(a),z:-.015-.02*Math.cos(a)};});
  for(const i of [33,133])face[i]={x:280/640,y:160/480,z:0};
  for(const i of [362,263])face[i]={x:360/640,y:160/480,z:0};
  face[10]={x:.5,y:100/480,z:0};face[152]={x:.5,y:280/480,z:180/640*Math.tan(pose.pitch)};
  face[1]={x:.5+pose.yaw*.125,y:198.4/480-pose.pitch*.08,z:-.04};
  return face;
}
export function sampleScanProfile(vector){
  if(vector?.length!==2048)throw new Error('두 전체 얼굴 특징이 필요합니다.');
  const poses=scanPoses();
  return validateScanProfile({kind:SCAN_KIND,origin:[0,0],samples:poses.map(()=>[...vector]),shapes:poses.map(()=>estimatedFaceShape(syntheticFace(),640,480)),poses:poses.map(p=>[p.yaw,p.pitch])});
}
