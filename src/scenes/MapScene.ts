import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { getBreed } from '../game/breeds';
import {
  activeDog,
  addDogToKennel,
  advanceCareerWeeks,
  loadCareer,
  rollToNextSeason,
  saveCareer,
  setActiveDog,
  setHomeRegion,
} from '../game/career';
import { getGun, unlockedGuns } from '../game/guns';
import { GEAR_NAMES, gearTierFor, TRUCK_LEVEL, truckUnlocked } from '../game/progression';
import { regionAreas, REGIONS } from '../game/regions';
import { areaOpenerWeek, dateLabel, seasonOver, weekLabel } from '../game/season';
import { getSpecies } from '../game/species';
import {
  MENU,
  addImageFrame,
  addMenuBackdrop,
  addMenuPanel,
  addRuleHeading,
  addStepHeader,
  menuCopy,
  menuTitle,
  preloadMenuArt,
  setMenuFocus,
} from './menuUi';
import { pixelText } from './pixelFont';

interface PendingDog {
  breedId: string;
  name: string;
}

interface MapSceneData {
  chooseHome?: boolean;
  newDog?: PendingDog;
}

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

  preload(): void {
    preloadMenuArt(this);
  }

  create(data: MapSceneData = {}): void {
    let career = loadCareer();
    // A career without a home picks one before anything else (new careers
    // and pre-season saves alike).
    const choosingHome = data.chooseHome || career.homeRegionId === null;
    if (choosingHome) {
      this.createHomePicker(career, data.newDog);
      return;
    }
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

  private createHomePicker(career: ReturnType<typeof loadCareer>, pendingDog?: PendingDog): void {
    let selectedIndex = Math.max(0, REGIONS.findIndex((region) => region.id === career.homeRegionId));

    addMenuBackdrop(this, 0.25);
    addStepHeader(this, 3, 2);
    menuTitle(this, 240, 44, 'CHOOSE YOUR HOME GROUND', 28, 390);
    pixelText(this, 240, 60, '—  HOME HUNTS COST 1 WEEK. TRIPS COST 2.  —', 1, MENU.sage)
      .setOrigin(0.5);
    addMenuPanel(this, 240, 159, 398, 192, 0.97);
    addRuleHeading(this, 161, 75, 'REGIONS', 222);
    addRuleHeading(this, 357, 75, 'YOUR SELECTION', 132);

    addImageFrame(this, 161, 146, 228, 139, MENU.lineSoft);
    this.add.image(161, 146, 'menu-home-map').setDisplaySize(226, 137);

    const pinPositions: Record<string, [number, number]> = {
      'pacific-valleys': [69, 122],
      'great-basin': [105, 143],
      'sonoran-desert': [111, 184],
      'high-rockies': [145, 126],
      'southern-plains': [178, 183],
      'prairie-pothole': [190, 112],
      'north-woods': [258, 109],
    };
    const pins = REGIONS.map((region, index) => {
      const [x, y] = pinPositions[region.id];
      const hit = this.add.circle(x, y, 8, 0x000000, 0.01)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          selectedIndex = index;
          refresh();
        })
        .on('pointerdown', () => {
          unlockAudio();
          playBlip();
          selectedIndex = index;
          refresh();
        });
      const dot = this.add.circle(x, y, 4, 0xa9b982).setStrokeStyle(1, MENU.ink);
      const shortName = region.name.replace('Prairie ', '').replace('Pacific ', '').replace('Southern ', '');
      const label = menuCopy(this, x, y + 8, shortName, MENU.cream, 5).setOrigin(0.5, 0);
      return { hit, dot, label };
    });

    addImageFrame(this, 357, 105, 138, 52, MENU.line);
    const regionPreview = this.add.image(357, 105, 'menu-region-southern-plains').setDisplaySize(136, 50);
    const regionName = menuTitle(this, 357, 140, '', 16, 134);
    const regionBlurb = menuCopy(this, 357, 153, '', MENU.sage, 6).setOrigin(0.5);
    const areaName = menuCopy(this, 357, 166, '', MENU.cream, 7).setOrigin(0.5);
    const opener = menuCopy(this, 357, 178, '', MENU.sage, 6).setOrigin(0.5);
    this.add.rectangle(357, 191, 132, 17, MENU.olive, 0.7).setStrokeStyle(1, MENU.line);
    menuCopy(this, 357, 191, 'HOME HUNT  ·  1 WEEK', MENU.cream, 7).setOrigin(0.5);

    const savedDog = activeDog(career);
    const dogBreed = pendingDog ? getBreed(pendingDog.breedId) : savedDog ? getBreed(savedDog.breedId) : getBreed('gsp');
    const dogName = pendingDog?.name ?? savedDog?.name ?? 'YOUR DOG';
    this.add.image(303, 212, `menu-dog-thumb-${dogBreed.id}`).setDisplaySize(24, 24);
    menuCopy(this, 319, 206, dogName, MENU.cream, 7).setOrigin(0, 0.5);
    const dogBreedText = menuCopy(this, 319, 217, dogBreed.name, MENU.sage, 6).setOrigin(0, 0.5);
    if (dogBreedText.width > 104) dogBreedText.setScale(104 / dogBreedText.width, 1);

    const homeBox = this.add.rectangle(365, 242, 126, 22, MENU.olive, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => confirmHome());
    pixelText(this, 365, 242, 'MAKE THIS HOME', 1, MENU.cream).setOrigin(0.5);
    setMenuFocus(homeBox, true, true);

    this.add.rectangle(79, 242, 64, 20, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => goBack());
    menuCopy(this, 79, 242, 'ESC  BACK', MENU.cream, 7).setOrigin(0.5);
    menuCopy(this, 240, 260, '←→ CHOOSE REGION  ·  ENTER MAKE HOME', MENU.muted, 7).setOrigin(0.5);

    const refresh = () => {
      const region = REGIONS[selectedIndex];
      pins.forEach(({ dot, label }, index) => {
        const selected = index === selectedIndex;
        dot.setRadius(selected ? 5 : 3.5);
        dot.setFillStyle(selected ? MENU.amber : 0xa9b982, 1);
        dot.setStrokeStyle(selected ? 2 : 1, selected ? 0xf2e5c5 : MENU.ink);
        label.setColor(selected ? MENU.amberText : MENU.cream);
      });
      const area = regionAreas(region)[0];
      const species = getSpecies(area.speciesMix[0].speciesId);
      regionPreview.setTexture(`menu-region-${region.id}`);
      regionName.setText(region.name.toUpperCase());
      regionName.setScale(1);
      if (regionName.width > 134) regionName.setScale(134 / regionName.width);
      regionBlurb.setText(species.name.toUpperCase());
      areaName.setText(area.name.toUpperCase());
      opener.setText(`OPENS ${weekLabel(areaOpenerWeek(area)).toUpperCase()}`);
    };

    const confirmHome = () => {
      unlockAudio();
      playBlip();
      let next = setHomeRegion(career, REGIONS[selectedIndex].id);
      if (pendingDog) {
        const result = addDogToKennel(next, pendingDog.name, pendingDog.breedId);
        next = setActiveDog(result.career, result.dog.id);
      }
      saveCareer(next);
      this.scene.restart({});
    };

    const goBack = () => {
      unlockAudio();
      playBlip();
      if (pendingDog) this.scene.start('BreedScene', { resume: pendingDog });
      else this.scene.start('TitleScene');
    };

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        goBack();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + REGIONS.length) % REGIONS.length;
        playBlip();
        refresh();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % REGIONS.length;
        playBlip();
        refresh();
      } else if (event.key === 'Enter' || event.key === ' ') {
        confirmHome();
      }
    });

    refresh();
  }
}
