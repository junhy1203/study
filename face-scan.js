import {MESH_SIZE,validFaceShape} from './face-mesh.js?v=20261103-privateui1';
export const SCAN_KIND='rgb-estimated-mesh-v1';
export const SCAN_COUNT=18;
export const SCAN_AXES=Object.freeze({yaw:.2,pitch:.1});
// People naturally draw different sized ellipses. Require directional coverage,
// without forcing the head to follow one narrow, invisible ellipse.
const MIN_RADIUS=.4,MAX_RADIUS=6,SECTOR_TOLERANCE=Math.PI/3,MIN_SEPARATION=.075;
export const SCAN_SECTORS=Object.freeze(['왼쪽','왼쪽 위','위쪽','오른쪽 위','오른쪽','오른쪽 아래','아래쪽','왼쪽 아래']);
export function scanSector(pose){
  const x=pose[0]/SCAN_AXES.yaw,y=-pose[1]/SCAN_AXES.pitch;
  return (Math.round(Math.atan2(y,x)/(Math.PI/4))+8)%8;
}
export function validScanEmbedding(value){return Array.isArray(value)&&value.length===2048&&value.every(Number.isFinite)&&Math.abs(Math.hypot(...value)-1)<.01&&Math.hypot(...value.slice(0,1024))>.01&&Math.hypot(...value.slice(1024))>.01;}
export function validateScanProfile(profile){
  if(profile?.kind!==SCAN_KIND||!Array.isArray(profile.origin)||profile.origin.length!==2||!profile.origin.every(v=>Number.isFinite(v)&&Math.abs(v)<2)||!Array.isArray(profile.samples)||profile.samples.length!==SCAN_COUNT||!profile.samples.every(validScanEmbedding)||!Array.isArray(profile.shapes)||profile.shapes.length!==SCAN_COUNT||!profile.shapes.every(validFaceShape)||!Array.isArray(profile.poses)||profile.poses.length!==SCAN_COUNT||profile.poses.some(p=>!Array.isArray(p)||p.length!==2||!p.every(v=>Number.isFinite(v)&&Math.abs(v)<2)))throw new Error('영상 3D 얼굴 등록 정보가 손상되었습니다. 다시 등록해 주세요.');
  for(let i=0;i<SCAN_COUNT;i++){
    const p=profile.poses[i],radius=Math.hypot(p[0]/SCAN_AXES.yaw,p[1]/SCAN_AXES.pitch);
    const angle=Math.atan2(-p[1]/SCAN_AXES.pitch,p[0]/SCAN_AXES.yaw),expected=Math.floor((i-2)/2)*Math.PI/4;
    const difference=Math.abs(Math.atan2(Math.sin(angle-expected),Math.cos(angle-expected)));
    if(i<2?radius>.45001:radius<MIN_RADIUS-.00001||radius>MAX_RADIUS+.00001||difference>SECTOR_TOLERANCE+.00001)throw new Error('얼굴 스캔의 각도 범위가 부족합니다. 다시 등록해 주세요.');
  }
  return profile;
}
export function packScanProfile(profile){
  validateScanProfile(profile);
  return new Float32Array([5,SCAN_COUNT,MESH_SIZE,...profile.origin,...profile.samples.flat(),...profile.shapes.flat(),...profile.poses.flat()]);
}
export function unpackScanProfile(floats){
  if(floats.length!==5+SCAN_COUNT*(2048+MESH_SIZE+2)||floats[0]!==5||floats[1]!==SCAN_COUNT||floats[2]!==MESH_SIZE)throw new Error('영상 3D 얼굴 정보 크기가 올바르지 않습니다.');
  let offset=5;const take=size=>Array.from({length:SCAN_COUNT},()=>Array.from(floats.subarray(offset,offset+=size)));
  return validateScanProfile({kind:SCAN_KIND,origin:Array.from(floats.subarray(3,5)),samples:take(2048),shapes:take(MESH_SIZE),poses:take(2)});
}
export function createFaceScanCollector({refineMs=0}={}){
  let origin=null,center=[],sectors=Array.from({length:8},()=>[]),lastCapture=-Infinity,lastObservation=null,orientation=null,refinementStarted=null,latestTime=0;
  const trackPose=pose=>{
    orientation=origin&&pose&&[pose.yaw,pose.pitch].every(Number.isFinite)?{x:(pose.yaw-origin[0])/SCAN_AXES.yaw,y:(pose.pitch-origin[1])/SCAN_AXES.pitch}:null;
    return {orientation};
  };
  const progress=()=>center.length+sectors.reduce((sum,rows)=>sum+rows.length,0);
  const status=()=>{
    const target=sectors.findIndex(rows=>rows.length<2),started=center.length===2;
    const refining=target<0&&refineMs>0&&refinementStarted!==null&&latestTime-refinementStarted<refineMs;
    return {scan:true,orientation,refining,progress:progress(),total:SCAN_COUNT,coverage:sectors.map(rows=>rows.length),center:center.length,manualCapture:false,canCapture:false,direction:started?'circle':'front',
      label:!started?'정면을 잠시 바라봐 주세요':refining?'편안하게 돌릴 수 있는 끝까지 한 번 더 둘러봐 주세요 · 6초 후 자동 완료':target<0?'3D 영상 스캔 완료 · 안전하게 저장합니다':`편안한 범위로 고개를 천천히 돌려 주세요 · ${SCAN_SECTORS[target]} 방향을 조금 더 보여 주세요`};
  };
  function reset(){origin=null;center=[];sectors=Array.from({length:8},()=>[]);lastCapture=-Infinity;lastObservation=null;orientation=null;refinementStarted=null;latestTime=0;}
  const result=()=>{
    const value={...status(),complete:progress()===SCAN_COUNT&&(refineMs===0||refinementStarted!==null&&latestTime-refinementStarted>=refineMs)};
    if(value.complete){const rows=[...center,...sectors.flat()];value.profile=validateScanProfile({kind:SCAN_KIND,origin:[...origin],samples:rows.map(row=>row.values),shapes:rows.map(row=>row.shape),poses:rows.map(row=>row.pose)});}
    return value;
  };
  function placeRow(row,visited=new Set()){
    const angle=Math.atan2(-row.scaled[1],row.scaled[0]);
    const eligible=sectors.map((rows,index)=>({rows,index,distance:Math.abs(Math.atan2(Math.sin(angle-index*Math.PI/4),Math.cos(angle-index*Math.PI/4)))})).filter(item=>item.distance<=SECTOR_TOLERANCE).sort((a,b)=>a.distance-b.distance);
    for(const {rows,index}of eligible){
      if(visited.has(index))continue;
      visited.add(index);
      if(rows.length<2){rows.push(row);return true;}
      // Reassign an overlapping sample before rejecting this frame. Every
      // previously filled slot stays filled; a direction can only gain coverage.
      for(let i=0;i<rows.length;i++)if(placeRow(rows[i],visited)){rows[i]=row;return true;}
    }
    return false;
  }
  return {status,reset,result,trackPose,confirm:()=>false,
    observe(values,{time,pose,shape,quality=true,multiple=false}={}){
      if(Number.isFinite(time))latestTime=time;
      const response=result;
      if(progress()===SCAN_COUNT&&refinementStarted!==null&&latestTime-refinementStarted>=refineMs)return response();
      if(!quality||multiple||!validScanEmbedding(values)||!validFaceShape(shape)||!pose||![pose.yaw,pose.pitch,time].every(Number.isFinite))return response();
      if(!origin&&(Math.abs(pose.yaw)>.4||Math.abs(pose.pitch)>=1.5))return {...response(),label:'먼저 정면을 편안하게 바라봐 주세요'};
      origin??=[pose.yaw,pose.pitch];
      trackPose(pose);
      const relative=[pose.yaw-origin[0],pose.pitch-origin[1]],scaled=[relative[0]/SCAN_AXES.yaw,relative[1]/SCAN_AXES.pitch],radius=Math.hypot(...scaled);
      const speed=lastObservation&&time>lastObservation.time&&time-lastObservation.time<2000?Math.hypot(scaled[0]-lastObservation.p[0],scaled[1]-lastObservation.p[1])*1000/(time-lastObservation.time):0;
      lastObservation={time,p:scaled};
      if(speed>12)return {...response(),label:'조금 더 천천히 움직여 주세요 · 모은 스캔은 유지됩니다'};
      if(time-lastCapture<400)return response();
      if(center.length===2&&radius<MIN_RADIUS)return {...response(),label:'고개로 원을 조금 더 크게 그려 주세요 · 모은 스캔은 유지됩니다'};
      if(center.length===2&&radius>MAX_RADIUS)return {...response(),label:'고개를 조금 덜 돌려 주세요 · 얼굴 전체가 보이게 해 주세요'};
      // Overlapping angular windows avoid gaps between adjacent directions.
      // A frame still fills at most one slot, and repeated poses never fill others.
      const repeated=sectors.flat().some(row=>Math.hypot(scaled[0]-row.scaled[0],scaled[1]-row.scaled[1])<MIN_SEPARATION);
      const row={values:[...values],shape:[...shape],pose:relative,scaled};
      if(progress()===SCAN_COUNT){
        // Coverage is already sufficient. A short optional sweep retains a
        // near pose plus the furthest available view, without requiring a
        // physically unreachable turn or extending the completion deadline.
        const index=scanSector(relative),rows=sectors[index];
        const radii=rows.map(item=>Math.hypot(...item.scaled)),far=radii[0]>radii[1]?0:1;
        if(!repeated&&radius>radii[far]+.05)rows[far]=row;
        lastCapture=time;return response();
      }
      if(center.length<2){if(radius>.45)return response();center.push(row);}
      else if(repeated||!placeRow(row))return response();
      lastCapture=time;
      if(progress()===SCAN_COUNT)refinementStarted=time;
      return response();
    },
  };
}
