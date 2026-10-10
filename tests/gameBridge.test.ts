import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadActiveSession, saveProgress, saveActiveSession, isStorageDegraded } from "../src/game/simulation/progressStore";
import { getLegacyLevelConfig, getLevelConfig } from "../src/game/simulation/levelConfig";
import { SudokuEngine } from "../src/game/simulation/sudokuEngine";
import { GameBridge } from "../src/phaser/GameBridge";
import { createMemoryStorage } from "./helpers/memoryStorage";

describe("GameBridge", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  it("restores an in-progress board from persisted session state", () => {
    const firstBridge = new GameBridge();
    const initial = firstBridge.startLevel(1);
    expect(initial).not.toBeNull();

    const emptyIndex = initial?.board.findIndex((value) => value === 0) ?? -1;
    expect(emptyIndex).toBeGreaterThanOrEqual(0);

    firstBridge.selectCell(emptyIndex);
    const noted = firstBridge.toggleNoteSelected(3).session;
    const hinted = firstBridge.useHint().session;

    const secondBridge = new GameBridge();
    const restored = secondBridge.startLevel(1);

    expect(restored).not.toBeNull();
    expect(restored?.board).toEqual(hinted?.board);
    expect(restored?.noteEntries).toEqual(noted?.noteEntries.filter((entry) => hinted?.board[entry.index] === 0));
    expect(restored?.selectedIndex).toBe(hinted?.selectedIndex);
    expect(restored?.mistakes).toBe(hinted?.mistakes);
  });

  it("fails the level after three mistakes", () => {
    const bridge = new GameBridge();
    const session = bridge.startLevel(1);
    expect(session).not.toBeNull();

    let failure = null;
    const emptyCells = session?.board
      .map((value, index) => (value === 0 ? index : -1))
      .filter((index) => index >= 0) ?? [];

    for (const cell of emptyCells) {
      bridge.selectCell(cell);

      for (let num = 1; num <= 9; num += 1) {
        const result = bridge.fillSelected(num);
        if (result.type === "failed") {
          failure = result.failure;
          break;
        }

        if (result.type === "wrong") {
          break;
        }
      }

      if (failure) {
        break;
      }
    }

    expect(failure).not.toBeNull();
    expect(failure?.maxMistakes).toBe(3);
  });

  it("clears the active session after the level is solved", () => {
    saveProgress({ highestUnlocked: 1, completed: [], stamina: 99 });

    const bridge = new GameBridge();
    const session = bridge.startLevel(1);
    expect(session).not.toBeNull();

    let solved = false;
    for (let step = 0; step < 81; step += 1) {
      const result = bridge.useHint();
      if (result.type === "solved") {
        solved = true;
        break;
      }
    }

    expect(solved).toBe(true);
    expect(loadActiveSession()).toBeNull();

    const nextBridge = new GameBridge();
    expect(nextBridge.getLevelModel().unlocked).toBe(2);
  });
});

describe('gameplay regressions', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: createMemoryStorage(), configurable: true });
  });

  function prepare() {
    const bridge = new GameBridge();
    const session = bridge.startLevel(1)!;
    const index = session.board.indexOf(0);
    const answer = new SudokuEngine().getOrCreateLevel(1, getLevelConfig(1).targetClues).solution[index];
    bridge.selectCell(index);
    return { bridge, session, index, answer };
  }

  it('keeps failure after scene reentry and reload, charging exactly once to revive', () => {
    const { bridge, answer } = prepare();
    for (let i = 0; i < 3; i++) bridge.fillSelected(answer % 9 + 1);
    expect(bridge.startLevel(1)?.failed).toBe(true);
    const reload = new GameBridge();
    expect(reload.startLevel(1)?.failed).toBe(true);
    expect(reload.getFailureSummary()?.canContinue).toBe(true);
    expect(reload.fillSelected(answer).type).toBe('noop');
    expect(reload.useHint().type).toBe('noop');
    expect(reload.continueAfterFailure().session).toMatchObject({ failed: false, mistakes: 2, stamina: 19 });
    expect(reload.continueAfterFailure().type).toBe('noop');
    expect(reload.getHomeModel().stamina).toBe(19);
    expect(reload.fillSelected(answer).type).toBe('filled');
    expect(new GameBridge().startLevel(1)).toMatchObject({ failed: false, mistakes: 2 });
  });

  it('restores old unversioned puzzles and derives failure from the old mistake count', () => {
    const config = getLegacyLevelConfig(60);
    const puzzle = new SudokuEngine().getOrCreateLegacyLevel(60, config.targetClues).puzzle;
    saveProgress({ highestUnlocked: 60, completed: [], stamina: 0 });
    saveActiveSession({ level: 60, targetClues: config.targetClues, board: puzzle, selectedIndex: -1, mistakes: 3, noteEntries: [] });
    const bridge = new GameBridge();
    expect(bridge.startLevel(60)).toMatchObject({ board: puzzle, failed: true });
    expect(bridge.getFailureSummary()?.canContinue).toBe(false);
    expect(bridge.continueAfterFailure().type).toBe('no-stamina');
    expect(bridge.resetCurrentLevel().session).toMatchObject({ board: puzzle, mistakes: 0, failed: false });
  });

  it('allows manual solving after a hint with zero stamina', () => {
    saveProgress({ highestUnlocked: 1, completed: [], stamina: 0 });
    const { bridge, answer } = prepare();
    expect(bridge.useHint()).toMatchObject({ type: 'no-stamina', session: { failed: false } });
    expect(bridge.fillSelected(answer).type).toBe('filled');
  });

  it('can enter, hint, solve and resume progress while persistent writes and deletes fail', () => {
    saveProgress({ highestUnlocked: 1, completed: [], stamina: 99 });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    const { bridge } = prepare();
    expect(isStorageDegraded()).toBe(true);
    let result = bridge.useHint();
    for (let step = 0; step < 81 && result.type !== 'solved'; step++) result = bridge.useHint();
    expect(result).toMatchObject({ type: 'solved', session: { completed: true } });
    expect(loadActiveSession()).toBeNull();
    const reload = new GameBridge();
    expect(reload.getLevelModel().unlocked).toBe(2);
    expect(reload.getHomeModel().stamina).toBe(result.session?.stamina);
  });
});
