import Phaser from "../phaser";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "../../game/settings";

export class SettingsScene extends Phaser.Scene {
  private ui: Phaser.GameObjects.DOMElement | null = null;
  private dispose?: () => void;
  private readonly onShutdown = () => this.cleanup();

  constructor() { super("SettingsScene"); }

  create(): void {
    this.add.rectangle(215, 430, 430, 860, 0xf9f4e7).setOrigin(0.5);
    this.ui = this.add.dom(215, 430).createFromHTML(`
      <section class="ui-screen settings-screen" aria-label="设置">
        <header class="settings-header">
          <button id="settings-back" class="banner-btn" type="button" aria-label="返回主页">←</button>
          <h2>设置</h2>
        </header>
        <p class="settings-intro">让每一局，都适合你的节奏。</p>
        <div class="settings-options">
          <label class="setting-row"><span><strong>减少动画</strong><small>关闭 Play 呼吸和界面过渡动画</small></span><input id="reducedMotion" type="checkbox" aria-label="减少动画"></label>
          <label class="setting-row"><span><strong>关联格高亮</strong><small>选中格子的同行、同列和同宫</small></span><input id="relatedHighlight" type="checkbox" aria-label="关联格高亮"></label>
          <label class="setting-row"><span><strong>长按数字高亮</strong><small>按住数字键查看相同数字，不填写</small></span><input id="longPressHighlight" type="checkbox" aria-label="长按数字高亮"></label>
        </div>
        <p class="settings-help">系统开启“减少动态效果”时也会自动停用动画。设置仅保存在当前浏览器，不影响关卡和体力。</p>
        <button id="settings-reset" class="ghost-btn settings-reset" type="button">恢复默认设置</button>
        <p id="settings-status" role="status" class="settings-status"></p>
        <aside class="settings-guide"><h3>操作小贴士</h3><p>点击空格后选择数字；开启笔记可记录候选数。键盘 1–9 填数，N 切换笔记，方向键移动，Delete 擦除。</p></aside>
      </section>`);
    const get = <T extends HTMLElement>(id: string) => this.ui!.getChildByID(id) as T;
    let settings = loadSettings();
    const inputs = (Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>).map(key => ({ key, input: get<HTMLInputElement>(key) }));
    const sync = () => inputs.forEach(({ key, input }) => { input.checked = settings[key]; });
    sync();
    const status = get<HTMLElement>("settings-status");
    const change = () => {
      inputs.forEach(({ key, input }) => { settings[key] = input.checked; });
      saveSettings(settings);
      status.textContent = "设置已应用";
    };
    const reset = () => {
      settings = { ...DEFAULT_SETTINGS };
      sync();
      saveSettings(settings);
      status.textContent = "已恢复默认设置，游戏进度未改变";
    };
    const back = get<HTMLButtonElement>("settings-back");
    const resetButton = get<HTMLButtonElement>("settings-reset");
    const goBack = () => this.scene.start("HomeScene");
    inputs.forEach(({ input }) => input.addEventListener("change", change));
    back.addEventListener("click", goBack);
    resetButton.addEventListener("click", reset);
    this.dispose = () => {
      inputs.forEach(({ input }) => input.removeEventListener("change", change));
      back.removeEventListener("click", goBack);
      resetButton.removeEventListener("click", reset);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onShutdown);
  }

  cleanup(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.onShutdown);
    this.dispose?.();
    this.dispose = undefined;
    this.ui?.destroy();
    this.ui = null;
  }
}
