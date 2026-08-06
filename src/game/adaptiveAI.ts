export type HeatCell = {
  hits: number;
  misses: number;
  presence: number;
};

export type AdaptiveAI = {
  pressure: number;
  cols: number;
  rows: number;
  cells: HeatCell[];
  recordHit: (nx: number, ny: number, reactionMs: number) => void;
  recordMissApproach: (nx: number, ny: number) => void;
  recordPresence: (nx: number, ny: number, amount?: number) => void;
  update: (dtSec: number, signals: AdaptiveSignals) => void;
  pickSpawnNorm: () => { nx: number; ny: number };
  spawnIntervalMs: () => number;
  maxBubbles: () => number;
  bubbleSpeed: () => number;
  bubbleRadius: (canvasMin: number) => number;
  dodgeStrength: () => number;
};

export type AdaptiveSignals = {
  hitRate: number;
  meanReactionMs: number;
  idleSec: number;
  combo: number;
};

const COLS = 6;
const ROWS = 4;

export function createAdaptiveAI(): AdaptiveAI {
  const cells: HeatCell[] = Array.from({ length: COLS * ROWS }, () => ({
    hits: 0,
    misses: 0,
    presence: 0.01,
  }));

  let pressure = 0.08;
  const reactions: number[] = [];

  const cellIndex = (nx: number, ny: number) => {
    const c = Math.min(COLS - 1, Math.max(0, Math.floor(nx * COLS)));
    const r = Math.min(ROWS - 1, Math.max(0, Math.floor(ny * ROWS)));
    return r * COLS + c;
  };

  const recordHit = (nx: number, ny: number, reactionMs: number) => {
    const cell = cells[cellIndex(nx, ny)];
    cell.hits += 1;
    reactions.push(reactionMs);
    if (reactions.length > 30) reactions.shift();
  };

  const recordMissApproach = (nx: number, ny: number) => {
    cells[cellIndex(nx, ny)].misses += 1;
  };

  const recordPresence = (nx: number, ny: number, amount = 1) => {
    cells[cellIndex(nx, ny)].presence += amount;
  };

  const update = (dtSec: number, signals: AdaptiveSignals) => {
    // Decay presence so heatmap stays recent
    for (const cell of cells) {
      cell.presence *= Math.pow(0.5, dtSec / 12);
      cell.hits *= Math.pow(0.5, dtSec / 18);
      cell.misses *= Math.pow(0.5, dtSec / 18);
    }

    const skill =
      clamp(signals.hitRate, 0, 1) * 0.45 +
      clamp(1 - signals.meanReactionMs / 1400, 0, 1) * 0.25 +
      clamp(signals.combo / 12, 0, 1) * 0.2 +
      (signals.idleSec < 1.2 ? 0.1 : 0);

    const struggle =
      clamp(1 - signals.hitRate, 0, 1) * 0.35 +
      clamp(signals.idleSec / 4, 0, 1) * 0.25;

    const target = clamp(skill * 0.85 - struggle * 0.35 + 0.12, 0, 1);
    const lerp = 1 - Math.exp(-dtSec * 0.7);
    pressure += (target - pressure) * lerp;
    pressure = clamp(pressure, 0, 1);
  };

  const weaknessScore = (cell: HeatCell) => {
    const attempts = cell.hits + cell.misses + 0.001;
    const missRatio = cell.misses / attempts;
    const reach = cell.presence;
    // Prefer low-presence (rarely reached) and high miss ratio
    return missRatio * 1.2 + 1 / (reach + 0.08);
  };

  const pickSpawnNorm = () => {
    // Weighted sample over weak cells; at low pressure bias toward center
    let best = 0;
    let bestScore = -Infinity;
    const explore = Math.random() < 0.25 + pressure * 0.2;

    for (let i = 0; i < cells.length; i++) {
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      const centerBias = 1 - Math.hypot((c + 0.5) / COLS - 0.5, (r + 0.5) / ROWS - 0.5);
      const weak = weaknessScore(cells[i]);
      const score =
        weak * (0.35 + pressure * 0.9) +
        centerBias * (1.1 - pressure) +
        (explore ? Math.random() * 0.8 : Math.random() * 0.15);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }

    const c = best % COLS;
    const r = Math.floor(best / COLS);
    const nx = (c + 0.15 + Math.random() * 0.7) / COLS;
    const ny = (r + 0.15 + Math.random() * 0.7) / ROWS;
    return { nx, ny };
  };

  return {
    get pressure() {
      return pressure;
    },
    cols: COLS,
    rows: ROWS,
    cells,
    recordHit,
    recordMissApproach,
    recordPresence,
    update,
    pickSpawnNorm,
    spawnIntervalMs: () => lerp(1400, 380, pressure),
    maxBubbles: () => Math.round(lerp(3, 10, pressure)),
    bubbleSpeed: () => lerp(55, 190, pressure),
    bubbleRadius: (canvasMin: number) =>
      canvasMin * lerp(0.055, 0.028, pressure),
    dodgeStrength: () => (pressure > 0.72 ? (pressure - 0.72) / 0.28 : 0),
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp(t, 0, 1);
}
