import Phaser from 'phaser';
import { PALETTE } from '../theme/palette';
import { loadHighScores } from '../storage/highScores';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create(data: { score: number }) {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add.text(cx, cy - 140, 'GAME OVER', {
      fontSize: '48px',
      color: PALETTE.accent,
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(cx, cy - 80, `Score: ${data.score}`, {
      fontSize: '28px',
      color: PALETTE.text,
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    const scores = loadHighScores();
    if (scores.length > 0) {
      this.add.text(cx, cy - 30, 'HIGH SCORES', {
        fontSize: '14px',
        color: PALETTE.textDim,
        fontFamily: 'monospace'
      }).setOrigin(0.5);

      scores.slice(0, 5).forEach((entry, i) => {
        const rank = `${i + 1}.`.padEnd(4, ' ');
        this.add.text(cx, cy + i * 22, `${rank} ${entry.score}`, {
          fontSize: '16px',
          color: PALETTE.text,
          fontFamily: 'monospace'
        }).setOrigin(0.5);
      });
    }

    const play = this.add.text(cx, cy + 150, 'PLAY AGAIN', {
      fontSize: '24px',
      color: PALETTE.text,
      fontFamily: 'monospace',
      backgroundColor: '#1a1a2e',
      padding: { x: 24, y: 12 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    play.on('pointerdown', () => this.scene.start('GameScene'));
    play.on('pointerover', () => play.setColor(PALETTE.accent));
    play.on('pointerout', () => play.setColor(PALETTE.text));
  }
}
