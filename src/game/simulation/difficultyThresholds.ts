export type DifficultyClassName = "easy" | "normal" | "hard" | "expert" | "master";

export interface DifficultyBandConfig {
  className: DifficultyClassName;
  label: string;
  minScore: number;
}

export interface DifficultyThresholdConfig {
  unresolvedMasterCellsMin: number;
  unresolvedExpertCellsMin: number;
  bands: DifficultyBandConfig[];
}

export const DIFFICULTY_THRESHOLDS: DifficultyThresholdConfig = {
  unresolvedMasterCellsMin: 18,
  unresolvedExpertCellsMin: 1,
  bands: [
    { className: "master", label: "大师冲刺", minScore: 37.4 },
    { className: "expert", label: "专家试炼", minScore: 30.6 },
    { className: "hard", label: "进阶挑战", minScore: 22.1 },
    { className: "normal", label: "稳定推进", minScore: 8.5 },
    { className: "easy", label: "新手热身", minScore: 0 },
  ],
};
