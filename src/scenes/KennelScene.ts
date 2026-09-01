import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { getBreed } from '../game/breeds';
import { dogAge, loadCareer, saveCareer, setActiveDog, setBraceDog } from '../game/career';
import { kennelSlots, TWO_DOG_LEVEL, twoDogUnlocked } from '../game/progression';
import { ageLabel } from '../game/season';
import { pixelText } from './pixelFont';
import { configureLogicalViewport } from './logicalViewport';

/**
 * The kennel: every dog you've raised. Tap one to bring it on the next
 * hunt; raise a new puppy when the dog box has room (1 → 3 → 5 slots as
 * the hunter levels).
 */
export class KennelScene extends Phaser.Scene {
  constructor() {
    super('KennelScene');
  }

  create(): void {
    configureLogicalViewport(this);
    const career = loadCareer();
    const slots = kennelSlots(career.hunter.level);

    this.add.rectangle(240, 135, 480, 270, 0x14201c);
    pixelText(this, 240, 20, 'the kennel', 2, '#ffd23f')
      .setOrigin(0.5);
    const braceNote = twoDogUnlocked(career.hunter.level)
      ? ' · brace unlocked'
      : ` · brace at hunter lv ${TWO_DOG_LEVEL}`;
    pixelText(this, 240, 36, `dog box: ${career.kennel.length}/${slots} slots · hunter lv ${career.hunter.level}${braceNote}`, 1, '#9fb896')
      .setOrigin(0.5);

    const canBrace = twoDogUnlocked(career.hunter.level) && career.kennel.length >= 2;

    career.kennel.forEach((dog, i) => {
      const y = 62 + i * 36;
      const active = dog.id === career.activeDogId;
      const braced = dog.id === career.braceDogId;
      const card = this.add
        .rectangle(240, y, 400, 30, active ? 0x2c4a24 : 0x101410, 0.9)
        .setStrokeStyle(1, active ? 0xffd23f : braced ? 0xa8d4e8 : 0x3a4a3a)
        .setInteractive();
      const tag = active ? '  ★ riding along' : braced ? '  ☆ bracemate' : '';
      pixelText(this, 52, y - 11, `${dog.name}${tag}`, 1, active ? '#ffd23f' : braced ? '#a8d4e8' : '#ffffff');
      const toNext = dog.level >= 10 ? 'maxed' : `${dog.xp} xp`;
      pixelText(this, 52, y + 1, `${getBreed(dog.breedId).name} · lv ${dog.level} · ${toNext} · ${ageLabel(dogAge(career, dog))}`, 1, '#dfe9d8');
      card.on('pointerdown', () => {
        unlockAudio();
        playBlip();
        saveCareer(setActiveDog(career, dog.id));
        this.scene.restart();
      });
      // Two-dog hunting: mark a non-lead dog as the bracemate.
      if (canBrace && !active) {
        this.add
          .rectangle(410, y, 52, 18, 0x101a26, 0.9)
          .setStrokeStyle(1, braced ? 0xa8d4e8 : 0x44505c)
          .setInteractive()
          .on('pointerdown', () => {
            unlockAudio();
            playBlip();
            saveCareer(setBraceDog(career, braced ? null : dog.id));
            this.scene.restart();
          });
        pixelText(this, 410, y, braced ? 'unbrace' : 'brace', 1, '#ffffff')
          .setOrigin(0.5);
      }
    });

    if (career.kennel.length < slots) {
      const y = 62 + career.kennel.length * 36;
      this.add
        .rectangle(240, y, 400, 30, 0x1c2b18, 0.9)
        .setStrokeStyle(1, 0x9fd88f)
        .setInteractive()
        .on('pointerdown', () => {
          unlockAudio();
          playBlip();
          this.scene.start('BreedScene', { fromKennel: true });
        });
      pixelText(this, 240, y, '+ raise a new puppy', 1, '#9fd88f')
        .setOrigin(0.5);
    } else if (career.kennel.length >= slots && slots < 5) {
      pixelText(this, 240, 62 + career.kennel.length * 36, 'a bigger dog box comes with hunter levels', 1, '#5a6a78')
        .setOrigin(0.5);
    }

    const back = pixelText(this, 10, 252, '< map', 1, '#9fb896')
      .setInteractive();
    back.on('pointerdown', () => {
      unlockAudio();
      playBlip();
      this.scene.start('MapScene');
    });
  }
}
