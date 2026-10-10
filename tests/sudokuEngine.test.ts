import { describe, expect, it } from 'vitest';
import { TOTAL_LEVELS, getLevelConfig, getLegacyLevelConfig } from '../src/game/simulation/levelConfig';
import { SudokuEngine } from '../src/game/simulation/sudokuEngine';

// Independent backtracking checker: validate both the solution and its uniqueness.
function solutions(input: number[], limit = 2): number {
  const board = input.slice();
  const allowed = (index: number, value: number) => {
    const r = Math.floor(index / 9), c = index % 9;
    return board.every((v, i) => i === index || v !== value ||
      (Math.floor(i / 9) !== r && i % 9 !== c &&
       (Math.floor(i / 27) !== Math.floor(r / 3) || Math.floor(i % 9 / 3) !== Math.floor(c / 3))));
  };
  if (board.some((v, i) => v && !allowed(i, v))) return 0;
  const search = (): number => {
    let index = -1, choices: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (board[i]) continue;
      const values = [1,2,3,4,5,6,7,8,9].filter(v => allowed(i, v));
      if (!values.length) return 0;
      if (index === -1 || values.length < choices.length) { index = i; choices = values; }
    }
    if (index === -1) return 1;
    let count = 0;
    for (const value of choices) {
      board[index] = value;
      count += search();
      if (count >= limit) break;
    }
    board[index] = 0;
    return count;
  };
  return search();
}

describe('SudokuEngine curated progression', () => {
  it('ships 100 distinct, unique-solution boards with monotonic scores and matching chapter ratings', () => {
    const engine = new SudokuEngine();
    let previousScore = -Infinity;
    const seen = new Set<string>();
    const bands = ['easy', 'normal', 'hard', 'expert', 'master'];
    for (let level = 1; level <= TOTAL_LEVELS; level++) {
      const config = getLevelConfig(level);
      const data = engine.getOrCreateLevel(level, config.targetClues);
      expect(solutions(data.solution)).toBe(1);
      expect(solutions(data.puzzle)).toBe(1);
      expect(data.puzzle.every((v, i) => !v || v === data.solution[i])).toBe(true);
      expect(data.difficulty.className).toBe(bands[Math.floor((level - 1) / 20)]);
      expect(config.className).toBe(data.difficulty.className);
      expect(config.targetClues).toBe(data.difficulty.clueCount);
      expect(data.difficulty.score).toBeGreaterThanOrEqual(previousScore);
      previousScore = data.difficulty.score;
      seen.add(data.puzzle.join(''));
    }
    expect(seen.size).toBe(100);
  }, 15000);

  it('returns independent board copies and retains the legacy generator for old saves', () => {
    const engine = new SudokuEngine();
    const first = engine.getOrCreateLevel(1);
    first.puzzle.fill(0);
    expect(engine.getOrCreateLevel(1).puzzle.some(Boolean)).toBe(true);
    const cfg = getLegacyLevelConfig(100);
    const old = engine.getOrCreateLegacyLevel(100, cfg.targetClues);
    expect(solutions(old.puzzle)).toBe(1);
    expect(old.puzzle.filter(Boolean).length).toBe(cfg.targetClues);
  });
});
