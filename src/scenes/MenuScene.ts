import Phaser from 'phaser';
import { PALETTE } from '../theme/palette';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add.text(cx, cy - 120, 'CHROMAFALL', {
      fontSize: '64px',
      color: PALETTE.accent,
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(cx, cy - 60, 'neon cascade', {
      fontSize: '20px',
      color: PALETTE.textDim,
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    const play = this.add.text(cx, cy + 40, 'PLAY', {
      fontSize: '32px',
      color: PALETTE.text,
      fontFamily: 'monospace',
      backgroundColor: '#1a1a2e',
      padding: { x: 32, y: 14 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    play.on('pointerdown', () => this.scene.start('GameScene'));
    play.on('pointerover', () => play.setColor(PALETTE.accent));
    play.on('pointerout', () => play.setColor(PALETTE.text));

    this.scale.on('resize', () => this.scene.restart());
  }
}
