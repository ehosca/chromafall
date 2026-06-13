import Phaser from 'phaser';
import { PALETTE } from '../theme/palette';
import { FONT_DISPLAY, FONT_UI } from '../theme/fonts';
import { sfx } from '../fx/sfx';
import { breathingPulse } from '../fx/effects';
import { drawSynthwaveBackground } from '../fx/background';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const hasWebGL = this.sys.renderer.type === Phaser.WEBGL;

    drawSynthwaveBackground(this);

    const title = this.add.text(cx, cy - 120, 'CHROMAFALL', {
      fontSize: '60px',
      color: PALETTE.text,
      fontFamily: FONT_DISPLAY,
      fontStyle: 'bold'
    }).setOrigin(0.5).setLetterSpacing(6);
    // Orbitron is wide; "CHROMAFALL" overflows narrow viewports at 60px. Scale
    // down to fit the available width (leaving margin) so it never clips.
    const titleMaxW = this.scale.width - 40;
    if (title.width > titleMaxW) title.setScale(titleMaxW / title.width);

    if (hasWebGL && title.postFX) {
      try {
        // Crisper neon-tube glow: tighter, higher-quality bloom in the brand
        // magenta with a faint inner light, rather than the old soft smudge.
        title.postFX.addGlow(0xff4d9e, 4, 1, false, 0.4, 14);
      } catch {
        // ignore
      }
    }

    this.add.text(cx, cy - 64, 'NEON CASCADE', {
      fontSize: '18px',
      color: PALETTE.textDim,
      fontFamily: FONT_UI,
      fontStyle: '600'
    }).setOrigin(0.5).setLetterSpacing(8);

    const play = this.add.text(cx, cy + 40, 'PLAY', {
      fontSize: '32px',
      color: PALETTE.text,
      fontFamily: FONT_DISPLAY,
      fontStyle: 'bold',
      backgroundColor: '#1a1a2e',
      padding: { x: 36, y: 16 }
    }).setOrigin(0.5).setLetterSpacing(4).setInteractive({ useHandCursor: true });

    if (hasWebGL && play.postFX) {
      try {
        play.postFX.addGlow(0xff4d9e, 2, 0, false, 0.3, 10);
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
      fontSize: '13px',
      color: PALETTE.textDim,
      fontFamily: FONT_UI
    }).setOrigin(0.5).setLetterSpacing(1);

    // Settings link below the PLAY button. Pauses MenuScene under the overlay
    // so the menu state survives — important for the pulse-tween on PLAY.
    const settings = this.add.text(cx, cy + 112, 'SETTINGS', {
      fontSize: '15px',
      color: PALETTE.textDim,
      fontFamily: FONT_UI,
      fontStyle: '600'
    }).setOrigin(0.5).setLetterSpacing(3).setInteractive({ useHandCursor: true });
    settings.on('pointerdown', () => {
      sfx.click();
      this.scene.pause();
      this.scene.launch('SettingsScene', { returnTo: this.scene.key });
    });
    settings.on('pointerover', () => settings.setColor(PALETTE.text));
    settings.on('pointerout', () => settings.setColor(PALETTE.textDim));

    this.scale.on('resize', () => this.scene.restart());
  }
}
