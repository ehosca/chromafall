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

  // Any orthogonal same-color pair means a move is still available. Only the
  // right and up neighbors need checking; the other two are covered when the
  // scan reaches that neighbor.
  get isGameOver(): boolean {
    for (let c = 0; c < this.columns.length; c++) {
      const col = this.columns[c].bricks;
      for (let r = 0; r < col.length; r++) {
        const color = col[r].color;
        if (col[r + 1]?.color === color) return false;
        if (this.columns[c + 1]?.bricks[r]?.color === color) return false;
      }
    }
    return true;
  }

  // Flood fill over the grid. Relies on the invariant that a brick's
  // column/row match its index in columns[] and bricks[] (set in newGame and
  // re-established by removeBricks). Returns [] for a lone brick, otherwise
  // the whole group including `brick`.
  getAdjacentBricks(brick: Brick): Brick[] {
    const start = this.columns[brick.column]?.bricks[brick.row];
    if (!start || start.color !== brick.color) return [];

    const found: Brick[] = [start];
    const seen = new Set<Brick>(found);
    for (let i = 0; i < found.length; i++) {
      const b = found[i];
      const neighbors = [
        this.columns[b.column].bricks[b.row + 1],
        this.columns[b.column].bricks[b.row - 1],
        this.columns[b.column + 1]?.bricks[b.row],
        this.columns[b.column - 1]?.bricks[b.row]
      ];
      for (const n of neighbors) {
        if (n && n.color === start.color && !seen.has(n)) {
          seen.add(n);
          found.push(n);
        }
      }
    }
    return found.length > 1 ? found : [];
  }

  removeBricks(bricksToRemove: Brick[]): number {
    const points = bricksToRemove.length * bricksToRemove.length;

    const doomed = new Set(bricksToRemove.map(b => `${b.column},${b.row}`));
    for (const col of this.columns) {
      col.bricks = col.bricks.filter(b => !doomed.has(`${b.column},${b.row}`));
    }
    this.columns = this.columns.filter(col => col.bricks.length > 0);

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

  constructor(rows = 14, cols = 9) {
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

  newGame(rows = 14, cols = 9): void {
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
