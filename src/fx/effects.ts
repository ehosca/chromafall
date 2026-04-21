import Phaser from 'phaser';

/**
 * Emit a colored particle burst at world position (x, y).
 * Count scales gently with combo size.
 */
export function emitBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  comboSize = 2
) {
  const quantity = Math.min(6 + comboSize * 2, 24);
  const emitter = scene.add.particles(x, y, 'particle', {
    speed: { min: 80, max: 280 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.8, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 350, max: 650 },
    quantity,
    blendMode: Phaser.BlendModes.ADD,
    tint: color,
    emitting: false
  });
  emitter.setDepth(500);
  emitter.explode(quantity);
  scene.time.delayedCall(800, () => emitter.destroy());
}

/**
 * Screen shake scaled to combo size.
 */
export function shakeScreen(camera: Phaser.Cameras.Scene2D.Camera, comboSize: number) {
  if (comboSize < 2) return;
  const intensity = Math.min(0.003 + comboSize * 0.0015, 0.02);
  const duration = Math.min(120 + comboSize * 20, 450);
  camera.shake(duration, intensity);
}

/**
 * Floating "+points" / "CHAIN xN!" text rising and fading at world position.
 *
 * Split into three phases so the message is actually readable:
 *   pop-in (0-200ms)   — alpha 0→1, scale 0.6→target, with a Back.Out bounce
 *   hold   (200-1100ms) — fully opaque, gently rising
 *   fade   (1100-1600ms) — alpha 1→0 while continuing to rise
 *
 * The earlier version ran alpha + y + scale in a single 900ms tween, so the
 * text was already half-transparent and drifting by the time the eye caught
 * it. ~900ms of hold at full opacity is what makes the number legible.
 */
export function showComboText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  comboSize: number,
  points: number
) {
  const big = comboSize >= 5;
  const huge = comboSize >= 8;
  // For CHAIN / MEGA CHAIN, break onto two lines so the points number gets
  // its own visual beat — a single line of "CHAIN x8!  +256" crammed the
  // score against the label and buried the payoff. Plain small combos stay
  // single-line (just "+N").
  const msg = huge
    ? `MEGA CHAIN x${comboSize}!\n+${points}`
    : big
      ? `CHAIN x${comboSize}!\n+${points}`
      : `+${points}`;
  const color = huge ? '#ffd93b' : big ? '#ff4d9e' : '#e8e8ff';
  const fontSize = `${Math.min(22 + comboSize * 2, 56)}px`;
  const targetScale = big ? 1.15 : 1.0;
  const rise = 80;

  const text = scene.add.text(x, y, msg, {
    fontSize,
    color,
    fontFamily: 'monospace',
    fontStyle: 'bold',
    stroke: '#0a0a14',
    strokeThickness: 4,
    // Center-align so the shorter "+N" line sits directly under the CHAIN
    // label instead of left-hugging it.
    align: 'center'
  }).setOrigin(0.5).setDepth(1000).setAlpha(0).setScale(0.6);

  // Clamp position so the full message stays on-screen even when the group's
  // centroid is near an edge (a MEGA CHAIN message is ~350px wide at 42px
  // font — without clamping it bleeds off the side on small viewports).
  // Measure AFTER creation so we use the real rendered width for the font.
  // The target scale matters for measurement — bump the half-size by
  // targetScale to reserve room for the post-pop-in size.
  const pad = 12;
  const halfW = (text.width * targetScale) / 2;
  const halfH = (text.height * targetScale) / 2;
  const w = scene.scale.width;
  const h = scene.scale.height;
  // The rise tween moves the text up by `rise` px; the top of the text at
  // its final position must still clear the top edge.
  const minY = rise + halfH + pad;
  const maxY = h - halfH - pad;
  const clampedX = Phaser.Math.Clamp(x, halfW + pad, w - halfW - pad);
  const clampedY = Phaser.Math.Clamp(y, minY, Math.max(minY, maxY));
  text.setPosition(clampedX, clampedY);

  // Phase 1: pop in (fast, overlaps with the start of the rise)
  scene.tweens.add({
    targets: text,
    alpha: 1,
    scale: targetScale,
    duration: 200,
    ease: 'Back.Out'
  });

  // Phase 2: slow rise across the full lifetime so motion reads as "floating up"
  scene.tweens.add({
    targets: text,
    y: clampedY - rise,
    duration: 1600,
    ease: 'Cubic.Out'
  });

  // Phase 3: fade out after a long hold, then destroy
  scene.tweens.add({
    targets: text,
    alpha: 0,
    delay: 1100,
    duration: 450,
    ease: 'Cubic.In',
    onComplete: () => text.destroy()
  });
}

/**
 * Gentle breathing pulse on interactive elements (menu buttons, CTAs).
 * Returns the tween so caller can stop it if needed.
 */
export function breathingPulse(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject & { scale?: number },
  minScale = 1.0,
  maxScale = 1.06,
  duration = 1400
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    scale: { from: minScale, to: maxScale },
    duration,
    ease: 'Sine.InOut',
    yoyo: true,
    repeat: -1
  });
}
