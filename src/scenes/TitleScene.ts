import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { loadCareer } from '../game/career';
import { pixelText } from './pixelFont';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  preload(): void {
    this.load.image('title-screen', 'art/title-screen.png');
  }

  create(): void {
    const career = loadCareer();

    if (this.textures.exists('title-screen')) {
      // The painted ridge at dawn; "UPLANDIN" renders over its calm sky.
      this.add.image(240, 135, 'title-screen');
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x63a4ff).fillRect(0, 0, 480, 100);
      g.fillStyle(0x2f5d23).fillRect(0, 100, 480, 170);
    }

    pixelText(this, 240, 66, 'UPLANDIN', 4, '#ffd23f')
      .setOrigin(0.5);
    pixelText(this, 240, 96, 'a retro bird hunt', 1, '#ffffff')
      .setOrigin(0.5);

    const stats =
      career.hunts > 0
        ? `career — hunts ${career.hunts}   downed ${career.downed}   lost ${career.escaped}`
        : 'no hunts yet — your dog is waiting';
    pixelText(this, 240, 158, stats, 1, '#dfe9d8')
      .setOrigin(0.5);

    const button = (y: number, label: string, sub: string, onTap: () => void) => {
      this.add
        .rectangle(240, y, 226, 26, 0x101410, 0.7)
        .setStrokeStyle(1, 0x9fb896)
        .setInteractive()
        .on('pointerdown', () => {
          unlockAudio();
          playBlip();
          onTap();
        });
      pixelText(this, 240, y - 4, label, 1, '#ffffff')
        .setOrigin(0.5);
      pixelText(this, 240, y + 8, sub, 1, '#9fb896')
        .setOrigin(0.5);
    };

    // First run: pick and name a puppy before anything else.
    button(196, 'career', 'raise your dog, work the map', () =>
      this.scene.start(career.kennel.length === 0 ? 'BreedScene' : 'MapScene'),
    );
    button(232, 'quick hunt', 'everything unlocked, nothing saved', () => this.scene.start('QuickScene'));
  }
}
