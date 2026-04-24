export const TOTAL_LEVELS = 100;
export const START_STAMINA = 20;
export const STORAGE_KEY = "sudoku-sprint-phaser-progress-v1";

export interface DifficultyBand {
  from: number;
  to: number;
  label: string;
  className: "easy" | "normal" | "hard" | "expert" | "master";
  clueMax: number;
  clueMin: number;
}

export interface LevelConfig {
  label: string;
  className: DifficultyBand["className"];
  targetClues: number;
}

export const DIFFICULTY_BANDS: DifficultyBand[] = [
  { from: 1, to: 20, label: "新手热身", className: "easy", clueMax: 46, clueMin: 41 },
  { from: 21, to: 40, label: "稳定推进", className: "normal", clueMax: 40, clueMin: 35 },
  { from: 41, to: 60, label: "进阶挑战", className: "hard", clueMax: 34, clueMin: 30 },
  { from: 61, to: 80, label: "专家试炼", className: "expert", clueMax: 29, clueMin: 26 },
  { from: 81, to: 100, label: "大师冲刺", className: "master", clueMax: 25, clueMin: 22 },
];

export function getLevelConfig(level: number): LevelConfig {
  const band = DIFFICULTY_BANDS.find((entry) => level >= entry.from && level <= entry.to);

  if (!band) {
    return {
      label: "未知",
      className: "normal",
      targetClues: 35,
    };
  }

  const span = Math.max(1, band.to - band.from);
  const ratio = (level - band.from) / span;
  const targetClues = Math.round(band.clueMax - (band.clueMax - band.clueMin) * ratio);

  return {
    label: band.label,
    className: band.className,
    targetClues,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
