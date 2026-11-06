import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=createRequire('C:/Users/tntdr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('playwright'));}
const base='https://study.junhyuk.site',word='https://word.junhyuk.site';
for(const [path,marker]of [['/camera-focus.js','headIdle:30000'],['/camera-verification.js','away:1500'],['/play.js','purchasePhoneTime'],['/play.css','max-width:767px'],['/theme.js','study-theme'],['/face-scan.js','refinementStarted']]){
  const response=await fetch(`${base}${path}?v=20261104-1`,{cache:'no-store'});assert.equal(response.status,200,path);assert.ok((await response.text()).includes(marker),path);
}
const linked=await fetch(word+'/study-integration.js?v=20261104-1',{cache:'no-store'});assert.equal(linked.status,200);const source=await linked.text();assert.ok(source.includes('subjectId=linkedStats.subjectId||live?.subjectId'));assert.ok(!source.includes('<form data-study-email-form>'));
const unauthorized=await fetch('https://api.study.junhyuk.site/api/v1/rpc/getPlayProfile',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{"data":{}}'});assert.equal(unauthorized.status,401);
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],missing=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400)missing.push(`${response.status()} ${response.url()}`);});
  await page.goto(base+'/study.html');await page.waitForURL('**/login.html',{timeout:45000});await page.getByRole('button',{name:'Google로 로그인'}).waitFor();await page.waitForFunction(()=>!document.querySelector('[data-auth-action="google"]').disabled,null,{timeout:30000});
  assert.equal(await page.locator('input[type=email],input[type=password]').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  await page.goto(base+'/friends.html');await page.waitForURL('**/login.html',{timeout:45000});await page.getByRole('button',{name:'Google로 로그인'}).waitFor();assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  await page.goto(base+'/signup.html');await page.getByRole('button',{name:'Google로 가입'}).waitFor();assert.equal(await page.locator('input[type=email],input[type=password]').count(),0);
  await page.evaluate(()=>localStorage.setItem('study-theme','dark'));await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  const output=fileURLToPath(new URL('../tmp/features-public/',import.meta.url));await mkdir(output,{recursive:true});await page.screenshot({path:output+'/google-signup-dark.png'});
  console.log('PASS: public assets, Word response-driven timer module, protected profile endpoint, first-entry Google login, Google-only signup, dark theme; no module errors or missing Study assets');
}finally{await browser.close();}
