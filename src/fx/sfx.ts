/**
 * Procedural sound effects via Web Audio API.
 * No asset files — all tones are synthesized at runtime.
 * Respects the user's first-gesture requirement (AudioContext only resumes after a user interaction).
 */

class SoundFx {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;

  private getCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.35;
    this.masterGain.connect(this.ctx.destination);
    return this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Match pop — frequency scales with combo size. */
  pop(comboSize: number) {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx || !this.masterGain) return;
    // Resume context if suspended (autoplay policy)
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const baseFreq = 260; // roughly C4
    const pitchBoost = Math.min(comboSize * 35, 500);
    const freq = baseFreq + pitchBoost;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * 2, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);

    // Sparkle overtone for big combos
    if (comboSize >= 5) {
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 3, now);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.12, now);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc2.connect(g2);
      g2.connect(this.masterGain);
      osc2.start(now);
      osc2.stop(now + 0.4);
    }
  }

  /** Ignored / invalid click feedback. */
  click() {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx || !this.masterGain) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 800;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  /** Descending chord on game over. */
  gameOver() {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx || !this.masterGain) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const notes = [440, 330, 220];
    notes.forEach((freq, i) => {
      const start = now + i * 0.18;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + 0.85);
    });
  }
}

export const sfx = new SoundFx();
