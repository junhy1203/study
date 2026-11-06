// Public reference photo only. No physical camera, provider authentication or storage writes.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep,join} from 'node:path';
import {homedir} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {chromium}=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js'))('playwright');
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<html><body style="background:#132536;color:white;text-align:center"><h1>RGB estimated 3D scan</h1><canvas width="224" height="224"></canvas></body></html>');return;}
    const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep))throw Error('path');res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':'text/plain');res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async(fast)=>{
    const photo=new Image();photo.crossOrigin='anonymous';photo.src='https://storage.googleapis.com/mediapipe-assets/portrait.jpg';await photo.decode();
    return new Promise((resolve,reject)=>{
      const worker=new Worker('/camera-worker.js?v=mesh-model-test'),context=document.querySelector('canvas').getContext('2d');let frames=0,meshFrames=0,directionFrames=0,lastLabel='',began=0;const latencies=[];
      const timer=setTimeout(()=>finish(Error('Model scan timeout: '+lastLabel)),120000);
      function finish(error,result){clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);}
      async function send(){const scale=Math.min(640/photo.naturalWidth,480/photo.naturalHeight),bitmap=await createImageBitmap(photo,{resizeWidth:Math.round(photo.naturalWidth*scale),resizeHeight:Math.round(photo.naturalHeight*scale)});worker.postMessage({type:'frame',bitmap,time:performance.now(),epoch:0},[bitmap]);}
      worker.onerror=e=>finish(Error(e.message));
      worker.onmessage=({data})=>{
        if(data.type==='error'||data.type==='face-rpc')return finish(Error(data.message||'Unexpected storage/provider call'));
        if(data.type==='face-progress')lastLabel=data.label||'';
        if(data.type==='face-scan-direction')directionFrames++;
        if(data.type==='face-scan-mesh'){meshFrames++;context.clearRect(0,0,224,224);context.drawImage(data.bitmap,0,0);data.bitmap.close();}
        if(data.type==='ready'){began=performance.now();void send().catch(error=>finish(error));}
        if(data.type==='result'){
          frames++;latencies.push(data.inferenceMs);if(frames<(fast?40:4))setTimeout(()=>void send().catch(error=>finish(error)),fast?Math.max(0,80-data.inferenceMs):600);
          else finish(null,{identity:data.signals.identity,face:data.signals.face,meshFrames,directionFrames,lastLabel,painted:context.getImageData(0,0,224,224).data.some((value,index)=>index%4===3&&value>0),inferenceMs:data.inferenceMs,trackingFps:frames*1000/(performance.now()-began),maxInferenceMs:Math.max(...latencies)});
        }
      };
      worker.postMessage({type:'init',light:true,phoneRedesign:true,faceSecurity:{uid:'public-reference-only',ticket:{id:'no-save-test',binding:{schemaVersion:5}}}});
    });
  },process.env.STUDY_FACE_TRACKING_PROBE==='1');
  assert.equal(result.face,true);assert.equal(result.meshFrames,0);assert.equal(result.painted,false);assert.ok(result.directionFrames>0);assert.ok(result.identity.progress>=2,JSON.stringify(result));assert.equal(result.identity.enrolled,false);
  await page.screenshot({path:resolve(root,'.codex-face-scan-real-model.png')});await writeFile(resolve(root,'.codex-face-scan-real-model.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
