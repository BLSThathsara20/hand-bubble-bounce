export type ScoreState = {
  score: number;
  combo: number;
  lastHitAt: number;
};

const COMBO_WINDOW_MS = 900;
const BASE_POINTS = 10;

export function createScoreState(): ScoreState {
  return { score: 0, combo: 0, lastHitAt: 0 };
}

export function registerHit(state: ScoreState, nowMs: number): number {
  if (nowMs - state.lastHitAt <= COMBO_WINDOW_MS) {
    state.combo += 1;
  } else {
    state.combo = 1;
  }
  state.lastHitAt = nowMs;
  const gained = BASE_POINTS + Math.min(state.combo - 1, 20) * 2;
  state.score += gained;
  return gained;
}

export function tickComboDecay(state: ScoreState, nowMs: number): void {
  if (state.combo > 0 && nowMs - state.lastHitAt > COMBO_WINDOW_MS) {
    state.combo = 0;
  }
}
