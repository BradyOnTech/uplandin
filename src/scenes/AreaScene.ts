import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { AREAS } from '../game/areas';
import { getBreed } from '../game/breeds';
import { activeDog, loadCareer } from '../game/career';

export class AreaScene extends Phaser.Scene {
  constructor() {
    super('AreaScene');
  }

  create(): void {
    const career = loadCareer();

    const g = this.add.graphics();
    g.fillStyle(0x1c2b18).fillRect(0, 0, 480, 270);

    this.add
      .text(240, 24, 'choose your coverts', { fontFamily: 'monospace', fontSize: '12px', color: '#ffd23f' })
      .setOrigin(0.5);

    const dog = activeDog(career);
    if (dog) {
      this.add
        .text(240, 44, `hunting with ${dog.name} · ${getBreed(dog.breedId).name} · lv ${dog.level}`, {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#dfe9d8',
        })
        .setOrigin(0.5);
    }

    AREAS.forEach((area, i) => {
      const y = 76 + i * 62;
      const card = this.add.rectangle(240, y, 400, 50, area.grass).setInteractive();
      this.add.rectangle(48, y, 10, 50, area.cover);
      this.add.text(66, y - 20, area.name, { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' });
      this.add.text(66, y - 6, area.tagline, { fontFamily: 'monospace', fontSize: '8px', color: '#dfe9d8' });
      const rec = career.areas[area.id];
      const line = rec
        ? `best ${rec.best}   hunts ${rec.hunts}   downed ${rec.downed}   lost ${rec.escaped}`
        : 'not hunted yet';
      this.add.text(66, y + 10, line, { fontFamily: 'monospace', fontSize: '8px', color: '#ffd23f' });
      card.on('pointerdown', () => {
        unlockAudio();
        playBlip();
        this.scene.start('FieldScene', { areaId: area.id });
      });
    });

    const back = this.add
      .text(10, 252, '< title', { fontFamily: 'monospace', fontSize: '8px', color: '#9fb896' })
      .setInteractive();
    back.on('pointerdown', () => {
      unlockAudio();
      playBlip();
      this.scene.start('TitleScene');
    });
  }
}
