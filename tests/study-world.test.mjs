import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRoom,validateRoom,roomPath,canPlace,isRoomFree} from '../functions/study-room.js';
import {changeStudyWorld,studyWorldInvites} from '../functions/study-world-service.js';
import {savePlayProfile} from '../functions/play-service.js';
import {worldDatabase} from './fixtures/study-world-store.mjs';
import {ROOM_EMOTES} from '../functions/study-room.js';
const now=2000000000000;
const join=async db=>{await changeStudyWorld(db,'host',{action:'invite',uid:'guest'},now);return changeStudyWorld(db,'guest',{action:'accept',host:'host'},now);};
test('live furniture reaches joined guests and relocates every blocked participant without saving the profile',async()=>{
  const db=worldDatabase();await join(db);
  const original=structuredClone(db.records.get('users/host').studyRoom),room=defaultRoom();
  room.items.push({id:'live-chair',kind:'chair',x:4,y:5,rotation:0});room.spawn={x:5,y:5};
  const host=await changeStudyWorld(db,'host',{action:'sync',room,position:room.spawn},now+100);
  assert.deepEqual(host.room,room);
  assert.ok(host.participants.every(p=>isRoomFree(room.items,p.position.x,p.position.y)));
  const guest=await changeStudyWorld(db,'guest',{host:'host',position:{x:4,y:5}},now+200);
  assert.deepEqual(guest.room,room);assert.ok(guest.participants.every(p=>isRoomFree(room.items,p.position.x,p.position.y)));
  assert.deepEqual(db.records.get('users/host').studyRoom,original);
  await assert.rejects(()=>changeStudyWorld(db,'guest',{host:'host',room},now+300),{code:'permission-denied'});
  await assert.rejects(()=>changeStudyWorld(db,'host',{room:{...room,spawn:{x:4,y:5}}},now+300),{code:'invalid-argument'});
  const undone=await changeStudyWorld(db,'host',{room:defaultRoom()},now+400);assert.deepEqual(undone.room,defaultRoom());
  await changeStudyWorld(db,'host',{room},now+500);
  await changeStudyWorld(db,'host',{action:'leave'},now+600);
  assert.deepEqual((await changeStudyWorld(db,'guest',{host:'host'},now+700)).room,defaultRoom());
  await changeStudyWorld(db,'host',{room},now+800);
  assert.deepEqual((await changeStudyWorld(db,'host',{},now+46000)).room,defaultRoom());
});
test('room validation rejects bounds, overlapping furniture, forged catalog and occupied spawn',()=>{
  assert.deepEqual(validateRoom(defaultRoom()),defaultRoom());
  for(const bad of [{...defaultRoom(),theme:'__proto__'},{...defaultRoom(),items:[{id:'a',kind:'__proto__',x:0,y:0,rotation:0}]},{...defaultRoom(),items:[{id:'a',kind:'desk',x:7,y:7,rotation:0}]},{...defaultRoom(),spawn:{x:1,y:1}}])assert.throws(()=>validateRoom(bad));
  const room=defaultRoom();assert.equal(canPlace(room.items,{id:'new',kind:'desk',x:1,y:1,rotation:0}),false);
  assert.throws(()=>validateRoom({...room,items:[...room.items,{...room.items[0]}]}));
});
test('pathfinding walks around furniture and never enters occupied tiles',()=>{
  const items=[{id:'wall',kind:'sofa',x:1,y:1,rotation:0}];
  const path=roomPath(items,{x:0,y:1},{x:3,y:1});assert.ok(path.length>3);
  let last={x:0,y:1};for(const p of path){assert.equal(Math.abs(last.x-p.x)+Math.abs(last.y-p.y),1);last=p;}
  assert.deepEqual(roomPath(items,{x:0,y:1},{x:1,y:1}),[]);
});
test('room-only save keeps avatar, currency and biography untouched',async()=>{
  const db=worldDatabase(),before=structuredClone(db.records.get('users/host'));const room=defaultRoom();
  await savePlayProfile(db,'host',{studyRoom:room,phoneBalanceSeconds:99999,avatar:{character:'dragon'}});
  const after=db.records.get('users/host');assert.deepEqual(after.avatar,before.avatar);assert.equal(after.phoneBalanceSeconds,undefined);assert.deepEqual(after.studyRoom,room);
  await assert.rejects(()=>savePlayProfile(db,'host',{studyRoom:{...room,spawn:{x:100,y:0}}}),{code:'invalid-argument'});
});
test('only friends invited by the owner may accept; expired invites and outsider reads fail',async()=>{
  const db=worldDatabase();
  await assert.rejects(()=>changeStudyWorld(db,'guest',{host:'host'},now),{code:'permission-denied'});
  await assert.rejects(()=>changeStudyWorld(db,'host',{action:'invite',uid:'outsider'},now),{code:'permission-denied'});
  await changeStudyWorld(db,'host',{action:'invite',uid:'guest'},now);
  assert.equal((await studyWorldInvites(db,'guest',now)).invites.length,1);
  await assert.rejects(()=>changeStudyWorld(db,'guest',{action:'accept',host:'host'},now+1800001),{code:'permission-denied'});
  const result=await join(db);assert.equal(result.host,'host');assert.equal(result.participants[0].uid,'guest');
  assert.equal((await studyWorldInvites(db,'guest',now)).invites.length,0);
  await assert.rejects(()=>changeStudyWorld(db,'outsider',{host:'host'},now),{code:'permission-denied'});
  await assert.rejects(()=>changeStudyWorld(db,'guest',{host:'host',action:'invite',uid:'outsider'},now),{code:'permission-denied'});
});
test('chat validates length, membership, rate limit and retry deduplication',async()=>{
  const db=worldDatabase();await join(db);
  const input={host:'host',action:'message',text:'같이 공부하자!',messageId:'msg_1'};
  const result=await changeStudyWorld(db,'guest',input,now);assert.equal(result.messages.length,1);
  assert.equal((await changeStudyWorld(db,'guest',input,now+500)).messages.length,1);
  await assert.rejects(()=>changeStudyWorld(db,'guest',{...input,messageId:'msg_2'},now+500),{code:'resource-exhausted'});
  await assert.rejects(()=>changeStudyWorld(db,'guest',{...input,text:'a'.repeat(301)},now+2000),{code:'invalid-argument'});
  await assert.rejects(()=>changeStudyWorld(db,'guest',{...input,text:'x\ny'},now+2000),{code:'invalid-argument'});
  await assert.rejects(()=>changeStudyWorld(db,'outsider',input,now),{code:'permission-denied'});
  const host=await changeStudyWorld(db,'host',{},now+2000);assert.equal(host.messages[0].displayName,'친구');
});
test('kick, friendship removal, leave and presence expiry revoke guest access',async()=>{
  const db=worldDatabase();await join(db);await changeStudyWorld(db,'host',{action:'kick',uid:'guest'},now);
  await assert.rejects(()=>changeStudyWorld(db,'guest',{host:'host'},now),{code:'permission-denied'});
  await join(db);await changeStudyWorld(db,'guest',{host:'host',action:'leave'},now);
  await assert.rejects(()=>changeStudyWorld(db,'guest',{host:'host'},now),{code:'permission-denied'});
  await join(db);db.records.delete('users/host/friends/guest');
  await assert.rejects(()=>changeStudyWorld(db,'guest',{host:'host'},now),{code:'permission-denied'});
  db.records.set('users/host/friends/guest',{});await join(db);
  await assert.rejects(()=>changeStudyWorld(db,'guest',{host:'host'},now+45001),{code:'permission-denied'});
});
test('outsider leave cannot create or rewrite a private world',async()=>{
  const db=worldDatabase();await changeStudyWorld(db,'outsider',{host:'host',action:'leave'},now);assert.equal(db.records.has('studyWorlds/host'),false);
});
test('capacity reserves the host place, bad positions normalize, messages remain bounded',async()=>{
  const db=worldDatabase();
  for(let i=0;i<8;i++){const id=`g${i}`;db.records.set(`users/${id}`,{displayName:id});db.records.set(`users/host/friends/${id}`,{});await changeStudyWorld(db,'host',{action:'invite',uid:id},now);if(i<7)await changeStudyWorld(db,id,{action:'accept',host:'host'},now);else await assert.rejects(()=>changeStudyWorld(db,id,{action:'accept',host:'host'},now),{code:'resource-exhausted'});}
  const result=await changeStudyWorld(db,'host',{position:{x:100,y:0}},now);assert.equal(result.participants.length,8);assert.ok(result.participants.find(p=>p.uid==='host').position.x<8);
  for(let i=0;i<55;i++)await changeStudyWorld(db,'host',{action:'message',text:String(i),messageId:`m${i}`},now+i*2000);
  assert.equal(db.records.get('studyWorlds/host').messages.length,50);
  await changeStudyWorld(db,'host',{},now+110000);assert.equal(db.records.get('studyWorlds/host').messages.length,50);
});
test('eight emotes are validated, shared, rate limited and expire',async()=>{
  const db=worldDatabase();await join(db);assert.equal(Object.keys(ROOM_EMOTES).length,8);
  await changeStudyWorld(db,'guest',{host:'host',action:'emote',emote:'wave'},now);
  let snapshot=await changeStudyWorld(db,'host',{},now+500);assert.equal(snapshot.participants.find(p=>p.uid==='guest').emote,'wave');
  await assert.rejects(()=>changeStudyWorld(db,'guest',{host:'host',action:'emote',emote:'fire'},now+500),{code:'resource-exhausted'});
  await assert.rejects(()=>changeStudyWorld(db,'guest',{host:'host',action:'emote',emote:'__proto__'},now+1000),{code:'invalid-argument'});
  snapshot=await changeStudyWorld(db,'host',{},now+5000);assert.equal(snapshot.participants.find(p=>p.uid==='guest').emote,undefined);
});
test('two-player RPS requires acceptance and hides both hands until reveal',async()=>{
  const db=worldDatabase();await join(db);
  let result=await changeStudyWorld(db,'host',{action:'rpsInvite',uid:'guest',gameId:'game1'},now);assert.equal(result.game.status,'pending');
  await assert.rejects(()=>changeStudyWorld(db,'guest',{host:'host',action:'rpsChoose',gameId:'game1',choice:'paper'},now),{code:'invalid-argument'});
  result=await changeStudyWorld(db,'guest',{host:'host',action:'rpsAccept',gameId:'game1'},now);assert.equal(result.game.status,'playing');
  result=await changeStudyWorld(db,'host',{action:'rpsChoose',gameId:'game1',choice:'rock'},now+10);assert.equal(result.game.myChoice,'rock');assert.equal(result.game.opponentChoice,undefined);
  result=await changeStudyWorld(db,'guest',{host:'host'},now+20);assert.equal(result.game.opponentReady,true);assert.equal(result.game.opponentChoice,undefined);assert.equal(result.game.choices,undefined);
  await assert.rejects(()=>changeStudyWorld(db,'host',{action:'rpsChoose',gameId:'game1',choice:'paper'},now+30),{code:'failed-precondition'});
  result=await changeStudyWorld(db,'guest',{host:'host',action:'rpsChoose',gameId:'game1',choice:'scissors'},now+40);assert.equal(result.game.status,'done');assert.equal(result.game.winnerUid,'host');assert.equal(result.game.opponentChoice,'rock');
  result=await changeStudyWorld(db,'host',{},now+50);assert.equal(result.game.opponentChoice,'scissors');assert.equal(result.game.winnerUid,'host');
});
test('RPS rejects outsiders, overlapping challenges, expired games, and cancels on leave',async()=>{
  const db=worldDatabase();await join(db);
  await assert.rejects(()=>changeStudyWorld(db,'host',{action:'rpsInvite',uid:'outsider',gameId:'g'},now),{code:'invalid-argument'});
  await changeStudyWorld(db,'host',{action:'rpsInvite',uid:'guest',gameId:'g'},now);
  await assert.rejects(()=>changeStudyWorld(db,'guest',{host:'host',action:'rpsInvite',uid:'host',gameId:'g2'},now),{code:'failed-precondition'});
  let result=await changeStudyWorld(db,'host',{action:'rpsAccept',gameId:'g'},now).catch(error=>error);assert.equal(result.code,'failed-precondition');
  result=await changeStudyWorld(db,'host',{},now+61000);assert.equal(result.game.status,'cancelled');
  await join(db);await changeStudyWorld(db,'host',{action:'rpsInvite',uid:'guest',gameId:'g3'},now);
  await changeStudyWorld(db,'guest',{host:'host',action:'leave'},now);result=await changeStudyWorld(db,'host',{},now+1);assert.equal(result.game.status,'cancelled');
});
test('RPS draws and dismissal are per player; older games do not reopen',async()=>{
  const db=worldDatabase();await join(db);
  for(const id of ['draw1','draw2']){
    await changeStudyWorld(db,'host',{action:'rpsInvite',uid:'guest',gameId:id},now);
    await changeStudyWorld(db,'guest',{host:'host',action:'rpsAccept',gameId:id},now);
    await changeStudyWorld(db,'host',{action:'rpsChoose',gameId:id,choice:'paper'},now);
    let result=await changeStudyWorld(db,'guest',{host:'host',action:'rpsChoose',gameId:id,choice:'paper'},now);assert.equal(result.game.winnerUid,null);
    result=await changeStudyWorld(db,'host',{action:'rpsClose',gameId:id},now);assert.equal(result.game,null);
  }
});
