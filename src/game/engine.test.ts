import { describe, expect, it } from 'vitest';
import { Brick } from './brick';
import { BrickColumn } from './column';
import { Game, GameController } from './engine';
import { BrickColor } from './types';

const { Red: R, Blue: B, Green: G, Yellow: Y } = BrickColor;

// Build a game from columns listed bottom-up: board([R, B], [R]) has two
// columns, the first with Red at row 0 and Blue at row 1.
function board(...cols: BrickColor[][]): Game {
  const game = new Game();
  game.totalColumns = cols.length;
  cols.forEach((colors, c) => {
    const col = new BrickColumn();
    colors.forEach((color, r) => col.bricks.push(new Brick(r, c, color)));
    game.columns.push(col);
  });
  return game;
}

function colors(game: Game): BrickColor[][] {
  return game.columns.map(col => col.bricks.map(b => b.color));
}

function at(game: Game, column: number, row: number): Brick {
  return game.columns[column].bricks[row];
}

function randomGame(cols: number, rows: number, palette: BrickColor[]): Game {
  return board(
    ...Array.from({ length: cols }, () =>
      Array.from({ length: rows }, () => palette[Math.floor(Math.random() * palette.length)])
    )
  );
}

// Brute-force reference: the original pairwise-scan implementation.
function referenceGroup(game: Game, brick: Brick): Brick[] {
  const pool = game.bricks;
  const found: Brick[] = [];
  const visit = (b: Brick) => {
    for (const n of pool) {
      const adjacent =
        (Math.abs(n.row - b.row) === 1 && n.column === b.column) ||
        (Math.abs(n.column - b.column) === 1 && n.row === b.row);
      if (n.color === b.color && adjacent && !found.includes(n)) {
        found.push(n);
        visit(n);
      }
    }
  };
  visit(brick);
  return found;
}

const ids = (bricks: Brick[]) => bricks.map(b => b.id).sort((a, b) => a - b);

describe('getAdjacentBricks', () => {
  it('returns [] for a lone brick', () => {
    const game = board([R, B], [B, R]);
    expect(game.getAdjacentBricks(at(game, 0, 0))).toEqual([]);
  });

  it('returns the whole connected group, including the tapped brick', () => {
    const game = board([R, R, B], [B, R, B], [R, R, R]);
    const group = game.getAdjacentBricks(at(game, 0, 0));
    expect(group).toHaveLength(6);
    expect(group).toContain(at(game, 0, 0));
    expect(group.every(b => b.color === R)).toBe(true);
  });

  it('does not connect diagonally', () => {
    const game = board([R, B], [B, R]);
    expect(game.getAdjacentBricks(at(game, 1, 1))).toEqual([]);
  });

  it('handles ragged columns', () => {
    const game = board([G, G, G], [G], []);
    expect(game.getAdjacentBricks(at(game, 1, 0))).toHaveLength(4);
  });

  it('matches the brute-force reference on random boards', () => {
    for (let trial = 0; trial < 200; trial++) {
      const game = randomGame(5, 6, [R, B, G, Y]);
      for (const brick of game.bricks) {
        expect(ids(game.getAdjacentBricks(brick))).toEqual(ids(referenceGroup(game, brick)));
      }
    }
  });
});

describe('isGameOver', () => {
  it('is false while any same-color pair touches', () => {
    expect(board([R, B], [B, B]).isGameOver).toBe(false); // horizontal pair
    expect(board([R, R], [B, G]).isGameOver).toBe(false); // vertical pair
  });

  it('is true for a checkerboard', () => {
    expect(board([R, B], [B, R]).isGameOver).toBe(true);
  });

  it('is true for an empty board', () => {
    expect(board([], []).isGameOver).toBe(true);
  });

  it('agrees with the brute-force reference on random boards', () => {
    for (let trial = 0; trial < 500; trial++) {
      const game = randomGame(3, 3, [R, B, G, Y]);
      const expected = game.bricks.every(b => referenceGroup(game, b).length === 0);
      expect(game.isGameOver).toBe(expected);
    }
  });
});

describe('removeBricks', () => {
  it('drops bricks above a cleared group and scores size squared', () => {
    const game = board([R, R, B], [G, Y, G]);
    const points = game.removeBricks(game.getAdjacentBricks(at(game, 0, 0)));
    expect(points).toBe(4);
    expect(game.score).toBe(4);
    expect(colors(game)).toEqual([[B], [G, Y, G]]);
    expect(at(game, 0, 0).row).toBe(0);
  });

  it('closes empty columns leftward and pads to totalColumns', () => {
    const game = board([G], [R, R], [B]);
    game.removeBricks(game.getAdjacentBricks(at(game, 1, 0)));
    expect(colors(game)).toEqual([[G], [B], []]);
    expect(at(game, 1, 0).column).toBe(1);
  });

  it('keeps brick positions in sync with their indexes', () => {
    const game = randomGame(6, 8, [R, B, G]);
    for (let moves = 0; moves < 20; moves++) {
      const group = game.bricks.map(b => game.getAdjacentBricks(b)).find(g => g.length > 1);
      if (!group) break;
      game.removeBricks(group);
      game.columns.forEach((col, c) =>
        col.bricks.forEach((b, r) => expect([b.column, b.row]).toEqual([c, r]))
      );
    }
  });
});

describe('GameController', () => {
  function playOneMove(ctl: GameController): boolean {
    const brick = ctl.current.bricks.find(b => ctl.current.getAdjacentBricks(b).length > 1);
    return brick ? ctl.removeBrick(brick) : false;
  }

  it('rejects a move on a lone brick', () => {
    const ctl = new GameController(4, 4);
    ctl.current.columns = board([R, B], [B, R]).columns;
    expect(ctl.removeBrick(at(ctl.current, 0, 0))).toBe(false);
    expect(ctl.canUndo).toBe(false);
  });

  it('undo and redo move through history without mutating it', () => {
    const ctl = new GameController(10, 6);
    const start = colors(ctl.current);
    expect(playOneMove(ctl)).toBe(true);
    const after = colors(ctl.current);
    const score = ctl.totalScore;

    ctl.undo();
    expect(colors(ctl.current)).toEqual(start);
    expect(ctl.totalScore).toBe(0);
    expect(ctl.canRedo).toBe(true);

    ctl.redo();
    expect(colors(ctl.current)).toEqual(after);
    expect(ctl.totalScore).toBe(score);
  });

  it('a new move after undo discards the redo branch', () => {
    const ctl = new GameController(10, 6);
    playOneMove(ctl);
    playOneMove(ctl);
    ctl.undo();
    expect(ctl.canRedo).toBe(true);
    playOneMove(ctl);
    expect(ctl.canRedo).toBe(false);
  });
});
