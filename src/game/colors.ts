export const BALL_COLORS = [
  { id: 0, fill: "#ff5a5a", glow: "#ff8a8a" },
  { id: 1, fill: "#3dd6c6", glow: "#7aefe3" },
  { id: 2, fill: "#5b8cff", glow: "#9bb6ff" },
  { id: 3, fill: "#ffc857", glow: "#ffe09a" },
  { id: 4, fill: "#c084fc", glow: "#ddb4ff" },
] as const;

export type ColorId = (typeof BALL_COLORS)[number]["id"];

export function randomColor(maxColors = 4): ColorId {
  const n = Math.max(2, Math.min(BALL_COLORS.length, maxColors));
  return Math.floor(Math.random() * n) as ColorId;
}
