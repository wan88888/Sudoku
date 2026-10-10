import { beforeEach, describe, expect, it, vi } from "vitest";

import { START_STAMINA } from "../src/game/simulation/levelConfig";
import {
  clearActiveSession,
  isStorageDegraded,
  loadActiveSession,
  loadProgress,
  markLevelCompleted,
  saveActiveSession,
  saveProgress,
} from "../src/game/simulation/progressStore";
import { createMemoryStorage } from "./helpers/memoryStorage";

describe("progressStore", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  it("loads and normalizes saved progress", () => {
    saveProgress({ highestUnlocked: 4, completed: [3, 2, 2, 1], stamina: START_STAMINA - 2 });

    expect(loadProgress()).toEqual({
      highestUnlocked: 4,
      completed: [1, 2, 3],
      stamina: START_STAMINA - 2,
    });
  });

  it("marks a level complete and unlocks the next one", () => {
    const next = markLevelCompleted({ highestUnlocked: 1, completed: [], stamina: START_STAMINA }, 1);

    expect(next).toEqual({
      highestUnlocked: 2,
      completed: [1],
      stamina: START_STAMINA,
    });
  });

  it("persists and clears the active session", () => {
    saveActiveSession({
      level: 3,
      targetClues: 41,
      board: Array(81).fill(0),
      selectedIndex: 12,
      mistakes: 2,
      noteEntries: [
        { index: 12, values: [1, 4, 7] },
        { index: 30, values: [2, 9] },
      ],
    });

    expect(loadActiveSession()).toEqual({
      level: 3,
      targetClues: 41,
      board: Array(81).fill(0),
      selectedIndex: 12,
      mistakes: 2,
      noteEntries: [
        { index: 12, values: [1, 4, 7] },
        { index: 30, values: [2, 9] },
      ],
    });

    clearActiveSession();

    expect(loadActiveSession()).toBeNull();
  });
});

describe('storage fallback', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: createMemoryStorage(), configurable: true });
    loadProgress();
  });

  it('keeps the latest progress in memory after writes fail', () => {
    saveProgress({ highestUnlocked: 1, completed: [], stamina: 20 });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    saveProgress({ highestUnlocked: 2, completed: [1], stamina: 19 });
    expect(loadProgress()).toEqual({ highestUnlocked: 2, completed: [1], stamina: 19 });
    expect(isStorageDegraded()).toBe(true);
  });

  it('does not resurrect a stale session when deleting it fails', () => {
    saveActiveSession({ level: 1, targetClues: 46, board: Array(81).fill(0), selectedIndex: -1, mistakes: 0, noteEntries: [] });
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    clearActiveSession();
    expect(loadActiveSession()).toBeNull();
    expect(isStorageDegraded()).toBe(true);
  });

  it('continues even when accessing localStorage itself throws', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    expect(() => saveProgress({ highestUnlocked: 3, completed: [1, 2], stamina: 17 })).not.toThrow();
    expect(loadProgress().highestUnlocked).toBe(3);
    expect(() => clearActiveSession()).not.toThrow();
    expect(isStorageDegraded()).toBe(true);
  });
});
