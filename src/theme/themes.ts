import type Phaser from 'phaser';
import { BrickColor } from '../game/types';

// A Theme bundles every visual choice the GameScene needs to repaint itself.
// Keep this lean — anything theme-able lives here, anything that's structural
// (tile size, board layout, font family) stays in GameScene.
//
// Adding a theme: append to THEMES below. The cycle order is the array order.
export interface ThemeDef {
  id: string;          // url/localStorage key
  name: string;        // human-readable label shown in HUD
  bg: number;          // GameScene camera background
  fills: Record<BrickColor, number>;
  glows: Record<BrickColor, number>;
  strokeWidth: number; // 0 = no border at all
  // strokeFromGlow=true → border uses the per-color glow value (neon look)
  // false → border uses strokeColor (e.g. retro black inset)
  strokeFromGlow: boolean;
  strokeColor: number;
  tileGap: number;     // px subtracted from tileSize for the rect (gap between tiles)
  hudScoreColor: string;
}

const CLASSIC: ThemeDef = {
  id: 'classic',
  name: 'Classic',
  bg: 0x0a0a14,
  fills: {
    [BrickColor.Red]: 0xa8384a,
    [BrickColor.Blue]: 0x3b5ca8,
    [BrickColor.Green]: 0x3a8a4a,
    [BrickColor.Yellow]: 0xa88828
  },
  glows: {
    [BrickColor.Red]: 0xee7a8a,
    [BrickColor.Blue]: 0x7a9eea,
    [BrickColor.Green]: 0x6ccc88,
    [BrickColor.Yellow]: 0xeec858
  },
  strokeWidth: 2,
  strokeFromGlow: true,
  strokeColor: 0xffffff,
  tileGap: 2,
  hudScoreColor: '#e8e8ff'
};

const VIVID_NEON: ThemeDef = {
  id: 'neon',
  name: 'Vivid Neon',
  bg: 0x05050f,
  fills: {
    [BrickColor.Red]: 0xff3366,
    [BrickColor.Blue]: 0x4477ff,
    [BrickColor.Green]: 0x33cc66,
    [BrickColor.Yellow]: 0xffcc33
  },
  glows: {
    [BrickColor.Red]: 0xff77aa,
    [BrickColor.Blue]: 0x88aaff,
    [BrickColor.Green]: 0x77ee99,
    [BrickColor.Yellow]: 0xffe077
  },
  strokeWidth: 3,
  strokeFromGlow: true,
  strokeColor: 0xffffff,
  tileGap: 2,
  hudScoreColor: '#f5f5ff'
};

const SOFT_PASTEL: ThemeDef = {
  id: 'pastel',
  name: 'Soft Pastel',
  // Slightly darker warm-charcoal bg gives the brighter pastels something to
  // pop off (was 0x1a1820 — too close in luminance to the previous washed
  // fills, which is why everything looked muddy together).
  bg: 0x141220,
  // True pastel = high lightness (~65%) + MEDIUM saturation (~55%). The old
  // values sat at ~25% saturation, which reads as "washed out" rather than
  // pastel. Bumped saturation by ~2x while holding lightness in the pastel
  // range so they still feel soft, just no longer muddy.
  //   red    HSL ~350°, S 60%, L 65%  → coral / rosé
  //   blue   HSL ~221°, S 65%, L 65%  → bright periwinkle
  //   green  HSL ~133°, S 50%, L 62%  → fresh mint
  //   yellow HSL ~ 43°, S 65%, L 62%  → warm butter / apricot
  fills: {
    [BrickColor.Red]: 0xf07c8e,
    [BrickColor.Blue]: 0x7a99e8,
    [BrickColor.Green]: 0x7ac98a,
    [BrickColor.Yellow]: 0xeccc66
  },
  // Glows are the same hue ~12% lighter — used as the "primed" fill swap so
  // selection still reads even without a stroke.
  glows: {
    [BrickColor.Red]: 0xffa5b3,
    [BrickColor.Blue]: 0xa3bbf2,
    [BrickColor.Green]: 0xa6dfae,
    [BrickColor.Yellow]: 0xffe08a
  },
  strokeWidth: 0,      // no stroke — just fills, that's the pastel discipline
  strokeFromGlow: true,
  strokeColor: 0xffffff,
  tileGap: 6,          // breathing room between tiles
  hudScoreColor: '#f5ecd8'
};

