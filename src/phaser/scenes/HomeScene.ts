import Phaser from "../phaser";
import { bridge } from "../runtime";
import type { HomeModel } from "../GameBridge";

export class HomeScene extends Phaser.Scene {
  private readonly onShutdown = () => this.cleanup();
  private ui: Phaser.GameObjects.DOMElement | null;
  private playButton: HTMLButtonElement | null;
  private settingsButton: HTMLButtonElement | null;
  private onPlayClick?: () => void;
  private onSettingsClick?: () => void;

  constructor() {
    super("HomeScene");
    this.ui = null;
    this.playButton = null;
    this.settingsButton = null;
  }

  create(): void {
    this.drawBackdrop();

    const model = bridge.getHomeModel();
    this.ui = this.add.dom(215, 430).createFromHTML(homeTemplate(model));

    this.playButton = getById<HTMLButtonElement>(this.ui, "play-button");
    this.settingsButton = getById<HTMLButtonElement>(this.ui, "settings-button");

    this.onPlayClick = () => {
      this.scene.start("LevelScene");
    };

    this.onSettingsClick = () => {
      this.scene.start("SettingsScene");
    };

    this.playButton.addEventListener("click", this.onPlayClick);
    this.settingsButton.addEventListener("click", this.onSettingsClick);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onShutdown);
  }

  drawBackdrop(): void {
    this.add.rectangle(215, 430, 430, 860, 0xf9f4e7).setOrigin(0.5);
  }

  cleanup(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.onShutdown);
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

      <div class="home-footer" aria-hidden="true"></div>
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
