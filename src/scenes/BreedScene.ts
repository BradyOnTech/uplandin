import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { BREEDS, DOG_NAMES, type BreedConfig } from '../game/breeds';
import { addDogToKennel, loadCareer, saveCareer, setActiveDog } from '../game/career';
import { pixelText, type PixelText } from './pixelFont';
import {
  MENU,
  addDogPreview,
  addFooterHint,
  addImageFrame,
  addMenuBackdrop,
  addMenuPanel,
  addRuleHeading,
  addStepHeader,
  learningPace,
  menuCopy,
  menuTitle,
  preloadMenuArt,
  setMenuFocus,
} from './menuUi';

interface PendingDog {
  breedId: string;
  name: string;
}

interface BreedSceneData {
  fromKennel?: boolean;
  /** Returned by the Home Ground screen when the player backs up a step. */
  resume?: PendingDog;
}

interface BreedListRow {
  box: Phaser.GameObjects.Rectangle;
  name: PixelText;
  portrait: Phaser.GameObjects.Image;
}

const VISIBLE_BREEDS = 6;

function statPips(value: number): string {
  return `${'#'.repeat(value)}${'-'.repeat(5 - value)}`;
}

function displayBreedName(name: string): string {
  const upper = name.toUpperCase();
  if (upper.length <= 18) return upper;
  const words = upper.split(' ');
  let best = 1;
  let difference = Infinity;
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ').length;
    const right = words.slice(i).join(' ').length;
    if (Math.abs(left - right) < difference) {
      difference = Math.abs(left - right);
      best = i;
    }
  }
  return `${words.slice(0, best).join(' ')}\n${words.slice(best).join(' ')}`;
}

/** Career creation: choose a breed, name the puppy, then choose home ground. */
export class BreedScene extends Phaser.Scene {
  private fromKennel = false;
  private phase: 'breed' | 'name' = 'breed';
  private selectedIndex = 0;
  private listStart = 0;
  private puppyName = '';
  private listRows: BreedListRow[] = [];
  private dogPreview?: Phaser.GameObjects.Image;
  private detailName?: PixelText;
  private detailBlurb?: PixelText;
  private statLines: PixelText[] = [];
  private paceText?: PixelText;
  private chooseBox?: Phaser.GameObjects.Rectangle;

  constructor() {
    super('BreedScene');
  }

  preload(): void {
    preloadMenuArt(this);
  }

