import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire('C:/Users/tntdr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js'),{chromium}=require('playwright'),root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const server=createServer(async(req,res)=>{try{const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage({viewport:{width:390,height:900}});page.on('console',msg=>{if(msg.type()==='error'&&/attribute d|<path>|<svg>/.test(msg.text()))console.log(msg.text());});
  await page.route('**/app.js?*',route=>route.fulfill({contentType:'text/javascript',body:''}));await page.route('**/auth.js?*',route=>route.fulfill({contentType:'text/javascript',body:"export const authReady=Promise.resolve();export const getAuthUser=()=>({uid:'me'});"}));
  await page.goto(`http://127.0.0.1:${server.address().port}/play.html`);
  await page.evaluate(async()=>{const {createAvatarEditor}=await import('/avatar-shop.js?v=20261104-shop8');const d=document.createElement('dialog');d.className='profile-dialog avatar-shop-dialog';const body=document.createElement('div');body.className='play-profile';body.append(createAvatarEditor({uid:'me'}));d.append(body);document.body.append(d);d.showModal();});
  await page.getByRole('button',{name:'모자',exact:true}).click();await page.waitForTimeout(400);
  console.log(JSON.stringify(await page.locator('.avatar-tier-items').evaluateAll(nodes=>nodes.map(n=>({count:n.children.length,width:n.clientWidth,scroll:n.scrollWidth,parent:n.parentElement.clientWidth,rows:getComputedStyle(n).gridTemplateRows,columns:getComputedStyle(n).gridTemplateColumns,auto:getComputedStyle(n).gridAutoColumns,flow:getComputedStyle(n).gridAutoFlow,card:n.children[0].getBoundingClientRect().width})))));
  await page.screenshot({path:resolve(root,'tmp/features-ui/rpg-layout-probe.png')});
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
