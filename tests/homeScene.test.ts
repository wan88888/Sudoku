// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/phaser/phaser", () => ({ default: { Scene: class {}, Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } } } }));
vi.mock("../src/phaser/runtime", async () => {
  const { GameBridge } = await import("../src/phaser/GameBridge");
  return { bridge: new GameBridge() };
});
import { HomeScene } from "../src/phaser/scenes/HomeScene";
import { bridge } from "../src/phaser/runtime";
import { GameBridge } from "../src/phaser/GameBridge";
import { loadProgress } from "../src/game/simulation/progressStore";
import { DEFAULT_SETTINGS, saveSettings } from "../src/game/settings";
import { createMemoryStorage } from "./helpers/memoryStorage";
import { attachScene, button } from "./helpers/sceneHarness";

describe("home rewards UI", () => {
  let scene: HomeScene; let harness: ReturnType<typeof attachScene>;
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 10, 12));
    vi.stubGlobal("localStorage", createMemoryStorage());
    Object.assign(bridge, new GameBridge());
    scene = new HomeScene(); harness = attachScene(scene); scene.create();
  });
  afterEach(() => {
    harness.events.emit("shutdown"); document.body.replaceChildren();
    document.documentElement.classList.remove("reduce-motion");
    vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  it("uses a vector gear and retains settings and Play navigation", () => {
    expect(button("settings-button").querySelector("svg")).not.toBeNull();
    button("settings-button").click(); expect(harness.start).toHaveBeenLastCalledWith("SettingsScene");
    button("play-button").click(); expect(harness.start).toHaveBeenLastCalledWith("LevelScene");
  });
  it("claims check-in, updates stamina, disables repeat claims and restores focus on close", () => {
    button("check-in-button").click();
    expect(document.getElementById("home-dialog")!.hidden).toBe(false);
    expect(document.querySelectorAll(".check-day")).toHaveLength(7);
    button("reward-claim").click(); button("reward-claim").click();
    expect(loadProgress().stamina).toBe(22);
    expect(document.getElementById("home-stamina")!.textContent).toBe("22");
    expect(document.getElementById("reward-message")!.textContent).toContain("2 点体力");
    expect(button("reward-claim").disabled).toBe(true);
    button("home-dialog-close").click();
    expect(document.activeElement).toBe(button("check-in-button"));
    expect(document.getElementById("home-main")!.inert).toBe(false);
  });
  it("persists a spin before animation, prevents rapid double claims, and survives scene shutdown", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    button("wheel-button").click(); button("reward-claim").click();
    button("reward-claim").click();
    expect(loadProgress().stamina).toBe(28);
    expect(document.getElementById("prize-wheel")!.style.transform).toBe("rotate(1470deg)");
    harness.events.emit("shutdown"); Object.assign(bridge, new GameBridge()); scene.create();
    vi.advanceTimersByTime(3000);
    button("wheel-button").click();
    expect(button("reward-claim").disabled).toBe(true);
    expect(document.getElementById("home-stamina")!.textContent).toBe("28");
  });
  it("shows the final spin reward and honors reduced motion", () => {
    saveSettings({ ...DEFAULT_SETTINGS, reducedMotion: true });
    vi.spyOn(Math, "random").mockReturnValue(0);
    button("wheel-button").click(); button("reward-claim").click();
    expect(document.getElementById("reward-message")!.textContent).toContain("2 点体力");
    expect(button("reward-claim").textContent).toBe("今日已领取");
  });
  it("refreshes daily eligibility while home stays open across midnight", () => {
    button("check-in-button").click(); button("reward-claim").click();
    vi.setSystemTime(new Date(2026, 9, 11, 0, 0)); vi.advanceTimersByTime(60_000);
    expect(document.getElementById("check-in-status")!.textContent).toContain("今天可领");
    expect(button("reward-claim").disabled).toBe(false);
    expect(document.querySelector(".check-day.is-today small")!.textContent).toBe("第 2 天");
  });
  it("traps dialog focus and handles Escape", () => {
    button("wheel-button").click();
    button("reward-claim").focus();
    button("reward-claim").dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(button("home-dialog-close"));
    button("home-dialog-close").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.getElementById("home-dialog")!.hidden).toBe(true);
    expect(document.activeElement).toBe(button("wheel-button"));
  });
  it("removes timers and stale button listeners on shutdown", () => {
    const oldButton = button("wheel-button");
    harness.events.emit("shutdown");
    expect(vi.getTimerCount()).toBe(0);
    expect(harness.events.listenerCount("destroy")).toBe(0);
    oldButton.click(); expect(document.querySelectorAll(".home-dialog")).toHaveLength(0);
  });
});
