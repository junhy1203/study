import {HttpsError} from './platform-http.js';

// A request ID survives network retries; one account can run one device session.
export async function startPhoneSession(db, uid, input, now = Date.now()) {
  const deviceId = input?.deviceId, requestId = input?.requestId;
  if (!/^[a-f0-9-]{36}$/.test(deviceId || '') || !/^[a-f0-9-]{36}$/.test(requestId || ''))
    throw new HttpsError('invalid-argument', '기기 정보를 확인해 주세요.');
  const user = db.doc(`users/${uid}`), receipt = db.doc(`users/${uid}/phoneSessions/${requestId}`);
  return db.runTransaction(async tx => {
    const [profileSnap, receiptSnap] = await tx.getAll(user, receipt);
    if (!profileSnap.exists) throw new HttpsError('not-found', '계정 프로필이 없습니다.');
    const profile = profileSnap.data(), prior = receiptSnap.data();
    if (prior) {
      if (prior.deviceId !== deviceId) throw new HttpsError('permission-denied', '기기가 일치하지 않습니다.');
      return {...prior, serverNowMs: now};
    }
    const active = profile.phoneSession;
    if (active?.endsAtMs > now) {
      if (active.deviceId !== deviceId) throw new HttpsError('failed-precondition', '다른 기기에서 폰 시간을 사용 중입니다.');
      tx.create(receipt, active);
      return {...active, serverNowMs: now};
    }
    const balance = Number(profile.phoneBalanceSeconds || 0);
    if (!Number.isSafeInteger(balance) || balance < 300) throw new HttpsError('failed-precondition', '폰 시간이 5분 이상 필요합니다.');
    const session = {deviceId, endsAtMs: now + 300000, seconds: 300};
    tx.update(user, {phoneBalanceSeconds: balance - 300, phoneSession: session});
    tx.create(receipt, session);
    return {...session, serverNowMs: now};
  });
}
