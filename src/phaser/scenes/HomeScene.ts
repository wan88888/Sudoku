import Phaser from "../phaser";
import { bridge } from "../runtime";
import type { HomeModel } from "../GameBridge";

export class HomeScene extends Phaser.Scene {
  private toastTimer: number | null;
  private ui: Phaser.GameObjects.DOMElement | null;
  private playButton: HTMLButtonElement | null;
  private settingsButton: HTMLButtonElement | null;
  private toast: HTMLElement | null;
  private onPlayClick?: () => void;
  private onSettingsClick?: () => void;

  constructor() {
    super("HomeScene");
    this.toastTimer = null;
    this.ui = null;
    this.playButton = null;
    this.settingsButton = null;
    this.toast = null;
  }

  create(): void {
    this.drawBackdrop();

    const model = bridge.getHomeModel();
    this.ui = this.add.dom(215, 430).createFromHTML(homeTemplate(model));

    this.playButton = getById<HTMLButtonElement>(this.ui, "play-button");
    this.settingsButton = getById<HTMLButtonElement>(this.ui, "settings-button");
    this.toast = getById<HTMLElement>(this.ui, "home-toast");

    this.onPlayClick = () => {
      this.scene.start("LevelScene");
    };

    this.onSettingsClick = () => {
      this.showToast("设置功能即将上线");
    };

    this.playButton.addEventListener("click", this.onPlayClick);
    this.settingsButton.addEventListener("click", this.onSettingsClick);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  drawBackdrop(): void {
    this.add.rectangle(215, 430, 430, 860, 0xf9f4e7).setOrigin(0.5);
  }

  showToast(message: string): void {
    if (!this.toast) {
      return;
    }

    this.toast.textContent = message;
    this.toast.classList.add("is-visible");

    if (this.toastTimer) {
      window.clearTimeout(this.toastTimer);
    }

    this.toastTimer = window.setTimeout(() => {
      if (!this.toast) {
        return;
      }
      this.toast.classList.remove("is-visible");
    }, 1300);
  }

  cleanup(): void {
    if (this.toastTimer) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }

    if (this.playButton && this.onPlayClick) {
      this.playButton.removeEventListener("click", this.onPlayClick);
    }

    if (this.settingsButton && this.onSettingsClick) {
      this.settingsButton.removeEventListener("click", this.onSettingsClick);
    }

    if (this.ui) {
      this.ui.destroy();
      this.ui = null;
    }
  }
}

function homeTemplate(model: HomeModel): string {
  return `
    <section class="ui-screen home-screen" aria-label="主页">
      <header class="home-topbar">
        <button id="settings-button" class="icon-btn" type="button" aria-label="设置">⚙️</button>
        <div class="stamina-pill" aria-label="体力值">⭐️ <strong>${model.stamina}</strong></div>
      </header>

      <div class="home-center">
        <h1 class="home-title">${model.title}</h1>
      </div>

      <div class="home-actions">
        <button id="play-button" class="play-btn" type="button">Play</button>
      </div>

      <p id="home-toast" class="home-toast" aria-live="polite"></p>
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
