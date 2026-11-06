import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),origin='https://study.junhyuk.site';
const hash=value=>createHash('sha256').update(value).digest('hex');
const assets=['camera-identity.js','camera-worker.js','camera-inference.js','camera.js','app.js','data.js','face-session.js','face-scan-guide.js','face-enrollment.css','face-descriptor-client.js','face-descriptor-worker.js'];
for(const name of assets){
  const response=await fetch(`${origin}/${name}?v=20261105-turn1`);
  assert.equal(response.status,200,name);assert.match(response.headers.get('content-type'),name.endsWith('.css')?/css/:/javascript/,name);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(await readFile(join(root,name))),`${name} public hash`);
}
const {chromium}=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js'))('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/study.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>[...document.scripts].some(script=>script.src.includes('app.js')));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({assets:assets.length,hashes:'match',browserErrors:errors.length,url:page.url()}));
}finally{await browser.close();}
