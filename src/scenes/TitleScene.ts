import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { loadCareer } from '../game/career';
import { loadGameplayMode, saveGameplayMode, type GameplayMode } from '../game/gameplayMode';
import { pixelText, type PixelText } from './pixelFont';
import {
  MENU,
  addFooterHint,
  addMenuBackdrop,
  addMenuPanel,
  addRuleHeading,
  preloadMenuArt,
  setMenuFocus,
} from './menuUi';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  preload(): void {
    preloadMenuArt(this);
  }

  create(): void {
    const career = loadCareer();
    let mode: GameplayMode = loadGameplayMode();
    let choice = 0;

    addMenuBackdrop(this, 0.22);
    pixelText(this, 240, 38, 'UPLANDIN', 5, MENU.cream).setOrigin(0.5);
    pixelText(this, 240, 70, '— A RETRO BIRD HUNT —', 1, '#efad62').setOrigin(0.5);

    addMenuPanel(this, 240, 176, 286, 174, 0.95);
    addRuleHeading(this, 240, 101, 'GAMEPLAY MODE', 246, MENU.cream);

    const modeBoxes: Record<GameplayMode, Phaser.GameObjects.Rectangle> = {
      '2d': this.add.rectangle(185, 121, 104, 27, MENU.panelAlt, 0.98).setInteractive({ useHandCursor: true }),
      '3d': this.add.rectangle(295, 121, 104, 27, MENU.panelAlt, 0.98).setInteractive({ useHandCursor: true }),
    };
    const modeLabels: Record<GameplayMode, PixelText> = {
      '2d': pixelText(this, 185, 121, '2D CLASSIC', 1, MENU.cream).setOrigin(0.5),
      '3d': pixelText(this, 295, 121, '3D OPEN WORLD', 1, MENU.cream).setOrigin(0.5),
    };

    const stats = career.hunts > 0
      ? `${career.hunts} HUNTS · ${career.downed} DOWN · ${career.escaped} LOST`
      : 'NO HUNTS YET — YOUR DOG IS WAITING';
    pixelText(this, 240, 143, `★ ${stats}`, 1, MENU.sage).setOrigin(0.5);

    const entries = [
      {
        y: 174,
        label: 'CAREER',
        sub: 'RAISE YOUR DOG. WORK THE MAP.',
        go: () => this.scene.start(career.kennel.length === 0 ? 'BreedScene' : 'MapScene'),
      },
      {
        y: 214,
        label: 'QUICK HUNT',
        sub: 'EVERYTHING UNLOCKED. NOTHING SAVED.',
        go: () => this.scene.start('QuickScene'),
      },
    ];
    const entryBoxes = entries.map((entry, i) => {
      const box = this.add.rectangle(240, entry.y, 246, 34, MENU.panelAlt, 0.98)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          choice = i;
          refresh();
        })
        .on('pointerdown', () => activate(i));
      pixelText(this, 134, entry.y - 7, entry.label, 2, MENU.cream).setOrigin(0, 0.5);
      pixelText(this, 134, entry.y + 9, entry.sub, 1, MENU.sage).setOrigin(0, 0.5);
      pixelText(this, 350, entry.y, '>', 2, MENU.amberText).setOrigin(0.5);
      return box;
    });

    const selectMode = (next: GameplayMode) => {
      unlockAudio();
      playBlip();
      mode = next;
      saveGameplayMode(mode);
      refresh();
    };
    modeBoxes['2d'].on('pointerdown', () => selectMode('2d'));
    modeBoxes['3d'].on('pointerdown', () => selectMode('3d'));

    const activate = (index: number) => {
      unlockAudio();
      playBlip();
      entries[index].go();
    };
    const refresh = () => {
      (['2d', '3d'] as const).forEach((candidate) => {
        const selected = candidate === mode;
        setMenuFocus(modeBoxes[candidate], selected, selected);
        modeLabels[candidate].setColor(selected ? MENU.cream : MENU.sage);
      });
      entryBoxes.forEach((box, i) => setMenuFocus(box, i === choice, false));
    };

    addFooterHint(this, '←→ MODE · ↑↓ CHOOSE · ENTER SELECT');
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        selectMode(mode === '2d' ? '3d' : '2d');
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        choice = choice === 0 ? 1 : 0;
        playBlip();
        refresh();
      } else if (event.key === 'Enter' || event.key === ' ') {
        activate(choice);
      }
    });

    refresh();
  }
}
