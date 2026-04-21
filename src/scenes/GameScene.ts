import Phaser from 'phaser';
import { GameController } from '../game/engine';
import type { Brick } from '../game/brick';
import { PALETTE, BRICK_FILL, BRICK_GLOW } from '../theme/palette';
import { saveHighScore } from '../storage/highScores';
import { sfx } from '../fx/sfx';
import { emitBurst, shakeScreen, showComboText } from '../fx/effects';

const ROWS = 15;
const COLS = 15;
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

export class GameScene extends Phaser.Scene {
  private controller!: GameController;
  private boardContainer!: Phaser.GameObjects.Container;
  private brickSprites: Map<number, Phaser.GameObjects.Rectangle> = new Map();
  private scoreText!: Phaser.GameObjects.Text;
  private newGameBtn!: Phaser.GameObjects.Text;
  private muteBtn!: Phaser.GameObjects.Text;
  private tileSize = 32;
  private boardOriginX = 0;
  private boardOriginY = 0;
  // The "primed" group is the tiles a first tap selected; a second tap inside
  // the group commits. Each primed tile swaps fill from BRICK_FILL (muted)
  // to BRICK_GLOW (bright) — that's the stateful "selected" signal. The
  // outer-perimeter Graphics below adds an animated border on top.
  private primedGroupIds: Set<number> = new Set();
  // Single Graphics object tracing the outer edges of the primed group.
  // Alpha-pulses while primed. Lives inside boardContainer so its coords match
  // the tile sprites.
  private primedBorder?: Phaser.GameObjects.Graphics;
  private borderPulseTween?: Phaser.Tweens.Tween;
  private busy = false;

  constructor() {
    super('GameScene');
  }

  create() {
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

  private createHud() {
    this.scoreText = this.add.text(PADDING, PADDING, 'Score: 0', {
      fontSize: '22px',
      color: PALETTE.text,
      fontFamily: 'monospace'
    });

    this.newGameBtn = this.add.text(this.scale.width - PADDING, PADDING, 'New', {
      fontSize: '18px',
      color: PALETTE.accent,
      fontFamily: 'monospace'
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.newGameBtn.on('pointerdown', () => {
      if (this.busy) return;
      sfx.click();
      this.onNewGame();
    });
    this.newGameBtn.on('pointerover', () => this.newGameBtn.setColor(PALETTE.text));
    this.newGameBtn.on('pointerout', () => this.newGameBtn.setColor(PALETTE.accent));

    this.muteBtn = this.add.text(this.scale.width - PADDING, PADDING + 28, sfx.isMuted() ? 'Sound: off' : 'Sound: on', {
      fontSize: '12px',
      color: PALETTE.textDim,
      fontFamily: 'monospace'
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.muteBtn.on('pointerdown', () => {
      sfx.setMuted(!sfx.isMuted());
      this.muteBtn.setText(sfx.isMuted() ? 'Sound: off' : 'Sound: on');
    });
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
    if (this.muteBtn) this.muteBtn.setPosition(this.scale.width - PADDING, PADDING + 28);

    const game = this.controller.current;
    for (const col of game.columns) {
      for (const b of col.bricks) {
        const s = this.brickSprites.get(b.id);
        if (!s) continue;
        s.setPosition(this.tileX(b.column), this.tileY(b.row));
        s.setSize(this.tileSize - 2, this.tileSize - 2);
      }
    }
    // Tile positions/sizes just moved — redraw the primed perimeter so it
    // still hugs the selection.
    if (this.primedGroupIds.size > 0) this.redrawPrimedBorder();
  }

  private tileX(col: number): number {
    return col * this.tileSize + this.tileSize / 2;
  }
  private tileY(row: number): number {
    return (ROWS - 1 - row) * this.tileSize + this.tileSize / 2;
  }

  private createBoard() {
    // Clear any prior sprites. `removeAll(true)` destroys the container's
    // children, including the primedBorder Graphics if it was in the list —
    // so we explicitly null our reference and stop the tween after.
    this.boardContainer.removeAll(true);
    this.brickSprites.clear();
    this.primedGroupIds.clear();
    if (this.borderPulseTween) {
      this.borderPulseTween.stop();
      this.borderPulseTween = undefined;
    }
    this.primedBorder = undefined;

    const game = this.controller.current;
    // Stagger entry — tiles fall in from above
    const dropFrom = -this.scale.height;
    let i = 0;
    for (const col of game.columns) {
      for (const brick of col.bricks) {
        const sprite = this.createBrickSprite(brick);
        const targetY = sprite.y;
        sprite.y = dropFrom;
        this.tweens.add({
          targets: sprite,
          y: targetY,
          duration: 450 + Math.random() * 200,
          delay: (brick.column * 6) + (brick.row * 2) + (i % 7) * 4,
          ease: 'Bounce.Out'
        });
        i++;
      }
    }
    this.scoreText.setText(`Score: ${this.controller.totalScore}`);
  }

  private createBrickSprite(brick: Brick): Phaser.GameObjects.Rectangle {
    const x = this.tileX(brick.column);
    const y = this.tileY(brick.row);
    const size = this.tileSize - 2;
    const rect = this.add.rectangle(x, y, size, size, BRICK_FILL[brick.color]);
    // Bright stroke gives a neon-border look without the cost of a per-sprite shader.
    // (A per-tile postFX.addGlow across 225 sprites tanks frame rate — don't do it.)
    rect.setStrokeStyle(2, BRICK_GLOW[brick.color], 1);
    rect.setInteractive({ useHandCursor: true });
    // Stash fill tiers on the sprite so prime/unprime can swap colors without
    // needing the brick reference (which can go stale after a commit re-indexes).
    rect.setData('baseFill', BRICK_FILL[brick.color]);
    rect.setData('glowFill', BRICK_GLOW[brick.color]);

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

    // Redraw the perimeter border for the new set and make sure the pulse is
    // running. We only (re)draw when the set actually changes, so the tween
    // ticks uninterrupted across successive hovers on the same group.
    this.redrawPrimedBorder();
    this.startBorderPulse();
  }

  private unprime() {
    for (const id of this.primedGroupIds) {
      this.setPrimedFill(id, false);
    }
    this.primedGroupIds.clear();
    this.stopBorderPulse();
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

    // Update score immediately
    this.scoreText.setText(`Score: ${this.controller.totalScore}`);

    // Re-enable input + check game over after animations settle
    this.time.delayedCall(Math.max(SHATTER_DURATION, FALL_DURATION) + 50, () => {
      this.busy = false;
      if (this.controller.current.isGameOver) {
        const finalScore = this.controller.totalScore;
        saveHighScore(finalScore);
        sfx.gameOver();
        this.scene.start('GameOverScene', { score: finalScore });
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