  create(data: BreedSceneData = {}): void {
    this.fromKennel = data.fromKennel ?? false;
    this.selectedIndex = data.resume
      ? Math.max(0, BREEDS.findIndex((breed) => breed.id === data.resume?.breedId))
      : 0;
    this.listStart = Math.max(0, Math.min(this.selectedIndex, BREEDS.length - VISIBLE_BREEDS));
    this.puppyName = data.resume?.name ?? '';
    this.phase = data.resume ? 'name' : 'breed';

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => this.handleKey(event));
    if (this.phase === 'name') this.renderNameScreen();
    else this.renderBreedScreen();
  }

  private selectedBreed(): BreedConfig {
    return BREEDS[this.selectedIndex];
  }

  private renderBreedScreen(): void {
    this.phase = 'breed';
    this.children.removeAll(true);
    this.listRows = [];
    this.statLines = [];

    addMenuBackdrop(this, 0.31);
    addStepHeader(this, 1);
    menuTitle(this, 240, 45, this.fromKennel ? 'CHOOSE YOUR NEXT BIRD DOG' : 'CHOOSE YOUR FIRST BIRD DOG', 27, 430);
    pixelText(this, 240, 61, '—  BREED SHAPES HOW YOUR DOG HUNTS AND GROWS.  —', 1, MENU.sage)
      .setOrigin(0.5);
    addMenuPanel(this, 240, 160, 384, 190, 0.97);
    addRuleHeading(this, 129, 77, 'BREEDS', 144);

    for (let slot = 0; slot < VISIBLE_BREEDS; slot++) {
      const y = 91 + slot * 22;
      const box = this.add.rectangle(129, y, 144, 20, MENU.panelAlt, 0.98)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          const index = this.listStart + slot;
          if (index < BREEDS.length) {
            this.selectedIndex = index;
            this.refreshBreedScreen();
          }
        })
        .on('pointerdown', () => {
          unlockAudio();
          playBlip();
          const index = this.listStart + slot;
          if (index < BREEDS.length) {
            this.selectedIndex = index;
            this.refreshBreedScreen();
          }
        });
      const portrait = this.add.image(68, y, 'menu-dog-thumb-gsp').setDisplaySize(19, 19);
      const name = menuCopy(this, 82, y, '', MENU.cream, 7).setOrigin(0, 0.5);
      this.listRows.push({ box, name, portrait });
    }

    addImageFrame(this, 276, 136, 112, 116, MENU.line);
    this.detailName = pixelText(this, 337, 84, '', 1, MENU.cream).setOrigin(0, 0);
    this.detailName.setMaxWidth(88);
    this.detailBlurb = menuCopy(this, 337, 110, '', MENU.sage, 6).setOrigin(0, 0);
    this.statLines = ['NOSE', 'SPEED', 'RANGE', 'STEADINESS', 'STAMINA'].map((label, i) =>
      menuCopy(this, 337, 133 + i * 13, `${label.padEnd(11)} -----`, MENU.cream, 6),
    );
    this.paceText = menuCopy(this, 276, 204, '', MENU.sage, 7).setOrigin(0.5);

    this.chooseBox = this.add.rectangle(354, 237, 145, 23, MENU.olive, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openNameScreen());
    pixelText(this, 354, 237, 'CHOOSE THIS BREED', 1, MENU.cream).setOrigin(0.5);

    this.add.rectangle(84, 238, 64, 21, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.goBack());
    menuCopy(this, 84, 238, 'ESC  BACK', MENU.cream, 7).setOrigin(0.5);
    menuCopy(this, 129, 218, '1–6 OF 11', MENU.sage, 7).setOrigin(0.5);
    addFooterHint(this, '↑↓ BROWSE  ·  PAGE UP/DOWN SCROLL  ·  ENTER CHOOSE');
    this.refreshBreedScreen();
  }

  private refreshBreedScreen(): void {
    if (this.selectedIndex < this.listStart) this.listStart = this.selectedIndex;
    if (this.selectedIndex >= this.listStart + VISIBLE_BREEDS) {
      this.listStart = this.selectedIndex - VISIBLE_BREEDS + 1;
    }

    this.listRows.forEach((row, slot) => {
      const index = this.listStart + slot;
      const breed = BREEDS[index];
      row.box.setVisible(Boolean(breed));
      row.name.setVisible(Boolean(breed));
      row.portrait.setVisible(Boolean(breed));
      if (!breed) return;
      row.portrait.setTexture(`menu-dog-thumb-${breed.id}`);
      row.name.setText(breed.name);
      row.name.setScale(1);
      if (row.name.width > 116) row.name.setScale(116 / row.name.width, 1);
      setMenuFocus(row.box, index === this.selectedIndex, index === this.selectedIndex);
    });

    const breed = this.selectedBreed();
    this.dogPreview?.destroy(true);
    this.dogPreview = addDogPreview(this, breed, 276, 136, 108, 112);
    this.detailName?.setText(displayBreedName(breed.name));
    this.detailBlurb?.setText(breed.blurb.toUpperCase());
    if (this.detailBlurb) {
      this.detailBlurb.setScale(1);
      if (this.detailBlurb.width > 91) this.detailBlurb.setScale(91 / this.detailBlurb.width, 1);
    }
    const stats = breed.stats;
    const values = [stats.nose, stats.speed, stats.range, stats.steadiness, stats.stamina];
    const labels = ['NOSE', 'SPEED', 'RANGE', 'STEADINESS', 'STAMINA'];
    this.statLines.forEach((line, i) => line.setText(`${labels[i].padEnd(12)} ${statPips(values[i])}`));
    this.paceText?.setText(learningPace(breed));
    if (this.paceText) {
      this.paceText.setScale(1);
      if (this.paceText.width > 110) this.paceText.setScale(110 / this.paceText.width, 1);
    }
    if (this.chooseBox) setMenuFocus(this.chooseBox, true, true);
  }

  private openNameScreen(): void {
    unlockAudio();
    playBlip();
    if (!this.puppyName) this.rollName();
    this.renderNameScreen();
  }

  private renderNameScreen(): void {
    this.phase = 'name';
    this.children.removeAll(true);
    const breed = this.selectedBreed();

    addMenuBackdrop(this, 0.27);
    addStepHeader(this, 2, 1);
    menuTitle(this, 240, 43, 'NAME YOUR PUPPY', 30, 300);
    pixelText(this, 240, 60, "—  YOU'LL SHARE MANY SEASONS TOGETHER.  —", 1, MENU.sage)
      .setOrigin(0.5);
    addMenuPanel(this, 234, 157, 352, 184, 0.97);

    addImageFrame(this, 151, 130, 170, 116, MENU.amber);
    addDogPreview(this, breed, 151, 130, 168, 114);
    menuCopy(this, 151, 197, '—  YOUR FIRST PARTNER  —', MENU.sage, 7).setOrigin(0.5);
    pixelText(this, 151, 210, breed.name.toUpperCase(), 1, MENU.cream).setOrigin(0.5).setMaxWidth(165);
    menuCopy(this, 151, 222, breed.blurb, MENU.sage, 7).setOrigin(0.5);

    addRuleHeading(this, 324, 84, 'PUPPY NAME', 132);
    this.add.rectangle(324, 115, 138, 38, MENU.olive, 0.96).setStrokeStyle(1, MENU.amber);
    const nameText = menuTitle(this, 324, 115, this.puppyName.toUpperCase(), 25, 126);

    const reroll = this.add.rectangle(324, 166, 116, 22, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        unlockAudio();
        playBlip();
        this.rollName();
        nameText.setText(this.puppyName.toUpperCase());
      });
    pixelText(this, 324, 166, 'NEW NAME  *', 1, MENU.cream).setOrigin(0.5);

    this.add.rectangle(324, 219, 124, 23, MENU.olive, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.confirmName());
    pixelText(this, 324, 219, this.fromKennel ? 'WELCOME TO KENNEL' : 'CONTINUE', 1, MENU.cream)
      .setOrigin(0.5);

    this.add.rectangle(91, 238, 62, 20, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        unlockAudio();
        playBlip();
        this.renderBreedScreen();
      });
    menuCopy(this, 91, 238, 'ESC  BACK', MENU.cream, 7).setOrigin(0.5);
    addFooterHint(this, 'R NEW NAME  ·  ENTER CONTINUE');
    setMenuFocus(reroll, false);
  }

  private rollName(): void {
    const current = this.puppyName;
    const alternatives = DOG_NAMES.filter((name) => name !== current);
    this.puppyName = alternatives[Math.floor(Math.random() * alternatives.length)] ?? DOG_NAMES[0];
  }

  private confirmName(): void {
    unlockAudio();
    playBlip();
    const pending: PendingDog = { breedId: this.selectedBreed().id, name: this.puppyName };
    if (!this.fromKennel) {
      // Career creation remains transactional until the final setup step.
      this.scene.start('MapScene', { chooseHome: true, newDog: pending });
      return;
    }

    const { career, dog } = addDogToKennel(loadCareer(), pending.name, pending.breedId);
    saveCareer(setActiveDog(career, dog.id));
    this.scene.start('KennelScene');
  }

  private goBack(): void {
    unlockAudio();
    playBlip();
    this.scene.start(this.fromKennel ? 'KennelScene' : 'TitleScene');
  }

  private handleKey(event: KeyboardEvent): void {
    if (this.phase === 'name') {
      if (event.key === 'Escape') {
        playBlip();
        this.renderBreedScreen();
      } else if (event.key.toLowerCase() === 'r') {
        this.rollName();
        this.renderNameScreen();
        playBlip();
      } else if (event.key === 'Enter' || event.key === ' ') {
        this.confirmName();
      }
      return;
    }

    if (event.key === 'Escape') {
      this.goBack();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const dir = event.key === 'ArrowUp' ? -1 : 1;
      this.selectedIndex = (this.selectedIndex + dir + BREEDS.length) % BREEDS.length;
      playBlip();
      this.refreshBreedScreen();
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const dir = event.key === 'PageUp' ? -VISIBLE_BREEDS : VISIBLE_BREEDS;
      this.selectedIndex = Phaser.Math.Clamp(this.selectedIndex + dir, 0, BREEDS.length - 1);
      playBlip();
      this.refreshBreedScreen();
    } else if (event.key === 'Enter' || event.key === ' ') {
      this.openNameScreen();
    }
  }
}
