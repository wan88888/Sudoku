import Phaser from "../phaser";
import { bridge } from "../runtime";
import type { BridgeResult, CompletionSummary, FailureSummary, SessionSnapshot } from "../GameBridge";
import { trackEvent } from "../../game/analytics/telemetry";

export class GameScene extends Phaser.Scene {
  private errorTimer: number | null;
  private nextLevel: number | null;
  private session: SessionSnapshot | null;
  private ui: Phaser.GameObjects.DOMElement | null;
  private boardElement: HTMLElement | null;
  private keypadElement: HTMLElement | null;
  private levelTag: HTMLElement | null;
  private mistakeText: HTMLElement | null;
  private noteMode: boolean;
  private noteButton: HTMLButtonElement | null;
  private backButton: HTMLButtonElement | null;
  private eraseButton: HTMLButtonElement | null;
  private hintButton: HTMLButtonElement | null;
  private resetButton: HTMLButtonElement | null;
  private resultOverlay: HTMLElement | null;
  private resultCopy: HTMLElement | null;
  private resultTitle: HTMLElement | null;
  private nextLevelButton: HTMLButtonElement | null;
  private levelsButton: HTMLButtonElement | null;
  private resultMode: "success" | "failed" | null;
  private highlightedNumber: number | null;
  private longPressTimer: number | null;
  private longPressButton: HTMLButtonElement | null;
  private onBackClick?: () => void;
  private onEraseClick?: () => void;
  private onHintClick?: () => void;
  private onResetClick?: () => void;
  private onNoteModeClick?: () => void;
  private onNextLevelClick?: () => void;
  private onLevelsClick?: () => void;
  private onBoardClick?: (event: MouseEvent) => void;
  private onKeypadClick?: (event: MouseEvent) => void;
  private onKeypadDown?: (event: MouseEvent) => void;
  private onKeypadUp?: (event: MouseEvent) => void;
  private onKeyboard?: (event: KeyboardEvent) => void;

  constructor() {
    super("GameScene");
    this.errorTimer = null;
    this.nextLevel = null;
    this.session = null;
    this.ui = null;
    this.boardElement = null;
    this.keypadElement = null;
    this.levelTag = null;
    this.mistakeText = null;
    this.noteMode = false;
    this.noteButton = null;
    this.backButton = null;
    this.eraseButton = null;
    this.hintButton = null;
    this.resetButton = null;
    this.resultOverlay = null;
    this.resultCopy = null;
    this.resultTitle = null;
    this.nextLevelButton = null;
    this.levelsButton = null;
    this.resultMode = null;
    this.highlightedNumber = null;
    this.longPressTimer = null;
    this.longPressButton = null;
  }

