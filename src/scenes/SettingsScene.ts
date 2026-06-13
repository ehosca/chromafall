import Phaser from 'phaser';
import { PALETTE } from '../theme/palette';
import { FONT_DISPLAY, FONT_UI } from '../theme/fonts';
import { THEMES, getActiveTheme, setActiveTheme } from '../theme/themes';
import { sfx } from '../fx/sfx';
import { breathingPulse } from '../fx/effects';

/**
 * Settings overlay. Launched on top of MenuScene or GameScene; the caller is
 * paused and stays in memory underneath. Picking a theme pushes a live repaint
 * to the underlying GameScene (if that's the caller) so the user sees the
 * change without losing game state.
 *
 * Launch:  scene.pause(currentKey); scene.launch('SettingsScene', { returnTo: currentKey });
 * Return:  ESC or Back button → scene.stop('SettingsScene'); scene.resume(returnTo);
 */
export class SettingsScene extends Phaser.Scene {
  private returnTo = 'MenuScene';
  private themeRows: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('SettingsScene');
  }

  init(data: { returnTo?: string }) {
    this.returnTo = data?.returnTo ?? 'MenuScene';
    this.themeRows = [];
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Semi-transparent click-blocking backdrop. The 0.78 alpha lets the
    // underlying scene peek through subtly — when the user picks a theme
    // while the GameScene is the caller, they can faintly see the new
    // tile colors take effect without dismissing this scene.
    const backdrop = this.add.rectangle(0, 0, w, h, 0x000000, 0.78)
      .setOrigin(0)
      .setInteractive(); // swallow clicks so they don't reach the paused scene

    // Title
    this.add.text(w / 2, 60, 'SETTINGS', {
      fontSize: '28px',
      color: PALETTE.text,
      fontFamily: FONT_DISPLAY,
      fontStyle: 'bold'
    }).setOrigin(0.5, 0).setLetterSpacing(4);

    // -------- THEME section --------
    let y = 130;
    this.add.text(w / 2, y, 'THEME', {
      fontSize: '22px',
      color: PALETTE.textDim,
      fontFamily: FONT_UI,
      fontStyle: 'bold'
    }).setOrigin(0.5, 0);
    y += 40;

    for (const t of THEMES) {
      const row = this.add.text(w / 2, y, '', {
        fontSize: '20px',
        color: PALETTE.text,
        fontFamily: FONT_UI
      }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });

      row.on('pointerdown', () => {
        sfx.click();
        setActiveTheme(t.id);
        this.refreshThemeRows();
        // Live repaint of the underlying GameScene if that's where we came from.
        // We talk to it directly via scene.get — the scene is paused but its
        // sprites are still in memory and respond to property changes.
        if (this.returnTo === 'GameScene') {
          const gs = this.scene.get('GameScene') as Phaser.Scene & {
            applyCurrentTheme?: () => void;
          };
          gs.applyCurrentTheme?.();
        }
      });
      row.on('pointerover', () => {
        if (getActiveTheme().id !== t.id) row.setColor(PALETTE.accent);
      });
      row.on('pointerout', () => this.refreshThemeRows());

      this.themeRows.push(row);
      y += 30;
    }
    this.refreshThemeRows();

    // -------- SOUND section --------
    y += 28;
    this.add.text(w / 2, y, 'SOUND', {
      fontSize: '22px',
      color: PALETTE.textDim,
      fontFamily: FONT_UI,
      fontStyle: 'bold'
    }).setOrigin(0.5, 0);
    y += 40;

    // iOS-style sliding toggle:
    //   pill background — accent pink when ON, neutral gray when OFF
    //   white knob       — slides left↔right with a short ease, animating the change
    // Whole thing is one Container with a rectangular hit area so the user can
    // tap anywhere on the pill (not just the knob) to flip it.
    const TOGGLE_W = 64;
    const TOGGLE_H = 32;
    const KNOB_R = 12;
    const KNOB_PAD = 4;
    const KNOB_X_ON = TOGGLE_W / 2 - KNOB_R - KNOB_PAD;
    const KNOB_X_OFF = -TOGGLE_W / 2 + KNOB_R + KNOB_PAD;
    const COLOR_ON = 0xff4d9e;  // accent pink
    const COLOR_OFF = 0x4a4a5e; // muted slate
    const COLOR_HOVER_ON = 0xff6db0;
    const COLOR_HOVER_OFF = 0x5a5a6e;

    const toggleY = y + TOGGLE_H / 2;
    const toggle = this.add.container(w / 2, toggleY);
    toggle.setSize(TOGGLE_W, TOGGLE_H);
    toggle.setInteractive(
      new Phaser.Geom.Rectangle(-TOGGLE_W / 2, -TOGGLE_H / 2, TOGGLE_W, TOGGLE_H),
      Phaser.Geom.Rectangle.Contains
    );
    // Phaser's setInteractive doesn't accept InputConfiguration when given a
    // custom hit area — set the hand cursor on the input plugin directly.
    if (toggle.input) toggle.input.cursor = 'pointer';

    const pill = this.add.graphics();
    const knob = this.add.graphics();
    knob.fillStyle(0xffffff, 1);
    knob.fillCircle(0, 0, KNOB_R);

    // Two text labels inside the pill, each visible only when its state is
    // active. Positioned on the side OPPOSITE the knob's resting position
    // (knob ON sits right, so "ON" sits left; knob OFF sits left, so "OFF"
    // sits right). They cross-fade as the user toggles. Z-order: pill at
    // bottom, labels in the middle, knob on top so it slides past the labels.
    const onLabel = this.add.text(-14, 0, 'ON', {
      fontSize: '11px',
      color: '#ffffff',
      fontFamily: FONT_UI,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    const offLabel = this.add.text(14, 0, 'OFF', {
      fontSize: '11px',
      color: '#dddddd',
      fontFamily: FONT_UI,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    toggle.add([pill, onLabel, offLabel, knob]);

    let hovered = false;
    const drawPill = () => {
      const on = !sfx.isMuted();
      pill.clear();
      const c = on
        ? (hovered ? COLOR_HOVER_ON : COLOR_ON)
        : (hovered ? COLOR_HOVER_OFF : COLOR_OFF);
      pill.fillStyle(c, 1);
      pill.fillRoundedRect(-TOGGLE_W / 2, -TOGGLE_H / 2, TOGGLE_W, TOGGLE_H, TOGGLE_H / 2);
    };
    const refreshState = (animate: boolean) => {
      const on = !sfx.isMuted();
      const knobTarget = on ? KNOB_X_ON : KNOB_X_OFF;
      const onAlpha = on ? 1 : 0;
      const offAlpha = on ? 0 : 1;
      if (animate) {
        this.tweens.killTweensOf([knob, onLabel, offLabel]);
        this.tweens.add({ targets: knob, x: knobTarget, duration: 180, ease: 'Cubic.Out' });
        this.tweens.add({ targets: onLabel, alpha: onAlpha, duration: 180 });
        this.tweens.add({ targets: offLabel, alpha: offAlpha, duration: 180 });
      } else {
        knob.x = knobTarget;
        onLabel.alpha = onAlpha;
        offLabel.alpha = offAlpha;
      }
    };

    drawPill();
    refreshState(false);

    toggle.on('pointerdown', () => {
      sfx.setMuted(!sfx.isMuted());
      drawPill();
      refreshState(true);
      // Play click AFTER the toggle so unmute is audibly confirmed and
      // mute itself produces no sound (correct behavior).
      sfx.click();
    });
    toggle.on('pointerover', () => { hovered = true; drawPill(); });
    toggle.on('pointerout', () => { hovered = false; drawPill(); });

    // -------- Back button --------
    const back = this.add.text(w / 2, h - 80, 'BACK', {
      fontSize: '20px',
      color: PALETTE.accent,
      fontFamily: FONT_UI,
      backgroundColor: '#1a1a2e',
      padding: { x: 24, y: 10 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const goBack = () => {
      sfx.click();
      this.scene.stop();
      this.scene.resume(this.returnTo);
    };

    back.on('pointerdown', goBack);
    back.on('pointerover', () => back.setColor(PALETTE.text));
    back.on('pointerout', () => back.setColor(PALETTE.accent));
    breathingPulse(this, back, 1.0, 1.04, 1500);

    this.input.keyboard?.on('keydown-ESC', goBack);

    // App version, dimmed at the very bottom. Sourced from the GitHub
    // Release tag in CI (see workflow + vite.config define block) and
    // from package.json with a "-dev" suffix in local dev — so a quick
    // glance tells you whether you're looking at a shipped build or
    // a dev rebuild.
    this.add.text(w / 2, h - 16, __APP_VERSION__, {
      fontSize: '11px',
      color: PALETTE.textDim,
      fontFamily: FONT_UI
    }).setOrigin(0.5);

    // Reference the backdrop so the linter doesn't complain about unused locals
    // (it's important — its setInteractive is what blocks click pass-through).
    void backdrop;
  }

  private refreshThemeRows() {
    const active = getActiveTheme().id;
    for (let i = 0; i < this.themeRows.length; i++) {
      const t = THEMES[i];
      const row = this.themeRows[i];
      const isActive = t.id === active;
      // Active row prefixed with a marker + accent color; others are dimmed-text.
      row.setText(isActive ? `> ${t.name}` : `  ${t.name}`);
      row.setColor(isActive ? PALETTE.accent : PALETTE.text);
    }
  }
}