const RETRO_PIXEL: ThemeDef = {
  id: 'retro',
  name: 'Retro Pixel',
  bg: 0x000000,
  fills: {
    [BrickColor.Red]: 0xee2222,
    [BrickColor.Blue]: 0x2266ee,
    [BrickColor.Green]: 0x22cc44,
    [BrickColor.Yellow]: 0xeecc11
  },
  glows: {
    [BrickColor.Red]: 0xff5555,
    [BrickColor.Blue]: 0x55aaff,
    [BrickColor.Green]: 0x55ee77,
    [BrickColor.Yellow]: 0xffee55
  },
  strokeWidth: 3,
  strokeFromGlow: false,
  strokeColor: 0x000000, // chunky black inset border for the pixel-art read
  tileGap: 0,            // no gap — full-bleed tiles
  hudScoreColor: '#ffffff'
};

export const THEMES: ThemeDef[] = [CLASSIC, VIVID_NEON, SOFT_PASTEL, RETRO_PIXEL];

const STORAGE_KEY = 'chromafall-theme';

// Active id resolution priority on first read:
//   1. ?theme=<id> URL param (and persists it to localStorage)
//   2. localStorage value
//   3. CLASSIC (the original look)
function readInitialThemeId(): string {
  try {
    const url = new URLSearchParams(window.location.search);
    const fromUrl = url.get('theme');
    if (fromUrl && THEMES.some(t => t.id === fromUrl)) {
      localStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some(t => t.id === stored)) return stored;
  } catch {
    /* localStorage unavailable (private mode) — fall through */
  }
  return CLASSIC.id;
}

let activeId = readInitialThemeId();

export function getActiveTheme(): ThemeDef {
  return THEMES.find(t => t.id === activeId) ?? CLASSIC;
}

export function setActiveTheme(id: string): ThemeDef {
  const t = THEMES.find(t => t.id === id);
  if (!t) return getActiveTheme();
  activeId = id;
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
  return t;
}

// Advance to the next theme in THEMES order, wrapping. Returns the new theme.
export function cycleTheme(): ThemeDef {
  const idx = THEMES.findIndex(t => t.id === activeId);
  const next = THEMES[(idx + 1) % THEMES.length];
  return setActiveTheme(next.id);
}

// Repaint a Phaser scene's existing brick sprites + background + HUD to match
// the active theme. Does NOT recreate sprites — preserves game state, halos
// of existing primed groups, in-flight tweens, etc. Call this on scene boot
// AND whenever the theme changes.
//
// Caller responsibilities (the GameScene knows these specifics):
//   - sprites: id → Rectangle, with 'baseFill' / 'glowFill' Data
//   - tileSize: scalar pixel size
//   - scoreText: HUD score label
//   - rerunHud: callback to re-derive any other HUD colors (Undo/Redo state)
//
// Returns the theme that was applied so the caller can update its own labels.
export function applyTheme(opts: {
  scene: Phaser.Scene;
  sprites: Map<number, Phaser.GameObjects.Rectangle>;
  brickColorOf: (id: number) => BrickColor | undefined;
  tileSize: number;
  scoreText?: Phaser.GameObjects.Text;
  rerunHud?: () => void;
}): ThemeDef {
  const t = getActiveTheme();
  opts.scene.cameras.main.setBackgroundColor(t.bg);

  for (const [id, sprite] of opts.sprites) {
    const color = opts.brickColorOf(id);
    if (color === undefined) continue;
    const fill = t.fills[color];
    const glow = t.glows[color];
    sprite.setFillStyle(fill, 1);
    if (t.strokeWidth > 0) {
      const sc = t.strokeFromGlow ? glow : t.strokeColor;
      sprite.setStrokeStyle(t.strokeWidth, sc, 1);
    } else {
      sprite.setStrokeStyle(0);
    }
    sprite.setSize(opts.tileSize - t.tileGap, opts.tileSize - t.tileGap);
    sprite.setData('baseFill', fill);
    sprite.setData('glowFill', glow);
  }

  if (opts.scoreText) opts.scoreText.setColor(t.hudScoreColor);
  opts.rerunHud?.();
  return t;
}
