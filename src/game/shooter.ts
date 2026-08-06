import { randomColor, type ColorId } from "./colors";

export type ShotBall = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: ColorId;
  active: boolean;
};

export type Shooter = {
  x: number;
  y: number;
  radius: number;
  current: ColorId;
  next: ColorId;
  aiming: boolean;
  aimAngle: number; // radians, 0 = up, negative = left, positive = right
  dragX: number;
  dragY: number;
  shot: ShotBall | null;
  cooldownUntil: number;
};

export function createShooter(
  width: number,
  height: number,
  radius: number,
  maxColors = 4,
): Shooter {
  return {
    x: width / 2,
    y: height - radius * 2.4,
    radius,
    current: randomColor(maxColors),
    next: randomColor(maxColors),
    aiming: false,
    aimAngle: 0,
    dragX: width / 2,
    dragY: height - radius * 4,
    shot: null,
    cooldownUntil: 0,
  };
}

export function layoutShooter(s: Shooter, width: number, height: number, radius: number) {
  s.x = width / 2;
  s.y = height - radius * 2.4;
  s.radius = radius;
}

/** Aim from shooter toward finger (upward hemisphere). */
export function updateAimFromFinger(s: Shooter, fx: number, fy: number) {
  const dx = fx - s.x;
  const dy = fy - s.y;
  // Prefer aiming upward: if finger is below shooter, still use horizontal
  let angle = Math.atan2(dx, -Math.min(dy, -10)); // atan2(x, -y) so 0 is up
  const max = Math.PI * 0.42;
  angle = Math.max(-max, Math.min(max, angle));
  s.aimAngle = angle;
  s.dragX = fx;
  s.dragY = fy;
  s.aiming = true;
}

export function clearAim(s: Shooter) {
  s.aiming = false;
}

export function tryShoot(
  s: Shooter,
  now: number,
  speed = 780,
  maxColors = 4,
): boolean {
  if (s.shot?.active) return false;
  if (now < s.cooldownUntil) return false;
  const ang = s.aimAngle;
  s.shot = {
    x: s.x,
    y: s.y - s.radius * 0.2,
    vx: Math.sin(ang) * speed,
    vy: -Math.cos(ang) * speed,
    color: s.current,
    active: true,
  };
  s.current = s.next;
  s.next = randomColor(maxColors);
  s.cooldownUntil = now + 280;
  s.aiming = false;
  return true;
}

export function stepShot(
  s: Shooter,
  dt: number,
  width: number,
  ceilingY: number,
): "flying" | "hit-wall" | "hit-ceiling" | "none" {
  const shot = s.shot;
  if (!shot?.active) return "none";

  shot.x += shot.vx * dt;
  shot.y += shot.vy * dt;

  // Side walls bounce
  if (shot.x - s.radius < 8) {
    shot.x = 8 + s.radius;
    shot.vx = Math.abs(shot.vx);
  } else if (shot.x + s.radius > width - 8) {
    shot.x = width - 8 - s.radius;
    shot.vx = -Math.abs(shot.vx);
  }

  if (shot.y - s.radius <= ceilingY) {
    return "hit-ceiling";
  }
  return "flying";
}

export function stopShot(s: Shooter) {
  if (s.shot) s.shot.active = false;
  s.shot = null;
}
