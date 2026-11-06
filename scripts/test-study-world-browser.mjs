import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {worldDatabase} from '../tests/fixtures/study-world-store.mjs';
import {changeStudyWorld,studyWorldInvites} from '../functions/study-world-service.js';
import {savePlayProfile} from '../functions/play-service.js';
import {socialSnapshot} from '../functions/social-service.js';
const require=createRequire(import.meta.url);let chromium,webkit;
try{({chromium,webkit}=require('playwright'));}catch{({chromium,webkit}=createRequire('C:/Users/tntdr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('playwright'));}
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),db=worldDatabase(),errors=[],calls=[];
db.records.get('users/host').avatar={character:'sprout',hat:'none',glasses:'none',effect:'galaxy'};
db.records.get('users/guest').avatar={character:'cat',hat:'none',glasses:'none',effect:'galaxy'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/__call'){
      let raw='';for await(const chunk of req)raw+=chunk;const {uid,name,data}=JSON.parse(raw);calls.push({uid,name,data});let result;
      if(name==='updateStudyWorld')result=await changeStudyWorld(db,uid,data);
      else if(name==='getStudyWorldInvites')result=await studyWorldInvites(db,uid);
      else if(name==='updatePlayProfile')result=await savePlayProfile(db,uid,data);
      else if(name==='getStudySocial')result=await socialSnapshot(db,uid,data);
      else if(name==='getPlayProfile')result={uid,...db.records.get('users/'+uid),phoneBalanceSeconds:0,focusBalanceSeconds:0,personality:{scholar:'뉴턴',reason:'꾸준히 공부해요.',nextUpdateAtMs:Date.now()+9999999}};
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result}));return;
    }
    const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+sep))throw Error('outside root');const type={'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(path)];if(!type)throw Error('unsupported');res.setHeader('Content-Type',type+'; charset=utf-8');res.end(await readFile(path));
  }catch(error){if(req.url==='/__call'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:{code:error.code||'internal',message:error.message}}));}else{res.writeHead(404);res.end();}}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await (process.env.WORLD_BROWSER==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,channel:'msedge'}));
