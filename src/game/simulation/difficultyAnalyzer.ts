import type { DifficultyBand } from "./levelConfig";
import { DIFFICULTY_THRESHOLDS } from "./difficultyThresholds";

type Unit = number[];

export interface TechniqueCounts {
  nakedSingles: number;
  hiddenSingles: number;
  lockedCandidates: number;
}

export interface DifficultyAnalysis {
  label: string;
  className: DifficultyBand["className"];
  score: number;
  clueCount: number;
  solvedWithoutGuess: boolean;
  remainingEmptyCells: number;
  techniques: TechniqueCounts;
}

export function analyzePuzzleDifficulty(puzzle: number[], solution: number[]): DifficultyAnalysis {
  const board = puzzle.slice();
  const techniques: TechniqueCounts = {
    nakedSingles: 0,
    hiddenSingles: 0,
    lockedCandidates: 0,
  };

  while (true) {
    const nakedSingles = applyNakedSingles(board);
    if (nakedSingles > 0) {
      techniques.nakedSingles += nakedSingles;
      continue;
    }

    const hiddenSingles = applyHiddenSingles(board);
    if (hiddenSingles > 0) {
      techniques.hiddenSingles += hiddenSingles;
      continue;
    }

    const lockedCandidates = applyLockedCandidates(board);
    if (lockedCandidates > 0) {
      techniques.lockedCandidates += lockedCandidates;
      continue;
    }

    break;
  }

  const clueCount = puzzle.filter((value) => value !== 0).length;
  const remainingEmptyCells = board.filter((value) => value === 0).length;
  const solvedWithoutGuess = remainingEmptyCells === 0 && board.every((value, index) => value === solution[index]);
  const score = calculateDifficultyScore({ clueCount, remainingEmptyCells, solvedWithoutGuess, techniques });
  const band = mapScoreToBand(score, solvedWithoutGuess, remainingEmptyCells);

  return {
    label: band.label,
    className: band.className,
    score,
    clueCount,
    solvedWithoutGuess,
    remainingEmptyCells,
    techniques,
  };
}

function calculateDifficultyScore(input: {
  clueCount: number;
  remainingEmptyCells: number;
  solvedWithoutGuess: boolean;
  techniques: TechniqueCounts;
}): number {
  const scarcityScore = (46 - input.clueCount) * 1.7;
  const hiddenSingleScore = input.techniques.hiddenSingles * 1.8;
  const lockedCandidateScore = input.techniques.lockedCandidates * 2.4;
  const unresolvedPenalty = input.remainingEmptyCells * 1.4;
  const guessPenalty = input.solvedWithoutGuess ? 0 : 16;

  return Number(
    (scarcityScore + hiddenSingleScore + lockedCandidateScore + unresolvedPenalty + guessPenalty).toFixed(2)
  );
}

function mapScoreToBand(
  score: number,
  solvedWithoutGuess: boolean,
  remainingEmptyCells: number
): Pick<DifficultyAnalysis, "label" | "className"> {
  if (!solvedWithoutGuess && remainingEmptyCells >= DIFFICULTY_THRESHOLDS.unresolvedMasterCellsMin) {
    const masterBand = DIFFICULTY_THRESHOLDS.bands.find((entry) => entry.className === "master");
    if (masterBand) {
      return { label: masterBand.label, className: masterBand.className };
    }
  }

  if (!solvedWithoutGuess && remainingEmptyCells >= DIFFICULTY_THRESHOLDS.unresolvedExpertCellsMin) {
    const expertBand = DIFFICULTY_THRESHOLDS.bands.find((entry) => entry.className === "expert");
    if (expertBand) {
      return { label: expertBand.label, className: expertBand.className };
    }
  }

  const matchedBand = DIFFICULTY_THRESHOLDS.bands.find((entry) => score >= entry.minScore);
  if (matchedBand) {
    return { label: matchedBand.label, className: matchedBand.className };
  }

  const fallback = DIFFICULTY_THRESHOLDS.bands[DIFFICULTY_THRESHOLDS.bands.length - 1];
  return { label: fallback.label, className: fallback.className };
}

function applyNakedSingles(board: number[]): number {
  const placements: Array<{ index: number; value: number }> = [];

  for (let index = 0; index < 81; index += 1) {
    if (board[index] !== 0) {
      continue;
    }

    const candidates = getCandidates(board, index);
    if (candidates.length === 1) {
      placements.push({ index, value: candidates[0] });
    }
  }

  placements.forEach(({ index, value }) => {
    board[index] = value;
  });

  return placements.length;
}

