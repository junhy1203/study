import { FACE_SUCCESS_MS, startFaceEffect } from './camera-face-effect.js?v=20261108-recovery2';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const presentations = new WeakMap();
export function facePose(landmarks) {
  const nose = landmarks?.[1], left = landmarks?.[33], right = landmarks?.[263];
  if (![nose?.x, nose?.y, left?.x, left?.y, right?.x, right?.y].every(Number.isFinite)) return null;
  return {
    x: clamp((.5 - nose.x) * 70, -24, 24),
    y: clamp((nose.y - .5) * 45, -15, 15),
    roll: clamp(-Math.atan2(right.y - left.y, right.x - left.x) * 180 / Math.PI, -28, 28),
  };
}

export function paintAvatar(mount, pose, active, status = 'tracking', now = performance.now(), recovery = null, verified = false) {
  if (!mount.querySelector('.cam-avatar')) {
    // Static artwork only. Camera pixels and facial landmarks never enter the DOM.
    mount.innerHTML = `<svg class="cam-avatar" viewBox="0 0 320 320" role="img" aria-label="스터디캠 졸라맨 아바타">
      <ellipse class="avatar-shadow" cx="160" cy="271" rx="65" ry="9"/>
      <g class="avatar-person" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M160 138v70m0-51-48 36m48-36 48 36m-48 15-32 55m32-55 32 55"/>
        <g class="avatar-head"><circle cx="160" cy="101" r="36"/><path class="avatar-eyes" d="M148 96v4m24-4v4"/><path d="M150 113q10 8 20 0"/></g>
      </g><path class="avatar-ground" d="M75 277h170"/>
    </svg><canvas class="cam-face-effect" aria-hidden="true"></canvas><svg class="cam-recognition" viewBox="0 0 320 320" role="img" aria-label="얼굴인식 중">
      <g class="recognition-ring-entry"><circle class="recognition-ring-track" cx="160" cy="160" r="76"/>
      <circle class="recognition-spinner" cx="160" cy="160" r="76" pathLength="515"/>
      </g>
      <g class="recognition-face" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path class="recognition-bracket" d="M127 115h-9q-7 0-7 7v9M193 115h9q7 0 7 7v9M111 189v9q0 7 7 7h9M209 189v9q0 7-7 7h-9"/>
        <g class="recognition-features">
          <path class="recognition-piece recognition-eye eye-left" d="M140 143v10"/>
          <path class="recognition-piece recognition-eye eye-right" d="M180 143v10"/>
          <path class="recognition-piece recognition-nose" d="M161 142v21q0 4-4 4h-4"/>
          <path class="recognition-piece recognition-mouth" d="M139 179Q160 197 181 179"/>
        </g>
      </g>
    </svg><svg class="cam-paused" viewBox="0 0 320 320" role="img" aria-label="수동 일시정지" aria-hidden="true">
      <g fill="currentColor"><rect x="127" y="120" width="22" height="80" rx="5"/><rect x="171" y="120" width="22" height="80" rx="5"/></g>
    </svg><svg class="cam-warning" viewBox="0 0 320 320" role="img" aria-label="학습 행동 경고" aria-hidden="true">
      <path d="M160 110v65" fill="none" stroke="currentColor" stroke-width="15" stroke-linecap="round"/><circle cx="160" cy="203" r="9" fill="currentColor"/>
    </svg>`;
  }
  let presentation = presentations.get(mount);
  if (presentation) {
    if (active && status === 'scanning') presentation.missingSince ??= now;
    else presentation.missingSince = null;
  }
  const briefLoss = active && status === 'scanning' && presentation?.desired === 'recognized' && now - presentation.missingSince <= 3000;
  const desired = status === 'identity-failed' ? 'rejected' : status === 'behavior-warning' ? 'warning'
    : status === 'returning' ? 'returning' : ['manual-paused', 'paused'].includes(status) ? 'paused'
    : briefLoss || status === 'tracking' && (pose || active) ? 'recognized'
    : status === 'off' ? 'idle' : status === 'error' ? 'error' : status === 'verifying' ? 'searching' : 'loading';
  if (!presentation || presentation.desired !== desired || verified) {
    const animateMatch = verified && desired === 'recognized';
    const showRing = ['loading', 'returning', 'searching', 'rejected'].includes(desired) || animateMatch;
    const effect = showRing && ['loading', 'returning', 'searching', 'rejected'].includes(presentation?.desired) ? presentation.effect : null;
    const recovering = desired === 'returning' || presentation?.desired === 'warning';
    clearTimeout(presentation?.timer);
    if (!effect) presentation?.effect?.cancel();
    presentation = { desired, timer: null, effect };
    presentations.set(mount, presentation);
    mount.dataset.avatarPhase = desired === 'recognized' ? animateMatch ? 'success' : 'avatar' : desired;
    const canvas = mount.querySelector('.cam-face-effect');
    if (showRing && canvas?.getContext) presentation.effect ??= startFaceEffect(canvas, {loading: desired === 'loading', recovering});
    if (showRing) presentation.effect?.setLoading(desired === 'loading');
    if (desired === 'rejected') presentation.effect?.reject();
    if (animateMatch) {
      presentation.effect?.succeed();
      presentation.timer = setTimeout(() => {
        presentation.effect?.finish();
        mount.dataset.avatarPhase = 'check';
        presentation.timer = setTimeout(() => {
          mount.dataset.avatarPhase = 'avatar';
          mount.querySelector('.cam-avatar').setAttribute('aria-hidden', 'false');
          mount.querySelector('.cam-recognition').setAttribute('aria-hidden', 'true');
          presentation.timer = null;
        }, 700);
      }, typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : FACE_SUCCESS_MS);
    }
  }
  const remaining = recovery?.remainingMs;
  const returnLabel = Number.isFinite(remaining) ? `복귀 확인 중 · ${(remaining / 1000).toFixed(1)}초 남음` : '복귀 확인 중';
  mount.querySelector('.cam-recognition').setAttribute('aria-label', desired === 'returning' ? returnLabel : desired === 'rejected' ? '얼굴인식 실패' : desired === 'recognized' ? '얼굴인식 완료'
    : desired === 'error' ? '카메라 인식 오류' : desired === 'loading' ? '학습 준비 중' : '얼굴인식 중');
  const avatar = mount.querySelector('.cam-avatar');
  avatar.setAttribute('aria-hidden', String(mount.dataset.avatarPhase !== 'avatar'));
  mount.querySelector('.cam-recognition').setAttribute('aria-hidden', String(['avatar', 'idle', 'paused', 'warning'].includes(mount.dataset.avatarPhase)));
  const pauseIcon=mount.querySelector('.cam-paused');
  pauseIcon.setAttribute('aria-hidden', String(desired !== 'paused'));
  pauseIcon.setAttribute('aria-label', status === 'manual-paused' ? '수동 일시정지' : '학습 일시정지');
  mount.querySelector('.cam-warning').setAttribute('aria-hidden', String(desired !== 'warning'));
  avatar.classList.toggle('is-tracked', Boolean(pose));
  avatar.classList.toggle('is-active', active);
  avatar.style.setProperty('--avatar-x', `${pose?.x || 0}px`);
  avatar.style.setProperty('--avatar-y', `${pose?.y || 0}px`);
  avatar.style.setProperty('--avatar-roll', `${pose?.roll || 0}deg`);
}
