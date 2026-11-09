import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const origin='https://study.junhyuk.site';
const web=new URL('../../multi server/apps/study/web/',import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const name of ['auth.js','face-session.js','face-enrollment.css','app.js','camera.js','data.js','index.html','study.html']){
  const response=await fetch(`${origin}/${name}?verify=faceprivacy-20261107`);
  assert.equal(response.status,200,name);
  assert.equal(digest(Buffer.from(await response.arrayBuffer())),digest(await readFile(new URL(name,web))),`${name}: public content differs from release source`);
}
console.log('Public release source: 8 file hashes matched.');
const {chromium}=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js'))('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/study.html`,{waitUntil:'networkidle'});
  assert.match(page.url(),/\/login\.html/,'signed-out Study visitors reach login');
  assert.equal(await page.locator('[data-auth-action="google"]:enabled').count(),1);
  assert.deepEqual(errors,[],'production Study initialization');
  console.log('Public Study entry initialized and reached Google login without JavaScript errors.');
  // Exercise the served UI with a synthetic account; no real login or camera access.
  await page.route(`${origin}/__face-privacy-probe`,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><script type="module">import {prepareFaceSession} from "/face-session.js?v=20261107-privacy1";prepareFaceSession().catch(error=>window.probeError=error.message);</script></body></html>'}));
  await page.route('**/auth.js?*',route=>route.fulfill({contentType:'text/javascript',body:'export const authReady=Promise.resolve(true);export const getAuthUser=()=>({uid:"public-ui-probe",email:"preview@example.invalid",providerData:[{providerId:"password"},{providerId:"google.com"}]});export const reauthenticateFaceAccount=()=>{throw Error("Real authentication is excluded from this probe")};'}));
  await page.route('**/server-client.js?*',route=>route.fulfill({contentType:'text/javascript',body:'export const serverCallable=name=>async()=>{if(name!=="getFaceEnrollmentStatus")throw Error("Unexpected server call");return {data:{enabled:true,active:null}}};'}));
  await page.goto(`${origin}/__face-privacy-probe`);
  await page.getByRole('button',{name:'Google로 로그인',exact:true}).waitFor();
  assert.equal(await page.locator('input[type=password]').count(),0);
  assert.match(await page.locator('.face-privacy-card').textContent(),/얼굴 사진, 영상, 특징값 모두 서버로 보내지 않아요/);
  await page.screenshot({path:fileURLToPath(new URL('../.codex-face-privacy-public.png',import.meta.url))});
  await page.getByRole('button',{name:'취소',exact:true}).click();
  assert.equal(await page.locator('.face-enrollment').count(),0);
  assert.deepEqual(errors,[],'public registration UI initialization');
  console.log('Served registration UI: Google button only, no password field, privacy card and cancellation verified.');
}finally{await browser.close();}
