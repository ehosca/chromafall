import Phaser from 'phaser';
import { GameController } from '../game/engine';
import type { Brick } from '../game/brick';
import { PALETTE } from '../theme/palette';
import { FONT_UI } from '../theme/fonts';
import { getActiveTheme, applyTheme } from '../theme/themes';
import { saveHighScore } from '../storage/highScores';
import { sfx } from '../fx/sfx';
import { emitBurst, shakeScreen, showComboText } from '../fx/effects';

const ROWS = 14;
const COLS = 9;
const HUD_HEIGHT = 70;
const PADDING = 16;

const FALL_DURATION = 280;
const SHATTER_DURATION = 260;
// Breathing pulse for the primed group's outer perimeter border (replaces the
// per-tile scale pulse, which made the whole selection "jiggle" and fought
// with the shatter tween). Slow-enough yoyo to read as "alive / selected"
// without being distracting.
const BORDER_PULSE_DURATION = 520;
const BORDER_PULSE_MIN_ALPHA = 0.35;
const BORDER_LINE_WIDTH = 3;
const BORDER_COLOR = 0xffffff;

// Color helpers for theme decorations (bevel highlight/shadow). amount is
// 0–1: lighten pushes channels toward white, darken pulls toward black.
function lightenColor(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const lr = Math.min(255, Math.round(r + (255 - r) * amount));
  const lg = Math.min(255, Math.round(g + (255 - g) * amount));
  const lb = Math.min(255, Math.round(b + (255 - b) * amount));
  return (lr << 16) | (lg << 8) | lb;
}
function darkenColor(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const dr = Math.max(0, Math.round(r * (1 - amount)));
  const dg = Math.max(0, Math.round(g * (1 - amount)));
  const db = Math.max(0, Math.round(b * (1 - amount)));
  return (dr << 16) | (dg << 8) | db;
}

export class GameScene extends Phaser.Scene {
  private controller!: GameController;
  private boardContainer!: Phaser.GameObjects.Container;
  private brickSprites: Map<number, Phaser.GameObjects.Rectangle> = new Map();
  // Halos: optional per-tile soft-glow Image drawn UNDER each tile, using a
  // radial-falloff texture (opaque center → transparent edges) tinted to the
  // tile's glow color. Radial alpha means at 4-way intersection corners the
  // halos contribute ~0 alpha and additive sums never reach white. Only
  // present if the active theme has halo=true. Synced to sprite positions
  // every frame in update() so they follow tweens.
  private tileHalos: Map<number, Phaser.GameObjects.Image> = new Map();
  // Bevels: optional per-tile NES-block decoration drawn ON TOP of each tile.
  // Bright top + left edge (highlight from lightened fill), dark bottom +
  // right edge (shadow from darkened fill). Used by Classic for the
  // 3D-extruded look without a hard black inset border. Same lifecycle as
  // tileHalos — synced to sprite positions in update(), torn down with
  // sprites, redrawn on theme change AND on prime/unprime (since the
  // highlight/shadow are derived from the live fill color).
  private tileBevels: Map<number, Phaser.GameObjects.Graphics> = new Map();
  private scoreText!: Phaser.GameObjects.Text;
  private newGameBtn!: Phaser.GameObjects.Text;
  private settingsBtn!: Phaser.GameObjects.Text;
  private undoBtn!: Phaser.GameObjects.Text;
  private redoBtn!: Phaser.GameObjects.Text;
  private tileSize = 32;
  private boardOriginX = 0;
  private boardOriginY = 0;
  // The "primed" group is the tiles a first tap selected; a second tap inside
  // the group commits. Each primed tile swaps fill from theme.fills (muted)
  // to theme.glows (bright) — that's the stateful "selected" signal. The
  // outer-perimeter Graphics below adds an animated border on top.
  private primedGroupIds: Set<number> = new Set();
  // Single Graphics object tracing the outer edges of the primed group.
  // Alpha-pulses while primed. Lives inside boardContainer so its coords match
  // the tile sprites.
  private primedBorder?: Phaser.GameObjects.Graphics;
  // Companion Graphics that fills the GAPS between adjacent primed tiles in
  // the cluster's glow color, so a selection in a gap-using theme (Pastel,
  // Neon) reads as one unified bright shape rather than discrete tiles
  // separated by dark gap stripes. No-op for themes with tileGap=0.
  private primedFill?: Phaser.GameObjects.Graphics;
  private borderPulseTween?: Phaser.Tweens.Tween;
  private busy = false;
  private timerText!: Phaser.GameObjects.Text;
  private elapsedMs = 0;
  private gameEnded = false;

  constructor() {
    super('GameScene');
  }

