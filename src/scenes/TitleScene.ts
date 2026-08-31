import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { loadCareer } from '../game/career';
import {
  loadGameplayMode,
  saveGameplayMode,
  type GameplayMode,
} from '../game/gameplayMode';
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

    let mode: GameplayMode = loadGameplayMode();
    pixelText(this, 240, 116, 'gameplay mode — same hunter, same dogs', 1, '#dfe9d8')
      .setOrigin(0.5);
    const modeCards: Partial<Record<GameplayMode, Phaser.GameObjects.Rectangle>> = {};
    const modeLabels: Partial<Record<GameplayMode, ReturnType<typeof pixelText>>> = {};
    const refreshMode = () => {
      (['2d', '3d'] as const).forEach((candidate) => {
        const selected = candidate === mode;
        modeCards[candidate]?.setFillStyle(selected ? 0x3d7429 : 0x101410, selected ? 0.95 : 0.72);
        modeCards[candidate]?.setStrokeStyle(1, selected ? 0xffd23f : 0x9fb896);
        modeLabels[candidate]?.setColor(selected ? '#ffffff' : '#9fb896');
      });
    };
    const modeButton = (x: number, candidate: GameplayMode, label: string) => {
      modeCards[candidate] = this.add
        .rectangle(x, 136, 96, 24, 0x101410, 0.72)
        .setInteractive()
        .on('pointerdown', () => {
          unlockAudio();
          playBlip();
          mode = candidate;
          saveGameplayMode(mode);
          refreshMode();
        });
      modeLabels[candidate] = pixelText(this, x, 136, label, 1, '#9fb896').setOrigin(0.5);
    };
    modeButton(188, '2d', '2D CLASSIC');
    modeButton(292, '3d', '3D OPEN WORLD');
    refreshMode();

    const stats =
      career.hunts > 0
        ? `career — hunts ${career.hunts}   downed ${career.downed}   lost ${career.escaped}`
        : 'no hunts yet — your dog is waiting';
    pixelText(this, 240, 163, stats, 1, '#dfe9d8')
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
