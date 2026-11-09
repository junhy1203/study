// Temporal policy: no images, networking, storage, or user calibration.
import { createIdleTracker } from './camera-idle.js?v=20261024-10';
import { createPhoneTracker } from './camera-phone.js?v=20261103-privateui1';
import { createVerificationPolicy, VERIFICATION_LIMITS } from './camera-verification.js?v=20261109-pitch1';
export const FOCUS_LIMITS = Object.freeze({ identity: 90000, faceGrace: VERIFICATION_LIMITS.away, headIdle:15000, sleep: 4500, eyeReopen: 750, phone: 750, away: VERIFICATION_LIMITS.away, idle: 15000, resume: 2000, gap: 3000 });
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
  const headIdle = createIdleTracker(FOCUS_LIMITS.headIdle);
  let trackingNow = false;
  let lastSignals = null, lastFaceTime = null, coordinateScope;
  let missingSince = null;
  let phoneObservationId=null,phonePositives=0;
  let phoneTracker=createPhoneTracker(),phoneState=null;
  let behaviorSince={sleep:null,phone:null,away:null};
  let eyesOpenSince=null;
  let identityKnown=false,resumeOnFace=false;
  const verification=createVerificationPolicy();
  let verificationState=null;
  function reset(preserveOwner=false,reverify=true) {
    if(reverify)verification.reset(preserveOwner);else verification.suspend();verificationState=null;
    const keepIdentity=preserveOwner&&identityKnown;
    lastTime = candidate = since = healthySince = warning = null;
    idle.reset();headIdle.reset();
    trackingNow = false;
    lastSignals = lastFaceTime = null;
    coordinateScope=undefined;
    missingSince = null;
    phoneObservationId=null;phonePositives=0;
    phoneTracker=createPhoneTracker();phoneState=null;
    behaviorSince={sleep:null,phone:null,away:null};
    eyesOpenSince=null;
    identityKnown=keepIdentity;resumeOnFace=false;
  }
  function updateCore(signals, now, freshFace, verifiedNow) {
    if(freshFace)lastFaceTime=now;
    if(freshFace&&signals?.coordinateScope!==undefined&&coordinateScope!==signals.coordinateScope){
      if(coordinateScope!==undefined){
        idle.reset();headIdle.reset();phoneTracker=createPhoneTracker();
        phoneObservationId=null;phonePositives=0;behaviorSince.phone=null;
      }
      coordinateScope=signals.coordinateScope;
    }
    const faceTime=lastFaceTime;
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
    const present = visible;
    const identity=signals?.identity;
    identityKnown ||= Boolean(identity);
    const enrolling=identity && (identity.enrolled===false || identity.status==='enrolling');
    const headDown=visible&&signals.headDown===true;
    const observations={sleep:visible&&!headDown&&signals.eyesClosed,phone:valid&&phoneActive,away:valid&&!present};
    const observeIdle=visible && !headDown && !signals.eyesClosed;
    let idleState=idle.state(faceTime);
    if(freshFace){
      if(headDown)headIdle.update({...signals,gazeValid:signals.gazeValid&&!signals.eyesClosed},now);
      else headIdle.reset();
      if(headDown)idle.reset();
      // Bridge short false-open runs without confirming sleep on an open frame.
      if(!visible||headDown){behaviorSince.sleep=null;eyesOpenSince=null;}
      else if(observations.sleep){
        if(eyesOpenSince!==null&&now-eyesOpenSince>=FOCUS_LIMITS.eyeReopen)behaviorSince.sleep=null;
        behaviorSince.sleep??=now;
        eyesOpenSince=null;
        if(!trackingNow||warning)healthySince=null;
      }else if(behaviorSince.sleep!==null){
        eyesOpenSince??=now;
        if(now-eyesOpenSince>=FOCUS_LIMITS.eyeReopen){behaviorSince.sleep=null;eyesOpenSince=null;}
      }
      behaviorSince.away=observations.away?behaviorSince.away??now:null;
      const faceReturned=visible&&missingSince!==null&&resumeOnFace;
      missingSince = !present ? missingSince ?? now : null;
      if(!present&&warning)healthySince=null;
      if(faceReturned){
        resumeOnFace=false;
        // Brief losses can return immediately; a confirmed pause must recover normally.
        healthySince=warning?null:now-FOCUS_LIMITS.resume;
      }
      if (!valid || !visible || missingSince !== null && now-missingSince >= FOCUS_LIMITS.away) idle.reset();
      if(!observeIdle)idle.pauseGaze();
      idleState=observeIdle ? idle.update(signals, now) : idle.state(now);
    }
    behaviorSince.phone=observations.phone?behaviorSince.phone??now:null;
    const elapsedFor=key=>behaviorSince[key]===null?0:(key==='phone'?now:faceTime)-behaviorSince[key];
    const phoneConfirmed=valid&&phoneActive&&(tracked||elapsedFor('phone')>=FOCUS_LIMITS.phone&&(!observation||phonePositives>=2));
    // Expired evidence is an observation failure, never a fresh negative or an old phone claim.
    if(tracked&&phoneState.status==='unavailable'&&warning==='phone')warning=null;
    if(verificationState?.poseHeld&&!phoneConfirmed){
      resumeOnFace ||= trackingNow;
      healthySince=null;trackingNow=false;
      return {tracking:false,status:'paused',reason:warning||'unknown',message:warning?FOCUS_MESSAGES[warning]:FOCUS_MESSAGES.unknown};
    }
    // Hold tracking during brief detection gaps while waiting for the next face observation.
    if(!present&&(trackingNow||resumeOnFace||identityKnown)&&!enrolling&&!phoneConfirmed){
      resumeOnFace ||= trackingNow;
      const expired=faceTime-missingSince>=FOCUS_LIMITS.faceGrace;
      if(expired){healthySince=null;trackingNow=false;warning='away';}
      const tracking=identityKnown&&trackingNow&&!warning;
      return {tracking,status:warning?'paused':tracking?'tracking':'scanning',reason:warning,
        identityWarning:false,message:warning?FOCUS_MESSAGES[warning]:'카메라에서 얼굴이 잠시 벗어났습니다.'};
    }
    if(!valid && identityKnown){
      healthySince=null;trackingNow=false;warning=null;
      return {tracking:false,status:'scanning',reason:'identity',identityWarning:false,message:'인식 중…'};
    }
    if(enrolling){
      healthySince=null;trackingNow=false;warning=null;
      return {tracking:false,status:'scanning',reason:'identity',identityWarning:false,message:'얼굴 등록 중 · 촬영과 저장을 완료해 주세요'};
    }
    const sleepConfirmed=headDown ? headIdle.state(faceTime).confirmed : observations.sleep&&elapsedFor('sleep')>=FOCUS_LIMITS.sleep;
    const awayConfirmed=valid&&!present&&elapsedFor('away')>=FOCUS_LIMITS.away;
    const reason = !valid || phoneUnavailable ? 'unknown' : phoneConfirmed ? 'phone' : sleepConfirmed ? 'sleep' : awayConfirmed ? 'away' : idleState.confirmed ? 'idle' : phoneActive ? 'phone' : !present ? 'away' :
      observations.sleep ? 'sleep' :
      !present ? 'unknown' : null;
    if (reason) {
      if (candidate !== reason) { candidate = reason; since = now; }
      // Confirm the behavior first; the warning and pause must always happen together.
      const elapsed=behaviorSince[reason]!=null?elapsedFor(reason):now-since;
      const confirmed = reason==='phone'&&tracked ? phoneConfirmed : (reason === 'sleep' && sleepConfirmed || reason === 'idle' || reason === 'unknown' || elapsed >= FOCUS_LIMITS[reason]) && (reason!=='phone' || !observation || phonePositives>=2);
      if (!confirmed) {
        return { tracking: trackingNow && !warning, status: warning ? 'paused' : trackingNow ? 'tracking' : 'scanning',
          reason: warning, message: warning ? FOCUS_MESSAGES[warning] : trackingNow ? '학습 중 · 집중 시간 측정' : '학습 시작을 준비하는 중…' };
      }
      healthySince = null; trackingNow = false;
      if (confirmed) warning = reason;
      return { tracking: false, status: warning ? 'paused' : 'scanning', reason: warning || reason,
        message: reason==='unknown'&&phoneUnavailable&&valid ? '휴대폰 인식 응답을 확인할 수 없습니다 · 인식되면 자동 재개됩니다' : warning ? FOCUS_MESSAGES[warning] : '행동 확인 중 · 학습시간 일시정지' };
    }
    candidate = since = null;
    healthySince ??= verifiedNow ? now-FOCUS_LIMITS.resume : now;
    const tracking = freshFace ? now - healthySince >= FOCUS_LIMITS.resume : trackingNow;
    trackingNow = tracking;
    if (tracking) warning = null;
    return { tracking, status: tracking ? 'tracking' : warning ? 'paused' : 'scanning', reason: warning,
      message: tracking ? '학습 중 · 집중 시간 측정' : warning ? '학습 상태를 확인하고 있습니다. 확인되면 자동으로 재개합니다.' : '학습 시작을 준비하는 중…' };
  }
  function getDebug() {
    if (lastTime === null) return null;
    const idleState = idle.state(lastTime);
    const headIdleState = headIdle.state(lastFaceTime);
    const ready = lastSignals?.reliable && lastSignals.face;
    const idleBlocked = !ready ? '얼굴 확인 필요' : lastSignals.studyActivity ? '학습 동작 감지' :
      !lastSignals.activityVector ? '얼굴 방향 확인 필요' : null;
    const rows = ['sleep', 'phone', 'away', 'idle'].map(key => {
      const loweredHead=key==='sleep'&&lastSignals?.headDown===true;
      const active = loweredHead ? headIdleState.eligible : key === 'idle' ? Boolean(idleState.eligible && !idleBlocked) : behaviorSince[key]!==null;
      const elapsedMs = active ? loweredHead ? headIdleState.elapsedMs : key === 'idle' ? idleState.elapsedMs : Math.max(0, lastTime - behaviorSince[key]) : 0;
      const pauseAfterMs = loweredHead ? FOCUS_LIMITS.headIdle : FOCUS_LIMITS[key];
      return { key, active, elapsedMs, pauseAfterMs, pauseRemainingMs: Math.max(0, pauseAfterMs - elapsedMs),
        warningAfterMs: pauseAfterMs, warningRemainingMs: Math.max(0, pauseAfterMs - elapsedMs),
        blocked: key === 'idle' ? idleBlocked : null };
    });
    const returning=verificationState?.phase==='returning';
    return { rows, warning, verification:verificationState, phoneEvidence: lastSignals?.phoneEvidence, phoneObservation:lastSignals?.phoneObservation, phoneState, phoneDiagnostics:phoneTracker.diagnostics(), gaze: idleState.gaze, identity:lastSignals?.identity,
      returnCountdown: returning ? {remainingMs:verificationState.returnRemainingMs,durationMs:VERIFICATION_LIMITS.returnDelay,observedAt:lastFaceTime} : null,
      resumeRemainingMs: healthySince === null ? null : Math.max(0, FOCUS_LIMITS.resume - (lastTime - healthySince)) };
  }
  function update(signals,now){
    if(!Number.isFinite(now))throw new TypeError('A monotonic timestamp is required');
    // Run gap handling before consuming the current verification observation.
    if(lastTime!==null&&(now<lastTime||now-lastFaceTime>Math.max(FOCUS_LIMITS.gap,FOCUS_LIMITS.faceGrace)))reset(true);
    const wasVerified=verificationState?.phase==='verified';
    verificationState=identityKnown||signals?.identity?verification.update(signals,now):null;
    return decide(signals,now,true,!wasVerified&&verificationState?.phase==='verified');
  }
  function updatePhone(observation,now){
    if(lastFaceTime===null||!Number.isFinite(now)||now<lastTime||now-lastFaceTime>FOCUS_LIMITS.gap)return null;
    return decide({...lastSignals,phoneObservation:observation},now,false);
  }
  function decide(signals,now,freshFace,verifiedNow=false){
    const previousWarning=warning;
    const result=updateCore(signals,now,freshFace,verifiedNow);
    if(freshFace&&result.tracking&&['sleep','phone','idle'].includes(previousWarning)&&verificationState?.phase==='verified'){
      verification.requireVerification('behavior');
      // Start the attempt after recovery. The current frame can still carry the cached match.
      verificationState=verification.update({...signals,identity:{...signals.identity,matched:false}},now);
    }
    if(identityKnown&&signals?.identity?.enrolled!==false&&signals?.identity?.status!=='enrolling'&&verificationState.required){
      trackingNow=false;healthySince=null;
      const {phase,reason}=verificationState;
      const failed=phase==='failed';
      return {tracking:false,status:phase==='scanning'?'scanning':'paused',reason:reason==='away'||phase==='waiting'?'away':'identity',identityWarning:failed,verification:verificationState,
        message:phase==='waiting'?(reason==='away'?FOCUS_MESSAGES.away:'카메라에 얼굴이 보이도록 앉아 주세요.'):phase==='returning'?'복귀 확인 중 · 카메라를 바라봐 주세요':
          failed?'얼굴을 확인하지 못했습니다. 잠시 후 다시 시도합니다.':'얼굴인식 중 · 카메라를 바라봐 주세요'};
    }
    return {...result,verification:verificationState};
  }
  return { update, updatePhone, reset, getDebug };
}
