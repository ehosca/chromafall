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

export const BRICK_FILL: Record<BrickColor, number> = {
  [BrickColor.Red]: 0xff3b6b,
  [BrickColor.Blue]: 0x3ba8ff,
  [BrickColor.Green]: 0x3bff95,
  [BrickColor.Yellow]: 0xffd93b
};

export const BRICK_GLOW: Record<BrickColor, number> = {
  [BrickColor.Red]: 0xff7aa0,
  [BrickColor.Blue]: 0x7accff,
  [BrickColor.Green]: 0x7affbe,
  [BrickColor.Yellow]: 0xffe87a
};
