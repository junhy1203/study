import {Timestamp,FieldValue} from './platform-store.js';
// Operator-only grants; keep the requested 90,000-hour maximum explicit.
export const MAX_FOCUS_BONUS_SECONDS=90000*3600;
export async function grantFocusBonus(db,{uid,seconds,requestId}){
  if(typeof uid!=='string'||!uid||uid.includes('/')||!Number.isSafeInteger(seconds)||seconds<=0||seconds>MAX_FOCUS_BONUS_SECONDS||typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))throw new Error('Invalid bonus grant');
  const profileRef=db.doc(`users/${uid}`),walletRef=db.doc(`users/${uid}/stats/focusTime`),receiptRef=db.doc(`users/${uid}/focusTimeTransactions/bonus_${requestId}`);
  return db.runTransaction(async tx=>{
    const [profile,wallet,receipt]=await tx.getAll(profileRef,walletRef,receiptRef);
    if(!profile.exists)throw new Error('Study profile not found');
    const balance=wallet.data()?.balanceSeconds||0;
    if(receipt.exists){if(receipt.data().seconds!==seconds)throw new Error('Grant ID already used for another amount');return {uid,seconds,balanceSeconds:balance,alreadyGranted:true};}
    const now=Timestamp.now();
    tx.update(profileRef,{focusRevision:FieldValue.increment(1),updatedAt:now});
    tx.set(walletRef,{balanceSeconds:balance+seconds,bonusSeconds:FieldValue.increment(seconds),updatedAt:now},{merge:true});
    tx.create(receiptRef,{type:'bonus',seconds,reason:'운영자 Focus Time 지급',requestId,createdAt:now});
    return {uid,seconds,previousBalanceSeconds:balance,balanceSeconds:balance+seconds,alreadyGranted:false};
  });
}
