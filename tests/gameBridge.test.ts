import { beforeEach, describe, expect, it } from "vitest";

import { loadActiveSession, saveProgress } from "../src/game/simulation/progressStore";
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