// Classic worker required by MediaPipe's WASM loader.
let detector, preparation, supplyFaceSecurity;
let frameWork=Promise.resolve(),newestEpoch=-Infinity;
const faceRequests=new Map();let faceSequence=0;
function faceRPC(action,data){return new Promise((resolve,reject)=>{const id=++faceSequence;const timeout=setTimeout(()=>{faceRequests.delete(id);reject(new Error('얼굴 보안 서버 응답이 없습니다.'));},30000);faceRequests.set(id,{resolve,reject,timeout});self.postMessage({type:'face-rpc',id,action,data});});}
async function prepareInference({light,phoneRedesign,poseOnly}, faceSecurity) {
  importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
  // WASM SIMD accelerates COCO without sharing the UI thread. Registration can fail independently.
  try {
    importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/tf-backend-wasm.js');
    self.tf.wasm.setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/');
  } catch { /* CPU remains available inside this worker. */ }
  const identityModules=poseOnly?null:Promise.all([
    import('./camera-identity.js?v=20261109-pitch1'),
    import('./face-descriptor-client.js?v=20261105-lag1'),
  ]);
  const [vision,{createCameraInference},{createStudyObjectDetector},identity] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs'),
    import('./camera-inference.js?v=20261109-owner1'),
    import('./camera-objects.js?v=20261024-11'),
    identityModules,
  ]);
  const notify=message=>self.postMessage(message);
  return createCameraInference(vision, {load:options=>createStudyObjectDetector(self.tf,options)}, self.tf, undefined,
    { light, phoneRedesign:phoneRedesign!==false, onPhoneObservation:notify, earlyFace:true,
      onModelsReady:()=>notify({type:'models-ready'}),
      onStartupError:error=>notify({type:'error',stage:'init',message:String(error?.message||error)}),
      identityFactory:identity?async()=>{
        const [{createLocalFaceGuard},{createIsolatedFaceDescriber}]=identity;
        return createLocalFaceGuard(self.tf,await faceSecurity,faceRPC,notify,{describerFactory:createIsolatedFaceDescriber});
      }:undefined });
}
self.onmessage = async ({ data }) => {
  if(data.type==='face-verification-reset'){detector?.resetFaceVerification?.();return;}
  if(data.type==='face-capture'){detector?.confirmFaceCapture();return;}
  if(data.type==='face-rpc-result'){const pending=faceRequests.get(data.id);if(pending){clearTimeout(pending.timeout);faceRequests.delete(data.id);if(data.error)pending.reject(new Error(data.error));else pending.resolve(data.result);}return;}
  try {
    if (data.type === 'prepare') {
      const faceSecurity=new Promise(resolve=>{supplyFaceSecurity=resolve;});
      preparation=prepareInference(data,faceSecurity);
      // Report preparation errors through init once the main thread attaches the session.
      void preparation.catch(()=>{});
    } else if (data.type === 'init') {
      supplyFaceSecurity?.(data.faceSecurity);
      detector = await (preparation ?? prepareInference(data,data.faceSecurity));
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      const now=Number.isFinite(data.clockOrigin)?()=>performance.now()+(performance.timeOrigin-data.clockOrigin):null;
      const epoch=data.epoch??0;
      if(epoch>newestEpoch&&Number.isFinite(newestEpoch))detector?.discardPendingFaceSample?.();
      newestEpoch=Math.max(newestEpoch,epoch);
      const timing={now,receivedAt:now?.(),isCurrent:()=>epoch===newestEpoch};
      // A new epoch can arrive while the previous frame is awaiting a model.
      // Keep stateful inference and its scratch canvases single-owner.
      const previous=frameWork;
      let finish;
      frameWork=new Promise(resolve=>{finish=resolve;});
      try {
        await previous;
        if(epoch!==newestEpoch)return;
        const result=await detector.detect(data.bitmap,data.time,epoch,timing);
        if(result&&epoch===newestEpoch)self.postMessage({...result,epoch});
      } finally { finish();data.bitmap.close(); }
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error?.message || error), stage: data.type, epoch: data.epoch }); }
};
