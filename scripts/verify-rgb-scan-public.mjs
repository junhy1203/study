// Read-only guest browser verification; never requests a camera or signs in.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require('playwright'));}
catch{({chromium}=createRequire('C:/Users/tntdr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('playwright'));}
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage(),errors=[],failed=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>{if(/junhyuk\.site/.test(request.url()))failed.push({url:request.url(),error:request.failure()?.errorText});});
  const response=await page.goto('https://study.junhyuk.site/',{waitUntil:'networkidle',timeout:60000});
  assert.equal(response.status(),200);
  const actual=await page.evaluate(async()=>{
    const protocol=await import('/functions/face-protocol.js?v=20261103-privateui1');
    const scan=await import('/face-scan.js?v=20261103-privateui1');
    const mesh=await import('/face-mesh.js?v=20261103-privateui1');
    const guide=await import('/face-scan-guide.js?v=20261103-privateui1');
    const session=await fetch('/face-session.js?v=20261103-privateui1').then(r=>r.text());
    const style=await fetch('/face-enrollment.css').then(r=>r.text());
    const ticks=guide.scanRingSegments({x:1,y:0},[2,0,0,0,0,0,0,0]);
    return {title:document.title,schema:protocol.FACE_SCHEMA,preprocess:protocol.FACE_PREPROCESS,scanKind:scan.SCAN_KIND,total:scan.SCAN_COUNT,meshSize:mesh.MESH_SIZE,registration:session.includes('얼굴 등록'),privatePreview:session.includes('face-scan-center')&&!session.includes("element('video')")&&!session.includes("element('canvas')"),noDirectionList:!session.includes('data-face-directions')&&!style.includes('.face-scan-sectors'),liveDirection:ticks[48].active===1,missingOutside:ticks.some(t=>t.missing.opacity>0)&&ticks.filter(t=>t.sector===0).every(t=>t.missing.opacity===0),appLoaded:performance.getEntriesByType('resource').some(r=>r.name.includes('/app.js?v=20261103-privateui1'))};
  });
  assert.equal(actual.schema,5);assert.equal(actual.total,18);assert.equal(actual.meshSize,96);
  assert.ok(actual.registration&&actual.privatePreview&&actual.noDirectionList&&actual.appLoaded);
  assert.ok(actual.liveDirection&&actual.missingOutside);
  assert.equal(await page.evaluate(async()=>{const n=await import('/network-errors.js?v=20261103-privateui1');const e=n.readableNetworkError(new TypeError('Load failed'));return e.code==='functions/unavailable'&&e.message.includes('다시 시도');}),true);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  console.log(JSON.stringify({ok:true,...actual,pageErrors:errors.length,failedRequests:failed.length}));
}finally{await browser.close();}
