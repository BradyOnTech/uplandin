import Phaser from 'phaser';
import { playBell, playBlip, playFlush, playPoint, playWhistle, unlockAudio } from '../audio';
import { AREAS, getArea, type AreaConfig } from '../game/areas';
import {
  birdsScentingDog,
  birdsSpookedBy,
  flushCovey,
  updateBirdNerve,
  updateBirds,
  type Bird,
} from '../game/birds';
import { dogScentRadius, getBreed, type BreedConfig } from '../game/breeds';
import { activeDog, awardDogXp, loadCareer, recordHunt, saveCareer, type KennelDog } from '../game/career';
import { devDogLevel } from '../game/dev';
import { Dog, WHISTLE_RANGE, type DogState } from '../game/dog';
import { VIEWPORT } from '../game/field';
import { dist, moveToward, mulberry32, windArrow } from '../game/math';
import { birdsRemaining, createHunt, huntComplete, type HuntState } from '../game/state';
import type { Vec2 } from '../game/types';

const HUNTER_SPEED = 55; // px/s walking
const SPRINT_MULT = 2; // sprint speed multiplier
const SPRINT_SPOOK_RADIUS = 30; // running this close to a hidden bird flushes it underfoot
const SPRINT_NERVE_MULT = 1.6; // pointed birds hear you coming
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DIST = 30;
const FLUSH_RADIUS = 22; // hunter this close to a pointed bird flushes it
const SHOT_RANGE = 40; // max hunter distance for a shooting chance on a wild flush

const BELL_INTERVAL_MS = 620; // tinkle cadence while the dog moves
const BELL_HEARING = 700; // px at which the bell fades to nothing
const BELL_VOLUME = 0.16;
/** States where the bell rings — a standing (pointing/heeled) dog is silent. */
const BELL_STATES: DogState[] = ['quartering', 'tracking', 'breaking', 'retrieving', 'recalled'];

const COLOR_DOG = 0xf2e3c6;
const COLOR_HUNTER = 0xd6402c;

// Whistle button zone (bottom-right corner, screen coords). Taps here don't move the hunter.
const WHISTLE_BTN = { x: 452, y: 246, w: 48, h: 20 };

/**
 * Top-down view of the field. The world is bigger than the screen; the camera
 * follows the hunter — never the dog. The dog quarters anchored to you out to
 * its Range; listen for the bell and watch the edge arrow when it's off-screen.
 */
export class FieldScene extends Phaser.Scene {
  hunt!: HuntState;
  dog!: Dog;
  private area!: AreaConfig;
  private kennelDog: KennelDog | null = null;
  private breed: BreedConfig = getBreed('gsp');
  private devLevel: number | null = null;

  private hunterTarget: Vec2 | null = null;
  private sprinting = false;
  private lastTapMs = 0;
  private lastTapPos: Vec2 = { x: -999, y: -999 };
  private shiftKey?: Phaser.Input.Keyboard.Key;
  private flushing = false;
  private summaryShown = false;
  private prevDogState: DogState = 'quartering';
  private recallPending = false;
  private bellMs = 0;

