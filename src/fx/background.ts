import Phaser from 'phaser';

// Procedural synthwave backdrop — zero asset dependency (the project's C1
// constraint). Draws, bottom-to-top:
//   1. vertical gradient sky (deep indigo → magenta horizon)
//   2. a soft horizon "sun" glow bloom
//   3. a perspective grid floor receding to the horizon
//   4. a vignette darkening the corners to focus the center
//
// Everything sits at the lowest depth and is purely decorative (no input).
// Used by the chrome scenes (Menu / GameOver / Settings). The GameScene
// playfield intentionally keeps its flat theme background so neon tile halos
// retain contrast.

export interface SynthwaveBackgroundOptions {
  // Fraction of height where the horizon sits (0 = top, 1 = bottom).
  horizon?: number;
  // Accent hue for the sun + grid (defaults to the brand magenta).
  accent?: number;
  // Draw the receding grid floor. Off for denser screens (Settings).
  grid?: boolean;
}

const SKY_TOP = 0x0a0a14;      // near-black indigo (matches PALETTE.bg)
const SKY_HORIZON = 0x3a1a4e;  // deep magenta-violet at the horizon
const DEFAULT_ACCENT = 0xff4d9e;

export function drawSynthwaveBackground(
  scene: Phaser.Scene,
  opts: SynthwaveBackgroundOptions = {}
): Phaser.GameObjects.Container {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const horizonY = h * (opts.horizon ?? 0.62);
  const accent = opts.accent ?? DEFAULT_ACCENT;
  const showGrid = opts.grid ?? true;

  const layer = scene.add.container(0, 0).setDepth(-1000);

  // --- 1. Gradient sky (banded fillRects — cheap, no shader needed) ---
  const sky = scene.add.graphics();
  const BANDS = 48;
  for (let i = 0; i < BANDS; i++) {
    const tBand = i / (BANDS - 1);
    const yTop = (horizonY / BANDS) * i;
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(SKY_TOP),
      Phaser.Display.Color.ValueToColor(SKY_HORIZON),
      BANDS - 1,
      i
    );
    sky.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
    sky.fillRect(0, yTop, w, horizonY / BANDS + 1);
    void tBand;
  }
  // Floor below the horizon stays the darkest tone so the grid reads against it.
  sky.fillStyle(SKY_TOP, 1);
  sky.fillRect(0, horizonY, w, h - horizonY);
  layer.add(sky);

  // --- 2. Horizon sun bloom (additive radial glow centered on the horizon) ---
  ensureGlowTexture(scene);
  const sun = scene.add.image(w / 2, horizonY, 'bg-glow')
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(accent)
    .setAlpha(0.55);
  sun.setDisplaySize(w * 1.2, h * 0.9);
  layer.add(sun);

  // --- 3. Perspective grid floor ---
  if (showGrid) {
    const grid = scene.add.graphics();
    const gridColor = accent;

    // Horizontal lines: spacing grows toward the viewer (exponential) so the
    // floor reads as receding into the distance.
    grid.lineStyle(1, gridColor, 0.28);
    const ROWS = 14;
    for (let i = 1; i <= ROWS; i++) {
      const t = i / ROWS;
      const y = horizonY + (h - horizonY) * (t * t);
      grid.lineBetween(0, y, w, y);
    }

    // Vertical lines fan out from a vanishing point at the horizon center.
    grid.lineStyle(1, gridColor, 0.22);
    const vanishX = w / 2;
    const COLS = 16;
    for (let i = -COLS; i <= COLS; i++) {
      const xBottom = w / 2 + (i / COLS) * w * 1.6;
      grid.lineBetween(vanishX, horizonY, xBottom, h);
    }
    layer.add(grid);
  }

  // --- 4. Vignette (radial dark falloff at the edges) ---
  ensureVignetteTexture(scene);
  const vignette = scene.add.image(w / 2, h / 2, 'bg-vignette');
  vignette.setDisplaySize(w, h);
  layer.add(vignette);

  return layer;
}

// Soft white radial glow, tinted at use. Same idea as the tile halo texture.
function ensureGlowTexture(scene: Phaser.Scene): void {
  const KEY = 'bg-glow';
  if (scene.textures.exists(KEY)) return;
  const SIZE = 256;
  const canvas = scene.textures.createCanvas(KEY, SIZE, SIZE);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const grad = ctx.createRadialGradient(
    SIZE / 2, SIZE / 2, 0,
    SIZE / 2, SIZE / 2, SIZE / 2
  );
  grad.addColorStop(0.0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
  canvas.refresh();
}

// Transparent center → opaque-black edges, multiplied over the scene to
// darken corners. Drawn as a radial gradient of black with rising alpha.
function ensureVignetteTexture(scene: Phaser.Scene): void {
  const KEY = 'bg-vignette';
  if (scene.textures.exists(KEY)) return;
  const SIZE = 256;
  const canvas = scene.textures.createCanvas(KEY, SIZE, SIZE);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const grad = ctx.createRadialGradient(
    SIZE / 2, SIZE / 2, SIZE * 0.25,
    SIZE / 2, SIZE / 2, SIZE * 0.62
  );
  grad.addColorStop(0.0, 'rgba(0,0,0,0.0)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
  canvas.refresh();
}
