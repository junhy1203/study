import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),external=process.env.AVATAR_BASE;
const {chromium}=createRequire('C:/Users/tntdr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('playwright');
const server=external?null:createServer(async(req,res)=>{try{const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+sep))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
if(server)await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=external||`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error'&&/attribute d|<path>|<svg>/.test(msg.text()))errors.push(msg.text());});
  await page.route('**/auth.js?*',route=>route.fulfill({contentType:'text/javascript',body:"export const authReady=Promise.resolve();export const getAuthUser=()=>({uid:'me'});"}));
  await page.route('**/play.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><main style="max-width:1100px;margin:auto;padding:20px"><h1>신화 시네마틱 효과</h1><div id="gallery" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px"></div><div id="friend"></div><div id="world"></div></main>'}));
  await page.goto(base+'/play.html');
  const scenes=await page.evaluate(async()=>{
    const {CINEMATIC_EFFECTS}=await import('/avatar-cinematic.js'),{avatarItem}=await import('/functions/avatar-catalog.js'),{pixelAvatar}=await import('/avatar-renderer.js');
    window.baseAvatar={character:'rainbowsovereign',hat:'prismcrown',glasses:'diamondgaze',accessory:'cosmicfountain'};
    window.cinematicItems=Object.keys(CINEMATIC_EFFECTS).map(key=>avatarItem('effect',key));
    const out=[];
    for(const item of window.cinematicItems){
      const card=document.createElement('article');card.style.cssText='display:grid;place-items:center;background:#171b30;border:1px solid #a88ace;border-radius:20px;padding:14px;color:#fff';
      const svg=pixelAvatar({...window.baseAvatar,effect:item.value});svg.style.cssText='width:100%;height:265px';const name=document.createElement('strong');name.textContent=item.name;const price=document.createElement('span');price.textContent=(item.costSeconds/3600).toLocaleString()+'시간';card.append(svg,name,price);document.querySelector('#gallery').append(card);
      const box=svg.querySelector('.avatar-cinematic-scene').getBBox(),view=svg.viewBox.baseVal;
      out.push({effect:item.value,width:box.width,height:box.height,viewport:view.width,format:svg.querySelector('[data-effect-format]').dataset.effectFormat,elements:svg.querySelectorAll('*').length});
    }
    return out;
  });
  assert.equal(scenes.length,6);assert.equal(new Set(scenes.map(x=>x.format)).size,6);
  for(const scene of scenes){assert.ok(scene.width>40&&scene.height>34,JSON.stringify(scene));assert.equal(scene.viewport,54);assert.ok(scene.elements<300);}
  await mkdir(resolve(root,'tmp/features-ui'),{recursive:true});await page.screenshot({path:resolve(root,'tmp/features-ui/cinematic-collection.png'),fullPage:true});
  await page.evaluate(async()=>{
    const {renderFriendCard}=await import('/friend-card.js'),{createStudyRoom}=await import('/study-room.js'),{defaultRoom}=await import('/functions/study-room.js');
    renderFriendCard(document.querySelector('#friend'),{displayName:'시네마틱 친구',avatar:{...window.baseAvatar,accessory:'none',effect:'cosmiccoronation'},friendSummary:{}});
    window.world=createStudyRoom(document.querySelector('#world'),{uid:'me',avatar:{...window.baseAvatar,effect:'cosmiccoronation'},room:{...defaultRoom(),items:[],spawn:{x:3,y:3}},onSave:async()=>{}});
  });
  assert.equal(await page.locator('#friend .pixel-avatar').getAttribute('viewBox'),'-18 -19 54 53');
  assert.equal(await page.locator('[data-room-self] .room-avatar').getAttribute('viewBox'),'-7 -7 32 34','world preserves character size with overflowing effects');
  await page.locator('.room-stage').press('ArrowRight');await page.waitForTimeout(180);
  assert.equal(await page.locator('[data-room-self]').getAttribute('data-cell-x'),'4');
  await page.evaluate(async()=>{
    const {createAvatarEditor}=await import('/avatar-shop.js');const dialog=document.createElement('dialog');dialog.className='avatar-shop-dialog';dialog.id='shop';dialog.append(createAvatarEditor({uid:'me',avatar:window.baseAvatar,avatarInventory:[]}));document.body.append(dialog);dialog.showModal();
  });
  await page.getByRole('button',{name:'움직이는 효과',exact:true}).click();
  assert.equal(await page.locator('[data-cinematic-item]').count(),6);
  const preview=page.getByRole('button',{name:'창세의 무지개 대관식 크게 보기',exact:true});
  await preview.click();await page.locator('dialog.avatar-cinematic-dialog[open]').waitFor();
  assert.match(await page.locator('.avatar-cinematic-price').textContent(),/88888시간/);
  assert.equal(await page.locator('.avatar-purchase-dialog').count(),0,'preview never starts purchase');
  assert.equal(await page.locator('.avatar-cinematic-stage [data-cinematic-effect]').getAttribute('data-cinematic-effect'),'cosmiccoronation');
  await page.screenshot({path:resolve(root,'tmp/features-ui/cinematic-preview-desktop.png')});
  await page.getByRole('button',{name:'닫기',exact:true}).click();await page.locator('.avatar-cinematic-dialog').waitFor({state:'detached'});
  await preview.press('Enter');await page.locator('.avatar-cinematic-dialog[open]').waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('.avatar-cinematic-dialog').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:resolve(root,'tmp/features-ui/cinematic-preview-mobile.png')});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.ok(await page.locator('.avatar-cinematic-dialog .avatar-cinematic-scene').evaluate(el=>[...el.querySelectorAll('*')].every(n=>getComputedStyle(n).animationName==='none')));
  await page.keyboard.press('Escape');await page.locator('.avatar-cinematic-dialog').waitFor({state:'detached'});
  await page.evaluate(()=>{document.querySelector('#shop').remove();window.world.destroy();});assert.deepEqual(errors,[]);
  console.log(`PASS ${base}: 6 distinct wide scenes; highest price; friend framing; world size/movement; click/keyboard preview without purchase; mobile, reduced motion and cleanup. Screenshots tmp/features-ui/cinematic-*.png`);
}finally{await browser.close();if(server)await new Promise(done=>server.close(done));}
