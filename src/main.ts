import "./styles.css";
import {
  startCamera,
  mapMirroredCoverPoint,
  canvasToNormMirrored,
  type CameraHandle,
} from "./camera";
import { createHandsTracker, type HandsTracker, type Fingertip } from "./hands";
import { createBubble, stepBubbles, type Bubble } from "./game/bubbles";
import { resolveCollisions, nearMiss } from "./game/collision";
import { createScoreState, registerHit, tickComboDecay } from "./game/score";
import { createAdaptiveAI } from "./game/adaptiveAI";
import {
  clearCanvas,
  drawBubbles,
  drawFingertips,
  drawHitRipples,
} from "./game/render";

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;

const overlay = document.querySelector<HTMLDivElement>("#start-overlay")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const hintEl = document.querySelector<HTMLDivElement>("#hint")!;
const scoreEl = document.querySelector<HTMLDivElement>("#score")!;
const comboEl = document.querySelector<HTMLSpanElement>("#combo")!;
const pressureFill = document.querySelector<HTMLDivElement>("#pressure-fill")!;
const pressurePct = document.querySelector<HTMLSpanElement>("#pressure-pct")!;

let camera: CameraHandle | null = null;
let hands: HandsTracker | null = null;
let running = false;
let visible = true;

const bubbles: Bubble[] = [];
const score = createScoreState();
const ai = createAdaptiveAI();
const ripples: { x: number; y: number; age: number }[] = [];

let lastTs = 0;
let lastSpawnAt = 0;
let lastHudAt = 0;
let lastHandSeenAt = 0;
let approachScore = 0;
let hitScore = 0;
let reactionSamples: number[] = [];
let lastAiUpdate = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function setStatus(msg: string) {
  statusEl.textContent = msg;
}

function canvasSize() {
  return {
    w: canvas.clientWidth || window.innerWidth,
    h: canvas.clientHeight || window.innerHeight,
  };
}

function tipToCanvas(tip: Fingertip) {
  const { w, h } = canvasSize();
  return mapMirroredCoverPoint(
    tip.x,
    tip.y,
    video.videoWidth,
    video.videoHeight,
    w,
    h,
  );
}

function toNorm(x: number, y: number) {
  const { w, h } = canvasSize();
  return canvasToNormMirrored(
    x,
    y,
    video.videoWidth,
    video.videoHeight,
    w,
    h,
  );
}

function spawnBubble(now: number) {
  const { w, h } = canvasSize();
  const { nx, ny } = ai.pickSpawnNorm();
  const r = ai.bubbleRadius(Math.min(w, h));
  const speed = ai.bubbleSpeed();
  const x = Math.min(w - r - 8, Math.max(r + 8, nx * w));
  const y = Math.min(h - r - 8, Math.max(r + 8, ny * h));
  bubbles.push(createBubble(x, y, r, speed, now));
  lastSpawnAt = now;
}

function updateHud(now: number) {
  if (now - lastHudAt < 80) return;
  lastHudAt = now;
  scoreEl.textContent = String(score.score);
  comboEl.textContent = String(score.combo);
  const p = Math.round(ai.pressure * 100);
  pressureFill.style.width = `${p}%`;
  pressurePct.textContent = String(p);
}

function playHitBeep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new Ctx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = 520 + Math.random() * 180;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.08);
    o.stop(ac.currentTime + 0.09);
    o.onended = () => void ac.close();
  } catch {
    // audio optional
  }
}

