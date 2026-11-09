// Shared by worker and compatibility mode. Frames never leave the device.
import { faceBounds, faceSearchRegion, restoreFaceCoordinates, sameFace } from './camera-framing.js';
import { createPhoneTracker, createPhoneScheduler, PHONE_LIMITS, phoneCandidateEvidence } from './camera-phone.js?v=20261103-privateui1';
export const VISION_VERSION = '0.10.21';
const MODEL_ROOT = 'https://storage.googleapis.com/mediapipe-models';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const visiblePoint = p => finitePoint(p) && (p.visibility ?? 1) >= .5 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
function nearBox(point, box, margin = .04) {
  return finitePoint(point) && point.x >= box[0] - margin && point.x <= box[0] + box[2] + margin &&
    point.y >= box[1] - margin && point.y <= box[1] + box[3] + margin;
}
function eyeAspect(face, a, b, c, d, e, f) {
  return (distance(face[b], face[f]) + distance(face[c], face[e])) / Math.max(.001, 2 * distance(face[a], face[d]));
}
function eyeGaze(face, left, right, iris) {
  const dx=face[right].x-face[left].x, dy=face[right].y-face[left].y;
  const size=Math.max(.000001,dx*dx+dy*dy);
  const x=face[iris].x-face[left].x, y=face[iris].y-face[left].y;
  return [(x*dx+y*dy)/size,(y*dx-x*dy)/size];
}
export function extractFocusSignals(faceResult, poseResult, handResult, objects, width, height) {
  const face = faceResult.faceLandmarks?.[0];
  const aspect = width > 0 && height > 0 ? width/height : 1;
  const geometry = face?.map(p=>finitePoint(p)?{...p,x:p.x*aspect}:p);
  const pose = poseResult.landmarks?.[0];
  const body = Boolean(pose && [11, 12].every(i => visiblePoint(pose[i])));
  const faceValid = Boolean(face && [1, 33, 263].every(i => finitePoint(face[i])) && distance(face[33],face[263]) > .01);
  const headPoints = (pose || []).slice(0,11).filter(visiblePoint);
  const headPresent = faceValid || body && headPoints.length >= 2;
  const headPosition = faceValid ? [face[1].x,face[1].y] : headPoints.length >= 2 ?
    [headPoints.reduce((sum,p)=>sum+p.x,0)/headPoints.length,headPoints.reduce((sum,p)=>sum+p.y,0)/headPoints.length] : null;
  const eyesValid = faceValid && [133,362,160,158,153,144,385,387,373,380].every(i => finitePoint(face[i]));
  const irisValid = faceValid && [133,362,468,473].every(i => finitePoint(face[i]));
  const hands = (handResult.landmarks || []).flatMap(hand => hand.filter(finitePoint));
  const boxes = objects.filter(o => o.score >= (o.class === 'cell phone' ? .2 : .55)).map(o => ({ ...o, box: [o.bbox[0] / width, o.bbox[1] / height, o.bbox[2] / width, o.bbox[3] / height] }));
  const head = faceValid ? face[1] : null;
  const eyeMid = faceValid ? { x: (face[33].x + face[263].x) / 2, y: (face[33].y + face[263].y) / 2 } : null;
  const forehead=geometry?.[10],chin=geometry?.[152];
  const depthAvailable=finitePoint(forehead)&&finitePoint(chin)&&[forehead.z,chin.z].every(Number.isFinite);
  const depthPitch=depthAvailable?Math.atan2((chin.z-forehead.z)*aspect,distance(forehead,chin)):0;
  const headDown = faceValid && (depthPitch>.28 || (head.y - eyeMid.y) / Math.max(.01, distance(geometry[33], geometry[263])) > .65);
  const phones = objects.filter(o => o.class === 'cell phone' && Number.isFinite(o.score))
    .map(o => ({ score: o.score, used: o.score >= .2 }));
  const phoneUse = phones.some(o => o.used);
  const bestPhone = phones.filter(o => o.used).sort((a,b) => b.score-a.score)[0] || phones.sort((a,b) => b.score-a.score)[0];
  const phoneEvidence = bestPhone ? { ...bestPhone, stage: bestPhone.used ? 'using' : 'weak' } :
    { score: 0, stage: 'not-found' };
  const studyContext = boxes.some(o => (o.class === 'book' && headDown) ||
    (o.class === 'laptop' && faceValid && !headDown && Math.abs(head.x - eyeMid.x) < .1) ||
    (o.class === 'book' && hands.some(p => nearBox(p, o.box))));
  const blends = Object.fromEntries((faceResult.faceBlendshapes?.[0]?.categories || []).map(c => [c.categoryName, c.score]));
  // A light smile can narrow both eyes; reserve geometry-based closure for a
  // more complete squint. Strong bilateral blink blendshapes still catch closure.
  const eyesClosed = faceValid && ((eyesValid && eyeAspect(geometry, 33, 160, 158, 133, 153, 144) < .12 &&
    eyeAspect(geometry, 362, 385, 387, 263, 373, 380) < .12) || (blends.eyeBlinkLeft > .7 && blends.eyeBlinkRight > .7));
  // Project each iris onto its own eye axis so head roll is not eye movement.
  const leftGaze=irisValid?eyeGaze(geometry,33,133,468):[.5,0];
  const rightGaze=irisValid?eyeGaze(geometry,362,263,473):[.5,0];
  const gaze=[leftGaze[0],rightGaze[0]];
  const gazeValid=Boolean(irisValid && eyesValid && !eyesClosed &&
    [leftGaze,rightGaze].every(([x,y])=>x>=-.2 && x<=1.2 && Math.abs(y)<=.5));
  const eyeWidth = faceValid ? Math.max(.01, distance(geometry[33], geometry[263])) : 1;
  const headDirection = faceValid ? [(head.x - eyeMid.x)*aspect / eyeWidth, (head.y - eyeMid.y) / eyeWidth,
    Math.atan2(face[263].y - face[33].y, (face[263].x - face[33].x)*aspect)] : [];
  const verticalGaze = [leftGaze[1],rightGaze[1]];
  const activityVector = faceValid ? [head.x, head.y, ...gaze, ...headDirection, ...verticalGaze] : null;
  const studyPoints = [pose?.[15],pose?.[16]].map(p=>visiblePoint(p)?{x:p.x,y:p.y}:null);
  for(const [index,hand] of (handResult.landmarks||[]).entries()){
    const p=hand[8];
    const side=(handResult.handedness??handResult.handednesses)?.[index]?.[0]?.categoryName;
    studyPoints.push(visiblePoint(p)?{x:p.x,y:p.y,side}:null);
  }
  return { reliable: true, face: faceValid, head: headPresent, headDown, headPosition, body, eyesClosed, gazeValid, phoneUse, phoneEvidence,
    studyActivity: false, studyContext, studyPoints, activityVector };
}

