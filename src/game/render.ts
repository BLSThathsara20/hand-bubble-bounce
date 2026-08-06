import { BALL_COLORS, type ColorId } from "./colors";
import { cellCenter, type GridBall, type GridConfig } from "./grid";
import type { Shooter } from "./shooter";

export function clearCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: ColorId,
  scale = 1,
  alpha = 1,
) {
  const c = BALL_COLORS[color];
  const radius = r * scale;
  const g = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.35,
    radius * 0.1,
    x,
    y,
    radius,
  );
  g.addColorStop(0, withAlpha(c.glow, 0.95 * alpha));
  g.addColorStop(0.55, withAlpha(c.fill, 0.92 * alpha));
  g.addColorStop(1, withAlpha(c.fill, 0.55 * alpha));

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = withAlpha("#ffffff", 0.35 * alpha);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(
    x - radius * 0.28,
    y - radius * 0.32,
    radius * 0.22,
    radius * 0.12,
    -0.5,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = withAlpha("#ffffff", 0.4 * alpha);
  ctx.fill();
}

function withAlpha(hex: string, a: number) {
  if (hex.startsWith("#") && hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return hex;
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cfg: GridConfig,
  balls: Map<string, GridBall>,
) {
  for (const b of balls.values()) {
    const p = cellCenter(cfg, b.row, b.col);
    let x = p.x;
    let y = p.y + (b.falling ? b.fallY : 0);
    let scale = 1;
    let alpha = 1;
    if (b.popping > 0) {
      scale = 1 + b.popping * 0.5;
      alpha = Math.max(0, 1 - b.popping);
    }
    drawBall(ctx, x, y, cfg.radius, b.color, scale, alpha);
  }
}

export function drawShooter(ctx: CanvasRenderingContext2D, s: Shooter) {
  // Aim line
  if (s.aiming && !s.shot?.active) {
    const len = 220;
    const ang = s.aimAngle;
    ctx.beginPath();
    ctx.setLineDash([8, 8]);
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.sin(ang) * len, s.y - Math.cos(ang) * len);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    // ghost along path
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      drawBall(
        ctx,
        s.x + Math.sin(ang) * len * t,
        s.y - Math.cos(ang) * len * t,
        s.radius * 0.35,
        s.current,
        1,
        0.25,
      );
    }
  }

  // Next ball preview
  drawBall(ctx, s.x + s.radius * 2.6, s.y + s.radius * 0.3, s.radius * 0.62, s.next);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("NEXT", s.x + s.radius * 2.6, s.y + s.radius * 1.55);

  // Current ball
  drawBall(ctx, s.x, s.y, s.radius, s.current);

  // Flying shot
  if (s.shot?.active) {
    drawBall(ctx, s.shot.x, s.shot.y, s.radius, s.shot.color);
  }
}

export function drawIndexFinger(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  grabbing: boolean,
) {
  ctx.beginPath();
  ctx.arc(x, y, grabbing ? 16 : 12, 0, Math.PI * 2);
  ctx.fillStyle = grabbing ? "rgba(255,200,80,0.95)" : "rgba(255,255,255,0.9)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, grabbing ? 24 : 18, 0, Math.PI * 2);
  ctx.strokeStyle = grabbing ? "rgba(255,180,60,0.9)" : "rgba(46,196,182,0.85)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

export function drawDangerLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  width: number,
) {
  ctx.beginPath();
  ctx.setLineDash([6, 8]);
  ctx.moveTo(20, y);
  ctx.lineTo(width - 20, y);
  ctx.strokeStyle = "rgba(255,90,90,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
}
