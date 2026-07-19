import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { AREAS, getArea } from '../game/areas';
import { BREEDS, getBreed, LEVEL_CAP } from '../game/breeds';
import {
  cycleId,
  loadQuickConfig,
  saveQuickConfig,
  WIND_CHOICES,
  type QuickConfig,
} from '../game/quick';
import { getSpecies } from '../game/species';

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
  private valueTexts: Phaser.GameObjects.Text[] = [];
  private hintTexts: Phaser.GameObjects.Text[] = [];
  private rows: PickerRow[] = [];

  constructor() {
    super('QuickScene');
  }

  create(): void {
    this.cfg = loadQuickConfig();
    this.valueTexts = [];
    this.hintTexts = [];

    this.add.rectangle(240, 135, 480, 270, 0x14201c);
    this.add
      .text(240, 22, 'quick hunt', { fontFamily: 'monospace', fontSize: '12px', color: '#ffd23f' })
      .setOrigin(0.5);
    this.add
      .text(240, 38, 'everything unlocked · nothing saved to your career', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#9fb896',
      })
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
    ];

    this.rows.forEach((row, i) => {
      const y = 70 + i * 38;
      this.add.text(70, y - 5, row.label, { fontFamily: 'monospace', fontSize: '10px', color: '#9fb896' });
      const arrow = (x: number, glyph: string, dir: 1 | -1) => {
        this.add
          .rectangle(x, y, 26, 26, 0x101410, 0.85)
          .setInteractive()
          .on('pointerdown', () => {
            unlockAudio();
            playBlip();
            row.step(dir);
            this.refresh();
          });
        this.add
          .text(x, y, glyph, { fontFamily: 'monospace', fontSize: '12px', color: '#dfe9d8' })
          .setOrigin(0.5);
      };
      arrow(160, '<', -1);
      const value = this.add
        .text(280, y - 6, '', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' })
        .setOrigin(0.5, 0);
      const hint = this.add
        .text(280, y + 7, '', { fontFamily: 'monospace', fontSize: '8px', color: '#c9dcc0' })
        .setOrigin(0.5, 0);
      this.valueTexts.push(value);
      this.hintTexts.push(hint);
      arrow(400, '>', 1);
    });

    const go = this.add
      .rectangle(240, 236, 150, 24, 0x3d7429)
      .setInteractive()
      .on('pointerdown', () => {
        unlockAudio();
        playBlip();
        saveQuickConfig(this.cfg);
        this.scene.start('FieldScene', { quick: { ...this.cfg } });
      });
    go.setStrokeStyle(1, 0x9fd88f);
    this.add
      .text(240, 236, 'hunt', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' })
      .setOrigin(0.5);

    const back = this.add
      .text(10, 252, '< title', { fontFamily: 'monospace', fontSize: '8px', color: '#9fb896' })
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
