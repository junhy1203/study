import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('..',import.meta.url)),base='https://study.junhyuk.site';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [name,version]of [['app.js','20261106-world5'],['play.js','20261106-world5'],['study-world.js','20261106-world5'],['study-room.js','20261106-world5'],['room-residents.js','20261106-world4'],['study-room.css','20261106-world4'],['functions/study-room.js','20261106-world4']]){
  const response=await fetch(`${base}/${name}?v=${version}`,{signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}});assert.equal(response.status,200,name);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(await readFile(resolve(root,name))),`${name} matches verified source`);console.log(`PASS public source: ${name}`);
}
const html=await(await fetch(`${base}/play.html`,{signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}})).text();assert.match(html,/data-world-enter/);assert.doesNotMatch(html,/data-study-room/);assert.match(html,/app\.js\?v=20261106-world5/);
for(const name of ['updateStudyWorld','getStudyWorldInvites']){
  const response=await fetch(`https://api.study.junhyuk.site/api/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({data:{}}),signal:AbortSignal.timeout(20000)});assert.equal(response.status,401);console.log(`PASS unauthenticated request denied: ${name}`);
}
const require=createRequire(import.meta.url);let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=createRequire('C:/Users/tntdr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('playwright'));}
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/play.html`,{waitUntil:'domcontentloaded'});await page.locator('[data-world-enter]').waitFor();assert.equal(await page.locator('.study-world-dialog').count(),0);
  assert.equal(await page.evaluate(async()=>typeof(await import('/study-world.js?v=20261106-world5')).createStudyWorld),'function');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await mkdir(resolve(root,'tmp/study-world'),{recursive:true});await page.screenshot({path:resolve(root,'tmp/study-world/public-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS public mobile browser: page and room module initialize; no runtime errors or overflow. No account login was performed.');
}finally{await browser.close();}
