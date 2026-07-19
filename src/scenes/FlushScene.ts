import Phaser from 'phaser';
import { playCackle, playShot, playThud, playThunder, playTwitter, unlockAudio } from '../audio';
import { getArea } from '../game/areas';
import { relightSurvivors, YOUNG_FLIGHT_MULT, type Bird } from '../game/birds';
import type { Dog } from '../game/dog';
import { slopeFlightMult, type SlopeApproach } from '../game/fieldcraft';
import { getGun, type GunConfig } from '../game/guns';
import { clamp, dist } from '../game/math';
import { regionOfArea } from '../game/regions';
import { escapeVelocity, hitTest } from '../game/shot';
import { getSpecies, type SpeciesConfig } from '../game/species';
import type { HuntState } from '../game/state';
import type { Vec2 } from '../game/types';
import { windMults } from '../game/wind';

const GROUND_Y = 205;
const TOUCH_AIM_OFFSET = 56; // crosshair rides above your finger on touch
const LAUNCH_STAGGER_MS = 130; // covey birds get airborne one after another

/** Painted backdrop plates per region (docs/art pipeline); regions without one get the drawn sky. */
const FLUSH_BACKDROPS: Record<string, string> = {
  'southern-plains': 'flush-bg-southern-plains',
};

/** Species with real sprite sheets (3 frames: wings up, wings down, folded). */
const BIRD_SHEETS: Record<string, string> = {
  bobwhite: 'bobwhite-flush',
};

interface FlyingBird {
  id: number;
  fieldBird: Bird;
  species: SpeciesConfig;
  sprite: Phaser.GameObjects.Sprite;
  vel: Vec2;
  wobble: number;
  status: 'waiting' | 'flying' | 'falling' | 'done';
}

/**
 * Duck Hunt-style shooting view. A whole covey can rise at once; two shells,
 * one bird per shell. Watch the tail: hens are protected, and dropping one
 * is a fine. Survivors of the rise relight nearby as tight-holding singles.
 */
export class FlushScene extends Phaser.Scene {
  private hunt!: HuntState;
  private birds: FlyingBird[] = [];
  private resolved = false;
  private dogs: Dog[] = [];
  private pointingSlot: number | null = null;

  private crosshair!: Phaser.GameObjects.Sprite;
  private gun!: GunConfig;
  private shells = 2;
  private lastShotAt = -Infinity;
  private shellPips: Phaser.GameObjects.Rectangle[] = [];
  private hud!: Phaser.GameObjects.Text;
  /** Timber the pattern can't punch through (grouse cover). */
  private trees: { x: number; y: number; w: number; h: number }[] = [];

  constructor() {
    super('FlushScene');
  }

  preload(): void {
    // Already-cached keys are skipped, so this is a no-op after the first visit.
    this.load.image('flush-bg-southern-plains', 'art/flush-backdrop-southern-plains.png');
    this.load.spritesheet('bobwhite-flush', 'art/bobwhite-flush-sheet-alpha.png', {
      frameWidth: 44,
      frameHeight: 28,
    });
  }

