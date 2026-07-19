import Phaser from 'phaser';
import { playBeeper, playBell, playBlip, playFlush, playPoint, playWhistle, unlockAudio } from '../audio';
import { AREAS, getArea, type AreaConfig } from '../game/areas';
import {
  birdsScentingDog,
  birdsSpookedBy,
  circleBack,
  flushCovey,
  updateBirdNerve,
  updateBirds,
  type Bird,
} from '../game/birds';
import { conditionMults } from '../game/conditions';
import { FLANK_NERVE_MULT, isFlanking, slopeApproach, slopeNerveMult } from '../game/fieldcraft';
import { dogScentRadius, getBreed, type BreedConfig } from '../game/breeds';
import {
  activeDog,
  awardDogXp,
  awardHunterXp,
  braceDog,
  loadCareer,
  recordHunt,
  saveCareer,
  type KennelDog,
} from '../game/career';
import { devDogLevel } from '../game/dev';
import { Dog, WHISTLE_RANGE, type DogState } from '../game/dog';
import { VIEWPORT } from '../game/field';
import { dist, moveToward, mulberry32, windArrow } from '../game/math';
import { gearTierFor, twoDogUnlocked, unlocksAtLevel } from '../game/progression';
import type { QuickConfig } from '../game/quick';
import { getSpecies } from '../game/species';
import { birdsRemaining, createHunt, huntComplete, type HuntState } from '../game/state';
import type { Vec2 } from '../game/types';
import { windMults } from '../game/wind';

const HUNTER_SPEED = 55; // px/s walking
const SPRINT_MULT = 2; // sprint speed multiplier
const SPRINT_SPOOK_RADIUS = 30; // running this close to a hidden bird flushes it underfoot
const SPRINT_NERVE_MULT = 1.6; // pointed birds hear you coming
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DIST = 30;
const FLUSH_RADIUS = 22; // hunter this close to a pointed bird flushes it
const SHOT_RANGE = 40; // max hunter distance for a shooting chance on a wild flush

const HEN_FINE_XP = 4; // dropping a protected hen fines the hunter this much XP

const BELL_INTERVAL_MS = 620; // tinkle cadence while a dog moves
const BELL_HEARING = 700; // px at which the bell fades to nothing
const BELL_VOLUME = 0.16;
const BEEPER_INTERVAL_MS = 1400; // locate-beep cadence while on point (gear tier 1+)
/** States where the bell rings — a standing (pointing/honoring/heeled) dog is silent. */
const BELL_STATES: DogState[] = ['quartering', 'tracking', 'breaking', 'retrieving', 'recalled'];

const COLOR_DOG = 0xf2e3c6;
const COLOR_HUNTER = 0xd6402c;
const TINT_SECOND_DOG = 0xd8c090; // the bracemate wears a darker coat
const TINT_POINTING = 0xffd23f;
const TINT_HONORING = 0xa8d4e8; // backing dog reads cool blue

// Whistle button zone (bottom-right corner, screen coords). Taps here don't move the hunter.
const WHISTLE_BTN = { x: 452, y: 246, w: 48, h: 20 };

/**
 * Top-down view of the field. The world is bigger than the screen; the camera
 * follows the hunter — never the dogs. One dog or a brace of two: when one
 * points, a finished packmate honors the point and backs it.
 */
export class FieldScene extends Phaser.Scene {
  hunt!: HuntState;
  dogs: Dog[] = [];
  private area!: AreaConfig;
  private kennelDogs: (KennelDog | null)[] = [];
  private breeds: BreedConfig[] = [];
  private devLevel: number | null = null;
  private quick: QuickConfig | null = null;
  private gearTier = 0;
  private beeperMs = 0;

  private hunterTarget: Vec2 | null = null;
  private sprinting = false;
  private lastTapMs = 0;
  private lastTapPos: Vec2 = { x: -999, y: -999 };
  private shiftKey?: Phaser.Input.Keyboard.Key;
  private flushing = false;
  private summaryShown = false;
  private prevDogStates: DogState[] = [];
  private recallPending = false;
  private bellMs = 0;

