import "./styles.css";
import {
  startCamera,
  mapMirroredCoverPoint,
  type CameraHandle,
} from "./camera";
import { createHandsTracker, type HandsTracker } from "./hands";
import {
  cellCenter,
  createInitialGrid,
  findSlotNear,
  insertBall,
  lowestBallY,
  markMatchesAndFalls,
  pushNewRow,
  type GridBall,
  type GridConfig,
} from "./game/grid";
import {
  clearAim,
  createShooter,
  layoutShooter,
  stepShot,
  stopShot,
  tryShoot,
  updateAimFromFinger,
  type Shooter,
} from "./game/shooter";
import { createScoreState, registerPop, tickComboDecay } from "./game/score";
import { createAdaptiveAI } from "./game/adaptiveAI";
import {
  clearCanvas,
  drawDangerLine,
  drawGrid,
  drawIndexFinger,
  drawShooter,
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
let gameOver = false;

let cfg: GridConfig;
let balls: Map<string, GridBall>;
let shooter: Shooter;
const score = createScoreState();
const ai = createAdaptiveAI();

let lastTs = 0;
let lastHudAt = 0;
let lastHandSeenAt = 0;
let lastRowDropAt = 0;
let lastAiUpdate = 0;
let wasGrabbing = false;
let grabFrames = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (shooter && cfg) {
    const radius = Math.min(28, (w * 0.86) / (cfg.cols * 2));
    cfg.radius = radius;
    const gridWidth = radius * 2 * 0.92 * (cfg.cols - 1) + radius * 2;
    cfg.originX = (w - gridWidth) / 2 + radius;
    cfg.originY = radius * 1.6 + 12;
    layoutShooter(shooter, w, h, radius);
  }
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

function fingerToCanvas(nx: number, ny: number) {
  const { w, h } = canvasSize();
  return mapMirroredCoverPoint(
    nx,
    ny,
    video.videoWidth,
    video.videoHeight,
    w,
    h,
  );
}

function dangerLineY(h: number, radius: number) {
  return h - radius * 5.5;
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

function playPop() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new Ctx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "triangle";
    o.frequency.value = 380 + Math.random() * 120;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
    o.stop(ac.currentTime + 0.13);
    o.onended = () => void ac.close();
  } catch {
    /* optional */
  }
}

function attachShot(now: number) {
  if (!shooter.shot) return;
  const shot = shooter.shot;
  const slot = findSlotNear(cfg, balls, shot.x, shot.y);
  if (!slot) {
    const col = Math.max(
      0,
      Math.min(
        cfg.cols - 1,
        Math.round((shot.x - cfg.originX) / (cfg.radius * 2 * 0.92)),
      ),
    );
    insertBall(balls, 0, col, shot.color);
    stopShot(shooter);
    finishAttach(markMatchesAndFalls(balls, 0, col), now);
    return;
  }
  insertBall(balls, slot.row, slot.col, shot.color);
  stopShot(shooter);
  finishAttach(markMatchesAndFalls(balls, slot.row, slot.col), now);
}

function finishAttach(
  result: { popped: number; dropped: number },
  now: number,
) {
  ai.recordShotResult(result.popped);
  if (result.popped > 0 || result.dropped > 0) {
    registerPop(score, result.popped, result.dropped, now);
    playPop();
  }
}

function collideWithGrid(): boolean {
  const shot = shooter.shot;
  if (!shot?.active) return false;
  for (const b of balls.values()) {
    if (b.falling || b.popping > 0) continue;
    const p = cellCenter(cfg, b.row, b.col);
    if (Math.hypot(shot.x - p.x, shot.y - p.y) < cfg.radius * 1.85) {
      return true;
    }
  }
  return false;
}

function stepAnimations(dt: number, height: number) {
  const remove: string[] = [];
  for (const [k, b] of balls) {
    if (b.popping > 0) {
      b.popping += dt * 3.2;
      if (b.popping >= 1) remove.push(k);
    } else if (b.falling) {
      b.fallVy += 900 * dt;
      b.fallY += b.fallVy * dt;
      const p = cellCenter(cfg, b.row, b.col);
      if (p.y + b.fallY > height + 80) remove.push(k);
    }
  }
  for (const k of remove) balls.delete(k);
}

