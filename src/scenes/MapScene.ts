import Phaser from 'phaser';
import { playBlip, unlockAudio } from '../audio';
import { getBreed } from '../game/breeds';
import { activeDog, loadCareer, saveCareer, STARTER_REGION } from '../game/career';
import { getGun, unlockedGuns } from '../game/guns';
import { GEAR_NAMES, gearTierFor, TRUCK_LEVEL, truckUnlocked } from '../game/progression';
import { REGIONS } from '../game/regions';

/** Chunky pixel-style continental US, y-down screen coords on 480×270. */
const US_OUTLINE: [number, number][] = [
  [55, 75], [150, 72], [230, 68], [310, 62], [345, 55], [368, 68], [362, 92],
  [345, 118], [352, 148], [330, 170], [318, 178], [332, 208], [318, 212],
  [302, 190], [262, 198], [238, 226], [222, 200], [205, 192], [150, 188],
  [118, 180], [95, 172], [62, 138], [55, 108], [68, 96],
];

/**
 * The travel map: seven regions across the country. Home ground is always
 * open; the rest of the built regions need the truck (hunter level 2).
 * The bottom bar carries your gun choice and the kennel door.
 */
export class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene');
  }

  create(): void {
    const career = loadCareer();
    const hasTruck = truckUnlocked(career.hunter.level);

    this.add.rectangle(240, 135, 480, 270, 0x101a26);
    const g = this.add.graphics();
    g.fillStyle(0x6e6248);
    g.fillPoints(US_OUTLINE.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
    g.lineStyle(1, 0x3a4a5a).strokePoints(US_OUTLINE.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);

    this.add
      .text(240, 14, 'where to, boss?', { fontFamily: 'monospace', fontSize: '12px', color: '#ffd23f' })
      .setOrigin(0.5);
    const dog = activeDog(career);
    const header = dog
      ? `${dog.name} the ${getBreed(dog.breedId).name} rides shotgun`
      : 'the kennel is empty';
    this.add
      .text(240, 30, `${header} · hunter lv ${career.hunter.level} · ${GEAR_NAMES[gearTierFor(career.hunter.level)]}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#dfe9d8',
      })
      .setOrigin(0.5);

    for (const region of REGIONS) {
      const { x, y } = region.map;
      const open = region.built && (hasTruck || region.id === STARTER_REGION);
      if (open) {
        const hunts = region.areaIds.reduce((a, id) => a + (career.areas[id]?.hunts ?? 0), 0);
        const dot = this.add.circle(x, y, 5, 0xffd23f).setInteractive({ useHandCursor: true });
        this.add.circle(x, y, 2, 0x101a26);
        const label = this.add
          .text(x, y + 10, region.name, { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' })
          .setOrigin(0.5, 0);
        if (hunts > 0) {
          this.add
            .text(x, y + 20, `${hunts} hunts`, { fontFamily: 'monospace', fontSize: '8px', color: '#9fb896' })
            .setOrigin(0.5, 0);
        }
        // Keep labels legible against the land: subtle shadow.
        label.setShadow(1, 1, '#101a26', 0);
        dot.on('pointerdown', () => {
          unlockAudio();
          playBlip();
          this.scene.start('AreaScene', { regionId: region.id });
        });
      } else {
        this.add.circle(x, y, 3, 0x44505c);
        const note = region.built ? `needs the truck (hunter lv ${TRUCK_LEVEL})` : 'a later season';
        this.add
          .text(x, y + 8, region.name, { fontFamily: 'monospace', fontSize: '8px', color: '#8a97a4' })
          .setOrigin(0.5, 0)
          .setShadow(1, 1, '#101a26', 0);
        this.add
          .text(x, y + 18, note, { fontFamily: 'monospace', fontSize: '8px', color: '#5a6a78' })
          .setOrigin(0.5, 0)
          .setShadow(1, 1, '#101a26', 0);
      }
    }

    // Gun rack: tap to cycle through what your hunter level has unlocked.
    const guns = unlockedGuns(career.hunter.level);
    const gunLabel = this.add
      .text(240, 246, '', { fontFamily: 'monospace', fontSize: '8px', color: '#dfe9d8' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const setGunText = () =>
      gunLabel.setText(`gun: ${getGun(career.hunter.shotgunId).name}${guns.length > 1 ? '  <tap to swap>' : ''}`);
    setGunText();
    gunLabel.on('pointerdown', () => {
      unlockAudio();
      playBlip();
      const i = guns.findIndex((gn) => gn.id === career.hunter.shotgunId);
      career.hunter.shotgunId = guns[(i + 1) % guns.length].id;
      saveCareer(career);
      setGunText();
    });

    const kennel = this.add
      .text(470, 252, 'kennel >', { fontFamily: 'monospace', fontSize: '8px', color: '#9fb896' })
      .setOrigin(1, 0)
      .setInteractive();
    kennel.on('pointerdown', () => {
      unlockAudio();
      playBlip();
      this.scene.start('KennelScene');
    });

    const back = this.add
      .text(10, 252, '< title', { fontFamily: 'monospace', fontSize: '8px', color: '#9fb896' })
      .setInteractive();
    back.on('pointerdown', () => {
      unlockAudio();
      playBlip();
      this.scene.start('TitleScene');
    });
  }
}
