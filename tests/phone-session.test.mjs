import test from 'node:test';
import assert from 'node:assert/strict';
import {startPhoneSession} from '../functions/phone-session.js';

const deviceId='11111111-1111-4111-8111-111111111111', requestId='22222222-2222-4222-8222-222222222222';
function dbWith(balance) {
  const records=new Map([['users/me',{phoneBalanceSeconds:balance}]]);
  const doc=path=>({path});
  const snap=ref=>({exists:records.has(ref.path),data:()=>structuredClone(records.get(ref.path))});
  return {records,doc,runTransaction:async fn=>fn({getAll:async(...refs)=>refs.map(snap),update:(ref,patch)=>records.set(ref.path,{...records.get(ref.path),...patch}),create:(ref,value)=>{assert.equal(records.has(ref.path),false);records.set(ref.path,value);}})};
}
test('phone session spends five minutes once and retries do not spend again',async()=>{
  const db=dbWith(900), input={deviceId,requestId};
  const first=await startPhoneSession(db,'me',input,1000);
  assert.equal(first.endsAtMs,301000);assert.equal(db.records.get('users/me').phoneBalanceSeconds,600);
  assert.equal((await startPhoneSession(db,'me',input,2000)).endsAtMs,301000);
  assert.equal(db.records.get('users/me').phoneBalanceSeconds,600);
  await startPhoneSession(db,'me',{deviceId,requestId:'33333333-3333-4333-8333-333333333333'},2000);
  assert.equal(db.records.get('users/me').phoneBalanceSeconds,600);
  await assert.rejects(()=>startPhoneSession(db,'me',{deviceId:'44444444-4444-4444-8444-444444444444',requestId:'55555555-5555-4555-8555-555555555555'},2000),{code:'failed-precondition'});
});
test('rejects insufficient balance and malformed IDs',async()=>{
  const db=dbWith(299);
  await assert.rejects(()=>startPhoneSession(db,'me',{deviceId,requestId},1000),{code:'failed-precondition'});
  await assert.rejects(()=>startPhoneSession(db,'me',{deviceId:'bad',requestId},1000),{code:'invalid-argument'});
});
