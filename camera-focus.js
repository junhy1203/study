// Temporal policy: no images, networking, storage, or user calibration.
import { createIdleTracker } from './camera-idle.js?v=20261024-10';
import { createPhoneTracker } from './camera-phone.js?v=20261103-privateui1';
import { createVerificationPolicy } from './camera-verification.js?v=20261104-1';
export const FOCUS_LIMITS = Object.freeze({ identity: 90000, faceGrace: 1500, headIdle:30000, sleep: 4500, eyeReopen: 750, phone: 750, away: 1500, idle: 15000, resume: 2000, gap: 3000 });
export const FOCUS_MESSAGES = Object.freeze({
  sleep: '수면·졸음 감지 · 눈을 뜨고 학습하면 자동 재개됩니다',
  phone: '휴대폰 사용 감지 · 휴대폰을 내려놓으면 자동 재개됩니다',
  away: '자리 이탈 감지 · 얼굴 재인증 후 재개됩니다',
  idle: '장시간 움직임·학습 행동 없음 · 학습 행동이 돌아오면 자동 재개됩니다',
  unknown: '얼굴을 확인할 수 없습니다 · 인식되면 자동 재개됩니다',
  identity: '본인 얼굴을 다시 확인해 주세요',
});
export function createFocusTracker() {
  let lastTime = null, candidate = null, since = null, healthySince = null, warning = null;
  const idle = createIdleTracker(FOCUS_LIMITS.idle);
  let trackingNow = false;
  let lastSignals = null;
  let missingSince = null;
  let phoneObservationId=null,phonePositives=0;
  let phoneTracker=createPhoneTracker(),phoneState=null;
  let behaviorSince={sleep:null,phone:null,away:null};
  let eyesOpenSince=null;
  let identityKnown=false,resumeOnFace=false;
  let headAnchor=null,headMotionAt=null;
  const verification=createVerificationPolicy();
  let verificationState=null;
  function reset(preserveOwner=false,reverify=true) {
    if(reverify)verification.reset(preserveOwner);else verification.suspend();verificationState=null;
    const keepIdentity=preserveOwner&&identityKnown;
    lastTime = candidate = since = healthySince = warning = null;
    idle.reset();
    trackingNow = false;
    lastSignals = null;
    missingSince = null;
    phoneObservationId=null;phonePositives=0;
    phoneTracker=createPhoneTracker();phoneState=null;
    behaviorSince={sleep:null,phone:null,away:null};
    eyesOpenSince=null;
    identityKnown=keepIdentity;resumeOnFace=false;
    headAnchor=null;headMotionAt=null;
  }
  function updateCore(signals, now) {
    if (!Number.isFinite(now)) throw new TypeError('A monotonic timestamp is required');
    if (lastTime !== null && (now < lastTime || now - lastTime > Math.max(FOCUS_LIMITS.gap,FOCUS_LIMITS.faceGrace))) reset(true);
    lastTime = now;
    lastSignals = signals;
    const observation=signals?.phoneObservation;
    const tracked=signals?.phonePolicy==='tracked'||observation?.version===2;
    phoneState=tracked?phoneTracker.observe(observation,now):null;
    if(!tracked && observation && observation.id!==phoneObservationId) {
      phoneObservationId=observation.id;
      phonePositives=observation.positive && observation.ageMs<=1500 ? phonePositives+1 : 0;
    }
    if(!tracked && observation && observation.ageMs>1500)phonePositives=0;
    const valid = signals?.reliable === true;
    const phoneUnavailable=phoneState?.status==='unavailable';
    const phoneActive=tracked?phoneState.confirmed:signals?.phoneUse;
    const visible = valid && signals.face;
    const present = valid && (signals.head ?? signals.face);
    if(!present||visible){headAnchor=null;headMotionAt=null;}
    else if(Array.isArray(signals.headPosition)&&signals.headPosition.length===2&&signals.headPosition.every(Number.isFinite)){
      if(!headAnchor||Math.hypot(...signals.headPosition.map((v,i)=>v-headAnchor[i]))>=.018){headAnchor=[...signals.headPosition];headMotionAt=now;}
    }else headMotionAt??=now;
    const headSleeping=present&&!visible&&headMotionAt!==null&&now-headMotionAt>=FOCUS_LIMITS.headIdle;
    const identity=signals?.identity;
    identityKnown ||= Boolean(identity);
    const ownerReady=!identityKnown || valid&&signals.face&&identity?.matched===true;
    const enrolling=identity && (identity.enrolled===false || identity.status==='enrolling');
    const observations={sleep:visible&&signals.eyesClosed,phone:valid&&phoneActive,away:valid&&!present};
    // Bridge short false-open runs without confirming sleep on an open frame.
    // Missing faces and reset still discard all closure evidence immediately.
    if(!visible){behaviorSince.sleep=null;eyesOpenSince=null;}
    else if(observations.sleep){
      if(eyesOpenSince!==null&&now-eyesOpenSince>=FOCUS_LIMITS.eyeReopen)behaviorSince.sleep=null;
      behaviorSince.sleep??=now;
      eyesOpenSince=null;
      if(!trackingNow||warning)healthySince=null;
    }else if(behaviorSince.sleep!==null){
      eyesOpenSince??=now;
      if(now-eyesOpenSince>=FOCUS_LIMITS.eyeReopen){behaviorSince.sleep=null;eyesOpenSince=null;}
    }
    for(const key of ['phone','away'])behaviorSince[key]=observations[key]?behaviorSince[key]??now:null;
    const faceReturned=visible&&missingSince!==null&&resumeOnFace;
    missingSince = !present ? missingSince ?? now : null;
    if(!present&&warning)healthySince=null;
    if(faceReturned){
      resumeOnFace=false;
      // Brief losses can return immediately; a confirmed pause must recover normally.
      healthySince=warning?null:now-FOCUS_LIMITS.resume;
    }
    if (!valid || !visible || missingSince !== null && now-missingSince >= FOCUS_LIMITS.away) idle.reset();
    const observeIdle=visible && !signals.eyesClosed;
    if(!observeIdle)idle.pauseGaze();
    const idleState = observeIdle ? idle.update(signals, now) : idle.state(now);
    const elapsedFor=key=>behaviorSince[key]===null?0:now-behaviorSince[key];
    const phoneConfirmed=valid&&phoneActive&&(tracked||elapsedFor('phone')>=FOCUS_LIMITS.phone&&(!observation||phonePositives>=2));
    // Expired evidence is an observation failure, never a fresh negative or an old phone claim.
    if(tracked&&phoneState.status==='unavailable'&&warning==='phone')warning=null;
    // No visible face takes priority over the longer owner-verification grace.
    if(!present&&(trackingNow||resumeOnFace||identityKnown)&&!enrolling&&!phoneConfirmed){
      resumeOnFace ||= trackingNow;
      const expired=now-missingSince>=FOCUS_LIMITS.faceGrace;
      if(expired){healthySince=null;trackingNow=false;warning='away';}
      const tracking=identityKnown&&trackingNow&&!warning;
      return {tracking,status:warning?'paused':tracking?'tracking':'scanning',reason:warning,
        identityWarning:false,message:warning?FOCUS_MESSAGES[warning]:'머리 위치 확인 중 · 1.5초 이상 이탈하면 얼굴 재인증이 필요해요'};
    }
    if(!valid && identityKnown){
      healthySince=null;trackingNow=false;warning=null;
      return {tracking:false,status:'scanning',reason:'identity',identityWarning:false,message:'인식 중…'};
    }
    if(enrolling){
      healthySince=null;trackingNow=false;warning=null;
      return {tracking:false,status:'scanning',reason:'identity',identityWarning:false,message:'얼굴 등록 중 · 촬영과 저장을 완료해 주세요'};
    }
    if(headSleeping){healthySince=null;trackingNow=false;warning='sleep';return {tracking:false,status:'paused',reason:'sleep',message:'머리 움직임이 30초간 없어 수면으로 일시정지 · 움직이거나 얼굴을 보여 주세요'};}
    const sleepConfirmed=visible&&signals.eyesClosed&&elapsedFor('sleep')>=FOCUS_LIMITS.sleep;
    const awayConfirmed=valid&&!present&&elapsedFor('away')>=FOCUS_LIMITS.away;
    const reason = !valid || phoneUnavailable ? 'unknown' : phoneConfirmed ? 'phone' : sleepConfirmed ? 'sleep' : awayConfirmed ? 'away' : idleState.confirmed ? 'idle' : phoneActive ? 'phone' : !present ? 'away' :
      signals.eyesClosed && signals.face ? 'sleep' :
      !present ? 'unknown' : null;
    if (reason) {
      if (candidate !== reason) { candidate = reason; since = now; }
      // Confirm the behavior first; the warning and pause must always happen together.
      const elapsed=behaviorSince[reason]!=null?now-behaviorSince[reason]:now-since;
      const confirmed = reason==='phone'&&tracked ? phoneConfirmed : (reason === 'idle' || reason === 'unknown' || elapsed >= FOCUS_LIMITS[reason]) && (reason!=='phone' || !observation || phonePositives>=2);
      if (!confirmed) {
        return { tracking: trackingNow && !warning, status: warning ? 'paused' : trackingNow ? 'tracking' : 'scanning',
          reason: warning, message: warning ? FOCUS_MESSAGES[warning] : trackingNow ? '학습 행동 인식 중 · 집중 시간 측정' : '학습 행동 확인 중 · 자동 시작 준비' };
      }
      healthySince = null; trackingNow = false;
      if (confirmed) warning = reason;
      return { tracking: false, status: warning ? 'paused' : 'scanning', reason: warning || reason,
        message: reason==='unknown'&&phoneUnavailable&&valid ? '휴대폰 인식 응답을 확인할 수 없습니다 · 인식되면 자동 재개됩니다' : warning ? FOCUS_MESSAGES[warning] : '행동 확인 중 · 학습시간 일시정지' };
    }
    candidate = since = null;
    healthySince ??= now;
    const tracking = now - healthySince >= FOCUS_LIMITS.resume;
    trackingNow = tracking;
    if (tracking) warning = null;
    return { tracking, status: tracking ? 'tracking' : warning ? 'paused' : 'scanning', reason: warning,
      message: tracking ? identity&&!ownerReady?'본인 확인 중 · 집중 시간 측정':'학습 행동 인식 중 · 집중 시간 측정' : warning ? `${FOCUS_MESSAGES[warning]} · 복귀 확인 중` : '학습 행동 확인 중 · 자동 시작 준비' };
  }
  function getDebug() {
    if (lastTime === null) return null;
    const idleState = idle.state(lastTime);
    const ready = lastSignals?.reliable && lastSignals.face;
    const idleBlocked = !ready ? '얼굴 확인 필요' : lastSignals.studyActivity ? '학습 동작 감지' :
      !lastSignals.activityVector ? '얼굴 방향 확인 필요' : null;
    const rows = ['sleep', 'phone', 'away', 'idle'].map(key => {
      const active = key === 'idle' ? Boolean(idleState.eligible && !idleBlocked) : behaviorSince[key]!==null;
      const elapsedMs = active ? key === 'idle' ? idleState.elapsedMs : Math.max(0, lastTime - behaviorSince[key]) : 0;
      const pauseAfterMs = FOCUS_LIMITS[key];
      return { key, active, elapsedMs, pauseAfterMs, pauseRemainingMs: Math.max(0, pauseAfterMs - elapsedMs),
        warningAfterMs: FOCUS_LIMITS[key], warningRemainingMs: Math.max(0, FOCUS_LIMITS[key] - elapsedMs),
        blocked: key === 'idle' ? idleBlocked : null };
    });
    return { rows, warning, verification:verificationState, phoneEvidence: lastSignals?.phoneEvidence, phoneObservation:lastSignals?.phoneObservation, phoneState, phoneDiagnostics:phoneTracker.diagnostics(), gaze: idleState.gaze, identity:lastSignals?.identity,
      resumeRemainingMs: healthySince === null ? null : Math.max(0, FOCUS_LIMITS.resume - (lastTime - healthySince)) };
  }
  function update(signals,now){
    if(!Number.isFinite(now))throw new TypeError('A monotonic timestamp is required');
    // Run gap handling before consuming the current verification observation.
    if(lastTime!==null&&(now<lastTime||now-lastTime>Math.max(FOCUS_LIMITS.gap,FOCUS_LIMITS.faceGrace)))reset(true);
    verificationState=verification.update(signals,now);
    const result=updateCore(signals,now);
    if(identityKnown&&signals?.identity?.enrolled!==false&&signals?.identity?.status!=='enrolling'&&verificationState.required){
      trackingNow=false;healthySince=null;
      const failed=verificationState.phase==='failed';
      const absent=verificationState.reason==='away'&&!signals?.face;
      return {tracking:false,status:failed||absent?'paused':'scanning',reason:verificationState.reason==='away'?'away':'identity',identityWarning:failed,verification:verificationState,
        message:failed?'얼굴이 일치하지 않습니다 · 1.5초 후 다시 확인합니다':'Face ID · 카메라를 바라봐 주세요'};
    }
    return {...result,verification:verificationState};
  }
  return { update, reset, getDebug };
}
