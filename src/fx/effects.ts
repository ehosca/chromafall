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
  const msg = huge
    ? `MEGA CHAIN x${comboSize}!  +${points}`
    : big
      ? `CHAIN x${comboSize}!  +${points}`
      : `+${points}`;
  const color = huge ? '#ffd93b' : big ? '#ff4d9e' : '#e8e8ff';
  const fontSize = `${Math.min(22 + comboSize * 2, 56)}px`;

  const text = scene.add.text(x, y, msg, {
    fontSize,
    color,
    fontFamily: 'monospace',
    fontStyle: 'bold',
    stroke: '#0a0a14',
    strokeThickness: 3
  }).setOrigin(0.5).setDepth(1000);

  scene.tweens.add({
    targets: text,
    y: y - 70,
    alpha: 0,
    scale: big ? 1.3 : 1.1,
    duration: 900,
    ease: 'Cubic.Out',
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