function resetGame() {
  const { w, h } = canvasSize();
  const init = createInitialGrid(w, h, 5, ai.maxColors());
  cfg = init.cfg;
  balls = init.balls;
  shooter = createShooter(w, h, cfg.radius, ai.maxColors());
  score.score = 0;
  score.combo = 0;
  gameOver = false;
  lastRowDropAt = performance.now();
  hintEl.textContent = "Point with your index finger to aim · flick up to shoot";
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

  const finger = hands.detectIndex(video, now);
  let fingerPos: { x: number; y: number; vx: number; vy: number } | null = null;
  if (finger) {
    const p = fingerToCanvas(finger.x, finger.y);
    // Mirror velocity X to match mirrored canvas
    fingerPos = { x: p.x, y: p.y, vx: -finger.vx, vy: finger.vy };
    lastHandSeenAt = now;
    hintEl.classList.add("hidden");
  } else if (now - lastHandSeenAt > 1200 && !gameOver) {
    hintEl.classList.remove("hidden");
  }

  const dangerY = dangerLineY(h, cfg.radius);
  const grabZoneY = h * 0.55;

  if (!gameOver && !shooter.shot?.active) {
    if (fingerPos) {
      const inGrabZone = fingerPos.y > grabZoneY;
      const nearShooter =
        Math.hypot(fingerPos.x - shooter.x, fingerPos.y - shooter.y) <
        cfg.radius * 8;

      if (inGrabZone || nearShooter || wasGrabbing) {
        updateAimFromFinger(shooter, fingerPos.x, fingerPos.y);
        grabFrames += 1;
        wasGrabbing = true;

        // Flick up (negative vy in image space) to shoot
        if (grabFrames > 5 && fingerPos.vy < -0.6) {
          tryShoot(shooter, now, 780, ai.maxColors());
          wasGrabbing = false;
          grabFrames = 0;
          clearAim(shooter);
        }
      } else if (wasGrabbing && grabFrames > 8) {
        // Released aim by moving away — shoot on release
        tryShoot(shooter, now, 780, ai.maxColors());
        wasGrabbing = false;
        grabFrames = 0;
        clearAim(shooter);
      } else {
        wasGrabbing = false;
        grabFrames = 0;
        clearAim(shooter);
      }
    } else if (wasGrabbing && grabFrames > 8) {
      tryShoot(shooter, now, 780, ai.maxColors());
      wasGrabbing = false;
      grabFrames = 0;
      clearAim(shooter);
    } else {
      wasGrabbing = false;
      grabFrames = 0;
      clearAim(shooter);
    }
  }

  if (!gameOver && shooter.shot?.active) {
    const status = stepShot(shooter, dt, w, cfg.originY - cfg.radius);
    if (status === "hit-ceiling" || collideWithGrid()) {
      attachShot(now);
    }
    // Lost off bottom (shouldn't happen often)
    if (shooter.shot && shooter.shot.y > h + 40) stopShot(shooter);
  }

  stepAnimations(dt, h);

  // Adaptive row drops
  if (!gameOver && now - lastRowDropAt > ai.rowDropIntervalMs()) {
    pushNewRow(balls, cfg, ai.maxColors());
    lastRowDropAt = now;
  }

  // Game over if cluster crosses danger line
  if (!gameOver && lowestBallY(cfg, balls) + cfg.radius > dangerY) {
    gameOver = true;
    hintEl.classList.add("hidden");
    overlay.classList.remove("hidden");
    startBtn.disabled = false;
    startBtn.textContent = "Play again";
    setStatus(`Game over · Score ${score.score}`);
  }

  if (now - lastAiUpdate > 500) {
    const elapsed = (now - lastAiUpdate) / 1000;
    lastAiUpdate = now;
    const danger =
      (lowestBallY(cfg, balls) - cfg.originY) / Math.max(1, dangerY - cfg.originY);
    ai.update(elapsed, {
      idleSec: score.lastPopAt === 0 ? 0 : (now - score.lastPopAt) / 1000,
      danger: Math.min(1, Math.max(0, danger)),
    });
  }

  tickComboDecay(score, now);

  drawDangerLine(ctx, dangerY, w);
  drawGrid(ctx, cfg, balls);
  drawShooter(ctx, shooter);
  if (fingerPos) {
    drawIndexFinger(ctx, fingerPos.x, fingerPos.y, Boolean(shooter.aiming));
  }

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
    resize();
    resetGame();
    running = true;
    lastTs = performance.now();
    lastAiUpdate = performance.now();
    lastHandSeenAt = performance.now();
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    setStatus(err instanceof Error ? err.message : "Could not start");
    startBtn.disabled = false;
  }
}

window.addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  visible = document.visibilityState === "visible";
});

startBtn.addEventListener("click", () => {
  if (running) {
    resetGame();
    overlay.classList.add("hidden");
    startBtn.textContent = "Start";
    setStatus("");
    return;
  }
  void startGame();
});

resize();
