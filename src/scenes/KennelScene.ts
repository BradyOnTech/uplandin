import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { getBreed } from '../game/breeds';
import { loadCareer, saveCareer, setActiveDog } from '../game/career';
import { kennelSlots } from '../game/progression';

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
    const career = loadCareer();
    const slots = kennelSlots(career.hunter.level);

    this.add.rectangle(240, 135, 480, 270, 0x14201c);
    this.add
      .text(240, 20, 'the kennel', { fontFamily: 'monospace', fontSize: '12px', color: '#ffd23f' })
      .setOrigin(0.5);
    this.add
      .text(240, 36, `dog box: ${career.kennel.length}/${slots} slots · hunter lv ${career.hunter.level}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#9fb896',
      })
      .setOrigin(0.5);

    career.kennel.forEach((dog, i) => {
      const y = 62 + i * 36;
      const active = dog.id === career.activeDogId;
      const card = this.add
        .rectangle(240, y, 400, 30, active ? 0x2c4a24 : 0x101410, 0.9)
        .setStrokeStyle(1, active ? 0xffd23f : 0x3a4a3a)
        .setInteractive();
      this.add.text(52, y - 11, `${dog.name}${active ? '  ★ riding along' : ''}`, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: active ? '#ffd23f' : '#ffffff',
      });
      const toNext = dog.level >= 10 ? 'maxed' : `${dog.xp} xp`;
      this.add.text(52, y + 1, `${getBreed(dog.breedId).name} · lv ${dog.level} · ${toNext}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#dfe9d8',
      });
      card.on('pointerdown', () => {
        unlockAudio();
        playBlip();
        saveCareer(setActiveDog(career, dog.id));
        this.scene.restart();
      });
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
      this.add
        .text(240, y, '+ raise a new puppy', { fontFamily: 'monospace', fontSize: '9px', color: '#9fd88f' })
        .setOrigin(0.5);
    } else if (career.kennel.length >= slots && slots < 5) {
      this.add
        .text(240, 62 + career.kennel.length * 36, 'a bigger dog box comes with hunter levels', {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#5a6a78',
        })
        .setOrigin(0.5);
    }

    const back = this.add
      .text(10, 252, '< map', { fontFamily: 'monospace', fontSize: '8px', color: '#9fb896' })
      .setInteractive();
    back.on('pointerdown', () => {
      unlockAudio();
      playBlip();
      this.scene.start('MapScene');
    });
  }
}
