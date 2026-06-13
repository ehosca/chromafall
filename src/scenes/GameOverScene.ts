import Phaser from 'phaser';
import { PALETTE } from '../theme/palette';
import { FONT_DISPLAY, FONT_UI } from '../theme/fonts';
import { loadHighScores } from '../storage/highScores';
import { sfx } from '../fx/sfx';
import { breathingPulse } from '../fx/effects';
import { drawSynthwaveBackground } from '../fx/background';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create(data: { score: number; elapsedMs?: number }) {
    const cx = this.scale.width / 2;
    const hasWebGL = this.sys.renderer.type === Phaser.WEBGL;

    drawSynthwaveBackground(this);

    const scores = loadHighScores();
    const isNewBest = scores.length > 0 && scores[0].score === data.score;

    // Lay content out with a running cursor instead of fixed offsets from
    // center, so the gap before PLAY AGAIN stays constant regardless of how
    // many high-score rows render (the old fixed cy+160 left a dead zone when
    // the list was short/empty).
    let y = this.scale.height * 0.16;
    const gap = (px: number) => { y += px; };

    const title = this.add.text(cx, y, 'GAME OVER', {
      fontSize: '46px',
      color: PALETTE.text,
      fontFamily: FONT_DISPLAY,
      fontStyle: 'bold'
    }).setOrigin(0.5, 0).setLetterSpacing(4);
    const titleMaxW = this.scale.width - 40;
    if (title.width > titleMaxW) title.setScale(titleMaxW / title.width);
    if (hasWebGL && title.postFX) {
      try {
        title.postFX.addGlow(0xff4d9e, 3, 1, false, 0.4, 12);
      } catch {
        // ignore
      }
    }
    gap(78);

    if (isNewBest) {
      const best = this.add.text(cx, y, '★ NEW BEST ★', {
        fontSize: '18px',
        color: '#ffd93b',
        fontFamily: FONT_UI,
        fontStyle: '700'
      }).setOrigin(0.5, 0).setLetterSpacing(4);
      breathingPulse(this, best, 1.0, 1.12, 900);
      gap(34);
    }

    this.add.text(cx, y, `${data.score}`, {
      fontSize: '52px',
      color: PALETTE.accent,
      fontFamily: FONT_DISPLAY,
      fontStyle: 'bold'
    }).setOrigin(0.5, 0);
    gap(64);

    this.add.text(cx, y, 'SCORE', {
      fontSize: '13px',
      color: PALETTE.textDim,
      fontFamily: FONT_UI,
      fontStyle: '600'
    }).setOrigin(0.5, 0).setLetterSpacing(4);
    gap(28);

    if (data.elapsedMs != null) {
      this.add.text(cx, y, `Time  ${this.formatTime(data.elapsedMs)}`, {
        fontSize: '18px',
        color: PALETTE.textDim,
        fontFamily: FONT_UI,
        fontStyle: '600'
      }).setOrigin(0.5, 0).setLetterSpacing(2);
      gap(44);
    }

    if (scores.length > 0) {
      this.add.text(cx, y, 'HIGH SCORES', {
        fontSize: '14px',
        color: PALETTE.textDim,
        fontFamily: FONT_UI,
        fontStyle: '600'
      }).setOrigin(0.5, 0).setLetterSpacing(4);
      gap(30);

      scores.slice(0, 5).forEach((entry, i) => {
        const rank = `${i + 1}`.padEnd(2, ' ');
        const isCurrent = entry.score === data.score && i === 0;
        this.add.text(cx, y, `${rank}    ${entry.score}`, {
          fontSize: '18px',
          color: isCurrent ? PALETTE.accent : PALETTE.text,
          fontFamily: FONT_UI,
          fontStyle: isCurrent ? '700' : '500'
        }).setOrigin(0.5, 0).setLetterSpacing(2);
        gap(26);
      });
    }

    gap(40);
    const play = this.add.text(cx, y, 'PLAY AGAIN', {
      fontSize: '24px',
      color: PALETTE.text,
      fontFamily: FONT_DISPLAY,
      fontStyle: 'bold',
      backgroundColor: '#1a1a2e',
      padding: { x: 28, y: 14 }
    }).setOrigin(0.5, 0).setLetterSpacing(3).setInteractive({ useHandCursor: true });

    if (hasWebGL && play.postFX) {
      try {
        play.postFX.addGlow(0xff4d9e, 2, 0, false, 0.3, 10);
      } catch {
        // ignore
      }
    }

    breathingPulse(this, play, 1.0, 1.05, 1500);

    play.on('pointerdown', () => {
      sfx.click();
      this.scene.start('GameScene');
    });
    play.on('pointerover', () => play.setColor(PALETTE.accent));
    play.on('pointerout', () => play.setColor(PALETTE.text));
  }

  private formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }
}
