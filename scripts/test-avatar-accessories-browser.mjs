import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {chromium}=createRequire('C:/Users/tntdr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('playwright');
const external=process.env.AVATAR_BASE;
const server=external?null:createServer(async(req,res)=>{
  try{
    const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+sep))throw Error('outside root');
    res.setHeader('Content-Type',({'.css':'text/css','.js':'text/javascript','.html':'text/html'})[extname(file)]||'text/plain');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
if(server)await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=external||`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error'&&/attribute d|<path>|<svg>/.test(msg.text()))errors.push(msg.text());});
  await page.route('**/auth.js?*',route=>route.fulfill({contentType:'text/javascript',body:"export const authReady=Promise.resolve();export const getAuthUser=()=>({uid:'me'});"}));
  await page.route('**/play.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><main style="max-width:1100px;margin:auto;padding:20px"><h1>액세서리 컬렉션</h1><div id="gallery" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px"></div><div id="friends" style="margin-top:20px"></div><div id="world"></div></main>'}));
  await page.goto(base+'/play.html');
  const previews=await page.evaluate(async()=>{
    const {AVATAR_CATALOG}=await import('/functions/avatar-catalog.js');
    const {pixelAvatar,avatarItemPreview}=await import('/avatar-renderer.js');
    const {renderFriendCard}=await import('/friend-card.js');
    const items=AVATAR_CATALOG.filter(item=>item.slot==='accessory');window.accessoryItems=items;
    const avatar={character:'rainbowsovereign',hat:'prismcrown',glasses:'diamondgaze',effect:'rainbowparade',accessory:'rainbowquill'};window.testAvatar=avatar;
    for(const item of items){const card=document.createElement('article');card.className='avatar-shop-card';card.dataset.itemTier=item.tier;const name=document.createElement('strong');name.textContent=item.name;card.append(avatarItemPreview(item),name);document.querySelector('#gallery').append(card);}
    const friend=document.createElement('button');friend.id='friend';document.querySelector('#friends').append(friend);
    window.renderFriend=value=>renderFriendCard(friend,{displayName:'무지개 친구',bio:'오른쪽에서 둥둥',avatar:{...avatar,accessory:value},friendSummary:{}});
    window.renderFriend('prismleviathan');
    const portrait=pixelAvatar(avatar);portrait.id='portrait';document.querySelector('h1').after(portrait);
    return {count:items.length,art:document.querySelectorAll('#gallery [data-accessory-value]').length,empty:[...document.querySelectorAll('#gallery .avatar-accessory-art')].filter(el=>!el.children.length).length};
  });
  assert.deepEqual(previews,{count:49,art:48,empty:0});
  assert.equal(await page.locator('#friend [data-accessory-value]').getAttribute('data-accessory-value'),'prismleviathan');
  const float=page.locator('#friend .avatar-accessory-float');
  assert.equal(await float.evaluate(el=>getComputedStyle(el).animationName),'accessory-hover');
  assert.ok(await page.locator('#friend .pixel-avatar').evaluate(el=>{const box=el.querySelector('.avatar-accessory').getBBox(),vb=el.viewBox.baseVal;return box.x+box.width<=vb.x+vb.width&&box.y>=vb.y;}));
  await page.evaluate(()=>window.renderFriend('universeling'));
  assert.equal(await page.locator('#friend [data-accessory-value]').getAttribute('data-accessory-value'),'universeling');
  await page.evaluate(()=>window.renderFriend('none'));
  assert.equal(await page.locator('#friend [data-accessory-value]').count(),0);
  await page.evaluate(()=>window.renderFriend('prismleviathan'));
  await page.evaluate(async()=>{
    const {createAvatarEditor}=await import('/avatar-shop.js');
    const dialog=document.createElement('dialog');dialog.id='editor';dialog.className='profile-dialog avatar-shop-dialog';
    dialog.append(createAvatarEditor({uid:'me',avatar:window.testAvatar,avatarInventory:window.accessoryItems.map(item=>item.id)}));document.body.append(dialog);dialog.showModal();
  });
  await page.getByRole('button',{name:'액세서리',exact:true}).click();
  assert.equal(await page.locator('#editor [data-avatar-item]').count(),49);
  assert.equal(await page.locator('#editor [data-tier="신화"] [data-avatar-item]').count(),5);
  await page.locator('[data-avatar-item="accessory_universeling"]').getByRole('button',{name:/장착/}).click();
  assert.equal(await page.locator('.avatar-selected-preview [data-accessory-value]').getAttribute('data-accessory-value'),'universeling');
  await page.locator('[data-avatar-item="accessory_none"]').getByRole('button',{name:/장착/}).click();
  assert.equal(await page.locator('.avatar-selected-preview [data-accessory-value]').count(),0);
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-tier="신화"]').scrollIntoViewIfNeeded();
  await mkdir(resolve(root,'tmp/features-ui'),{recursive:true});
  await page.screenshot({path:resolve(root,'tmp/features-ui/accessory-shop-mobile.png'),fullPage:true});
  assert.ok(await page.locator('#editor').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.evaluate(()=>document.querySelector('#editor').remove());
  await page.setViewportSize({width:1200,height:900});
  await page.locator('#friend').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('#friend [data-accessory-value]').isVisible(),'friend accessory is visible');
  await page.locator('#friend').screenshot({path:resolve(root,'tmp/features-ui/accessory-friend.png')});
  await page.screenshot({path:resolve(root,'tmp/features-ui/accessory-collection.png'),fullPage:true});
  await page.evaluate(async()=>{
    const {createStudyRoom}=await import('/study-room.js');
    const {defaultRoom}=await import('/functions/study-room.js');
    const room={...defaultRoom(),items:[],spawn:{x:2,y:3}};
    window.world=createStudyRoom(document.querySelector('#world'),{uid:'me',avatar:window.testAvatar,room,onSave:async()=>{},participants:[{uid:'friend',displayName:'친구',position:{x:4,y:3},avatar:{...window.testAvatar,accessory:'tinywhale'}}]});
  });
  assert.equal(await page.locator('.room-accessory').count(),2);
  assert.equal(await page.locator('.room-resident [data-accessory-value]').count(),0,'world does not duplicate inline companion');
  const follower=page.locator('[data-accessory-owner="me"]');
  await page.evaluate(()=>{window.savedFollower=document.querySelector('[data-accessory-owner="me"]');window.savedFloat=window.savedFollower.querySelector('.avatar-accessory-float');});
  await page.locator('.room-stage').press('ArrowRight');
  await page.waitForTimeout(110);
  const moving=await follower.evaluate(el=>({target:new DOMMatrix(el.style.transform).m41,actual:new DOMMatrix(getComputedStyle(el).transform).m41}));
  assert.ok(moving.target-moving.actual>1,'companion eases toward the new position');
  await page.waitForTimeout(360);
  const settled=await page.evaluate(()=>{
    const owner=document.querySelector('[data-room-self]'),pet=document.querySelector('[data-accessory-owner="me"]');
    return {right:new DOMMatrix(getComputedStyle(pet).transform).m41-new DOMMatrix(getComputedStyle(owner).transform).m41,same:pet===window.savedFollower&&pet.querySelector('.avatar-accessory-float')===window.savedFloat};
  });
  assert.ok(Math.abs(settled.right-38)<1);assert.equal(settled.same,true,'walking preserves accessory animation node');
  await page.evaluate(()=>window.world.updateAvatar({...window.testAvatar,accessory:'rainbowseraph'}));
  assert.equal(await follower.locator('[data-accessory-value]').getAttribute('data-accessory-value'),'rainbowseraph');
  await page.evaluate(()=>window.world.updateWorld({participants:[]}));
  assert.equal(await page.locator('[data-accessory-owner="friend"]').count(),0);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await follower.locator('.avatar-accessory-float').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await follower.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  await page.locator('#world').scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(root,'tmp/features-ui/accessory-world.png')});
  await page.evaluate(()=>window.world.destroy());
  assert.equal(await page.locator('.room-accessory').count(),0);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${base}: 49 shop entries, 48 artworks, 5 mythic accessories; friend refresh/cropping, equip/unequip, mobile, world following/node stability/removal, reduced motion, cleanup. No SVG/runtime errors.`);
}finally{await browser.close();if(server)await new Promise(done=>server.close(done));}
