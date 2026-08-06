export type Bubble = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
  spawnedAt: number;
  lastHitAt: number;
  hitFlash: number;
  alive: boolean;
};

let nextId = 1;

export function createBubble(
  x: number,
  y: number,
  r: number,
  speed: number,
  nowMs: number,
): Bubble {
  const angle = Math.random() * Math.PI * 2;
  return {
    id: nextId++,
    x,
    y,
    vx: Math.cos(angle) * speed * (0.6 + Math.random() * 0.8),
    vy: Math.sin(angle) * speed * (0.6 + Math.random() * 0.8),
    r,
    hue: 160 + Math.random() * 80,
    spawnedAt: nowMs,
    lastHitAt: -9999,
    hitFlash: 0,
    alive: true,
  };
}

export function stepBubbles(
  bubbles: Bubble[],
  dt: number,
  width: number,
  height: number,
  dodge: { x: number; y: number; strength: number } | null,
): void {
  const margin = 4;
  for (const b of bubbles) {
    if (!b.alive) continue;

    // Mild float / drift
    b.vy += Math.sin(b.id + performance.now() * 0.0015) * 8 * dt;

    if (dodge && dodge.strength > 0) {
      const dx = b.x - dodge.x;
      const dy = b.y - dodge.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < b.r * 6) {
        const push = dodge.strength * 220 * dt;
        b.vx += (dx / dist) * push;
        b.vy += (dy / dist) * push;
      }
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Soft wall bounce
    if (b.x - b.r < margin) {
      b.x = margin + b.r;
      b.vx = Math.abs(b.vx) * 0.92;
    } else if (b.x + b.r > width - margin) {
      b.x = width - margin - b.r;
      b.vx = -Math.abs(b.vx) * 0.92;
    }
    if (b.y - b.r < margin) {
      b.y = margin + b.r;
      b.vy = Math.abs(b.vy) * 0.92;
    } else if (b.y + b.r > height - margin) {
      b.y = height - margin - b.r;
      b.vy = -Math.abs(b.vy) * 0.92;
    }

    // Dampen extreme speeds
    const speed = Math.hypot(b.vx, b.vy);
    const maxSpeed = 420;
    if (speed > maxSpeed) {
      b.vx = (b.vx / speed) * maxSpeed;
      b.vy = (b.vy / speed) * maxSpeed;
    }

    if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt * 4);
  }
}

export const HIT_COOLDOWN_MS = 200;