export function createFaceContinuity(holdMs = 3000) {
  let points = null, missingSince = null, lastUpdate = null;
  return {
    reset(){points=missingSince=lastUpdate=null;},
    update(result, time) {
      const face=result.faceLandmarks?.[0];
      if (lastUpdate !== null && (time<lastUpdate || time-lastUpdate>holdMs)) points=null;
      lastUpdate=time;
      if (face && [1,33,263].every(i=>finitePoint(face[i])) && distance(face[33],face[263])>.01) {
        points=[face[1],face[33],face[263]].map(p=>({x:p.x,y:p.y,z:p.z}));missingSince=null;
      } else missingSince??=time;
      return missingSince === null || time-missingSince<holdMs ? points : null;
    },
  };
}

// There are at most two hands. Compare the possible one-to-one assignments
// instead of treating detection order as identity.
function matchHands(previous, current){
  let best=[], count=-1, sides=-1, cost=Infinity;
  function visit(index,assignment,used,matches,matchedSides,total){
    if(index===previous.length){
      if(matches>count||matches===count&&(matchedSides>sides||matchedSides===sides&&total<cost)){
        best=[];count=matches;sides=matchedSides;cost=total;
      }
      if(matches===count&&matchedSides===sides&&total===cost)best.push(assignment);
      return;
    }
    visit(index+1,[...assignment,-1],used,matches,matchedSides,total);
    for(const [i,point] of current.entries()){
      const old=previous[index];
      if(used.includes(i)||old.side&&point.side&&old.side!==point.side)continue;
      visit(index+1,[...assignment,i],[...used,i],matches+1,matchedSides+Number(Boolean(old.side&&point.side)),total+distance(old,point));
    }
  }
  visit(0,[],[],0,0,0);
  return best[0].map((index,i)=>best.every(row=>row[i]===index)?index:-1);
}

