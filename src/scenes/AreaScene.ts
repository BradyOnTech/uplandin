import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { getBreed } from '../game/breeds';
import { activeDog, loadCareer } from '../game/career';
import { getRegion, regionAreas } from '../game/regions';
import { getSpecies } from '../game/species';

export class AreaScene extends Phaser.Scene {
  constructor() {
    super('AreaScene');
  }

  create(data: { regionId?: string }): void {
    const career = loadCareer();
    const region = getRegion(data.regionId ?? career.regionsUnlocked[0]);
    const areas = regionAreas(region);

    const g = this.add.graphics();
    g.fillStyle(0x1c2b18).fillRect(0, 0, 480, 270);

    this.add
      .text(240, 24, region.name, { fontFamily: 'monospace', fontSize: '12px', color: '#ffd23f' })
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

    areas.forEach((area, i) => {
      const y = 82 + i * 66;
      const card = this.add.rectangle(240, y, 400, 56, area.grass).setInteractive();
      this.add.rectangle(48, y, 10, 56, area.cover);
      this.add.text(66, y - 23, area.name, { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' });
      this.add.text(66, y - 9, area.tagline, { fontFamily: 'monospace', fontSize: '8px', color: '#dfe9d8' });
      const speciesLine = area.speciesMix.map((s) => getSpecies(s.speciesId).name).join(' · ');
      this.add.text(66, y + 4, speciesLine, { fontFamily: 'monospace', fontSize: '8px', color: '#c9dcc0' });
      const rec = career.areas[area.id];
      const line = rec
        ? `best ${rec.best}   hunts ${rec.hunts}   downed ${rec.downed}   lost ${rec.escaped}`
        : 'not hunted yet';
      this.add.text(66, y + 17, line, { fontFamily: 'monospace', fontSize: '8px', color: '#ffd23f' });
      card.on('pointerdown', () => {
        unlockAudio();
        playBlip();
        this.scene.start('FieldScene', { areaId: area.id });
      });
    });

    const back = this.add
      .text(10, 252, '< map', { fontFamily: 'monospace', fontSize: '8px', color: '#9fb896' })
      .setInteractive();
    back.on('pointerdown', () => {
      unlockAudio();
      playBlip();
      this.scene.start('MapScene');
    });
  }
}
