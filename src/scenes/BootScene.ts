import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.generateParticleTexture();
    this.startWhenFontsReady();
  }

  // Block the boot until the web fonts have loaded, then route to the menu.
  // Phaser renders text to a canvas, so a font that isn't loaded yet paints
  // in the system fallback and never repaints — every scene must wait for the
  // faces to be ready before drawing any text. A 1.5s safety timer guarantees
  // we never hang the boot if the font fetch stalls or the API is missing.
  private startWhenFontsReady() {
    const proceed = () => this.scene.start('MenuScene');
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts?.load) {
      proceed();
      return;
    }
    let started = false;
    const finish = () => {
      if (started) return;
      started = true;
      proceed();
    };
    const wanted = [
      "700 1em 'Orbitron'",
      "900 1em 'Orbitron'",
      "600 1em 'Rajdhani'",
      "700 1em 'Rajdhani'"
    ];
    Promise.all(wanted.map((f) => fonts.load(f).catch(() => undefined)))
      .then(() => fonts.ready)
      .then(finish)
      .catch(finish);
    this.time.delayedCall(1500, finish);
  }

  private generateParticleTexture() {
    if (this.textures.exists('particle')) return;
    const g = this.add.graphics();
    // Soft white dot with falloff — tinted at emit time
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.fillStyle(0xffffff, 0.4);
    g.fillCircle(8, 8, 6);
    g.generateTexture('particle', 16, 16);
    g.destroy();
  }
}
