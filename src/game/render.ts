import type { Bubble } from "./bubbles";

export type TipDraw = { x: number; y: number };

export function clearCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
}

export function drawBubbles(ctx: CanvasRenderingContext2D, bubbles: Bubble[]) {
  for (const b of bubbles) {
    if (!b.alive) continue;
    const flash = b.hitFlash;
    const r = b.r * (1 + flash * 0.18);

    const g = ctx.createRadialGradient(
      b.x - r * 0.3,
      b.y - r * 0.35,
      r * 0.1,
      b.x,
      b.y,
      r,
    );
    g.addColorStop(0, `hsla(${b.hue}, 85%, 78%, ${0.55 + flash * 0.35})`);
    g.addColorStop(0.55, `hsla(${b.hue}, 70%, 55%, ${0.28 + flash * 0.2})`);
    g.addColorStop(1, `hsla(${b.hue}, 60%, 40%, 0.05)`);

    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${b.hue}, 90%, 70%, ${0.55 + flash * 0.4})`;
    ctx.lineWidth = 2 + flash * 2;
    ctx.stroke();

    // Specular highlight
    ctx.beginPath();
    ctx.ellipse(
      b.x - r * 0.28,
      b.y - r * 0.32,
      r * 0.22,
      r * 0.12,
      -0.5,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = `rgba(255,255,255,${0.35 + flash * 0.3})`;
    ctx.fill();
  }
}

export function drawFingertips(ctx: CanvasRenderingContext2D, tips: TipDraw[]) {
  for (const t of tips) {
    ctx.beginPath();
    ctx.arc(t.x, t.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(t.x, t.y, 14, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(46, 196, 182, 0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function drawHitRipples(
  ctx: CanvasRenderingContext2D,
  ripples: { x: number; y: number; age: number }[],
) {
  for (const r of ripples) {
    const t = Math.min(1, r.age);
    const radius = 12 + t * 40;
    ctx.beginPath();
    ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${1 - t})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
