import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const base=process.env.AVATAR_BASE||'https://study.junhyuk.site';
const files=['avatar-cinematic.js','avatar-cinematic.css','avatar-stationery.js','avatar-accessories.js','avatar-accessories.css','avatar-luxury.js','avatar-luxury.css','avatar-renderer.js','avatar-shop.js','room-residents.js','friend-card.js','styles.css','functions/avatar-catalog.js'];
const hash=value=>createHash('sha256').update(value).digest('hex');
await Promise.all(files.map(async file=>{
  const response=await fetch(`${base}/${file}?verify=accessory-20261106`,{cache:'no-store'});
  assert.equal(response.status,200,file);
  const actual=Buffer.from(await response.arrayBuffer()),expected=await readFile(new URL('../'+file,import.meta.url));
  assert.equal(hash(actual),hash(expected),file+' deployed SHA-256 differs');
}));
const response=await fetch(base+'/functions/avatar-catalog.js?verify=accessory-catalog',{cache:'no-store'});
const {AVATAR_CATALOG}=await import('data:text/javascript;base64,'+Buffer.from(await response.text()).toString('base64'));
assert.equal(AVATAR_CATALOG.filter(item=>item.slot==='accessory').length,49);
assert.equal(AVATAR_CATALOG.filter(item=>item.tier==='신화').length,21);
console.log(`PASS ${base}: ${files.length} public assets match local SHA-256; 49 accessories, 21 mythic items.`);
