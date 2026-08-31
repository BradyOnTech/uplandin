import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { AREAS, getArea } from '../game/areas';
import { BREEDS, getBreed, LEVEL_CAP } from '../game/breeds';
import { getGun, GUNS } from '../game/guns';
import { GEAR_NAMES } from '../game/progression';
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
  preloadMenuArt,
  setMenuFocus,
} from './menuUi';
import { pixelText, type PixelText } from './pixelFont';

interface PickerRow {
  label: string;
  value: () => string;
  hint?: () => string;
  step: (dir: 1 | -1) => void;
}

interface RowView {
  box: Phaser.GameObjects.Rectangle;
  value: PixelText;
  hint: PixelText;
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
    this.cfg = loadQuickConfig();
    this.views = [];
    this.focusIndex = 0;

    addMenuBackdrop(this, 0.3);
    pixelText(this, 240, 21, 'QUICK HUNT', 3, MENU.cream).setOrigin(0.5);
    pixelText(this, 240, 45, '— EVERYTHING UNLOCKED. NOTHING SAVED. —', 1, MENU.sage).setOrigin(0.5);
    addMenuPanel(this, 240, 160, 458, 204, 0.96);

    this.rows = this.makeRows();
    addRuleHeading(this, 129, 65, 'COMPANIONS', 202);
    addRuleHeading(this, 351, 65, 'HUNT CONDITIONS', 202);

    const layouts = [
      { x: 129, y: 84 }, { x: 129, y: 114 }, { x: 129, y: 144 },
      { x: 351, y: 84 }, { x: 351, y: 114 }, { x: 351, y: 144 },
      { x: 129, y: 190 }, { x: 351, y: 190 },
    ];
    layouts.forEach((layout, i) => this.buildRow(this.rows[i], layout.x, layout.y, i));

    addRuleHeading(this, 240, 169, 'LOADOUT', 424);
    this.backBox = this.add.rectangle(78, 232, 108, 25, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.focusIndex = 8; this.refresh(); })
      .on('pointerdown', () => this.back());
    pixelText(this, 78, 232, 'ESC  BACK', 1, MENU.cream).setOrigin(0.5);

    this.huntBox = this.add.rectangle(365, 232, 174, 27, MENU.olive, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.focusIndex = 9; this.refresh(); })
      .on('pointerdown', () => this.hunt());
    pixelText(this, 365, 232, 'HUNT', 2, MENU.cream).setOrigin(0.5);
    pixelText(this, 240, 254, '↑↓ CHOOSE · ←→ CHANGE · ENTER SELECT', 1, MENU.muted).setOrigin(0.5);

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
        value: () => getBreed(this.cfg.breedId).name,
        hint: () => getBreed(this.cfg.breedId).blurb,
        step: (dir) => { this.cfg.breedId = cycleId(BREEDS.map((b) => b.id), this.cfg.breedId, dir); },
      },
      {
        label: 'DOG 2',
        value: () => this.cfg.breed2Id === 'none' ? 'NONE — HUNT SOLO' : getBreed(this.cfg.breed2Id).name,
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
        value: () => getGun(this.cfg.gunId).name,
        hint: () => getGun(this.cfg.gunId).blurb,
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
    const box = this.add.rectangle(x, y, 210, 27, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.focusIndex = index; this.refresh(); })
      .on('pointerdown', (pointer: Phaser.Input.Pointer) => this.changeRow(index, pointer.x < x ? -1 : 1));
    pixelText(this, x - 97, y, row.label, 1, MENU.sage).setOrigin(0, 0.5);
    pixelText(this, x - 48, y, '<', 1, MENU.cream).setOrigin(0.5);
    pixelText(this, x + 96, y, '>', 1, MENU.cream).setOrigin(0.5);
    const value = pixelText(this, x + 20, y - 6, '', 1, MENU.cream).setOrigin(0.5, 0);
    value.setMaxWidth(132);
    const hint = pixelText(this, x + 20, y + 6, '', 1, MENU.sage).setOrigin(0.5, 0).setScale(0.72);
    hint.setMaxWidth(180);
    this.views.push({ box, value, hint });
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
