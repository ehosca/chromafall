import Phaser from 'phaser';
import { PALETTE } from '../theme/palette';
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
  private soundLabel!: Phaser.GameObjects.Text;

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
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5, 0);

    // -------- THEME section --------
    let y = 130;
    this.add.text(w / 2, y, 'THEME', {
      fontSize: '22px',
      color: PALETTE.textDim,
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5, 0);
    y += 40;

    for (const t of THEMES) {
      const row = this.add.text(w / 2, y, '', {
        fontSize: '20px',
        color: PALETTE.text,
        fontFamily: 'monospace'
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
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5, 0);
    y += 40;

    this.soundLabel = this.add.text(w / 2, y, '', {
      fontSize: '20px',
      color: PALETTE.text,
      fontFamily: 'monospace'
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });

    const refreshSound = () => {
      this.soundLabel.setText(sfx.isMuted() ? 'OFF' : 'ON');
      this.soundLabel.setColor(sfx.isMuted() ? PALETTE.textDim : PALETTE.text);
    };
    refreshSound();

    this.soundLabel.on('pointerdown', () => {
      sfx.setMuted(!sfx.isMuted());
      refreshSound();
      // Play click AFTER the toggle so unmute is audibly confirmed,
      // and a mute toggle plays no sound at all.
      sfx.click();
    });
    this.soundLabel.on('pointerover', () => this.soundLabel.setColor(PALETTE.accent));
    this.soundLabel.on('pointerout', () => refreshSound());

    // -------- Back button --------
    const back = this.add.text(w / 2, h - 80, 'BACK', {
      fontSize: '20px',
      color: PALETTE.accent,
      fontFamily: 'monospace',
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
