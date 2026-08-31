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
import { pixelText, type PixelText } from './pixelFont';

interface PickerRow {
  label: string;
  value: () => string;
  hint?: () => string;
  step: (dir: 1 | -1) => void;
}

/**
 * Quick Hunt setup: everything unlocked, pick the exact hunt you want.
 * Career progression is untouched — this is free play (and the fastest way
 * to test any dog against any birds in any wind).
 */
export class QuickScene extends Phaser.Scene {
  private cfg!: QuickConfig;
  private valueTexts: PixelText[] = [];
  private hintTexts: PixelText[] = [];
  private rows: PickerRow[] = [];

  constructor() {
    super('QuickScene');
  }

  create(): void {
    this.cfg = loadQuickConfig();
    this.valueTexts = [];
    this.hintTexts = [];

    this.add.rectangle(240, 135, 480, 270, 0x14201c);
    pixelText(this, 240, 14, 'quick hunt', 2, '#ffd23f')
      .setOrigin(0.5);
    pixelText(this, 240, 29, 'everything unlocked · nothing saved to your career', 1, '#9fb896')
      .setOrigin(0.5);

    this.rows = [
      {
        label: 'dog',
        value: () => getBreed(this.cfg.breedId).name,
        hint: () => getBreed(this.cfg.breedId).blurb,
        step: (dir) => {
          this.cfg.breedId = cycleId(BREEDS.map((b) => b.id), this.cfg.breedId, dir);
        },
      },
      {
        label: 'dog 2',
        value: () => (this.cfg.breed2Id === 'none' ? 'none — hunt solo' : getBreed(this.cfg.breed2Id).name),
        hint: () => (this.cfg.breed2Id === 'none' ? '' : 'a brace: the second dog honors the point'),
        step: (dir) => {
          this.cfg.breed2Id = cycleId(['none', ...BREEDS.map((b) => b.id)], this.cfg.breed2Id, dir);
        },
      },
      {
        label: 'level',
        value: () => {
          const pips = '#'.repeat(this.cfg.level) + '-'.repeat(LEVEL_CAP - this.cfg.level);
          return `${this.cfg.level}  [${pips}]`;
        },
        hint: () => (this.cfg.level <= 2 ? 'puppy chaos' : this.cfg.level >= 9 ? 'finished dog' : ''),
        step: (dir) => {
          this.cfg.level = ((this.cfg.level - 1 + dir + LEVEL_CAP) % LEVEL_CAP) + 1;
        },
      },
      {
        label: 'covert',
        value: () => getArea(this.cfg.areaId).name,
        hint: () =>
          getArea(this.cfg.areaId)
            .speciesMix.map((s) => getSpecies(s.speciesId).name)
            .join(' · '),
        step: (dir) => {
          this.cfg.areaId = cycleId(AREAS.map((a) => a.id), this.cfg.areaId, dir);
        },
      },
      {
        label: 'wind',
        value: () => this.cfg.wind,
        step: (dir) => {
          this.cfg.wind = cycleId(WIND_CHOICES, this.cfg.wind, dir);
        },
      },
      {
        label: 'weather',
        value: () => this.cfg.weather,
        step: (dir) => {
          this.cfg.weather = cycleId(WEATHER_CHOICES, this.cfg.weather, dir);
        },
      },
      {
        label: 'gun',
        value: () => getGun(this.cfg.gunId).name,
        hint: () => getGun(this.cfg.gunId).blurb,
        step: (dir) => {
          this.cfg.gunId = cycleId(GUNS.map((g) => g.id), this.cfg.gunId, dir);
        },
      },
      {
        label: 'gear',
        value: () => GEAR_NAMES[this.cfg.gearTier],
        step: (dir) => {
          this.cfg.gearTier = (this.cfg.gearTier + dir + GEAR_NAMES.length) % GEAR_NAMES.length;
        },
      },
    ];

    this.rows.forEach((row, i) => {
      const y = 44 + i * 22;
      pixelText(this, 70, y - 5, row.label, 1, '#9fb896');
      const arrow = (x: number, glyph: string, dir: 1 | -1) => {
        this.add
          .rectangle(x, y, 26, 18, 0x101410, 0.85)
          .setInteractive()
          .on('pointerdown', () => {
            unlockAudio();
            playBlip();
            row.step(dir);
            this.refresh();
          });
        pixelText(this, x, y, glyph, 1, '#dfe9d8')
          .setOrigin(0.5);
      };
      arrow(160, '<', -1);
      const value = pixelText(this, 280, y - 6, '', 1, '#ffffff')
        .setOrigin(0.5, 0);
      const hint = pixelText(this, 280, y + 5, '', 1, '#c9dcc0')
        .setOrigin(0.5, 0);
      this.valueTexts.push(value);
      this.hintTexts.push(hint);
      arrow(400, '>', 1);
    });

    const go = this.add
      .rectangle(240, 250, 150, 24, 0x3d7429)
      .setInteractive()
      .on('pointerdown', () => {
        unlockAudio();
        playBlip();
        saveQuickConfig(this.cfg);
        launchHunt(this, { kind: 'quick' }, { quick: { ...this.cfg } });
      });
    go.setStrokeStyle(1, 0x9fd88f);
    pixelText(this, 240, 250, 'hunt', 1, '#ffffff')
      .setOrigin(0.5);

    const back = pixelText(this, 10, 252, '< title', 1, '#9fb896')
      .setInteractive();
    back.on('pointerdown', () => {
      unlockAudio();
      playBlip();
      saveQuickConfig(this.cfg);
      this.scene.start('TitleScene');
    });

    this.refresh();
  }

  private refresh(): void {
    this.rows.forEach((row, i) => {
      this.valueTexts[i].setText(row.value());
      this.hintTexts[i].setText(row.hint?.() ?? '');
    });
  }
}
