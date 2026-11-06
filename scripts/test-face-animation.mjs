import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep,join} from 'node:path';
import {homedir} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {chromium}=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js'))('playwright');
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/'){
      res.setHeader('Content-Type','text/html');
      res.end('<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/face-enrollment.css"></head><body><dialog class="face-enrollment"><h2>얼굴 등록</h2><p>정면 확인 → 고개 움직이기 → 등록 완료</p><div class="face-preview"><div class="face-scan-center"><div class="face-scan-symbol">☺</div><p class="face-scan-live">움직임을 확인하고 있어요</p><strong class="face-scan-percent">56%</strong><p class="face-scan-count">10 / 18 각도 수집</p></div><div class="face-ring"></div></div><p>렌더링 검증 · 합성 방향 입력</p></dialog></body></html>');return;
    }
    const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep))throw Error('path');
    res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':'text/plain');res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
  const local=`http://127.0.0.1:${server.address().port}`;
  const publicProbe=process.env.STUDY_FACE_ANIMATION_PUBLIC==='1';
  if(publicProbe)await page.route('https://study.junhyuk.site/__face-animation-probe',async route=>{
    await route.fulfill({contentType:'text/html; charset=utf-8',body:await (await fetch(local)).text()});
  });
  await page.goto(publicProbe?'https://study.junhyuk.site/__face-animation-probe':local);
  const result=await page.evaluate(async()=>{
    const {updateScanRing,stopScanRing}=await import('/face-scan-guide.js');
    document.querySelector('dialog').showModal();const ring=document.querySelector('.face-ring');
    updateScanRing(ring,{coverage:[2,2,2,1,1,1,1,0]});
    if(ring.querySelectorAll('ellipse').length)throw Error('Inner ellipses must be removed');
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const red=ring.querySelector('[data-face-missing-sector="7"]');
    const opacity=()=>Number(getComputedStyle(red).strokeOpacity);
    const initialOpacity=opacity();
    updateScanRing(ring,{coverage:[2,2,2,1,1,1,1,1]});
    await new Promise(resolve=>setTimeout(resolve,180));const halfwayOpacity=opacity();
    updateScanRing(ring,{coverage:[2,2,2,1,1,1,1,2]});
    await new Promise(resolve=>setTimeout(resolve,180));const fadingOpacity=opacity();
    await new Promise(resolve=>setTimeout(resolve,850));const finalOpacity=opacity();
    if(!(initialOpacity>.8&&halfwayOpacity<initialOpacity&&halfwayOpacity>.45&&fadingOpacity>0&&fadingOpacity<halfwayOpacity&&finalOpacity===0))throw Error('Red ticks must fade gradually: '+JSON.stringify({initialOpacity,halfwayOpacity,fadingOpacity,finalOpacity}));
    const gaps=[];let previous=0,lastTransform='',changedFrames=0,frames=0,observations=0;
    const began=performance.now(),duration=3200;
    const feed=setInterval(()=>{const angle=(performance.now()-began)/650;observations++;updateScanRing(ring,{orientation:{x:Math.cos(angle),y:Math.sin(angle)}});},100);
    await new Promise(resolve=>{
      function measure(time){
        if(previous)gaps.push(time-previous);previous=time;frames++;
        const lines=ring.querySelectorAll('line');
        const transform=[0,16,32,48].map(i=>`${lines[i].getAttribute('x2')},${lines[i].getAttribute('y2')}`).join(';');
        if(transform!==lastTransform){changedFrames++;lastTransform=transform;}
        if(performance.now()-began<duration)requestAnimationFrame(measure);else resolve();
      }
      requestAnimationFrame(measure);
    });
    clearInterval(feed);stopScanRing(ring);gaps.sort((a,b)=>a-b);
    return {cpuSlowdown:6,observations,frames,changedFrames,seconds:(performance.now()-began)/1000,p95FrameMs:gaps[Math.floor(gaps.length*.95)],maxFrameMs:gaps.at(-1),ellipses:0,fade:{initialOpacity,halfwayOpacity,fadingOpacity,finalOpacity}};
  });
  result.visualFps=Number((result.changedFrames/result.seconds).toFixed(1));
  result.publicAssets=publicProbe;
  assert.ok(result.visualFps>=35,JSON.stringify(result));
  assert.ok(result.changedFrames>result.observations*3,'visual motion continues between detector results');
  assert.ok(result.p95FrameMs<60,JSON.stringify(result));
  await page.screenshot({path:join(root,'.codex-face-smooth-preview.png')});
  console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