  create(data: {
    hunt: HuntState;
    birdIds: number[];
    flushDistance?: number;
    dogs?: Dog[];
    pointingSlot?: number | null;
    slopeApproach?: SlopeApproach | null;
  }): void {
    this.hunt = data.hunt;
    this.dogs = data.dogs ?? [];
    this.pointingSlot = data.pointingSlot ?? null;
    this.gun = getGun(this.hunt.gunId);
    this.shells = this.gun.shells;
    this.lastShotAt = -Infinity;
    this.resolved = false;
    this.birds = [];

    this.drawSky();
    this.makeCrosshair();
    // The slope shot: from above they drop away slow and open; from below
    // they rocket over your head.
    const slope = data.slopeApproach ?? null;
    const slopeMult = slopeFlightMult(slope);
    this.makeTimber(data.birdIds);

    const flushSounds = new Set<string>();
    data.birdIds.forEach((id, i) => {
      const fieldBird = this.hunt.birds.find((b) => b.id === id)!;
      const species = getSpecies(fieldBird.speciesId);
      const vel = escapeVelocity(species.flight);
      vel.x *= slopeMult;
      vel.y *= slopeMult * (slope === 'above' ? 0.85 : 1); // dropping away below you
      if (fieldBird.young) {
        vel.x *= YOUNG_FLIGHT_MULT; // a young bird hasn't got its wings yet
        vel.y *= YOUNG_FLIGHT_MULT;
      }
      // World coords → screen: the bird rises where it sat relative to the hunter.
      const launchX = clamp(240 + (fieldBird.pos.x - this.hunt.hunterPos.x), 48, 432);
      // Steer back toward the middle of the screen so edge flushes stay shootable.
      if ((launchX < 240 && vel.x < 0) || (launchX > 240 && vel.x > 0)) {
        vel.x *= -1;
      }
      const sprite = this.makeBirdSprite(fieldBird, species, launchX);
      sprite.setFlipX(vel.x < 0);
      sprite.setVisible(i === 0);
      const bird: FlyingBird = { id, fieldBird, species, sprite, vel, wobble: i * 2.1, status: 'waiting' };
      this.birds.push(bird);
      this.time.delayedCall(i * LAUNCH_STAGGER_MS, () => {
        if (bird.status !== 'waiting') return;
        bird.status = 'flying';
        sprite.setVisible(true);
        // Signature flush sounds, once per species per rise. Hens don't cackle.
        const soundKey = species.sound && !(species.sound === 'cackle' && fieldBird.sex === 'hen') ? species.id : null;
        if (soundKey && species.sound && !flushSounds.has(soundKey)) {
          flushSounds.add(soundKey);
          if (species.sound === 'cackle') playCackle();
          else if (species.sound === 'twitter') playTwitter();
          else playThunder();
        }
      });
    });

    this.crosshair = this.add.sprite(240, 120, 'crosshair').setDepth(10);
    this.input.setDefaultCursor('none');

    this.shellPips = [];
    for (let i = 0; i < this.gun.shells; i++) {
      this.shellPips.push(this.add.rectangle(6 + i * 8, 252, 5, 10, 0xd6402c).setOrigin(0, 0.5));
    }
    const lead = this.birds[0];
    const henWarning = this.birds.some((b) => b.fieldBird.sex === 'hen') ? '  —  watch for hens!' : '';
    const slopeNote =
      slope === 'above' ? '  —  shooting down the hill' : slope === 'below' ? '  —  rocketing overhead!' : '';
    this.hud = this.add.text(
      4,
      4,
      (data.birdIds.length > 1 ? `covey rise! ${data.birdIds.length} ${lead.species.name}s` : `${lead.species.name}!`) +
        henWarning +
        slopeNote,
      { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' },
    );

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      unlockAudio();
      this.shoot(p);
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    const p = this.input.activePointer;
    const yOff = p.wasTouch ? TOUCH_AIM_OFFSET : 0;
    this.crosshair.setPosition(p.worldX, p.worldY - yOff);

    for (const b of this.birds) {
      if (b.status === 'flying') {
        b.wobble += dt * 9;
        b.sprite.x += b.vel.x * dt + Math.sin(b.wobble) * b.species.flight.wobble * dt;
        b.sprite.y += b.vel.y * dt;
        if (b.sprite.y < -16 || b.sprite.x < -16 || b.sprite.x > 496) {
          this.escapeBird(b);
        }
      } else if (b.status === 'falling') {
        b.sprite.y += 170 * dt;
        b.sprite.angle += 540 * dt;
        if (b.sprite.y >= GROUND_Y) {
          b.sprite.y = GROUND_Y;
          b.status = 'done';
          playThud();
        }
      }
    }

    // Once nothing is left in the air, call it.
    if (!this.resolved && this.birds.every((b) => b.status === 'falling' || b.status === 'done')) {
      this.finish();
    }
  }

  private shoot(p: Phaser.Input.Pointer): void {
    if (this.resolved || this.shells <= 0) return;
    // Working the action: the pump makes you wait between shots.
    if (this.time.now - this.lastShotAt < this.gun.cooldownMs) return;
    this.lastShotAt = this.time.now;
    this.shells--;
    this.shellPips[this.shells].setFillStyle(0x333333);
    playShot();

    const aim = { x: p.worldX, y: p.worldY - (p.wasTouch ? TOUCH_AIM_OFFSET : 0) };
    this.cameras.main.shake(70, 0.004);
    const flash = this.add.circle(aim.x, aim.y, 3, 0xfff2c9).setDepth(9);
    this.tweens.add({
      targets: flash,
      scale: 5,
      alpha: 0,
      duration: 160,
      onComplete: () => flash.destroy(),
    });

    // Grouse cover: the pattern can't punch through timber.
    if (this.trees.some((t) => aim.x >= t.x && aim.x <= t.x + t.w && aim.y >= t.y && aim.y <= t.y + t.h)) {
      this.add
        .text(aim.x, aim.y - 10, 'thwack — timber!', { fontFamily: 'monospace', fontSize: '9px', color: '#c9dcc0' })
        .setOrigin(0.5)
        .setDepth(11);
      return;
    }

    // One shell, one bird: the nearest flying bird inside the pattern.
    let best: FlyingBird | null = null;
    let bestDist = this.gun.spread;
    for (const b of this.birds) {
      if (b.status !== 'flying') continue;
      const d = dist(aim, b.sprite);
      if (d <= bestDist) {
        best = b;
        bestDist = d;
      }
    }
    if (best) {
      best.status = 'falling';
      best.fieldBird.state = 'downed';
      // Sheet birds fold up on the shot.
      if (best.sprite.texture.key === BIRD_SHEETS[best.species.id]) {
        best.sprite.stop();
        best.sprite.setFrame(2);
      }
      this.hunt.downed++;
      if (best.fieldBird.sex === 'hen') {
        this.hunt.henDowns++;
        this.add
          .text(best.sprite.x, best.sprite.y - 12, "HEN! that's a fine", {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#ff6a5a',
          })
          .setOrigin(0.5);
      }
    }
  }

  private escapeBird(b: FlyingBird): void {
    b.status = 'done';
    b.sprite.setVisible(false);
    b.fieldBird.state = 'escaped';
    this.hunt.escaped++;
  }

  private finish(): void {
    if (this.resolved) return;
    this.resolved = true;

    const total = this.birds.length;
    const downedHere = this.birds.filter((b) => b.fieldBird.state === 'downed').length;
    // Birds downed over a dog's point earn that dog XP at the summary.
    if (this.pointingSlot !== null) this.hunt.dogWork[this.pointingSlot].downedOverPoint += downedHere;
    // Two on one rise: the classic double, bonus hunter XP.
    if (downedHere >= 2) this.hunt.doubles++;

    // Hunt the singles: survivors of the rise relight nearby, holding tight.
    const escapedIds = this.birds.filter((b) => b.fieldBird.state === 'escaped').map((b) => b.id);
    const area = getArea(this.hunt.areaId);
    const relit = relightSurvivors(
      this.hunt.birds,
      escapedIds,
      area.world,
      Math.random,
      windMults(this.hunt.windStrength).nerve,
    );
    this.hunt.escaped -= relit.length;

    if (downedHere === 0) {
      this.hud.setText(total > 1 ? 'they all got away...' : 'it got away...');
    } else if (total > 1) {
      this.hud.setText(`${downedHere} of ${total} down!${downedHere >= 2 ? '  A DOUBLE!' : ''}`);
    } else {
      this.hud.setText('nice shot!');
    }
    if (relit.length > 0) {
      this.add.text(4, 16, `${relit.length} single${relit.length > 1 ? 's' : ''} put down in the grass — hunt 'em up`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#c9dcc0',
      });
    }

    this.time.delayedCall(1500, () => {
      this.input.setDefaultCursor('default');
      this.scene.start('FieldScene', { hunt: this.hunt, dogs: this.dogs });
    });
  }

