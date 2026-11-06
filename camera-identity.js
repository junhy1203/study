import {createFaceVault} from './face-vault.js?v=20261103-privateui1';
import {estimatedFaceShape,faceShapeScore,MESH_THRESHOLD} from './face-mesh.js?v=20261103-privateui1';
import {createFaceScanCollector,validateScanProfile,SCAN_COUNT} from './face-scan.js?v=20261104-1';
export function createScanIdentityMatcher(profile){
  if(profile)validateScanProfile(profile);
  let votes=[];
  return {get enrolled(){return Boolean(profile);},reset(){votes=[];},
    observeCandidates(candidates,{vote=true}={}){
      let best=null;
      if(profile)for(const [faceIndex,candidate]of candidates.entries()){
        for(let offset=0;offset<SCAN_COUNT;offset+=2){
          const pair=[faceSimilarity(profile.samples[offset],candidate.values,true),faceSimilarity(profile.samples[offset+1],candidate.values,true)];
          // Adjacent captures may differ markedly at a deep turn. Let the
          // closest view lead, while retaining support from the second capture.
          const score=.75*Math.max(...pair)+.25*Math.min(...pair);
          const meshScore=Math.max(faceShapeScore(profile.shapes[offset],candidate.shape),faceShapeScore(profile.shapes[offset+1],candidate.shape));
          const accepted=score>=IDENTITY_THRESHOLD&&meshScore>=MESH_THRESHOLD;
          if(!best||accepted&&!best.accepted||accepted===best.accepted&&score>best.score)best={score,meshScore,accepted,faceIndex};
        }
      }
      if(!best){votes=[];return {matched:false,status:'locked'};}
      if(vote){votes.push(best.accepted);votes=votes.slice(-5);}
      const matched=best.accepted&&votes.length===5&&votes.filter(Boolean).length>=4;
      return {...best,matched,status:matched?'matched':best.accepted?'checking':'mismatch',threshold:IDENTITY_THRESHOLD,meshThreshold:MESH_THRESHOLD,scan:true};
    },
  };
}
const MODEL='https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/faceres.json';
export function normalized(values){
  if(!Array.isArray(values)&&!ArrayBuffer.isView(values))return null;
  if(![1024,2048].includes(values.length)||!Array.from(values).every(Number.isFinite))return null;
  const norm=Math.hypot(...values);return norm>0?Array.from(values,value=>value/norm):null;
}
const similarity=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
// Provisional operating point: calibrate with genuine/impostor webcam pairs.
// Cosine similarity is a score, not a probability of identity.
export const IDENTITY_THRESHOLD=.8;
function faceSimilarity(sample,descriptor,dualFull){
  const savedFull=normalized(sample.slice(0,1024)),observedFull=normalized(descriptor.slice(0,1024));
  if(!savedFull||!observedFull)return -1;
  const full=similarity(savedFull,observedFull);
  // Legacy periocular embeddings are intentionally ignored. A masked input to
  // a whole-face model must never authenticate someone with different features.
  if(!dualFull)return full;
  if(sample.length!==2048||descriptor.length!==2048)return -1;
  const savedLight=normalized(sample.slice(1024)),observedLight=normalized(descriptor.slice(1024));
  if(!savedLight||!observedLight)return -1;
  const light=similarity(savedLight,observedLight);
  // Lighting-normalized features lead, but cannot rescue an unrelated RGB face.
  return Math.min(.75*light+.25*full,full+.08);
}
export function createIdentityMatcher(saved=[],{dualFull=false}={}) {
  const samples=saved.map(normalized).filter(Boolean);let votes=[];
  return {
    get enrolled(){return [12,20].includes(samples.length);},
    get samples(){return samples.map(row=>[...row]);},
    reset(){votes=[];},
    observe(values){return this.observeFaces([values]);},
    observeFaces(values,{vote=true}={}){
      let score=-Infinity,faceIndex=-1;
      if([12,20].includes(samples.length))values.forEach((value,index)=>{
        const descriptor=normalized(value);if(!descriptor)return;
        const scores=samples.map(sample=>faceSimilarity(sample,descriptor,dualFull));
        // Require two supporting samples from ONE enrolled pose. Averaging the
        // best three across different poses penalizes genuine side views and
        // lets unrelated isolated matches combine into a passing score.
        let offset=0;
        const candidate=Math.max(...(samples.length===12?[4,2,2,2,2]:[4,4,4,4,4]).map(count=>{
          const pose=scores.slice(offset,offset+=count).sort((a,b)=>b-a);
          return (pose[0]+pose[1])/2;
        }));
        if(candidate>score){score=candidate;faceIndex=index;}
      });
      if(faceIndex<0){votes=[];return {matched:false,status:'locked'};}
      if(vote){votes.push(score>=IDENTITY_THRESHOLD);votes=votes.slice(-5);}
      const matched=votes.length===5&&votes.filter(Boolean).length>=4&&score>=IDENTITY_THRESHOLD;
      return {matched,status:matched?'matched':score<IDENTITY_THRESHOLD?'mismatch':'checking',score,threshold:IDENTITY_THRESHOLD,faceIndex};
    },
  };
}
export const FACE_DIRECTIONS=[{name:'front',count:4,label:'정면을 보며 고개를 천천히 작게 움직여 주세요'},{name:'left',count:4,label:'고개를 왼쪽으로 천천히 돌려 주세요'},{name:'right',count:4,label:'고개를 오른쪽으로 천천히 돌려 주세요'},{name:'up',count:4,label:'고개를 위쪽으로 천천히 들어 주세요'},{name:'down',count:4,label:'턱을 살짝 내리며 아래쪽으로 천천히 움직여 주세요'}];
export function enrollmentPose(face,frameWidth=1,frameHeight=1){
  if(!face?.[1]||!face[33]||!face[263])return null;
  const a=face[33],b=face[263],n=face[1],width=Math.hypot(b.x-a.x,b.y-a.y);
  if(width<.02)return null;
  const forehead=face[10],chin=face[152];
  // Nose-to-eye distance contracts when looking down and can reverse its 2D sign.
  // The forehead/chin depth axis measures actual head tilt, independent of that contraction.
  const depthReady=forehead&&chin&&[forehead.x,forehead.y,forehead.z,chin.x,chin.y,chin.z,frameWidth,frameHeight].every(Number.isFinite)&&frameWidth>0&&frameHeight>0;
  const pitch=depthReady?Math.atan2((chin.z-forehead.z)*frameWidth,Math.hypot((chin.x-forehead.x)*frameWidth,(chin.y-forehead.y)*frameHeight)):(n.y-(a.y+b.y)/2)/width;
  return {yaw:(n.x-(a.x+b.x)/2)/width,pitch};
}
// Align to the eyes, independent of where the face appears in the camera frame.
export function faceFrameGeometry(face,width,height){
  if(!face||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
  if([1,10,33,133,152,234,263,362,454].some(i=>!face[i]||!Number.isFinite(face[i].x)||!Number.isFinite(face[i].y)||face[i].x<.005||face[i].x>.995||face[i].y<.005||face[i].y>.995))return null;
  const eye=(a,b)=>({x:(face[a].x+face[b].x)*width/2,y:(face[a].y+face[b].y)*height/2});
  const left=eye(33,133),right=eye(362,263),dx=right.x-left.x,dy=right.y-left.y,size=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
  if(size<14||Math.abs(angle)>.7)return null;
  const scale=224/(size*3),cos=Math.cos(angle)*scale,sin=Math.sin(angle)*scale,midX=(left.x+right.x)/2,midY=(left.y+right.y)/2;
  return {width,height,transform:[cos,-sin,sin,cos,112-cos*midX-sin*midY,85+sin*midX-cos*midY]};
}
export function createEnrollmentCollector() {
  let samples=[],counts=[0,0,0,0,0],last=-Infinity,baseline=null,poses=[],lastPose=null;
  const step=()=>counts.findIndex((count,i)=>count<FACE_DIRECTIONS[i].count);
  const reset=()=>{samples=[];counts=[0,0,0,0,0];last=-Infinity;baseline=null;poses=[];lastPose=null;};
  const status=()=>{
    const next=step(),direction=next<0?'front':FACE_DIRECTIONS[next].name;
    return {progress:samples.length,total:20,counts:[...counts],direction,manualCapture:false,canCapture:false,
      label:next<0?'촬영 완료 · 안전하게 저장하고 있습니다':`${FACE_DIRECTIONS[next].label} · ${counts[next]}/4`};
  };
  return {
    reset,status,
    confirm(){return false;},
    observe(values,{time,quality=true,multiple=false,pose}={}) {
      const descriptor=normalized(values),response=()=>({...status(),samples:samples.map(row=>[...row]),complete:false});
      const next=step();
      if(next<0)return {...response(),complete:true};
      if(multiple||!quality||!descriptor||!pose||![pose.yaw,pose.pitch].every(Number.isFinite)||!Number.isFinite(time)||time-last<600)return response();
      baseline??={...pose};
      const yaw=pose.yaw-baseline.yaw,pitch=pose.pitch-baseline.pitch;
      const vertical=next>=3,target=vertical?.045+counts[next]*.025:.09+counts[next]*.055;
      const appropriate=next===0?Math.abs(yaw)<.16&&Math.abs(pitch)<.16:next===1?yaw>=target&&yaw<.65:next===2?yaw<=-target&&yaw>-.65:next===3?pitch<=-target&&pitch>-.9:pitch>=target&&pitch<.9;
      const previous=poses[next];
      const separation=vertical?.012:.035;
      if(!appropriate||previous&&Math.hypot(pose.yaw-previous.yaw,pose.pitch-previous.pitch)<separation||lastPose&&Math.hypot(pose.yaw-lastPose.yaw,pose.pitch-lastPose.pitch)<separation)return response();
      last=time;
      samples.push(descriptor);counts[next]++;poses[next]={...pose};lastPose={...pose};
      return {...response(),complete:step()<0};
    },
  };
}
export function faceImageQuality(image,{eyesOnly=false}={}) {
  let sum=0,sum2=0,dark=0,bright=0,left=0,right=0,count=0;
  const {data,width,height}=image,gray=(x,y)=>{const i=(y*width+x)*4;return .2126*data[i]+.7152*data[i+1]+.0722*data[i+2];};
  for(let y=eyesOnly?60:40;y<Math.min(height-1,eyesOnly?110:180);y+=2)for(let x=48;x<Math.min(width-1,176);x+=2){const value=gray(x,y);sum+=value;sum2+=value*value;dark+=value<25;bright+=value>240;if(x<112)left+=value;else right+=value;count++;}
  if(!count)return '카메라 영상 품질을 확인할 수 없습니다';
  const mean=sum/count;
  if(mean<45||dark/count>.45)return '얼굴 앞쪽을 조금 더 밝게 해 주세요';
  if(mean>215||bright/count>.3)return '얼굴에 비치는 강한 빛이나 안경 반사를 줄여 주세요';
  if(Math.abs(left-right)/Math.max(1,sum)>.3)return '창문을 등지지 않도록 위치를 바꿔 주세요';
  // Smooth skin, webcam denoising and resampling reduce local edges without hiding a face.
  // Only a nearly uniform frame is rejected here. Do not infer occlusion from texture.
  if(sum2/count-mean*mean<16)return '얼굴의 윤곽을 구분하기 어렵습니다. 카메라 초점과 조명을 확인해 주세요';
  return null;
}
// Preserve aligned eye positions; fade hair, cheeks, nose and mouth to neutral.
// This is a second model input, never a reinterpretation of embedding dimensions.
export function eyeRegionImage(image){
  const {width,height}=image,data=new Uint8ClampedArray(image.data);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const weight=Math.max(0,Math.min(1,(x-32)/12,(192-x)/12,(y-48)/12,(122-y)/12));
    const index=(y*width+x)*4;
    for(let channel=0;channel<3;channel++)data[index+channel]=128+(data[index+channel]-128)*weight;
    data[index+3]=255;
  }
  return {data,width,height};
}
// Deterministic whole-face view: remove color cast and standardize face-interior
// exposure/contrast. No common gray mask is fed to the model.
export function lightingNormalizedFace(image){
  const {width,height}=image,data=new Uint8ClampedArray(image.data);
  const gray=index=>.299*image.data[index]+.587*image.data[index+1]+.114*image.data[index+2];
  let count=0,sum=0,sum2=0;
  for(let y=Math.floor(height*.18);y<height*.85;y++)for(let x=Math.floor(width*.2);x<width*.8;x++){
    const value=gray((y*width+x)*4);sum+=value;sum2+=value*value;count++;
  }
  const mid=sum/Math.max(1,count),deviation=Math.sqrt(Math.max(0,sum2/Math.max(1,count)-mid*mid));
  const gain=Math.min(8,Math.max(.5,40/Math.max(5,deviation)));
  for(let index=0;index<data.length;index+=4){
    const value=Math.max(0,Math.min(255,128+(gray(index)-mid)*gain));
    data[index]=data[index+1]=data[index+2]=value;data[index+3]=255;
  }
  return {data,width,height};
}
export async function createLocalFaceGuard(tf,security,rpc,notify=()=>{},{describerFactory}={}) {
  if(!security?.uid)throw new Error('계정 인증과 암호화된 얼굴 등록이 필요합니다.');
  const vault=createFaceVault(security,rpc,notify);
  const binding=security.ticket?.binding||security.record?.binding;
  if(binding?.schemaVersion!==5)throw new Error('영상 3D 얼굴 등록을 새로 진행해 주세요.');
  const dualFull=true;
  let matcher=createScanIdentityMatcher(await vault.load()),collector=matcher.enrolled?null:createFaceScanCollector({refineMs:6000});
  const describer=describerFactory?await describerFactory(MODEL):null;
  const model=describer?null:await tf.loadGraphModel(MODEL);
  // Preserve old enrollment wire formats when connected to an older server.
  const compareEyes=false;
  async function describe(image){
    if(describer)return normalized(await describer.describe(image));
    // Synthesized lighting/eye views are plain RGBA buffers; browsers need a
    // native ImageData object at the TF.js pixel boundary.
    const pixels=typeof ImageData==='function'?new ImageData(image.data,image.width,image.height):image;
    const input=tf.tidy(()=>tf.browser.fromPixels(pixels).toFloat().expandDims(0));let descriptor;
    try{descriptor=model.execute(input,'global_pooling/Mean');const values=await descriptor.data();if(values.length!==1024)throw new Error('얼굴 모델 특징 크기가 올바르지 않습니다.');return normalized(values);}
    finally{input.dispose();descriptor?.dispose();}
  }
  const canvas=new OffscreenCanvas(224,224),context=canvas.getContext('2d',{willReadFrequently:true});
  let lastCheck=-Infinity,current={matched:false,status:matcher.enrolled?'checking':'enrolling'},closed=false,saving=false,saveError='';
  let pendingSample=null,sampleEpoch=0,sampleError=null,latestPose=null;
  const state=()=>({...current,enrolled:matcher.enrolled,checkedAt:lastCheck});
  const progress=(extra={})=>notify({type:'face-progress',state:'ENROLLING',...collector?.status(),...extra});
  const hold=(label,multiple=false)=>{sampleEpoch++;matcher.reset();collector?.observe(null,{time:lastCheck,quality:false,multiple});current={matched:false,status:'quality-hold',label};progress({state:'QUALITY_HOLD',label});return state();};
  if(collector)progress();
  function saveCollected(observed){
    if(!observed.complete||saving)return;
    saving=true;saveError='';current={matched:false,status:'saving',progress:SCAN_COUNT};
    void vault.save(observed.profile).then(restored=>{
      if(closed)return;matcher=createScanIdentityMatcher(restored);collector.reset();collector=null;current={matched:false,status:'checking'};
      notify({type:'face-progress',state:'READY',manualCapture:false,label:'영상 3D 등록이 완료됐습니다. 얼굴을 확인합니다.'});
    }).catch(error=>{
      if(closed)return;saveError=error.message||'얼굴 정보를 저장하지 못했습니다.';current={matched:false,status:'save-error',progress:SCAN_COUNT};
      progress({state:'RECOVERY_REQUIRED',label:`저장 실패: ${saveError}`,manualCapture:true,canCapture:true,captureLabel:'저장 다시 시도'});
    }).finally(()=>{saving=false;});
  }
  return {
    get enrolling(){return Boolean(collector);},
    resetVerification(){sampleEpoch++;matcher.reset();current={matched:false,status:matcher.enrolled?'checking':'enrolling'};lastCheck=-Infinity;},
    confirmCapture(){if(closed||saving||!collector)return false;const observed=collector.result();if(!observed.complete)return false;saveCollected(observed);return true;},
    async check(source,result,time){
      if(closed)return {matched:false,status:'locked',enrolled:false};
      if(sampleError)throw sampleError;
      // Keep frame replies flowing while storage/KMS requests are pending.
      if(saving)return state();
      if(saveError)return state();
      const faces=result.faceLandmarks||[];
      if(!faces.length||collector&&faces.length>1)return hold(faces.length>1?'화면에 한 사람만 나오게 해 주세요':'얼굴 전체가 카메라에 나오게 해 주세요. 크기와 위치는 자동으로 맞춥니다',faces.length>1);
      const width=source.videoWidth||source.width,height=source.videoHeight||source.height;
      if(collector&&faces.length===1){
        const face=faces[0],cx=(face[234]?.x+face[454]?.x)/2,cy=(face[10]?.y+face[152]?.y)/2;
        latestPose=enrollmentPose(face,width,height);
        notify({type:'face-scan-direction',frameTime:time,...collector.trackPose(latestPose),alignment:Number.isFinite(cx)&&Number.isFinite(cy)?{x:cx-.5,y:.5-cy}:null});
      }
      // One immutable sample at a time, while landmarks keep driving the guide.
      if(pendingSample)return state();
      // A face index belongs only to the frame that was actually compared.
      const cadence=collector?650:current.matched?1600:500;
      if(time-lastCheck<cadence&&faces.length===1)return {...state(),faceIndex:current.accepted?0:undefined};
      const vote=time-lastCheck>=cadence;
      if(vote)lastCheck=time;
      const candidates=[];let qualityLabel='얼굴 전체가 보이게 하고 너무 멀리 앉지 말아 주세요. 크기와 위치는 자동으로 맞춥니다';
      for(const [faceIndex,face] of faces.entries()){
        const framing=face?.[473]&&faceFrameGeometry(face,width,height);
        if(!framing)continue;
        const shape=estimatedFaceShape(face,width,height);if(!shape){qualityLabel='얼굴의 입체 특징을 추정하고 있습니다. 얼굴 전체를 보여 주세요';continue;}
        context.setTransform(1,0,0,1,0,0);context.fillStyle='#808080';context.fillRect(0,0,224,224);
        context.setTransform(...framing.transform);context.drawImage(source,0,0);context.setTransform(1,0,0,1,0,0);
        const image=context.getImageData(0,0,224,224),eyeImage=dualFull?lightingNormalizedFace(image):compareEyes?eyeRegionImage(image):null,quality=faceImageQuality(image);
        if(quality){qualityLabel=quality;continue;}
        if(collector&&describer){
          const activeCollector=collector,epoch=sampleEpoch,pose=enrollmentPose(face,width,height);
          pendingSample=(async()=>{
            const full=await describe(image),eyes=eyeImage?await describe(eyeImage):null;
            if(closed||epoch!==sampleEpoch||collector!==activeCollector)return;
            if(!full||eyeImage&&!eyes)return;
            const observed=activeCollector.observe(eyes?normalized([...full,...eyes]):full,{time,pose,shape});
            // A completed descriptor must not pull the live guide back to its old pose.
            activeCollector.trackPose(latestPose);
            current={matched:false,status:'enrolling',progress:observed.progress};
            progress({label:observed.label});saveCollected(observed);
          })().catch(error=>{if(!closed)sampleError=error;}).finally(()=>{pendingSample=null;});
          return state();
        }
        const full=await describe(image),eyes=eyeImage?await describe(eyeImage):null;
        if(!full||eyeImage&&!eyes)continue;
        candidates.push({values:eyes?normalized([...full,...eyes]):full,shape,faceIndex,framing,pose:enrollmentPose(face,width,height)});
      }
      if(!candidates.length)return hold(qualityLabel);
      const values=candidates[0].values;
        if(collector){
          const observed=collector.observe(values,{time,pose:candidates[0].pose,shape:candidates[0].shape});
          current={matched:false,status:'enrolling',progress:observed.progress};
          progress({label:observed.label});
          saveCollected(observed);
        }else {
          current=matcher.observeCandidates(candidates,{vote});
          const selected=candidates[current.faceIndex];
          current={...current,faceIndex:current.accepted?selected?.faceIndex:undefined};
        }
        const selected=candidates.find(candidate=>candidate.faceIndex===current.faceIndex)||(collector?candidates[0]:null);
        if(selected)notify({type:'face-framing',framing:selected.framing});
        if(current.matched)notify({type:'face-verified'});
        return state();
    },
    close(){closed=true;sampleEpoch++;describer?.close();collector?.reset();matcher=createScanIdentityMatcher();vault.close();model?.dispose();canvas.width=canvas.height=0;},
  };
}
