/** Lightweight adaptive pressure for match-3 shooter */
export type AdaptiveAI = {
  pressure: number;
  maxColors: () => number;
  rowDropIntervalMs: () => number;
  recordShotResult: (popped: number) => void;
  update: (dtSec: number, signals: { idleSec: number; danger: number }) => void;
};

export function createAdaptiveAI(): AdaptiveAI {
  let pressure = 0.15;
  let recentPops = 0;
  let recentShots = 0;

  return {
    get pressure() {
      return pressure;
    },
    maxColors: () => (pressure > 0.65 ? 5 : pressure > 0.35 ? 4 : 3),
    rowDropIntervalMs: () => 18000 - pressure * 9000,
    recordShotResult: (popped: number) => {
      recentShots += 1;
      if (popped >= 3) recentPops += 1;
      recentShots *= 0.98;
      recentPops *= 0.98;
    },
    update: (dtSec, signals) => {
      const skill =
        recentShots > 0.5
          ? Math.min(1, recentPops / Math.max(recentShots, 0.5))
          : 0.3;
      const dangerPush = signals.danger * 0.2;
      const idlePull = Math.min(1, signals.idleSec / 8) * 0.25;
      const target = Math.min(
        1,
        Math.max(0, skill * 0.7 + 0.15 + dangerPush - idlePull),
      );
      const lerp = 1 - Math.exp(-dtSec * 0.45);
      pressure += (target - pressure) * lerp;
    },
  };
}
