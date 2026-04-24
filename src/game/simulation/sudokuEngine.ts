import { analyzePuzzleDifficulty, type DifficultyAnalysis } from "./difficultyAnalyzer";

type Rng = () => number;
type Grid = number[][];

export interface LevelBoard {
  solution: number[];
  puzzle: number[];
  difficulty: DifficultyAnalysis;
}

export class SudokuEngine {
  private readonly levelCache: Map<string, LevelBoard>;
  private static readonly MAX_GENERATION_ATTEMPTS = 18;

  constructor() {
    this.levelCache = new Map();
  }

  getOrCreateLevel(level: number, targetClues: number): LevelBoard {
    const key = `${level}-${targetClues}`;

    if (!this.levelCache.has(key)) {
      let bestBoard: LevelBoard | null = null;

      for (let attempt = 0; attempt < SudokuEngine.MAX_GENERATION_ATTEMPTS; attempt += 1) {
        const rng = mulberry32(level * 2654435761 + attempt * 1013904223);
        const solution = generateSolvedBoard(rng);
        const puzzle = generatePuzzle(solution, targetClues, rng);
        const difficulty = analyzePuzzleDifficulty(puzzle, solution);
        const candidate: LevelBoard = { solution, puzzle, difficulty };

        if (!bestBoard || countFilled(candidate.puzzle) < countFilled(bestBoard.puzzle)) {
          bestBoard = candidate;
        }

        if (countFilled(candidate.puzzle) === targetClues) {
          break;
        }
      }

      if (!bestBoard) {
        throw new Error("Failed to generate level board");
      }

      this.levelCache.set(key, bestBoard);
    }

    const cached = this.levelCache.get(key);
    if (!cached) {
      throw new Error("Failed to create level cache entry");
    }

    return {
      solution: cached.solution.slice(),
      puzzle: cached.puzzle.slice(),
      difficulty: { ...cached.difficulty, techniques: { ...cached.difficulty.techniques } },
    };
  }
}

function generateSolvedBoard(rng: Rng): number[] {
  let board = createBaseBoard();
  board = remapDigits(board, rng);
  board = shuffleRows(board, rng);
  board = shuffleCols(board, rng);
  board = shuffleRows(board, rng);
  board = shuffleCols(board, rng);
  return board.flat();
}

function createBaseBoard(): Grid {
  const board: Grid = [];

  for (let row = 0; row < 9; row += 1) {
    const current: number[] = [];
    for (let col = 0; col < 9; col += 1) {
      current.push(((row * 3 + Math.floor(row / 3) + col) % 9) + 1);
    }
    board.push(current);
  }

  return board;
}

function remapDigits(board: Grid, rng: Rng): Grid {
  const digitMap = shuffleList([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
  return board.map((row) => row.map((value) => digitMap[value - 1]));
}

function shuffleRows(board: Grid, rng: Rng): Grid {
  const bandOrder = shuffleList([0, 1, 2], rng);
  const rowOrder: number[] = [];

  for (const band of bandOrder) {
    const inside = shuffleList([0, 1, 2], rng).map((offset) => band * 3 + offset);
    rowOrder.push(...inside);
  }

  return rowOrder.map((row) => board[row].slice());
}

function shuffleCols(board: Grid, rng: Rng): Grid {
  const stackOrder = shuffleList([0, 1, 2], rng);
  const colOrder: number[] = [];

  for (const stack of stackOrder) {
    const inside = shuffleList([0, 1, 2], rng).map((offset) => stack * 3 + offset);
    colOrder.push(...inside);
  }

  return board.map((row) => colOrder.map((col) => row[col]));
}

function generatePuzzle(solution: number[], targetClues: number, rng: Rng): number[] {
  const puzzle = solution.slice();
  const cells = shuffleList(
    Array.from({ length: 81 }, (_, index) => index),
    rng
  );

  for (const index of cells) {
    if (countFilled(puzzle) <= targetClues) {
      break;
    }

    const backup = puzzle[index];
    puzzle[index] = 0;

    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[index] = backup;
    }
  }

  return puzzle;
}

function countSolutions(inputBoard: number[], limit = 2): number {
  const board = inputBoard.slice();
  let solutions = 0;

  function search() {
    if (solutions >= limit) {
      return;
    }

    let bestIndex = -1;
    let bestCandidates: number[] | null = null;

    for (let index = 0; index < 81; index += 1) {
      if (board[index] !== 0) {
        continue;
      }

      const candidates = getCandidates(board, index);
      if (candidates.length === 0) {
        return;
      }

      if (bestCandidates == null || candidates.length < bestCandidates.length) {
        bestCandidates = candidates;
        bestIndex = index;

        if (candidates.length === 1) {
          break;
        }
      }
    }

    if (bestIndex === -1) {
      solutions += 1;
      return;
    }

    if (!bestCandidates) {
      return;
    }

    for (const value of bestCandidates) {
      board[bestIndex] = value;
      search();

      if (solutions >= limit) {
        board[bestIndex] = 0;
        return;
      }
    }

    board[bestIndex] = 0;
  }

  search();
  return solutions;
}

function getCandidates(board: number[], index: number): number[] {
  if (board[index] !== 0) {
    return [];
  }

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

function shuffleList<T>(input: T[], rng: Rng): T[] {
  const list = input.slice();
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
}

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;

  return function random() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function countFilled(board: number[]): number {
  let filled = 0;

  for (const value of board) {
    if (value !== 0) {
      filled += 1;
    }
  }

  return filled;
}
