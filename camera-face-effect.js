// Ring geometry, lighting and success timing from effects/face-id.html.
const SIZE = 206, CENTER = SIZE / 2, RADIUS = 49, TAU = Math.PI * 2;
export const FACE_SUCCESS_MS = 1280;
const REJECTION_MS = 1200;
const circle = Array.from({ length: 97 }, (_, index) => {
  const angle = index * TAU / 96;
  return [Math.cos(angle), Math.sin(angle)];
});
const check = [[83, 104], [97, 118], [123, 88]];
const checkLengths = [Math.hypot(14, 14), Math.hypot(26, 30)];
const clamp = value => Math.max(0, Math.min(1, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const ease = (time, start, end) => {
  const value = clamp((time - start) / (end - start));
  return value * value * (3 - 2 * value);
};

function projectRing(tilt, axis, scale) {
  const cosTilt = Math.cos(tilt), sinTilt = Math.sin(tilt);
  const cosAxis = Math.cos(axis), sinAxis = Math.sin(axis);
  return circle.map(([cos, sin]) => {
    const x = cos * RADIUS * scale, y = sin * RADIUS * scale;
    const z = y * sinTilt, perspective = 285 / (285 - z);
    return {
      x: CENTER + (x * cosAxis - y * cosTilt * sinAxis) * perspective,
      y: CENTER + (x * sinAxis + y * cosTilt * cosAxis) * perspective,
      depth: z / RADIUS,
    };
  });
}

const scanRing = projectRing(0, 0, 1);
const rejectionColors = ['#9a164e80', '#f3294dcc', '#ff8888eb'];
const loadingColors = ['#ae741580', '#edb92fcc', '#fff2a2eb'];

function mixColor(from, to, amount) {
  if (amount <= 0) return from;
  if (amount >= 1) return to;
  return `color-mix(in srgb, ${from} ${(1 - amount) * 100}%, ${to})`;
}

function strokeRing(ctx, points, opacity, resolve, hue, phase, {
  width = mix(8.1, 5.2, resolve), loading = 0, rejection = 0,
} = {}) {
  if (opacity <= 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
  ctx.closePath();

  const count = points.length - 1;
  const near = points[count / 4].depth;
  const angle = Math.atan2(Math.sin(phase) + near * 1.65, Math.cos(phase));
  const index = Math.round(((angle + TAU) % TAU) / TAU * count) % count;
  const highlight = points[index], shadow = points[(index + count / 2) % count];
  const gradient = ctx.createLinearGradient(shadow.x, shadow.y, highlight.x, highlight.y);
  const aurora = [
    `hsla(${hue + 8}, 92%, 41%, ${mix(.32, .78, resolve)})`,
    `hsla(${hue}, 95%, 50%, ${mix(.62, .78, resolve)})`,
    `hsla(${hue - 6}, 96%, ${mix(74, 64, resolve)}%, .91)`,
  ];
  for (const [index, stop] of [0, .46, 1].entries()) {
    const color = mixColor(aurora[index], loadingColors[index], loading);
    gradient.addColorStop(stop, mixColor(color, rejectionColors[index], rejection));
  }

  ctx.globalAlpha = opacity;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = gradient;
  ctx.shadowColor = mixColor(mixColor(`hsla(${hue}, 99%, 54%, .64)`, '#ffce42ba', loading), '#ff264cba', rejection);
  ctx.shadowBlur = mix(13, 5, resolve);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawCheck(ctx, amount, color) {
  if (amount <= 0) return;
  let remaining = (checkLengths[0] + checkLengths[1]) * amount;
  ctx.beginPath();
  ctx.moveTo(...check[0]);
  for (let index = 0; index < checkLengths.length && remaining > 0; index++) {
    const progress = clamp(remaining / checkLengths[index]);
    const [fromX, fromY] = check[index], [toX, toY] = check[index + 1];
    ctx.lineTo(mix(fromX, toX, progress), mix(fromY, toY, progress));
    remaining -= checkLengths[index];
  }
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.shadowColor = '#63f99c80';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export function startFaceEffect(canvas, {loading: initiallyLoading = false, recovering = false} = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const side = Math.max(SIZE, Math.round(Math.min(canvas.clientWidth, canvas.clientHeight) * Math.min(devicePixelRatio || 1, 3)));
  canvas.width = canvas.height = side;
  ctx.setTransform(side / SIZE, 0, 0, side / SIZE, 0, 0);
  const colors = getComputedStyle(canvas);
  const ringColor = colors.getPropertyValue('--face-effect-ring').trim();
  const checkColor = colors.getPropertyValue('--face-effect-check').trim();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const started = performance.now();
  const entranceMs = recovering ? 520 : 200;
  let loadingFrom = initiallyLoading ? 1 : 0;
  let loadingTo = loadingFrom;
  let loadingChangedAt = started;
  let frame, matchedAt, rejectedAt;

  function loadingAmount(now) {
    return mix(loadingFrom, loadingTo, reducedMotion.matches ? 1 : ease(now - loadingChangedAt, 0, 850));
  }

  function draw(time, successTime, rejection = 0, loading = 0) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    const entrance = ease(time, 0, entranceMs);
    const resolving = successTime !== null;
    const resolve = resolving ? ease(successTime, 690, 1060) : 0;
    const solid = resolving ? ease(successTime, 930, 1090) : 0;
    const motion = resolving ? ease(successTime, 0, 330) : 0;
    const spin = (successTime ?? 0) / 680 * TAU;
    const scale = 1 + Math.sin(resolve * Math.PI) * .035;
    const hue = mix(172, 142, resolve);

    if (solid < 1) {
      ctx.globalCompositeOperation = 'lighter';
      const orbitTime = recovering ? Math.max(0, time - entranceMs) : time;
      const lightPhase = orbitTime / 680 * TAU;
      const axis = spin * .85;
      const tilt = motion * (1 - resolve);
      const frontAxis = axis - .35 * motion;
      const front = motion > 0 ? projectRing(tilt * (1.02 + .6 * Math.sin(spin)), frontAxis, scale) : scanRing;
      const tint = {loading: loading * (1 - motion), rejection: rejection * (1 - motion)};
      strokeRing(ctx, front, entrance * (1 - solid), resolve, hue, lightPhase - frontAxis, tint);
      if (resolving && successTime > 35) {
        const separation = ease(successTime, 35, 360);
        const rearAxis = axis + 1.1 * motion;
        const rear = projectRing(-tilt * (1.05 + .59 * Math.cos(spin + .8)), rearAxis, scale * mix(1, .98, separation));
        strokeRing(ctx, rear, entrance * separation * (1 - resolve) * .83, resolve, hue - 10 * separation, lightPhase - rearAxis, tint);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (solid > 0) {
      ctx.globalAlpha = solid;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, RADIUS, 0, TAU);
      ctx.lineWidth = 5.2;
      ctx.strokeStyle = ringColor;
      ctx.shadowColor = '#34ea6560';
      ctx.shadowBlur = 9;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    if (resolving) drawCheck(ctx, ease(successTime, 990, FACE_SUCCESS_MS), checkColor);
  }

  function tick(now) {
    if (!canvas.isConnected) return;
    const successTime = matchedAt === undefined ? null : now - matchedAt;
    const rejectionTime = rejectedAt === undefined ? REJECTION_MS : now - rejectedAt;
    const rejection = ease(rejectionTime, 0, 260) * (1 - ease(rejectionTime, 520, REJECTION_MS));
    if (reducedMotion.matches) {
      draw(entranceMs, successTime === null ? null : FACE_SUCCESS_MS, rejection, loadingAmount(now));
      if (successTime === null && rejectionTime < REJECTION_MS) frame = requestAnimationFrame(tick);
      return;
    }
    draw(now - started, successTime, rejection, loadingAmount(now));
    if (successTime === null || successTime < FACE_SUCCESS_MS) frame = requestAnimationFrame(tick);
  }
  if (!reducedMotion.matches) draw(0, null, 0, loadingFrom);
  frame = requestAnimationFrame(tick);
  return {
    setLoading(loading) {
      const target = loading ? 1 : 0;
      if (loadingTo === target) return;
      const now = performance.now();
      loadingFrom = loadingAmount(now);
      loadingTo = target;
      loadingChangedAt = now;
      if (reducedMotion.matches) {
        cancelAnimationFrame(frame);
        tick(now);
      }
    },
    reject() {
      rejectedAt = performance.now();
      cancelAnimationFrame(frame);
      tick(rejectedAt);
    },
    succeed() {
      matchedAt = performance.now();
      cancelAnimationFrame(frame);
      tick(matchedAt);
    },
    finish() { cancelAnimationFrame(frame); draw(entranceMs, FACE_SUCCESS_MS); },
    cancel() { cancelAnimationFrame(frame); },
  };
}
