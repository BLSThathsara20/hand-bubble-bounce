import type { Fingertip } from "../hands";
import type { Bubble } from "./bubbles";
import { HIT_COOLDOWN_MS } from "./bubbles";

export type HitEvent = {
  bubble: Bubble;
  tip: Fingertip;
  canvasX: number;
  canvasY: number;
  tipCanvasX: number;
  tipCanvasY: number;
};

type TipCanvas = {
  tip: Fingertip;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

/**
 * Resolve fingertip–bubble collisions. Mutates bubble velocity on hit.
 * tipCanvas positions must already be in canvas pixel space (mirrored).
 */
export function resolveCollisions(
  bubbles: Bubble[],
  tips: TipCanvas[],
  nowMs: number,
): HitEvent[] {
  const hits: HitEvent[] = [];
  const pad = 6;

  for (const b of bubbles) {
    if (!b.alive) continue;
    if (nowMs - b.lastHitAt < HIT_COOLDOWN_MS) continue;

    for (const t of tips) {
      const dx = b.x - t.x;
      const dy = b.y - t.y;
      const dist = Math.hypot(dx, dy);
      if (dist > b.r + pad) continue;

      // Impulse from fingertip velocity (normalized video space → canvas-ish)
      // tips.vx/vy are in normalized coords per second; scale to pixels roughly
      let ix = t.vx;
      let iy = t.vy;
      const tipSpeed = Math.hypot(ix, iy);

      if (tipSpeed < 0.15) {
        // Nearly still: push from tip through bubble center
        const nd = dist || 1;
        ix = dx / nd;
        iy = dy / nd;
      } else {
        // Tip velocity is in normalized space; direction matters most
        const inv = 1 / tipSpeed;
        ix *= inv;
        iy *= inv;
        // Mirror X velocity to match mirrored canvas
        ix = -ix;
      }

      const impulse = 220 + Math.min(tipSpeed * 180, 260);
      b.vx += ix * impulse;
      b.vy += iy * impulse;
      b.lastHitAt = nowMs;
      b.hitFlash = 1;

      hits.push({
        bubble: b,
        tip: t.tip,
        canvasX: b.x,
        canvasY: b.y,
        tipCanvasX: t.x,
        tipCanvasY: t.y,
      });
      break; // one tip per bubble per frame
    }
  }

  return hits;
}

/** True if a tip is near a bubble without counting as a hit (for miss tracking). */
export function nearMiss(
  bubble: Bubble,
  tipX: number,
  tipY: number,
  factor = 2.2,
): boolean {
  return Math.hypot(bubble.x - tipX, bubble.y - tipY) < bubble.r * factor;
}
