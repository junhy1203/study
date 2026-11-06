import test from 'node:test';
import assert from 'node:assert/strict';
import {FieldValue} from '../functions/platform-store.js';
import {grantFocusBonus,MAX_FOCUS_BONUS_SECONDS} from '../functions/focus-bonus.js';

function database(){
  const records=new Map([['users/owner',{focusRevision:7}],['users/owner/stats/focusTime',{balanceSeconds:123}]]);
  const updates=[];let queue=Promise.resolve();
  return {records,updates,doc:path=>({path}),runTransaction(fn){
    const run=queue.then(async()=>{
      const next=new Map(records),snapshot=ref=>({exists:next.has(ref.path),data:()=>next.get(ref.path)}),writes=[];
      const result=await fn({
        getAll:async(...refs)=>refs.map(snapshot),
        update:(ref,patch)=>{next.set(ref.path,{...next.get(ref.path),...patch});writes.push({ref,patch});},
        set:(ref,value,options)=>next.set(ref.path,options?.merge?{...next.get(ref.path),...value}:value),
        create:(ref,value)=>{assert.ok(!next.has(ref.path));next.set(ref.path,value);},
      });
      records.clear();for(const [key,value]of next)records.set(key,value);updates.push(...writes);return result;
    });queue=run.catch(()=>{});return run;
  }};
}

test('operator grant adds 90,000 hours, records a receipt and invalidates wallet cache',async()=>{
  const db=database(),seconds=90000*3600;
  assert.equal(MAX_FOCUS_BONUS_SECONDS,seconds);
  const result=await grantFocusBonus(db,{uid:'owner',seconds,requestId:'stationery-90000h'});
  assert.equal(result.previousBalanceSeconds,123);assert.equal(result.balanceSeconds,seconds+123);
  assert.equal(result.alreadyGranted,false);
  assert.equal(db.records.get('users/owner/stats/focusTime').balanceSeconds,seconds+123);
  assert.equal(db.records.get('users/owner/focusTimeTransactions/bonus_stationery-90000h').seconds,seconds);
  assert.equal(db.updates.length,1);assert.deepEqual(db.updates[0].patch.focusRevision,FieldValue.increment(1));
});

test('simultaneous retries grant once and reject a changed amount',async()=>{
  const db=database(),input={uid:'owner',seconds:90000*3600,requestId:'one-grant-only'};
  const results=await Promise.all([grantFocusBonus(db,input),grantFocusBonus(db,input)]);
  assert.equal(results.filter(value=>value.alreadyGranted).length,1);
  assert.equal(db.records.get('users/owner/stats/focusTime').balanceSeconds,input.seconds+123);
  assert.equal(db.updates.length,1);
  await assert.rejects(()=>grantFocusBonus(db,{...input,seconds:1}),/already used/);
});

test('invalid amounts and missing profiles never change balances',async()=>{
  const db=database(),input={uid:'owner',seconds:1,requestId:'invalid-check'};
  for(const seconds of [0,-1,1.5,NaN,Infinity,MAX_FOCUS_BONUS_SECONDS+1])await assert.rejects(()=>grantFocusBonus(db,{...input,seconds}),/Invalid bonus grant/);
  await assert.rejects(()=>grantFocusBonus(db,{...input,uid:'missing'}),/profile not found/);
  assert.equal(db.records.get('users/owner/stats/focusTime').balanceSeconds,123);assert.equal(db.records.size,2);
});
