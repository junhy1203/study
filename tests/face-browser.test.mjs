import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createFaceService,authorizeFaceStudy} from '../functions/face-service.js';
import {scanPoses} from './scan-fixtures.mjs';

const runtime=process.env.STUDY_PLAYWRIGHT_ROOT||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=createRequire(join(runtime,'x.js'))('playwright');
const origin='https://study.junhyuk.site',root=fileURLToPath(new URL('..',import.meta.url));

test('Chromium stores cloned CryptoKeys, seals in a Worker, survives process restart and locks on account change',async()=>{
  const rows=new Map(),envelopes=new Map();let tail=Promise.resolve(),authTime=Math.floor(Date.now()/1000),authCount=0;
  const snapshot=ref=>({exists:rows.has(ref.path),data:()=>structuredClone(rows.get(ref.path))});
  const db={doc:path=>({path,get:async()=>snapshot({path})}),runTransaction:fn=>{
    const result=tail.then(async()=>{const writes=new Map();const value=await fn({get:async ref=>snapshot(ref),set:(ref,data)=>writes.set(ref.path,structuredClone(data))});for(const [key,value]of writes)rows.set(key,value);return value;});tail=result.catch(()=>{});return result;
  }};
  const kms={async seal(value,aad){const id=Buffer.from(randomUUID()).toString('base64');envelopes.set(id,{value,aad});return id;},async open(id,aad){const item=envelopes.get(id);assert.equal(item?.aad,aad);return item.value;}};
  const service=createFaceService({db,kms,projectId:'demo-study'});
  const profile=await mkdtemp(join(tmpdir(),'study-face-browser-'));
  let context;
  let delaySeal=false,releaseSeal,onSeal,failCommitOnce=false,onCancel;
  const actionCounts=new Map();
  const failures=[];
  async function open(){
    context=await chromium.launchPersistentContext(profile,{headless:true,channel:process.env.STUDY_BROWSER_CHANNEL||'msedge',viewport:{width:390,height:844},reducedMotion:'reduce'});
    await context.exposeFunction('faceCall',async(action,data,uid)=>{
      actionCounts.set(action,(actionCounts.get(action)||0)+1);
      if(action==='sealFaceKeyEnvelope'&&delaySeal){delaySeal=false;await new Promise(resolve=>{releaseSeal=resolve;onSeal?.();});}
      if(action==='commitFaceEnrollment'&&failCommitOnce){failCommitOnce=false;throw Error('일시적 서버 저장 실패 테스트');}
      const result=await service(action,{auth:{uid,token:{email_verified:true,auth_time:authTime,firebase:{sign_in_provider:'google.com'}}},data});
      if(action==='cancelFaceEnrollment')onCancel?.();return result;
    });
    await context.exposeFunction('faceReauth',()=>{authTime=Math.floor(Date.now()/1000);authCount++;});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());assert.equal(url.origin,origin,'no real provider, camera image or remote model request is allowed in this harness');
      let body,type='text/javascript';
      if(url.pathname==='/'){
        type='text/html';body='<html lang="ko"><head><meta charset="utf-8"></head><body><button id="start">얼굴 확인 시작</button><script type="module">import * as api from "/face-session.js";window.api=api;window.testUid="owner";document.querySelector("#start").onclick=()=>{window.finished=false;window.pending=api.prepareFaceSession().then(()=>{window.finished=true;}).catch(error=>{window.error=error.message;});};window.loaded=true;</script></body></html>';
      }else if(url.pathname==='/auth.js')body='export const authReady=Promise.resolve(true);export const getAuthUser=()=>({uid:window.testUid,email:"test@example.invalid",providerData:[{providerId:"google.com"},{providerId:"password"}]});export async function reauthenticateFaceAccount(options){if("password" in options)throw Error("Password must not be requested");await window.faceReauth();}';
      // Model a browser retaining the pre-lighting modules at their old URLs.
      else if(url.pathname==='/functions/face-protocol.js'&&!url.search)body=(await readFile(resolve(root,'functions/face-protocol.js'),'utf8')).replace("'rgb224-light-estimated-mesh-scan-v1'","'eyes-aligned-rgb224-periocular-v2'").replace('FACE_SCHEMA = 5','FACE_SCHEMA = 3');
      else if(url.pathname==='/face-crypto.js'&&!url.search)body=(await readFile(resolve(root,'face-crypto.js'),'utf8')).replace(/\.\/functions\/face-protocol.js\?v=[^']+/, './functions/face-protocol.js');
      else if(url.pathname==='/server-client.js')body='export const serverCallable=name=>async data=>({data:await window.faceCall(name,data,window.testUid)});';
      else if(url.pathname==='/__face-worker.js')body=`let pending=new Map(),seq=0;const rpc=(action,data)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});postMessage({type:'rpc',id,action,data});});onmessage=async({data})=>{if(data.type==='reply'){const item=pending.get(data.id);pending.delete(data.id);if(data.error)item.reject(Error(data.error));else item.resolve(data.result);return;}try{if(data.failStorage){const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=original.apply(this,args);if(this.name==='profiles')request.addEventListener('success',()=>this.transaction.abort());return request;};}const {createFaceVault}=await import('/face-vault.js');const {sampleScanProfile}=await import('/tests/scan-fixtures.mjs');const vault=createFaceVault(data.context,rpc,event=>postMessage({type:'event',event}));let samples=await vault.load();if(!samples){const vector=Array(2048).fill(0);vector[0]=vector[1024]=Math.SQRT1_2;samples=await vault.save(sampleScanProfile(vector));}postMessage({type:'done',valid:samples.kind==='rgb-estimated-mesh-v1'&&samples.samples.length===18&&samples.samples.every(row=>row.length===2048&&Math.abs(row[0]-Math.SQRT1_2)<.00001&&Math.abs(row[1024]-Math.SQRT1_2)<.00001)});vault.close();}catch(error){postMessage({type:'error',message:error.message});}};`;
      else if(url.pathname==='/__face-manual-worker.js')body=await readFile(resolve(root,'tests/fixtures/face-manual-worker.js'));
      else{const path=resolve(root,decodeURIComponent(url.pathname.slice(1)));assert.ok(path.startsWith(root));body=await readFile(path);if(extname(path)==='.css')type='text/css';}
      await route.fulfill({status:200,contentType:type,body});
    });
    const page=context.pages()[0];page.on('pageerror',error=>failures.push(error.message));await page.goto(origin);await page.waitForFunction(()=>window.loaded);return page;
  }
  async function runVault(page,failStorage=false){
    await page.evaluate(()=>{window.vaultDone=null;window.vaultError=undefined;const worker=new Worker('/__face-worker.js');window.testWorker=worker;worker.onmessage=async({data})=>{if(data.type==='rpc'){try{const result=await window.api.handleFaceWorkerRPC(data.action,data.data);worker.postMessage({type:'reply',id:data.id,result});}catch(error){worker.postMessage({type:'reply',id:data.id,error:error.message});}}else if(data.type==='event')window.api.handleFaceWorkerEvent(data.event);else if(data.type==='done'){window.vaultDone=data.valid;window.api.handleFaceWorkerEvent({type:'face-verified'});worker.terminate();}else if(data.type==='error')window.vaultError=data.message;};worker.postMessage({context:window.api.faceWorkerContext(),failStorage:window.failStorage===true});});
    await page.waitForFunction(()=>window.vaultDone!==null||window.vaultError);if(failStorage){assert.match(await page.evaluate(()=>window.vaultError),/저장/);assert.notEqual(await page.evaluate(()=>window.vaultDone),true);return;}assert.equal(await page.evaluate(()=>window.vaultError),undefined);assert.equal(await page.evaluate(()=>window.vaultDone),true);
  }
  async function runManualEnrollment(page){
    await page.evaluate(()=>{
      window.guardReady=false;window.guardError=null;window.guardReply=null;
      const worker=new Worker('/__face-manual-worker.js',{type:'module'});window.guardWorker=worker;
      window.confirmCapture=()=>worker.postMessage({type:'confirm'});window.addEventListener('study:face-capture',window.confirmCapture);
      worker.onmessage=async({data})=>{
        if(data.type==='rpc'){try{const result=await window.api.handleFaceWorkerRPC(data.action,data.data);worker.postMessage({type:'reply',id:data.id,result});}catch(error){worker.postMessage({type:'reply',id:data.id,error:error.message});}}
        else if(data.type==='event')window.api.handleFaceWorkerEvent(data.event);
        else if(data.type==='ready')window.guardReady=true;
        else if(data.type==='frame-result')window.guardReply=data.result;
        else if(data.type==='error')window.guardError=data.message;
      };
      worker.postMessage({type:'init',context:window.api.faceWorkerContext()});
    });
    await page.waitForFunction(()=>window.guardReady||window.guardError);assert.equal(await page.evaluate(()=>window.guardError),null);
    let time=0;
    const frame=async(jump=700,pose=null)=>{
      time+=jump;await page.evaluate(({time,pose})=>{window.guardReply=null;window.guardWorker.postMessage({type:'frame',time,pose});},{time,pose});
      await page.waitForFunction(()=>window.guardReply||window.guardError,{},{timeout:2000});assert.equal(await page.evaluate(()=>window.guardError),null);
      return page.evaluate(()=>window.guardReply);
    };
    assert.equal(await page.locator('[role=progressbar]').getAttribute('aria-valuenow'),'0');
    assert.equal(await page.getByRole('button',{name:'자세 확인 · 촬영',exact:true}).isVisible(),false);
    assert.equal(await page.locator('.face-arrow-align').count(),1);
    assert.ok(await page.locator('.face-scan-symbol').evaluate(node=>node.getBoundingClientRect().width)>=88);
    await page.screenshot({path:resolve(root,'.codex-face-alignment-arrow.png')});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const midway=await page.evaluate(async()=>{
      const node=document.querySelector('.face-arrow-single');
      getComputedStyle(node).transform;
      window.api.handleFaceWorkerEvent({type:'face-scan-direction',orientation:null,alignment:{x:.3,y:0}});
      await new Promise(resolve=>setTimeout(resolve,50));
      const style=getComputedStyle(node),m=new DOMMatrix(style.transform);
      return {angle:Math.atan2(m.b,m.a)*180/Math.PI,duration:style.transitionDuration,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
    });
    assert.equal(await page.locator('.face-scan-symbol').getAttribute('data-mode'),'direction');
    assert.equal(await page.locator('.face-arrow-single').evaluate(node=>node.style.transform),'rotate(90deg)');
    assert.ok(midway.angle>0&&midway.angle<90,`arrow must rotate through intermediate angles: ${JSON.stringify(midway)}`);
    await page.waitForTimeout(270);
    assert.match(await page.locator('[data-face-scan-live]').textContent(),/오른쪽/);
    await page.evaluate(()=>window.api.handleFaceWorkerEvent({type:'face-scan-direction',orientation:null,alignment:{x:.03,y:.3}}));
    await page.evaluate(()=>window.api.handleFaceWorkerEvent({type:'face-scan-direction',orientation:null,alignment:{x:-.03,y:.3}}));
    const wrapped=await page.locator('.face-arrow-single').evaluate(node=>parseFloat(node.style.transform.slice(7)));
    assert.ok(wrapped>180&&wrapped<200,'crossing the bottom direction continues the short rotation');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>window.api.handleFaceWorkerEvent({type:'face-scan-direction',orientation:null,alignment:{x:0,y:0}}));
    assert.equal(await page.locator('.face-scan-symbol').getAttribute('data-tone'),'ready');
    let target=0;
    const poses=Array.from({length:9},(_,i)=>scanPoses().slice(i*2,i*2+2));
    delaySeal=true;failCommitOnce=true;const sealPaused=new Promise(resolve=>{onSeal=resolve;});
    for(const group of poses){
      for(const pose of group)await frame(700,pose);
      target+=2;assert.equal(await page.locator('[role=progressbar]').getAttribute('aria-valuenow'),String(target));
      if(target===2){
        // Feedback must react between descriptor captures, not only every 500ms.
        const result=await frame(100,{yaw:.2,pitch:0});assert.equal(result.progress,2);
        const ring=await page.evaluate(()=>{const r=document.querySelector('.face-scan-ring');return {leftTip:Number(r.querySelectorAll('line')[48].getAttribute('x2')),missing:[...r.querySelectorAll('[data-face-missing-sector]')].filter(line=>Number(line.getAttribute('stroke-opacity'))>0).length,overflow:document.documentElement.scrollWidth>innerWidth};});
        assert.ok(ring.leftTip<5,'green ticks stretch toward the current head direction');assert.equal(ring.missing,64);assert.equal(ring.overflow,false);
      }
      if(target===10){await page.screenshot({path:resolve(root,'.codex-face-3d-scan-mobile.png')});assert.equal(await page.locator('.face-enrollment').getAttribute('data-direction'),'circle');assert.equal(await page.locator('[data-face-directions]').count(),0);assert.equal(await page.locator('[data-face-scan-count]').textContent(),'10 / 18 각도 수집');assert.equal(await page.locator('[data-face-scan-percent]').textContent(),'56%');}
    }
    const red=await page.locator('[data-face-missing-sector]').evaluateAll(lines=>lines.every(line=>line.getAttribute('stroke-opacity')==='0'));assert.equal(red,true,'red outer ticks disappear once coverage is complete');
    // Keep the production six-second refinement sweep before saving.
    assert.equal((await frame(6000)).status,'saving');await sealPaused;
    // A storage request pending for longer than the 5s camera watchdog cannot block frame replies.
    assert.equal((await frame(6000)).status,'saving');releaseSeal();
    await page.getByRole('button',{name:'저장 다시 시도',exact:true}).waitFor();
    assert.match(await page.locator('[data-face-status]').textContent(),/일시적 서버 저장 실패 테스트/);
    assert.equal(await page.locator('[role=progressbar]').getAttribute('aria-valuenow'),'18');
    const seals=actionCounts.get('sealFaceKeyEnvelope');
    await page.getByRole('button',{name:'저장 다시 시도',exact:true}).click();
    await frame();await frame();
    await page.waitForFunction(()=>window.api.faceSessionState().phase==='READY',{},{timeout:5000}).catch(async error=>{throw new Error(`${error.message}; ${JSON.stringify(await page.evaluate(()=>({phase:window.api.faceSessionState(),status:document.querySelector('[data-face-status]')?.textContent,reply:window.guardReply,error:window.guardError})))}`);});
    assert.equal(await page.locator('.face-enrollment').count(),0);
    assert.equal(await page.evaluate(()=>window.api.faceSessionState().verified),false);
    assert.equal(await page.evaluate(()=>window.api.waitForFaceSessionReady()),true);
    assert.equal(await page.evaluate(()=>window.api.faceStudyAuthorization({controllerId:'controller'}).then(()=>false,()=>true)),true);
    assert.equal(actionCounts.get('sealFaceKeyEnvelope'),seals,'retry reuses the existing ciphertext and envelope');
    for(let i=0;i<6;i++)await frame();
    assert.equal(await page.evaluate(()=>window.api.faceSessionState().verified),true);
    await page.evaluate(()=>{window.removeEventListener('study:face-capture',window.confirmCapture);window.guardWorker.terminate();});
  }
  try{
    let page=await open();
    const staleError=await page.evaluate(async()=>{
      const stale=await import('/face-crypto.js'),current=await import('/functions/face-protocol.js?v=20261031-facecache1');
      try{stale.validateFaceBinding({uid:'owner',installationId:'browser',purpose:'face-profile',modelVersion:current.FACE_MODEL,preprocessVersion:current.FACE_PREPROCESS,schemaVersion:current.FACE_SCHEMA},'owner','browser');return null;}catch(error){return error.message;}
    });
    assert.match(staleError,/얼굴 정보 버전 또는 계정이 다릅니다/,'old cached modules reproduce the reported save failure');
    const startChoice=async()=>{
      await page.evaluate(()=>{window.choice=null;window.finished=false;window.pending=window.api.prepareFaceSession({allowUnranked:true}).then(result=>{window.choice=result.choice;window.finished=true;});});
      await page.getByRole('heading',{name:'학습 방식 선택'}).waitFor();
    };
    for(const [label,choice] of [['랭킹 포기하기','unranked'],['나가기','exit']]){
      await startChoice();
      await page.getByRole('button',{name:label,exact:true}).click();
      await page.waitForFunction(expected=>window.choice===expected,choice);
      assert.equal(await page.locator('html[data-face-ranking-ready]').count(),0);
    }
    assert.equal(actionCounts.get('beginFaceEnrollment')||0,0);
    await startChoice();
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>window.choice==='exit');
    await startChoice();
    await page.getByRole('button',{name:'등록하기',exact:true}).click();
    await page.locator('.face-privacy-card').waitFor();
    assert.equal(await page.locator('.face-protector-brand').textContent(),'Fair Protector 2.1');
    assert.equal(await page.locator('input[type=password]').count(),0,'even accounts with both providers use Google without a password field');
    assert.match(await page.locator('.face-privacy-card').textContent(),/얼굴 사진, 영상, 특징값 모두 서버로 보내지 않아요/);
    assert.match(await page.locator('.face-privacy-card').textContent(),/스터디캠을 시작하거나 자리를 비웠다가 돌아오면.*형태 유사도도 85% 이상/);
    for(const width of [320,390,1440]){
      await page.setViewportSize({width,height:844});
      const bounds=await page.locator('.face-enrollment').evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:node.scrollWidth>node.clientWidth};});
      assert.ok(bounds.left>=0&&bounds.right<=bounds.width,JSON.stringify(bounds));assert.equal(bounds.overflow,false);
      await page.locator('.face-enrollment').evaluate(node=>node.scrollTop=0);
      if(width!==320)await page.screenshot({path:resolve(root,`.codex-face-privacy-${width}.png`)});
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Google로 로그인',exact:true}).click();assert.equal(authCount,0,'consent is required before account authentication');
    await page.locator('.face-privacy-details summary').click();
    assert.equal(await page.locator('.face-privacy-details').getAttribute('open'),'');
    assert.match(await page.locator('.face-privacy-details').textContent(),/서버는 계정 인증, 등록 상태와 암호화 키 보호 정보를 처리/);
    await page.locator('.face-privacy-details summary').click();
    await page.locator('.face-enrollment input[type=checkbox]').check();await page.getByRole('button',{name:'Google로 로그인',exact:true}).click();await page.waitForFunction(()=>window.finished);
    assert.equal(await page.locator('.face-privacy-card').count(),0,'consent guidance clears when scanning starts');
    assert.equal(await page.locator('.face-privacy-footer').count(),1,'privacy assurance remains while scanning');
    await page.evaluate(()=>{window.verificationResult=null;window.verificationWait=window.api.waitForFaceVerification().then(result=>{window.verificationResult=result;});});
    assert.equal(await page.evaluate(()=>window.verificationResult),null);
    // Even when given a live stream, registration never renders a camera or mesh.
    await page.evaluate(()=>{
      const source=document.createElement('canvas');source.width=640;source.height=480;
      const context=source.getContext('2d');context.fillStyle='#18243b';context.fillRect(0,0,640,480);context.fillStyle='#cf6953';context.beginPath();context.ellipse(320,260,80,100,0,0,Math.PI*2);context.fill();
      window.previewStream=source.captureStream(5);window.api.attachFacePreview(window.previewStream);
      window.api.handleFaceWorkerEvent({type:'face-framing',framing:{width:640,height:480,transform:[1,0,0,1,-208,-155]}});
    });
    assert.equal(await page.locator('.face-preview canvas, .face-preview video, [data-face-mesh], [data-face-directions]').count(),0);
    assert.equal(await page.locator('.face-scan-symbol svg').count(),1);
    assert.equal(await page.locator('[data-face-scan-percent]').textContent(),'0%');
    assert.equal(await page.locator('[data-face-scan-count]').textContent(),'0 / 18 각도 수집');
    await page.screenshot({path:resolve(root,'.codex-face-private-preview.png')});
    await page.evaluate(()=>window.previewStream.getTracks().forEach(track=>track.stop()));
    await runManualEnrollment(page);await page.waitForFunction(()=>!document.querySelector('.face-enrollment'));
    assert.equal(await page.evaluate(()=>window.verificationResult),true);
    let original=await page.evaluate(async()=>{const s=window.api.faceWorkerContext();const {faceStore,faceRecordKey}=await import('/face-storage.js');const record=await faceStore('profiles','readonly',faceRecordKey(s.uid,s.installationId,s.binding.profileId));return {id:s.binding.profileId,ciphertext:record.ciphertext,hasSamples:'samples'in record,hasLocalKey:'wrappedKey'in record,extractable:s.keys.wrappingKey.extractable,state:window.api.faceSessionState()};});
    assert.equal(original.hasSamples,false);assert.equal(original.hasLocalKey,false);assert.equal(original.extractable,false);assert.equal(original.state.verified,true);assert.equal(authCount,1);
    const signed=await page.evaluate(()=>window.api.faceStudyAuthorization({controllerId:'controller',tracking:true,sequence:1}));assert.ok(signed.signature);
    assert.equal((await db.runTransaction(tx=>authorizeFaceStudy(tx,db,'owner',{controllerId:'controller',tracking:true,sequence:1,faceAuthorization:signed}))).verificationType,'face-browser');
    await context.close();page=await open();await page.click('#start');await page.waitForFunction(()=>window.finished);assert.equal(await page.locator('input[type=password]').count(),0);assert.equal(await page.locator('.face-enrollment').count(),0);await runVault(page);assert.equal(authCount,1);
    const restored=await page.evaluate(()=>({id:window.api.faceWorkerContext().binding.profileId,ciphertext:window.api.faceWorkerContext().record.ciphertext}));assert.equal(restored.id,original.id);assert.equal(restored.ciphertext,original.ciphertext);
    // Expired daily authentication must reuse the saved profile without enrollment warnings.
    rows.get('faceSecurity/owner').grant.expiresAtMs=Date.now()-1;
    const enrollmentsBeforeReauth=actionCounts.get('beginFaceEnrollment');
    await page.evaluate(()=>window.api.lockFaceSession());await page.click('#start');
    await page.waitForFunction(()=>window.finished);
    assert.equal(await page.locator('.face-enrollment').count(),0);await runVault(page);
    assert.equal(actionCounts.get('beginFaceEnrollment'),enrollmentsBeforeReauth);
    assert.equal(await page.evaluate(()=>window.api.faceWorkerContext().binding.profileId),original.id);
    assert.equal(await page.evaluate(()=>window.api.faceWorkerContext().record.ciphertext),original.ciphertext);
    assert.equal(authCount,1);
    // Historical profiles must trigger a new scan, never a conversion or old key unlock.
    rows.get('faceSecurity/owner').active.binding.schemaVersion=4;
    rows.get('faceSecurity/owner').active.binding.preprocessVersion='full-aligned-rgb224-light-v3';
    await page.evaluate(async()=>{const s=window.api.faceWorkerContext(),{faceStore,faceRecordKey}=await import('/face-storage.js');const key=faceRecordKey(s.uid,s.installationId,s.binding.profileId),record=await faceStore('profiles','readonly',key);record.binding={...record.binding,schemaVersion:4,preprocessVersion:'full-aligned-rgb224-light-v3'};await faceStore('profiles','readwrite',key,record);window.api.lockFaceSession();window.finished=false;});
    await page.click('#start');await page.locator('.face-enrollment input[type=checkbox]').check();await page.getByRole('button',{name:'Google로 로그인',exact:true}).click();await page.waitForFunction(()=>window.finished);assert.ok(await page.evaluate(()=>Boolean(window.api.faceWorkerContext().ticket)));
    await runVault(page);original=await page.evaluate(()=>({id:window.api.faceWorkerContext().binding.profileId,ciphertext:window.api.faceWorkerContext().record.ciphertext}));
    assert.equal(rows.get('faceSecurity/owner').active.binding.schemaVersion,5);
    const replace=async()=>{
      await page.evaluate(()=>{window.api.lockFaceSession();window.finished=false;window.error=null;window.pending=window.api.prepareFaceSession({replace:true}).then(()=>{window.finished=true;}).catch(error=>{window.error=error.message;});});
      await page.locator('.face-warning').waitFor();
      assert.equal(await page.locator('#face-enrollment-title').textContent(),'안심하고 얼굴 등록');
      assert.deepEqual(await page.locator('.face-steps li').allTextContents(),['1계정 확인','2얼굴 등록','3학습 시작']);
      assert.match(await page.locator('.face-warning').textContent(),/새 등록을 취소하면 기존 등록은 유지/);
      await page.locator('.face-enrollment input[type=checkbox]').check();await page.getByRole('button',{name:'Google로 로그인',exact:true}).click();await page.waitForFunction(()=>window.finished);
      assert.equal(await page.evaluate(()=>window.api.faceWorkerContext().record),null);
      assert.equal(rows.get('faceSecurity/owner').active.profileId,original.id);
    };
    await replace();const cancelled=new Promise(resolve=>{onCancel=resolve;});
    assert.equal(await page.getByRole('button',{name:'취소',exact:true}).isVisible(),false);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.face-enrollment').count(),1);
    await page.evaluate(()=>window.api.lockFaceSession('test teardown'));await cancelled;onCancel=null;
    assert.equal(rows.get('faceSecurity/owner').active.profileId,original.id);
    await replace();await runVault(page);
    const replacedId=rows.get('faceSecurity/owner').active.profileId;assert.notEqual(replacedId,original.id);
    await page.evaluate(()=>{window.testUid='other';window.dispatchEvent(new Event('study:auth-changed'));});assert.equal(await page.evaluate(()=>window.api.faceWorkerContext()),null);
    await page.click('#start');await page.locator('.face-enrollment input[type=checkbox]').waitFor();
    const box=await page.locator('.face-enrollment').boundingBox();assert.ok(box.width<=390&&box.height<=844);
    await page.screenshot({path:resolve(root,'.codex-face-enrollment-mobile.png')});
    await page.getByRole('button',{name:'취소',exact:true}).click();await page.waitForFunction(()=>window.error);assert.equal(await page.locator('.face-enrollment').count(),0);assert.equal(rows.get('faceSecurity/owner').active.profileId,replacedId);
    await page.click('#start');await page.locator('.face-enrollment input[type=checkbox]').check();await page.getByRole('button',{name:'Google로 로그인',exact:true}).click();await page.waitForFunction(()=>window.finished);
    await page.evaluate(()=>{window.verificationResult=null;window.verificationWait=window.api.waitForFaceVerification().then(result=>{window.verificationResult=result;});window.failStorage=true;});await runVault(page,true);assert.equal(rows.get('faceSecurity/other').active,undefined);assert.equal(await page.evaluate(()=>window.api.faceSessionState().verified),false);
    await page.evaluate(()=>window.api.handleFaceWorkerEvent({type:'face-progress',state:'RECOVERY_REQUIRED',label:'저장 실패. 다시 시도해 주세요.'}));assert.equal(await page.getByRole('button',{name:'취소',exact:true}).isVisible(),false);await page.evaluate(()=>window.api.lockFaceSession('test teardown'));
    assert.equal(await page.evaluate(()=>window.verificationResult),false);
    const beforeDeleteAuth=authCount;authTime-=86400;
    await page.evaluate(()=>{window.testUid='owner';window.pendingDelete=window.api.deleteFaceEnrollment();});await page.getByRole('heading',{name:'얼굴 등록 삭제'}).waitFor();await page.getByRole('button',{name:'취소',exact:true}).click();await page.evaluate(()=>window.pendingDelete);assert.equal(rows.get('faceSecurity/owner').active.revoked,false);
    await page.evaluate(()=>{window.pendingDelete=window.api.deleteFaceEnrollment();});await page.getByRole('button',{name:'얼굴 등록 삭제',exact:true}).click();await page.evaluate(()=>window.pendingDelete);assert.equal(authCount,beforeDeleteAuth);assert.equal(rows.get('faceSecurity/owner').active.revoked,true);
    const erased=await page.evaluate(async()=>{const {faceStore}=await import('/face-storage.js');const installation=await faceStore('settings','readonly','installation');return await faceStore('keys','readonly',`owner:${installation}`);});assert.equal(erased,undefined);assert.deepEqual(failures,[]);
  }finally{await context?.close();}
});