  create(data: { level?: number } = {}): void {
    this.add.rectangle(215, 430, 430, 860, 0xf9f4e7).setOrigin(0.5);

    const level = Number(data.level) || 1;
    const session = bridge.startLevel(level);

    if (!session) {
      this.scene.start("LevelScene");
      return;
    }

    this.session = session;
    this.ui = this.add.dom(215, 430).createFromHTML(gameTemplate(session));

    this.boardElement = getById<HTMLElement>(this.ui, "board");
    this.keypadElement = getById<HTMLElement>(this.ui, "keypad");

    this.levelTag = getById<HTMLElement>(this.ui, "game-level-tag");
    this.mistakeText = getById<HTMLElement>(this.ui, "mistake-count");

    this.backButton = getById<HTMLButtonElement>(this.ui, "back-button");
    this.eraseButton = getById<HTMLButtonElement>(this.ui, "erase-button");
    this.hintButton = getById<HTMLButtonElement>(this.ui, "hint-button");
    this.resetButton = getById<HTMLButtonElement>(this.ui, "new-button");
    this.noteButton = getById<HTMLButtonElement>(this.ui, "note-button");

    this.resultOverlay = getById<HTMLElement>(this.ui, "result-overlay");
    this.resultTitle = getById<HTMLElement>(this.ui, "result-title");
    this.resultCopy = getById<HTMLElement>(this.ui, "result-copy");
    this.nextLevelButton = getById<HTMLButtonElement>(this.ui, "next-level-button");
    this.levelsButton = getById<HTMLButtonElement>(this.ui, "levels-button");

    this.bindEvents();
    this.setNoteMode(false);
    this.renderHeader();
    this.renderBoard();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  bindEvents(): void {
    if (
      !this.backButton ||
      !this.eraseButton ||
      !this.hintButton ||
      !this.resetButton ||
      !this.noteButton ||
      !this.nextLevelButton ||
      !this.levelsButton ||
      !this.boardElement ||
      !this.keypadElement
    ) {
      return;
    }

    const nextLevelButton = this.nextLevelButton;
    const boardElement = this.boardElement;
    const keypadElement = this.keypadElement;
    const keyboard = this.input.keyboard;

    this.onBackClick = () => {
      trackEvent("game_back_to_levels", { level: this.session?.level ?? null });
      this.scene.start("LevelScene");
    };

    this.onEraseClick = () => {
      this.applyResult(bridge.eraseSelected());
    };

    this.onHintClick = () => {
      this.applyResult(bridge.useHint());
    };

    this.onResetClick = () => {
      this.hideResult();
      this.applyResult(bridge.resetCurrentLevel());
      this.setNoteMode(false);
    };

    this.onNoteModeClick = () => {
      this.setNoteMode(!this.noteMode);
    };

    this.onNextLevelClick = () => {
      if (this.resultMode === "failed") {
        this.hideResult();
        this.applyResult(bridge.continueAfterFailure());
        return;
      }

      if (nextLevelButton.disabled || !this.nextLevel) {
        this.hideResult();
        this.scene.start("LevelScene");
        return;
      }

      this.hideResult();
      this.scene.restart({ level: this.nextLevel });
      this.setNoteMode(false);
    };

    this.onLevelsClick = () => {
      trackEvent("game_back_to_level_page", { level: this.session?.level ?? null, resultMode: this.resultMode });
      this.scene.start("LevelScene");
    };

    this.onBoardClick = (event: MouseEvent) => {
      const source = event.target;
      if (!(source instanceof Element) || !this.boardElement) {
        return;
      }

      const target = source.closest(".cell");
      if (!(target instanceof HTMLElement) || !boardElement.contains(target)) {
        return;
      }

      if (this.isResultVisible()) {
        return;
      }

      const index = Number(target.dataset.index);
      if (!Number.isInteger(index)) {
        return;
      }

      this.applyResult(bridge.selectCell(index));
    };

    this.onKeypadClick = (event: MouseEvent) => {
      const source = event.target;
      if (!(source instanceof Element) || !this.keypadElement) {
        return;
      }

      const target = source.closest(".key-btn");
      if (!(target instanceof HTMLElement) || !keypadElement.contains(target)) {
        return;
      }

      if (this.isResultVisible()) {
        return;
      }

      const num = Number(target.dataset.value);
      if (!Number.isInteger(num)) {
        return;
      }

      this.applyResult(this.noteMode ? bridge.toggleNoteSelected(num) : bridge.fillSelected(num));
    };

    this.onKeypadDown = (event: MouseEvent) => {
      const source = event.target;
      if (!(source instanceof Element) || !this.keypadElement) {
        return;
      }

      const target = source.closest(".key-btn");
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const num = Number(target.dataset.value);
      if (!Number.isInteger(num)) {
        return;
      }

      this.clearLongPress();
      this.longPressButton = target;
      this.longPressTimer = window.setTimeout(() => {
        this.highlightedNumber = num;
        this.renderBoard();
      }, 260);
    };

    this.onKeypadUp = () => {
      if (this.highlightedNumber != null) {
        this.highlightedNumber = null;
        this.renderBoard();
      }
      this.clearLongPress();
    };

    this.onKeyboard = (event: KeyboardEvent) => {
      if (this.isResultVisible()) {
        return;
      }

      if (/^[1-9]$/.test(event.key)) {
        const value = Number(event.key);
        this.applyResult(this.noteMode ? bridge.toggleNoteSelected(value) : bridge.fillSelected(value));
        return;
      }

      if (event.key.toLowerCase() === "n") {
        this.setNoteMode(!this.noteMode);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
        this.applyResult(bridge.eraseSelected());
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.applyResult(bridge.moveSelection(0, -1));
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.applyResult(bridge.moveSelection(0, 1));
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.applyResult(bridge.moveSelection(-1, 0));
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        this.applyResult(bridge.moveSelection(1, 0));
      }
    };

    this.backButton.addEventListener("click", this.onBackClick);
    this.eraseButton.addEventListener("click", this.onEraseClick);
    this.hintButton.addEventListener("click", this.onHintClick);
    this.resetButton.addEventListener("click", this.onResetClick);
    this.noteButton.addEventListener("click", this.onNoteModeClick);

    this.nextLevelButton.addEventListener("click", this.onNextLevelClick);
    this.levelsButton.addEventListener("click", this.onLevelsClick);

    boardElement.addEventListener("click", this.onBoardClick);
    keypadElement.addEventListener("click", this.onKeypadClick);
    keypadElement.addEventListener("mousedown", this.onKeypadDown);
    keypadElement.addEventListener("mouseup", this.onKeypadUp);
    keypadElement.addEventListener("mouseleave", this.onKeypadUp);

    keyboard?.on("keydown", this.onKeyboard);
  }

  applyResult(result: BridgeResult): void {
    if (!result || !result.session) {
      return;
    }

    this.session = result.session;
    this.renderHeader();
    this.renderBoard();

    const errorIndex = result.errorIndex;
    if (result.type === "wrong" && typeof errorIndex === "number" && Number.isInteger(errorIndex)) {
      this.scheduleErrorClear(errorIndex);
    }

    if (result.type === "solved" && result.completion) {
      this.showResult(result.completion);
    }

    if (result.type === "failed" && result.failure) {
      this.showFailure(result.failure);
    }

    if (result.type === "revived") {
      this.hideResult();
      trackEvent("game_revived", { level: this.session.level, stamina: this.session.stamina });
    }

    if (result.type === "no-stamina") {
      this.hideResult();
      this.showToastLikeFailure("体力不足", `继续需要 ${this.session.hintCost} 点体力，请先返回。`);
    }
  }

  scheduleErrorClear(index: number): void {
    if (this.errorTimer) {
      window.clearTimeout(this.errorTimer);
    }

    this.errorTimer = window.setTimeout(() => {
      this.errorTimer = null;
      this.applyResult(bridge.clearError(index));
    }, 220);
  }

  renderHeader(): void {
    if (!this.session || !this.levelTag || !this.mistakeText) {
      return;
    }

    this.levelTag.textContent = `Level ${this.session.level}`;
    this.mistakeText.textContent = `${this.session.mistakes}/${this.session.maxMistakes}`;
  }

  renderBoard(): void {
    if (!this.session || !this.boardElement) {
      return;
    }

    const board = this.session.board;
    const selectedIndex = this.session.selectedIndex;
    const prefilled = new Set(this.session.prefilledIndices);
    const errors = new Set(this.session.errorIndices);
    const noteMap = new Map(this.session.noteEntries.map((entry) => [entry.index, entry.values]));

    const html: string[] = [];
    for (let index = 0; index < 81; index += 1) {
      const classes = ["cell"];

      if (prefilled.has(index)) {
        classes.push("prefilled");
      }

      if (index === selectedIndex) {
        classes.push("selected");
      } else if (bridge.isRelatedCell(index, selectedIndex)) {
        classes.push("related");
      }

      if (errors.has(index)) {
        classes.push("error");
      }

      const value = board[index];
      const isHighlighted = this.highlightedNumber != null && value === this.highlightedNumber;

      if (value !== 0) {
        if (isHighlighted) {
          classes.push("value-highlight");
        }

        html.push(
          `<button type="button" class="${classes.join(" ")}" data-index="${index}"><span class="cell-value">${value}</span></button>`
        );
      } else {
        const notes = noteMap.get(index) ?? [];
        const noteGrid = Array.from({ length: 9 }, (_, offset) => {
          const note = offset + 1;
          const visible = notes.includes(note);
          const highlighted = this.highlightedNumber != null && note === this.highlightedNumber;
          return `<span class="cell-note ${visible ? "is-visible" : ""} ${highlighted ? "is-highlighted" : ""}">${
            visible ? note : ""
          }</span>`;
        }).join("");

        html.push(
          `<button type="button" class="${classes.join(" ")}" data-index="${index}"><span class="cell-notes">${noteGrid}</span></button>`
        );
      }
    }

    this.boardElement.innerHTML = html.join("");
  }

  showResult(completion: CompletionSummary): void {
    if (!this.resultCopy || !this.nextLevelButton || !this.resultOverlay || !this.resultTitle) {
      return;
    }

    this.resultMode = "success";
    this.nextLevel = completion.nextLevel;
    this.resultTitle.textContent = completion.isPerfect ? "完美通关" : "通关成功";
    const rewardCopy = completion.staminaReward > 0 ? ` 体力 +${completion.staminaReward}。` : "";
    this.resultCopy.textContent = `第 ${completion.level} 关完成，评级 ${completion.difficulty}，错误 ${completion.mistakes} 次。${rewardCopy}`;

    if (completion.isLastLevel) {
      this.nextLevelButton.disabled = true;
      this.nextLevelButton.textContent = "已是最终关";
      this.nextLevel = null;
    } else {
      this.nextLevelButton.disabled = false;
      this.nextLevelButton.textContent = "下一关";
    }

    this.resultOverlay.classList.add("is-visible");
  }

  showFailure(failure: FailureSummary): void {
    if (!this.resultCopy || !this.nextLevelButton || !this.resultOverlay || !this.resultTitle || !this.levelsButton) {
      return;
    }

    this.resultMode = "failed";
    this.nextLevel = failure.level;
    this.resultTitle.textContent = "挑战失败";
    this.resultCopy.textContent = failure.canContinue
      ? `错误达到 ${failure.maxMistakes} 次，消耗 ${failure.continueCost} 点体力可继续挑战。`
      : `错误达到 ${failure.maxMistakes} 次，体力不足，需返回后重试。`;
    this.nextLevelButton.disabled = !failure.canContinue;
    this.nextLevelButton.textContent = failure.canContinue ? "继续挑战" : "体力不足";
    this.levelsButton.textContent = "回关卡页";
    this.resultOverlay.classList.add("is-visible");
  }

  hideResult(): void {
    if (!this.resultOverlay) {
      return;
    }

    this.resultOverlay.classList.remove("is-visible");
    this.resultMode = null;
  }

  setNoteMode(enabled: boolean): void {
    this.noteMode = enabled;

    if (this.noteButton) {
      this.noteButton.classList.toggle("is-active", enabled);
      this.noteButton.setAttribute("aria-pressed", enabled ? "true" : "false");
    }

    if (this.keypadElement) {
      this.keypadElement.classList.toggle("note-mode", enabled);
    }
  }

  showToastLikeFailure(title: string, message: string): void {
    if (!this.resultCopy || !this.resultTitle || !this.resultOverlay || !this.nextLevelButton || !this.levelsButton) {
      return;
    }

    this.resultMode = "failed";
    this.resultTitle.textContent = title;
    this.resultCopy.textContent = message;
    this.nextLevelButton.disabled = true;
    this.nextLevelButton.textContent = "不可用";
    this.levelsButton.textContent = "回关卡页";
    this.resultOverlay.classList.add("is-visible");
  }

  clearLongPress(): void {
    if (this.longPressTimer) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressButton = null;
  }

  isResultVisible(): boolean {
    if (!this.resultOverlay) {
      return false;
    }

    return this.resultOverlay.classList.contains("is-visible");
  }

  cleanup(): void {
    if (this.errorTimer) {
      window.clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }

    this.clearLongPress();

    if (this.backButton && this.onBackClick) {
      this.backButton.removeEventListener("click", this.onBackClick);
    }

    if (this.eraseButton && this.onEraseClick) {
      this.eraseButton.removeEventListener("click", this.onEraseClick);
    }

    if (this.hintButton && this.onHintClick) {
      this.hintButton.removeEventListener("click", this.onHintClick);
    }

    if (this.resetButton && this.onResetClick) {
      this.resetButton.removeEventListener("click", this.onResetClick);
    }

    if (this.noteButton && this.onNoteModeClick) {
      this.noteButton.removeEventListener("click", this.onNoteModeClick);
    }

    if (this.nextLevelButton && this.onNextLevelClick) {
      this.nextLevelButton.removeEventListener("click", this.onNextLevelClick);
    }

    if (this.levelsButton && this.onLevelsClick) {
      this.levelsButton.removeEventListener("click", this.onLevelsClick);
    }

    if (this.boardElement && this.onBoardClick) {
      this.boardElement.removeEventListener("click", this.onBoardClick);
    }

    if (this.keypadElement && this.onKeypadClick) {
      this.keypadElement.removeEventListener("click", this.onKeypadClick);
    }

    if (this.keypadElement && this.onKeypadDown) {
      this.keypadElement.removeEventListener("mousedown", this.onKeypadDown);
    }

    if (this.keypadElement && this.onKeypadUp) {
      this.keypadElement.removeEventListener("mouseup", this.onKeypadUp);
      this.keypadElement.removeEventListener("mouseleave", this.onKeypadUp);
    }

    if (this.input.keyboard && this.onKeyboard) {
      this.input.keyboard.off("keydown", this.onKeyboard);
    }

    if (this.ui) {
      this.ui.destroy();
      this.ui = null;
    }
  }
}

function gameTemplate(session: SessionSnapshot): string {
  const keypad = Array.from({ length: 9 }, (_, index) => {
    const value = index + 1;
    return `<button type="button" class="key-btn" data-value="${value}">${value}</button>`;
  }).join("");

  return `
    <section class="ui-screen game-screen" aria-label="数独游戏">
      <header class="game-header">
        <button id="back-button" class="ghost-btn icon-only-btn" type="button" aria-label="返回">${icon("back")}</button>
        <h2 id="game-level-tag" class="game-level-title">Level ${session.level}</h2>
        <div class="mistake-pill icon-only-pill" aria-label="错误次数">${icon("mistake")}<strong id="mistake-count">${session.mistakes}/${session.maxMistakes}</strong></div>
      </header>

      <div id="board" class="board" role="grid" aria-label="9x9 数独棋盘"></div>

      <div class="tool-row" role="group" aria-label="棋盘工具">
        <button id="erase-button" class="tool-btn icon-only-btn" type="button" aria-label="擦除">${icon("erase")}</button>
        <button id="hint-button" class="tool-btn icon-only-btn" type="button" aria-label="提示">${icon("hint")}</button>
        <button id="note-button" class="tool-btn icon-only-btn" type="button" aria-label="笔记模式" aria-pressed="false">${icon("note")}</button>
        <button id="new-button" class="tool-btn icon-only-btn" type="button" aria-label="重置本关">${icon("reset")}</button>
      </div>

      <div id="keypad" class="keypad" role="group" aria-label="数字键盘">${keypad}</div>

      <div id="result-overlay" class="result-overlay" aria-live="polite">
        <article class="result-card">
          <h3 id="result-title">通关成功</h3>
          <p id="result-copy"></p>
          <div class="modal-actions">
            <button id="next-level-button" type="button">下一关</button>
            <button id="levels-button" type="button">回关卡页</button>
          </div>
        </article>
      </div>
    </section>
  `;
}

function icon(type: "back" | "mistake" | "erase" | "hint" | "note" | "reset"): string {
  const icons = {
    back: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5L8 12L15 19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mistake:
      '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 9L15 15M15 9L9 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    erase:
      '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12L10 5H20V19H10L4 12Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10L16 14M16 10L12 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    hint: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18H15" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 21H14" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 14C6 12 5 10.5 5 8.5C5 4.9 8 2 12 2C16 2 19 4.9 19 8.5C19 10.5 18 12 16 14V16H8V14Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    note: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20L9 19L18 10L14 6L5 15L4 20Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 8L16 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    reset:
      '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5V10H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.7 14A8 8 0 1 0 8 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  return icons[type];
}

function getById<T extends HTMLElement>(ui: Phaser.GameObjects.DOMElement, id: string): T {
  const element = ui.getChildByID(id) as T | null;
  if (!element) {
    throw new Error(`Missing DOM element: ${id}`);
  }
  return element;
}
