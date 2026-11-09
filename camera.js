import { facePose, paintAvatar } from './camera-avatar.js?v=20261108-recovery2';
import { FACE_SUCCESS_MS } from './camera-face-effect.js?v=20261108-recovery2';
import {CONNECTION_MESSAGE,isNetworkFailure} from './network-errors.js?v=20261103-privateui1';
import { createFocusTracker } from './camera-focus.js?v=20261109-pitch1';
import { paintCameraDebug } from './camera-debug.js?v=20261104-1';
import {showToast} from './notifications.js?v=20261109-capsule1';
import {createStudyGuard} from './study-guard.js?v=20261106-guard1';
import {prepareFaceSession,waitForFaceSessionReady,waitForFaceVerification,faceWorkerContext,handleFaceWorkerRPC,handleFaceWorkerEvent,attachFacePreview,lockFaceSession} from './face-session.js?v=20261107-face-meals1';
// Raw frames stay off-screen; only derived behavior and tracking state reach the UI.
const focusTracker = createFocusTracker();
export const CAMERA_INFERENCE_INTERVAL_MS=400;
export const CAMERA_ENROLLMENT_INTERVAL_MS=80;
let nextInferenceAt=0;
let lastFrameRequestAt=-Infinity;
// Rollback switch: false selects the previous search and temporal policy together.
const phoneRedesign = true;
let latestFaceResult=null,latestPhoneObservation=null,latestPhoneSearch=null;
let reason = null;
let diagnostics = null;
const video = document.createElement('video');
video.autoplay = true;
video.muted = true;
video.playsInline = true;
video.setAttribute('aria-hidden', 'true');
video.className = 'cam-analysis-video';
let avatarPose = null;
let fallbackAttempted = false;
let stream, worker, loop, watchdog, loadingDeadline;
let videoFrameHandle=null;
let videoPlaying=false, startupToken=null;
let enabled = false, tracking = false, status = 'off', message = '얼굴 인식으로 학습 시작';
let identityPhase=null;
let verificationSuccessPending=false;
let ready = false, inFlight = false, lastResult = 0, revision = 0, lastVideoTime = -1, frameEpoch = 0;
let modelsPending = false;
let focusPanel, previousFocus, verificationDismissal;
let manuallyPaused = false;
let enrollmentOnly=false,unranked=false;
const studyGuard=createStudyGuard({window,document,now:()=>performance.now(),onChange:handleStudyGuard});
function handleStudyGuard({blocked}){
  if(!enabled||enrollmentOnly)return;
  if(blocked){
    frameEpoch++;cancelFrameLoop();inFlight=false;lastVideoTime=-1;
    focusTracker.reset(true);diagnostics=null;
    setStatus('paused','학습 화면을 벗어났습니다 · 일시정지');
  }else resumeCameraRecognition();
}
function cameraVisible(){return !document.hidden && !studyGuard.blocked;}
export function setCameraCompanion(_durationMs){
  // SP word ownership must not bypass this device's screen-presence policy.
  if(enabled && !cameraVisible())setStatus('paused','화면을 벗어났습니다 · 일시정지');
}
export const cameraController = crypto.randomUUID();
export function cameraState() { return { enabled, tracking, status, message, reason, manuallyPaused, identityPhase,enrollmentOnly,unranked,guardPauseAt:studyGuard.pauseAt }; }
export function toggleCameraPause() {
  if (!enabled) return;
  manuallyPaused = !manuallyPaused;
  if (manuallyPaused) {
    verificationSuccessPending=false;
    setStatus('paused', '수동 일시정지 · 재개 버튼을 눌러 주세요');
  } else resumeCameraRecognition(true);
}
export function openCameraFocus(origin) {
  if (focusPanel) return;
  const template = document.querySelector('#camera-focus-template');
  if (!template) return;
  previousFocus = origin;
  focusPanel = template.content.firstElementChild.cloneNode(true);
  const subject = document.querySelector('[data-study-subject]');
  const subjectName = subject?.selectedOptions[0]?.textContent || '학습';
  focusPanel.querySelector('[data-focus-subject]').textContent = subjectName;
  focusPanel.querySelector('[data-focus-current-subject]').textContent = subjectName;
  for (const metric of focusPanel.querySelectorAll('[data-time]')) {
    const source = document.querySelector(`.app > main [data-time="${metric.dataset.time}"]`);
    if (!source) continue;
    metric.textContent = source.textContent;
    metric.setAttribute('aria-busy', source.getAttribute('aria-busy') || 'false');
  }
  const streak = focusPanel.querySelector('[data-streak]');
  const sourceStreak = document.querySelector('.app > main [data-streak]');
  if (sourceStreak) {
    streak.textContent = sourceStreak.textContent;
    streak.setAttribute('aria-busy', sourceStreak.getAttribute('aria-busy') || 'false');
  }
  const retry=document.createElement('button');retry.type='button';retry.textContent='학습 시작 다시 시도';retry.hidden=true;
  retry.dataset.studyAction='start';retry.dataset.cameraToggle='';retry.dataset.cameraRetry='';
  focusPanel.querySelector('.timer-panel').append(retry);
  document.body.append(focusPanel);
  document.querySelector('.app').inert = true;
  document.documentElement.classList.add('camera-focus-open');
  // Commit the offscreen position before camera startup paints the first status.
  focusPanel.querySelector('[data-focus-verification]')?.getBoundingClientRect();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const item of focusPanel.querySelectorAll('.focus-header, .focus-content > :not(.focus-verification):not(dialog)')) {
      item.animate([{ opacity: 0, transform: 'translateY(48px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 420, easing: 'cubic-bezier(.22,.72,.26,1)' });
    }
  }
  focusPanel.querySelector('.cam-end').focus();
}
export async function closeCameraFocus() {
  const panel = focusPanel;
  if (!panel || panel.dataset.closing) return;
  panel.dataset.closing = 'true';
  clearTimeout(verificationDismissal);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const items = panel.querySelectorAll('.focus-header, .focus-content > :not(.focus-verification):not(dialog)');
    const animations = [...items].map(item => item.animate([
      { opacity: getComputedStyle(item).opacity, transform: getComputedStyle(item).transform },
      { opacity: 0, transform: 'translateY(48px)' },
    ], { duration: 300, fill: 'forwards', easing: 'cubic-bezier(.4,0,1,1)' }).finished.catch(() => {}));
    animations.push(panel.animate([{ opacity: 1 }, { opacity: 0 }], { delay: 180, duration: 180, fill: 'forwards', easing: 'ease-out' }).finished.catch(() => {}));
    await Promise.all(animations);
  }
  focusPanel = null;
  panel.remove(); document.querySelector('.app').inert = false;
  document.documentElement.classList.remove('camera-focus-open');
  previousFocus?.focus(); paint();
}

