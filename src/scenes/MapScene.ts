import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { getBreed } from '../game/breeds';
import {
  activeDog,
  advanceCareerWeeks,
  loadCareer,
  rollToNextSeason,
  saveCareer,
  setHomeRegion,
} from '../game/career';
import { getGun, unlockedGuns } from '../game/guns';
import { GEAR_NAMES, gearTierFor, TRUCK_LEVEL, truckUnlocked } from '../game/progression';
import { regionAreas, REGIONS } from '../game/regions';
import { areaOpenerWeek, dateLabel, seasonOver, weekLabel } from '../game/season';
import { pixelText } from './pixelFont';

/** Chunky pixel-style continental US, y-down screen coords on 480×270. */
const US_OUTLINE: [number, number][] = [
  [55, 75], [150, 72], [230, 68], [310, 62], [345, 55], [368, 68], [362, 92],
  [345, 118], [352, 148], [330, 170], [318, 178], [332, 208], [318, 212],
  [302, 190], [262, 198], [238, 226], [222, 200], [205, 192], [150, 188],
  [118, 180], [95, 172], [62, 138], [55, 108], [68, 96],
];

/**
 * The travel map — and the season plan. The header carries the date; home
 * hunts cost a week, trips two. Regions show what's open now; when January
 * runs out, summer passes here and everyone comes back a season older.
 * Also doubles as the home-picker at career start.
 */
