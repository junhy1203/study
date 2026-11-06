import {HttpsError} from './platform-http.js';
import {defaultRoom,validateRoom,isRoomFree,ROOM_EMOTES} from './study-room.js';
import {pruneWorldGames,changeWorldGame,worldGameForViewer} from './study-world-game.js';

const fail=(code,message)=>{throw new HttpsError(code,message);};
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
const user=(db,id)=>db.doc(`users/${id}`);
const world=(db,id)=>db.doc(`studyWorlds/${id}`);
const invitation=(db,uid,host)=>db.doc(`users/${uid}/studyWorldInvites/${host}`);
const layout=profile=>{try{return validateRoom(profile.studyRoom);}catch{return defaultRoom();}};
const active=(members,now)=>Object.fromEntries(Object.entries(members||{}).filter(([,value])=>value.seenAtMs>now-45000));
const freePosition=(room,position)=>{
  if(position&&Number.isInteger(position.x)&&Number.isInteger(position.y)&&isRoomFree(room.items,position.x,position.y))return {x:position.x,y:position.y};
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(isRoomFree(room.items,x,y))return {x,y};
  return room.spawn;
};
export async function changeStudyWorld(db,uid,input={},now=Date.now()){
  const host=input.host||uid,action=input.action||'sync';
  if(!validId(host)||!['sync','invite','accept','decline','leave','message','kick','emote','rpsInvite','rpsAccept','rpsDecline','rpsChoose','rpsClose'].includes(action))fail('invalid-argument','공부방 요청을 확인해 주세요.');
  if((action==='invite'||action==='kick')&&(!validId(input.uid)||input.uid===uid))fail('invalid-argument','초대할 친구를 선택해 주세요.');
  return db.runTransaction(async tx=>{
    const ref=world(db,host),[ownerSnap,selfSnap,worldSnap]=await tx.getAll(user(db,host),user(db,uid),ref);
    const owner=ownerSnap.data(),self=selfSnap.data();
    if(!owner||!self)fail('not-found','계정 프로필을 찾을 수 없습니다.');
    const record=worldSnap.data()||{members:{},messages:[]},members=active(record.members,now);
    if(input.room!==undefined){
      if(uid!==host||action!=='sync')fail('permission-denied','방 주인만 배치를 공유할 수 있어요.');
      try{record.liveRoom=validateRoom(input.room);}catch{fail('invalid-argument','공유할 가구 배치를 확인해 주세요.');}
      record.liveRoomAtMs=now;
    }
    const room=record.liveRoom&&record.liveRoomAtMs>now-45000&&(members[host]||uid===host&&action==='sync')?layout({studyRoom:record.liveRoom}):layout(owner);
    if(action==='decline'){tx.delete(invitation(db,uid,host));return {ok:true};}
    if(action==='leave'){if(host!==uid&&!Object.hasOwn(record.members||{},uid))return {ok:true};delete members[uid];tx.set(ref,{...record,members});return {ok:true};}
    if(host!==uid){
      const friendship=await tx.get(db.doc(`users/${host}/friends/${uid}`));
      if(!friendship.exists)fail('permission-denied','친구의 초대를 받아야 입장할 수 있어요.');
      if(action==='accept'){
        const invite=(await tx.get(invitation(db,uid,host))).data();
        if(!invite||invite.expiresAtMs<=now)fail('permission-denied','초대가 만료되었어요. 친구에게 다시 초대해 달라고 해 주세요.');
      }else if(!Object.hasOwn(members,uid))fail('permission-denied','초대를 수락한 뒤 입장해 주세요.');
    }
    if(action==='invite'||action==='kick'){
      if(host!==uid)fail('permission-denied','방 주인만 초대하거나 내보낼 수 있어요.');
      const friend=await tx.get(db.doc(`users/${uid}/friends/${input.uid}`));
      if(!friend.exists)fail('permission-denied','친구만 초대할 수 있어요.');
      if(action==='invite'){
        tx.set(invitation(db,input.uid,host),{host,displayName:owner.displayName||'공부 친구',expiresAtMs:now+30*60000});return {ok:true};
      }
      delete members[input.uid];tx.delete(invitation(db,input.uid,host));tx.set(ref,{...record,members});return {ok:true};
    }
    // Reserve one of eight places for the owner, even while the owner is away.
    if(!Object.hasOwn(members,uid)&&Object.keys(members).filter(id=>id!==host).length>=7&&uid!==host)fail('resource-exhausted','공부방은 주인을 포함해 8명까지 입장할 수 있어요.');
    const messages=(record.messages||[]).filter(message=>message.atMs>now-24*3600000).slice(-50);
    const member={...(members[uid]||{}),position:freePosition(room,input.position||members[uid]?.position||room.spawn),seenAtMs:now};
    if(action==='message'){
      const text=typeof input.text==='string'?input.text.trim():'';
      if(!text||text.length>300||/[\p{Cc}\p{Cf}]/u.test(text))fail('invalid-argument','채팅은 줄바꿈 없이 1~300자로 입력해 주세요.');
      if(!validId(input.messageId))fail('invalid-argument','메시지 식별자를 확인해 주세요.');
      // Idempotent retries keep a network timeout from posting the same message twice.
      if(!messages.some(message=>message.id===input.messageId&&message.uid===uid)){
        if(member.lastMessageAtMs>now-1500)fail('resource-exhausted','메시지는 잠시 간격을 두고 보내 주세요.');
        messages.push({id:input.messageId,uid,displayName:self.displayName||'공부 친구',text,atMs:now});member.lastMessageAtMs=now;
        if(messages.length>50)messages.shift();
      }
    }
    members[uid]=member;
    for(const value of Object.values(members))value.position=freePosition(room,value.position);
    // Fetch only approved members; removed friendships lose presence on the next sync.
    const memberIds=Object.keys(members),friendRefs=memberIds.filter(id=>id!==host).map(id=>db.doc(`users/${host}/friends/${id}`)),friends=friendRefs.length?await tx.getAll(...friendRefs):[];
    let cursor=0;for(const id of memberIds)if(id!==host&&!friends[cursor++].exists)delete members[id];
    let games=pruneWorldGames(record.games,members,now);
    if(action==='emote'){
      if(!Object.hasOwn(ROOM_EMOTES,input.emote))fail('invalid-argument','표현할 이모지를 선택해 주세요.');
      if(member.emoteAtMs>now-800)fail('resource-exhausted','잠시 후 다시 이모지를 보내 주세요.');
      member.emote=input.emote;member.emoteAtMs=now;member.emoteExpiresAtMs=now+4500;
    }
    if(action.startsWith('rps'))games=changeWorldGame(games,uid,input,members,now);
    const profiles=await tx.getAll(...Object.keys(members).map(id=>user(db,id)));
    if(action==='accept')tx.delete(invitation(db,uid,host));
    tx.set(ref,{members,messages,games,...(record.liveRoom?{liveRoom:record.liveRoom,liveRoomAtMs:record.liveRoomAtMs}:{})});
    return {host,displayName:owner.displayName||'공부 친구',room,messages,game:worldGameForViewer(games,uid),participants:Object.keys(members).map((id,index)=>({uid:id,displayName:profiles[index].data()?.displayName||'공부 친구',avatar:profiles[index].data()?.avatar||{},position:members[id].position,...(members[id].emoteExpiresAtMs>now?{emote:members[id].emote,emoteAtMs:members[id].emoteAtMs,emoteExpiresAtMs:members[id].emoteExpiresAtMs}:{})})),serverNowMs:now};
  });
}
export async function studyWorldInvites(db,uid,now=Date.now()){
  const snapshots=await user(db,uid).collection('studyWorldInvites').limit(48).get();
  return {invites:snapshots.docs.map(doc=>doc.data()).filter(invite=>invite.expiresAtMs>now).map(({host,displayName,expiresAtMs})=>({host,displayName,expiresAtMs}))};
}
