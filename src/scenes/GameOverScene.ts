import Phaser from 'phaser';
import { PALETTE } from '../theme/palette';
import { loadHighScores } from '../storage/highScores';
import { sfx } from '../fx/sfx';
import { breathingPulse } from '../fx/effects';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create(data: { score: number }) {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const hasWebGL = this.sys.renderer.type === Phaser.WEBGL;

    const title = this.add.text(cx, cy - 160, 'GAME OVER', {
      fontSize: '48px',
      color: PALETTE.accent,
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    if (hasWebGL && title.postFX) {
      try {
        title.postFX.addGlow(0xff4d9e, 2, 0, false, 0.1, 10);
      } catch {
        // ignore
      }
    }

    this.add.text(cx, cy - 100, `Score: ${data.score}`, {
      fontSize: '32px',
      color: PALETTE.text,
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    const scores = loadHighScores();
    if (scores.length > 0) {
      this.add.text(cx, cy - 50, 'HIGH SCORES', {
        fontSize: '14px',
        color: PALETTE.textDim,
        fontFamily: 'monospace'
      }).setOrigin(0.5);

      scores.slice(0, 5).forEach((entry, i) => {
        const rank = `${i + 1}.`.padEnd(4, ' ');
        const isCurrent = entry.score === data.score && i === 0;
        this.add.text(cx, cy - 20 + i * 24, `${rank} ${entry.score}`, {
          fontSize: '16px',
          color: isCurrent ? PALETTE.accent : PALETTE.text,
          fontFamily: 'monospace',
          fontStyle: isCurrent ? 'bold' : 'normal'
        }).setOrigin(0.5);
      });
    }

    const play = this.add.text(cx, cy + 160, 'PLAY AGAIN', {
      fontSize: '24px',
      color: PALETTE.text,
      fontFamily: 'monospace',
      backgroundColor: '#1a1a2e',
      padding: { x: 24, y: 12 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    breathingPulse(this, play, 1.0, 1.05, 1500);

    play.on('pointerdown', () => {
      sfx.click();
      this.scene.start('GameScene');
    });
    play.on('pointerover', () => play.setColor(PALETTE.accent));
    play.on('pointerout', () => play.setColor(PALETTE.text));
  }
}