export class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene');
  }

  create(data: { chooseHome?: boolean } = {}): void {
    let career = loadCareer();
    // A career without a home picks one before anything else (new careers
    // and pre-season saves alike).
    const choosingHome = data.chooseHome || career.homeRegionId === null;
    const hasTruck = truckUnlocked(career.hunter.level);
    const over = seasonOver(career.date);

    this.add.rectangle(240, 135, 480, 270, 0x101a26);
    const g = this.add.graphics();
    g.fillStyle(0x6e6248);
    g.fillPoints(US_OUTLINE.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
    g.lineStyle(1, 0x3a4a5a).strokePoints(US_OUTLINE.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);

    pixelText(this, 240, 14, choosingHome ? 'where do you live?' : 'where to, boss?', 2, '#ffd23f')
      .setOrigin(0.5);
    if (choosingHome) {
      pixelText(this, 240, 30, 'home hunts cost a weekend · everywhere else is a trip', 1, '#dfe9d8')
        .setOrigin(0.5);
    } else {
      const dog = activeDog(career);
      const header = dog
        ? `${dog.name} the ${getBreed(dog.breedId).name} rides shotgun`
        : 'the kennel is empty';
      pixelText(this, 240, 30, `${header} · hunter lv ${career.hunter.level} · ${GEAR_NAMES[gearTierFor(career.hunter.level)]}`, 1, '#dfe9d8')
        .setOrigin(0.5);
      // The date line, with a way to let slow weeks pass. If home ground
      // hasn't opened yet (and there's no truck for trips), jump straight
      // to the opener instead of tapping through empty weeks.
      pixelText(this, 200, 44, dateLabel(career.date), 1, '#8fc7ff')
        .setOrigin(0.5);
      if (!over) {
        const home = REGIONS.find((r) => r.id === career.homeRegionId);
        const homeOpens = home ? Math.min(...regionAreas(home).map(areaOpenerWeek)) : 0;
        const stuck = !hasTruck && career.date.week < homeOpens;
        const skipTo = stuck ? homeOpens : career.date.week + 1;
        pixelText(this, 312, 44, stuck ? '[skip to the opener >]' : '[wait a week >]', 1, '#9fb896')
          .setOrigin(0.5)
          .setInteractive()
          .on('pointerdown', () => {
            unlockAudio();
            playBlip();
            saveCareer(advanceCareerWeeks(career, skipTo - career.date.week));
            this.scene.restart();
          });
      }
    }

    for (const region of REGIONS) {
      const { x, y } = region.map;
      const isHome = region.id === career.homeRegionId;
      const selectable = choosingHome
        ? region.built
        : region.built && (hasTruck || isHome) && !over;
      // What's open in this region right now?
      const areas = regionAreas(region);
      const openNow = areas.some((a) => areaOpenerWeek(a) <= career.date.week);
      const opensAt = areas.length > 0 ? Math.min(...areas.map(areaOpenerWeek)) : 0;

      if (selectable) {
        const hunts = region.areaIds.reduce((a, id) => a + (career.areas[id]?.hunts ?? 0), 0);
        const dot = this.add.circle(x, y, 5, 0xffd23f).setInteractive({ useHandCursor: true });
        this.add.circle(x, y, 2, 0x101a26);
        const label = pixelText(this, x, y + 10, `${region.name}${isHome && !choosingHome ? ' ★' : ''}`, 1, '#ffffff')
          .setOrigin(0.5, 0);
        // Map pins sit close together: compress "mid September" to "mid Sep"
        // so neighboring labels don't collide in the wide pixel face.
        const shortWeek = (w: number) => weekLabel(w).replace(/ (\w{3})\w+/, ' $1');
        const sub = choosingHome
          ? `opens ${opensAt === 0 ? 'Sept 1' : shortWeek(opensAt)}`
          : !openNow
            ? `opens ${shortWeek(opensAt)}`
            : hunts > 0
              ? `${hunts} hunts`
              : '';
        if (sub) {
          pixelText(this, x, y + 20, sub, 1, '#ffffff')
            .setOrigin(0.5, 0);
        }
        dot.on('pointerdown', () => {
          unlockAudio();
          playBlip();
          if (choosingHome) {
            saveCareer(setHomeRegion(career, region.id));
            this.scene.restart({});
          } else {
            this.scene.start('AreaScene', { regionId: region.id });
          }
        });
      } else {
        this.add.circle(x, y, 3, 0x44505c);
        const note = !region.built
          ? 'a later season'
          : over
            ? ''
            : `needs the truck (hunter lv ${TRUCK_LEVEL})`;
        pixelText(this, x, y + 8, region.name, 1, '#8a97a4')
          .setOrigin(0.5, 0);
        if (note) {
          pixelText(this, x, y + 18, note, 1, '#5a6a78')
            .setOrigin(0.5, 0);
        }
      }
    }

    // January's gone: summer passes, dogs age, next September comes.
    if (over && !choosingHome) {
      this.add
        .rectangle(240, 135, 220, 46, 0x101410, 0.92)
        .setStrokeStyle(1, 0xffd23f)
        .setInteractive()
        .on('pointerdown', () => {
          unlockAudio();
          playBlip();
          saveCareer(rollToNextSeason(career));
          this.scene.restart();
        });
      pixelText(this, 240, 128, `summer passes...`, 1, '#ffd23f')
        .setOrigin(0.5);
      pixelText(this, 240, 143, `start season ${career.date.season + 1} — everyone a year older`, 1, '#dfe9d8')
        .setOrigin(0.5);
    }

    if (!choosingHome) {
      // Gun rack: tap to cycle through what your hunter level has unlocked.
      const guns = unlockedGuns(career.hunter.level);
      const gunLabel = pixelText(this, 240, 246, '', 1, '#dfe9d8')
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      const setGunText = () =>
        gunLabel.setText(`gun: ${getGun(career.hunter.shotgunId).name}${guns.length > 1 ? '  <tap to swap>' : ''}`);
      setGunText();
      gunLabel.on('pointerdown', () => {
        unlockAudio();
        playBlip();
        const i = guns.findIndex((gn) => gn.id === career.hunter.shotgunId);
        career.hunter.shotgunId = guns[(i + 1) % guns.length].id;
        saveCareer(career);
        setGunText();
      });

      const kennel = pixelText(this, 470, 252, 'kennel >', 1, '#9fb896')
        .setOrigin(1, 0)
        .setInteractive();
      kennel.on('pointerdown', () => {
        unlockAudio();
        playBlip();
        this.scene.start('KennelScene');
      });

      const back = pixelText(this, 10, 252, '< title', 1, '#9fb896')
        .setInteractive();
      back.on('pointerdown', () => {
        unlockAudio();
        playBlip();
        this.scene.start('TitleScene');
      });
    }
  }
}
