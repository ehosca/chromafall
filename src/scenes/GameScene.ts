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
// Breathing pulse for primed group (replaces static hover scale).
// Slow-enough yoyo to read as "alive / selected" without being distracting.
const PULSE_MIN = 1.0;
const PULSE_MAX = 1.12;
const PULSE_DURATION = 520;

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
  // Desktop: the "primed" group is what the cursor is hovering.
  // Touch: it's the group the player tapped once — a second tap inside it commits.
  private primedGroupIds: Set<number> = new Set();
  private pulseTweens: Map<number, Phaser.Tweens.Tween> = new Map();
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
  }

  private tileX(col: number): number {
    return col * this.tileSize + this.tileSize / 2;
  }
  private tileY(row: number): number {
    return (ROWS - 1 - row) * this.tileSize + this.tileSize / 2;
  }

  private createBoard() {
    // Clear any prior sprites
    this.boardContainer.removeAll(true);
    this.brickSprites.clear();
    this.primedGroupIds.clear();
    this.pulseTweens.clear();

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

    // Desktop: hover primes, click commits.
    // Touch: first tap primes, second tap inside the primed group commits.
    // pointer.wasTouch reliably distinguishes touch from mouse/pen input.
    rect.on('pointerover', (pointer: Phaser.Input.Pointer) => {
      if (this.busy || pointer.wasTouch) return;
      this.primeForBrick(brick);
    });
    rect.on('pointerout', (pointer: Phaser.Input.Pointer) => {
      if (this.busy || pointer.wasTouch) return;
      this.unprime();
    });
    rect.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.busy) return;
      if (pointer.wasTouch) {
        this.handleTouchTap(brick);
      } else {
        this.commitMove(brick);
      }
    });

    this.boardContainer.add(rect);
    this.brickSprites.set(brick.id, rect);
    return rect;
  }

  // Prime a group for commit — pulse it, stop pulsing anything no longer in the group.
  // No-op if this exact set is already primed (prevents tween thrash during hover drift).
  private primeForBrick(brick: Brick) {
    const group = this.controller.current.getAdjacentBricks(brick);
    if (group.length < 2) {
      this.unprime();
      return;
    }
    const newIds = new Set(group.map(b => b.id));
    if (this.setEquals(newIds, this.primedGroupIds)) return;

    // Stop pulse on tiles that fell out of the group
    for (const id of this.primedGroupIds) {
      if (newIds.has(id)) continue;
      this.stopPulse(id);
    }
    // Start pulse on newly-primed tiles
    for (const id of newIds) {
      if (this.primedGroupIds.has(id)) continue;
      this.startPulse(id);
    }
    this.primedGroupIds = newIds;
  }

  private unprime() {
    for (const id of this.primedGroupIds) {
      this.stopPulse(id);
    }
    this.primedGroupIds.clear();
  }

  private startPulse(id: number) {
    const s = this.brickSprites.get(id);
    if (!s) return;
    // Kill any prior pulse on this sprite before starting a new one
    const existing = this.pulseTweens.get(id);
    if (existing) {
      existing.stop();
      this.pulseTweens.delete(id);
    }
    s.setScale(PULSE_MIN);
    const t = this.tweens.add({
      targets: s,
      scale: PULSE_MAX,
      duration: PULSE_DURATION,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1
    });
    this.pulseTweens.set(id, t);
  }

  private stopPulse(id: number) {
    const t = this.pulseTweens.get(id);
    if (t) {
      t.stop();
      this.pulseTweens.delete(id);
    }
    const s = this.brickSprites.get(id);
    if (s) {
      // Ease back to rest scale so the transition doesn't snap.
      this.tweens.add({
        targets: s,
        scale: PULSE_MIN,
        duration: 120,
        ease: 'Sine.Out'
      });
    }
  }

  private setEquals<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  private handleTouchTap(brick: Brick) {
    // Second tap on a primed tile commits the move.
    if (this.primedGroupIds.has(brick.id)) {
      this.commitMove(brick);
      return;
    }
    // Tap outside the primed group (or first tap) → prime this brick's group.
    const group = this.controller.current.getAdjacentBricks(brick);
    if (group.length < 2) {
      sfx.click();
      this.unprime();
      return;
    }
    this.primeForBrick(brick);
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