export function createStudyMotionTracker() {
  let reference = null, referenceTime = null, lastMotion = -Infinity;
  let hands=[];
  function reset(){reference=referenceTime=null;lastMotion=-Infinity;hands=[];}
  return {
    reset,
    update(context, points, now) {
      if (!context) { reset(); return false; }
      const wrists=points.slice(0,2),current=points.slice(2).filter(Boolean);
      const handReferences=[...current];
      for(const [i,index] of matchHands(hands.map(hand=>hand.point),current).entries())
        if(index>=0)handReferences[index]=hands[i].reference;
      const moving=wrists.some((point,i)=>point&&reference?.[i]&&distance(point,reference[i])>.025)||
        current.some((point,i)=>distance(point,handReferences[i])>.025);
      if(moving)lastMotion=now;
      const rebase=moving||referenceTime===null||now-referenceTime>1500;
      if(rebase){reference=wrists;referenceTime=now;}
      hands=current.map((point,i)=>({point,reference:rebase?point:handReferences[i]}));
      return now-lastMotion <= 1000;
    },
  };
}

export function phoneSearchRegion(poseResult, handResult) {
  let points = (handResult.landmarks || []).flat().filter(visiblePoint);
  if (!points.length) points = [poseResult.landmarks?.[0]?.[15], poseResult.landmarks?.[0]?.[16]].filter(visiblePoint);
  if (!points.length) return { x: .225, y: .2, width: .55, height: .65 };
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.min(.7, Math.max(.28, maxX - minX + .2));
  const height = Math.min(.7, Math.max(.32, maxY - minY + .22));
  return { x: Math.max(0, Math.min(1-width, (minX+maxX-width)/2)),
    y: Math.max(0, Math.min(1-height, (minY+maxY-height)/2)), width, height };
}
export function phoneSearchRegions(poseResult, handResult, scan = 0) {
  // Separate hands must not turn a close-up into another nearly full-frame view.
  const hands = (handResult.landmarks || []).filter(hand => hand.some(visiblePoint));
  const wrists = [poseResult.landmarks?.[0]?.[15], poseResult.landmarks?.[0]?.[16]].filter(visiblePoint);
  const targets = hands.length ? hands : wrists.map(point => [point]);
  const regions = targets.map(hand => phoneSearchRegion({ landmarks: [] }, { landmarks: [hand] }));
  // Sweep overlapping quadrants when fewer than two hands are visible.
  const corner = scan % 4;
  const sweep = { x: corner % 2 ? .4 : 0, y: corner >= 2 ? .4 : 0, width: .6, height: .6 };
  return regions.length > 1 ? regions.slice(0, 2) :
    [regions[0] || phoneSearchRegion(poseResult, handResult), sweep];
}
export async function createCameraInference(vision, cocoSsd, tf, canvas, { light = false, identityFactory, onPhoneObservation, phoneRedesign = true, earlyFace = false, onStartupError, onModelsReady } = {}) {
  const resources = [];
  let closed=false;
  const retain=model=>{
    if(closed)(model.close||model.dispose).call(model);
    else resources.push(model);
    return model;
  };
  try {
    const options = path => ({ ...(canvas ? { canvas } : {}), baseOptions: { modelAssetPath: `${MODEL_ROOT}/${path}`, delegate: 'CPU' }, runningMode: 'VIDEO' });
    const loadFace = async () => {
      const files = await vision.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`);
      const face = await vision.FaceLandmarker.createFromOptions(files, {
        ...options('face_landmarker/face_landmarker/float16/1/face_landmarker.task'), numFaces: 2,
        minFaceDetectionConfidence: .25, minFacePresenceConfidence: .25, minTrackingConfidence: .25,
        outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false,
      });
      retain(face);
      return {files,face};
    };
    const faceReady=loadFace();
    const loadVision = async () => {
      const {files,face}=await faceReady;
      const pose = await vision.PoseLandmarker.createFromOptions(files, {
        ...options('pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'), numPoses: 1,
      });
      retain(pose);
      const hand = await vision.HandLandmarker.createFromOptions(files, {
        ...options('hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'), numHands: 2,
      });
      retain(hand);
      return {files,face,pose,hand};
    };
    const tfReady = (async () => {
      let accelerated = false;
      if (tf.wasm) {
        try { accelerated = await tf.setBackend('wasm'); } catch { /* Worker-only CPU fallback. */ }
      }
      if (!accelerated) await tf.setBackend('cpu');
      await tf.ready();
    })();
    const visionReady=loadVision();
    const objectsReady=tfReady.then(async () => {
        const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        return retain(model);
      });
    const identityReady=tfReady.then(async () => {
        const guard = identityFactory ? await identityFactory() : null;
        return guard?retain(guard):null;
      });
    const allReady=Promise.allSettled([visionReady,objectsReady,identityReady]);
    let files,face,pose,hand,objects,identity,modelsReady=false;
    if(earlyFace){
      [{files,face},identity]=await Promise.all([faceReady,identityReady]);
      void allReady.then(loaded=>{
        const failed=loaded.find(result=>result.status==='rejected');
        if(failed){if(!closed)onStartupError?.(failed.reason);return;}
        if(closed)return;
        ({pose,hand}=loaded[0].value);objects=loaded[1].value;modelsReady=true;onModelsReady?.();
      });
    }else{
    const loaded = await allReady;
    // Let every loader register its resources before handling a failed startup.
    const failed = loaded.find(result=>result.status==='rejected');
    if(failed)throw failed.reason;
    ({files,face,pose,hand}=loaded[0].value);objects=loaded[1].value;identity=loaded[2].value;modelsReady=true;
    }
    const input = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(640, 480) : document.createElement('canvas');
    const context = input.getContext('2d', { willReadFrequently: true });
    let cachedObjects = [], objectTime = -Infinity, observedAt=-Infinity, observationId=0, deliveredId=0, phoneScan=0;
    let phoneTracker=createPhoneTracker(), phoneScheduler=createPhoneScheduler(), phoneEpoch=null, latestPhone=null,phoneLagCount=0;
    let objectPending=null,objectWidth=1,objectHeight=1,poseTime=-Infinity,handTime=-Infinity,poseResult={landmarks:[]},handResult={landmarks:[]};
    const modelMs={face:0,pose:0,hand:0,objects:0};
    const studyMotion = createStudyMotionTracker();
    const faceContinuity = createFaceContinuity();
    const faceInput = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(512, 512) : document.createElement('canvas');
    faceInput.width = faceInput.height = 512;
    const faceContext = faceInput.getContext('2d');
    let closeup = null, lastBounds = null, lastFaceTime = -Infinity, scan = 0;
    let frameWidth,frameHeight,scope=0;
    return {
      resetFaceVerification(){identity?.resetVerification?.();},
      discardPendingFaceSample(){identity?.discardPendingSample?.();},
      confirmFaceCapture(){return identity?.confirmCapture?.()||false;},
      async detect(source, time, epoch = 0, timing) {
        const startedAt = performance.now();
        const startedOnCaptureClock=timing?.now?.();
        const width = source.videoWidth || source.width, height = source.videoHeight || source.height;
        if(phoneEpoch!==epoch||frameWidth!==width||frameHeight!==height){
          if(scope)identity?.discardPendingSample?.();
          scope++;frameWidth=width;frameHeight=height;phoneEpoch=epoch;
          phoneTracker=createPhoneTracker();phoneScheduler=createPhoneScheduler();
          latestPhone=null;phoneLagCount=0;cachedObjects=[];observedAt=objectTime=-Infinity;phoneScan=0;
          poseTime=handTime=lastFaceTime=-Infinity;poseResult={landmarks:[]};handResult={landmarks:[]};
          lastBounds=null;scan=0;studyMotion.reset();faceContinuity.reset();
        }
        const frameScope=scope;
        const currentScope=()=>!closed&&scope===frameScope&&(timing?.isCurrent?.()??true);
        let began=performance.now();
        let faceResult = face.detectForVideo(source, time);
        const fullFaceMs = performance.now() - began;
        const bounds = faceBounds(faceResult), count = faceResult.faceLandmarks?.length || 0;
        const needsFaceSearch=count<2&&(!bounds||Math.max(bounds.width*width,bounds.height*height)<Math.min(width,height)*.22);
        // The normal face search relies on body pose. Wait for it when needed.
        if(needsFaceSearch&&!pose){const loaded=await visionReady;pose=loaded.pose;}
        // Body pose is needed for face search, but not for a clearly visible enrollment face.
        if(pose&&time-poseTime>=400&&(!identity?.enrolling||needsFaceSearch)){began=performance.now();poseResult=pose.detectForVideo(source,time);poseTime=time;modelMs.pose=performance.now()-began;}
        const faceStarted = performance.now();
        if (needsFaceSearch) {
          if (!closeup) {
            closeup = await vision.FaceLandmarker.createFromOptions(files, {
              ...options('face_landmarker/face_landmarker/float16/1/face_landmarker.task'), runningMode: 'IMAGE', numFaces: 2,
              minFaceDetectionConfidence: .25, minFacePresenceConfidence: .25,
              outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false,
            });
            resources.push(closeup);
          }
          if(!currentScope())return null;
          const previous = time >= lastFaceTime && time - lastFaceTime < 1200 ? lastBounds : null;
          const attempt = scan++;
          const region = faceSearchRegion(bounds || previous, attempt % 3 === 2 ? {} : poseResult, width, height, Math.floor(attempt / 3));
          faceContext.drawImage(source, region.x * width, region.y * height, region.width * width, region.height * height, 0, 0, 512, 512);
          const zoomed = restoreFaceCoordinates(closeup.detect(faceInput), region);
          if (zoomed.faceLandmarks.length > 1 || (zoomed.faceLandmarks.length === 1 && (!bounds || sameFace(bounds, faceBounds(zoomed))))) faceResult = zoomed;
        }
        modelMs.face = fullFaceMs + performance.now() - faceStarted;
        if (faceResult.faceLandmarks?.length === 1) { lastBounds = faceBounds(faceResult); lastFaceTime = time; }
        const identityState=identity?await identity.check(source,faceResult,time):null;
        if(!currentScope())return null;
        if(!modelsReady){
          return {type:'result',time,scope:frameScope,signals:{reliable:false,face:false,identity:identityState},backend:tf.getBackend(),mode:light?'light':'standard',inferenceMs:performance.now()-startedAt,landmarks:null};
        }
        if(Number.isInteger(identityState?.faceIndex)){
          const index=identityState.faceIndex;
          faceResult={...faceResult,faceLandmarks:[faceResult.faceLandmarks[index]],faceBlendshapes:[faceResult.faceBlendshapes?.[index]]};
        }
        const scanning=identityState?.enrolled===false;
        if(!scanning&&time-handTime>=400){began=performance.now();handResult=hand.detectForVideo(source,time);handTime=time;modelMs.hand=performance.now()-began;}
        // ImageData is supported by TF.js fromPixels in workers and the main thread.
        if (!scanning && phoneRedesign && !objectPending) {
          const region=phoneScheduler.next(width,height,time,phoneTracker.targets(time),phoneSearchRegions(poseResult,handResult));
          const scale=Math.min(1,640/Math.max(region.width*width,region.height*height));
          const cropWidth=Math.max(1,Math.round(region.width*width*scale)),cropHeight=Math.max(1,Math.round(region.height*height*scale));
          input.width=cropWidth;input.height=cropHeight;
          context.drawImage(source,region.x*width,region.y*height,region.width*width,region.height*height,0,0,cropWidth,cropHeight);
          const pixels=context.getImageData(0,0,cropWidth,cropHeight),objectStarted=performance.now();
          const palms=(handTime===time?handResult.landmarks||[]:[]).map(hand=>[0,1,2,5,9,13,17].map(i=>hand[i]).filter(finitePoint)).filter(points=>points.length>=5).map(points=>{
            const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
            return [x,y,Math.max(...xs)-x,Math.max(...ys)-y];
          });
          const publish=(found,status)=>{
            if(!currentScope())return;
            const completedAt=timing?.now?.()??time+performance.now()-startedAt;
            const candidates=found.filter(o=>o.class==='cell phone').map(o=>{
              const box=[region.x+o.bbox[0]/cropWidth*region.width,region.y+o.bbox[1]/cropHeight*region.height,o.bbox[2]/cropWidth*region.width,o.bbox[3]/cropHeight*region.height];
              const palmOverlap=Math.max(0,...palms.map(p=>Math.max(0,Math.min(box[0]+box[2],p[0]+p[2])-Math.max(box[0],p[0]))*Math.max(0,Math.min(box[1]+box[3],p[1]+p[3])-Math.max(box[1],p[1]))/Math.max(.000001,box[2]*box[3])));
              return {...phoneCandidateEvidence(pixels,o,{palmOverlap}),box};
            });
            latestPhone={version:2,id:++observationId,frameId:time,observedAt:time,completedAt,region,candidates,status,epoch,scope:frameScope};
            phoneTracker.observe(latestPhone,completedAt);
            phoneLagCount=completedAt-time>PHONE_LIMITS.maxAge?phoneLagCount+1:0;
            if(status==='ok'){
              cachedObjects=found.map(o=>({...o,bbox:[(region.x+o.bbox[0]/cropWidth*region.width)*width,(region.y+o.bbox[1]/cropHeight*region.height)*height,o.bbox[2]/cropWidth*region.width*width,o.bbox[3]/cropHeight*region.height*height]}));
              objectWidth=width;objectHeight=height;observedAt=time;
            }else {cachedObjects=[];observedAt=-Infinity;}
            onPhoneObservation?.({type:'phone-observation',observation:latestPhone,epoch,scope:frameScope,diagnostics:phoneTracker.diagnostics(),state:phoneTracker.state(completedAt),search:phoneScheduler.diagnostics(),slow:!light&&phoneLagCount>=2});
          };
          objectPending=new Promise(resolve=>setTimeout(resolve,0)).then(async()=>{
            if(!currentScope())return;
            try {publish(await objects.detect(pixels,30,PHONE_LIMITS.seed),'ok');}catch {publish([],'error');}
          }).finally(()=>{modelMs.objects=performance.now()-objectStarted;objectPending=null;});
        } else if (!scanning && !phoneRedesign && !objectPending && time - objectTime >= 800) {
          objectTime=time;
          const objectScale = Math.min(1, 640 / Math.max(width, height));
          const fullWidth = Math.max(1, Math.round(width * objectScale)), fullHeight = Math.max(1, Math.round(height * objectScale));
          input.width = fullWidth; input.height = fullHeight;
          context.drawImage(source, 0, 0, fullWidth, fullHeight);
          const full=context.getImageData(0,0,fullWidth,fullHeight);
          const crops=phoneSearchRegions(poseResult,handResult,phoneScan++).map(region=>{
            const scale=Math.min(1,640/Math.max(region.width*width,region.height*height));
            const cropWidth=Math.max(1,Math.round(region.width*width*scale)),cropHeight=Math.max(1,Math.round(region.height*height*scale));
            input.width=cropWidth;input.height=cropHeight;
            context.drawImage(source,region.x*width,region.y*height,region.width*width,region.height*height,0,0,cropWidth,cropHeight);
            return {region,cropWidth,cropHeight,pixels:context.getImageData(0,0,cropWidth,cropHeight)};
          }),objectStarted=performance.now();
          // Copy pixels before returning: the worker may close the input bitmap.
          // A new task lets the Worker post this face result before TF CPU work.
          objectPending=new Promise(resolve=>setTimeout(resolve,0)).then(async()=>{
            if(!currentScope())return;
            let found=(await objects.detect(full,30,.2)).map(o=>({...o,bbox:[o.bbox[0]*width/fullWidth,o.bbox[1]*height/fullHeight,o.bbox[2]*width/fullWidth,o.bbox[3]*height/fullHeight]}));
            for(const {region,cropWidth,cropHeight,pixels} of crops) {
              if(!currentScope() || extractFocusSignals(faceResult,poseResult,handResult,found,width,height).phoneUse)break;
              const zoomed=await objects.detect(pixels,30,.2);
              found=found.concat(zoomed.filter(o=>o.class==='cell phone').map(o=>({...o,bbox:[region.x*width+o.bbox[0]*region.width*width/cropWidth,region.y*height+o.bbox[1]*region.height*height/cropHeight,o.bbox[2]*region.width*width/cropWidth,o.bbox[3]*region.height*height/cropHeight]})));
            }
            if(currentScope()){cachedObjects=found;objectWidth=width;objectHeight=height;observedAt=time;observationId++;}
          }).catch(()=>{if(currentScope()){cachedObjects=[];observedAt=-Infinity;observationId++;}}).finally(()=>{modelMs.objects=performance.now()-objectStarted;objectPending=null;});
        }
        const ageMs=time-observedAt;
        const currentObjects=ageMs<=1500?cachedObjects.map(o=>({...o,bbox:[o.bbox[0]*width/objectWidth,o.bbox[1]*height/objectHeight,o.bbox[2]*width/objectWidth,o.bbox[3]*height/objectHeight]})):[];
        const signals = extractFocusSignals(faceResult, poseResult, handResult, currentObjects, width, height);
        if(identityState)signals.identity=identityState;
        signals.phoneObservation=phoneRedesign ? latestPhone : {id:observationId,observedAt,ageMs,fresh:observationId!==deliveredId,positive:signals.phoneUse,confidence:signals.phoneEvidence.score};
        if(phoneRedesign)signals.phonePolicy='tracked';
        deliveredId=observationId;
        signals.studyActivity = studyMotion.update(signals.studyContext, signals.studyPoints, time);
        delete signals.studyPoints;
        signals.coordinateScope=frameScope;
        return { type: 'result', time, scope:frameScope, signals, backend: tf.getBackend(), mode: light ? 'light' : 'standard', inferenceMs: performance.now()-startedAt,
          queueMs:startedOnCaptureClock===undefined?undefined:startedOnCaptureClock-time,workerReceivedAt:timing?.receivedAt,
          modelMs:{...modelMs},objectAgeMs:ageMs,landmarks: faceContinuity.update(faceResult,time) };
      },
      close() { closed=true;const dispose=()=>{for(const model of resources)(model.close||model.dispose).call(model);};if(objectPending)void objectPending.finally(dispose);else dispose(); },
    };
  } catch (error) {
    closed=true;
    for (const model of resources) (model.close || model.dispose).call(model);
    throw error;
  }
}
