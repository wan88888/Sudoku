import "./style.css";
import Phaser from "./phaser/phaser";
import { GameScene } from "./phaser/scenes/GameScene";
import { HomeScene } from "./phaser/scenes/HomeScene";
import { LevelScene } from "./phaser/scenes/LevelScene";
import { SettingsScene } from "./phaser/scenes/SettingsScene";
import { applySettingsAppearance, loadSettings } from "./game/settings";
import { isStorageDegraded, STORAGE_STATUS_EVENT } from "./game/simulation/progressStore";

const storageNotice = document.createElement("p");
storageNotice.className = "storage-notice";
storageNotice.setAttribute("role", "status");
storageNotice.textContent = "进度暂时无法保存；可继续游戏，刷新或关闭页面后可能丢失。";
document.body.append(storageNotice);
const updateStorageNotice = () => { storageNotice.hidden = !isStorageDegraded(); };
window.addEventListener(STORAGE_STATUS_EVENT, updateStorageNotice);
updateStorageNotice();
applySettingsAppearance(loadSettings());

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-root",
  width: 430,
  height: 860,
  backgroundColor: "#f8f4e8",
  scene: [HomeScene, LevelScene, GameScene, SettingsScene],
  dom: {
    createContainer: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
