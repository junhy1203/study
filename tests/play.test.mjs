import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {avatarInput,readPlayProfile,savePlayProfile,studyPersonality,SCHOLARS} from '../functions/play-service.js';
import {STUDY_TYPE_GROUPS,studyRadar} from '../study-personality-types.js';
const avatar={character:'fox',hat:'crown',glasses:'round',effect:'stars'};

test('the study type directory describes every supported scholar', async () => {
  const page = await readFile(new URL('../play.html', import.meta.url), 'utf8');
  assert.match(page, /<dialog[^>]+id="personality-types-dialog"/);
  const entries = STUDY_TYPE_GROUPS.flatMap(([,types])=>types);
  assert.deepEqual(entries.map(([name])=>name).sort(), [...SCHOLARS].sort());
  assert.ok(entries.every(([,criterion])=>criterion.length>0));
});
test('the private radar scales seven days of study and caps scores at 100', () => {
  const metrics=studyRadar({days:[3600,1800,0,3600,0,0,0].map(seconds=>({seconds})),subjectCount:6});
  assert.deepEqual(metrics.map(metric=>metric.score),[43,36,83,29,70,100]);
  assert.deepEqual(studyRadar({days:[]}),[]);
});
function database(){
  const records=new Map([['users/me',{displayName:'나',email:'private@example.com',subjects:[]}],['users/friend',{displayName:'친구',email:'secret@example.com',phoneBalanceSeconds:1234}],['users/me/friends/friend',{}]]);
  const snapshot=path=>({exists:records.has(path),data:()=>structuredClone(records.get(path))});
  const doc=path=>({path,get:async()=>snapshot(path),update:async patch=>records.set(path,{...records.get(path),...patch}),collection:()=>({where:()=>({limit:()=>({get:async()=>({docs:[]})})})})});
  return {records,doc,collection:()=>({orderBy:()=>({limit:()=>({get:async()=>({docs:[]})})})}),getAll:async(...refs)=>refs.map(ref=>snapshot(ref.path)),runTransaction:async fn=>fn({get:async ref=>snapshot(ref.path),update:(ref,patch)=>records.set(ref.path,{...records.get(ref.path),...patch})})};
}
test('avatar catalog rejects unrecognized values and drops extra client fields',()=>{
  assert.deepEqual(avatarInput({...avatar,admin:true}),avatar);
  assert.throws(()=>avatarInput({...avatar,character:'<script>'}));assert.throws(()=>avatarInput({...avatar,effect:'javascript:'}));
});

test('accessories save only owned catalog values while old profiles remain compatible',async()=>{
  const db=database();db.records.get('users/me').avatar=avatar;
  assert.deepEqual(avatarInput(avatar),avatar);
  assert.throws(()=>avatarInput({...avatar,accessory:'injected'}));
  for(const accessory of [null,'',{},[]])assert.throws(()=>avatarInput({...avatar,accessory}),{code:'invalid-argument'});
  await assert.rejects(()=>savePlayProfile(db,'me',{avatar:{...avatar,accessory:'universeling'}}),{code:'permission-denied'});
  const profile=db.records.get('users/me');
  profile.avatarInventory=['character_fox','hat_crown','glasses_round','effect_stars','accessory_universeling'];
  await savePlayProfile(db,'me',{avatar:{...avatar,accessory:'universeling'}});
  assert.equal(db.records.get('users/me').avatar.accessory,'universeling');
  await savePlayProfile(db,'me',{avatar:{...avatar,accessory:'none'}});
  assert.equal(db.records.get('users/me').avatar.accessory,'none');
});
test('friend profiles expose public fields only and require friendship',async()=>{
  const db=database(),result=await readPlayProfile(db,'me','friend');assert.equal(result.displayName,'친구');assert.equal(result.email,undefined);assert.equal(result.phoneBalanceSeconds,undefined);
  await assert.rejects(()=>readPlayProfile(db,'me','stranger'),{code:'permission-denied'});
  await assert.rejects(()=>readPlayProfile(db,'me','../friend'),{code:'invalid-argument'});
  await assert.rejects(()=>savePlayProfile(db,'me',{avatar,avatarInventory:['character_fox']}),{code:'permission-denied'});
  db.records.get('users/me').avatar=avatar; // Previously equipped free items remain owned.
  await savePlayProfile(db,'me',{avatar,bio:'나의 공부',phoneBalanceSeconds:9999});assert.deepEqual(db.records.get('users/me').avatar,avatar);assert.equal(db.records.get('users/me').phoneBalanceSeconds,undefined);
});

