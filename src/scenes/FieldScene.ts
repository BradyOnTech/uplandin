import Phaser from 'phaser';
import { playBlip, playFlush, playPoint, playWhistle, unlockAudio } from '../audio';
import { AREAS, getArea, type AreaConfig } from '../game/areas';
import { flushCovey, updateBirdNerve, updateBirds, type Bird } from '../game/birds';
import { getBreed } from '../game/breeds';
import { activeDog, loadCareer, recordHunt, saveCareer } from '../game/career';
import { Dog, type DogState } from '../game/dog';
import { FIELD_BOUNDS } from '../game/field';
import { dist, moveToward, windArrow } from '../game/math';
import { birdsRemaining, createHunt, huntComplete, type HuntState } from '../game/state';
import type { Vec2 } from '../game/types';

const HUNTER_SPEED = 55; // px/s
const FLUSH_RADIUS = 22; // hunter this close to a pointed bird flushes it
const SHOT_RANGE = 40; // max hunter distance for a shooting chance on a wild flush

const COLOR_DOG = 0xf2e3c6;
const COLOR_HUNTER = 0xd6402c;

// Whistle button zone (bottom-right corner). Taps here don't move the hunter.
const WHISTLE_BTN = { x: 452, y: 246, w: 48, h: 20 };

/**
 * Top-down view of the field. The dog quarters on its own; tap to walk your
 * hunter. Get close to a bird the dog is pointing and it flushes.
 */
export class FieldScene extends Phaser.Scene {
  hunt!: HuntState;
  dog!: Dog;
  private area!: AreaConfig;

  private hunterTarget: Vec2 | null = null;
  private flushing = false;
  private summaryShown = false;
  private prevDogState: DogState = 'quartering';
  private recallPending = false;