  create() {
    // Apply the active theme's background up front so the rain-drop entry
    // happens against the correct backdrop. Tile colors are applied per-sprite
    // in createBrickSprite (which reads getActiveTheme), so the very first
    // frame already matches the saved theme — no flash of "default" colors.
    this.cameras.main.setBackgroundColor(getActiveTheme().bg);
    this.ensureHaloTexture();
    this.controller = new GameController(ROWS, COLS);
    this.boardContainer = this.add.container(0, 0);
    this.createHud();
    this.computeLayout();
    this.boardContainer.setPosition(this.boardOriginX, this.boardOriginY);
    this.createBoard();
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this);
    });
  }

  // Called by SettingsScene when the user picks a theme — repaint live sprites
  // in place so the user can see the swap without losing game state.
  applyCurrentTheme(): void {
    applyTheme({
      scene: this,
      sprites: this.brickSprites,
      brickColorOf: (id) => this.findBrick(id)?.color,
      tileSize: this.tileSize,
      scoreText: this.scoreText,
      rerunHud: () => this.refreshUndoRedo()
    });
    // Halo + bevel lifecycle isn't handled by applyTheme (which only knows
    // about sprites). Rebuild both here so switching INTO a theme that wants
    // halos/bevels adds them and switching OUT cleans them up.
    this.rebuildHalos();
    this.rebuildBevels();
  }

  // Phaser calls this every frame. Cheap O(n) sync of halo + bevel
  // decorations to their owning sprite's position — sprites move via tweens
  // (rain-drop, gravity settle, undo/redo). Decorations aren't part of those
  // tweens, so we sync here. n is at most one decoration of each kind per
  // tile (~126), no-op when no decorations exist.
  update(_time: number, delta: number): void {
    // Tick the game timer (automatically paused when scene is paused).
    if (!this.gameEnded) {
      this.elapsedMs += delta;
      this.timerText.setText(this.formatTime(this.elapsedMs));
    }

    if (this.tileHalos.size > 0) {
      for (const [id, halo] of this.tileHalos) {
        const sprite = this.brickSprites.get(id);
        if (sprite) {
          halo.x = sprite.x;
          halo.y = sprite.y;
        }
      }
    }
    if (this.tileBevels.size > 0) {
      for (const [id, bevel] of this.tileBevels) {
        const sprite = this.brickSprites.get(id);
        if (sprite) {
          bevel.x = sprite.x;
          bevel.y = sprite.y;
        }
      }
    }
  }

  // Create or update a halo Image under the given sprite per the active theme.
  // No-op (and removes any existing halo) if the active theme has halo=false.
  //
  // The halo uses a shared radial-falloff texture (see ensureHaloTexture)
  // tinted to the tile's glow color. ADD blending now works cleanly because
  // the texture's alpha at corners is ~0 — the intersection of 4 adjacent
  // halos contributes near-zero brightness there, so no white dots.
  private syncHalo(brickId: number, sprite: Phaser.GameObjects.Rectangle): void {
    const t = getActiveTheme();
    let halo = this.tileHalos.get(brickId);
    if (!t.halo) {
      if (halo) { halo.destroy(); this.tileHalos.delete(brickId); }
      return;
    }
    const size = this.tileSize + t.haloOversize;
    // Use the glow-tier color so the halo matches what a primed tile fades to.
    const color = sprite.getData('glowFill') as number;
    if (!halo) {
      halo = this.add.image(sprite.x, sprite.y, 'halo-glow');
      // ADD blending: same-color clusters compound brightness (the "ganged
      // glow" we want), and at corners between mixed-color tiles the radial
      // texture's near-zero alpha keeps additive sums dim — no white dots.
      halo.setBlendMode(Phaser.BlendModes.ADD);
      // addAt(0) puts it at the BOTTOM of the container — beneath all tiles.
      this.boardContainer.addAt(halo, 0);
      this.tileHalos.set(brickId, halo);
    }
    halo.setDisplaySize(size, size);
    halo.setTint(color);
    halo.setAlpha(t.haloAlpha);
  }

  private removeHalo(brickId: number): void {
    const halo = this.tileHalos.get(brickId);
    if (halo) { halo.destroy(); this.tileHalos.delete(brickId); }
  }

  // Tear down all halos and recreate from scratch for the active theme.
  // Used on theme switches and on createBoard() — cleanest way to handle
  // both add (theme grew halos) and remove (theme dropped halos).
  private rebuildHalos(): void {
    for (const halo of this.tileHalos.values()) halo.destroy();
    this.tileHalos.clear();
    for (const [id, sprite] of this.brickSprites) {
      this.syncHalo(id, sprite);
    }
  }

  // Create or update the bevel Graphics for one tile per the active theme.
  // No-op (and removes any existing bevel) if the active theme has bevel=false.
  //
  // Bevel = bright top + left edges (highlight from lightened fill) and dark
  // bottom + right edges (shadow from darkened fill). Highlight + shadow are
  // derived from the SPRITE's current fill, so this naturally redraws with
  // the right colors on prime/unprime (where fill swaps to the glow tier).
  //
  // Drawn as four fillRect calls on a single Graphics object — cheaper and
  // simpler than four extra Rectangle GameObjects per tile.
  private syncBevel(brickId: number, sprite: Phaser.GameObjects.Rectangle): void {
    const t = getActiveTheme();
    let bevel = this.tileBevels.get(brickId);
    if (!t.bevel) {
      if (bevel) { bevel.destroy(); this.tileBevels.delete(brickId); }
      return;
    }
    const fill = sprite.fillColor;
    const w = sprite.width;
    const h = sprite.height;
    const b = t.bevelSize;
    const light = lightenColor(fill, 0.35);
    const dark = darkenColor(fill, 0.45);
    if (!bevel) {
      bevel = this.add.graphics();
      this.boardContainer.add(bevel); // top of stack — bevel sits ON TOP of tile
      this.tileBevels.set(brickId, bevel);
    }
    bevel.clear();
    // Sprite origin is center; draw with (0,0) at center too.
    const x = -w / 2;
    const y = -h / 2;
    bevel.fillStyle(light, 1);
    bevel.fillRect(x, y, w, b);              // top edge
    bevel.fillRect(x, y, b, h);              // left edge
    bevel.fillStyle(dark, 1);
    bevel.fillRect(x, y + h - b, w, b);      // bottom edge
    bevel.fillRect(x + w - b, y, b, h);      // right edge
    bevel.x = sprite.x;
    bevel.y = sprite.y;
  }

  private removeBevel(brickId: number): void {
    const bevel = this.tileBevels.get(brickId);
    if (bevel) { bevel.destroy(); this.tileBevels.delete(brickId); }
  }

  private rebuildBevels(): void {
    for (const bevel of this.tileBevels.values()) bevel.destroy();
    this.tileBevels.clear();
    for (const [id, sprite] of this.brickSprites) {
      this.syncBevel(id, sprite);
    }
  }

  // Generate the soft-glow halo texture once per scene boot. Drawn as a
  // radial gradient on a canvas-backed Phaser texture: opaque white center
  // fading to fully transparent at the edge. The white center is what
  // setTint mutates per-tile, and the soft edge is what gives us the
  // "no white dots at intersection corners" behavior — the corners of a
  // sprite using this texture have alpha ~0, so additive overlap there
  // contributes ~0 brightness.
  //
  // Texture lives in the global Phaser TextureManager keyed by 'halo-glow'.
  // Re-entry (e.g. scene restart) is no-op via textures.exists().
  private ensureHaloTexture(): void {
    const KEY = 'halo-glow';
    if (this.textures.exists(KEY)) return;
    const SIZE = 128;
    const canvas = this.textures.createCanvas(KEY, SIZE, SIZE);
    if (!canvas) return;
    const ctx = canvas.getContext();
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const radius = SIZE / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    // Falloff curve tuned for "halo around a tile":
    //
    //   The TILE sits on top of the halo, covering the center ~76% of the
    //   sprite's diameter. The visible portion is a ring just outside the
    //   tile's edge — texture coords ~0.75 to ~0.95 of the gradient. We need
    //   that ring to be bright; zero-alpha needs to be at the gradient END
    //   so the sprite's CORNERS (outside the inscribed circle) stay alpha 0.
    //   Corners-at-0 is the whole point — that's what kills the white dots
    //   at 4-way intersections under additive blending.
    //
    //   Old gradient had alpha 0.25 at coord 0.7 — way too dim for the
    //   visible glow ring. New curve keeps near-full alpha out to 0.55, then
    //   smoothly falls so the ring is bright but the edges + corners are 0.
    //
    // White RGB so setTint multiplies cleanly to the target color.
    grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,1.0)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.92, 'rgba(255,255,255,0.40)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
    canvas.refresh();
  }

  private createHud() {
    // Use active theme's HUD color so the initial render matches the saved
    // theme. applyTheme keeps it in sync on subsequent theme switches.
    this.scoreText = this.add.text(PADDING, PADDING, 'Score: 0', {
      fontSize: '22px',
      color: getActiveTheme().hudScoreColor,
      fontFamily: FONT_UI
    });

    this.timerText = this.add.text(PADDING, PADDING + 28, '0:00', {
      fontSize: '14px',
      color: PALETTE.textDim,
      fontFamily: FONT_UI
    });

    this.newGameBtn = this.add.text(this.scale.width - PADDING, PADDING, 'New', {
      fontSize: '18px',
      color: PALETTE.accent,
      fontFamily: FONT_UI
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.newGameBtn.on('pointerdown', () => {
      if (this.busy) return;
      sfx.click();
      this.onNewGame();
    });
    this.newGameBtn.on('pointerover', () => this.newGameBtn.setColor(PALETTE.text));
    this.newGameBtn.on('pointerout', () => this.newGameBtn.setColor(PALETTE.accent));

    // Settings link replaces the inline Sound toggle. The Settings overlay
    // owns both Theme and Sound — keeps the HUD lean and gives settings room
    // to grow. Pauses GameScene under the overlay so animations don't keep
    // spinning while the user fiddles with options.
    this.settingsBtn = this.add.text(this.scale.width - PADDING, PADDING + 28, 'Settings', {
      fontSize: '12px',
      color: PALETTE.textDim,
      fontFamily: FONT_UI
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.settingsBtn.on('pointerdown', () => {
      if (this.busy) return;
      sfx.click();
      this.scene.pause();
      this.scene.launch('SettingsScene', { returnTo: this.scene.key });
    });
    this.settingsBtn.on('pointerover', () => this.settingsBtn.setColor(PALETTE.text));
    this.settingsBtn.on('pointerout', () => this.settingsBtn.setColor(PALETTE.textDim));

    // Undo / Redo sit on the top row alongside "New", right-aligned in the
    // order [Undo] [Redo] [New]. They share the 18px primary-control size so
    // they read at the same level as New. Color encodes enabled state:
    // PALETTE.accent when actionable, PALETTE.textDim when not. Hover only
    // swaps to text color when enabled, so a disabled button can't pretend
    // it's interactive.
    //
    // Positions (right-aligned, origin 1,0):
    //   New  ends at  w - PADDING
    //   Redo ends at  w - PADDING - 60   (≈ "New" width 44 + 16 gap)
    //   Undo ends at  w - PADDING - 120
    this.undoBtn = this.add.text(this.scale.width - PADDING - 120, PADDING, 'Undo', {
      fontSize: '18px',
      color: PALETTE.textDim,
      fontFamily: FONT_UI
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.undoBtn.on('pointerdown', () => {
      if (this.busy) return;
      if (!this.controller.canUndo) return;
      sfx.click();
      this.controller.undo();
      this.syncBoardToCurrent();
    });
    this.undoBtn.on('pointerover', () => {
      if (this.controller.canUndo) this.undoBtn.setColor(PALETTE.text);
    });
    this.undoBtn.on('pointerout', () => {
      this.undoBtn.setColor(this.controller.canUndo ? PALETTE.accent : PALETTE.textDim);
    });

    this.redoBtn = this.add.text(this.scale.width - PADDING - 60, PADDING, 'Redo', {
      fontSize: '18px',
      color: PALETTE.textDim,
      fontFamily: FONT_UI
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.redoBtn.on('pointerdown', () => {
      if (this.busy) return;
      if (!this.controller.canRedo) return;
      sfx.click();
      this.controller.redo();
      this.syncBoardToCurrent();
    });
    this.redoBtn.on('pointerover', () => {
      if (this.controller.canRedo) this.redoBtn.setColor(PALETTE.text);
    });
    this.redoBtn.on('pointerout', () => {
      this.redoBtn.setColor(this.controller.canRedo ? PALETTE.accent : PALETTE.textDim);
    });
  }

  private refreshUndoRedo() {
    if (!this.undoBtn || !this.redoBtn) return;
    this.undoBtn.setColor(this.controller.canUndo ? PALETTE.accent : PALETTE.textDim);
    this.redoBtn.setColor(this.controller.canRedo ? PALETTE.accent : PALETTE.textDim);
  }

  // Reconcile the sprite map with controller.current after undo/redo.
  // Brick.clone preserves ids, so a brick that comes back via undo has the
  // SAME id it had before — we just need to recreate its sprite. A brick
  // that's redone-away is destroyed.
  //   - id in current AND has sprite     → tween to new (col,row) slot
  //   - id in current AND no sprite      → recreate sprite, fade in
  //   - id in sprite map AND not current → fade + destroy
  // This is intentionally simpler than the full shatter-and-fall sequence
  // commitMove uses — undo/redo is a "scrub through history" gesture, not
  // a fresh move, so a quick reposition reads better than a re-shatter.
  private syncBoardToCurrent() {
    this.unprime();
    const game = this.controller.current;
    const liveIds = new Set<number>();
    for (const col of game.columns) {
      for (const b of col.bricks) {
        liveIds.add(b.id);
        const tx = this.tileX(b.column);
        const ty = this.tileY(b.row);
        let sprite = this.brickSprites.get(b.id);
        if (!sprite) {
          // Came back from undo — recreate at slot, fade in.
          sprite = this.createBrickSprite(b);
          sprite.setAlpha(0);
          this.tweens.add({
            targets: sprite,
            alpha: 1,
            duration: FALL_DURATION,
            ease: 'Cubic.Out'
          });
        } else if (sprite.x !== tx || sprite.y !== ty) {
          this.tweens.killTweensOf(sprite);
          this.tweens.add({
            targets: sprite,
            x: tx,
            y: ty,
            duration: FALL_DURATION,
            ease: 'Cubic.Out'
          });
        }
      }
    }
    // Anything in our sprite map that no longer exists in current got
    // redo'd-away — fade and destroy.
    for (const [id, sprite] of this.brickSprites) {
      if (liveIds.has(id)) continue;
      this.tweens.killTweensOf(sprite);
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        duration: FALL_DURATION / 2,
        onComplete: () => sprite.destroy()
      });
      this.brickSprites.delete(id);
      this.removeHalo(id);
      this.removeBevel(id);
    }
    // After undo, bricks may have come back via createBrickSprite — that adds
    // halos and bevels for them automatically. Re-sync both to ensure they
    // exist for all currently-live sprites under the active theme.
    this.rebuildHalos();
    this.rebuildBevels();
    this.scoreText.setText(`Score: ${this.controller.totalScore}`);
    this.refreshUndoRedo();
  }

  private computeLayout() {
    const w = this.scale.width;
    const h = this.scale.height;
    const availW = w - PADDING * 2;
    const availH = h - HUD_HEIGHT - PADDING * 2;
    this.tileSize = Math.floor(Math.min(availW / COLS, availH / ROWS));
    const boardW = this.tileSize * COLS;
    const boardH = this.tileSize * ROWS;
    this.boardOriginX = (w - boardW) / 2;
    this.boardOriginY = HUD_HEIGHT + PADDING + (availH - boardH) / 2;
  }

  private handleResize() {
    this.computeLayout();
    this.boardContainer.setPosition(this.boardOriginX, this.boardOriginY);
    if (this.newGameBtn) this.newGameBtn.setPosition(this.scale.width - PADDING, PADDING);
    if (this.settingsBtn) this.settingsBtn.setPosition(this.scale.width - PADDING, PADDING + 28);
    if (this.undoBtn) this.undoBtn.setPosition(this.scale.width - PADDING - 120, PADDING);
    if (this.redoBtn) this.redoBtn.setPosition(this.scale.width - PADDING - 60, PADDING);

    const game = this.controller.current;
    for (const col of game.columns) {
      for (const b of col.bricks) {
        const s = this.brickSprites.get(b.id);
        if (!s) continue;
        s.setPosition(this.tileX(b.column), this.tileY(b.row));
        s.setSize(this.tileSize - 2, this.tileSize - 2);
      }
    }
    // Tile positions/sizes just moved — redraw the primed perimeter and the
    // gap-fill connectors so they still hug the selection.
    if (this.primedGroupIds.size > 0) {
      this.redrawPrimedBorder();
      this.redrawPrimedFill();
    }
  }

  private tileX(col: number): number {
    return col * this.tileSize + this.tileSize / 2;
  }
  private tileY(row: number): number {
    return (ROWS - 1 - row) * this.tileSize + this.tileSize / 2;
  }

  private formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  private createBoard() {
    // Reset game timer for the new board.
    this.elapsedMs = 0;
    this.gameEnded = false;
    this.timerText?.setText('0:00');

    // Clear any prior sprites. `removeAll(true)` destroys the container's
    // children, including the primedBorder Graphics AND all halo / bevel
    // decorations if they were in the list — so we explicitly null our
    // references and clear the parallel maps.
    this.boardContainer.removeAll(true);
    this.brickSprites.clear();
    this.tileHalos.clear();
    this.tileBevels.clear();
    this.primedGroupIds.clear();
    if (this.borderPulseTween) {
      this.borderPulseTween.stop();
      this.borderPulseTween = undefined;
    }
    this.primedBorder = undefined;
    this.primedFill = undefined;

    const game = this.controller.current;

    // Rain-drop entry. Each tile falls individually from just above the top
    // of the board to its slot — no Bounce.Out "thunk", no synchronized wall.
    //
    // Per-tile timing:
    //   colDelay   — each column starts up to PER_COL_JITTER ms later than
    //                its neighbor so the grid doesn't appear all-at-once.
    //   rowStagger — within a column, row 0 (bottom) falls first, row 1 next,
    //                etc. Subsequent rows land on top of the already-settled
    //                tiles, which reads as the column "filling up" from below.
    //   duration   — grows with fall distance on a sqrt curve (gravity-ish —
    //                a raindrop falling farther takes longer, but not linearly).
    //
    // Ease 'Quad.In' accelerates the fall so the motion has weight, then stops
    // cleanly at the slot (no bounce, no overshoot — that's what makes it read
    // as rain rather than rubber).
    const DROP_START_Y = -this.tileSize / 2;
    const PER_COL_JITTER = 180;
    const PER_ROW_STAGGER = 35;
    const DURATION_BASE = 180;
    const DURATION_SCALE = 10;

    for (const col of game.columns) {
      const colDelay = Math.random() * PER_COL_JITTER;
      col.bricks.forEach((brick, r) => {
        const sprite = this.createBrickSprite(brick);
        const targetY = sprite.y;
        sprite.y = DROP_START_Y;
        const fallDist = targetY - DROP_START_Y;
        const duration =
          DURATION_BASE + Math.round(Math.sqrt(fallDist) * DURATION_SCALE);
        this.tweens.add({
          targets: sprite,
          y: targetY,
          duration,
          delay: colDelay + r * PER_ROW_STAGGER,
          ease: 'Quad.In'
        });
      });
    }
    this.scoreText.setText(`Score: ${this.controller.totalScore}`);
    this.refreshUndoRedo();
  }

  private createBrickSprite(brick: Brick): Phaser.GameObjects.Rectangle {
    const t = getActiveTheme();
    const x = this.tileX(brick.column);
    const y = this.tileY(brick.row);
    const size = this.tileSize - t.tileGap;
    const fill = t.fills[brick.color];
    const glow = t.glows[brick.color];
    const rect = this.add.rectangle(x, y, size, size, fill);
    // Bright stroke gives a neon-border look without the cost of a per-sprite shader.
    // (A per-tile postFX.addGlow across all sprites tanks frame rate — don't do it.)
    // Theme controls width/color: pastel/classic set 0 → no stroke; neon uses
    // the per-color glow value as a thin bright stroke.
    if (t.strokeWidth > 0) {
      const sc = t.strokeFromGlow ? glow : t.strokeColor;
      rect.setStrokeStyle(t.strokeWidth, sc, 1);
    }
    rect.setInteractive({ useHandCursor: true });
    // Stash fill tiers on the sprite so prime/unprime can swap colors without
    // needing the brick reference (which can go stale after a commit re-indexes).
    rect.setData('baseFill', fill);
    rect.setData('glowFill', glow);

    // Single input model for desktop AND touch: first click/tap primes the
    // group, second click/tap on any primed tile commits. No hover-priming —
    // too easy to misclick, and without hover the selection stays stable
    // (matches SameGame / Collapse! conventions).
    rect.on('pointerdown', () => {
      if (this.busy) return;
      this.handleTap(brick.id);
    });

    this.boardContainer.add(rect);
    this.brickSprites.set(brick.id, rect);
    // Add decorations last so they're based on the sprite that was just
    // registered. Both no-op if the active theme doesn't want them.
    this.syncHalo(brick.id, rect);
    this.syncBevel(brick.id, rect);
    return rect;
  }

  // Look up the current Brick object for a given id. Necessary because
  // GameController.removeBrick() swaps in a cloned Game on every move, so the
  // brick references captured in sprite closures go stale — their row/column
  // fields no longer reflect where the tile lives after gravity collapses.
  // Always route taps through this to get the fresh brick.
  private findBrick(id: number): Brick | undefined {
    for (const col of this.controller.current.columns) {
      for (const b of col.bricks) if (b.id === id) return b;
    }
    return undefined;
  }

  private handleTap(id: number) {
    const brick = this.findBrick(id);
    if (!brick) return; // sprite exists but brick was removed — shouldn't happen in practice
    // Second tap inside the primed group → commit.
    if (this.primedGroupIds.has(id)) {
      this.commitMove(brick);
      return;
    }
    // First tap (or tap on a different group) → prime that group.
    const group = this.controller.current.getAdjacentBricks(brick);
    if (group.length < 2) {
      sfx.click();
      this.unprime();
      return;
    }
    this.primeForBrick(brick);
  }

  // Prime a group for commit — swap tile fills to the bright glow tier and
  // trace an animated border around the group's outer perimeter.
  // No-op if this exact set is already primed (prevents tween thrash).
  private primeForBrick(brick: Brick) {
    const group = this.controller.current.getAdjacentBricks(brick);
    if (group.length < 2) {
      this.unprime();
      return;
    }
    const newIds = new Set(group.map(b => b.id));
    if (this.setEquals(newIds, this.primedGroupIds)) return;

    // Restore fill on tiles that fell out of the group
    for (const id of this.primedGroupIds) {
      if (newIds.has(id)) continue;
      this.setPrimedFill(id, false);
    }
    // Brighten fill on newly-primed tiles
    for (const id of newIds) {
      if (this.primedGroupIds.has(id)) continue;
      this.setPrimedFill(id, true);
    }
    this.primedGroupIds = newIds;

    // Redraw the perimeter border + the gap-fill connectors for the new set
    // and make sure the pulse is running. We only (re)draw when the set
    // actually changes, so the tween ticks uninterrupted across successive
    // hovers on the same group.
    this.redrawPrimedBorder();
    this.redrawPrimedFill();
    this.startBorderPulse();
  }

  private unprime() {
    for (const id of this.primedGroupIds) {
      this.setPrimedFill(id, false);
    }
    this.primedGroupIds.clear();
    this.stopBorderPulse();
    if (this.primedFill) this.primedFill.clear();
  }

  // Swap one tile's fill between the muted base color and the bright glow
  // color. We stashed both tiers on the sprite in createBrickSprite so this
  // doesn't need to look up the brick (whose references go stale after a
  // commit re-indexes the board).
  private setPrimedFill(id: number, primed: boolean) {
    const s = this.brickSprites.get(id);
    if (!s) return;
    const fill = primed ? s.getData('glowFill') : s.getData('baseFill');
    s.setFillStyle(fill, 1);
    // Bevels fragment a primed cluster into individual tiles — drop them on
    // primed tiles so the selection reads as one unified bright shape. The
    // pulsing white perimeter still traces the cluster's outer edge, so the
    // selection is clearly delineated; we just don't want internal grid
    // lines from the bevel L-shapes inside it. Restored on unprime.
    if (primed) {
      this.removeBevel(id);
    } else {
      this.syncBevel(id, s);
    }
  }

  // Draw a single polyline tracing the outer edges of every primed tile.
  // Interior edges between two primed tiles are skipped — so the result
  // reads as one continuous shape around the whole group.
  //
  // Coordinates are in boardContainer space (same as the tile sprites).
  // Row→y mapping: tileY(row) = (ROWS-1-row) * tileSize + tileSize/2, so
  // row+1 is visually ABOVE (smaller y) and row-1 is visually BELOW.
  private redrawPrimedBorder() {
    // Ensure the graphics object exists and is in the container.
    if (!this.primedBorder) {
      this.primedBorder = this.add.graphics();
      this.boardContainer.add(this.primedBorder);
    }
    const g = this.primedBorder;
    g.clear();

    if (this.primedGroupIds.size === 0) return;

    // Collect fresh Brick objects for the primed ids (closures could have
    // stale row/column after gravity collapses).
    const primed: Brick[] = [];
    for (const id of this.primedGroupIds) {
      const b = this.findBrick(id);
      if (b) primed.push(b);
    }
    if (primed.length === 0) return;

    // (col,row) → in-group lookup for adjacency checks.
    const key = (c: number, r: number) => `${c},${r}`;
    const inGroup = new Set(primed.map(b => key(b.column, b.row)));

    g.lineStyle(BORDER_LINE_WIDTH, BORDER_COLOR, 1);

    const s = this.tileSize;
    // Tiles render with size (tileSize - 2) but we want the border to sit on
    // the theoretical cell edge so adjacent tiles' perimeter segments line up
    // cleanly. Use tileSize / 2 as the half-extent.
    const half = s / 2;

    for (const b of primed) {
      const cx = this.tileX(b.column);
      const cy = this.tileY(b.row);
      const left = cx - half;
      const right = cx + half;
      const top = cy - half;     // visually upper edge
      const bottom = cy + half;  // visually lower edge

      // For each direction, draw the shared edge ONLY when the neighbor in
      // that direction is NOT part of the primed group.
      if (!inGroup.has(key(b.column, b.row + 1))) {
        g.lineBetween(left, top, right, top);
      }
      if (!inGroup.has(key(b.column, b.row - 1))) {
        g.lineBetween(left, bottom, right, bottom);
      }
      if (!inGroup.has(key(b.column - 1, b.row))) {
        g.lineBetween(left, top, left, bottom);
      }
      if (!inGroup.has(key(b.column + 1, b.row))) {
        g.lineBetween(right, top, right, bottom);
      }
    }
  }

  // Fill the gap STRIPS between adjacent primed tiles plus the small CENTER
  // square at every internal 2x2 corner where 4 primed tiles meet. The result
  // is that a primed cluster reads as one continuous bright shape — no dark
  // gap stripes interrupting it. Theme-aware: no-op when tileGap is 0
  // (Classic — tiles already touch, nothing to fill).
  //
  // Geometry per tile (col, row):
  //   - Right strip (col+1, row primed): innerHalf-out by gap wide, innerSize tall
  //   - Up strip    (col, row+1 primed): innerSize wide, gap tall, sits above tile
  //   - Center square (col+1,row + col,row+1 + col+1,row+1 all primed): gap × gap
  // Only checks right/up to avoid drawing each gap twice (left/down are the
  // mirror of some other tile's right/up).
  private redrawPrimedFill() {
    const t = getActiveTheme();
    if (t.tileGap === 0) {
      // No gaps to fill in this theme — clear any prior draw and bail.
      if (this.primedFill) this.primedFill.clear();
      return;
    }
    if (!this.primedFill) {
      this.primedFill = this.add.graphics();
      this.boardContainer.add(this.primedFill);
    }
    this.primedFill.clear();
    if (this.primedGroupIds.size === 0) return;

    const primed: Brick[] = [];
    for (const id of this.primedGroupIds) {
      const b = this.findBrick(id);
      if (b) primed.push(b);
    }
    if (primed.length === 0) return;

    // All primed tiles are the same color, so any sprite's glow value works.
    const firstSprite = this.brickSprites.get(primed[0].id);
    if (!firstSprite) return;
    const color = firstSprite.getData('glowFill') as number;
    this.primedFill.fillStyle(color, 1);

    const key = (c: number, r: number) => `${c},${r}`;
    const inGroup = new Set(primed.map(b => key(b.column, b.row)));
    const innerHalf = (this.tileSize - t.tileGap) / 2;
    const innerSize = this.tileSize - t.tileGap;
    const gap = t.tileGap;

    for (const b of primed) {
      const cx = this.tileX(b.column);
      const cy = this.tileY(b.row);

      // Right neighbor primed → fill horizontal gap to the right
      if (inGroup.has(key(b.column + 1, b.row))) {
        this.primedFill.fillRect(cx + innerHalf, cy - innerHalf, gap, innerSize);
      }
      // Upper neighbor primed (row+1 is visually UP in our coord system) →
      // fill vertical gap above
      if (inGroup.has(key(b.column, b.row + 1))) {
        this.primedFill.fillRect(cx - innerHalf, cy - innerHalf - gap, innerSize, gap);
      }
      // Diagonal: 2x2 of primed tiles at (col,row),(col+1,row),(col,row+1),
      // (col+1,row+1) → fill the center gap×gap square at their shared corner.
      if (
        inGroup.has(key(b.column + 1, b.row)) &&
        inGroup.has(key(b.column, b.row + 1)) &&
        inGroup.has(key(b.column + 1, b.row + 1))
      ) {
        this.primedFill.fillRect(cx + innerHalf, cy - innerHalf - gap, gap, gap);
      }
    }
    // Border must stay above the fill so the perimeter pulse remains visible.
    if (this.primedBorder) this.boardContainer.bringToTop(this.primedBorder);
  }

  private startBorderPulse() {
    if (!this.primedBorder) return;
    if (this.borderPulseTween) return; // already running
    this.primedBorder.setAlpha(1);
    this.borderPulseTween = this.tweens.add({
      targets: this.primedBorder,
      alpha: BORDER_PULSE_MIN_ALPHA,
      duration: BORDER_PULSE_DURATION,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1
    });
  }

  private stopBorderPulse() {
    if (this.borderPulseTween) {
      this.borderPulseTween.stop();
      this.borderPulseTween = undefined;
    }
    if (this.primedBorder) {
      this.primedBorder.clear();
      this.primedBorder.setAlpha(1);
    }
  }

  private setEquals<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  private commitMove(brick: Brick) {
    const group = this.controller.current.getAdjacentBricks(brick);
    if (group.length < 2) {
      sfx.click();
      return;
    }

    this.busy = true;
    const removedIds = new Set(group.map(b => b.id));
    const groupSize = group.length;
    const points = groupSize * groupSize;
    const centroid = this.groupCentroid(group);

    // Stop all pulses BEFORE we mutate state and start the shatter tween —
    // we don't want the pulse fighting the shatter scale.
    this.unprime();

    // Commit the move
    this.controller.removeBrick(brick);

    // SFX + camera shake + floating text
    sfx.pop(groupSize);
    shakeScreen(this.cameras.main, groupSize);
    showComboText(this, centroid.x, centroid.y, groupSize, points);

    // Shatter removed sprites with particle burst
    for (const id of removedIds) {
      const sprite = this.brickSprites.get(id);
      if (!sprite) continue;
      const worldX = this.boardContainer.x + sprite.x;
      const worldY = this.boardContainer.y + sprite.y;
      const color = sprite.fillColor;
      emitBurst(this, worldX, worldY, color, groupSize);

      // Kill any lingering tweens on this sprite (e.g. the "scale back to 1.0"
      // kicked off by unprime above) so the shatter tween owns it cleanly.
      this.tweens.killTweensOf(sprite);
      this.tweens.add({
        targets: sprite,
        scale: 1.6,
        alpha: 0,
        duration: SHATTER_DURATION,
        ease: 'Cubic.Out',
        onComplete: () => sprite.destroy()
      });
      this.brickSprites.delete(id);
      // Halo + bevel aren't part of the shatter tween — fade each on the
      // same timeline so they don't linger as ghosts where the tile used
      // to be.
      const halo = this.tileHalos.get(id);
      if (halo) {
        this.tweens.killTweensOf(halo);
        this.tweens.add({
          targets: halo,
          scale: 1.6,
          alpha: 0,
          duration: SHATTER_DURATION,
          ease: 'Cubic.Out',
          onComplete: () => halo.destroy()
        });
        this.tileHalos.delete(id);
      }
      const bevel = this.tileBevels.get(id);
      if (bevel) {
        this.tweens.killTweensOf(bevel);
        this.tweens.add({
          targets: bevel,
          scale: 1.6,
          alpha: 0,
          duration: SHATTER_DURATION,
          ease: 'Cubic.Out',
          onComplete: () => bevel.destroy()
        });
        this.tileBevels.delete(id);
      }
    }

    // Tween survivors to new positions
    const game = this.controller.current;
    for (const col of game.columns) {
      for (const b of col.bricks) {
        const sprite = this.brickSprites.get(b.id);
        if (!sprite) continue;
        const tx = this.tileX(b.column);
        const ty = this.tileY(b.row);
        if (sprite.x !== tx || sprite.y !== ty) {
          this.tweens.add({
            targets: sprite,
            x: tx,
            y: ty,
            duration: FALL_DURATION,
            ease: 'Cubic.Out'
          });
        }
      }
    }

    // Update score + undo/redo state immediately. A fresh move clears the
    // redo stack, so canRedo is now false; canUndo just became true.
    this.scoreText.setText(`Score: ${this.controller.totalScore}`);
    this.refreshUndoRedo();

    // Re-enable input + check game over after animations settle
    this.time.delayedCall(Math.max(SHATTER_DURATION, FALL_DURATION) + 50, () => {
      this.busy = false;
      if (this.controller.current.isGameOver) {
        this.gameEnded = true;
        const finalScore = this.controller.totalScore;
        saveHighScore(finalScore);
        sfx.gameOver();
        this.scene.start('GameOverScene', { score: finalScore, elapsedMs: this.elapsedMs });
      }
    });
  }

  private groupCentroid(bricks: Brick[]): { x: number; y: number } {
    let sx = 0;
    let sy = 0;
    for (const b of bricks) {
      sx += this.tileX(b.column);
      sy += this.tileY(b.row);
    }
    return {
      x: this.boardContainer.x + sx / bricks.length,
      y: this.boardContainer.y + sy / bricks.length
    };
  }

  private onNewGame() {
    this.busy = true;
    this.unprime();
    // Fade out existing sprites quickly, then rebuild
    const victims = Array.from(this.brickSprites.values());
    if (victims.length === 0) {
      this.controller.newGame(ROWS, COLS);
      this.createBoard();
      this.busy = false;
      return;
    }
    this.tweens.add({
      targets: victims,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        this.controller.newGame(ROWS, COLS);
        this.createBoard();
        this.time.delayedCall(700, () => {
          this.busy = false;
        });
      }
    });
  }
}
