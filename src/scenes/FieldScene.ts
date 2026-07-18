import Phaser from 'phaser';
import type { Bird } from '../game/birds';
import { Dog } from '../game/dog';
import { COVER_PATCHES, FIELD_BOUNDS } from '../game/field';
import { dist, moveToward } from '../game/math';
import { birdsRemaining, createHunt, type HuntState } from '../game/state';
import type { Vec2 } from '../game/types';

const HUNTER_SPEED = 55; // px/s
const FLUSH_RADIUS = 22; // hunter this close to a pointed bird flushes it

const COLOR_GRASS = 0x4a8c3f;
const COLOR_COVER = 0x2f6b28;
const COLOR_DOG = 0xf2e3c6;
const COLOR_HUNTER = 0xd6402c;

/**
 * Top-down view of the field. The dog quarters on its own; tap to walk your
 * hunter. Get close to a bird the dog is pointing and it flushes.
 */
export class FieldScene extends Phaser.Scene {
  hunt!: HuntState;
  dog!: Dog;

  private hunterTarget: Vec2 | null = null;
  private flushing = false;

  private dogSprite!: Phaser.GameObjects.Sprite;
  private hunterSprite!: Phaser.GameObjects.Sprite;
  private pointMarker!: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Text;
  private birdMarkers: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super('FieldScene');
  }

  create(data: { hunt?: HuntState }): void {
    this.hunt = data.hunt ?? createHunt();
    this.dog = new Dog({ ...this.hunt.dogPos });
    this.flushing = false;
    this.hunterTarget = null;

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

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.flushing) return;
      this.hunterTarget = { x: p.worldX, y: p.worldY };
    });
  }

  update(_time: number, delta: number): void {
    if (this.flushing) return;
    const dt = delta / 1000;

    this.dog.update(delta, this.hunt.birds, this.hunt.hunterPos);
    this.hunt.dogPos = { ...this.dog.pos };

    if (this.hunterTarget) {
      this.hunt.hunterPos = moveToward(this.hunt.hunterPos, this.hunterTarget, HUNTER_SPEED * dt);
      if (dist(this.hunt.hunterPos, this.hunterTarget) < 1.5) this.hunterTarget = null;
    }

    this.dogSprite.setPosition(this.dog.pos.x, this.dog.pos.y);
    this.dogSprite.setFlipX(Math.cos(this.dog.heading) < 0);
    this.hunterSprite.setPosition(this.hunt.hunterPos.x, this.hunt.hunterPos.y);

    const pointing = this.dog.state === 'pointing';
    if (pointing) {
      this.dogSprite.setTint(0xffd23f);
      this.pointMarker.setPosition(this.dog.pos.x, this.dog.pos.y - 8);
    } else {
      this.dogSprite.clearTint();
    }
    this.pointMarker.setVisible(pointing);

    this.hud.setText(
      `dog: ${this.dog.state}   birds: ${birdsRemaining(this.hunt)}   downed: ${this.hunt.downed}   lost: ${this.hunt.escaped}`,
    );

    this.checkFlush();
  }

  private checkFlush(): void {
    if (this.dog.state !== 'pointing' || this.dog.pointedBirdId === null) return;
    const bird = this.hunt.birds.find((b) => b.id === this.dog.pointedBirdId);
    if (!bird || bird.state !== 'hidden') return;
    if (dist(this.hunt.hunterPos, bird.pos) <= FLUSH_RADIUS) {
      this.flush(bird);
    }
  }

  private flush(bird: Bird): void {
    this.flushing = true;
    bird.state = 'flushed';
    this.cameras.main.flash(180, 255, 244, 214);
    this.add
      .text(bird.pos.x, bird.pos.y - 10, 'FLUSH!', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.time.delayedCall(450, () => {
      this.scene.start('FlushScene', { hunt: this.hunt, birdId: bird.id });
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
    g.fillStyle(COLOR_GRASS).fillRect(0, 0, FIELD_BOUNDS.w, FIELD_BOUNDS.h);
    g.fillStyle(COLOR_COVER);
    for (const patch of COVER_PATCHES) {
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