test('background ownership is enforced and friend statistics use credited records',async()=>{
  const db=database(),date=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  db.records.set('users/friend/stats/summary',{totalSeconds:7200});db.records.set(`users/friend/dailyStats/${date}`,{totalSeconds:1800});
  const result=await readPlayProfile(db,'me','friend');assert.equal(result.studyStats.totalSeconds,7200);assert.equal(result.studyStats.todaySeconds,1800);assert.equal(result.studyStats.weekSeconds,1800);assert.equal(result.studyStats.days.length,7);
  assert.throws(()=>avatarInput({...avatar,background:'injected'}));
  db.records.get('users/me').avatar=avatar;db.records.get('users/me').avatarInventory=['character_fox','hat_crown','glasses_round','effect_stars'];
  await assert.rejects(()=>savePlayProfile(db,'me',{avatar:{...avatar,background:'cosmos'}}),{code:'permission-denied'});
  db.records.get('users/me').avatarInventory.push('background_cosmos');await savePlayProfile(db,'me',{avatar:{...avatar,background:'cosmos'}});assert.equal(db.records.get('users/me').avatar.background,'cosmos');
});
test('camera-free time appears only in personal study statistics',async()=>{
  const db=database(),date=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  db.records.set('users/friend/stats/summary',{totalSeconds:7200,privateSeconds:900});
  db.records.set(`users/friend/dailyStats/${date}`,{totalSeconds:1800,privateSeconds:900});
  const own=await readPlayProfile(db,'friend'),view=await readPlayProfile(db,'me','friend');
  assert.equal(own.studyStats.totalSeconds,7200);
  assert.equal(own.studyStats.todaySeconds,1800);
  assert.equal(view.studyStats.totalSeconds,6300);
  assert.equal(view.studyStats.todaySeconds,900);
  assert.equal(view.studyStats.weekSeconds,900);
  assert.equal(view.studyStats.days[0].seconds,900);
  assert.equal(view.friendSummary.totalSeconds,6300);
  assert.equal(view.friendSummary.todaySeconds,900);
});
test('personality uses real study records, caches for a week, and allows a new manual result',async()=>{
  const db=database(),now=Date.parse('2026-11-04T08:00:00Z');db.records.set('users/me/dailyStats/2026-11-04',{totalSeconds:3600,subjectSeconds:{math:3600}});let calls=0;
  const generate=async input=>{calls++;assert.equal(input.records.reduce((s,r)=>s+r.seconds,0),3600);assert.equal(input.scholars.length,16);return JSON.stringify({scholar:SCHOLARS[calls-1],reason:'수학에 집중한 기록이 있어요. 다음에는 복습을 해 보세요.'});};
  const a=await studyPersonality(db,'me',{generate,now});assert.equal(a.nextUpdateAtMs,now+7*86400000);
  assert.deepEqual(await studyPersonality(db,'me',{generate,now:now+1000}),a);assert.equal(calls,1);
  await assert.rejects(()=>studyPersonality(db,'me',{force:true,generate,now:now+1000}),{code:'resource-exhausted'});
  const b=await studyPersonality(db,'me',{force:true,generate,now:now+60001});assert.notEqual(b.scholar,a.scholar);assert.equal(calls,2);
});
test('no study records or invalid model output never creates an invented result',async()=>{
  const db=database(),now=Date.parse('2026-11-04T08:00:00Z');let called=false;
  await assert.rejects(()=>studyPersonality(db,'me',{generate:async()=>{called=true;},now}),{code:'failed-precondition'});assert.equal(called,false);
  db.records.set('users/me/dailyStats/2026-11-04',{totalSeconds:60});
  await assert.rejects(()=>studyPersonality(db,'me',{generate:async()=>'{"scholar":"unknown","reason":"made up"}',now:now+60001}),{code:'unavailable'});assert.equal(db.records.get('users/me').studyPersonality,undefined);
});
