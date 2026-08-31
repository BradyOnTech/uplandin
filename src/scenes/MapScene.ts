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
import { regionAreas, REGIONS, type RegionConfig } from '../game/regions';
import { areaOpenerWeek, dateLabel, seasonOver, weekLabel } from '../game/season';
import { getSpecies } from '../game/species';
import {
  MENU,
  addFooterHint,
  addMenuBackdrop,
  addMenuPanel,
  addRuleHeading,
  addStepHeader,
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

interface RegionMapTheme {
  ground: number;
  contour: number;
  accent: number;
  detail: number;
}

const REGION_MAP_THEMES: Record<string, RegionMapTheme> = {
  'southern-plains': { ground: 0x88723d, contour: 0xb59a55, accent: 0xd1ad55, detail: 0x4f4b2a },
  'prairie-pothole': { ground: 0x58694b, contour: 0x78915c, accent: 0x3c7185, detail: 0xb58a42 },
  'north-woods': { ground: 0x263c32, contour: 0x45604a, accent: 0x172c25, detail: 0x718064 },
  'great-basin': { ground: 0x836647, contour: 0xad875a, accent: 0x5f4935, detail: 0xd0a66d },
  'sonoran-desert': { ground: 0xa45d37, contour: 0xd0834f, accent: 0x633b2d, detail: 0x5b6a32 },
  'high-rockies': { ground: 0x506779, contour: 0x8094a2, accent: 0xdce4df, detail: 0x2f4d48 },
  'pacific-valleys': { ground: 0x8a763d, contour: 0xc5a556, accent: 0x4d6335, detail: 0x527a82 },
};

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

    addMenuBackdrop(this, 0.33);
    addStepHeader(this, 3, 2);
    pixelText(this, 240, 46, 'CHOOSE YOUR HOME GROUND', 2, MENU.cream).setOrigin(0.5);
    pixelText(this, 240, 62, 'HOME HUNTS TAKE ONE WEEK. ROAD TRIPS TAKE TWO.', 1, MENU.sage)
      .setOrigin(0.5);
    addMenuPanel(this, 240, 163, 458, 190, 0.96);
    addRuleHeading(this, 128, 78, 'THE COUNTRY', 218);
    addRuleHeading(this, 354, 78, 'YOUR SELECTION', 208);

    const mapPoint = (x: number, y: number): [number, number] => [27 + (x - 55) * 0.65, 86 + (y - 55) * 0.69];
    const mapGraphics = this.add.graphics();
    const outline = US_OUTLINE.map(([x, y]) => {
      const [px, py] = mapPoint(x, y);
      return new Phaser.Geom.Point(px, py);
    });
    const drawRegionMap = (region: RegionConfig) => {
      const theme = REGION_MAP_THEMES[region.id] ?? REGION_MAP_THEMES['southern-plains'];
      mapGraphics.clear();
      mapGraphics.fillStyle(theme.ground, 0.96).fillPoints(outline, true);
      mapGraphics.lineStyle(1, theme.contour, 0.72);
      mapGraphics.lineBetween(63, 117, 205, 108);
      mapGraphics.lineBetween(73, 151, 220, 147);
      mapGraphics.lineBetween(103, 187, 213, 174);

      if (region.id === 'southern-plains') {
        mapGraphics.lineStyle(1, theme.accent, 0.9);
        for (let x = 82; x <= 206; x += 14) {
          const y = 128 + ((x / 14) % 3) * 14;
          mapGraphics.lineBetween(x, y, x + 6, y - 3);
          mapGraphics.lineBetween(x + 4, y, x + 8, y - 6);
        }
        mapGraphics.lineStyle(1, 0xe0d2a4, 0.8).strokeCircle(166, 122, 7);
        mapGraphics.lineBetween(166, 129, 166, 150);
        mapGraphics.lineBetween(157, 150, 175, 150);
      } else if (region.id === 'prairie-pothole') {
        mapGraphics.fillStyle(theme.accent, 0.92);
        mapGraphics.fillEllipse(105, 137, 36, 13);
        mapGraphics.fillEllipse(174, 160, 46, 16);
        mapGraphics.lineStyle(1, theme.detail, 1);
        for (const x of [88, 94, 120, 153, 160, 195]) {
          mapGraphics.lineBetween(x, 128, x, 143);
          mapGraphics.lineBetween(x, 129, x + 3, 125);
        }
      } else if (region.id === 'north-woods') {
        mapGraphics.fillStyle(theme.accent, 0.96);
        for (const [x, y, s] of [[84, 144, 12], [105, 122, 15], [132, 154, 17], [160, 119, 14], [190, 145, 18]] as const) {
          mapGraphics.fillTriangle(x, y - s, x - s / 2, y + s / 2, x + s / 2, y + s / 2);
          mapGraphics.fillRect(x - 1, y + s / 2, 2, 5);
        }
        mapGraphics.lineStyle(2, theme.detail, 0.8).lineBetween(83, 177, 206, 120);
      } else if (region.id === 'great-basin') {
        mapGraphics.lineStyle(3, theme.accent, 0.9);
        mapGraphics.lineBetween(78, 139, 116, 127);
        mapGraphics.lineBetween(116, 127, 148, 134);
        mapGraphics.lineBetween(148, 134, 207, 117);
        mapGraphics.lineStyle(2, theme.detail, 0.85);
        mapGraphics.lineBetween(84, 154, 126, 145);
        mapGraphics.lineBetween(138, 165, 204, 148);
        mapGraphics.fillStyle(theme.accent, 1).fillRect(110, 169, 9, 5).fillRect(187, 174, 12, 6);
      } else if (region.id === 'sonoran-desert') {
        mapGraphics.fillStyle(theme.accent, 0.95);
        mapGraphics.fillTriangle(70, 161, 112, 119, 149, 161);
        mapGraphics.fillTriangle(121, 166, 177, 126, 219, 166);
        mapGraphics.fillStyle(theme.detail, 1);
        for (const [x, y] of [[92, 164], [156, 151], [196, 171]] as const) {
          mapGraphics.fillRect(x, y - 18, 4, 22);
          mapGraphics.fillRect(x - 5, y - 11, 6, 4);
          mapGraphics.fillRect(x + 3, y - 15, 6, 4);
        }
      } else if (region.id === 'high-rockies') {
        mapGraphics.fillStyle(theme.detail, 1);
        mapGraphics.fillTriangle(68, 175, 116, 108, 157, 175);
        mapGraphics.fillTriangle(120, 178, 176, 101, 224, 178);
        mapGraphics.fillStyle(theme.accent, 1);
        mapGraphics.fillTriangle(99, 132, 116, 108, 130, 132);
        mapGraphics.fillTriangle(156, 128, 176, 101, 192, 128);
      } else {
        // Pacific valleys: oak crowns and a cool river through golden hills.
        mapGraphics.lineStyle(4, theme.detail, 0.9);
        mapGraphics.beginPath().moveTo(83, 111).lineTo(119, 139).lineTo(146, 150).lineTo(203, 183).strokePath();
        mapGraphics.fillStyle(theme.accent, 1);
        for (const [x, y, r] of [[92, 159, 7], [125, 128, 8], [163, 171, 7], [199, 141, 9]] as const) {
          mapGraphics.fillCircle(x, y, r);
          mapGraphics.fillRect(x - 1, y + r - 1, 3, 8);
        }
      }
      mapGraphics.lineStyle(1, MENU.line, 1).strokePoints(outline, true);
    };

    const pins = REGIONS.map((region, index) => {
      const [x, y] = mapPoint(region.map.x, region.map.y);
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
      return { hit, dot };
    });

    const regionName = pixelText(this, 354, 94, '', 2, MENU.cream).setOrigin(0.5);
    regionName.setMaxWidth(204);
    const regionBlurb = pixelText(this, 354, 112, '', 1, MENU.sage).setOrigin(0.5);
    regionBlurb.setMaxWidth(202);
    this.add.rectangle(354, 145, 204, 45, MENU.ink, 0.87).setStrokeStyle(1, MENU.lineSoft);
    const areaName = pixelText(this, 296, 132, '', 1, MENU.cream);
    const opener = pixelText(this, 296, 145, '', 1, MENU.sage);
    const birdName = pixelText(this, 296, 158, '', 1, MENU.amberText);

    const birdIcon = this.add.graphics();
    const dogLine = pixelText(
      this,
      129,
      208,
      pendingDog ? `${pendingDog.name}'S HOME STARTS HERE` : 'YOUR KENNEL RIDES FROM HERE',
      1,
      MENU.sage,
    ).setOrigin(0.5);
    dogLine.setMaxWidth(200);

    const homeBox = this.add.rectangle(354, 215, 204, 27, MENU.olive, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => confirmHome());
    pixelText(this, 354, 215, 'MAKE THIS HOME  >', 1, MENU.cream).setOrigin(0.5);
    setMenuFocus(homeBox, true, true);

    this.add.rectangle(68, 226, 96, 23, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => goBack());
    pixelText(this, 68, 226, 'ESC  BACK', 1, MENU.cream).setOrigin(0.5);
    addFooterHint(this, '←→ CHOOSE REGION · ENTER MAKE HOME');

    const drawBird = (region: RegionConfig) => {
      const area = regionAreas(region)[0];
      const species = getSpecies(area.speciesMix[0].speciesId);
      birdIcon.clear();
      birdIcon.fillStyle(species.palette.body, 1).fillEllipse(354, 177, 15, 8);
      birdIcon.fillStyle(species.palette.head, 1).fillCircle(362, 174, 3);
      birdIcon.fillStyle(species.palette.tail, 1).fillTriangle(347, 176, 339, 172, 343, 180);
      birdIcon.lineStyle(1, 0xf2e5c5, 0.65).lineBetween(357, 181, 355, 187);
    };

    const refresh = () => {
      const region = REGIONS[selectedIndex];
      drawRegionMap(region);
      pins.forEach(({ dot }, index) => {
        const selected = index === selectedIndex;
        dot.setRadius(selected ? 5 : 3.5);
        dot.setFillStyle(selected ? MENU.amber : 0xa9b982, 1);
        dot.setStrokeStyle(selected ? 2 : 1, selected ? 0xf2e5c5 : MENU.ink);
      });
      const area = regionAreas(region)[0];
      const species = getSpecies(area.speciesMix[0].speciesId);
      regionName.setText(region.name.toUpperCase());
      regionBlurb.setText(region.blurb.toUpperCase());
      areaName.setText(`COVERT   ${area.name.toUpperCase()}`);
      opener.setText(`OPENER   ${weekLabel(areaOpenerWeek(area)).toUpperCase()}`);
      birdName.setText(`PRIMARY  ${species.name.toUpperCase()}`);
      drawBird(region);
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