function frame(ts: number) {
  if (!running) return;
  requestAnimationFrame(frame);

  if (!visible || !hands || !camera) return;

  const now = performance.now();
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;

  const { w, h } = canvasSize();
  clearCanvas(ctx, w, h);

  const rawTips = hands.detect(video, now);
  const tipDraw = rawTips.map((tip) => {
    const p = tipToCanvas(tip);
    return { tip, x: p.x, y: p.y, vx: tip.vx, vy: tip.vy };
  });

  if (tipDraw.length > 0) {
    lastHandSeenAt = now;
    hintEl.classList.add("hidden");
    for (const t of tipDraw) {
      const n = toNorm(t.x, t.y);
      ai.recordPresence(n.nx, n.ny, dt * 8);
    }
  } else if (now - lastHandSeenAt > 1200) {
    hintEl.classList.remove("hidden");
  }

  const maxB = ai.maxBubbles();
  if (
    bubbles.filter((b) => b.alive).length < maxB &&
    now - lastSpawnAt >= ai.spawnIntervalMs()
  ) {
    spawnBubble(now);
  }

  let dodge: { x: number; y: number; strength: number } | null = null;
  const dodgeStr = ai.dodgeStrength();
  if (dodgeStr > 0 && tipDraw.length > 0) {
    let sx = 0;
    let sy = 0;
    for (const t of tipDraw) {
      sx += t.x;
      sy += t.y;
    }
    dodge = { x: sx / tipDraw.length, y: sy / tipDraw.length, strength: dodgeStr };
  }

  stepBubbles(bubbles, dt, w, h, dodge);

  for (const b of bubbles) {
    if (!b.alive) continue;
    for (const t of tipDraw) {
      if (nearMiss(b, t.x, t.y, 2.4)) {
        approachScore += dt;
        if (
          now - b.lastHitAt > 400 &&
          Math.hypot(b.x - t.x, b.y - t.y) > b.r + 8
        ) {
          const n = toNorm(b.x, b.y);
          if (Math.random() < dt * 2) ai.recordMissApproach(n.nx, n.ny);
        }
      }
    }
  }

  const hitEvents = resolveCollisions(bubbles, tipDraw, now);

  for (const hit of hitEvents) {
    hitScore += 1;
    const reaction = now - hit.bubble.spawnedAt;
    reactionSamples.push(reaction);
    if (reactionSamples.length > 25) reactionSamples.shift();
    const n = toNorm(hit.canvasX, hit.canvasY);
    ai.recordHit(n.nx, n.ny, reaction);
    registerHit(score, now);
    ripples.push({ x: hit.canvasX, y: hit.canvasY, age: 0 });
    playHitBeep();
  }

  tickComboDecay(score, now);

  if (now - lastAiUpdate > 500) {
    const elapsed = (now - lastAiUpdate) / 1000;
    lastAiUpdate = now;
    const hitRate =
      approachScore > 0.01
        ? Math.min(1, hitScore / (approachScore * 3 + hitScore))
        : 0.45;
    approachScore *= 0.55;
    hitScore *= 0.55;
    const meanReaction =
      reactionSamples.length > 0
        ? reactionSamples.reduce((a, b) => a + b, 0) / reactionSamples.length
        : 900;
    const idleSec = score.lastHitAt === 0 ? 0 : (now - score.lastHitAt) / 1000;
    ai.update(elapsed, {
      hitRate,
      meanReactionMs: meanReaction,
      idleSec,
      combo: score.combo,
    });
  }

  for (const r of ripples) r.age += dt * 2.5;
  for (let i = ripples.length - 1; i >= 0; i--) {
    if (ripples[i].age >= 1) ripples.splice(i, 1);
  }

  drawBubbles(ctx, bubbles);
  drawHitRipples(ctx, ripples);
  drawFingertips(
    ctx,
    tipDraw.map((t) => ({ x: t.x, y: t.y })),
  );
  updateHud(now);
}

async function startGame() {
  startBtn.disabled = true;
  setStatus("Requesting camera…");

  try {
    camera = await startCamera(video);
    setStatus("Loading hand tracker…");
    hands = await createHandsTracker();
    setStatus("");
    overlay.classList.add("hidden");
    running = true;
    lastTs = performance.now();
    lastSpawnAt = performance.now();
    lastAiUpdate = performance.now();
    lastHandSeenAt = performance.now();
    spawnBubble(performance.now());
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Could not start camera or tracker";
    setStatus(message);
    startBtn.disabled = false;
  }
}

window.addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  visible = document.visibilityState === "visible";
});

startBtn.addEventListener("click", () => void startGame());
resize();
