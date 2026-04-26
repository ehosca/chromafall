// Static UI chrome colors — used by all scenes for HUD text, button labels,
// and the Phaser config's initial backgroundColor.
//
// Tile colors live in src/theme/themes.ts and are theme-switchable. This file
// stays static because the chrome (text/accent/panel) is shared identity
// across every theme; only the playfield repaints when a theme changes.

export const BG_HEX = '#0a0a14';

export const PALETTE = {
  bg: 0x0a0a14,
  gridLine: 0x1a1a2e,
  text: '#e8e8ff',
  textDim: '#8888aa',
  accent: '#ff4d9e',
  panel: 0x1a1a2e
} as const;
