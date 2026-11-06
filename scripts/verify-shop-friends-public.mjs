import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const files=['focus-wallet.js','friend-profile.js','friend-profile.css','friend-card.js','profile-motion.js','friends.html','navigation.js','avatar-renderer.js','avatar-rpg.js','avatar-rpg.css','avatar-street.js','avatar-street.css','avatar-background.css','functions/avatar-catalog.js','study-social.js','avatar-shop.js','avatar-effects.css','data.js','client-cache.js','app.js','styles.css','play.js','play.html'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourceOnly=process.argv.includes('--source');
await Promise.all(files.map(async file=>{
  const local=await readFile(new URL('../'+file,import.meta.url));
  let live;
  if(sourceOnly)live=await readFile(new URL('../../multi server/apps/study/web/'+file,import.meta.url));
  else{const response=await fetch(`https://study.junhyuk.site/${file}?v=20261105-shop10`,{cache:'no-store'});assert.equal(response.status,200,file);live=Buffer.from(await response.arrayBuffer());}
  assert.equal(hash(live),hash(local),`${sourceOnly?'packaging':'deployed'} ${file} must match the verified source`);
}));
console.log(`PASS: ${files.length} ${sourceOnly?'packaging':'deployed'} shop, wallet and full-screen friend assets match verified source bytes`);
