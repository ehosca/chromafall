import Phaser from 'phaser';
import { PALETTE } from '../theme/palette';
import { sfx } from '../fx/sfx';
import { breathingPulse } from '../fx/effects';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const hasWebGL = this.sys.renderer.type === Phaser.WEBGL;

    const title = this.add.text(cx, cy - 120, 'CHROMAFALL', {
      fontSize: '64px',
      color: PALETTE.accent,
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    if (hasWebGL && title.postFX) {
      try {
        title.postFX.addGlow(0xff4d9e, 3, 0, false, 0.1, 10);
      } catch {
        // ignore
      }
    }

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

    if (hasWebGL && play.postFX) {
      try {
        play.postFX.addGlow(0xff4d9e, 1.5, 0, false, 0.1, 8);
      } catch {
        // ignore
      }
    }

    breathingPulse(this, play, 1.0, 1.05, 1600);

    play.on('pointerdown', () => {
      sfx.click();
      this.scene.start('GameScene');
    });
    play.on('pointerover', () => play.setColor(PALETTE.accent));
    play.on('pointerout', () => play.setColor(PALETTE.text));

    this.add.text(cx, this.scale.height - 30, 'tap color clusters — watch them fall', {
      fontSize: '12px',
      color: PALETTE.textDim,
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.scale.on('resize', () => this.scene.restart());
  }
}