function applyHiddenSingles(board: number[]): number {
  const placements = new Map<number, number>();

  for (const unit of getUnits()) {
    const candidateMap = new Map<number, number[]>();

    for (const index of unit) {
      if (board[index] !== 0) {
        continue;
      }

      for (const candidate of getCandidates(board, index)) {
        const positions = candidateMap.get(candidate) ?? [];
        positions.push(index);
        candidateMap.set(candidate, positions);
      }
    }

    candidateMap.forEach((positions, candidate) => {
      if (positions.length === 1) {
        placements.set(positions[0], candidate);
      }
    });
  }

  placements.forEach((value, index) => {
    board[index] = value;
  });

  return placements.size;
}

function applyLockedCandidates(board: number[]): number {
  const candidates = buildCandidateMap(board);
  let eliminations = 0;

  for (let boxRow = 0; boxRow < 3; boxRow += 1) {
    for (let boxCol = 0; boxCol < 3; boxCol += 1) {
      const box = getBoxUnit(boxRow, boxCol);

      for (let digit = 1; digit <= 9; digit += 1) {
        const positions = box.filter((index) => candidates[index]?.includes(digit));
        if (positions.length <= 1) {
          continue;
        }

        const rows = new Set(positions.map((index) => Math.floor(index / 9)));
        const cols = new Set(positions.map((index) => index % 9));

        if (rows.size === 1) {
          const [row] = Array.from(rows);
          for (let col = 0; col < 9; col += 1) {
            const index = row * 9 + col;
            if (!box.includes(index) && candidates[index]?.includes(digit)) {
              candidates[index] = candidates[index].filter((candidate) => candidate !== digit);
              eliminations += 1;
            }
          }
        }

        if (cols.size === 1) {
          const [col] = Array.from(cols);
          for (let row = 0; row < 9; row += 1) {
            const index = row * 9 + col;
            if (!box.includes(index) && candidates[index]?.includes(digit)) {
              candidates[index] = candidates[index].filter((candidate) => candidate !== digit);
              eliminations += 1;
            }
          }
        }
      }
    }
  }

  if (eliminations === 0) {
    return 0;
  }

  let placements = 0;
  Object.entries(candidates).forEach(([indexText, values]) => {
    if (values.length === 1) {
      board[Number(indexText)] = values[0];
      placements += 1;
    }
  });

  return placements > 0 ? eliminations : 0;
}

function buildCandidateMap(board: number[]): Record<number, number[]> {
  const result: Record<number, number[]> = {};
  for (let index = 0; index < 81; index += 1) {
    if (board[index] === 0) {
      result[index] = getCandidates(board, index);
    }
  }
  return result;
}

function getCandidates(board: number[], index: number): number[] {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const used = new Array(10).fill(false);

  for (let cursor = 0; cursor < 9; cursor += 1) {
    const rowValue = board[row * 9 + cursor];
    const colValue = board[cursor * 9 + col];

    if (rowValue !== 0) {
      used[rowValue] = true;
    }

    if (colValue !== 0) {
      used[colValue] = true;
    }
  }

  const startRow = Math.floor(row / 3) * 3;
  const startCol = Math.floor(col / 3) * 3;

  for (let boxRow = startRow; boxRow < startRow + 3; boxRow += 1) {
    for (let boxCol = startCol; boxCol < startCol + 3; boxCol += 1) {
      const boxValue = board[boxRow * 9 + boxCol];
      if (boxValue !== 0) {
        used[boxValue] = true;
      }
    }
  }

  const candidates: number[] = [];
  for (let value = 1; value <= 9; value += 1) {
    if (!used[value]) {
      candidates.push(value);
    }
  }

  return candidates;
}

function getUnits(): Unit[] {
  const units: Unit[] = [];

  for (let row = 0; row < 9; row += 1) {
    units.push(Array.from({ length: 9 }, (_, col) => row * 9 + col));
  }

  for (let col = 0; col < 9; col += 1) {
    units.push(Array.from({ length: 9 }, (_, row) => row * 9 + col));
  }

  for (let boxRow = 0; boxRow < 3; boxRow += 1) {
    for (let boxCol = 0; boxCol < 3; boxCol += 1) {
      units.push(getBoxUnit(boxRow, boxCol));
    }
  }

  return units;
}

function getBoxUnit(boxRow: number, boxCol: number): number[] {
  const unit: number[] = [];
  for (let row = boxRow * 3; row < boxRow * 3 + 3; row += 1) {
    for (let col = boxCol * 3; col < boxCol * 3 + 3; col += 1) {
      unit.push(row * 9 + col);
    }
  }
  return unit;
}