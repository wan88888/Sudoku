import "./style.css";
import Phaser from "./phaser/phaser";
import { GameScene } from "./phaser/scenes/GameScene";
import { HomeScene } from "./phaser/scenes/HomeScene";
import { LevelScene } from "./phaser/scenes/LevelScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-root",
  width: 430,
  height: 860,
  backgroundColor: "#f8f4e8",
  scene: [HomeScene, LevelScene, GameScene],
  dom: {
    createContainer: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
