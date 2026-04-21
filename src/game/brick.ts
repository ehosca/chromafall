import type { BrickColor } from './types';

let nextId = 1;

export class Brick {
  id: number;
  row: number;
  column: number;
  color: BrickColor;

  constructor(row: number, column: number, color: BrickColor) {
    this.id = nextId++;
    this.row = row;
    this.column = column;
    this.color = color;
  }

  static clone(b: Brick): Brick {
    const c = Object.create(Brick.prototype) as Brick;
    c.id = b.id;
    c.row = b.row;
    c.column = b.column;
    c.color = b.color;
    return c;
  }
}