  /** Grouse put a tree between themselves and the gun. */
  private makeTimber(birdIds: number[]): void {
    this.trees = [];
    const timberBirds = birdIds.some((id) => {
      const b = this.hunt.birds.find((x) => x.id === id);
      return b && getSpecies(b.speciesId).timber;
    });
    if (!timberBirds) return;
    const count = 1 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const x = 90 + Math.random() * 300;
      const trunk = { x: x - 3, y: GROUND_Y - 46, w: 6, h: 46 };
      const canopy = { x: x - 16, y: GROUND_Y - 96, w: 32, h: 56 };
      const g = this.add.graphics().setDepth(5);
      g.fillStyle(0x4a3626).fillRect(trunk.x, trunk.y, trunk.w, trunk.h);
      g.fillStyle(0x2c4a30).fillRect(canopy.x, canopy.y, canopy.w, canopy.h);
      g.fillStyle(0x35573a).fillRect(canopy.x + 4, canopy.y + 6, canopy.w - 8, canopy.h - 12);
      this.trees.push(trunk, canopy);
    }
  }

  private drawSky(): void {
    // A painted plate where the art pipeline has one; drawn sky otherwise.
    const key = FLUSH_BACKDROPS[regionOfArea(this.hunt.areaId).id];
    if (key && this.textures.exists(key)) {
      this.add.image(240, 135, key);
      return;
    }
    const g = this.add.graphics();
    g.fillStyle(0x63a4ff).fillRect(0, 0, 480, GROUND_Y);
    g.fillStyle(0x3e8e2f).fillRect(0, GROUND_Y, 480, 270 - GROUND_Y);
    g.fillStyle(0xffffff, 0.8);
    g.fillRect(60, 40, 34, 8);
    g.fillRect(70, 32, 18, 8);
    g.fillRect(300, 70, 40, 8);
    g.fillRect(314, 62, 20, 8);
  }

  /**
   * Real sprite-sheet birds where the art pipeline has delivered one
   * (wing-whir animation, folded frame on the fall); generated
   * palette-rectangle sprites for everyone else until their sheets land.
   */
  private makeBirdSprite(bird: Bird, species: SpeciesConfig, x: number): Phaser.GameObjects.Sprite {
    const sheet = BIRD_SHEETS[species.id];
    if (sheet && this.textures.exists(sheet)) {
      const animKey = `${sheet}-flap`;
      if (!this.anims.exists(animKey)) {
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(sheet, { start: 0, end: 1 }),
          frameRate: 14, // the quail whir
          repeat: -1,
        });
      }
      const sprite = this.add.sprite(x, GROUND_Y - 6, sheet, 0);
      sprite.play(animKey);
      return sprite;
    }
    return this.add.sprite(x, GROUND_Y - 6, this.birdTexture(bird, species));
  }

  /** Species-colored bird sprites; ringnecks split into hen and rooster looks. */
  private birdTexture(bird: Bird, species: SpeciesConfig): string {
    const variant = bird.sex ?? 'base';
    const key = `bird-${species.id}-${variant}`;
    if (this.textures.exists(key)) return key;
    const g = this.add.graphics();
    if (bird.sex === 'rooster') {
      // Long-tailed and flashy: white neck ring, iridescent head.
      g.fillStyle(species.palette.body).fillRect(4, 2, 8, 5); // body
      g.fillStyle(0xffffff).fillRect(11, 2, 1, 3); // neck ring
      g.fillStyle(species.palette.head).fillRect(12, 0, 4, 4); // green head
      g.fillStyle(0xd6402c).fillRect(13, 1, 1, 1); // wattle
      g.fillStyle(species.palette.tail).fillRect(0, 3, 5, 1); // long tail
      g.fillStyle(species.palette.tail).fillRect(1, 4, 4, 1);
      g.generateTexture(key, 16, 8);
    } else if (bird.sex === 'hen') {
      // Tan, short-tailed, deliberately plain — that's the tell.
      g.fillStyle(0xb59a6a).fillRect(2, 2, 8, 5);
      g.fillStyle(0xc9b287).fillRect(9, 0, 4, 4);
      g.fillStyle(0x8a744e).fillRect(0, 3, 3, 2);
      g.generateTexture(key, 13, 8);
    } else {
      g.fillStyle(species.palette.body).fillRect(2, 2, 8, 5); // body
      g.fillStyle(species.palette.head).fillRect(9, 0, 4, 4); // head
      g.fillStyle(species.palette.tail).fillRect(0, 3, 3, 2); // tail
      g.generateTexture(key, 13, 8);
    }
    g.destroy();
    return key;
  }

  private makeCrosshair(): void {
    if (this.textures.exists('crosshair')) return;
    const g = this.add.graphics();
    g.lineStyle(1, 0xffffff);
    g.strokeCircle(8, 8, 7);
    g.lineBetween(8, 0, 8, 16);
    g.lineBetween(0, 8, 16, 8);
    g.generateTexture('crosshair', 17, 17);
    g.destroy();
  }
}
