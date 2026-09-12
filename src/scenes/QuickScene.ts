import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { AREAS, getArea } from '../game/areas';
import { BREEDS, getBreed, LEVEL_CAP } from '../game/breeds';
import { getGun, GUNS } from '../game/guns';
import { GEAR_NAMES } from '../game/progression';
import { regionOfArea } from '../game/regions';
import {
  cycleId,
  loadQuickConfig,
  saveQuickConfig,
  WEATHER_CHOICES,
  WIND_CHOICES,
  type QuickConfig,
} from '../game/quick';
import { getSpecies } from '../game/species';
import { launchHunt } from './launchHunt';
import {
  MENU,
  addMenuBackdrop,
  addMenuPanel,
  addRuleHeading,
  menuCopy,
  menuTitle,
  preloadMenuArt,
  setMenuFocus,
  type MenuText,
} from './menuUi';
import { configureLogicalViewport } from './logicalViewport';

interface PickerRow {
  label: string;
  value: () => string;
  hint?: () => string;
  step: (dir: 1 | -1) => void;
}

interface RowView {
  box: Phaser.GameObjects.Rectangle;
  value: MenuText;
  hint: MenuText;
  art?: Phaser.GameObjects.Image;
}

function quickBreedName(id: string): string {
  const names: Record<string, string> = {
    gsp: 'GERMAN SHORTHAIR',
    gwp: 'GERMAN WIREHAIR',
    griffon: 'WIREHAIRED GRIFFON',
  };
  return names[id] ?? getBreed(id).name;
}

function quickGunName(id: string): string {
  const names: Record<string, string> = {
    'remington-870': 'REMINGTON 870',
    'side-by-side': 'RFM VENUS',
  };
  return names[id] ?? getGun(id).name;
}

function fitRowText(text: MenuText, maxWidth: number): void {
  text.setScale(1);
  if (text.width > maxWidth) text.setScale(maxWidth / text.width, 1);
}

