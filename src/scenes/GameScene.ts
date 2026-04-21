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
const HOVER_SCALE = 1.09;

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
  private hoveredGroup: Set<number> = new Set();
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
    this.hoveredGroup.clear();

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

    rect.on('pointerover', () => {
      if (this.busy) return;
      this.onBrickHover(brick);
    });
    rect.on('pointerout', () => {
      if (this.busy) return;
      this.onBrickUnhover();
    });
    rect.on('pointerdown', () => {
      if (this.busy) return;
      this.onBrickClick(brick);
    });

    this.boardContainer.add(rect);
    this.brickSprites.set(brick.id, rect);
    return rect;
  }

  private onBrickHover(brick: Brick) {
    const group = this.controller.current.getAdjacentBricks(brick);
    if (group.length < 2) {
      this.onBrickUnhover();
      return;
    }
    const newIds = new Set(group.map(b => b.id));

    // Unscale stale
    for (const id of this.hoveredGroup) {
      if (newIds.has(id)) continue;
      const s = this.brickSprites.get(id);
      if (s) this.tweens.add({ targets: s, scale: 1, duration: 120 });
    }
    // Scale up new
    for (const id of newIds) {
      if (this.hoveredGroup.has(id)) continue;
      const s = this.brickSprites.get(id);
      if (s) this.tweens.add({ targets: s, scale: HOVER_SCALE, duration: 120 });
    }
    this.hoveredGroup = newIds;
  }

  private onBrickUnhover() {
    for (const id of this.hoveredGroup) {
      const s = this.brickSprites.get(id);
      if (s) this.tweens.add({ targets: s, scale: 1, duration: 120 });
    }
    this.hoveredGroup.clear();
  }

  private onBrickClick(brick: Brick) {
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

    // Clear hover highlight BEFORE the state mutates
    this.hoveredGroup.clear();

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