  private dogSprite!: Phaser.GameObjects.Sprite;
  private hunterSprite!: Phaser.GameObjects.Sprite;
  private pointMarker!: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Text;
  private birdMarkers: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super('FieldScene');
  }

  create(data: { hunt?: HuntState; areaId?: string }): void {
    this.area = data.hunt ? getArea(data.hunt.areaId) : data.areaId ? getArea(data.areaId) : AREAS[0];
    this.hunt = data.hunt ?? createHunt(this.area);
    const kennelDog = activeDog(loadCareer());
    this.dog = new Dog(
      { ...this.hunt.dogPos },
      { breed: kennelDog ? getBreed(kennelDog.breedId) : getBreed('gsp'), level: kennelDog?.level ?? 1 },
      Math.random,
    );
    this.flushing = false;
    this.hunterTarget = null;
    this.summaryShown = false;
    this.prevDogState = this.dog.state;
    this.recallPending = false;

    this.makeTextures();
    this.drawField();

    this.hunterSprite = this.add.sprite(this.hunt.hunterPos.x, this.hunt.hunterPos.y, 'hunter');
    this.dogSprite = this.add.sprite(this.hunt.dogPos.x, this.hunt.dogPos.y, 'dog');
    this.pointMarker = this.add
      .text(0, 0, '!', { fontFamily: 'monospace', fontSize: '10px', color: '#ffd23f' })
      .setOrigin(0.5)
      .setVisible(false);

    this.hud = this.add.text(4, 4, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' });
    this.add
      .text(FIELD_BOUNDS.w / 2, FIELD_BOUNDS.h - 8, 'tap to walk your hunter', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#dfe9d8',
      })
      .setOrigin(0.5);

    // Debug aid: press B to peek at where the hidden birds are.
    this.birdMarkers = this.hunt.birds.map((b) =>
      this.add.rectangle(b.pos.x, b.pos.y, 4, 4, 0x8a5a2b).setVisible(false),
    );
    this.input.keyboard?.on('keydown-B', () => {
      this.birdMarkers.forEach((m, i) => {
        m.setVisible(m.visible ? false : this.hunt.birds[i].state === 'hidden');
      });
    });

    // Whistle button + keyboard shortcut call the dog back to the hunter.
    const btn = this.add
      .rectangle(WHISTLE_BTN.x, WHISTLE_BTN.y, WHISTLE_BTN.w, WHISTLE_BTN.h, 0x101410, 0.65)
      .setDepth(15)
      .setInteractive();
    this.add
      .text(WHISTLE_BTN.x, WHISTLE_BTN.y, 'whistle', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#dfe9d8',
      })
      .setOrigin(0.5)
      .setDepth(16);
    btn.on('pointerdown', () => this.whistle());
    this.input.keyboard?.on('keydown-W', () => this.whistle());
    this.input.keyboard?.on('keydown-SPACE', () => this.whistle());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      unlockAudio();
      // Summary buttons handle their own taps.
      if (this.summaryShown) return;
      if (this.flushing) return;
      // Taps on the whistle button are commands, not walk orders.
      if (
        p.worldX > WHISTLE_BTN.x - WHISTLE_BTN.w / 2 &&
        p.worldX < WHISTLE_BTN.x + WHISTLE_BTN.w / 2 &&
        p.worldY > WHISTLE_BTN.y - WHISTLE_BTN.h / 2 &&
        p.worldY < WHISTLE_BTN.y + WHISTLE_BTN.h / 2
      ) {
        return;
      }
      this.hunterTarget = { x: p.worldX, y: p.worldY };
    });
  }

  private whistle(): void {
    unlockAudio();
    if (this.summaryShown || this.flushing) return;
    playWhistle();
    this.recallPending = true;
  }

  update(time: number, delta: number): void {
    if (this.flushing) return;
    const dt = delta / 1000;

    const retrievedBefore = this.hunt.birds.filter((b) => b.state === 'retrieved').length;
    updateBirds(delta, this.hunt.birds, this.dog.pos);
    const recall = this.recallPending;
    this.recallPending = false;
    this.dog.update(delta, this.hunt.birds, {
      hunterPos: this.hunt.hunterPos,
      windAngle: this.hunt.wind,
      recall,
    });
    this.hunt.dogPos = { ...this.dog.pos };

    if (this.dog.state === 'pointing' && this.prevDogState !== 'pointing') playPoint();
    this.prevDogState = this.dog.state;
    if (this.hunt.birds.filter((b) => b.state === 'retrieved').length > retrievedBefore) playBlip();

    // A pointed bird's nerve is running out the whole time.
    const wild = updateBirdNerve(delta, this.hunt.birds, this.dog.pointedBirdId);
    if (wild) {
      this.flush(wild, true);
      return;
    }

    if (this.hunterTarget) {
      this.hunt.hunterPos = moveToward(this.hunt.hunterPos, this.hunterTarget, HUNTER_SPEED * dt);
      if (dist(this.hunt.hunterPos, this.hunterTarget) < 1.5) this.hunterTarget = null;
    }

    this.dogSprite.setPosition(this.dog.pos.x, this.dog.pos.y);
    this.dogSprite.setFlipX(Math.cos(this.dog.heading) < 0);
    this.hunterSprite.setPosition(this.hunt.hunterPos.x, this.hunt.hunterPos.y);

    // Debug markers track the birds (runners move).
    this.birdMarkers.forEach((m, i) => m.setPosition(this.hunt.birds[i].pos.x, this.hunt.birds[i].pos.y));

    const pointing = this.dog.state === 'pointing';
    if (pointing) {
      this.dogSprite.setTint(0xffd23f);
      // The point marker shows the bird's nerve: gold → orange → blinking red.
      const pointed = this.hunt.birds.find((b) => b.id === this.dog.pointedBirdId);
      const nerveFrac = pointed ? Math.max(0, pointed.nerveMs / this.area.nerveMaxMs) : 1;
      this.pointMarker.setColor(nerveFrac > 0.6 ? '#ffd23f' : nerveFrac > 0.3 ? '#ff8c3f' : '#ff4040');
      const visible = nerveFrac >= 0.3 || Math.floor(time / 120) % 2 === 0;
      this.pointMarker.setVisible(visible);
      this.pointMarker.setPosition(this.dog.pos.x, this.dog.pos.y - 8);
    } else {
      this.dogSprite.clearTint();
      this.pointMarker.setVisible(false);
    }

    this.hud.setText(
      `wind ${windArrow(this.hunt.wind)}   dog: ${this.dog.state}   birds: ${birdsRemaining(this.hunt)}   downed: ${this.hunt.downed}   lost: ${this.hunt.escaped}`,
    );

    this.checkFlush();

    if (!this.flushing && !this.summaryShown && huntComplete(this.hunt)) {
      this.showSummary();
    }
  }

  private showSummary(): void {
    this.summaryShown = true;
    saveCareer(recordHunt(loadCareer(), this.hunt.areaId, this.hunt.downed, this.hunt.escaped));

    const cx = FIELD_BOUNDS.w / 2;
    const cy = FIELD_BOUNDS.h / 2;
    this.add.rectangle(cx, cy, FIELD_BOUNDS.w, FIELD_BOUNDS.h, 0x000000, 0.65).setDepth(20);
    const total = this.hunt.birds.length;
    this.add
      .text(cx, cy - 36, 'HUNT OVER', { fontFamily: 'monospace', fontSize: '16px', color: '#ffd23f' })
      .setOrigin(0.5)
      .setDepth(21);
    this.add
      .text(cx, cy - 10, `${this.area.name} — downed: ${this.hunt.downed} / ${total}   lost: ${this.hunt.escaped}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(21);
    this.summaryButton(cx - 62, cy + 30, 'hunt again', () => this.scene.restart({ areaId: this.area.id }));
    this.summaryButton(cx + 62, cy + 30, 'menu', () => this.scene.start('TitleScene'));
  }

  private summaryButton(x: number, y: number, label: string, onTap: () => void): void {
    this.add
      .rectangle(x, y, 104, 20, 0x101410, 0.85)
      .setDepth(21)
      .setInteractive()
      .on('pointerdown', () => {
        unlockAudio();
        playBlip();
        onTap();
      });
    this.add
      .text(x, y, label, { fontFamily: 'monospace', fontSize: '8px', color: '#dfe9d8' })
      .setOrigin(0.5)
      .setDepth(22);
  }

  private checkFlush(): void {
    if (this.dog.state !== 'pointing' || this.dog.pointedBirdId === null) return;
    const bird = this.hunt.birds.find((b) => b.id === this.dog.pointedBirdId);
    if (!bird || bird.state !== 'hidden') return;
    if (dist(this.hunt.hunterPos, bird.pos) <= FLUSH_RADIUS) {
      this.flush(bird, false);
    }
  }

  private flush(bird: Bird, wild: boolean): void {
    this.flushing = true;
    const flushed = flushCovey(this.hunt.birds, bird.id);
    playFlush();
    this.cameras.main.flash(180, 255, 244, 214);

    const hunterDist = dist(this.hunt.hunterPos, bird.pos);
    const label = wild ? 'FLUSHED WILD!' : flushed.length > 1 ? 'COVEY FLUSH!' : 'FLUSH!';
    this.add
      .text(bird.pos.x, bird.pos.y - 10, label, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: wild ? '#ff8c3f' : '#ffffff',
      })
      .setOrigin(0.5);

    if (hunterDist <= SHOT_RANGE) {
      this.time.delayedCall(450, () => {
        this.scene.start('FlushScene', {
          hunt: this.hunt,
          birdIds: flushed.map((b) => b.id),
          flushDistance: hunterDist, // groundwork for distance-scaled shot views
        });
      });
      return;
    }

    // Too far off: the birds are gone before the hunter can mount the gun.
    for (const b of flushed) {
      b.state = 'escaped';
      this.hunt.escaped++;
    }
    this.add
      .text(bird.pos.x, bird.pos.y + 2, 'too far off for a shot', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffb0a0',
      })
      .setOrigin(0.5);
    this.time.delayedCall(900, () => {
      this.flushing = false;
    });
  }

  private makeTextures(): void {
    if (this.textures.exists('dog')) return;
    const g = this.add.graphics();
    g.fillStyle(COLOR_DOG).fillRect(0, 1, 9, 4); // body
    g.fillStyle(0xb08d5f).fillRect(7, 0, 3, 3); // head
    g.generateTexture('dog', 10, 6);
    g.clear();
    g.fillStyle(COLOR_HUNTER).fillRect(0, 0, 6, 6);
    g.fillStyle(0x2a2a2a).fillRect(1, 1, 2, 2);
    g.generateTexture('hunter', 6, 6);
    g.destroy();
  }

  private drawField(): void {
    const g = this.add.graphics();
    g.fillStyle(this.area.grass).fillRect(0, 0, FIELD_BOUNDS.w, FIELD_BOUNDS.h);
    g.fillStyle(this.area.cover);
    for (const patch of this.area.patches) {
      g.fillRect(patch.x, patch.y, patch.w, patch.h);
    }
    g.fillStyle(0x6b4a2a); // a few trees for landmarks
    for (const t of [
      { x: 15, y: 90 },
      { x: 455, y: 20 },
      { x: 440, y: 220 },
      { x: 20, y: 250 },
    ]) {
      g.fillRect(t.x, t.y, 8, 8);
    }
  }
}
