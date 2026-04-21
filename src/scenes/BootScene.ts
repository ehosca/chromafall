import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.generateParticleTexture();
    this.scene.start('MenuScene');
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
