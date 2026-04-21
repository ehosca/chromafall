import { Brick } from './brick';
import { BrickColumn } from './column';
import { BrickColor, BRICK_COLORS } from './types';

export class Game {
  columns: BrickColumn[] = [];
  totalColumns = 0;
  score = 0;

  get bricks(): Brick[] {
    const all: Brick[] = [];
    for (const col of this.columns) all.push(...col.bricks);
    return all;
  }

  get isGameOver(): boolean {
    return this.columns.every(col =>
      col.bricks.every(b => this.getAdjacentBricks(b).length === 0)
    );
  }

  getAdjacentBricks(brick: Brick): Brick[] {
    const found: Brick[] = [];
    this.findNeighbors(brick, found, this.bricks);
    return found;
  }

  private findNeighbors(brick: Brick, found: Brick[], pool: Brick[]): void {
    const neighbors = pool.filter(b =>
      b.color === brick.color && (
        (Math.abs(b.row - brick.row) === 1 && b.column === brick.column) ||
        (Math.abs(brick.column - b.column) === 1 && brick.row === b.row)
      )
    );
    for (const n of neighbors) {
      if (!found.includes(n)) {
        found.push(n);
        this.findNeighbors(n, found, pool);
      }
    }
  }

  removeBricks(bricksToRemove: Brick[]): number {
    const points = bricksToRemove.length * bricksToRemove.length;

    for (const b of bricksToRemove) {
      for (let ci = this.columns.length - 1; ci >= 0; ci--) {
        const col = this.columns[ci];
        for (let bi = col.bricks.length - 1; bi >= 0; bi--) {
          const brick = col.bricks[bi];
          if (b.row === brick.row && b.column === brick.column && b.color === brick.color) {
            col.bricks.splice(bi, 1);
            if (col.bricks.length === 0) this.columns.splice(ci, 1);
          }
        }
      }
    }

    this.columns.forEach((col, colIdx) => {
      col.bricks.forEach((b, rowIdx) => {
        b.column = colIdx;
        b.row = rowIdx;
      });
    });

    while (this.columns.length < this.totalColumns) {
      this.columns.push(new BrickColumn());
    }

    this.score += points;
    return points;
  }

  clone(): Game {
    const c = new Game();
    for (const col of this.columns) {
      const colClone = new BrickColumn();
      for (const b of col.bricks) colClone.bricks.push(Brick.clone(b));
      c.columns.push(colClone);
    }
    c.totalColumns = this.totalColumns;
    c.score = this.score;
    return c;
  }
}

export class GameController {
  private history: Game[] = [];
  private currentIdx = 0;

  constructor(rows = 15, cols = 15) {
    this.newGame(rows, cols);
  }

  get current(): Game {
    return this.history[this.currentIdx];
  }

  get totalScore(): number {
    return this.current.score;
  }

  get canUndo(): boolean {
    return this.currentIdx > 0;
  }

  get canRedo(): boolean {
    return this.currentIdx < this.history.length - 1;
  }

  newGame(rows = 15, cols = 15): void {
    this.history = [];
    const game = new Game();
    game.totalColumns = cols;
    for (let i = 0; i < cols; i++) {
      const bc = new BrickColumn();
      for (let j = 0; j < rows; j++) {
        bc.bricks.push(new Brick(j, i, this.randomColor()));
      }
      game.columns.push(bc);
    }
    this.history.push(game.clone());
    this.currentIdx = 0;
  }

  removeBrick(brick: Brick): boolean {
    if (this.history.length - 1 > this.currentIdx) {
      this.history.splice(this.currentIdx + 1);
    }
    const group = this.current.getAdjacentBricks(brick);
    if (group.length > 1) {
      const step = this.current.clone();
      step.removeBricks(group);
      this.history.push(step);
      this.currentIdx = this.history.length - 1;
      return true;
    }
    return false;
  }

  undo(): Game {
    if (this.currentIdx > 0) this.currentIdx--;
    return this.current;
  }

  redo(): Game {
    if (this.currentIdx < this.history.length - 1) this.currentIdx++;
    return this.current;
  }

  private randomColor(): BrickColor {
    return BRICK_COLORS[Math.floor(Math.random() * BRICK_COLORS.length)];
  }
}
