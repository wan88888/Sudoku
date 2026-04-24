import { START_STAMINA, STORAGE_KEY, TOTAL_LEVELS, clamp } from "./levelConfig";

const ACTIVE_SESSION_STORAGE_KEY = `${STORAGE_KEY}-active-session`;

export interface ProgressState {
  highestUnlocked: number;
  completed: number[];
  stamina: number;
}

export interface ActiveSessionState {
  level: number;
  targetClues: number;
  board: number[];
  selectedIndex: number;
  mistakes: number;
  noteEntries: Array<{ index: number; values: number[] }>;
}

interface PersistedProgress {
  highestUnlocked?: unknown;
  completed?: unknown;
  stamina?: unknown;
}

interface PersistedActiveSession {
  level?: unknown;
  targetClues?: unknown;
  board?: unknown;
  selectedIndex?: unknown;
  mistakes?: unknown;
  noteEntries?: unknown;
}

export function loadProgress(): ProgressState {
  const fallback: ProgressState = { highestUnlocked: 1, completed: [], stamina: START_STAMINA };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as PersistedProgress;
    const completed = Array.isArray(parsed.completed)
      ? Array.from(
          new Set(
            parsed.completed
              .map((value: unknown) => Number(value))
              .filter((value) => Number.isInteger(value) && value >= 1 && value <= TOTAL_LEVELS)
          )
        ).sort((a, b) => a - b)
      : [];

    const maxCompleted = completed.length ? Math.max(...completed) : 0;
    const parsedHighestUnlocked = Number(parsed.highestUnlocked);
    const highestUnlocked = clamp(
      Number.isInteger(parsedHighestUnlocked) ? parsedHighestUnlocked : maxCompleted + 1,
      1,
      TOTAL_LEVELS
    );

    const parsedStamina = Number(parsed.stamina);

    return {
      highestUnlocked: Math.max(highestUnlocked, clamp(maxCompleted + 1, 1, TOTAL_LEVELS)),
      completed,
      stamina: clamp(Number.isFinite(parsedStamina) ? parsedStamina : START_STAMINA, 0, 99),
    };
  } catch (error) {
    return fallback;
  }
}

export function saveProgress(progress: ProgressState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function loadActiveSession(): ActiveSessionState | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedActiveSession;
    const board = Array.isArray(parsed.board)
      ? parsed.board.map((value: unknown) => Number(value))
      : [];
    const level = Number(parsed.level);
    const targetClues = Number(parsed.targetClues);
    const selectedIndex = Number(parsed.selectedIndex);
    const mistakes = Number(parsed.mistakes);
    const noteEntries = Array.isArray(parsed.noteEntries)
      ? parsed.noteEntries
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }

            const index = Number((entry as { index?: unknown }).index);
            const values = Array.isArray((entry as { values?: unknown }).values)
              ? ((entry as { values?: unknown[] }).values ?? []).map((value) => Number(value))
              : [];

            if (
              !Number.isInteger(index) ||
              index < 0 ||
              index > 80 ||
              values.some((value) => !Number.isInteger(value) || value < 1 || value > 9)
            ) {
              return null;
            }

            return {
              index,
              values: Array.from(new Set(values)).sort((a, b) => a - b),
            };
          })
          .filter((entry): entry is { index: number; values: number[] } => entry != null)
      : [];

    if (
      !Number.isInteger(level) ||
      level < 1 ||
      level > TOTAL_LEVELS ||
      !Number.isInteger(targetClues) ||
      targetClues < 17 ||
      targetClues > 81 ||
      board.length !== 81 ||
      board.some((value) => !Number.isInteger(value) || value < 0 || value > 9) ||
      !Number.isInteger(selectedIndex) ||
      selectedIndex < -1 ||
      selectedIndex > 80 ||
      !Number.isInteger(mistakes) ||
      mistakes < 0 ||
      noteEntries.some((entry) => board[entry.index] !== 0)
    ) {
      return null;
    }

    return {
      level,
      targetClues,
      board,
      selectedIndex,
      mistakes,
      noteEntries,
    };
  } catch {
    return null;
  }
}

export function saveActiveSession(session: ActiveSessionState): void {
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearActiveSession(): void {
  localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
}

export function markLevelCompleted(progress: ProgressState, level: number): ProgressState {
  const completedSet = new Set(progress.completed);
  completedSet.add(level);

  return {
    completed: Array.from(completedSet).sort((a, b) => a - b),
    highestUnlocked: clamp(Math.max(progress.highestUnlocked, level + 1), 1, TOTAL_LEVELS),
    stamina: progress.stamina,
  };
}
