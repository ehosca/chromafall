import Phaser from 'phaser';
import { GameController } from '../game/engine';
import type { Brick } from '../game/brick';
import { PALETTE, BRICK_FILL, BRICK_GLOW } from '../theme/palette';
import { saveHighScore } from '../storage/highScores';

const ROWS = 15;
const COLS = 15;
const HUD_HEIGHT = 70;
const PADDING = 16;

export class GameScene extends Phaser.Scene {
  private controller!: GameController;
  private boardContainer!: Phaser.GameObjects.Container;
  private brickSprites: Map<number, Phaser.GameObjects.Rectangle> = new Map();
  private scoreText!: Phaser.GameObjects.Text;
  private tileSize = 32;
  private boardOriginX = 0;
  private boardOriginY = 0;

  constructor() {
    super('GameScene');
  }

  create() {
    this.controller = new GameController(ROWS, COLS);
    this.boardContainer = this.add.container(0, 0);
    this.createHud();
    this.layoutAndRender();
    this.scale.on('resize', () => this.layoutAndRender());
  }

  private createHud() {
    this.scoreText = this.add.text(PADDING, PADDING, 'Score: 0', {
      fontSize: '22px',
      color: PALETTE.text,
      fontFamily: 'monospace'
    });

    const newGame = this.add.text(this.scale.width - PADDING, PADDING, 'New', {
      fontSize: '18px',
      color: PALETTE.accent,
      fontFamily: 'monospace'
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    newGame.on('pointerdown', () => this.onNewGame());
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

  private layoutAndRender() {
    this.computeLayout();
    this.boardContainer.setPosition(this.boardOriginX, this.boardOriginY);
    this.render();
  }

  private render() {
    this.boardContainer.removeAll(true);
    this.brickSprites.clear();
    const game = this.controller.current;

    for (const col of game.columns) {
      for (const brick of col.bricks) {
        const x = brick.column * this.tileSize + this.tileSize / 2;
        const y = (ROWS - 1 - brick.row) * this.tileSize + this.tileSize / 2;
        const size = this.tileSize - 2;
        const rect = this.add.rectangle(x, y, size, size, BRICK_FILL[brick.color]);
        rect.setStrokeStyle(1, BRICK_GLOW[brick.color], 0.6);
        rect.setInteractive({ useHandCursor: true });
        rect.on('pointerdown', () => this.onBrickClick(brick));
        this.boardContainer.add(rect);
        this.brickSprites.set(brick.id, rect);
      }
    }

    this.scoreText.setText(`Score: ${this.controller.totalScore}`);
  }

  private onBrickClick(brick: Brick) {
    const removed = this.controller.removeBrick(brick);
    if (!removed) return;
    this.render();

    if (this.controller.current.isGameOver) {
      const finalScore = this.controller.totalScore;
      saveHighScore(finalScore);
      this.scene.start('GameOverScene', { score: finalScore });
    }
  }

  private onNewGame() {
    this.controller.newGame(ROWS, COLS);
    this.render();
  }
}
