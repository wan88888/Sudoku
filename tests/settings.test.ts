// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/phaser/phaser", () => ({ default: { Scene: class {}, Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } } } }));
import { SettingsScene } from "../src/phaser/scenes/SettingsScene";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../src/game/settings";
import { isStorageDegraded, loadProgress, saveProgress } from "../src/game/simulation/progressStore";
import { createMemoryStorage } from "./helpers/memoryStorage";
import { attachScene, button } from "./helpers/sceneHarness";

const checkbox = (key: string) => document.getElementById(key) as HTMLInputElement;

describe("settings page", () => {
  let scene: SettingsScene;
  let harness: ReturnType<typeof attachScene>;
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    scene = new SettingsScene(); harness = attachScene(scene);
  });
  afterEach(() => {
    harness.events.emit("shutdown");
    document.body.replaceChildren();
    document.documentElement.classList.remove("reduce-motion");
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  it("applies and persists all preferences through page reentry", () => {
    scene.create();
    checkbox("reducedMotion").click();
    checkbox("relatedHighlight").click();
    checkbox("longPressHighlight").click();
    expect(loadSettings()).toEqual({ reducedMotion: true, relatedHighlight: false, longPressHighlight: false });
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
    button("settings-back").click();
    expect(harness.start).toHaveBeenLastCalledWith("HomeScene");
    harness.events.emit("shutdown"); scene.create();
    expect(checkbox("reducedMotion").checked).toBe(true);
    expect(checkbox("relatedHighlight").checked).toBe(false);
    expect(checkbox("longPressHighlight").checked).toBe(false);
  });

  it("restores only settings, leaving progress and stamina unchanged", () => {
    saveProgress({ highestUnlocked: 5, completed: [1, 2, 3, 4], stamina: 7 });
    saveSettings({ reducedMotion: true, relatedHighlight: false, longPressHighlight: false });
    const progress = loadProgress();
    scene.create(); button("settings-reset").click();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadProgress()).toEqual(progress);
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
    expect(checkbox("relatedHighlight").checked).toBe(true);
  });

  it("keeps preferences usable in memory when the browser rejects storage", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    scene.create(); checkbox("reducedMotion").click();
    expect(isStorageDegraded()).toBe(true);
    expect(loadSettings().reducedMotion).toBe(true);
    harness.events.emit("shutdown"); scene.create();
    expect(checkbox("reducedMotion").checked).toBe(true);
  });

  it("normalizes malformed settings and ignores unknown keys", () => {
    localStorage.setItem("sudoku-sprint-settings-v1", "{broken");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem("sudoku-sprint-settings-v1", JSON.stringify({ reducedMotion: "yes", relatedHighlight: false, unknown: true }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, relatedHighlight: false });
  });

  it("cleans up callbacks through repeated scene shutdown and direct destruction", () => {
    for (let i = 0; i < 6; i++) {
      scene.create();
      const oldReset = button("settings-reset");
      harness.events.emit(i % 2 ? "destroy" : "shutdown");
      expect(harness.events.listenerCount("destroy")).toBe(0);
      expect(harness.events.listenerCount("shutdown")).toBe(0);
      saveSettings({ ...DEFAULT_SETTINGS, reducedMotion: true });
      oldReset.click();
      expect(loadSettings().reducedMotion).toBe(true);
      expect(document.querySelectorAll(".settings-screen")).toHaveLength(0);
    }
  });
});
