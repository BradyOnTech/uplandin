import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { getBreed } from '../game/breeds';
import { activeDog, loadCareer } from '../game/career';
import { getRegion, regionAreas } from '../game/regions';
import {
  areaOpenerWeek,
  dateLabel,
  HOME_HUNT_WEEKS,
  openerWeek,
  speciesOpen,
  TRIP_HUNT_WEEKS,
  weekLabel,
} from '../game/season';
import { getSpecies } from '../game/species';

export class AreaScene extends Phaser.Scene {
  constructor() {
    super('AreaScene');
  }

  create(data: { regionId?: string }): void {
    const career = loadCareer();
    const region = getRegion(data.regionId ?? career.homeRegionId ?? career.regionsUnlocked[0]);
    const areas = regionAreas(region);
    const week = career.date.week;
    const isHome = region.id === career.homeRegionId;
    const tripCost = isHome ? HOME_HUNT_WEEKS : TRIP_HUNT_WEEKS;

    const g = this.add.graphics();
    g.fillStyle(0x1c2b18).fillRect(0, 0, 480, 270);

    this.add
      .text(240, 22, `${region.name}${isHome ? ' ★' : ''}`, { fontFamily: 'monospace', fontSize: '12px', color: '#ffd23f' })
      .setOrigin(0.5);
    this.add
      .text(240, 38, `${dateLabel(career.date)} · a hunt here costs ${tripCost} week${tripCost > 1 ? 's' : ''}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#8fc7ff',
      })
      .setOrigin(0.5);

    const dog = activeDog(career);
    if (dog) {
      this.add
        .text(240, 50, `hunting with ${dog.name} · ${getBreed(dog.breedId).name} · lv ${dog.level}`, {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#dfe9d8',
        })
        .setOrigin(0.5);
    }

    areas.forEach((area, i) => {
      const y = 88 + i * 66;
      const open = areaOpenerWeek(area) <= week;
      const card = this.add.rectangle(240, y, 400, 56, open ? area.grass : 0x2a332a);
      this.add.rectangle(48, y, 10, 56, open ? area.cover : 0x1c241c);
      this.add.text(66, y - 23, area.name, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: open ? '#ffffff' : '#8a97a4',
      });
      this.add.text(66, y - 9, area.tagline, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: open ? '#dfe9d8' : '#5a6a78',
      });
      // Species line marks what's legal right now.
      const speciesLine = area.speciesMix
        .map((s) =>
          speciesOpen(s.speciesId, week)
            ? getSpecies(s.speciesId).name
            : `${getSpecies(s.speciesId).name} (opens ${weekLabel(openerWeek(s.speciesId))})`,
        )
        .join(' · ');
      this.add.text(66, y + 4, speciesLine, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: open ? '#c9dcc0' : '#8a97a4',
      });
      if (open) {
        const rec = career.areas[area.id];
        const line = rec
          ? `best ${rec.best}   hunts ${rec.hunts}   downed ${rec.downed}   lost ${rec.escaped}`
          : 'not hunted yet';
        this.add.text(66, y + 17, line, { fontFamily: 'monospace', fontSize: '8px', color: '#ffd23f' });
        card.setInteractive().on('pointerdown', () => {
          unlockAudio();
          playBlip();
          this.scene.start('FieldScene', { areaId: area.id });
        });
      } else {
        this.add.text(66, y + 17, `season opens ${weekLabel(areaOpenerWeek(area))}`, {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#c9a15c',
        });
      }
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
