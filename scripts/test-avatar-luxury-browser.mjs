import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {chromium}=createRequire('C:/Users/tntdr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('playwright');
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/__luxury'){
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><main style="max-width:1000px;margin:24px auto;padding:16px"><h1>무지개 초호화 컬렉션</h1><div id="gallery" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px"></div></main>');return;
    }
    const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error('outside root');
    res.setHeader('Content-Type',({'.css':'text/css','.js':'text/javascript'})[extname(file)]||'text/plain');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error'&&/attribute d|<path>|<svg>/.test(msg.text()))errors.push(msg.text());});
  await page.route('**/auth.js?*',route=>route.fulfill({contentType:'text/javascript',body:"export const authReady=Promise.resolve();export const getAuthUser=()=>({uid:'me'});"}));
  await page.goto(`http://127.0.0.1:${server.address().port}/__luxury`);
  const rendered=await page.evaluate(async()=>{
    const {AVATAR_CATALOG}=await import('/functions/avatar-catalog.js');
    const {pixelAvatar,avatarItemPreview,avatarBackground}=await import('/avatar-renderer.js');
    const luxury=AVATAR_CATALOG.filter(x=>x.tier==='신화');window.luxury=luxury;
    const outfit={character:'rainbowsovereign',hat:'prismcrown',glasses:'diamondgaze',effect:'prismnova',background:'diamondgalaxy',accessory:'universeling'};
    const hero=document.createElement('div');hero.style.cssText='display:grid;place-items:center;min-height:260px;margin-bottom:24px';hero.append(pixelAvatar(outfit));avatarBackground(hero,outfit);document.querySelector('h1').after(hero);
    for(const item of luxury){
      const card=document.createElement('article');card.className='avatar-shop-card';card.dataset.itemTier=item.tier;
      const label=document.createElement('strong');label.textContent=item.name;
      const price=document.createElement('span');price.textContent=`${(item.costSeconds/3600).toLocaleString()}시간`;
      card.append(avatarItemPreview(item),label,price);if(item.slot==='background')avatarBackground(card,{background:item.value});
      document.querySelector('#gallery').append(card);
    }
    return {count:luxury.length,particles:hero.querySelectorAll('.avatar-luxury-glint').length,background:hero.dataset.avatarBackground};
  });
  assert.equal(rendered.count,21);assert.ok(rendered.particles>=24);assert.equal(rendered.background,'diamondgalaxy');
  await mkdir(resolve(root,'tmp/features-ui'),{recursive:true});
  await page.screenshot({path:resolve(root,'tmp/features-ui/avatar-luxury-desktop.png'),fullPage:true});
  await page.evaluate(async()=>{
    const {createAvatarEditor}=await import('/avatar-shop.js');
    const dialog=document.createElement('dialog');dialog.className='profile-dialog avatar-shop-dialog';
    dialog.append(createAvatarEditor({uid:'me',avatarInventory:window.luxury.map(x=>x.id)}));document.body.append(dialog);dialog.showModal();
  });
  for(const [slot,label,count]of [['character','캐릭터',1],['hat','모자',2],['glasses','안경',2],['effect','움직이는 효과',9],['background','배경',2],['accessory','액세서리',5]]){
    await page.getByRole('button',{name:label,exact:true}).click();
    const cards=page.locator('.avatar-studio [data-tier="신화"] .avatar-shop-card');assert.equal(await cards.count(),count,slot);
    const cost=cards.first().locator('.avatar-shop-cost');
    assert.match(await cost.textContent(),/시간/);
    assert.equal(await cards.first().locator('.avatar-shop-owned').isVisible(),true);
    assert.ok(parseFloat(await cost.evaluate(el=>getComputedStyle(el).fontSize))<16);
    await cards.first().getByRole('button',{name:/장착/}).click();
    assert.equal(await cards.first().getByRole('button',{name:/장착/}).getAttribute('aria-pressed'),'true');
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-tier="신화"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(root,'tmp/features-ui/avatar-luxury-mobile.png'),fullPage:true});
  assert.ok(await page.locator('.avatar-shop-dialog').evaluate(el=>el.getBoundingClientRect().width<=innerWidth));
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.avatar-selected-preview .avatar-luxury-glint').first().evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.deepEqual(errors,[]);
  console.log('PASS: 21 previews, 6 mythic shelves, owned equip, mobile dialog, reduced motion; no SVG/runtime errors. Screenshots: tmp/features-ui/avatar-luxury-{desktop,mobile}.png');
}finally{await browser.close();await new Promise(done=>server.close(done));}
