import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { BREEDS, DOG_NAMES, type BreedConfig } from '../game/breeds';
import { addDogToKennel, loadCareer, saveCareer, setActiveDog } from '../game/career';
import { pixelText, type PixelText } from './pixelFont';

const pips = (v: number) => '#'.repeat(v) + '-'.repeat(5 - v);

/**
 * Pick a breed, name the puppy. Runs on first launch (empty kennel) and
 * again whenever the kennel raises a new pup — the new dog becomes active.
 */
export class BreedScene extends Phaser.Scene {
  private fromKennel = false;
  private selected: BreedConfig | null = null;
  private selectedCell: Phaser.GameObjects.Rectangle | null = null;
  private confirmText!: PixelText;
  private chooseBtn!: Phaser.GameObjects.Rectangle;
  private chooseLabel!: PixelText;
  private gridObjects: Phaser.GameObjects.GameObject[] = [];
  private panelObjects: Phaser.GameObjects.GameObject[] = [];
  private puppyName = '';

  constructor() {
    super('BreedScene');
  }

  create(data: { fromKennel?: boolean } = {}): void {
    this.fromKennel = data.fromKennel ?? false;
    this.selected = null;
    this.selectedCell = null;
    this.gridObjects = [];
    this.panelObjects = [];

    const g = this.add.graphics();
    g.fillStyle(0x1c2b18).fillRect(0, 0, 480, 270);
    const header = pixelText(this, 240, 14, this.fromKennel ? 'choose your next bird dog' : 'choose your first bird dog', 2, '#ffd23f')
      .setOrigin(0.5);
    this.gridObjects.push(header);

    BREEDS.forEach((breed, i) => {
      const col = i < 6 ? 0 : 1;
      const row = i < 6 ? i : i - 6;
      const x = col === 0 ? 126 : 366;
      const y = 52 + row * 34;
      const cell = this.add.rectangle(x, y, 232, 30, 0x2a3d24).setInteractive();
      const s = breed.stats;
      const name = pixelText(this, x - 110, y - 13, breed.name, 1, '#ffffff');
      const stats1 = pixelText(this, x - 110, y - 2, `N${pips(s.nose)} Sp${pips(s.speed)} R${pips(s.range)}`, 1, '#9fb896');
      const stats2 = pixelText(this, x - 110, y + 8, `St${pips(s.steadiness)} Sa${pips(s.stamina)}`, 1, '#9fb896');
      cell.on('pointerdown', () => {
        unlockAudio();
        playBlip();
        this.select(breed, cell);
      });
      this.gridObjects.push(cell, name, stats1, stats2);
    });

    this.confirmText = pixelText(this, 240, 246, 'tap a breed', 1, '#dfe9d8')
      .setOrigin(0.5);
    this.chooseBtn = this.add.rectangle(420, 246, 104, 20, 0x101410, 0.85).setInteractive();
    this.chooseLabel = pixelText(this, 420, 246, 'choose', 1, '#ffd23f')
      .setOrigin(0.5);
    this.chooseBtn.on('pointerdown', () => {
      if (!this.selected) return;
      unlockAudio();
      playBlip();
      this.showNamePanel();
    });
    this.gridObjects.push(this.confirmText, this.chooseBtn, this.chooseLabel);

    this.buildNamePanel();
  }

  private select(breed: BreedConfig, cell: Phaser.GameObjects.Rectangle): void {
    this.selectedCell?.setFillStyle(0x2a3d24);
    this.selected = breed;
    this.selectedCell = cell;
    cell.setFillStyle(0x4a6b34);
    this.confirmText.setText(`${breed.name} — ${breed.blurb}`);
  }

  private buildNamePanel(): void {
    const title = pixelText(this, 240, 84, 'name your puppy', 2, '#ffd23f')
      .setOrigin(0.5)
      .setVisible(false);
    const nameText = pixelText(this, 240, 122, '', 2, '#ffffff')
      .setOrigin(0.5)
      .setVisible(false);
    const reroll = this.add.rectangle(178, 172, 110, 22, 0x101410, 0.85).setInteractive().setVisible(false);
    const rerollLabel = pixelText(this, 178, 172, 'new name', 1, '#dfe9d8')
      .setOrigin(0.5)
      .setVisible(false);
    const start = this.add.rectangle(306, 172, 110, 22, 0x4a6b34, 1).setInteractive().setVisible(false);
    const startLabel = pixelText(this, 306, 172, 'start hunting', 1, '#ffffff')
      .setOrigin(0.5)
      .setVisible(false);

    reroll.on('pointerdown', () => {
      unlockAudio();
      playBlip();
      this.puppyName = DOG_NAMES[Math.floor(Math.random() * DOG_NAMES.length)];
      nameText.setText(this.puppyName);
    });
    start.on('pointerdown', () => {
      if (!this.selected) return;
      unlockAudio();
      playBlip();
      const { career, dog } = addDogToKennel(loadCareer(), this.puppyName, this.selected.id);
      // A fresh pup always rides along next.
      const saved = setActiveDog(career, dog.id);
      saveCareer(saved);
      // A brand-new career picks its home ground before the first hunt.
      if (this.fromKennel) this.scene.start('KennelScene');
      else this.scene.start('MapScene', saved.homeRegionId === null ? { chooseHome: true } : {});
    });

    this.panelObjects.push(title, nameText, reroll, rerollLabel, start, startLabel);
    this.setGroupVisible(this.panelObjects, false);
  }

  /** Toggle visibility AND interactivity (hidden buttons must not take taps). */
  private setGroupVisible(objs: Phaser.GameObjects.GameObject[], visible: boolean): void {
    for (const o of objs) {
      (o as unknown as { setVisible: (v: boolean) => void }).setVisible(visible);
      const input = (o as unknown as { input?: { enabled: boolean } }).input;
      if (input) input.enabled = visible;
    }
  }

  private showNamePanel(): void {
    this.setGroupVisible(this.gridObjects, false);
    this.puppyName = DOG_NAMES[Math.floor(Math.random() * DOG_NAMES.length)];
    (this.panelObjects[1] as PixelText).setText(this.puppyName);
    this.setGroupVisible(this.panelObjects, true);
  }
}
