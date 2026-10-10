// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/phaser/phaser", () => ({ default: { Scene: class {}, Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } } } }));
vi.mock("../src/phaser/runtime", async () => {
  const { GameBridge } = await import("../src/phaser/GameBridge");
  return { bridge: new GameBridge() };
});
import { GameScene } from "../src/phaser/scenes/GameScene";
import { LevelScene } from "../src/phaser/scenes/LevelScene";
import { HomeScene } from "../src/phaser/scenes/HomeScene";
import { bridge } from "../src/phaser/runtime";
import { GameBridge } from "../src/phaser/GameBridge";
import { SudokuEngine } from "../src/game/simulation/sudokuEngine";
import { loadProgress, saveProgress } from "../src/game/simulation/progressStore";
import { saveSettings, DEFAULT_SETTINGS } from "../src/game/settings";
import { createMemoryStorage } from "./helpers/memoryStorage";
import { attachScene, button, pointer } from "./helpers/sceneHarness";

const solution = new SudokuEngine().getOrCreateLevel(1).solution;
const cell = (index: number) => document.querySelector<HTMLButtonElement>(`.cell[data-index="${index}"]`)!;
const key = (value: number) => document.querySelector<HTMLButtonElement>(`.key-btn[data-value="${value}"]`)!;
const overlayVisible = () => document.getElementById("result-overlay")!.classList.contains("is-visible");

