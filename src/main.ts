import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { BG_HEX } from './theme/palette';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: BG_HEX,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene]
};

const game = new Phaser.Game(config);

// Dev hook: expose the game instance so scripted tests / preview harnesses
// can drive scene transitions directly (Phaser's synthesized-event handling
// is unreliable in headless browsers). Harmless in prod.
(window as unknown as { __game: Phaser.Game }).__game = game;