  private dogSprites: Phaser.GameObjects.Sprite[] = [];
  private hunterSprite!: Phaser.GameObjects.Sprite;
  private pointMarkers: Phaser.GameObjects.Text[] = [];
  private dogArrows: Phaser.GameObjects.Text[] = [];
  private dogDistLabels: Phaser.GameObjects.Text[] = [];
  private miniMap: { x: number; y: number; sx: number; sy: number } | null = null;
  private miniHunter!: Phaser.GameObjects.Rectangle;
  private miniDogs: Phaser.GameObjects.Rectangle[] = [];
  private hud!: Phaser.GameObjects.Text;
  private whistleLabel!: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text | null = null;
  private birdMarkers: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super('FieldScene');
  }

  create(data: { hunt?: HuntState; areaId?: string; dogs?: Dog[]; quick?: QuickConfig }): void {
    // Quick Hunt: the picked setup rides inside HuntState so it survives the
    // trip through FlushScene. Career mode reads the kennel as usual.
    this.quick = data.quick ?? data.hunt?.quick ?? null;
    this.area = data.hunt
      ? getArea(data.hunt.areaId)
      : getArea(data.areaId ?? this.quick?.areaId ?? AREAS[0].id);
    const career = loadCareer();
    this.gearTier = this.quick?.gearTier ?? gearTierFor(career.hunter.level);
    this.hunt =
      data.hunt ??
      createHunt(
        this.area,
        Math.random,
        this.quick && this.quick.wind !== 'random' ? this.quick.wind : undefined,
        this.quick?.gunId ?? career.hunter.shotgunId,
        this.quick && this.quick.weather !== 'random' ? this.quick.weather : undefined,
      );
    if (this.quick) this.hunt.quick = this.quick;

    // Who's hunting: one dog, or a brace of two.
    this.devLevel = this.quick ? null : devDogLevel(window.location.search);
    if (this.quick) {
      this.breeds = [getBreed(this.quick.breedId)];
      if (this.quick.breed2Id !== 'none') this.breeds.push(getBreed(this.quick.breed2Id));
      this.kennelDogs = this.breeds.map(() => null);
    } else {
      const lead = activeDog(career);
      const mate = twoDogUnlocked(career.hunter.level) ? braceDog(career) : null;
      this.kennelDogs = mate ? [lead, mate] : [lead];
      this.breeds = this.kennelDogs.map((d) => (d ? getBreed(d.breedId) : getBreed('gsp')));
    }
    const levels = this.kennelDogs.map((kd) =>
      this.quick ? this.quick.level : this.devLevel ?? kd?.level ?? 1,
    );
    // Dog instances ride through FlushScene and back so breaking chase,
    // creep state, and heading survive the transition.
    this.dogs =
      data.dogs ??
      this.breeds.map(
        (breed, i) =>
          new Dog({ ...this.hunt.dogsPos[i] }, { breed, level: levels[i] }, Math.random, this.area.world),
      );
    this.dogs.forEach((dog, i) => {
      dog.profile = { breed: this.breeds[i], level: levels[i] };
    });

    this.flushing = false;
    this.hunterTarget = null;
    this.sprinting = false;
    this.summaryShown = false;
    this.prevDogStates = this.dogs.map((d) => d.state);
    this.recallPending = false;
    this.bellMs = 0;
    this.beeperMs = 0;
    this.toastText = null;

    this.makeTextures();
    this.drawField();

    this.hunterSprite = this.add.sprite(this.hunt.hunterPos.x, this.hunt.hunterPos.y, 'hunter');
    this.dogSprites = this.dogs.map((dog) => this.add.sprite(dog.pos.x, dog.pos.y, 'dog'));
    this.pointMarkers = this.dogs.map(() =>
      this.add
        .text(0, 0, '!', { fontFamily: 'monospace', fontSize: '10px', color: '#ffd23f' })
        .setOrigin(0.5)
        .setVisible(false),
    );

    // Camera: bounded to the world, glued to the hunter.
    const cam = this.cameras.main;
    cam.setBounds(this.area.world.x, this.area.world.y, this.area.world.w, this.area.world.h);
    cam.startFollow(this.hunterSprite, true, 0.12, 0.12);

    // Edge arrows: where each dog is when it works off-screen. What they
    // show depends on tracking gear: bell (nothing), beeper (only on
    // point), GPS (always, plus live distance), GPS+map (minimap too).
    this.dogArrows = this.dogs.map(() =>
      this.add
        .text(0, 0, '▲', { fontFamily: 'monospace', fontSize: '10px', color: '#f2e3c6' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(15)
        .setVisible(false),
    );
    this.dogDistLabels = this.dogs.map(() =>
      this.add
        .text(0, 0, '', { fontFamily: 'monospace', fontSize: '8px', color: '#f2e3c6' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(15)
        .setVisible(false),
    );

    if (this.gearTier >= 3) {
      const w = this.area.world;
      const mapW = 90;
      const mapH = Math.round((mapW * w.h) / w.w);
      const mapX = VIEWPORT.w - mapW - 6;
      const mapY = 6;
      this.add.rectangle(mapX, mapY, mapW, mapH, 0x101410, 0.7).setOrigin(0, 0).setScrollFactor(0).setDepth(14);
      this.miniHunter = this.add.rectangle(0, 0, 2, 2, 0xd6402c).setScrollFactor(0).setDepth(15);
      this.miniDogs = this.dogs.map(() => this.add.rectangle(0, 0, 2, 2, 0xf2e3c6).setScrollFactor(0).setDepth(15));
      this.miniMap = { x: mapX, y: mapY, sx: mapW / w.w, sy: mapH / w.h };
    } else {
      this.miniMap = null;
    }

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

    // Whistle button + keyboard shortcut call the dogs back to the hunter.
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

  private dogName(i: number): string {
    return this.quick ? this.breeds[i].name : this.kennelDogs[i]?.name ?? 'dog';
  }

  private whistle(): void {
    unlockAudio();
    if (this.summaryShown || this.flushing) return;
    playWhistle();
    if (this.dogs.every((d) => d.state === 'heel')) {
      this.dogs.forEach((d) => d.castOff());
      return;
    }
    // The blast goes out either way; a dog only hears it inside whistle
    // range — unless the GPS+map handheld pages the collars directly.
    this.recallPending = true;
    const allDeaf = this.dogs.every(
      (d) => d.state !== 'heel' && dist(d.pos, this.hunt.hunterPos) > WHISTLE_RANGE,
    );
    if (this.gearTier < 3 && allDeaf) this.toast('out of earshot...');
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

    updateBirds(delta, this.hunt.birds, this.dogs[0].pos, {
      bounds: this.area.world,
      patches: this.area.patches,
      slopeAngle: this.area.slope,
    });
    const recall = this.recallPending;
    this.recallPending = false;
    const wind = windMults(this.hunt.windStrength);
    const weather = conditionMults(this.hunt.condition);

    for (let i = 0; i < this.dogs.length; i++) {
      const dog = this.dogs[i];
      const packmate = this.dogs.find((d, j) => j !== i && d.state === 'pointing');
      const retrievedBefore = this.hunt.birds.filter((b) => b.state === 'retrieved').length;
      dog.update(delta, this.hunt.birds, {
        hunterPos: this.hunt.hunterPos,
        windAngle: this.hunt.wind,
        scentMult: wind.scent * weather.scent,
        recall,
        whistleRange: this.gearTier >= 3 ? Infinity : undefined,
        honorPoint: packmate?.pos,
        drainMult: weather.stamina,
        searchMult: weather.search,
      });
      this.hunt.dogsPos[i] = { ...dog.pos };

      if (dog.state === 'pointing' && this.prevDogStates[i] !== 'pointing') playPoint();
      this.prevDogStates[i] = dog.state;

      // Whoever picked the bird up gets the retrieve.
      const retrievedNow = this.hunt.birds.filter((b) => b.state === 'retrieved').length;
      if (retrievedNow > retrievedBefore) {
        playBlip();
        this.hunt.dogWork[i].retrieves += retrievedNow - retrievedBefore;
      }

      // The dog may bump birds itself — creeping on point or breaking chase.
      if (dog.bumpedBirdId !== null) {
        const bumped = this.hunt.birds.find((b) => b.id === dog.bumpedBirdId);
        dog.bumpedBirdId = null;
        if (bumped && !this.flushing) {
          this.flush(bumped, 'bump', null);
          return;
        }
      }

      // Downwind birds can scent an inexperienced dog — and flush on their own.
      if (dog.state === 'quartering' || dog.state === 'tracking') {
        const scented = birdsScentingDog(
          this.hunt.birds,
          dog.pos,
          this.hunt.wind,
          dogScentRadius(dog.level) * wind.dogScent,
        );
        if (scented.length > 0 && !this.flushing) {
          this.flush(scented[0], 'scent', null);
          return;
        }
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
        this.flush(spooked[0], 'spook', null);
        return;
      }
    }

    // ...and pointed birds hear him coming: nerve drains faster. Fieldcraft
    // helps: approach from above on a slope (their escape is cut off) or
    // flank the point instead of walking over the dog, and they hold.
    for (let i = 0; i < this.dogs.length; i++) {
      const dog = this.dogs[i];
      if (dog.state !== 'pointing') continue;
      let nerveMult = dog.pressure * (running ? SPRINT_NERVE_MULT : 1);
      const pointed = this.hunt.birds.find((b) => b.id === dog.pointedBirdId);
      if (pointed) {
        nerveMult *= slopeNerveMult(slopeApproach(this.area.slope, this.hunt.hunterPos, pointed.pos));
        if (isFlanking(this.hunt.hunterPos, dog.pos, pointed.pos)) nerveMult *= FLANK_NERVE_MULT;
      }
      const wild = updateBirdNerve(delta, this.hunt.birds, dog.pointedBirdId, nerveMult);
      if (wild) {
        this.flush(wild, 'nerve', i);
        return;
      }
    }

    this.hunterSprite.setPosition(this.hunt.hunterPos.x, this.hunt.hunterPos.y);
    this.dogs.forEach((dog, i) => {
      const sprite = this.dogSprites[i];
      sprite.setPosition(dog.pos.x, dog.pos.y);
      sprite.setFlipX(Math.cos(dog.heading) < 0);
      const marker = this.pointMarkers[i];
      if (dog.state === 'pointing') {
        sprite.setTint(TINT_POINTING);
        // The point marker shows the bird's nerve: gold → orange → blinking red.
        const pointed = this.hunt.birds.find((b) => b.id === dog.pointedBirdId);
        const nerveFrac = pointed
          ? Math.max(0, Math.min(1, pointed.nerveMs / getSpecies(pointed.speciesId).nerveMaxMs))
          : 1;
        marker.setColor(nerveFrac > 0.6 ? '#ffd23f' : nerveFrac > 0.3 ? '#ff8c3f' : '#ff4040');
        marker.setVisible(nerveFrac >= 0.3 || Math.floor(time / 120) % 2 === 0);
        marker.setPosition(dog.pos.x, dog.pos.y - 8);
      } else {
        if (dog.state === 'honoring') sprite.setTint(TINT_HONORING);
        else if (i === 1) sprite.setTint(TINT_SECOND_DOG);
        else sprite.clearTint();
        marker.setVisible(false);
      }
    });

    // Debug markers track the birds (runners move).
    this.birdMarkers.forEach((m, i) => m.setPosition(this.hunt.birds[i].pos.x, this.hunt.birds[i].pos.y));

    this.updateBell(delta);
    this.updateDogArrows();

    const dogLines = this.dogs
      .map((dog, i) => {
        const staminaFilled = Math.ceil((dog.staminaMs / dog.maxStaminaMs) * 5);
        const pips = `[${'#'.repeat(staminaFilled)}${'-'.repeat(5 - staminaFilled)}]`;
        return `${this.dogName(i)} lv${dog.level}${this.devLevel !== null ? ' (dev)' : ''} ${dog.state}${dog.winded ? ' winded' : ''} ${pips}`;
      })
      .join('\n');
    const slopeNote = this.area.slope !== undefined ? `   uphill ${windArrow(this.area.slope)}` : '';
    this.hud.setText(
      `${this.hunt.condition} · wind ${windArrow(this.hunt.wind)} ${this.hunt.windStrength}${slopeNote}   birds: ${birdsRemaining(this.hunt)}   downed: ${this.hunt.downed}   lost: ${this.hunt.escaped}${running ? '   RUNNING' : ''}\n` +
        dogLines,
    );
    this.whistleLabel.setText(this.dogs.every((d) => d.state === 'heel') ? 'cast off' : 'whistle');

    this.checkFlush();

    if (!this.flushing && !this.summaryShown && huntComplete(this.hunt)) {
      this.showSummary();
    }
  }

  /**
   * Tracking gear, tier 0: bells tinkle while a dog moves, fade with
   * distance, and go silent on point. Tier 1 adds the beeper collar:
   * sharp locate beeps while a dog stands on point.
   */
  private updateBell(delta: number): void {
    this.bellMs += delta;
    if (this.bellMs >= BELL_INTERVAL_MS) {
      this.bellMs = 0;
      const moving = this.dogs.filter((d) => BELL_STATES.includes(d.state));
      if (moving.length > 0) {
        const d = Math.min(...moving.map((dog) => dist(dog.pos, this.hunt.hunterPos)));
        playBell(BELL_VOLUME * Math.max(0, 1 - d / BELL_HEARING));
      }
    }
    if (this.gearTier >= 1 && this.dogs.some((d) => d.state === 'pointing')) {
      this.beeperMs += delta;
      if (this.beeperMs >= BEEPER_INTERVAL_MS) {
        this.beeperMs = 0;
        playBeeper();
      }
    } else {
      this.beeperMs = BEEPER_INTERVAL_MS; // first beep lands the moment the point starts
    }
  }

  /**
   * Edge arrows show what your gear can tell you: nothing on the bell,
   * point-only direction on the beeper, always plus live distance on GPS.
   * GPS+map also keeps the minimap current.
   */
  private updateDogArrows(): void {
    if (this.miniMap) {
      this.miniHunter.setPosition(
        this.miniMap.x + this.hunt.hunterPos.x * this.miniMap.sx,
        this.miniMap.y + this.hunt.hunterPos.y * this.miniMap.sy,
      );
      this.dogs.forEach((dog, i) => {
        this.miniDogs[i].setPosition(
          this.miniMap!.x + dog.pos.x * this.miniMap!.sx,
          this.miniMap!.y + dog.pos.y * this.miniMap!.sy,
        );
        this.miniDogs[i].setFillStyle(
          dog.state === 'pointing' ? 0xffd23f : dog.state === 'honoring' ? 0xa8d4e8 : 0xf2e3c6,
        );
      });
    }

    const view = this.cameras.main.worldView;
    this.dogs.forEach((dog, i) => {
      const off = !view.contains(dog.pos.x, dog.pos.y);
      const show =
        off && (this.gearTier >= 2 || (this.gearTier === 1 && dog.state === 'pointing'));
      this.dogArrows[i].setVisible(show);
      this.dogDistLabels[i].setVisible(show && this.gearTier >= 2);
      if (!show) return;
      const ang = Math.atan2(dog.pos.y - view.centerY, dog.pos.x - view.centerX);
      const halfW = VIEWPORT.w / 2 - 10;
      const halfH = VIEWPORT.h / 2 - 10;
      const t = Math.min(
        halfW / Math.max(1e-6, Math.abs(Math.cos(ang))),
        halfH / Math.max(1e-6, Math.abs(Math.sin(ang))),
      );
      const ax = VIEWPORT.w / 2 + Math.cos(ang) * t;
      const ay = VIEWPORT.h / 2 + Math.sin(ang) * t;
      this.dogArrows[i].setPosition(ax, ay);
      this.dogArrows[i].setRotation(ang + Math.PI / 2);
      this.dogArrows[i].setColor(
        dog.state === 'pointing' ? '#ffd23f' : i === 1 ? '#d8c090' : '#f2e3c6',
      );
      if (this.gearTier >= 2) {
        this.dogDistLabels[i].setText(String(Math.round(dist(dog.pos, this.hunt.hunterPos))));
        this.dogDistLabels[i].setPosition(ax - Math.cos(ang) * 16, ay - Math.sin(ang) * 16);
      }
    });
  }

  private showSummary(): void {
    this.summaryShown = true;

    // Convert each dog's work into XP (breed XP rate applies). The hen fine
    // comes out of the hunter's XP — he pulled the trigger, not the dog.
    const fine = HEN_FINE_XP * this.hunt.henDowns;
    const hunterGained = Math.max(0, this.hunt.downed + this.hunt.doubles + 2 - fine);
    const lines: { text: string; color: string }[] = [];
    if (this.quick) {
      lines.push({ text: 'quick hunt — career untouched', color: '#9fb896' });
    } else {
      let career = recordHunt(loadCareer(), this.hunt.areaId, this.hunt.downed, this.hunt.escaped);
      this.kennelDogs.forEach((kd, i) => {
        if (!kd) return;
        const work = this.hunt.dogWork[i];
        const gained = Math.round(
          (2 * work.pointFlushes + work.retrieves + 3 * work.downedOverPoint) * this.breeds[i].xpRate,
        );
        lines.push({ text: `${kd.name} +${gained} xp`, color: '#9fd88f' });
        if (gained > 0) {
          const res = awardDogXp(career, kd.id, gained);
          career = res.career;
          const updated = career.kennel.find((d) => d.id === kd.id);
          if (updated && res.levelsGained > 0) {
            lines.push({ text: `LEVEL UP! ${updated.name} is level ${res.newLevel}!`, color: '#ffd23f' });
          }
        }
      });
      if (this.hunt.henDowns > 0) {
        lines.push({
          text: `${this.hunt.henDowns} hen${this.hunt.henDowns > 1 ? 's' : ''} down — game warden fines you ${fine} xp`,
          color: '#ff6a5a',
        });
      }
      const before = career.hunter.level;
      const hres = awardHunterXp(career, hunterGained);
      career = hres.career;
      lines.push({ text: `hunter +${hunterGained} xp${this.hunt.doubles > 0 ? ' (double!)' : ''}`, color: '#8fc7ff' });
      if (hres.levelsGained > 0) {
        lines.push({ text: `HUNTER LEVEL ${hres.newLevel}!`, color: '#ffd23f' });
        for (let lvl = before + 1; lvl <= hres.newLevel; lvl++) {
          for (const unlock of unlocksAtLevel(lvl)) {
            lines.push({ text: `unlocked: ${unlock}`, color: '#ffd23f' });
          }
        }
      }
      saveCareer(career);
    }

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
    lines.forEach((line, i) => {
      this.add
        .text(cx, cy - 2 + i * 11, line.text, { fontFamily: 'monospace', fontSize: '8px', color: line.color })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(21);
    });
    const buttonY = Math.max(cy + 44, cy - 2 + lines.length * 11 + 16);
    if (this.quick) {
      this.summaryButton(cx - 62, buttonY, 'hunt again', () => this.scene.restart({ quick: this.quick }));
      this.summaryButton(cx + 62, buttonY, 'setup', () => this.scene.start('QuickScene'));
    } else {
      this.summaryButton(cx - 62, buttonY, 'hunt again', () => this.scene.restart({ areaId: this.area.id }));
      this.summaryButton(cx + 62, buttonY, 'menu', () => this.scene.start('TitleScene'));
    }
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
    for (let i = 0; i < this.dogs.length; i++) {
      const dog = this.dogs[i];
      if (dog.state !== 'pointing' || dog.pointedBirdId === null) continue;
      const bird = this.hunt.birds.find((b) => b.id === dog.pointedBirdId);
      if (!bird || bird.state !== 'hidden') continue;
      if (dist(this.hunt.hunterPos, bird.pos) <= FLUSH_RADIUS) {
        this.flush(bird, 'proximity', i);
        return;
      }
    }
  }

  private flush(
    bird: Bird,
    cause: 'proximity' | 'nerve' | 'bump' | 'scent' | 'spook',
    pointingSlot: number | null,
  ): void {
    this.flushing = true;
    const flushed = flushCovey(this.hunt.birds, bird.id);
    playFlush();
    this.cameras.main.flash(180, 255, 244, 214);

    // Held points that produce a flush earn that dog XP; bumps don't count.
    const pointedCredit =
      pointingSlot != null &&
      (cause === 'proximity' || cause === 'nerve') &&
      this.dogs[pointingSlot]?.pointedBirdId === bird.id;
    if (pointedCredit) this.hunt.dogWork[pointingSlot].pointFlushes++;

    // Steady dogs stand through the rise; soft ones break chase.
    for (const dog of this.dogs) dog.onFlush(Math.random, bird.pos);

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
          dogs: this.dogs,
          pointingSlot: pointedCredit ? pointingSlot : null,
          slopeApproach: slopeApproach(this.area.slope, this.hunt.hunterPos, bird.pos),
        });
      });
      return;
    }

    // Too far off: the birds are gone before the hunter can mount the gun —
    // unless it's a hun covey, which swings a wide loop and relands (once).
    const relanded = circleBack(
      this.hunt.birds,
      flushed.map((b) => b.id),
      this.area.world,
      Math.random,
      windMults(this.hunt.windStrength).nerve * conditionMults(this.hunt.condition).nerve,
    );
    if (relanded.length > 0) {
      this.add
        .text(bird.pos.x, bird.pos.y + 2, 'the covey swings wide and relands — mark them!', {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#c9dcc0',
        })
        .setOrigin(0.5);
      this.time.delayedCall(900, () => {
        this.flushing = false;
      });
      return;
    }
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