describe("scene interaction regressions with real DOM and game logic", () => {
  let scene: GameScene;
  let harness: ReturnType<typeof attachScene>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", createMemoryStorage());
    Object.assign(bridge, new GameBridge());
    scene = new GameScene(); harness = attachScene(scene);
  });
  afterEach(() => {
    harness.events.emit("shutdown");
    document.body.replaceChildren();
    document.documentElement.classList.remove("reduce-motion");
    vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
  });
  function mount(stamina = 20) {
    saveProgress({ highestUnlocked: 1, completed: [], stamina });
    Object.assign(bridge, new GameBridge());
    scene.create({ level: 1 });
    const index = bridge.getSessionSnapshot()!.board.indexOf(0);
    cell(index).click();
    return index;
  }
  function fail(index: number) {
    for (let i = 0; i < 3; i++) key(solution[index] % 9 + 1).click();
    expect(overlayVisible()).toBe(true);
  }

  it("restores failure across shutdown and a new bridge, and charges once per revive", () => {
    const index = mount(); fail(index);
    harness.events.emit("shutdown");
    Object.assign(bridge, new GameBridge());
    scene.create({ level: 1 });
    expect(overlayVisible()).toBe(true);
    expect(button("next-level-button").disabled).toBe(false);
    expect(document.getElementById("mistake-count")!.textContent).toBe("3/3");
    button("next-level-button").click();
    expect(overlayVisible()).toBe(false);
    expect(loadProgress().stamina).toBe(19);
    expect(bridge.continueAfterFailure().type).toBe("noop");
    expect(loadProgress().stamina).toBe(19);
    key(solution[index]).click();
    expect(bridge.getSessionSnapshot()!.board[index]).toBe(solution[index]);
  });

  it("uses the last stamina for a hint without letting further hints block manual input", () => {
    mount(1);
    button("hint-button").click();
    expect(loadProgress().stamina).toBe(0);
    const before = bridge.getSessionSnapshot()!.board;
    button("hint-button").click();
    expect(overlayVisible()).toBe(false);
    expect(document.getElementById("game-feedback")!.textContent).toContain("继续手动解题");
    expect(bridge.getSessionSnapshot()!.board).toEqual(before);
    const index = before.indexOf(0);
    cell(index).click(); key(solution[index]).click();
    expect(bridge.getSessionSnapshot()!.board[index]).toBe(solution[index]);
  });

  it("offers a clean free restart, not a free revive, after failure at zero stamina", () => {
    const index = mount(0); fail(index);
    expect(button("next-level-button").disabled).toBe(true);
    button("restart-button").click();
    expect(overlayVisible()).toBe(false);
    expect(bridge.getSessionSnapshot()).toMatchObject({ mistakes: 0, failed: false, stamina: 0 });
    expect(bridge.getSessionSnapshot()!.board).toEqual(new SudokuEngine().getOrCreateLevel(1).puzzle);
  });

  it("keeps cell identity, focus and notes through incremental renders, with no unchanged DOM writes", async () => {
    const index = mount();
    const original = [...document.querySelectorAll(".cell")];
    cell(index).focus();
    harness.keyboard.emit("keydown", new KeyboardEvent("keydown", { key: "n" }));
    harness.keyboard.emit("keydown", new KeyboardEvent("keydown", { key: "3" }));
    expect(cell(index).querySelector(".cell-notes")!.textContent).toBe("3");
    expect(document.activeElement).toBe(original[index]);
    harness.keyboard.emit("keydown", new KeyboardEvent("keydown", { key: "n" }));
    harness.keyboard.emit("keydown", new KeyboardEvent("keydown", { key: String(solution[index]) }));
    expect(cell(index).querySelector<HTMLElement>(".cell-notes")!.hidden).toBe(true);
    expect(document.activeElement).toBe(original[index]);
    expect([...document.querySelectorAll(".cell")].every((node, i) => node === original[i])).toBe(true);
    const observer = new MutationObserver(() => {});
    observer.observe(document.getElementById("board")!, { attributes: true, childList: true, subtree: true, characterData: true });
    scene.renderBoard();
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
    button("erase-button").click();
    expect(cell(index)).toBe(original[index]);
    expect(cell(index).querySelector<HTMLElement>(".cell-value")!.hidden).toBe(true);
  });

  it("touch long press highlights but never fills; a short tap still fills", () => {
    const index = mount(); const digit = solution[index];
    pointer(key(digit), "pointerdown");
    vi.advanceTimersByTime(300);
    expect(document.querySelectorAll(".value-highlight").length).toBeGreaterThan(0);
    pointer(key(digit), "pointerup"); pointer(key(digit), "click");
    expect(document.querySelectorAll(".value-highlight")).toHaveLength(0);
    expect(bridge.getSessionSnapshot()!.board[index]).toBe(0);
    pointer(key(digit), "pointerdown"); pointer(key(digit), "pointerup"); pointer(key(digit), "click");
    expect(bridge.getSessionSnapshot()!.board[index]).toBe(digit);
  });

  it("cancels interrupted mobile gestures and pending highlights during shutdown", () => {
    const index = mount(); const digit = solution[index]; const oldKey = key(digit);
    pointer(oldKey, "pointerdown"); pointer(oldKey, "pointercancel");
    vi.advanceTimersByTime(300); pointer(oldKey, "click");
    expect(bridge.getSessionSnapshot()!.board[index]).toBe(0);
    pointer(oldKey, "pointerdown"); harness.events.emit("shutdown");
    scene.create({ level: 1 }); vi.advanceTimersByTime(300);
    pointer(oldKey, "pointerup"); pointer(oldKey, "click");
    expect(document.querySelectorAll(".value-highlight")).toHaveLength(0);
    expect(bridge.getSessionSnapshot()!.board[index]).toBe(0);
  });

  it("respects saved highlight settings without changing touch safety", () => {
    saveSettings({ ...DEFAULT_SETTINGS, relatedHighlight: false, longPressHighlight: false });
    const index = mount();
    expect(document.querySelectorAll(".related")).toHaveLength(0);
    pointer(key(solution[index]), "pointerdown"); vi.advanceTimersByTime(300);
    expect(document.querySelectorAll(".value-highlight")).toHaveLength(0);
    pointer(key(solution[index]), "pointerup"); pointer(key(solution[index]), "click");
    expect(bridge.getSessionSnapshot()!.board[index]).toBe(0);
  });

  it("repeatedly cycles home, level and game scenes without leaked listeners or duplicate charges", () => {
    const home = new HomeScene(); const homeHarness = attachScene(home);
    const levels = new LevelScene(); const levelHarness = attachScene(levels);
    for (let cycle = 0; cycle < 8; cycle++) {
      home.create(); button("play-button").click();
      expect(homeHarness.start).toHaveBeenLastCalledWith("LevelScene");
      homeHarness.events.emit("shutdown");
      expect(homeHarness.events.listenerCount("destroy")).toBe(0);
      levels.create(); document.querySelector<HTMLButtonElement>(".level-card:not(:disabled)")!.click();
      expect(levelHarness.start).toHaveBeenLastCalledWith("GameScene", { level: 1 });
      levelHarness.events.emit("shutdown");
      expect(levelHarness.events.listenerCount("destroy")).toBe(0);
      scene.create({ level: 1 });
      expect(harness.keyboard.listenerCount("keydown")).toBe(1);
      const before = loadProgress().stamina;
      const hint = button("hint-button"); hint.click();
      expect(loadProgress().stamina).toBe(before - 1);
      button("back-button").click();
      expect(harness.start).toHaveBeenLastCalledWith("LevelScene");
      harness.events.emit("shutdown");
      hint.click();
      expect(loadProgress().stamina).toBe(before - 1);
      expect(harness.keyboard.listenerCount("keydown")).toBe(0);
      expect(harness.events.listenerCount("destroy")).toBe(0);
      expect(document.querySelectorAll(".ui-screen")).toHaveLength(0);
    }
  });
});
