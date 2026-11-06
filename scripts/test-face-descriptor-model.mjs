import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep,join} from 'node:path';
import {homedir} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {chromium}=createRequire(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js'))('playwright');
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<html><body>Descriptor parity probe</body></html>');return;}
    const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep))throw Error('path');
    res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':'text/plain');res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const worker=new Worker('/tests/fixtures/face-descriptor-probe.js');
    const timer=setTimeout(()=>{worker.terminate();reject(Error('Descriptor parity timeout'));},120000);
    worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();data.error?reject(Error(data.error)):resolve(data);};
    worker.onerror=event=>{clearTimeout(timer);worker.terminate();reject(Error(event.message));};
    worker.postMessage({});
  }));
  assert.equal(result.maxDifference,0,'identical full and lighting-normalized descriptors');
  assert.ok(result.ticks>0,'camera Worker remains responsive during descriptor inference');
  console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
