import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameBridge } from "../src/phaser/GameBridge";
import { CHECK_IN_REWARDS, WHEEL_REWARDS, normalizeDailyRewards } from "../src/game/simulation/dailyRewards";
import { loadProgress, markLevelCompleted, saveProgress } from "../src/game/simulation/progressStore";
import { createMemoryStorage } from "./helpers/memoryStorage";

const day = (offset: number) => new Date(2026, 9, 10 + offset, 12);

describe("daily rewards", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: createMemoryStorage(), configurable: true });
  });
  it("claims check-in once across reload and separate bridge instances", () => {
    const first = new GameBridge(); const stale = new GameBridge();
    expect(first.claimDailyReward("check-in", day(0))).toMatchObject({ type: "claimed", added: 2 });
    expect(stale.claimDailyReward("check-in", day(0)).type).toBe("already-claimed");
    expect(new GameBridge().claimDailyReward("check-in", day(0)).type).toBe("already-claimed");
    expect(loadProgress().stamina).toBe(22);
  });
  it("progresses seven consecutive days and begins a new seven-day cycle", () => {
    const bridge = new GameBridge();
    for (let i = 0; i < 8; i++) {
      expect(bridge.getHomeModel(day(i)).daily.day).toBe(i % 7 + 1);
      expect(bridge.claimDailyReward("check-in", day(i)).prize).toBe(CHECK_IN_REWARDS[i % 7]);
    }
  });
  it("resets a broken streak and denies a clock rollback", () => {
    const bridge = new GameBridge();
    bridge.claimDailyReward("check-in", day(0));
    bridge.claimDailyReward("check-in", day(1));
    expect(bridge.getHomeModel(day(3)).daily.day).toBe(1);
    expect(bridge.claimDailyReward("check-in", day(3)).prize).toBe(2);
    expect(bridge.claimDailyReward("check-in", day(2)).type).toBe("already-claimed");
  });
  it("resets eligibility across local midnight, including month and year boundaries", () => {
    const bridge = new GameBridge();
    bridge.claimDailyReward("check-in", new Date(2026, 11, 31, 23, 59));
    expect(bridge.getHomeModel(new Date(2027, 0, 1, 0, 1)).daily).toMatchObject({ day: 2, checkInAvailable: true });
  });
  it.each(WHEEL_REWARDS.map((reward, index) => [index, reward]))("maps wheel segment %i to reward %i", (index, reward) => {
    const bridge = new GameBridge();
    expect(bridge.claimDailyReward("spin", day(0), () => (index + 0.5) / 6)).toMatchObject({ type: "claimed", prize: reward, spinIndex: index });
    expect(new GameBridge().claimDailyReward("spin", day(0)).type).toBe("already-claimed");
    expect(loadProgress().stamina).toBe(20 + reward);
    expect(bridge.getHomeModel(day(1)).daily.spinAvailable).toBe(true);
  });
  it("keeps check-in and spin independent and preserves claims through completion", () => {
    const bridge = new GameBridge();
    bridge.claimDailyReward("check-in", day(0));
    bridge.claimDailyReward("spin", day(0), () => 0);
    saveProgress(markLevelCompleted(loadProgress(), 1));
    expect(new GameBridge().getHomeModel(day(0)).daily).toMatchObject({ checkInAvailable: false, spinAvailable: false });
    expect(loadProgress()).toMatchObject({ stamina: 24, completed: [1] });
  });
  it("does not consume an entitlement at full stamina and reports only credited stamina near the cap", () => {
    saveProgress({ highestUnlocked: 1, completed: [], stamina: 99 });
    const bridge = new GameBridge();
    expect(bridge.claimDailyReward("spin", day(0)).type).toBe("full");
    expect(bridge.getHomeModel(day(0)).daily.spinAvailable).toBe(true);
    saveProgress({ highestUnlocked: 1, completed: [], stamina: 98 });
    expect(bridge.claimDailyReward("spin", day(0), () => 0.99)).toMatchObject({ prize: 8, added: 1 });
    expect(loadProgress().stamina).toBe(99);
  });
  it("keeps reward and entitlement together during storage failures", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const bridge = new GameBridge();
    expect(bridge.claimDailyReward("check-in", day(0)).added).toBe(2);
    expect(new GameBridge().claimDailyReward("check-in", day(0)).type).toBe("already-claimed");
    expect(loadProgress().stamina).toBe(22);
  });
  it("normalizes invalid saved reward data", () => {
    expect(normalizeDailyRewards({ checkInDay: "2026-02-31", streak: 999, spinDay: [], spinIndex: -3 })).toEqual({ checkInDay: "", streak: 0, spinDay: "", spinIndex: -1 });
  });
});
