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
//   BRICK_FILL  — muted base color for unprimed tiles.
//   BRICK_GLOW  — brighter version, used as the stroke AND as the fill when
//                 the tile is primed for commit. The fill-swap between the two
//                 tiers is the main "this tile is selected" visual signal; the
//                 pulsing perimeter border is layered on top.
//
// Four hues that genuinely read as red / blue / green / yellow, hand-tuned
// so that blue and green can't collide:
//   blue  is pushed toward pure cobalt (~220°), NOT cyan
//   green is pushed toward yellow-green (~135°), NOT teal
// That puts each on opposite sides of cyan (180°) with ~85° of hue gap —
// well above the ~40° where Okabe-Ito's blue/green crushed together on a
// dark background.
//
// Saturation is tuned per hue to match perceived brightness: yellow is
// perceptually much brighter than blue at the same HSL, so yellow's fill
// is darker (L ~41%) and blue's glow is lighter (L ~70%) to keep all four
// tiles feeling equally "weighted" on screen.
export const BRICK_FILL: Record<BrickColor, number> = {
  [BrickColor.Red]: 0xa8384a,    // crimson   (hue ~352°)
  [BrickColor.Blue]: 0x3b5ca8,   // cobalt    (hue ~221°)
  [BrickColor.Green]: 0x3a8a4a,  // forest    (hue ~132°)
  [BrickColor.Yellow]: 0xa88828  // deep gold (hue ~46°)
};

export const BRICK_GLOW: Record<BrickColor, number> = {
  [BrickColor.Red]: 0xee7a8a,    // rose       (hue ~352°)
  [BrickColor.Blue]: 0x7a9eea,   // periwinkle-blue (hue ~220°, still clearly blue)
  [BrickColor.Green]: 0x6ccc88,  // spring     (hue ~134°)
  [BrickColor.Yellow]: 0xeec858  // gold       (hue ~46°)
};
