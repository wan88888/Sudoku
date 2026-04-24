import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TOTAL_LEVELS = 100;
const BANDS = [
  { from: 1, to: 20, clueMax: 46, clueMin: 41 },
  { from: 21, to: 40, clueMax: 40, clueMin: 35 },
  { from: 41, to: 60, clueMax: 34, clueMin: 30 },
  { from: 61, to: 80, clueMax: 29, clueMin: 26 },
  { from: 81, to: 100, clueMax: 25, clueMin: 22 },
];

function getTargetClues(level) {
  const band = BANDS.find((entry) => level >= entry.from && level <= entry.to);
  if (!band) {
    return 35;
  }

  const span = Math.max(1, band.to - band.from);
  const ratio = (level - band.from) / span;
  return Math.round(band.clueMax - (band.clueMax - band.clueMin) * ratio);
}

function estimateScoreByClue(clues) {
  return Number(((46 - clues) * 1.7).toFixed(2));
}

function percentile(values, ratio) {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.floor((sorted.length - 1) * ratio);
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

const scores = [];
for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
  const clues = getTargetClues(level);
  scores.push(estimateScoreByClue(clues));
}

const thresholds = {
  normalMin: Math.max(1, Number(percentile(scores, 0.2).toFixed(2))),
  hardMin: Number(percentile(scores, 0.45).toFixed(2)),
  expertMin: Number(percentile(scores, 0.7).toFixed(2)),
  masterMin: Number(percentile(scores, 0.88).toFixed(2)),
};

const output = `export type DifficultyClassName = "easy" | "normal" | "hard" | "expert" | "master";

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
    { className: "master", label: "大师冲刺", minScore: ${thresholds.masterMin} },
    { className: "expert", label: "专家试炼", minScore: ${thresholds.expertMin} },
    { className: "hard", label: "进阶挑战", minScore: ${thresholds.hardMin} },
    { className: "normal", label: "稳定推进", minScore: ${thresholds.normalMin} },
    { className: "easy", label: "新手热身", minScore: 0 },
  ],
};
`;

const outputPath = resolve(process.cwd(), "src/game/simulation/difficultyThresholds.ts");
writeFileSync(outputPath, output, "utf8");
console.log(`Updated difficulty thresholds at ${outputPath}`);
console.log(thresholds);
