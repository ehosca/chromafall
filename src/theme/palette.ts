import { BrickColor } from '../game/types';

export const BG_HEX = '#0a0a14';

export const PALETTE = {
  bg: 0x0a0a14,
  gridLine: 0x1a1a2e,
  text: '#e8e8ff',
  textDim: '#8888aa',
  accent: '#ff4d9e',
  panel: 0x1a1a2e
} as const;

// Two-tier color scheme:
//   BRICK_FILL  — muted base color for unprimed tiles (~40% lightness, 55% sat).
//   BRICK_GLOW  — bright neon version, used as the stroke AND as the fill when
//                 the tile is primed for commit. The fill-swap between the two
//                 tiers is the main "this tile is selected" visual signal; the
//                 breathing scale pulse is layered on top.
export const BRICK_FILL: Record<BrickColor, number> = {
  [BrickColor.Red]: 0x9a2d52,
  [BrickColor.Blue]: 0x2d6ea3,
  [BrickColor.Green]: 0x2d9a6a,
  [BrickColor.Yellow]: 0xa38c2d
};

export const BRICK_GLOW: Record<BrickColor, number> = {
  [BrickColor.Red]: 0xff7aa0,
  [BrickColor.Blue]: 0x7accff,
  [BrickColor.Green]: 0x7affbe,
  [BrickColor.Yellow]: 0xffe87a
};