  private dogSprite!: Phaser.GameObjects.Sprite;
  private hunterSprite!: Phaser.GameObjects.Sprite;
  private pointMarker!: Phaser.GameObjects.Text;
  private dogArrow!: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Text;
  private whistleLabel!: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text | null = null;
  private birdMarkers: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super('FieldScene');
  }

  create(data: { hunt?: HuntState; areaId?: string; dog?: Dog }): void {
    this.area = data.hunt ? getArea(data.hunt.areaId) : data.areaId ? getArea(data.areaId) : AREAS[0];
    this.hunt = data.hunt ?? createHunt(this.area);
    this.kennelDog = activeDog(loadCareer());
    this.breed = this.kennelDog ? getBreed(this.kennelDog.breedId) : getBreed('gsp');
    this.devLevel = devDogLevel(window.location.search);
    const level = this.devLevel ?? this.kennelDog?.level ?? 1;
    // The Dog instance rides through FlushScene and back so breaking chase,
    // creep state, and heading survive the transition.
    this.dog =
      data.dog ?? new Dog({ ...this.hunt.dogPos }, { breed: this.breed, level }, Math.random, this.area.world);
    this.dog.profile = { breed: this.breed, level };
    this.flushing = false;
    this.hunterTarget = null;
    this.sprinting = false;
    this.summaryShown = false;
    this.prevDogState = this.dog.state;
    this.recallPending = false;
    this.bellMs = 0;
    this.toastText = null;

    this.makeTextures();
    this.drawField();

    this.hunterSprite = this.add.sprite(this.hunt.hunterPos.x, this.hunt.hunterPos.y, 'hunter');
    this.dogSprite = this.add.sprite(this.hunt.dogPos.x, this.hunt.dogPos.y, 'dog');
    this.pointMarker = this.add
      .text(0, 0, '!', { fontFamily: 'monospace', fontSize: '10px', color: '#ffd23f' })
      .setOrigin(0.5)
      .setVisible(false);

    // Camera: bounded to the world, glued to the hunter.
    const cam = this.cameras.main;
    cam.setBounds(this.area.world.x, this.area.world.y, this.area.world.w, this.area.world.h);
    cam.startFollow(this.hunterSprite, true, 0.12, 0.12);

    // Edge arrow: where the dog is when it's working off-screen.
    this.dogArrow = this.add
      .text(0, 0, '▲', { fontFamily: 'monospace', fontSize: '10px', color: '#f2e3c6' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(15)
      .setVisible(false);

    this.hud = this.add
      .text(4, 4, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' })
      .setScrollFactor(0)
      .setDepth(15);
    this.add
      .text(VIEWPORT.w / 2, VIEWPORT.h - 8, 'tap to walk · double-tap to run', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#dfe9d8',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(15);

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
      .setScrollFactor(0)
      .setDepth(15)
      .setInteractive();
    this.whistleLabel = this.add
      .text(WHISTLE_BTN.x, WHISTLE_BTN.y, 'whistle', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#dfe9d8',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(16);
    btn.on('pointerdown', () => this.whistle());
    this.input.keyboard?.on('keydown-W', () => this.whistle());
    this.input.keyboard?.on('keydown-SPACE', () => this.whistle());
    this.shiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      unlockAudio();
      // Summary buttons handle their own taps.
      if (this.summaryShown) return;
      if (this.flushing) return;
      // Taps on the whistle button are commands, not walk orders (screen coords).
      if (
        p.x > WHISTLE_BTN.x - WHISTLE_BTN.w / 2 &&
        p.x < WHISTLE_BTN.x + WHISTLE_BTN.w / 2 &&
        p.y > WHISTLE_BTN.y - WHISTLE_BTN.h / 2 &&
        p.y < WHISTLE_BTN.y + WHISTLE_BTN.h / 2
      ) {
        return;
      }
      const tap = { x: p.worldX, y: p.worldY };
      const now = this.time.now;
      this.sprinting = now - this.lastTapMs < DOUBLE_TAP_MS && dist(tap, this.lastTapPos) < DOUBLE_TAP_DIST;
      this.lastTapMs = now;
      this.lastTapPos = tap;
      this.hunterTarget = tap;
    });
  }

  private whistle(): void {
    unlockAudio();
    if (this.summaryShown || this.flushing) return;
    playWhistle();
    if (this.dog.state === 'heel') {
      this.dog.castOff();
      return;
    }
    // The blast goes out either way; the dog only hears it inside whistle range.
    this.recallPending = true;
    if (dist(this.dog.pos, this.hunt.hunterPos) > WHISTLE_RANGE) this.toast('out of earshot...');
  }

  private toast(msg: string): void {
    this.toastText?.destroy();
    this.toastText = this.add
      .text(VIEWPORT.w / 2, 24, msg, { fontFamily: 'monospace', fontSize: '8px', color: '#ffb0a0' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(16);
    this.time.delayedCall(1100, () => {
      this.toastText?.destroy();
      this.toastText = null;
    });
  }

  update(time: number, delta: number): void {
    if (this.flushing) return;
    const dt = delta / 1000;

    const retrievedBefore = this.hunt.birds.filter((b) => b.state === 'retrieved').length;
    updateBirds(delta, this.hunt.birds, this.dog.pos, this.area.world);
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
    const retrievedNow = this.hunt.birds.filter((b) => b.state === 'retrieved').length;
    if (retrievedNow > retrievedBefore) {
      playBlip();
      this.hunt.xpEvents.retrieves += retrievedNow - retrievedBefore;
    }

    // The dog may bump birds itself — creeping on point or breaking chase.
    if (this.dog.bumpedBirdId !== null) {
      const bumped = this.hunt.birds.find((b) => b.id === this.dog.bumpedBirdId);
      this.dog.bumpedBirdId = null;
      if (bumped && !this.flushing) {
        this.flush(bumped, 'bump');
        return;
      }
    }

    // Downwind birds can scent an inexperienced dog — and flush on their own.
    if (this.dog.state === 'quartering' || this.dog.state === 'tracking') {
      const scented = birdsScentingDog(
        this.hunt.birds,
        this.dog.pos,
        this.hunt.wind,
        dogScentRadius(this.dog.level),
      );
      if (scented.length > 0 && !this.flushing) {
        this.flush(scented[0], 'scent');
        return;
      }
    }

    // Walk (or run) the hunter. Sprinting is loud.
    const running = (this.sprinting || this.shiftKey?.isDown === true) && this.hunterTarget !== null;
    if (this.hunterTarget) {
      const speed = HUNTER_SPEED * (running ? SPRINT_MULT : 1);
      this.hunt.hunterPos = moveToward(this.hunt.hunterPos, this.hunterTarget, speed * dt);
      if (dist(this.hunt.hunterPos, this.hunterTarget) < 1.5) {
        this.hunterTarget = null;
        this.sprinting = false;
      }
    }

    // A running hunter flushes birds underfoot...
    if (running) {
      const spooked = birdsSpookedBy(this.hunt.birds, this.hunt.hunterPos, SPRINT_SPOOK_RADIUS);
      if (spooked.length > 0 && !this.flushing) {
        this.flush(spooked[0], 'spook');
        return;
      }
    }

    // ...and pointed birds hear him coming: nerve drains faster.
    const nerveMult = this.dog.pressure * (running ? SPRINT_NERVE_MULT : 1);
    const wild = updateBirdNerve(delta, this.hunt.birds, this.dog.pointedBirdId, nerveMult);
    if (wild) {
      this.flush(wild, 'nerve');
      return;
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

    this.updateBell(delta);
    this.updateDogArrow();

    const staminaFilled = Math.ceil((this.dog.staminaMs / this.dog.maxStaminaMs) * 5);
    const staminaPips = `[${'#'.repeat(staminaFilled)}${'-'.repeat(5 - staminaFilled)}]`;
    const dogName = this.kennelDog?.name ?? 'dog';
    this.hud.setText(
      `wind ${windArrow(this.hunt.wind)}   birds: ${birdsRemaining(this.hunt)}   downed: ${this.hunt.downed}   lost: ${this.hunt.escaped}${running ? '   RUNNING' : ''}\n` +
        `${dogName} lv${this.dog.level}${this.devLevel !== null ? ' (dev)' : ''} ${this.dog.state}${this.dog.winded ? ' winded' : ''} ${staminaPips}`,
    );
    this.whistleLabel.setText(this.dog.state === 'heel' ? 'cast off' : 'whistle');

    this.checkFlush();

    if (!this.flushing && !this.summaryShown && huntComplete(this.hunt)) {
      this.showSummary();
    }
  }

  /** Tier-0 tracking gear: the bell tinkles while the dog moves, fades with distance, and goes silent on point. */
  private updateBell(delta: number): void {
    this.bellMs += delta;
    if (this.bellMs < BELL_INTERVAL_MS) return;
    this.bellMs = 0;
    if (!BELL_STATES.includes(this.dog.state)) return;
    const d = dist(this.dog.pos, this.hunt.hunterPos);
    playBell(BELL_VOLUME * Math.max(0, 1 - d / BELL_HEARING));
  }

  /** When the dog works off-screen, pin an arrow to the viewport edge pointing at it. */
  private updateDogArrow(): void {
    const view = this.cameras.main.worldView;
    const off = !view.contains(this.dog.pos.x, this.dog.pos.y);
    this.dogArrow.setVisible(off);
    if (!off) return;
    const ang = Math.atan2(this.dog.pos.y - view.centerY, this.dog.pos.x - view.centerX);
    const halfW = VIEWPORT.w / 2 - 10;
    const halfH = VIEWPORT.h / 2 - 10;
    const t = Math.min(
      halfW / Math.max(1e-6, Math.abs(Math.cos(ang))),
      halfH / Math.max(1e-6, Math.abs(Math.sin(ang))),
    );
    this.dogArrow.setPosition(VIEWPORT.w / 2 + Math.cos(ang) * t, VIEWPORT.h / 2 + Math.sin(ang) * t);
    this.dogArrow.setRotation(ang + Math.PI / 2);
    this.dogArrow.setColor(this.dog.state === 'pointing' ? '#ffd23f' : '#f2e3c6');
  }

  private showSummary(): void {
    this.summaryShown = true;

    // Convert the dog's work into XP (breed XP rate applies).
    const ev = this.hunt.xpEvents;
    const base = 2 * ev.pointFlushes + ev.retrieves + 3 * ev.downedOverPoint;
    const gained = Math.round(base * this.breed.xpRate);
    let career = recordHunt(loadCareer(), this.hunt.areaId, this.hunt.downed, this.hunt.escaped);
    let levelMsg: string | null = null;
    if (this.kennelDog && gained > 0) {
      const res = awardDogXp(career, this.kennelDog.id, gained);
      career = res.career;
      this.kennelDog = career.kennel.find((d) => d.id === this.kennelDog!.id) ?? this.kennelDog;
      if (res.levelsGained > 0) levelMsg = `LEVEL UP! ${this.kennelDog.name} is level ${res.newLevel}!`;
    }
    saveCareer(career);

    const cx = VIEWPORT.w / 2;
    const cy = VIEWPORT.h / 2;
    this.add.rectangle(cx, cy, VIEWPORT.w, VIEWPORT.h, 0x000000, 0.65).setScrollFactor(0).setDepth(20);
    const total = this.hunt.birds.length;
    this.add
      .text(cx, cy - 42, 'HUNT OVER', { fontFamily: 'monospace', fontSize: '16px', color: '#ffd23f' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(21);
    this.add
      .text(cx, cy - 18, `${this.area.name} — downed: ${this.hunt.downed} / ${total}   lost: ${this.hunt.escaped}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(21);
    if (this.kennelDog) {
      this.add
        .text(cx, cy + 0, `${this.kennelDog.name} +${gained} xp`, {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#9fd88f',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(21);
    }
    if (levelMsg) {
      this.add
        .text(cx, cy + 14, levelMsg, { fontFamily: 'monospace', fontSize: '9px', color: '#ffd23f' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(21);
    }
    this.summaryButton(cx - 62, cy + 36, 'hunt again', () => this.scene.restart({ areaId: this.area.id }));
    this.summaryButton(cx + 62, cy + 36, 'menu', () => this.scene.start('TitleScene'));
  }

  private summaryButton(x: number, y: number, label: string, onTap: () => void): void {
    this.add
      .rectangle(x, y, 104, 20, 0x101410, 0.85)
      .setScrollFactor(0)
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
      .setScrollFactor(0)
      .setDepth(22);
  }

  private checkFlush(): void {
    if (this.dog.state !== 'pointing' || this.dog.pointedBirdId === null) return;
    const bird = this.hunt.birds.find((b) => b.id === this.dog.pointedBirdId);
    if (!bird || bird.state !== 'hidden') return;
    if (dist(this.hunt.hunterPos, bird.pos) <= FLUSH_RADIUS) {
      this.flush(bird, 'proximity');
    }
  }

  private flush(bird: Bird, cause: 'proximity' | 'nerve' | 'bump' | 'scent' | 'spook'): void {
    this.flushing = true;
    const flushed = flushCovey(this.hunt.birds, bird.id);
    playFlush();
    this.cameras.main.flash(180, 255, 244, 214);

    // Held points that produce a flush earn the dog XP; bumps don't count.
    const pointedCredit =
      (cause === 'proximity' || cause === 'nerve') && this.dog.pointedBirdId === bird.id;
    if (pointedCredit) this.hunt.xpEvents.pointFlushes++;

    // Steady dogs stand through the rise; soft ones break chase.
    this.dog.onFlush(Math.random, bird.pos);

    const hunterDist = dist(this.hunt.hunterPos, bird.pos);
    const label =
      cause === 'proximity'
        ? flushed.length > 1
          ? 'COVEY FLUSH!'
          : 'FLUSH!'
        : cause === 'nerve'
          ? 'FLUSHED WILD!'
          : cause === 'bump'
            ? 'BUMPED!'
            : cause === 'spook'
              ? 'SPOOKED!'
              : 'WINDED!';
    this.add
      .text(bird.pos.x, bird.pos.y - 10, label, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: cause === 'proximity' ? '#ffffff' : '#ff8c3f',
      })
      .setOrigin(0.5);

    if (hunterDist <= SHOT_RANGE) {
      this.time.delayedCall(450, () => {
        this.scene.start('FlushScene', {
          hunt: this.hunt,
          birdIds: flushed.map((b) => b.id),
          flushDistance: hunterDist,
          dog: this.dog,
          dogPointed: pointedCredit,
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
    const w = this.area.world;
    const g = this.add.graphics();
    g.fillStyle(this.area.grass).fillRect(w.x, w.y, w.w, w.h);
    g.fillStyle(this.area.cover);
    for (const patch of this.area.patches) {
      g.fillRect(patch.x, patch.y, patch.w, patch.h);
    }
    // Landmark trees, scattered from a stable per-area seed so the covert
    // looks the same every visit.
    const seed = [...this.area.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const rng = mulberry32(seed);
    const treeCount = Math.round((w.w * w.h) / 30_000);
    g.fillStyle(0x6b4a2a);
    for (let i = 0; i < treeCount; i++) {
      g.fillRect(w.x + 8 + rng() * (w.w - 24), w.y + 8 + rng() * (w.h - 24), 8, 8);
    }
  }
}
