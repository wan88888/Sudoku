export const CHECK_IN_REWARDS = [2, 2, 3, 3, 4, 4, 6] as const;
export const WHEEL_REWARDS = [2, 3, 5, 2, 3, 8] as const;

export interface DailyRewardsState {
  checkInDay: string;
  streak: number;
  spinDay: string;
  spinIndex: number;
}

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validDay(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && localDay(parsed) === value ? value : "";
}

export function normalizeDailyRewards(value: unknown): DailyRewardsState {
  const state = value && typeof value === "object" ? value as Partial<DailyRewardsState> : {};
  const checkInDay = validDay(state.checkInDay);
  const spinDay = validDay(state.spinDay);
  return {
    checkInDay,
    streak: checkInDay && Number.isInteger(state.streak) && state.streak! >= 1 && state.streak! <= 7 ? state.streak! : 0,
    spinDay,
    spinIndex: spinDay && Number.isInteger(state.spinIndex) && state.spinIndex! >= 0 && state.spinIndex! < WHEEL_REWARDS.length ? state.spinIndex! : -1,
  };
}

export function dailyRewardStatus(state: DailyRewardsState, now: Date) {
  const today = localDay(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const checkInAvailable = today > state.checkInDay;
  const day = checkInAvailable
    ? (state.checkInDay === localDay(yesterday) ? state.streak % 7 + 1 : 1)
    : Math.max(1, state.streak);
  return { checkInAvailable, spinAvailable: today > state.spinDay, day, reward: CHECK_IN_REWARDS[day - 1] };
}

export interface DailyRewardResult {
  type: "claimed" | "already-claimed" | "full";
  added: number;
  prize: number;
  spinIndex?: number;
}
