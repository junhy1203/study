// Test-only synthetic camera/model. Storage, crypto and RPC use production modules.
import {createLocalFaceGuard} from '/camera-identity.js';
import {syntheticFace} from '/tests/scan-fixtures.mjs';
let guard,source,face,sequence=0;
const requests=new Map();
const rpc=(action,data)=>new Promise((resolve,reject)=>{const id=++sequence;requests.set(id,{resolve,reject});postMessage({type:'rpc',id,action,data});});
self.onmessage=async({data})=>{
  if(data.type==='reply'){const item=requests.get(data.id);requests.delete(data.id);if(data.error)item.reject(Error(data.error));else item.resolve(data.result);return;}
  try{
    if(data.type==='init'){
      source=new OffscreenCanvas(640,480);const context=source.getContext('2d');context.fillStyle='#998877';context.fillRect(0,0,640,480);context.fillStyle='#302820';context.fillRect(270,150,25,15);context.fillRect(345,150,25,15);context.fillRect(290,220,60,15);
      face=syntheticFace();
      const vector=Array.from({length:1024},(_,i)=>i===0?1:0),tensor={toFloat(){return this;},expandDims(){return this;},dispose(){}};
      const tf={loadGraphModel:async()=>({execute:()=>({data:async()=>vector,dispose(){}}),dispose(){}}),tidy:fn=>fn(),browser:{fromPixels:()=>tensor}};
      guard=await createLocalFaceGuard(tf,data.context,rpc,event=>postMessage({type:'event',event},event.bitmap?[event.bitmap]:[]));postMessage({type:'ready'});
    }else if(data.type==='confirm')guard.confirmCapture();
    else if(data.type==='frame'){
      if(data.pose){face[1].x=.5+data.pose.yaw*.125;face[1].y=198.4/480-data.pose.pitch*.08;face[152].z=180/640*Math.tan(data.pose.pitch);}
      postMessage({type:'frame-result',id:data.id,result:await guard.check(source,{faceLandmarks:[face]},data.time)});
    }
  }catch(error){postMessage({type:'error',message:error.message});}
};
