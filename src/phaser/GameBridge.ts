import { START_STAMINA, TOTAL_LEVELS, clamp, getLevelConfig, type LevelConfig } from "../game/simulation/levelConfig";
import {
  clearActiveSession,
  loadActiveSession,
  loadProgress,
  markLevelCompleted,
  saveActiveSession,
  saveProgress,
  type ActiveSessionState,
  type ProgressState,
} from "../game/simulation/progressStore";
import { trackEvent } from "../game/analytics/telemetry";
import { SudokuEngine } from "../game/simulation/sudokuEngine";

export interface HomeModel {
  title: string;
  stamina: number;
}

export interface LevelCardModel extends LevelConfig {
  level: number;
  isUnlocked: boolean;
  isCompleted: boolean;
}

export interface LevelModel {
  totalLevels: number;
  unlocked: number;
  completedCount: number;
  resumeLevel: number | null;
  levels: LevelCardModel[];
}

export interface SessionSnapshot {
  level: number;
  config: LevelConfig;
  board: number[];
  noteEntries: Array<{ index: number; values: number[] }>;
  selectedIndex: number;
  mistakes: number;
  maxMistakes: number;
  stamina: number;
  hintCost: number;
  prefilledIndices: number[];
  errorIndices: number[];
  completed: boolean;
  failed: boolean;
}

export interface CompletionSummary {
  level: number;
  difficulty: string;
  mistakes: number;
  isPerfect: boolean;
  staminaReward: number;
  isLastLevel: boolean;
  nextLevel: number;
}

export interface FailureSummary {
  level: number;
  mistakes: number;
  maxMistakes: number;
  continueCost: number;
  canContinue: boolean;
}

type BridgeResultType =
  | "noop"
  | "select"
  | "wrong"
  | "failed"
  | "revived"
  | "no-stamina"
  | "solved"
  | "filled"
  | "erased"
  | "hint"
  | "note"
  | "reset"
  | "clear-error";

export interface BridgeResult {
  type: BridgeResultType;
  session: SessionSnapshot | null;
  errorIndex?: number;
  completion?: CompletionSummary | null;
  failure?: FailureSummary | null;
}

interface InternalSession {
  level: number;
  config: LevelConfig;
  puzzle: number[];
  solution: number[];
  board: number[];
  notes: Map<number, Set<number>>;
  selectedIndex: number;
  mistakes: number;
  prefilled: Set<number>;
  errorCells: Set<number>;
  completed: boolean;
  failed: boolean;
}

export class GameBridge {
  private static readonly MAX_MISTAKES = 3;
  private static readonly HINT_COST = 1;

  private readonly engine: SudokuEngine;
  private progress: ProgressState;
  private session: InternalSession | null;
  private activeSession: ActiveSessionState | null;

  constructor() {
    this.engine = new SudokuEngine();
    this.progress = loadProgress();
    this.session = null;
    this.activeSession = loadActiveSession();
  }

  getHomeModel(): HomeModel {
    return {
      title: "Sudoku Sprint",
      stamina: this.progress.stamina,
    };
  }

  getLevelModel(): LevelModel {
    const completedSet = new Set(this.progress.completed);
    const levels: LevelCardModel[] = [];
    const resumeLevel =
      this.activeSession &&
      this.activeSession.level >= 1 &&
      this.activeSession.level <= this.progress.highestUnlocked
        ? this.activeSession.level
        : null;

    for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
      const config = getLevelConfig(level);
      levels.push({
        level,
        ...config,
        isUnlocked: level <= this.progress.highestUnlocked,
        isCompleted: completedSet.has(level),
      });
    }

