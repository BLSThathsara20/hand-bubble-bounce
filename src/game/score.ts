export type ScoreState = {
  score: number;
  combo: number;
  lastPopAt: number;
};

export function createScoreState(): ScoreState {
  return { score: 0, combo: 0, lastPopAt: 0 };
}

export function registerPop(
  state: ScoreState,
  popped: number,
  dropped: number,
  now: number,
): number {
  if (now - state.lastPopAt < 2500) state.combo += 1;
  else state.combo = 1;
  state.lastPopAt = now;
  const gained =
    popped * 10 + dropped * 15 + Math.max(0, state.combo - 1) * 5;
  state.score += gained;
  return gained;
}

export function tickComboDecay(state: ScoreState, now: number) {
  if (state.combo > 0 && now - state.lastPopAt > 2500) state.combo = 0;
}
