import {HttpsError} from './platform-http.js';
import {Timestamp,FieldValue} from './platform-store.js';
import {spendFocusTime} from './focus-time.js';
import {AVATAR_CATALOG,avatarItem,ownedAvatarItems} from './avatar-catalog.js';
import {friendHighlights} from './friend-highlights.js';
import {validateRoom} from './study-room.js';

export const SCHOLARS=Object.freeze(['아인슈타인','뉴턴','마리 퀴리','다빈치','다윈','갈릴레이','테슬라','앨런 튜링','에이다 러브레이스','라마누잔','파인만','파스퇴르','장영실','정약용','세종대왕','캐서린 존슨']);
export const AVATARS=Object.freeze(AVATAR_CATALOG.filter(item=>item.slot==='character').map(item=>item.value));
export function avatarInput(value={}){
  if(!['character','hat','glasses','effect'].every(slot=>avatarItem(slot,value[slot]))||!avatarItem('background',value.background||'none')||!avatarItem('accessory',value.accessory===undefined?'none':value.accessory))throw new HttpsError('invalid-argument','아바타 옵션을 확인해 주세요.');
  return {character:value.character,hat:value.hat,glasses:value.glasses,effect:value.effect,...(value.background?{background:value.background}:{}),...(value.accessory!==undefined?{accessory:value.accessory}:{})};
}
export async function savePlayProfile(db,uid,input){
  if(input&&Object.hasOwn(input,'studyRoom')){
    let studyRoom;try{studyRoom=validateRoom(input.studyRoom);}catch(error){throw new HttpsError('invalid-argument',error.message);}
    const ref=db.doc(`users/${uid}`);
    await db.runTransaction(async tx=>{if(!(await tx.get(ref)).data())throw new HttpsError('not-found','프로필이 없습니다.');tx.update(ref,{studyRoom,updatedAt:Timestamp.now()});});
    return {studyRoom};
  }
  const avatar=avatarInput(input?.avatar),bio=String(input?.bio||'').trim();
  if(bio.length>100||/[\p{Cc}\p{Cf}]/u.test(bio))throw new HttpsError('invalid-argument','소개는 100자 이내로 입력해 주세요.');
  const ref=db.doc(`users/${uid}`);
  await db.runTransaction(async tx=>{
    const profile=(await tx.get(ref)).data();if(!profile)throw new HttpsError('not-found','프로필이 없습니다.');
    const inventory=ownedAvatarItems(profile);
    if(Object.entries(avatar).some(([slot,value])=>!inventory.includes(avatarItem(slot,value).id)))throw new HttpsError('permission-denied','먼저 상점에서 아이템을 구매해 주세요.');
    tx.update(ref,{avatar,bio,avatarInventory:inventory,updatedAt:Timestamp.now()});
  });
  return {avatar,bio};
}
export async function readPlayProfile(db,uid,target=uid){
  if(typeof target!=='string'||!target||target.includes('/')||target.length>128)throw new HttpsError('invalid-argument','프로필을 선택해 주세요.');
  if(target!==uid&&!(await db.doc(`users/${uid}/friends/${target}`).get()).exists)throw new HttpsError('permission-denied','친구의 프로필만 볼 수 있습니다.');
  const profile=(await db.doc(`users/${target}`).get()).data();
  if(!profile)throw new HttpsError('not-found','프로필이 없습니다.');
  const focusBalanceSeconds=target===uid?(await db.doc(`users/${uid}/stats/focusTime`).get()).data()?.balanceSeconds||0:undefined;
  const dates=Array.from({length:7},(_,i)=>new Date(Date.now()+9*3600000-i*86400000).toISOString().slice(0,10));
  const records=await db.getAll(db.doc(`users/${target}/stats/summary`),...dates.map(date=>db.doc(`users/${target}/dailyStats/${date}`)));
  const seconds=row=>Math.max(0,Number(row?.totalSeconds)||0),days=records.slice(1).map((doc,i)=>({date:dates[i],seconds:seconds(doc.data())}));
  const studyStats={totalSeconds:seconds(records[0].data()),todaySeconds:days[0].seconds,weekSeconds:days.reduce((sum,day)=>sum+day.seconds,0),days};
  const viewer=target===uid?profile:(await db.doc(`users/${uid}`).get()).data()||{};
  const highlights=await friendHighlights(db,{...viewer,uid},[{uid:target,profile}]);
  return {uid:target,displayName:profile.displayName,avatar:profile.avatar||{character:'sprout',hat:'none',glasses:'none',effect:'none'},bio:profile.bio||'',personality:profile.studyPersonality||null,studyStats,friendSummary:highlights.get(target),...(target===uid?{studyRoom:profile.studyRoom||null,focusBalanceSeconds,phoneBalanceSeconds:profile.phoneBalanceSeconds||0,avatarInventory:ownedAvatarItems(profile)}:{})};
}
export async function purchaseAvatar(db,uid,input){
  const item=AVATAR_CATALOG.find(row=>row.id===input?.itemId);
  if(!item)throw new HttpsError('invalid-argument','판매 중인 아이템을 선택해 주세요.');
  const profileRef=db.doc(`users/${uid}`),walletRef=db.doc(`users/${uid}/stats/focusTime`),receiptRef=db.doc(`users/${uid}/focusTimeTransactions/avatar_${item.id}`);
  return db.runTransaction(async tx=>{
    const [profile,wallet,receipt]=await tx.getAll(profileRef,walletRef,receiptRef);
    if(!profile.exists)throw new HttpsError('not-found','프로필이 없습니다.');
    const inventory=ownedAvatarItems(profile.data()),balance=wallet.data()?.balanceSeconds||0;
    if(inventory.includes(item.id)||receipt.exists)return {avatarInventory:inventory,balanceSeconds:balance,alreadyOwned:true};
    if(balance<item.costSeconds)throw new HttpsError('failed-precondition','Focus Time이 부족합니다.');
    const now=Timestamp.now();inventory.push(item.id);
    tx.update(profileRef,{avatarInventory:inventory,focusRevision:FieldValue.increment(1),updatedAt:now});
    tx.set(walletRef,{balanceSeconds:balance-item.costSeconds,spentSeconds:FieldValue.increment(item.costSeconds),updatedAt:now},{merge:true});
    tx.create(receiptRef,{type:'spend',itemId:item.id,seconds:item.costSeconds,createdAt:now});
    return {avatarInventory:inventory,balanceSeconds:balance-item.costSeconds,previousBalanceSeconds:balance,spentSeconds:item.costSeconds,alreadyOwned:false};
  });
}
export async function buyPhoneTime(db,uid,input){
  const seconds=Number(input?.seconds);
  if(![300,900,1800].includes(seconds))throw new HttpsError('invalid-argument','구매 시간을 선택해 주세요.');
  // 60 Focus Time seconds buy 30 phone seconds. Retry with the same ID.
  const result=await spendFocusTime(db,{uid,purchaseId:input?.purchaseId,itemId:`phone_${seconds}`,costSeconds:seconds*2},tx=>{
    tx.update(db.doc(`users/${uid}`),{phoneBalanceSeconds:FieldValue.increment(seconds),focusRevision:FieldValue.increment(1)});
  });
  return {...result,phoneBalanceSeconds:(await db.doc(`users/${uid}`).get()).data()?.phoneBalanceSeconds||0};
}
export async function studyPersonality(db,uid,{force=false,generate,now=Date.now()}={}){
  const ref=db.doc(`users/${uid}`),lockId=`${now}_${Math.random()}`;
  const cached=await db.runTransaction(async tx=>{
    const profile=(await tx.get(ref)).data();
    if(!profile)throw new HttpsError('not-found','계정 프로필이 없습니다.');
    if(!force&&profile.studyPersonality?.nextUpdateAtMs>now)return profile.studyPersonality;
    if(profile.personalityLockUntilMs>now)throw new HttpsError('resource-exhausted','공부 성향을 분석하고 있습니다. 잠시 후 확인해 주세요.');
    if(force&&profile.personalityRequestedAtMs>now-60000)throw new HttpsError('resource-exhausted','다시 분석은 1분 후에 할 수 있습니다.');
    tx.update(ref,{personalityLockId:lockId,personalityLockUntilMs:now+120000,personalityRequestedAtMs:now});return null;
  });
  if(cached)return cached;
  try{
    const dates=Array.from({length:7},(_,i)=>new Date(now+9*3600000-i*86400000).toISOString().slice(0,10));
    const [days,profile,sessions]=await Promise.all([db.getAll(...dates.map(date=>db.doc(`users/${uid}/dailyStats/${date}`))),ref.get(),ref.collection('sessions').where('startedAt','>=',Timestamp.fromMillis(now-7*86400000)).limit(1000).get()]);
    const records=days.map((doc,i)=>({date:dates[i],seconds:doc.data()?.totalSeconds||0,subjects:doc.data()?.subjectSeconds||{}}));
    const total=records.reduce((s,r)=>s+r.seconds,0);
    if(total<=0)throw new HttpsError('failed-precondition','최근 7일 공부 기록이 쌓이면 공부 성향을 분석할 수 있어요.');
    const sessionCount=sessions.docs.filter(doc=>doc.data()?.status==='finished'&&doc.data()?.creditedSeconds>0).length;
    const answer=await generate({records,subjects:profile.data()?.subjects||[],sessionCount,scholars:SCHOLARS});
    let parsed;try{parsed=JSON.parse(answer.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw new HttpsError('unavailable','분석 결과를 읽지 못했습니다. 다시 시도해 주세요.');}
    if(!SCHOLARS.includes(parsed.scholar)||typeof parsed.reason!=='string'||parsed.reason.length<5||parsed.reason.length>500)throw new HttpsError('unavailable','분석 결과를 확인하지 못했습니다.');
    const result={scholar:parsed.scholar,reason:parsed.reason,generatedAtMs:now,nextUpdateAtMs:now+7*86400000};
    await db.runTransaction(async tx=>{const row=(await tx.get(ref)).data();if(row?.personalityLockId!==lockId)throw new HttpsError('aborted','다시 분석해 주세요.');tx.update(ref,{studyPersonality:result,personalityLockUntilMs:0});});
    return result;
  }catch(error){await db.runTransaction(async tx=>{if((await tx.get(ref)).data()?.personalityLockId===lockId)tx.update(ref,{personalityLockUntilMs:0});});throw error;}
}