    return {
      totalLevels: TOTAL_LEVELS,
      unlocked: this.progress.highestUnlocked,
      completedCount: this.progress.completed.length,
      resumeLevel,
      levels,
    };
  }

  startLevel(level: number): SessionSnapshot | null {
    if (level < 1 || level > TOTAL_LEVELS || level > this.progress.highestUnlocked) {
      return null;
    }

    const config = getLevelConfig(level);
    const levelData = this.engine.getOrCreateLevel(level, config.targetClues);
    const ratedConfig: LevelConfig = {
      ...config,
      label: levelData.difficulty.label,
      className: levelData.difficulty.className,
    };

    const restoredSession = this.restoreActiveSession(level, ratedConfig, levelData.puzzle, levelData.solution);

    this.session = restoredSession ?? {
      level,
      config: ratedConfig,
      puzzle: levelData.puzzle,
      solution: levelData.solution,
      board: levelData.puzzle.slice(),
      notes: new Map(),
      selectedIndex: -1,
      mistakes: 0,
      prefilled: new Set(
        levelData.puzzle
          .map((value, index) => (value !== 0 ? index : -1))
          .filter((index) => index !== -1)
      ),
      errorCells: new Set(),
      completed: false,
      failed: false,
    };

    this.persistActiveSession();
    this.schedulePrewarm(level + 1);
    trackEvent("level_start", {
      level,
      resumed: restoredSession != null,
      stamina: this.progress.stamina,
    });

    return this.getSessionSnapshot();
  }

  getSessionSnapshot(): SessionSnapshot | null {
    if (!this.session) {
      return null;
    }

    return {
      level: this.session.level,
      config: this.session.config,
      board: this.session.board.slice(),
      noteEntries: serializeNotes(this.session.notes),
      selectedIndex: this.session.selectedIndex,
      mistakes: this.session.mistakes,
      maxMistakes: GameBridge.MAX_MISTAKES,
      stamina: this.progress.stamina,
      hintCost: GameBridge.HINT_COST,
      prefilledIndices: Array.from(this.session.prefilled),
      errorIndices: Array.from(this.session.errorCells),
      completed: this.session.completed,
      failed: this.session.failed,
    };
  }

  selectCell(index: number): BridgeResult {
    if (!this.session) {
      return this.makeResult("noop");
    }

    this.session.selectedIndex = clamp(index, 0, 80);
    return this.makeResult("select");
  }

  moveSelection(dx: number, dy: number): BridgeResult {
    if (!this.session) {
      return this.makeResult("noop");
    }

    if (this.session.selectedIndex < 0) {
      this.session.selectedIndex = 0;
      return this.makeResult("select");
    }

    const row = Math.floor(this.session.selectedIndex / 9);
    const col = this.session.selectedIndex % 9;

    const nextRow = clamp(row + dy, 0, 8);
    const nextCol = clamp(col + dx, 0, 8);

    this.session.selectedIndex = nextRow * 9 + nextCol;
    return this.makeResult("select");
  }

  fillSelected(num: number): BridgeResult {
    if (!this.session || this.session.completed || this.session.failed) {
      return this.makeResult("noop");
    }

    const index = this.session.selectedIndex;
    if (index < 0 || this.session.prefilled.has(index)) {
      return this.makeResult("noop");
    }

    if (this.session.solution[index] !== num) {
      this.session.mistakes += 1;
      this.session.errorCells.add(index);

      if (this.session.mistakes >= GameBridge.MAX_MISTAKES) {
        this.session.failed = true;
        trackEvent("level_failed", {
          level: this.session.level,
          mistakes: this.session.mistakes,
          stamina: this.progress.stamina,
        });
        return {
          ...this.makeResult("failed"),
          errorIndex: index,
          failure: {
            level: this.session.level,
            mistakes: this.session.mistakes,
            maxMistakes: GameBridge.MAX_MISTAKES,
            continueCost: GameBridge.HINT_COST,
            canContinue: this.progress.stamina >= GameBridge.HINT_COST,
          },
        };
      }

      return {
        ...this.makeResult("wrong"),
        errorIndex: index,
      };
    }

    this.session.board[index] = num;
    this.session.notes.delete(index);
    this.clearPeerNotes(index, num);
    this.session.errorCells.delete(index);

    if (this.isCurrentSolved()) {
      return {
        ...this.makeResult("solved"),
        completion: this.completeCurrentLevel(),
      };
    }

    return this.makeResult("filled");
  }

  eraseSelected(): BridgeResult {
    if (!this.session || this.session.completed || this.session.failed) {
      return this.makeResult("noop");
    }

    const index = this.session.selectedIndex;
    if (index < 0 || this.session.prefilled.has(index)) {
      return this.makeResult("noop");
    }

    this.session.board[index] = 0;
    this.session.errorCells.delete(index);
    this.session.notes.delete(index);
    return this.makeResult("erased");
  }

  toggleNoteSelected(num: number): BridgeResult {
    if (!this.session || this.session.completed || this.session.failed) {
      return this.makeResult("noop");
    }

    if (!Number.isInteger(num) || num < 1 || num > 9) {
      return this.makeResult("noop");
    }

    const index = this.session.selectedIndex;
    if (index < 0 || this.session.prefilled.has(index) || this.session.board[index] !== 0) {
      return this.makeResult("noop");
    }

    const notes = this.session.notes.get(index) ?? new Set<number>();
    if (notes.has(num)) {
      notes.delete(num);
    } else {
      notes.add(num);
    }

    if (notes.size === 0) {
      this.session.notes.delete(index);
    } else {
      this.session.notes.set(index, notes);
    }

    return this.makeResult("note");
  }

  useHint(): BridgeResult {
    if (!this.session || this.session.completed || this.session.failed) {
      return this.makeResult("noop");
    }

    if (this.progress.stamina < GameBridge.HINT_COST) {
      return this.makeResult("no-stamina");
    }

    const emptyCells = this.session.board
      .map((value, index) => (value === 0 ? index : -1))
      .filter((index) => index >= 0);

    if (emptyCells.length === 0) {
      return this.makeResult("noop");
    }

    let targetIndex = emptyCells[0];

    if (this.session.selectedIndex >= 0 && this.session.board[this.session.selectedIndex] === 0) {
      targetIndex = this.session.selectedIndex;
    } else {
      targetIndex = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    }

    this.session.board[targetIndex] = this.session.solution[targetIndex];
    this.session.selectedIndex = targetIndex;
    this.session.errorCells.delete(targetIndex);
    this.session.notes.delete(targetIndex);
    this.progress.stamina = clamp(this.progress.stamina - GameBridge.HINT_COST, 0, 99);
    saveProgress(this.progress);
    trackEvent("hint_used", {
      level: this.session.level,
      stamina: this.progress.stamina,
    });

    if (this.isCurrentSolved()) {
      return {
        ...this.makeResult("solved"),
        completion: this.completeCurrentLevel(),
      };
    }

    return this.makeResult("hint");
  }

  continueAfterFailure(): BridgeResult {
    if (!this.session || !this.session.failed) {
      return this.makeResult("noop");
    }

    if (this.progress.stamina < GameBridge.HINT_COST) {
      return this.makeResult("no-stamina");
    }

    this.progress.stamina = clamp(this.progress.stamina - GameBridge.HINT_COST, 0, 99);
    this.session.failed = false;
    this.session.mistakes = Math.max(GameBridge.MAX_MISTAKES - 1, 0);
    this.session.errorCells.clear();
    saveProgress(this.progress);
    trackEvent("failure_continue", {
      level: this.session.level,
      stamina: this.progress.stamina,
    });

    return this.makeResult("revived");
  }

  resetCurrentLevel(): BridgeResult {
    if (!this.session) {
      return this.makeResult("noop");
    }

    this.session.board = this.session.puzzle.slice();
    this.session.selectedIndex = -1;
    this.session.mistakes = 0;
    this.session.notes.clear();
    this.session.errorCells.clear();
    this.session.completed = false;
    this.session.failed = false;
    trackEvent("level_reset", { level: this.session.level });

    return this.makeResult("reset");
  }

  clearError(index: number): BridgeResult {
    if (!this.session) {
      return this.makeResult("noop");
    }

    this.session.errorCells.delete(index);
    return this.makeResult("clear-error");
  }

  isRelatedCell(index: number, selectedIndex: number): boolean {
    if (selectedIndex < 0 || index === selectedIndex) {
      return false;
    }

    const row = Math.floor(index / 9);
    const col = index % 9;

    const selectedRow = Math.floor(selectedIndex / 9);
    const selectedCol = selectedIndex % 9;

    if (row === selectedRow || col === selectedCol) {
      return true;
    }

    const boxRow = Math.floor(row / 3);
    const boxCol = Math.floor(col / 3);
    const selectedBoxRow = Math.floor(selectedRow / 3);
    const selectedBoxCol = Math.floor(selectedCol / 3);

    return boxRow === selectedBoxRow && boxCol === selectedBoxCol;
  }

  private isCurrentSolved(): boolean {
    if (!this.session) {
      return false;
    }

    for (let index = 0; index < 81; index += 1) {
      if (this.session.board[index] !== this.session.solution[index]) {
        return false;
      }
    }

    return true;
  }

  private completeCurrentLevel(): CompletionSummary | null {
    if (!this.session || this.session.completed) {
      return null;
    }

    const level = this.session.level;
    this.session.completed = true;
    const isPerfect = this.session.mistakes === 0;
    const staminaReward = isPerfect ? 1 : 0;

    if (staminaReward > 0) {
      this.progress.stamina = clamp(this.progress.stamina + staminaReward, 0, Math.max(START_STAMINA, 99));
    }

    this.progress = markLevelCompleted(this.progress, level);
    saveProgress(this.progress);
    clearActiveSession();
    this.activeSession = null;
    trackEvent("level_completed", {
      level,
      mistakes: this.session.mistakes,
      difficulty: this.session.config.label,
      stamina: this.progress.stamina,
      perfect: isPerfect,
    });

    return {
      level,
      difficulty: this.session.config.label,
      mistakes: this.session.mistakes,
      isPerfect,
      staminaReward,
      isLastLevel: level >= TOTAL_LEVELS,
      nextLevel: clamp(level + 1, 1, TOTAL_LEVELS),
    };
  }

  private makeResult(type: BridgeResultType): BridgeResult {
    this.persistActiveSession();

    return {
      type,
      session: this.getSessionSnapshot(),
    };
  }

  private clearPeerNotes(index: number, value: number): void {
    if (!this.session) {
      return;
    }

    for (const [cellIndex, noteValues] of this.session.notes.entries()) {
      if (!this.isRelatedCell(cellIndex, index) || !noteValues.has(value)) {
        continue;
      }

      noteValues.delete(value);
      if (noteValues.size === 0) {
        this.session.notes.delete(cellIndex);
      }
    }
  }

  private schedulePrewarm(startLevel: number): void {
    const levels = Array.from({ length: 3 }, (_, offset) => startLevel + offset).filter(
      (level) => level >= 1 && level <= TOTAL_LEVELS
    );

    const run = () => {
      levels.forEach((level) => {
        const config = getLevelConfig(level);
        this.engine.getOrCreateLevel(level, config.targetClues);
      });
    };

    if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
      window.setTimeout(run, 0);
      return;
    }

    run();
  }

  private restoreActiveSession(
    level: number,
    config: LevelConfig,
    puzzle: number[],
    solution: number[]
  ): InternalSession | null {
    const saved = this.activeSession;
    if (!saved || saved.level !== level || saved.targetClues !== config.targetClues) {
      return null;
    }

    const prefilled = new Set(
      puzzle
        .map((value, index) => (value !== 0 ? index : -1))
        .filter((index) => index !== -1)
    );

    const isCompatible = saved.board.every((value, index) => {
      if (prefilled.has(index)) {
        return value === puzzle[index];
      }

      return value === 0 || value === solution[index];
    });

    if (!isCompatible) {
      clearActiveSession();
      this.activeSession = null;
      return null;
    }

    return {
      level,
      config,
      puzzle: puzzle.slice(),
      solution: solution.slice(),
      board: saved.board.slice(),
      notes: deserializeNotes(saved.noteEntries),
      selectedIndex: saved.selectedIndex,
      mistakes: saved.mistakes,
      prefilled,
      errorCells: new Set(),
      completed: false,
      failed: false,
    };
  }

  private persistActiveSession(): void {
    if (!this.session || this.session.completed) {
      clearActiveSession();
      this.activeSession = null;
      return;
    }

    const payload: ActiveSessionState = {
      level: this.session.level,
      targetClues: this.session.config.targetClues,
      board: this.session.board.slice(),
      selectedIndex: this.session.selectedIndex,
      mistakes: this.session.mistakes,
      noteEntries: serializeNotes(this.session.notes),
    };

    saveActiveSession(payload);
    this.activeSession = payload;
  }
}

function serializeNotes(notes: Map<number, Set<number>>): Array<{ index: number; values: number[] }> {
  return Array.from(notes.entries())
    .map(([index, values]) => ({
      index,
      values: Array.from(values).sort((a, b) => a - b),
    }))
    .sort((a, b) => a.index - b.index);
}

function deserializeNotes(entries: Array<{ index: number; values: number[] }>): Map<number, Set<number>> {
  const result = new Map<number, Set<number>>();
  entries.forEach((entry) => {
    if (entry.values.length > 0) {
      result.set(entry.index, new Set(entry.values));
    }
  });
  return result;
}
