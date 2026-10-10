import Phaser from "../phaser";
import { bridge } from "../runtime";
import type { HomeModel } from "../GameBridge";
import { CHECK_IN_REWARDS, WHEEL_REWARDS, type DailyRewardResult } from "../../game/simulation/dailyRewards";
import { loadSettings } from "../../game/settings";
import { homeIcon } from "../../game/ui/homeIcons";

export class HomeScene extends Phaser.Scene {
  private readonly onShutdown = () => this.cleanup();
  private ui: Phaser.GameObjects.DOMElement | null = null;
  private disposers: Array<() => void> = [];
  private spinTimer: number | undefined;
  private refreshTimer: number | undefined;
  private modal: "check-in" | "spin" | null = null;
  private spinning = false;
  private checkInSignature = "";
  private opener: HTMLButtonElement | null = null;

  constructor() { super("HomeScene"); }

  private get<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.ui?.getChildByID(id) as T | null;
    if (!element) throw new Error(`Missing DOM element: ${id}`);
    return element;
  }

  private listen(element: HTMLElement, type: string, handler: EventListener): void {
    element.addEventListener(type, handler);
    this.disposers.push(() => element.removeEventListener(type, handler));
  }

  create(): void {
    this.add.rectangle(215, 430, 430, 860, 0xf9f4e7).setOrigin(0.5);
    this.modal = null;
    this.spinning = false;
    this.ui = this.add.dom(215, 430).createFromHTML(homeTemplate(bridge.getHomeModel()));
    this.listen(this.get("play-button"), "click", () => this.scene.start("LevelScene"));
    this.listen(this.get("settings-button"), "click", () => this.scene.start("SettingsScene"));
    this.listen(this.get("check-in-button"), "click", () => this.openModal("check-in"));
    this.listen(this.get("wheel-button"), "click", () => this.openModal("spin"));
    this.listen(this.get("home-dialog-close"), "click", () => this.closeModal());
    this.listen(this.get("reward-claim"), "click", () => this.claimReward());
    this.listen(this.get("home-dialog"), "keydown", (event) => {
      const key = event as KeyboardEvent;
      if (key.key === "Escape") { key.preventDefault(); this.closeModal(); }
      if (key.key !== "Tab") return;
      const controls = [...this.get("home-dialog").querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const first = controls[0], last = controls[controls.length - 1];
      if (key.shiftKey && (document.activeElement === first || document.activeElement === this.get("home-dialog"))) {
        key.preventDefault(); last.focus();
      } else if (!key.shiftKey && document.activeElement === last) { key.preventDefault(); first.focus(); }
    });
    this.refreshHome();
    this.refreshTimer = window.setInterval(() => this.refreshHome(), 60_000);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onShutdown);
  }

  private refreshHome(): void {
    const model = bridge.getHomeModel();
    this.get("home-stamina").textContent = String(model.stamina);
    this.get("check-in-status").textContent = model.daily.checkInAvailable ? `今天可领 +${model.daily.reward} 体力` : "今日已签到，明天再来";
    this.get("wheel-status").textContent = model.daily.spinAvailable ? "每日 1 次 · 最高 +8 体力" : "今日已转，明天再来";
    this.get("check-in-button").classList.toggle("reward-done", !model.daily.checkInAvailable);
    this.get("wheel-button").classList.toggle("reward-done", !model.daily.spinAvailable);
    this.get("check-in-dot").hidden = !model.daily.checkInAvailable;
    this.get("wheel-dot").hidden = !model.daily.spinAvailable;
    if (this.modal && !this.spinning) {
      if (this.modal === "check-in" && this.checkInSignature !== `${model.daily.day}:${model.daily.checkInAvailable}`) this.openModal("check-in");
      else this.refreshClaim(model);
    }
  }

  private refreshClaim(model: HomeModel): void {
    const available = this.modal === "check-in" ? model.daily.checkInAvailable : model.daily.spinAvailable;
    const claim = this.get<HTMLButtonElement>("reward-claim");
    claim.disabled = !available || model.stamina >= 99;
    claim.textContent = !available ? "今日已领取" : model.stamina >= 99 ? "体力已满，稍后再领" : this.modal === "spin" ? "免费转一次" : `领取 +${model.daily.reward} 体力`;
  }

  private openModal(kind: "check-in" | "spin"): void {
    const model = bridge.getHomeModel();
    this.modal = kind;
    this.checkInSignature = `${model.daily.day}:${model.daily.checkInAvailable}`;
    this.opener = this.get<HTMLButtonElement>(kind === "check-in" ? "check-in-button" : "wheel-button");
    this.get("home-dialog-title").textContent = kind === "check-in" ? "每天一点，小小进步" : "转出今天的好运";
    this.get("home-dialog-kicker").textContent = kind === "check-in" ? "DAILY CHECK-IN / 7 DAYS" : "DAILY BONUS / FREE SPIN";
    this.get("reward-message").textContent = "";
    this.get("home-dialog-content").innerHTML = kind === "check-in"
      ? `<p class="reward-description">连续签到第 <strong>${model.daily.day}</strong> 天，给下一局充点能量。</p><div class="check-in-week">${CHECK_IN_REWARDS.map((reward, i) => `<div class="check-day ${i + 1 === model.daily.day ? "is-today" : ""} ${i + 1 < model.daily.day || (i + 1 === model.daily.day && !model.daily.checkInAvailable) ? "is-collected" : ""}"><small>第 ${i + 1} 天</small>${homeIcon("star")}<strong>+${reward}</strong></div>`).join("")}</div><p class="reward-rules">连续 7 天为一轮，断签从第 1 天重新开始。<br>按本机日期每日刷新，体力上限 99。</p>`
      : `<p class="reward-description">不用消耗体力，每天免费转一次。</p><div class="wheel-stage"><span class="wheel-pointer"></span><div id="prize-wheel" class="prize-wheel">${WHEEL_REWARDS.map((reward, i) => `<span class="wheel-label" style="--angle:${i * 60 + 30}deg"><b>+${reward}</b><small>体力</small></span>`).join("")}<span class="wheel-hub">${homeIcon("star")}</span></div></div><p class="reward-rules">六个奖格等概率：2、3、5、2、3、8 体力。<br>每天 1 次，无付费；体力上限 99。</p>`;
    this.refreshClaim(model);
    this.get("home-main").inert = true;
    this.get("home-dialog").hidden = false;
    this.get("home-dialog-close").focus();
  }

  private claimReward(): void {
    if (!this.modal || this.spinning) return;
    const result = bridge.claimDailyReward(this.modal);
    this.refreshHome();
    if (result.type !== "claimed") {
      this.get("reward-message").textContent = result.type === "full" ? "体力已经充满，消耗一些再来吧。" : "今天已经领取过，明天再来吧。";
      return;
    }
    if (this.modal === "spin") {
      this.spinning = true;
      this.get<HTMLButtonElement>("reward-claim").disabled = true;
      this.get("reward-claim").textContent = "好运转动中…";
      const reducedMotion = loadSettings().reducedMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      this.get("prize-wheel").style.transform = `rotate(${1800 - result.spinIndex! * 60 - 30}deg)`;
      if (reducedMotion) this.finishReward(result);
      else this.spinTimer = window.setTimeout(() => this.finishReward(result), 2600);
    } else {
      this.openModal("check-in");
      this.finishReward(result);
    }
  }

  private finishReward(result: DailyRewardResult): void {
    this.spinTimer = undefined;
    this.spinning = false;
    if (!this.ui || !this.modal) return;
    this.get("reward-message").textContent = `已获得 ${result.added} 点体力${result.added < result.prize ? `（奖励 ${result.prize}，已达体力上限）` : "，下一局加油！"}`;
    this.refreshHome();
  }

  private closeModal(): void {
    window.clearTimeout(this.spinTimer);
    this.spinTimer = undefined;
    this.spinning = false;
    this.modal = null;
    this.get("home-dialog").hidden = true;
    this.get("home-main").inert = false;
    this.opener?.focus();
    this.refreshHome();
  }

  cleanup(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.onShutdown);
    window.clearTimeout(this.spinTimer);
    window.clearInterval(this.refreshTimer);
    this.spinTimer = undefined;
    this.refreshTimer = undefined;
    this.disposers.forEach(dispose => dispose());
    this.disposers = [];
    this.ui?.destroy();
    this.ui = null;
    this.opener = null;
    this.modal = null;
  }
}