export class QuickScene extends Phaser.Scene {
  private cfg!: QuickConfig;
  private rows: PickerRow[] = [];
  private views: RowView[] = [];
  private focusIndex = 0;
  private backBox!: Phaser.GameObjects.Rectangle;
  private huntBox!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('QuickScene');
  }

  preload(): void {
    preloadMenuArt(this);
  }

  create(): void {
    configureLogicalViewport(this);
    this.cfg = loadQuickConfig();
    this.views = [];
    this.focusIndex = 0;

    addMenuBackdrop(this, 0.3);
    menuTitle(this, 240, 35, 'QUICK HUNT', 38, 245);
    menuCopy(this, 240, 60, '—  EVERYTHING UNLOCKED. NOTHING SAVED.  —', MENU.sage, 7).setOrigin(0.5);
    addMenuPanel(this, 240, 153, 370, 171, 0.97);

    this.rows = this.makeRows();
    addRuleHeading(this, 147, 79, 'COMPANIONS', 170);
    addRuleHeading(this, 333, 79, 'HUNT CONDITIONS', 170);

    const layouts = [
      { x: 147, y: 99 }, { x: 147, y: 126 }, { x: 147, y: 153 },
      { x: 333, y: 99 }, { x: 333, y: 126 }, { x: 333, y: 153 },
      { x: 147, y: 193 }, { x: 333, y: 193 },
    ];
    layouts.forEach((layout, i) => this.buildRow(this.rows[i], layout.x, layout.y, i));

    addRuleHeading(this, 240, 172, 'LOADOUT', 356);
    this.backBox = this.add.rectangle(105, 222, 90, 22, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.focusIndex = 8; this.refresh(); })
      .on('pointerdown', () => this.back());
    menuCopy(this, 105, 222, 'ESC  BACK', MENU.cream, 8).setOrigin(0.5);

    this.huntBox = this.add.rectangle(352, 222, 126, 24, MENU.olive, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.focusIndex = 9; this.refresh(); })
      .on('pointerdown', () => this.hunt());
    menuCopy(this, 352, 222, 'HUNT', MENU.cream, 15).setOrigin(0.5);
    menuCopy(this, 240, 257, '↑↓ CHOOSE  ·  ←→ CHANGE  ·  ENTER SELECT', MENU.muted, 7).setOrigin(0.5);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.back();
      } else if (event.key === 'ArrowUp') {
        this.focusIndex = (this.focusIndex + 9) % 10;
        playBlip();
        this.refresh();
      } else if (event.key === 'ArrowDown') {
        this.focusIndex = (this.focusIndex + 1) % 10;
        playBlip();
        this.refresh();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (this.focusIndex < this.rows.length) {
          this.changeRow(this.focusIndex, event.key === 'ArrowLeft' ? -1 : 1);
        } else {
          this.focusIndex = this.focusIndex === 8 ? 9 : 8;
          playBlip();
          this.refresh();
        }
      } else if (event.key === 'Enter' || event.key === ' ') {
        if (this.focusIndex < this.rows.length) this.changeRow(this.focusIndex, 1);
        else if (this.focusIndex === 8) this.back();
        else this.hunt();
      }
    });

    this.refresh();
  }

  private makeRows(): PickerRow[] {
    return [
      {
        label: 'DOG',
        value: () => quickBreedName(this.cfg.breedId),
        hint: () => getBreed(this.cfg.breedId).blurb,
        step: (dir) => { this.cfg.breedId = cycleId(BREEDS.map((b) => b.id), this.cfg.breedId, dir); },
      },
      {
        label: 'DOG 2',
        value: () => this.cfg.breed2Id === 'none' ? 'NONE — HUNT SOLO' : quickBreedName(this.cfg.breed2Id),
        hint: () => this.cfg.breed2Id === 'none' ? '' : 'SECOND DOG HONORS THE POINT',
        step: (dir) => {
          this.cfg.breed2Id = cycleId(['none', ...BREEDS.map((b) => b.id)], this.cfg.breed2Id, dir);
        },
      },
      {
        label: 'LEVEL',
        value: () => `${this.cfg.level}  [${'#'.repeat(this.cfg.level)}${'-'.repeat(LEVEL_CAP - this.cfg.level)}]`,
        hint: () => this.cfg.level <= 2 ? 'PUPPY CHAOS' : this.cfg.level >= 9 ? 'FINISHED DOG' : '',
        step: (dir) => { this.cfg.level = ((this.cfg.level - 1 + dir + LEVEL_CAP) % LEVEL_CAP) + 1; },
      },
      {
        label: 'COVERT',
        value: () => getArea(this.cfg.areaId).name,
        hint: () => getArea(this.cfg.areaId).speciesMix
          .slice(0, 2)
          .map((mix) => getSpecies(mix.speciesId).name)
          .join(' · '),
        step: (dir) => { this.cfg.areaId = cycleId(AREAS.map((a) => a.id), this.cfg.areaId, dir); },
      },
      {
        label: 'WIND',
        value: () => this.cfg.wind,
        step: (dir) => { this.cfg.wind = cycleId(WIND_CHOICES, this.cfg.wind, dir); },
      },
      {
        label: 'WEATHER',
        value: () => this.cfg.weather,
        step: (dir) => { this.cfg.weather = cycleId(WEATHER_CHOICES, this.cfg.weather, dir); },
      },
      {
        label: 'GUN',
        value: () => quickGunName(this.cfg.gunId),
        hint: () => {
          const gun = getGun(this.cfg.gunId);
          const action = gun.cooldownMs === 0 ? 'DOUBLE' : gun.cooldownMs <= 250 ? 'QUICK' : 'PUMP';
          return `${gun.shells} SHELLS · ${action}`;
        },
        step: (dir) => { this.cfg.gunId = cycleId(GUNS.map((gun) => gun.id), this.cfg.gunId, dir); },
      },
      {
        label: 'GEAR',
        value: () => GEAR_NAMES[this.cfg.gearTier],
        step: (dir) => {
          this.cfg.gearTier = (this.cfg.gearTier + dir + GEAR_NAMES.length) % GEAR_NAMES.length;
        },
      },
    ];
  }

  private buildRow(row: PickerRow, x: number, y: number, index: number): void {
    const box = this.add.rectangle(x, y, 170, 24, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.focusIndex = index; this.refresh(); })
      .on('pointerdown', (pointer: Phaser.Input.Pointer) => this.changeRow(index, pointer.worldX < x ? -1 : 1));
    const rowLabel = menuCopy(this, x - 80, y, row.label, MENU.sage, 7).setOrigin(0, 0.5);
    if (rowLabel.width > 30) rowLabel.setScale(30 / rowLabel.width, 1);
    menuCopy(this, x - 44, y, '‹', MENU.cream, 13).setOrigin(0.5);
    menuCopy(this, x + 78, y, '›', MENU.cream, 13).setOrigin(0.5);
    let art: Phaser.GameObjects.Image | undefined;
    if (index === 0) art = this.add.image(x - 18, y, `menu-dog-thumb-${this.cfg.breedId}`).setDisplaySize(23, 23);
    if (index === 3) art = this.add.image(x - 18, y, `menu-region-${regionOfArea(this.cfg.areaId).id}`).setDisplaySize(23, 23);
    if (index === 6) art = this.add.image(x - 29, y - 5, 'menu-shotgun').setDisplaySize(27, 12);
    const valueX = art ? x + 30 : x + 15;
    const value = menuCopy(this, valueX, y - 7, '', MENU.cream, art ? 6 : 7).setOrigin(0.5, 0);
    const hint = menuCopy(this, valueX, y + 3, '', MENU.sage, 5).setOrigin(0.5, 0);
    this.views.push({ box, value, hint, art });
  }

  private changeRow(index: number, dir: 1 | -1): void {
    unlockAudio();
    playBlip();
    this.rows[index].step(dir);
    this.refresh();
  }

  private refresh(): void {
    this.rows.forEach((row, i) => {
      this.views[i].value.setText(row.value());
      this.views[i].hint.setText(row.hint?.() ?? '');
      fitRowText(this.views[i].value, this.views[i].art ? 82 : 112);
      fitRowText(this.views[i].hint, this.views[i].art ? 84 : 112);
      if (i === 0) this.views[i].art?.setTexture(`menu-dog-thumb-${this.cfg.breedId}`);
      if (i === 3) {
        this.views[i].art?.setTexture(`menu-region-${regionOfArea(this.cfg.areaId).id}`);
      }
      setMenuFocus(this.views[i].box, this.focusIndex === i);
    });
    setMenuFocus(this.backBox, this.focusIndex === 8);
    setMenuFocus(this.huntBox, this.focusIndex === 9, true);
  }

  private back(): void {
    unlockAudio();
    playBlip();
    saveQuickConfig(this.cfg);
    this.scene.start('TitleScene');
  }

  private hunt(): void {
    unlockAudio();
    playBlip();
    saveQuickConfig(this.cfg);
    launchHunt(this, { kind: 'quick' }, { quick: { ...this.cfg } });
  }
}