try{
  const hostContext=await browser.newContext({viewport:{width:1280,height:900}}),guestContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  for(const [context,uid]of [[hostContext,'host'],[guestContext,'guest']]){
    await context.addInitScript(value=>{window.__testUid=value;},uid);
    await context.route('**/auth.js?*',route=>route.fulfill({contentType:'text/javascript',body:"export const authReady=Promise.resolve(true);export const getAuthUser=()=>window.__signedOut?null:{uid:window.__testUid,emailVerified:true};"}));
    await context.route('**/data.js?*',route=>route.fulfill({contentType:'text/javascript',body:"export const getStudyData=()=>({ready:true,profile:{uid:window.__testUid}});"}));
    await context.route('**/app.js?*',route=>route.fulfill({contentType:'text/javascript',body:"import '/play.js?v=20261106-world4';"}));
    await context.route('**/study-api.js?*',route=>route.fulfill({contentType:'text/javascript',body:"export async function studyCall(name,data={}){const value=await(await fetch('/__call',{method:'POST',body:JSON.stringify({uid:window.__testUid,name,data})})).json();if(value.error)throw Object.assign(new Error(value.error.message),{code:'functions/'+value.error.code});if(name==='updateStudyWorld'&&data.action==='sync')window.__worldSyncs=(window.__worldSyncs||0)+1;return value.result;}export const serviceError=e=>e.message;export const duration=s=>String(s);export function element(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!=null)n.textContent=text;return n;}"}));
  }
  for(const page of [host,guest])page.on('pageerror',error=>errors.push(error.message));
  const enter=async page=>{await page.getByRole('button',{name:'가상현실 입장하기 ↗',exact:true}).click();await page.locator('dialog.study-world-dialog[open]').waitFor();await page.locator('dialog.study-world-dialog').evaluate(async dialog=>{await Promise.all(dialog.getAnimations().map(animation=>animation.finished.catch(()=>{})));});};
  const popup=page=>page.locator('dialog.world-popup[open]');
  const clickCharacter=async(page,id)=>{
    const target=page.locator('[data-room-guest="'+id+'"] [data-room-character-hit]');
    const boxes=await target.evaluate(async element=>{const read=()=>{const b=element.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};};const before=read();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {before,after:read()};});
    assert.ok(Math.abs(boxes.before.x-boxes.after.x)<.25&&Math.abs(boxes.before.y-boxes.after.y)<.25,'character hit area stays still during cosmetic animation: '+JSON.stringify(boxes));
    await page.mouse.click(boxes.after.x+boxes.after.width/2,boxes.after.y+boxes.after.height/2);
  };
  const rememberAnimation=async(page,key,selector)=>page.evaluate(({key,selector})=>{
    const sprite=document.querySelector(selector),animation=sprite.getAnimations({subtree:true}).find(item=>item.animationName==='avatar-breathe');
    if(!animation)throw new Error('Expected an actual running avatar animation');
    window[key]={sprite,animation,time:animation.currentTime,sync:window.__worldSyncs||0};
  },{key,selector});
  const assertStableAnimation=async(page,key,selector)=>{
    await page.waitForFunction(key=>(window.__worldSyncs||0)>=window[key].sync+3,key);
    const result=await page.evaluate(({key,selector})=>{const before=window[key],sprite=document.querySelector(selector);return {sameNode:sprite===before.sprite,sameAnimation:sprite.getAnimations({subtree:true}).includes(before.animation),elapsed:before.animation.currentTime-before.time};},{key,selector});
    assert.equal(result.sameNode,true,'sync preserves avatar SVG');assert.equal(result.sameAnimation,true,'sync preserves the running animation');assert.ok(result.elapsed>800,'animation timeline advances through multiple syncs');
  };
  const assertLayout=async(page,right)=>{
    const result=await page.evaluate(()=>{const a=document.querySelector('.room-stage').getBoundingClientRect(),b=document.querySelector('.room-social').getBoundingClientRect(),d=document.querySelector('.study-world-dialog').getBoundingClientRect();return {scene:{x:a.x,y:a.y,right:a.right,bottom:a.bottom},chat:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},dialog:{x:d.x,y:d.y,width:d.width,height:d.height},w:innerWidth,h:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth};});
    assert.equal(result.overflow,false);assert.equal(result.dialog.x,0);assert.equal(result.dialog.y,0);assert.ok(Math.abs(result.dialog.width-result.w)<.1);assert.ok(Math.abs(result.dialog.height-result.h)<.1);
    if(right)assert.ok(result.chat.x>=result.scene.right-1,'PC/tablet chat is on the right');else assert.ok(result.chat.y>=result.scene.bottom-1,'mobile chat is below the world');
  };
  await host.goto(base+'/play.html');await host.locator('[data-avatar-preview] .pixel-avatar').waitFor();
  assert.equal(await host.locator('[data-study-room],.study-world').count(),0);
  assert.equal(calls.filter(c=>c.name==='updateStudyWorld').length,0,'no world connection until entry');
  await enter(host);await assertLayout(host,true);
  await host.keyboard.press('w');assert.equal(await host.locator('[data-room-self]').getAttribute('data-cell-y'),'4','W works immediately on entry');
  await host.keyboard.press('s');assert.equal(await host.locator('[data-room-self]').getAttribute('data-cell-y'),'5');
  await host.getByRole('button',{name:'친구 초대',exact:true}).focus();await host.keyboard.press('W');assert.equal(await host.locator('[data-room-self]').getAttribute('data-cell-y'),'4','WASD works with toolbar focus');await host.keyboard.press('s');
  await host.evaluate(()=>{document.activeElement.blur();document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ㅈ',code:'',bubbles:true}));});
  assert.equal(await host.locator('[data-room-self]').getAttribute('data-cell-y'),'4','Korean WASD works when Safari leaves focus on the body');
  await host.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Unidentified',keyCode:83,bubbles:true})));
  assert.equal(await host.locator('[data-room-self]').getAttribute('data-cell-y'),'5','legacy key code fallback restores Safari movement');
  await rememberAnimation(host,'__selfAnimation','[data-room-self] .room-avatar');await assertStableAnimation(host,'__selfAnimation','[data-room-self] .room-avatar');
  const points=await host.locator('[data-room-cell="0,0"]').getAttribute('points');const first=points.split(' ').map(value=>value.split(',').map(Number));assert.equal(first[0][1],first[1][1],'front floor has horizontal rows');assert.equal(first[1][0],first[2][0],'front floor has vertical columns');
  await host.getByRole('button',{name:'방 꾸미기',exact:true}).click();await host.getByRole('button',{name:'달빛 서재',exact:true}).click();
  await host.getByRole('button',{name:'+ 작은 테이블',exact:true}).click();await host.locator('[data-room-cell="6,6"]').click();assert.equal(await host.locator('[data-room-item]').count(),7);
  await host.getByRole('button',{name:'회전',exact:true}).click();await host.getByRole('button',{name:'방 저장',exact:true}).click();await host.getByText('공부방을 계정에 저장했어요.',{exact:true}).waitFor();
  assert.equal(db.records.get('users/host').studyRoom.theme,'night');await host.getByRole('button',{name:'꾸미기 완료',exact:true}).click();
  let failFriendLoad=true;
  await hostContext.route('**/__call',route=>{const request=route.request().postDataJSON();if(request.name==='getStudySocial'&&failFriendLoad){failFriendLoad=false;return route.fulfill({contentType:'application/json',body:JSON.stringify({error:{code:'unavailable',message:'친구 목록을 불러오지 못했어요.'}})});}return route.continue();});
  await host.getByRole('button',{name:'친구 초대',exact:true}).click();await host.locator('.room-friend-list').getByText('친구 목록을 불러오지 못했어요.',{exact:true}).waitFor();await host.getByRole('button',{name:'다시 불러오기',exact:true}).click();
  await host.getByRole('button',{name:'초대',exact:true}).click();await host.getByRole('button',{name:'초대 보냄',exact:true}).waitFor();
  assert.ok(calls.filter(call=>call.name==='getStudySocial').every(call=>call.data.listScope===undefined),'friend list uses the real API contract');
  await guest.goto(base+'/play.html');await guest.locator('[data-avatar-preview] .pixel-avatar').waitFor();await enter(guest);await guest.getByRole('button',{name:'입장',exact:true}).click();
  await guest.getByRole('heading',{name:'방 주인님의 공부방',exact:true}).waitFor();await assertLayout(guest,false);assert.equal(await guest.getByRole('button',{name:'방 꾸미기',exact:true}).isVisible(),false);
  await host.getByRole('button',{name:'인사',exact:true}).focus();await host.keyboard.press('d');
  await host.getByRole('button',{name:'방 꾸미기',exact:true}).click();
  await host.getByRole('button',{name:'+ 의자',exact:true}).click();await host.locator('[data-room-cell="4,5"]').dispatchEvent('click');
  await guest.waitForFunction(()=>document.querySelectorAll('[data-room-item]').length===8);
  await host.locator('[data-room-guest="guest"]').waitFor();await guest.locator('[data-room-self]').waitFor();
  assert.notEqual(await guest.locator('[data-room-self]').getAttribute('data-cell-x')+','+await guest.locator('[data-room-self]').getAttribute('data-cell-y'),'4,5','a guest under new furniture moves to a free tile and stays visible');
  await host.getByRole('button',{name:'변경 취소',exact:true}).click();await guest.waitForFunction(()=>document.querySelectorAll('[data-room-item]').length===7);
  await host.getByRole('button',{name:'꾸미기 완료',exact:true}).click();
  await guest.locator('[data-room-cell="4,5"]').dispatchEvent('click');await guest.waitForFunction(()=>document.querySelector('[data-room-self]')?.dataset.cellX==='4'&&document.querySelector('[data-room-self]')?.dataset.cellY==='5');
  await guest.getByRole('textbox',{name:'채팅 메시지',exact:true}).focus();await guest.keyboard.press('w');assert.equal(await guest.locator('[data-room-self]').getAttribute('data-cell-y'),'5','typing in chat never moves the avatar');
  await guest.getByRole('textbox',{name:'채팅 메시지',exact:true}).fill('<b>같이 공부하자!</b>');await guest.getByRole('button',{name:'보내기',exact:true}).click();
  await host.locator('.room-chat').getByText('<b>같이 공부하자!</b>',{exact:true}).waitFor();assert.equal(await host.locator('.room-chat b').count(),0);
  await rememberAnimation(host,'__guestAnimation','[data-room-guest="guest"] .room-avatar');
  await guest.getByRole('button',{name:'인사',exact:true}).focus();await guest.keyboard.press('d');
  await host.waitForFunction(()=>document.querySelector('[data-room-guest="guest"]')?.dataset.cellX==='5');
  await host.waitForFunction(()=>{const x=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-room-guest="guest"]')).transform).m41;return x>353&&x<415;});
  await host.waitForFunction(()=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-room-guest="guest"]')).transform).m41-416)<1);
  await guest.keyboard.down('w');await guest.waitForFunction(()=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-room-self]')).transform).m42-348)<1);await guest.keyboard.down('w');await guest.keyboard.up('w');assert.equal(await guest.locator('[data-room-self]').getAttribute('data-cell-y'),'3','held W repeats do not restart a movement delay');await guest.keyboard.press('s');await guest.keyboard.press('s');
  await assertStableAnimation(host,'__guestAnimation','[data-room-guest="guest"] .room-avatar');
  assert.equal(await guest.locator('[data-world-emote]').count(),8);await guest.getByRole('button',{name:'인사',exact:true}).click();await host.locator('[data-emote-owner="guest"]').waitFor();
  await mkdir(resolve(root,'tmp/study-world-v3'),{recursive:true});await host.screenshot({path:resolve(root,'tmp/study-world-v3/desktop.png')});await guest.screenshot({path:resolve(root,'tmp/study-world-v3/mobile.png')});
  await host.locator('[data-emote-owner="guest"]').waitFor({state:'hidden',timeout:8000});
  await clickCharacter(host,'guest');await popup(host).getByRole('button',{name:'가위바위보 하기',exact:true}).click();await popup(guest).getByRole('button',{name:'수락하고 시작',exact:true}).click();
  const popupPosition=await guest.locator('[data-room-self]').getAttribute('data-cell-y');await guest.keyboard.press('w');assert.equal(await guest.locator('[data-room-self]').getAttribute('data-cell-y'),popupPosition,'game popup captures keyboard without moving the avatar');
  await popup(host).getByRole('button',{name:'✊ 바위',exact:true}).click();await popup(host).getByText('선택 완료! 상대가 고르면 함께 공개돼요.',{exact:true}).waitFor();
  await popup(guest).getByRole('button',{name:'✌️ 가위',exact:true}).click();await popup(host).getByText('내가 이겼어요!',{exact:true}).waitFor();await popup(guest).getByText('친구가 이겼어요!',{exact:true}).waitFor();
  await host.screenshot({path:resolve(root,'tmp/study-world-v3/rps.png')});
  await popup(host).getByRole('button',{name:'닫기',exact:true}).click();await popup(host).waitFor({state:'hidden'});
  await popup(guest).getByRole('button',{name:'한 판 더',exact:true}).click();await popup(host).getByRole('button',{name:'수락하고 시작',exact:true}).click();
  await popup(host).getByRole('button',{name:'✋ 보',exact:true}).click();await popup(guest).getByRole('button',{name:'✋ 보',exact:true}).click();
  await popup(host).getByText('무승부!',{exact:true}).waitFor();await popup(guest).getByText('무승부!',{exact:true}).waitFor();
  for(const page of [host,guest]){await popup(page).getByRole('button',{name:'닫기',exact:true}).click();await popup(page).waitFor({state:'hidden'});}
  for(const width of [320,390,768,1024]){await guest.setViewportSize({width,height:844});await assertLayout(guest,width>=700);}
  await guest.setViewportSize({width:390,height:500});await assertLayout(guest,false);await guest.setViewportSize({width:390,height:844});
  await clickCharacter(host,'guest');await popup(host).getByRole('button',{name:'가위바위보 하기',exact:true}).click();await popup(guest).getByRole('button',{name:'거절',exact:true}).click();await popup(host).getByText('친구가 이번 게임을 사양했어요.',{exact:true}).waitFor();
  await popup(host).getByRole('button',{name:'닫기',exact:true}).click();await popup(host).waitFor({state:'hidden'});
  await guest.getByRole('button',{name:'나가기 ↗',exact:true}).click();await guest.locator('.study-world-dialog').waitFor({state:'detached'});
  await host.waitForFunction(()=>!document.querySelector('[data-room-guest="guest"]'));
  await host.getByRole('button',{name:'나가기 ↗',exact:true}).click();await host.locator('.study-world-dialog').waitFor({state:'detached'});
  await enter(host);assert.equal(await host.locator('[data-room-item]').count(),7);
  await host.evaluate(()=>{window.__signedOut=true;window.dispatchEvent(new Event('study:auth-changed'));});assert.equal(await host.locator('.study-world-dialog,.world-popup').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: avatar-only entry; fullscreen; frontal elevated view; desktop/tablet right chat, mobile bottom chat; persistent furniture; two-player chat/movement; eight synchronized expiring emotes; clickable friend; animated RPS popup accept, hidden choices, win/draw/rematch/decline; exit/reentry/logout; 320/390/768/1024 and short viewport. Screenshots tmp/study-world-v3.');
}catch(error){
  await mkdir(resolve(root,'tmp/study-world-v3'),{recursive:true});
  let index=0;for(const context of browser.contexts())for(const page of context.pages()){await page.screenshot({path:resolve(root,'tmp/study-world-v3/failure-'+index+++'.png')}).catch(()=>{});console.log('Browser diagnostics:',await page.locator('.world-status,.study-room>.room-hint').allTextContents());}
  console.log('Page errors:',errors);throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
