import { describe, expect, it } from "vitest";

import { TOTAL_LEVELS, getLevelConfig } from "../src/game/simulation/levelConfig";
import { SudokuEngine } from "../src/game/simulation/sudokuEngine";

describe("SudokuEngine", () => {
  it("generates valid puzzles for all 100 levels with monotonic clue targets", () => {
    const engine = new SudokuEngine();
    let previousTargetClues = Number.POSITIVE_INFINITY;

    for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
      const config = getLevelConfig(level);
      const levelData = engine.getOrCreateLevel(level, config.targetClues);
      const actualClues = levelData.puzzle.filter((value) => value !== 0).length;

      expect(config.targetClues).toBeLessThanOrEqual(previousTargetClues);
      expect(actualClues).toBe(config.targetClues);
      expect(levelData.puzzle.every((value, index) => value === 0 || value === levelData.solution[index])).toBe(true);
      expect(levelData.difficulty.score).toBeGreaterThanOrEqual(0);
      expect(["easy", "normal", "hard", "expert", "master"]).toContain(levelData.difficulty.className);

      previousTargetClues = config.targetClues;
    }
  });

  it("rates sparse late-game puzzles as harder than the opening levels", () => {
    const engine = new SudokuEngine();
    const early = engine.getOrCreateLevel(1, getLevelConfig(1).targetClues);
    const late = engine.getOrCreateLevel(100, getLevelConfig(100).targetClues);

    expect(late.difficulty.score).toBeGreaterThan(early.difficulty.score);
  });
});