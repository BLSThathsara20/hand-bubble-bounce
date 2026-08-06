import { randomColor, type ColorId } from "./colors";

export type GridBall = {
  row: number;
  col: number;
  color: ColorId;
  popping: number; // 0..1 animation
  falling: boolean;
  fallY: number;
  fallVy: number;
};

export type GridConfig = {
  rows: number;
  cols: number;
  radius: number;
  originX: number;
  originY: number;
};

/** Odd-r horizontal hex layout helpers */
export function cellCenter(cfg: GridConfig, row: number, col: number) {
  const dx = cfg.radius * 2 * 0.92;
  const dy = cfg.radius * Math.sqrt(3) * 0.92;
  const offset = row % 2 === 1 ? dx * 0.5 : 0;
  return {
    x: cfg.originX + col * dx + offset,
    y: cfg.originY + row * dy,
  };
}

export function neighbors(row: number, col: number): [number, number][] {
  // odd-r offset neighbors
  const odd = row % 2 === 1;
  const dirs = odd
    ? [
        [0, -1],
        [0, 1],
        [-1, 0],
        [-1, 1],
        [1, 0],
        [1, 1],
      ]
    : [
        [0, -1],
        [0, 1],
        [-1, -1],
        [-1, 0],
        [1, -1],
        [1, 0],
      ];
  return dirs.map(([dr, dc]) => [row + dr, col + dc]);
}

export function key(row: number, col: number) {
  return `${row},${col}`;
}

export function createInitialGrid(
  width: number,
  _height: number,
  filledRows = 5,
  maxColors = 4,
): { cfg: GridConfig; balls: Map<string, GridBall> } {
  const cols = 12;
  const radius = Math.min(28, (width * 0.86) / (cols * 2));
  const gridWidth = radius * 2 * 0.92 * (cols - 1) + radius * 2;
  const originX = (width - gridWidth) / 2 + radius;
  const originY = radius * 1.6 + 12;

  const cfg: GridConfig = {
    rows: 16,
    cols,
    radius,
    originX,
    originY,
  };

  const balls = new Map<string, GridBall>();
  for (let r = 0; r < filledRows; r++) {
    const colsInRow = r % 2 === 1 ? cols - 1 : cols;
    for (let c = 0; c < colsInRow; c++) {
      balls.set(key(r, c), {
        row: r,
        col: c,
        color: randomColor(maxColors),
        popping: 0,
        falling: false,
        fallY: 0,
        fallVy: 0,
      });
    }
  }
  return { cfg, balls };
}

export function findSlotNear(
  cfg: GridConfig,
  balls: Map<string, GridBall>,
  x: number,
  y: number,
): { row: number; col: number } | null {
  let best: { row: number; col: number; dist: number } | null = null;
  for (let r = 0; r < cfg.rows; r++) {
    const colsInRow = r % 2 === 1 ? cfg.cols - 1 : cfg.cols;
    for (let c = 0; c < colsInRow; c++) {
      if (balls.has(key(r, c))) continue;
      // Must touch at least one existing ball OR be on top row
      const neigh = neighbors(r, c);
      const touches =
        r === 0 ||
        neigh.some(([nr, nc]) => balls.has(key(nr, nc)));
      if (!touches) continue;
      const p = cellCenter(cfg, r, c);
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist <= cfg.radius * 2.2) {
        if (!best || dist < best.dist) best = { row: r, col: c, dist };
      }
    }
  }
  return best ? { row: best.row, col: best.col } : null;
}

export function insertBall(
  balls: Map<string, GridBall>,
  row: number,
  col: number,
  color: ColorId,
) {
  balls.set(key(row, col), {
    row,
    col,
    color,
    popping: 0,
    falling: false,
    fallY: 0,
    fallVy: 0,
  });
}

/** Flood-fill same color group */
export function sameColorGroup(
  balls: Map<string, GridBall>,
  row: number,
  col: number,
): GridBall[] {
  const start = balls.get(key(row, col));
  if (!start || start.falling || start.popping > 0) return [];
  const color = start.color;
  const seen = new Set<string>();
  const out: GridBall[] = [];
  const stack: [number, number][] = [[row, col]];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    const k = key(r, c);
    if (seen.has(k)) continue;
    seen.add(k);
    const b = balls.get(k);
    if (!b || b.falling || b.popping > 0 || b.color !== color) continue;
    out.push(b);
    for (const [nr, nc] of neighbors(r, c)) stack.push([nr, nc]);
  }
  return out;
}

/** Balls still connected to top row (row 0) */
export function connectedToCeiling(balls: Map<string, GridBall>): Set<string> {
  const connected = new Set<string>();
  const stack: [number, number][] = [];
  for (const b of balls.values()) {
    if (b.row === 0 && !b.falling && b.popping === 0) {
      stack.push([b.row, b.col]);
    }
  }
  while (stack.length) {
    const [r, c] = stack.pop()!;
    const k = key(r, c);
    if (connected.has(k)) continue;
    const b = balls.get(k);
    if (!b || b.falling || b.popping > 0) continue;
    connected.add(k);
    for (const [nr, nc] of neighbors(r, c)) stack.push([nr, nc]);
  }
  return connected;
}

export function markMatchesAndFalls(
  balls: Map<string, GridBall>,
  atRow: number,
  atCol: number,
): { popped: number; dropped: number } {
  const group = sameColorGroup(balls, atRow, atCol);
  let popped = 0;
  if (group.length >= 3) {
    for (const b of group) {
      b.popping = 0.001;
      popped++;
    }
  }

  const ceiling = connectedToCeiling(balls);
  let dropped = 0;
  for (const [k, b] of balls) {
    if (b.popping > 0 || b.falling) continue;
    if (!ceiling.has(k)) {
      b.falling = true;
      b.fallY = 0;
      b.fallVy = 40 + Math.random() * 40;
      dropped++;
    }
  }
  return { popped, dropped };
}

export function pushNewRow(
  balls: Map<string, GridBall>,
  cfg: GridConfig,
  maxColors: number,
) {
  // Shift all balls down one row (from bottom up)
  const next = new Map<string, GridBall>();
  for (const b of balls.values()) {
    if (b.falling || b.popping > 0) {
      next.set(key(b.row, b.col), b);
      continue;
    }
    const nr = b.row + 1;
    if (nr >= cfg.rows) continue;
    const nb = { ...b, row: nr };
    next.set(key(nr, b.col), nb);
  }
  balls.clear();
  for (const [k, b] of next) balls.set(k, b);

  const colsInRow = cfg.cols; // even row
  for (let c = 0; c < colsInRow; c++) {
    balls.set(key(0, c), {
      row: 0,
      col: c,
      color: randomColor(maxColors),
      popping: 0,
      falling: false,
      fallY: 0,
      fallVy: 0,
    });
  }
}

export function lowestBallY(cfg: GridConfig, balls: Map<string, GridBall>) {
  let maxY = 0;
  for (const b of balls.values()) {
    if (b.falling || b.popping > 0) continue;
    const { y } = cellCenter(cfg, b.row, b.col);
    if (y > maxY) maxY = y;
  }
  return maxY;
}
