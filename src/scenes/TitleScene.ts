import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { loadCareer } from '../game/career';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create(): void {
    const career = loadCareer();

    const g = this.add.graphics();
    g.fillStyle(0x63a4ff).fillRect(0, 0, 480, 100);
    g.fillStyle(0x2f5d23).fillRect(0, 100, 480, 170);

    this.add
      .text(240, 66, 'UPLANDIN', { fontFamily: 'monospace', fontSize: '28px', color: '#ffd23f' })
      .setOrigin(0.5);
    this.add
      .text(240, 96, 'a retro bird hunt', { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' })
      .setOrigin(0.5);

    const stats =
      career.hunts > 0
        ? `career — hunts ${career.hunts}   downed ${career.downed}   lost ${career.escaped}`
        : 'no hunts yet — your dog is waiting';
    this.add
      .text(240, 158, stats, { fontFamily: 'monospace', fontSize: '8px', color: '#dfe9d8' })
      .setOrigin(0.5);

    const prompt = this.add
      .text(240, 206, 'tap to hunt', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 550, yoyo: true, repeat: -1 });

    this.input.once('pointerdown', () => {
      unlockAudio();
      playBlip();
      this.scene.start('AreaScene');
    });
  }
}
