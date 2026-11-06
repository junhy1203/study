import assert from 'node:assert/strict';
const study='https://study.junhyuk.site',word='https://word.junhyuk.site';
for(const [base,path,marker]of [[study,'/avatar-renderer.js','avatar-galaxy-ring'],[study,'/avatar-shop.js','purchaseAvatarItem'],[study,'/avatar-effects.css','avatar-orbit 12s linear infinite'],[word,'/study-timer-core.js','idleMs<10000'],[word,'/study-integration.js','10초 무입력']]){
  const response=await fetch(`${base}${path}?v=20261104-avatar2`,{cache:'no-store'});assert.equal(response.status,200,path);assert.ok((await response.text()).includes(marker),path);
}
const response=await fetch(study+'/functions/avatar-catalog.js?v=20261104-avatar2',{cache:'no-store'});assert.equal(response.status,200);const source=await response.text();const catalog=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));assert.equal(catalog.AVATAR_CATALOG.length,33);
const unauthorized=await fetch('https://api.study.junhyuk.site/api/v1/rpc/purchaseAvatarItem',{method:'POST',headers:{'Content-Type':'application/json',Origin:study},body:'{"data":{"itemId":"effect_galaxy"}}'});assert.equal(unauthorized.status,401);
console.log('PASS: deployed animated renderer, shop, 33-item catalog, protected purchase endpoint and original 10-second Word idle policy');
