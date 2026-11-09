// Hardware-free viewport checks. Emulation does not replace real-device testing.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}
catch{playwright=createRequire('C:/Users/tntdr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('playwright');}
const source=await readFile(new URL('../study-guard.js',import.meta.url),'utf8');
const server=createServer((request,response)=>{
  if(request.url==='/study-guard.js'){
    response.writeHead(200,{'Content-Type':'text/javascript'}).end(source);return;
  }
  response.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Study screen guard test</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
try{
  for(const config of [
    {label:'mobile WebKit / iPhone geometry',engine:playwright.webkit,options:{},width:390,height:700},
    {label:'Android geometry / Chromium Edge',engine:playwright.chromium,options:{channel:'msedge'},width:412,height:750},
  ]){
    const browser=await config.engine.launch({headless:true,...config.options});
    try{
      // setViewportSize also resets the emulated screen, so start with matching
      // dimensions to make restoring the viewport restore the original screen.
      const context=await browser.newContext({viewport:{width:config.width,height:config.height},screen:{width:config.width,height:config.height},isMobile:true,hasTouch:true});
      const page=await context.newPage();await page.goto(url);await page.bringToFront();
      page.setDefaultTimeout(5000);
      await page.evaluate(async()=>{
        const {createStudyGuard}=await import('/study-guard.js');
        window.guardChanges=[];
        window.guard=createStudyGuard({window,document,onChange:state=>window.guardChanges.push(state)});
        window.guard.start();
      });
      assert.equal(await page.evaluate(()=>window.guard.blocked),false);
      await page.setViewportSize({width:Math.floor(config.width/2),height:config.height});
      await page.waitForFunction(()=>window.guard.reason==='ratio');
      await page.setViewportSize({width:config.width,height:config.height});
      await page.waitForFunction(()=>!window.guard.blocked);
      assert.equal(await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));return window.guard.reason;}),'blur');
      assert.equal(await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));return window.guard.blocked;}),false);
      assert.equal(await page.evaluate(()=>{window.guard.stop();return window.guard.active;}),false);
      await page.setViewportSize({width:Math.floor(config.width/2),height:config.height});
      await page.evaluate(()=>window.guard.start());
      assert.equal(await page.evaluate(()=>window.guard.blocked),false,'next run takes a fresh baseline');
      assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0,'no persistent baseline');
      await page.evaluate(()=>window.guard.stop());
      console.log(`PASS ${config.label}: resize pause, restore, focus, session isolation, no storage`);
    }finally{await browser.close();}
  }
}finally{await new Promise(resolve=>server.close(resolve));}
