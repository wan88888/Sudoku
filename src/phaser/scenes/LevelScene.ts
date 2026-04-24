import Phaser from "../phaser";
import { bridge } from "../runtime";
import { trackEvent } from "../../game/analytics/telemetry";

export class LevelScene extends Phaser.Scene {
  private ui: Phaser.GameObjects.DOMElement | null;
  private levelList: HTMLElement | null;
  private staminaValue: HTMLElement | null;
  private unlockedCount: HTMLElement | null;
  private completedCount: HTMLElement | null;
  private resumeWrap: HTMLElement | null;
  private resumeButton: HTMLButtonElement | null;
  private homeButton: HTMLButtonElement | null;
  private onHomeClick?: () => void;
  private onResumeClick?: () => void;
  private cardListeners: Array<{ element: HTMLButtonElement; handler: () => void }>;

  constructor() {
    super("LevelScene");
    this.ui = null;
    this.levelList = null;
    this.staminaValue = null;
    this.unlockedCount = null;
    this.completedCount = null;
    this.resumeWrap = null;
    this.resumeButton = null;
    this.homeButton = null;
    this.cardListeners = [];
  }

  create(): void {
    this.add.rectangle(215, 430, 430, 860, 0xf9f4e7).setOrigin(0.5);

    this.ui = this.add.dom(215, 430).createFromHTML(levelTemplate());

    this.levelList = getById<HTMLElement>(this.ui, "level-list");
    this.staminaValue = getById<HTMLElement>(this.ui, "level-stamina-value");
    this.unlockedCount = getById<HTMLElement>(this.ui, "unlocked-count");
    this.completedCount = getById<HTMLElement>(this.ui, "completed-count");
    this.resumeWrap = getById<HTMLElement>(this.ui, "resume-wrap");
    this.resumeButton = getById<HTMLButtonElement>(this.ui, "resume-button");
    this.homeButton = getById<HTMLButtonElement>(this.ui, "home-button");

    const homeModel = bridge.getHomeModel();
    this.staminaValue.textContent = `${homeModel.stamina}`;

    this.onHomeClick = () => {
      trackEvent("level_back_home");
      this.scene.start("HomeScene");
    };

    this.onResumeClick = () => {
      const level = Number(this.resumeButton?.dataset.level || "0");
      if (!Number.isInteger(level) || level <= 0) {
        return;
      }

      trackEvent("level_resume_click", { level });
      this.scene.start("GameScene", { level });
    };

    this.homeButton.addEventListener("click", this.onHomeClick);
    this.resumeButton.addEventListener("click", this.onResumeClick);

    this.renderLevelList();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  renderLevelList(): void {
    if (!this.levelList || !this.unlockedCount || !this.completedCount) {
      return;
    }

    const levelList = this.levelList;
    const model = bridge.getLevelModel();
    const currentPlayableLevel = model.unlocked;

    this.unlockedCount.textContent = `已解锁：${model.unlocked}/${model.totalLevels}`;
    this.completedCount.textContent = `已通关：${model.completedCount}`;

    if (this.resumeWrap && this.resumeButton) {
      if (model.resumeLevel) {
        this.resumeWrap.classList.add("is-visible");
        this.resumeButton.dataset.level = `${model.resumeLevel}`;
        this.resumeButton.textContent = `继续 Level ${model.resumeLevel}`;
      } else {
        this.resumeWrap.classList.remove("is-visible");
        this.resumeButton.dataset.level = "";
      }
    }

    levelList.innerHTML = "";
    this.cardListeners = [];

    model.levels.forEach((levelData, idx) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "level-card";

      if (levelData.isCompleted) {
        card.classList.add("completed");
      }

      if (levelData.isUnlocked && levelData.level === currentPlayableLevel && !levelData.isCompleted) {
        card.classList.add("current-target");
      }

      if (!levelData.isUnlocked) {
        card.classList.add("locked");
        card.disabled = true;
      }

      const stateText = levelData.isUnlocked
        ? levelData.isCompleted
          ? "已通关"
          : levelData.level === currentPlayableLevel
            ? "当前可挑战"
            : "可挑战"
        : "未解锁";

      card.setAttribute("aria-label", `第 ${levelData.level} 关，${stateText}`);

      card.innerHTML = `
        <span class="level-main">
          <strong>Level ${levelData.level}</strong>
        </span>
        <span class="badge ${levelData.className}">${
          !levelData.isUnlocked ? "🔐" : levelData.level === currentPlayableLevel && !levelData.isCompleted ? "开始" : "🔓"
        }</span>
      `;

      card.style.animationDelay = `${Math.min((idx + 1) * 12, 460)}ms`;

      if (levelData.isUnlocked) {
        const onClick = () => {
          trackEvent("level_card_click", { level: levelData.level });
          this.scene.start("GameScene", { level: levelData.level });
        };
        card.addEventListener("click", onClick);
        this.cardListeners.push({ element: card, handler: onClick });
      }

      levelList.append(card);
    });
  }

  cleanup(): void {
    if (this.homeButton && this.onHomeClick) {
      this.homeButton.removeEventListener("click", this.onHomeClick);
    }

    if (this.resumeButton && this.onResumeClick) {
      this.resumeButton.removeEventListener("click", this.onResumeClick);
    }

    this.cardListeners.forEach(({ element, handler }) => {
      element.removeEventListener("click", handler);
    });
    this.cardListeners = [];

    if (this.ui) {
      this.ui.destroy();
      this.ui = null;
    }
  }
}

function levelTemplate(): string {
  return `
    <section class="ui-screen level-screen" aria-label="关卡选择">
      <header class="level-topbar">
        <button id="home-button" class="banner-btn" type="button" aria-label="返回">←</button>
        <div class="stamina-pill" aria-label="体力值">⭐️ <strong id="level-stamina-value">20</strong></div>
      </header>

      <div class="stats-row">
        <article class="stat-card">
          <strong id="unlocked-count">已解锁：1/100</strong>
        </article>
        <article class="stat-card">
          <strong id="completed-count">已通关：0</strong>
        </article>
      </div>

      <div id="resume-wrap" class="resume-wrap" aria-live="polite">
        <button id="resume-button" class="resume-btn" type="button">继续 Level 1</button>
      </div>

      <div id="level-list" class="level-list" role="list" aria-label="关卡列表"></div>
    </section>
  `;
}

function getById<T extends HTMLElement>(ui: Phaser.GameObjects.DOMElement, id: string): T {
  const element = ui.getChildByID(id) as T | null;
  if (!element) {
    throw new Error(`Missing DOM element: ${id}`);
  }
  return element;
}