function paintFocusVerification(popup, verification, verified) {
  const available = enabled && !manuallyPaused && !studyGuard.blocked && status !== 'error' && !focusPanel.dataset.closing;
  const checking = available && (status === 'opening' || verification?.required ||
    status === 'scanning' && (unranked ? !diagnostics : identityPhase !== 'verified'));
  if (available && verified) {
    clearTimeout(verificationDismissal);
    popup.dataset.phase = 'success';
    const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 450 : FACE_SUCCESS_MS + 180;
    verificationDismissal = setTimeout(() => {
      popup.dataset.phase = 'hidden';
      paint();
    }, delay);
  } else if (!available || checking || popup.dataset.phase !== 'success') {
    clearTimeout(verificationDismissal);
    const phase = checking ? 'checking' : 'hidden';
    if (popup.dataset.phase !== phase) popup.dataset.phase = phase;
  }
  return popup.dataset.phase === 'success';
}

function paint() {
  const root = focusPanel?.querySelector('[data-camera]') || document.querySelector('.app > main [data-camera]');
  if (!root) return;
  root.dataset.state = status;
  root.dataset.reason = reason || '';
  root.dataset.identityPhase=identityPhase||'';
  root.classList.toggle('is-open', enabled);
  const mount = root.querySelector('[data-camera-video]');
  const verification=diagnostics?.verification;
  const popup = focusPanel && root.querySelector('[data-focus-verification]');
  const verified = verificationSuccessPending && (tracking || Boolean(popup));
  const success = popup && paintFocusVerification(popup, verification, verified);
  const avatarStatus=manuallyPaused&&status==='paused' ? 'manual-paused'
    : status==='paused'&&verification?.phase==='failed' ? 'identity-failed'
    : status==='paused'&&(verification?.phase==='returning'||diagnostics?.resumeRemainingMs!=null) ? 'returning'
    : status==='scanning'&&identityPhase==='checking' ? 'verifying'
    : status==='paused'&&verification?.phase==='waiting'&&verification.reason==='initial' ? 'verifying'
    : status==='paused'&&diagnostics&&reason ? 'behavior-warning' : status;
  const recovery=diagnostics?.returnCountdown ?? {remainingMs:diagnostics?.resumeRemainingMs};
  paintAvatar(mount, avatarPose, success || tracking, success ? 'tracking' : avatarStatus, performance.now(), recovery, verified);
  if (verified) verificationSuccessPending=false;
  const statusLine=root.querySelector('[data-camera-status]');
  const statusText = success ? '얼굴 인증 완료' : message;
  if ((!popup || popup.dataset.phase !== 'hidden') && statusLine.textContent !== statusText) statusLine.textContent = statusText;
  if (popup) {
    const note = root.querySelector('[data-focus-camera-note]');
    const noteText = popup.dataset.phase === 'hidden' && ['scanning', 'paused', 'error'].includes(status) ? message : '';
    if (note.textContent !== noteText) note.textContent = noteText;
  }
  const toggle = root.querySelector('[data-camera-toggle]');
  toggle?.setAttribute('aria-label', enabled ? '스터디캠 실행 중' : '얼굴 인식으로 학습 시작');
  const resolution = root.querySelector('[data-camera-resolution]');
  if (resolution) resolution.textContent = enabled && video.videoWidth ? '기기 내 분석' : '';
  if (focusPanel) paintCameraDebug(root, diagnostics, cameraState());
}
function setStatus(next, text, active = false) {
  if(enabled&&!enrollmentOnly&&studyGuard.blocked&&next!=='off'&&next!=='error'){
    next='paused';active=false;
    text=studyGuard.reason==='ratio'?'학습을 시작했을 때의 화면 비율로 돌아와 주세요.':
      studyGuard.reason==='gap'?'학습 화면 상태를 확인하지 못해 일시정지했습니다.':unranked?'학습 화면을 벗어났습니다. 돌아오면 자세 감지를 재개합니다.':'학습 화면을 벗어났습니다. 돌아오면 얼굴을 다시 확인합니다.';
  }
  if(enabled&&identityPhase==='enrolling'&&next==='scanning'){
    text='얼굴 등록 중…';active=false;
  }
  if (manuallyPaused && next !== 'error' && next !== 'off') {
    next = 'paused'; text = '수동 일시정지 · 재개 버튼을 눌러 주세요'; active = false;
  }
  const changed = tracking !== active || status !== next || message !== text;
  status = next; message = text; tracking = active; paint();
  if (changed) window.dispatchEvent(new Event('study:camera-changed'));
}
export function stopCamera(text = '얼굴 인식으로 학습 시작', error = false) {
  studyGuard.stop();
  revision++;
  frameEpoch++;
  enabled = false; ready = false; modelsPending = false; inFlight = false; manuallyPaused = false;
  videoPlaying=false;
  enrollmentOnly=false;unranked=false;
  if(typeof lockFaceSession==='function')lockFaceSession(text);
  lastVideoTime = -1;
  cancelFrameLoop(); clearInterval(watchdog); clearTimeout(loadingDeadline);
  worker?.terminate(); worker = null;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.srcObject = null;
  video.remove(); avatarPose = null;
  fallbackAttempted = false;
  focusTracker.reset(); diagnostics = null; reason = null;identityPhase=null;
  verificationSuccessPending=false;
  nextInferenceAt=0;lastFrameRequestAt=-Infinity;
  setStatus(error ? 'error' : 'off', text);
}
function recognitionError(detail = '') {
  console.error('Study camera initialization failed:', detail);
  const message='인식 엔진을 준비하지 못했습니다 · 종료 후 다시 시작해 주세요';
  if(startupToken===revision){stopCamera(message,true);return;}
  ready = false; inFlight = false;
  worker?.terminate(); worker = null;
  cancelFrameLoop(); clearInterval(watchdog); clearTimeout(loadingDeadline);
  // Preserve the avatar; never start crediting time without successful detection.
  avatarPose = null;
  focusTracker.reset(); diagnostics = null; reason = 'unknown';
  setStatus('error', message);
}
function acceptResult(data) {
  inFlight = false;
  const now = performance.now(); lastResult = now;
  // High-end devices also get idle time between expensive passes. Throughput
  // follows measured cost, rather than available CPU cores or display refresh.
  nextInferenceAt=data.signals?.identity?.enrolled===false?now:now+Math.min(600,Math.max(0,(data.inferenceMs||0)*.5));
  latestFaceResult=data;
  if(data.signals?.phonePolicy==='tracked' && latestPhoneObservation && latestPhoneObservation.epoch===data.epoch && latestPhoneObservation.scope===data.scope)
    data={...data,signals:{...data.signals,phoneObservation:latestPhoneObservation}};
  applyResult(data,now);
}
function acceptPhoneObservation(data) {
  latestPhoneObservation=data.observation;
  latestPhoneSearch=data.search;
  // Phone completion must not release the face request or refresh the face watchdog.
  if(!latestFaceResult || latestFaceResult.epoch!==data.epoch || latestFaceResult.scope!==data.scope)return;
  applyResult(latestFaceResult,performance.now(),data);
}
function applyResult(data,now,phoneEvent) {
  const checkedEpoch=frameEpoch;
  if(!studyGuard.check()||checkedEpoch!==frameEpoch)return;
  if (manuallyPaused || !cameraVisible() || stream?.getVideoTracks()[0]?.muted) return;
  // Worker sends only the three points needed by the avatar, never the full face mesh.
  const stale = !Number.isFinite(data.time) || now - data.time > 3000;
  if(phoneEvent&&stale)return;
  if(modelsPending&&data.signals?.identity?.enrolled!==false){
    if(identityPhase==='enrolling'){
      identityPhase='loading';
      setStatus('scanning','학습 감지 기능을 준비하는 중…');
    }
    return;
  }
  if(!phoneEvent){
    const points = data.landmarks;
    avatarPose = points ? facePose({ 1: points[0], 33: points[1], 263: points[2] }) : null;
  }
  const decision = phoneEvent ? focusTracker.updatePhone(phoneEvent.observation,now) : focusTracker.update(stale ? null : data.signals, now);
  if(!decision)return;
  if(!phoneEvent&&decision.verification?.required&&decision.verification.resetRequested)worker?.postMessage({type:'face-verification-reset'});
  const justVerified=identityPhase!=='verified'&&decision.verification?.phase==='verified';
  if(data.signals?.identity?.enrolled===false)identityPhase='enrolling';
  else if(decision.verification?.required&&data.signals?.identity)identityPhase=decision.verification.phase==='scanning'?'checking':decision.verification.phase;
  else if(decision.verification?.phase==='verified')identityPhase='verified';
  if(justVerified)verificationSuccessPending=true;
  else if(identityPhase!=='verified')verificationSuccessPending=false;
  diagnostics = { ...focusTracker.getDebug(), observedAt:now, runtime: { backend: data.backend, mode: data.mode, inferenceMs: data.inferenceMs, queueMs:data.queueMs, modelMs:data.modelMs, objectAgeMs:data.objectAgeMs,phoneSearch:latestPhoneSearch } };
  reason = decision.reason;
  setStatus(decision.status, decision.message, decision.tracking);
  if(justVerified&&typeof handleFaceWorkerEvent==='function')handleFaceWorkerEvent({type:'face-verified'});
}
function startRecognitionWorker(token, light = false, prepare = false) {
  latestFaceResult=latestPhoneObservation=latestPhoneSearch=null;
  modelsPending=true;
  const target = worker ?? new Worker(new URL('./camera-worker.js?v=20261109-pitch1', import.meta.url));
  worker = target;
  if(prepare){
    target.onerror=error=>{error.preventDefault();if(worker===target){target.terminate();worker=null;}};
    target.postMessage({type:'prepare',light,phoneRedesign});
    return;
  }
  target.onerror = error => { error.preventDefault(); if (worker === target) recoverRecognition(token, error.message); };
  target.onmessage = ({ data }) => {
    if (token !== revision || worker !== target) {data.bitmap?.close?.();return;}
    if (data.epoch != null && data.epoch !== frameEpoch) {data.bitmap?.close?.();return;}
    if(data.type==='face-rpc'){
      void handleFaceWorkerRPC(data.action,data.data).then(result=>{if(worker===target&&token===revision)target.postMessage({type:'face-rpc-result',id:data.id,result});}).catch(error=>{if(worker===target&&token===revision)target.postMessage({type:'face-rpc-result',id:data.id,error:error.message||'얼굴 보안 요청에 실패했습니다.'});});return;
    }
    if(data.type.startsWith('face-')){
      // Authorize startup only after the controller accepts a fresh match.
      if(data.type!=='face-verified')handleFaceWorkerEvent(data);
      return;
    }
    if (data.type === 'error') { if(typeof handleFaceWorkerEvent==='function')handleFaceWorkerEvent({type:'face-progress',state:'RECOVERY_REQUIRED',label:data.message||'얼굴 확인에 실패했습니다. 취소 후 다시 시도해 주세요.'});recoverRecognition(token, `${data.stage}: ${data.message}`); return; }
    if (data.type === 'ready') {
      ready = true; lastResult = performance.now();
      if(videoPlaying){cancelFrameLoop();void frame(token);}
    }
    if (data.type === 'models-ready') { modelsPending=false; clearTimeout(loadingDeadline); }
    if (data.type === 'result') acceptResult(data);
    if (data.type === 'phone-observation') {
      acceptPhoneObservation(data);
      if(data.slow&&!fallbackAttempted)recoverRecognition(token,'Phone inference repeatedly exceeded its freshness deadline');
    }
  };
  loadingDeadline = setTimeout(() => { if (worker === target) recoverRecognition(token, 'Worker initialization timed out'); }, 60000);
  target.postMessage({ type: 'init', light, phoneRedesign, identityKey:`${cameraController}:${token}`,poseOnly:unranked,faceSecurity:!unranked&&typeof faceWorkerContext==='function'?faceWorkerContext():null });
}
function recoverRecognition(token, detail) {
  if (token !== revision || !enabled) return;
  if (document.hidden) {
    ready = false; inFlight = false; worker?.terminate(); worker = null; clearTimeout(loadingDeadline);
    return;
  }
  if (fallbackAttempted) { recognitionError(detail); return; }
  fallbackAttempted = true; ready = false; inFlight = false; avatarPose = null;
  focusTracker.reset(true); diagnostics = null; reason = 'unknown';
  worker?.terminate(); worker = null; clearTimeout(loadingDeadline);
  console.warn('Study camera worker fallback:', detail);
  if(identityPhase!=='enrolling')identityPhase='loading';
  setStatus('scanning', '인식 기능을 다시 준비하는 중…');
  try {
    startRecognitionWorker(token, true);
  } catch (error) { if (token === revision) recognitionError(error.message); }
}
function cancelFrameLoop(){
  clearTimeout(loop);
  if(videoFrameHandle!==null)video.cancelVideoFrameCallback?.(videoFrameHandle);
  videoFrameHandle=null;
}
async function frame(token, epoch = frameEpoch) {
  if(!studyGuard.check())return;
  if (!enabled || token !== revision || epoch !== frameEpoch) return;
  const interval=identityPhase==='enrolling'?CAMERA_ENROLLMENT_INTERVAL_MS:CAMERA_INFERENCE_INTERVAL_MS;
  const followVideo=identityPhase==='enrolling'&&typeof video.requestVideoFrameCallback==='function';
  if (ready && !inFlight && cameraVisible() && video.readyState >= 2 && video.currentTime !== lastVideoTime && performance.now()>=nextInferenceAt && performance.now()-lastFrameRequestAt>=(followVideo?0:interval)) {
    lastVideoTime = video.currentTime;
    inFlight = true;
    lastFrameRequestAt=performance.now();
    try {
      const target = worker;
      const capturedAt=performance.now();
      const bitmap = await createImageBitmap(video);
      if (token !== revision || epoch !== frameEpoch) { bitmap.close(); return; }
      if (worker !== target || !ready) { bitmap.close(); inFlight = false; }
      else target.postMessage({ type: 'frame', bitmap, time: capturedAt, epoch, clockOrigin:performance.timeOrigin }, [bitmap]);
    } catch (error) {
      if (token !== revision || epoch !== frameEpoch) return;
      inFlight = false; void recoverRecognition(token, error.message);
    }
  }
  if (!enabled || token !== revision || epoch !== frameEpoch) return;
  // Follow actual camera delivery during enrollment rather than polling on a
  // mismatched 80ms clock (a 10fps source otherwise loses fresh frames).
  if(followVideo){
    videoFrameHandle=video.requestVideoFrameCallback(()=>{videoFrameHandle=null;void frame(token,epoch);});
  }else loop = setTimeout(() => frame(token, epoch), interval);
}
function startCameraWatchdog(token) {
  clearInterval(watchdog);
  watchdog = setInterval(() => {
    // Background throttling and camera suspension must not kill the recognition loop.
    if (token !== revision || !enabled || document.hidden) return;
    if (ready && performance.now() - lastResult > 5000) {
      focusTracker.reset(true); diagnostics = null;
      setStatus('paused', '카메라 인식 응답 없음 · 일시정지');
      if (!fallbackAttempted) recoverRecognition(token, 'Worker stopped responding');
      else if (performance.now() - lastResult > 6000) recognitionError('Light worker stopped responding');
    }
  }, 1000);
}
function resumeCameraRecognition(manual = false) {
  if (!enabled || !manual && (!cameraVisible() || !videoPlaying)) return;
  const token = revision;
  frameEpoch++; cancelFrameLoop(); inFlight = false; lastVideoTime = -1; lastResult = performance.now();
  latestFaceResult=latestPhoneObservation=latestPhoneSearch=null;
  focusTracker.reset(true); diagnostics = null; verificationSuccessPending=false;
  const checking = manual && !unranked && ready && !modelsPending && identityPhase!=='enrolling';
  if(identityPhase!=='enrolling')identityPhase=checking?'checking':'loading';
  if(checking)worker?.postMessage({type:'face-verification-reset'});
  setStatus('scanning', checking ? '얼굴인식 중 · 카메라를 바라봐 주세요' : '카메라 인식을 다시 준비하는 중…');
  if (!cameraVisible() || !videoPlaying) return;
  if (!worker) {
    fallbackAttempted = true;
    try { startRecognitionWorker(token, true); } catch (error) { recognitionError(error.message); return; }
  }
  const epoch = frameEpoch;
  if (video.paused) void video.play().catch(() => { if (token === revision && epoch === frameEpoch && !document.hidden) setStatus('paused', '카메라 영상 복구 대기 중…'); });
  startCameraWatchdog(token);
  void frame(token);
}
export async function startCamera({replace=false,registrationOnly=false,allowUnranked=false,onAccountReady}={}) {
  if (enabled) return false;
  const token = ++revision;
  startupToken=token;
  identityPhase='loading';enrollmentOnly=registrationOnly;
  enabled = true;
  setStatus('opening', '계정과 카메라를 준비하는 중…');
  try {
    const warmCamera=()=>{
      if(token!==revision)return;
      if(!registrationOnly)studyGuard.start();
      // The worker receives the secure face context after account preparation.
      try { startRecognitionWorker(token,false,true); }
      catch { worker?.terminate();worker=null; }
    };
    if(!allowUnranked)warmCamera();
    const face=await prepareFaceSession({replace,allowUnranked,onCameraSelected:allowUnranked?warmCamera:undefined});
    if(token!==revision)return false;
    if(face?.choice==='exit'){stopCamera();return false;}
    unranked=face?.choice==='unranked';
    if(unranked)studyGuard.start();
    identityPhase=face?.ticket?'enrolling':'loading';
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
    onAccountReady?.();
    try { startRecognitionWorker(token); }
    catch (error) { recoverRecognition(token, error.message); }
    if(token!==revision)return false;
    const incoming = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 10, max: 15 } } });
    if (token !== revision) { incoming.getTracks().forEach(track => track.stop()); return false; }
    stream = incoming; video.srcObject = stream;
    if(!unranked)attachFacePreview(stream);
    document.body.append(video);
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => { if (token === revision) stopCamera('카메라 연결이 끊겼습니다. 다시 켜 주세요.', true); });
      track.addEventListener('mute', () => { if (token === revision) { focusTracker.reset(true); diagnostics = null; setStatus('paused', '카메라 영상 중단 · 일시정지'); } });
      track.addEventListener('unmute', () => { if (token === revision) resumeCameraRecognition(); });
    }
    await video.play();
    if (token !== revision) return false;
    videoPlaying=true;
    setStatus('scanning', '카메라 연결 완료 · 인식 기능 준비 중…');
    if(!worker&&cameraVisible())resumeCameraRecognition();
    else {
      lastResult=performance.now();
      startCameraWatchdog(token);
      if(ready)void frame(token);
    }
    if(unranked)return true;
    const prepared=await waitForFaceSessionReady();
    if(!prepared||token!==revision)return false;
    if(!registrationOnly&&!await waitForFaceVerification())return false;
    return token===revision;
  } catch (error) {
    if (token !== revision) return false;
    if (isNetworkFailure(error)) {
      stopCamera(registrationOnly ? CONNECTION_MESSAGE : '카메라 준비를 완료하지 못했습니다.', true);
      if (!registrationOnly) showToast(CONNECTION_MESSAGE);
      return false;
    }
    const messages = { NotAllowedError: '카메라 권한을 허용한 뒤 다시 켜 주세요.', NotFoundError: '연결된 웹캠을 찾지 못했습니다.', NotReadableError: '다른 앱의 카메라 사용을 종료하고 다시 켜 주세요.' };
    stopCamera(messages[error.name] || error.message || '카메라를 켜지 못했습니다. HTTPS와 브라우저 권한을 확인해 주세요.', true);
    return false;
  } finally {
    if(startupToken===token)startupToken=null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (!enabled) return;
  if(document.hidden && cameraVisible())return;
  frameEpoch++;
  if (stream) { cancelFrameLoop(); inFlight = false; }
  lastVideoTime = -1;
  focusTracker.reset(true); diagnostics = null;
  if(document.hidden)setStatus('paused','화면을 벗어났습니다 · 일시정지');
  else resumeCameraRecognition();
});
window.addEventListener('pageshow', event => { if (event.persisted) resumeCameraRecognition(); });
window.addEventListener('study:face-locked',event=>{if(enabled)stopCamera(event.detail?.reason||'계정과 얼굴을 다시 확인해 주세요.',true);});
window.addEventListener('study:face-capture',()=>{if(enabled&&worker)worker.postMessage({type:'face-capture'});});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-face-reenroll]');if(!button||button.disabled)return;
  button.disabled=true;
  const settings=document.querySelector('#account-settings');if(settings?.open)settings.close();
  if(enabled)stopCamera();
  try{
    const saved=await startCamera({replace:true,registrationOnly:true});
    if(saved){stopCamera('얼굴 재등록이 완료됐습니다.');showToast('얼굴 재등록이 완료됐습니다.');}
    else showToast(message||'얼굴 재등록을 취소했습니다.');
  }finally{button.disabled=false;}
});
window.addEventListener('study:navigated', () => {
  if (!document.querySelector('.app > main [data-camera]') && enabled) stopCamera();
  if (!document.querySelector('.app > main [data-camera]') && focusPanel) void closeCameraFocus();
  paint();
});
document.addEventListener('keydown', event => {
  if (!focusPanel) return;
  if(document.querySelector('.face-enrollment[open]')||focusPanel.querySelector('[data-camera-debug-dialog][open]'))return;
  if (event.key === 'Tab') {
    const controls = [...focusPanel.querySelectorAll('button:not(:disabled), summary')]
      .filter(element => element.getClientRects().length);
    const index = controls.indexOf(document.activeElement);
    event.preventDefault();
    const step = event.shiftKey ? -1 : 1;
    const next = (index < 0 ? event.shiftKey ? controls.length - 1 : 0 : (index + step + controls.length) % controls.length);
    controls[next]?.focus();
  }
  if (event.key === 'Escape') focusPanel.querySelector('.cam-end').click();
});
window.addEventListener('pagehide', event => {
  if (!event.persisted) { stopCamera(); return; }
  frameEpoch++; cancelFrameLoop(); inFlight = false; focusTracker.reset(true); diagnostics = null;
  setStatus('paused', '화면을 벗어났습니다 · 일시정지');
});
paint();
