import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { BREEDS, DOG_NAMES, type BreedConfig } from '../game/breeds';
import { addDogToKennel, loadCareer, saveCareer, setActiveDog } from '../game/career';
import { pixelText, type PixelText } from './pixelFont';
import {
  MENU,
  addDogPreview,
  addFooterHint,
  addMenuBackdrop,
  addMenuPanel,
  addRuleHeading,
  addStepHeader,
  learningPace,
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
}

const VISIBLE_BREEDS = 6;

function statPips(value: number): string {
  return `${'#'.repeat(value)}${'-'.repeat(5 - value)}`;
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
    pixelText(this, 240, 46, this.fromKennel ? 'CHOOSE YOUR NEXT BIRD DOG' : 'CHOOSE YOUR FIRST BIRD DOG', 2, MENU.cream)
      .setOrigin(0.5);
    pixelText(this, 240, 62, 'EVERY BREED CAN HUNT. PICK THE PARTNER THAT FITS YOUR STYLE.', 1, MENU.sage)
      .setOrigin(0.5);
    addMenuPanel(this, 240, 162, 458, 190, 0.96);
    addRuleHeading(this, 121, 76, 'BREEDS', 204);
    addRuleHeading(this, 351, 76, 'YOUR PARTNER', 218);

    for (let slot = 0; slot < VISIBLE_BREEDS; slot++) {
      const y = 91 + slot * 21;
      const box = this.add.rectangle(121, y, 204, 21, MENU.panelAlt, 0.98)
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
      const name = pixelText(this, 25, y, '', 1, MENU.cream).setOrigin(0, 0.5);
      this.listRows.push({ box, name });
    }

    this.dogPreview = this.add.image(351, 131, 'menu-dog-gsp', 4).setScale(1.9).setOrigin(0.5, 0.65);
    this.detailName = pixelText(this, 351, 91, '', 1, MENU.cream).setOrigin(0.5);
    this.detailName.setMaxWidth(210);
    this.detailBlurb = pixelText(this, 351, 102, '', 1, MENU.sage).setOrigin(0.5);
    this.statLines = ['NOSE', 'SPEED', 'RANGE', 'STEADINESS', 'STAMINA'].map((label, i) =>
      pixelText(this, 278, 151 + i * 10, `${label.padEnd(12)} -----`, 1, MENU.cream),
    );
    this.paceText = pixelText(this, 351, 204, '', 1, MENU.amberText).setOrigin(0.5);

    this.chooseBox = this.add.rectangle(351, 226, 210, 25, MENU.olive, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openNameScreen());
    pixelText(this, 351, 226, 'CHOOSE THIS BREED  >', 1, MENU.cream).setOrigin(0.5);

    this.add.rectangle(68, 226, 96, 23, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.goBack());
    pixelText(this, 68, 226, 'ESC  BACK', 1, MENU.cream).setOrigin(0.5);
    addFooterHint(this, '↑↓ BROWSE · PAGE UP/DOWN SCROLL · ENTER CHOOSE');
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
      if (!breed) return;
      row.name.setText(`${index === this.selectedIndex ? '>' : ' '} ${breed.name}`);
      setMenuFocus(row.box, index === this.selectedIndex, index === this.selectedIndex);
    });

    const breed = this.selectedBreed();
    const setter = breed.id === 'english-setter' || breed.id === 'irish-setter';
    this.dogPreview?.setTexture(setter ? 'menu-dog-setter' : 'menu-dog-gsp', 4);
    this.detailName?.setText(breed.name.toUpperCase());
    this.detailBlurb?.setText(breed.blurb.toUpperCase());
    const stats = breed.stats;
    const values = [stats.nose, stats.speed, stats.range, stats.steadiness, stats.stamina];
    const labels = ['NOSE', 'SPEED', 'RANGE', 'STEADINESS', 'STAMINA'];
    this.statLines.forEach((line, i) => line.setText(`${labels[i].padEnd(12)} ${statPips(values[i])}`));
    this.paceText?.setText(learningPace(breed));
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

    addMenuBackdrop(this, 0.31);
    addStepHeader(this, 2, 1);
    pixelText(this, 240, 47, 'NAME YOUR PUPPY', 2, MENU.cream).setOrigin(0.5);
    pixelText(this, 240, 63, 'THE NAME YOU WILL CALL ACROSS A THOUSAND ACRES.', 1, MENU.sage)
      .setOrigin(0.5);
    addMenuPanel(this, 240, 163, 458, 190, 0.96);

    addRuleHeading(this, 129, 79, breed.name.toUpperCase(), 208);
    addDogPreview(this, breed, 129, 151, 4.25);
    pixelText(this, 129, 204, breed.blurb.toUpperCase(), 1, MENU.sage).setOrigin(0.5);

    addRuleHeading(this, 351, 79, 'YOUR PUPPY', 208);
    this.add.rectangle(351, 122, 202, 45, MENU.ink, 0.94).setStrokeStyle(1, MENU.amber);
    const nameText = pixelText(this, 351, 122, this.puppyName.toUpperCase(), 3, MENU.cream).setOrigin(0.5);
    nameText.setMaxWidth(190);
    pixelText(this, 351, 150, 'SHORT NAMES CARRY FAR.', 1, MENU.sage).setOrigin(0.5);

    const reroll = this.add.rectangle(351, 176, 160, 23, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        unlockAudio();
        playBlip();
        this.rollName();
        nameText.setText(this.puppyName.toUpperCase());
      });
    pixelText(this, 351, 176, '*  NEW NAME', 1, MENU.cream).setOrigin(0.5);

    this.add.rectangle(351, 218, 202, 27, MENU.olive, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.confirmName());
    pixelText(this, 351, 218, this.fromKennel ? 'WELCOME TO THE KENNEL  >' : 'CONTINUE TO HOME GROUND  >', 1, MENU.cream)
      .setOrigin(0.5);

    this.add.rectangle(68, 226, 96, 23, MENU.panelAlt, 0.98)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        unlockAudio();
        playBlip();
        this.renderBreedScreen();
      });
    pixelText(this, 68, 226, 'ESC  BACK', 1, MENU.cream).setOrigin(0.5);
    addFooterHint(this, 'R NEW NAME · ENTER CONTINUE');
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