function homeTemplate(model: HomeModel): string {
  return `
    <section class="ui-screen home-screen" aria-label="主页">
      <div id="home-main" class="home-main">
        <header class="home-topbar">
          <button id="settings-button" class="icon-btn home-settings" type="button" aria-label="设置">${homeIcon("settings")}</button>
          <span class="home-edition">YOUR DAILY BRAIN BREAK</span>
          <div class="stamina-pill home-energy" aria-label="体力值">${homeIcon("star")}<strong id="home-stamina">${model.stamina}</strong></div>
        </header>
        <div class="home-hero">
          <div class="hero-orbit" aria-hidden="true"><span class="orbit-plus">+</span><span class="orbit-spark">✧</span><div class="hero-puzzle">${[1, "", 3, "", 5, "", 7, "", 9].map((n, i) => `<span class="${i === 4 ? "puzzle-accent" : n === "" ? "puzzle-empty" : ""}">${n}</span>`).join("")}</div><span class="puzzle-tag">ONE MORE NUMBER.</span></div>
          <h1 class="home-title">Sudoku <span>Sprint<span class="title-dot">.</span></span></h1>
          <p class="home-subtitle">给思绪留白，让灵感填满。</p>
        </div>
        <article class="home-progress">
          <div><span class="progress-eyebrow">你的数独旅程</span><strong>第 ${model.level} 关 <span>/ ${model.totalLevels}</span></strong></div>
          <div class="progress-detail"><span>${model.completed === model.totalLevels ? "全部通关" : `已完成 ${model.completed} 关`}</span><div class="journey-track" role="progressbar" aria-label="通关进度" aria-valuenow="${model.completed}" aria-valuemin="0" aria-valuemax="${model.totalLevels}"><i style="width:${model.completed / model.totalLevels * 100}%"></i></div></div>
        </article>
        <div class="home-actions"><button id="play-button" class="play-btn" type="button" aria-label="Play"><span>Play</span>${homeIcon("arrow")}</button><p>一局小挑战，一点新进步</p></div>
        <div class="home-rewards-heading"><span>每日小惊喜</span><small>A LITTLE EXTRA JOY</small></div>
        <div class="home-rewards">
          <button id="check-in-button" type="button" class="home-reward check-in-card" aria-label="每日签到"><span id="check-in-dot" class="reward-dot"></span><span class="reward-illustration calendar-illustration">${homeIcon("calendar")}<b>7</b></span><strong>7 日签到 ${homeIcon("arrow")}</strong><small id="check-in-status"></small></button>
          <button id="wheel-button" type="button" class="home-reward wheel-card" aria-label="幸运转盘"><span id="wheel-dot" class="reward-dot"></span><span class="reward-illustration wheel-illustration"><span>${homeIcon("star")}</span></span><strong>幸运转盘 ${homeIcon("arrow")}</strong><small id="wheel-status"></small></button>
        </div>
        <p class="home-footer">慢慢来，每一格都有答案。</p>
      </div>
      <div id="home-dialog" class="home-dialog" role="dialog" aria-modal="true" aria-labelledby="home-dialog-title" tabindex="-1" hidden>
        <div class="home-dialog-card"><button id="home-dialog-close" class="home-dialog-close" aria-label="关闭奖励弹窗" type="button">${homeIcon("close")}</button><p id="home-dialog-kicker" class="dialog-kicker"></p><h2 id="home-dialog-title"></h2><div id="home-dialog-content"></div><p id="reward-message" class="reward-message" role="status"></p><button id="reward-claim" class="reward-claim" type="button"></button></div>
      </div>
    </section>`;
}
