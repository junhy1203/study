// Exercise the real controller + video capture + Worker + models. Only account
// services and physical camera are replaced; no user profile or video is saved.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep,join} from 'node:path';
import {homedir} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const baseline=process.env.STUDY_FACE_ANGLE_BASELINE==='1';
const publicProbe=process.env.STUDY_FACE_ANGLE_PUBLIC==='1';
const {chromium}=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js'))('playwright');
const sessionStub=`
export async function prepareFaceSession(){return {ticket:{id:'probe'}};}
export function faceWorkerContext(){return {uid:'public-photo-probe',ticket:{id:'no-save',binding:{schemaVersion:5}}};}
export function waitForFaceSessionReady(){return new Promise(()=>{});}
export async function waitForFaceVerification(){return false;}
export function attachFacePreview(){}
export function lockFaceSession(){}
export function handleFaceWorkerRPC(){throw Error('No storage/provider call allowed');}
export function handleFaceWorkerEvent(event){
  if(event.type==='face-scan-direction')window.angleObservations.push({at:performance.now(),age:performance.now()-event.frameTime,x:event.orientation?.x});
}
`;
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><head><style>.cam-analysis-video{position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none}</style></head><body>Real angle pipeline probe</body></html>');return;}
    if(path==='/face-session.js'){res.setHeader('Content-Type','text/javascript');res.end(sessionStub);return;}
    if(baseline&&path==='/camera.js'){
      res.setHeader('Content-Type','text/javascript');
      res.end(await readFile(process.env.STUDY_FACE_ANGLE_BASELINE_SOURCE||resolve(root,'.codex-face-angle-deploy-backup/camera.js')));return;
    }
    const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep))throw Error('path');
    res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':'text/plain');res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage();
  const local=`http://127.0.0.1:${server.address().port}`;
  if(publicProbe){
    assert.equal(baseline,false);
    await page.route('https://study.junhyuk.site/__face-angle-controller-probe',async route=>{
      await route.fulfill({contentType:'text/html; charset=utf-8',body:await (await fetch(local)).text()});
    });
    await page.route('https://study.junhyuk.site/face-session.js*',route=>route.fulfill({contentType:'text/javascript',body:sessionStub}));
  }
  await page.goto(publicProbe?'https://study.junhyuk.site/__face-angle-controller-probe':local);
  const result=await page.evaluate(async()=>{
    window.angleObservations=[];
    const photo=new Image();photo.crossOrigin='anonymous';photo.src='https://storage.googleapis.com/mediapipe-assets/portrait.jpg';await photo.decode();
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=720;
    const context=canvas.getContext('2d'),scale=Math.min(960/photo.naturalWidth,720/photo.naturalHeight);
    let drawSequence=0,drawTimer,settings;
    const draw=()=>{context.fillStyle='#999';context.fillRect(0,0,960,720);context.drawImage(photo,(960-photo.naturalWidth*scale)/2+Math.sin(drawSequence++/4)*3,0,photo.naturalWidth*scale,photo.naturalHeight*scale);};
    draw();
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async options=>{
      settings=options.video;const fps=settings.frameRate.ideal;
      const stream=canvas.captureStream(fps);drawTimer=setInterval(draw,1000/fps);return stream;
    }});
    const camera=await import('/camera.js');void camera.startCamera({registrationOnly:true});
    const deadline=performance.now()+60000;
    while(window.angleObservations.length<5&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    if(window.angleObservations.length<5){camera.stopCamera();clearInterval(drawTimer);throw Error('No angle observations: '+JSON.stringify(camera.cameraState()));}
    const start=performance.now(),startCount=window.angleObservations.length;
    await new Promise(resolve=>setTimeout(resolve,5000));
    const phase=camera.cameraState().identityPhase,elapsed=performance.now()-start;
    const observations=window.angleObservations.slice(startCount);camera.stopCamera();clearInterval(drawTimer);
    const gaps=observations.slice(1).map((v,i)=>v.at-observations[i].at).sort((a,b)=>a-b);
    const ages=observations.map(v=>v.age).sort((a,b)=>a-b);
    return {phase,observations:observations.length,rawAngleFps:observations.length*1000/elapsed,p95GapMs:gaps[Math.floor(gaps.length*.95)],p95CaptureToAngleMs:ages[Math.floor(ages.length*.95)],camera:settings,videoFrameCallbacks:typeof HTMLVideoElement.prototype.requestVideoFrameCallback==='function'};
  });
  result.baseline=baseline;result.publicAssets=publicProbe;console.log(JSON.stringify(result));
  if(baseline){
    assert.equal(result.phase,'checking');assert.ok(result.rawAngleFps<4,JSON.stringify(result));
  }else{
    assert.equal(result.phase,'enrolling');
    assert.ok(result.rawAngleFps>=6,JSON.stringify(result));
    assert.ok(result.p95GapMs<300,JSON.stringify(result));
    assert.ok(result.p95CaptureToAngleMs<250,JSON.stringify(result));
  }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
