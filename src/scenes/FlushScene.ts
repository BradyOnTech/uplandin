import Phaser from 'phaser';
import { playCackle, playShot, playThud, playThunder, playTwitter, unlockAudio } from '../audio';
import { getArea } from '../game/areas';
import { relightSurvivors, YOUNG_FLIGHT_MULT, type Bird } from '../game/birds';
import type { Dog } from '../game/dog';
import { slopeFlightMult, type SlopeApproach } from '../game/fieldcraft';
import { getGun, type GunConfig } from '../game/guns';
import { clamp, dist } from '../game/math';
import { regionOfArea } from '../game/regions';
import {
  flushHasVegBlock,
  GUN_MUZZLE_OFFSET,
  GUN_REST,
  pickBackdropIndex,
  recoilOffset,
  stepGunPose,
  type GunPose,
} from '../game/gunAim';
import { escapeVelocityFan, exitDirFor, flushBias, glideStep, hitTest, levelStep } from '../game/shot';
import { getSpecies, type SpeciesConfig } from '../game/species';
import type { HuntState } from '../game/state';
import type { Vec2 } from '../game/types';
import { windMults } from '../game/wind';
import { addWeatherFx } from './weatherFx';
import { pixelText, type PixelText } from './pixelFont';

const GROUND_Y = 205;
const TOUCH_AIM_OFFSET = 56; // crosshair rides above your finger on touch
// Duck Hunt rules the sky: fun beats covey realism in this view. At most a
// few readable targets airborne at once — the rest of the covey queues and
// rises as slots free, so a big covey is a longer sequence, not a blob.
const MAX_AIRBORNE = 3;
const LAUNCH_GAP_MS = 300; // minimum breath between launches
const WAVE_SLOT_SPREAD = 78; // px between the three airborne lanes

// Depth ladder: birds depth-sort by height (0..~205), so everything that
// must draw over them starts well above that.
const DEPTH_SHADOW = 2;
const DEPTH_TIMBER = 220; // grouse fly BEHIND the trees — that's the screen
const DEPTH_VEG = 225; // mid-ground brush that can block the pattern
const DEPTH_GUN = 270;
const DEPTH_FEATHERS = 240;
const DEPTH_WEATHER = 250;
const DEPTH_UI = 280;
const DEPTH_FLASH = 290;
const DEPTH_CROSSHAIR = 300;

/**
 * Painted backdrop pools per region. First key is the canonical plate;
 * further keys are variants so consecutive flushes don't share a stage set.
 * Regions without a pool fall back to the drawn sky.
 */
const FLUSH_BACKDROP_POOLS: Record<string, string[]> = {
  'southern-plains': [
    'flush-bg-southern-plains',
    'flush-bg-southern-plains-b',
    'flush-bg-southern-plains-c',
  ],
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
  /** Per-bird depth: covey mates fly at different distances, not one plane. */
  depthBias: number;
  /** Ground shadow — shrinks and fades as the bird climbs. Sells the height. */
  shadow: Phaser.GameObjects.Ellipse;
  /** Per-bird jink intensity — some birds fly straight, some corkscrew. */
  wobbleMult: number;
  /** Time on the wing — drives the glide and level-off flight phases. */
  airMs: number;
  /** Locked once a flight phase begins: which screen edge this bird is leaving by. */
  exitDir?: 1 | -1;
  /** Sleeper: rises a beat after its wave — the straggler at your feet. */
  launchDelayMs: number;
  status: 'waiting' | 'launching' | 'flying' | 'falling' | 'done';
}

/**
 * Duck Hunt-style shooting view — the arcade heart of the game.
 *
 * How a rise is computed (knobs for every stage in docs/TUNING.md):
 *   1. flushBias(walk-in distance) sets the rise's size/difficulty,
 *      with wild/gift overrides — skill loads the dice, never replaces them
 *   2. waves: up to MAX_AIRBORNE burst together across shuffled lanes;
 *      next wave when the sky clears; ~18% sleepers rise late
 *   3. per-bird velocity: species fan slice + lateral push + speed roll
 *      + per-flush break direction + slope/young multipliers
 *   4. flight phases: quail glide / rooster level-off, both driving for a
 *      screen exit (the tilted playfield — birds NEVER float mid-sky)
 *   5. presentation: species size × altitude shrink × per-bird depth,
 *      ground shadows, wobble, flap rate; depth ladder above
 *   6. resolution: hens fine the hunter; escapees may relight as singles
 *      (birds.relightSurvivors) or hun-circle-back if wild-flushed
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
  private shellPips: Phaser.GameObjects.GameObject[] = [];
  private hud!: PixelText;
  /** Timber the pattern can't punch through (grouse cover). */
  private trees: { x: number; y: number; w: number; h: number }[] = [];
  /** Mid-ground brush rects that also block the pattern (fair silhouette). */
  private vegBlocks: { x: number; y: number; w: number; h: number }[] = [];
  private lastLaunchAt = -Infinity;
  private flushSounds = new Set<string>();
  private gunSprite: Phaser.GameObjects.Image | null = null;
  private gunPose: GunPose = { ...GUN_REST };
  private gunWantMounted = false;

  constructor() {
    super('FlushScene');
  }

  preload(): void {
    // Already-cached keys are skipped, so this is a no-op after the first visit.
    this.load.image('flush-bg-southern-plains', 'art/flush-backdrop-southern-plains.png');
    this.load.image('flush-bg-southern-plains-b', 'art/flush-backdrop-southern-plains-b.png');
    this.load.image('flush-bg-southern-plains-c', 'art/flush-backdrop-southern-plains-c.png');
    this.load.image('icon-shell', 'art/icon-shell.png');
    this.load.image('icon-crosshair', 'art/icon-crosshair.png');
    // NOTE: the generated shotgun-fp.png / shotgun-side.png plates were cut —
    // a full-height FP barrel can't work at 480×270 (it owns the playfield).
    // The gun is drawn procedurally in makeShotgun() as a hunter's-eye
    // corner gun; a future painted sprite must match its 30×148 vertical
    // layout — muzzle/barrels/brass receiver/stock/hand (spec in ART.md).
    this.load.image('flush-veg-block', 'art/flush-veg-block.png');
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

    this.cameras.main.fadeIn(160, 16, 20, 16);
    // Stable seed per rise: wind angle bits + bird ids — same rise = same plate.
    const flushSeed =
      Math.floor(this.hunt.wind * 1000) +
      data.birdIds.reduce((a, id) => a + id * 17, 0) +
      Math.floor((data.flushDistance ?? 25) * 3);
    this.drawSky(flushSeed);
    this.makeCrosshair();
    addWeatherFx(this, this.hunt.condition, false, DEPTH_WEATHER);
    // The slope shot: from above they drop away slow and open; from below
    // they rocket over your head.
    const slope = data.slopeApproach ?? null;
    const slopeMult = slopeFlightMult(slope);
    this.makeTimber(data.birdIds);
    this.makeVegBlocks(flushSeed);
    this.gunPose = { ...GUN_REST };
    this.gunWantMounted = false;
    this.makeShotgun();

    this.flushSounds.clear();
    this.lastLaunchAt = -Infinity;
    // Skill-linked difficulty: a tight walk-in means big close birds; a
    // scramble at the edge of range means the rise is already small and far.
    const bias = flushBias(data.flushDistance ?? 25);
    // Every rise gets its own character: a break direction (coveys don't
    // scatter symmetrically — they break somewhere) and shuffled lanes per
    // wave, so a single bird can rise anywhere and no two flushes repeat.
    const flushDrift = (Math.random() - 0.5) * 56;
    let lanePerm: number[] = [];
    data.birdIds.forEach((id, i) => {
      const fieldBird = this.hunt.birds.find((b) => b.id === id)!;
      const species = getSpecies(fieldBird.speciesId);
      if (i % MAX_AIRBORNE === 0) {
        lanePerm = Phaser.Utils.Array.Shuffle([0, 1, 2]);
      }
      const lane = lanePerm[i % MAX_AIRBORNE];
      const vel = escapeVelocityFan(species.flight, lane, MAX_AIRBORNE);
      // Hot rolls and lazy rolls: some birds are screamers, some loaf —
      // and a wild rise comes out hotter across the board.
      const speedRoll = (bias.kind === 'wild' ? 0.95 : 0.85) + Math.random() * 0.45;
      vel.x *= speedRoll;
      vel.y *= speedRoll;
      vel.x += flushDrift;
      vel.x *= slopeMult;
      vel.y *= slopeMult * (slope === 'above' ? 0.85 : 1); // dropping away below you
      if (fieldBird.young) {
        vel.x *= YOUNG_FLIGHT_MULT; // a young bird hasn't got its wings yet
        vel.y *= YOUNG_FLIGHT_MULT;
      }
      // Arcade placement: lanes stay central and readable; the field position
      // only nudges them (this view runs on Duck Hunt rules, not covey GPS).
      const worldNudge = clamp((fieldBird.pos.x - this.hunt.hunterPos.x) * 0.35, -55, 55);
      const launchX = clamp(
        240 + (lane - 1) * WAVE_SLOT_SPREAD + worldNudge + (Math.random() * 2 - 1) * 16,
        60,
        420,
      );
      const launchY = GROUND_Y - 4 - Math.random() * 18;
      // Steer back toward the middle only on true edge launches.
      if ((launchX < 100 && vel.x < 0) || (launchX > 380 && vel.x > 0)) {
        vel.x *= -1;
      }
      const sprite = this.makeBirdSprite(fieldBird, species, launchX, launchY);
      sprite.setFlipX(vel.x < 0);
      sprite.setVisible(false);
      const shadow = this.add
        .ellipse(launchX, GROUND_Y + 4, Math.round(18 * (species.size ?? 1)), 5, 0x1e2316, 0.28)
        .setDepth(DEPTH_SHADOW)
        .setVisible(false);
      this.birds.push({
        id,
        fieldBird,
        species,
        sprite,
        vel,
        wobble: i * 2.1,
        depthBias: bias.min + Math.random() * (bias.max - bias.min),
        wobbleMult: 0.6 + Math.random(),
        shadow,
        airMs: 0,
        launchDelayMs: Math.random() < 0.18 ? 350 + Math.random() * 550 : 0,
        status: 'waiting',
      });
    });

    const crossKey = this.textures.exists('icon-crosshair') ? 'icon-crosshair' : 'crosshair';
    this.crosshair = this.add.sprite(240, 120, crossKey).setDepth(DEPTH_CROSSHAIR);
    this.input.setDefaultCursor('none');
    // Mount as soon as the pointer moves or the finger is down.
    this.input.on('pointermove', () => {
      this.gunWantMounted = true;
    });
    this.input.on('pointerdown', () => {
      this.gunWantMounted = true;
    });

    this.shellPips = [];
    for (let i = 0; i < this.gun.shells; i++) {
      // Painted shell icons when the art pipeline has delivered them.
      if (this.textures.exists('icon-shell')) {
        this.shellPips.push(
          this.add.image(8 + i * 10, 252, 'icon-shell').setOrigin(0, 0.5).setDepth(DEPTH_UI),
        );
      } else {
        this.shellPips.push(
          this.add.rectangle(6 + i * 8, 252, 5, 10, 0xd6402c).setOrigin(0, 0.5).setDepth(DEPTH_UI),
        );
      }
    }
    const lead = this.birds[0];
    const henWarning = this.birds.some((b) => b.fieldBird.sex === 'hen') ? '  —  watch for hens!' : '';
    const slopeNote =
      slope === 'above' ? '  —  shooting down the hill' : slope === 'below' ? '  —  rocketing overhead!' : '';
    const wildNote = bias.kind === 'wild' ? "  —  they're wild!" : '';
    this.hud = pixelText(this, 4,
      4,
      (data.birdIds.length > 1 ? `covey rise! ${data.birdIds.length} ${lead.species.name}s` : `${lead.species.name}!`) +
        henWarning +
        slopeNote +
        wildNote, 1, '#ffffff').setDepth(DEPTH_UI);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      unlockAudio();
      this.shoot(p);
    });
  }

  /**
   * Launch the next WAVE — up to three birds bursting together, the covey
   * thunder. A new wave waits until the sky is clear, so every round of
   * shooting is readable and every rise actually looks like one.
   */
  private tryLaunch(time: number): void {
    if (this.birds.some((b) => b.status === 'flying' || b.status === 'launching')) return;
    if (time - this.lastLaunchAt < LAUNCH_GAP_MS) return;
    const wave = this.birds.filter((b) => b.status === 'waiting').slice(0, MAX_AIRBORNE);
    if (wave.length === 0) return;
    this.lastLaunchAt = time;
    for (const bird of wave) {
      if (bird.launchDelayMs > 0) {
        // The sleeper: everyone's swinging on the wave when this one pops.
        bird.status = 'launching';
        this.time.delayedCall(bird.launchDelayMs, () => {
          if (bird.status !== 'launching') return;
          bird.status = 'flying';
          bird.sprite.setVisible(true);
        });
        continue;
      }
      bird.status = 'flying';
      bird.sprite.setVisible(true);
      // Signature flush sounds, once per species per rise. Hens don't cackle.
      const sp = bird.species;
      const soundKey = sp.sound && !(sp.sound === 'cackle' && bird.fieldBird.sex === 'hen') ? sp.id : null;
      if (soundKey && sp.sound && !this.flushSounds.has(soundKey)) {
        this.flushSounds.add(soundKey);
        if (sp.sound === 'cackle') playCackle();
        else if (sp.sound === 'twitter') playTwitter();
        else playThunder();
      }
    }
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    this.tryLaunch(time);

    const p = this.input.activePointer;
    const yOff = p.wasTouch ? TOUCH_AIM_OFFSET : 0;
    const aimX = p.worldX;
    const aimY = p.worldY - yOff;
    this.crosshair.setPosition(aimX, aimY);
    // Shotgun sways toward the crosshair with lag (pure math in gunAim.ts),
    // plus the recoil kick settling after each shot.
    if (this.gunSprite) {
      this.gunPose = stepGunPose(this.gunPose, aimX, aimY, this.gunWantMounted || p.isDown, dt);
      const kick = recoilOffset(this.time.now - this.lastShotAt);
      this.gunSprite.setPosition(this.gunPose.x, this.gunPose.y + kick.dy);
      this.gunSprite.setAngle(this.gunPose.angleDeg + kick.dAngleDeg);
    }

    for (const b of this.birds) {
      if (b.status === 'flying') {
        b.airMs += delta;
        const flight = b.species.flight;
        // Quail move: burst, then lock wings and glide — always driving for
        // a screen exit, never floating mid-sky.
        if (flight.glideAfterMs !== undefined && b.airMs > flight.glideAfterMs) {
          b.exitDir ??= exitDirFor(b.vel.x, b.sprite.x);
          glideStep(b.vel, b.exitDir, dt);
          if (b.sprite.anims.isPlaying) {
            b.sprite.stop();
            b.sprite.setFrame(1); // wings locked
          }
          b.sprite.setFlipX(b.vel.x < 0);
        }
        // Rooster move: stop climbing and accelerate into a fast crossing exit.
        if (flight.levelAfterMs !== undefined && b.airMs > flight.levelAfterMs) {
          b.exitDir ??= exitDirFor(b.vel.x, b.sprite.x);
          levelStep(b.vel, b.exitDir, dt);
          b.sprite.setFlipX(b.vel.x < 0);
        }
        b.wobble += dt * 9;
        b.sprite.x += b.vel.x * dt + Math.sin(b.wobble) * b.species.flight.wobble * b.wobbleMult * dt;
        b.sprite.y += b.vel.y * dt;
        if (b.sprite.y < -16 || b.sprite.x < -16 || b.sprite.x > 496 || b.sprite.y > GROUND_Y + 20) {
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
      if (b.status === 'flying' || b.status === 'falling') {
        // Depth cue: a rising bird is a departing bird — it shrinks with
        // altitude (and a falling one grows back on the way down), each
        // covey mate carries its own distance, and species set the base
        // size: a quail is a small fast target, a rooster a barn door.
        b.sprite.setScale(
          (b.species.size ?? 1) * clamp(1 - (GROUND_Y - b.sprite.y) / 650, 0.55, 1) * b.depthBias,
        );
        b.sprite.setDepth(b.sprite.y);
        // The ground shadow tracks under the bird, shrinking and fading
        // with altitude — the cheapest possible statement of height.
        const altFrac = clamp((GROUND_Y - b.sprite.y) / 300, 0, 1);
        b.shadow.setVisible(true);
        b.shadow.x = b.sprite.x;
        b.shadow.setScale((1 - 0.55 * altFrac) * b.depthBias);
        b.shadow.setAlpha(0.28 * (1 - 0.6 * altFrac));
      } else {
        b.shadow.setVisible(false);
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
    const spent = this.shellPips[this.shells];
    if (spent instanceof Phaser.GameObjects.Rectangle) spent.setFillStyle(0x333333);
    else if (spent instanceof Phaser.GameObjects.Image) spent.setTint(0x444444).setAlpha(0.45);
    playShot();

    const aim = { x: p.worldX, y: p.worldY - (p.wasTouch ? TOUCH_AIM_OFFSET : 0) };
    // Muzzle flash at the barrel tip — two frames of star, half the recoil feel.
    if (this.gunSprite) {
      const mx = this.gunSprite.x + GUN_MUZZLE_OFFSET.x;
      const my = this.gunSprite.y + GUN_MUZZLE_OFFSET.y;
      const flash = this.add.graphics().setDepth(DEPTH_GUN + 1);
      flash.fillStyle(0xfff3c0, 1).fillCircle(mx, my, 5);
      flash.fillStyle(0xd9b25f, 0.9);
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i + Math.PI / 4 + Math.random() * 0.4;
        flash.fillRect(mx + Math.cos(a) * 6 - 1, my + Math.sin(a) * 6 - 1, 2, 5);
      }
      this.time.delayedCall(80, () => flash.destroy());
    }
    // Spent hull flick: tiny shell arc out of the action.
    if (this.textures.exists('icon-shell')) {
      const hull = this.add.image(aim.x + 10, aim.y + 8, 'icon-shell').setDepth(DEPTH_UI).setScale(0.9);
      this.tweens.add({
        targets: hull,
        x: aim.x + 28,
        y: aim.y + 36,
        angle: 140,
        alpha: 0,
        duration: 280,
        onComplete: () => hull.destroy(),
      });
    }
    // Hit-pause feel: brief global tween slowdown so the shot lands in the hand.
    this.tweens.timeScale = 0.12;
    this.time.delayedCall(70, () => {
      this.tweens.timeScale = 1;
    });
    this.cameras.main.shake(90, 0.006);
    const flash = this.add.circle(aim.x, aim.y, 3, 0xfff2c9).setDepth(DEPTH_FLASH);
    this.tweens.add({
      targets: flash,
      scale: 5,
      alpha: 0,
      duration: 160,
      onComplete: () => flash.destroy(),
    });

    this.gunWantMounted = true;
    // Grouse cover / mid-ground brush: the pattern can't punch through.
    if (this.trees.some((t) => aim.x >= t.x && aim.x <= t.x + t.w && aim.y >= t.y && aim.y <= t.y + t.h)) {
      pixelText(this, aim.x, aim.y - 10, 'thwack — timber!', 1, '#c9dcc0')
        .setOrigin(0.5)
        .setDepth(DEPTH_UI);
      return;
    }
    if (this.vegBlocks.some((t) => aim.x >= t.x && aim.x <= t.x + t.w && aim.y >= t.y && aim.y <= t.y + t.h)) {
      pixelText(this, aim.x, aim.y - 10, 'thwack — brush!', 1, '#c9dcc0')
        .setOrigin(0.5)
        .setDepth(DEPTH_UI);
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
      this.spawnFeathers(best.sprite.x, best.sprite.y);
      this.hunt.downed++;
      if (best.fieldBird.sex === 'hen') {
        this.hunt.henDowns++;
        pixelText(this, best.sprite.x, best.sprite.y - 12, "HEN! that's a fine", 1, '#ff6a5a')
          .setOrigin(0.5)
          .setDepth(DEPTH_UI);
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
      area.patches,
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
      pixelText(this, 4, 16, `${relit.length} single${relit.length > 1 ? 's' : ''} put down in the grass — hunt 'em up`, 1, '#c9dcc0')
        .setDepth(DEPTH_UI);
    }

    this.time.delayedCall(1500, () => {
      this.input.setDefaultCursor('default');
      this.scene.start('FieldScene', { hunt: this.hunt, dogs: this.dogs });
    });
  }

  /** A puff of feathers hangs where the shot connected. */
  private spawnFeathers(x: number, y: number): void {
    if (!this.textures.exists('feather')) {
      const g = this.add.graphics();
      g.fillStyle(0xf2e3c6).fillRect(0, 0, 2, 2);
      g.fillStyle(0x8a5a2b).fillRect(1, 1, 2, 2);
      g.generateTexture('feather', 3, 3);
      g.destroy();
    }
    const burst = this.add
      .particles(x, y, 'feather', {
        speed: { min: 40, max: 130 },
        angle: { min: 210, max: 330 }, // up and outward
        gravityY: 150,
        lifespan: { min: 350, max: 750 },
        scale: { start: 1, end: 0.5 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        emitting: false,
      })
      .setDepth(DEPTH_FEATHERS);
    burst.explode(12);
    this.time.delayedCall(900, () => burst.destroy());
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
      const g = this.add.graphics().setDepth(DEPTH_TIMBER);
      g.fillStyle(0x4a3626).fillRect(trunk.x, trunk.y, trunk.w, trunk.h);
      g.fillStyle(0x2c4a30).fillRect(canopy.x, canopy.y, canopy.w, canopy.h);
      g.fillStyle(0x35573a).fillRect(canopy.x + 4, canopy.y + 6, canopy.w - 8, canopy.h - 12);
      this.trees.push(trunk, canopy);
    }
  }

  private drawSky(flushSeed = 0): void {
    // Pick a plate from the region's pool so consecutive flushes vary.
    const regionId = regionOfArea(this.hunt.areaId).id;
    const pool = (FLUSH_BACKDROP_POOLS[regionId] ?? []).filter((k) => this.textures.exists(k));
    if (pool.length > 0) {
      const key = pool[pickBackdropIndex(pool.length, flushSeed)];
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

  /** Mid-ground ragweed/cattail silhouettes that can block a shell (~40% of rises). */
  private makeVegBlocks(flushSeed: number): void {
    this.vegBlocks = [];
    if (!flushHasVegBlock(flushSeed) || !this.textures.exists('flush-veg-block')) return;
    // One or two clumps in the lower sky — readable silhouettes, fair block boxes.
    const count = 1 + ((flushSeed >>> 3) % 2);
    for (let i = 0; i < count; i++) {
      const x = 70 + ((flushSeed * (i + 3) * 47) % 300);
      const y = GROUND_Y - 36;
      const img = this.add.image(x, y, 'flush-veg-block').setOrigin(0.5, 1).setDepth(DEPTH_VEG);
      img.setFlipX(i % 2 === 1);
      // Hit box slightly inside the sprite so edge aims still clear.
      this.vegBlocks.push({ x: x - 40, y: y - 40, w: 80, h: 36 });
    }
  }

  private makeShotgun(): void {
    // The v3 FPS gun: authored in PERSPECTIVE, from behind — huge stock and
    // hand at the bottom edge, twin barrels converging to a tiny far muzzle
    // (DOOM's trick at 320×200; the foreshortening is what reads as "held").
    // A painted 90×130 sprite named art/shotgun-fp-v3.png replaces this
    // placeholder the moment it lands: add its preload line and it wins.
    const painted = this.textures.exists('shotgun-fp-v3');
    if (!painted && !this.textures.exists('shotgun-gen3')) {
      const W = 90;
      const H = 130;
      const BARREL_END = 64; // barrels give way to the action here
      const RECEIVER_END = 84; // brass band ends, walnut begins
      const cx = (y: number) => 40 + (y / H) * 24; // muzzle left, stock right
      const g = this.add.graphics();
      for (let y = 0; y < H; y++) {
        const c = Math.round(cx(y));
        if (y < BARREL_END) {
          // Receding tubes: width grows toward the viewer; near the muzzle
          // the two bores read as one, then split as they approach.
          const w = Math.round(12 + (y / BARREL_END) * 22);
          const x0 = c - Math.round(w / 2);
          g.fillStyle(0x101410).fillRect(x0, y, w, 1); // outline base
          g.fillStyle(0x2c343b).fillRect(x0 + 1, y, w - 2, 1); // steel
          g.fillStyle(0x47535c).fillRect(x0 + 1, y, 2, 1); // left sheen
          g.fillStyle(0x47535c).fillRect(x0 + w - 3, y, 2, 1); // right sheen
          if (y > 14) g.fillStyle(0x14171a).fillRect(c - 1, y, 2, 1); // bores split
        } else if (y < RECEIVER_END) {
          // Engraved brass action, widening toward the shooter.
          const w = Math.round(34 + ((y - BARREL_END) / (RECEIVER_END - BARREL_END)) * 14);
          const x0 = c - Math.round(w / 2);
          g.fillStyle(0x101410).fillRect(x0, y, w, 1);
          g.fillStyle(0xc9a24a).fillRect(x0 + 1, y, w - 2, 1);
          g.fillStyle(0x8a6a28).fillRect(x0 + 1, y, 4, 1);
          if (y % 3 === 0) g.fillStyle(0x8a6a28).fillRect(c + 6, y, 2, 1); // engraving
        } else {
          // Walnut stock sweeping down-right into the frame edge.
          const w = Math.round(48 + ((y - RECEIVER_END) / (H - RECEIVER_END)) * 24);
          const x0 = c - Math.round(w / 2) + 4;
          g.fillStyle(0x101410).fillRect(x0, y, w, 1);
          g.fillStyle(0x5a3a20).fillRect(x0 + 1, y, w - 2, 1);
          g.fillStyle(0x7a5230).fillRect(x0 + 5, y, w - 14, 1);
          if (y % 5 === 0) g.fillStyle(0x3c2814).fillRect(x0 + 8, y, w - 20, 1); // grain
        }
      }
      // Breech line where barrels meet the action.
      g.fillStyle(0x14171a).fillRect(Math.round(cx(BARREL_END)) - 18, BARREL_END, 36, 2);
      // Gloved forend hand on the left of the barrels — chunky, mitten-simple.
      const hx = Math.round(cx(58)) - 34;
      g.fillStyle(0x101410).fillRect(hx - 1, 55, 22, 26);
      g.fillStyle(0x2e2620).fillRect(hx, 56, 20, 24);
      g.fillStyle(0x453a2e).fillRect(hx + 2, 58, 16, 4); // knuckle highlight
      g.fillStyle(0x453a2e).fillRect(hx + 2, 66, 16, 2);
      g.fillStyle(0x453a2e).fillRect(hx + 2, 72, 16, 2);
      // Muzzle face + brass bead, the smallest and farthest element.
      g.fillStyle(0x14171a).fillRect(34, 0, 12, 2);
      g.fillStyle(0xd9b25f).fillRect(39, 0, 2, 2);
      g.generateTexture('shotgun-gen3', W, H);
      g.destroy();
    }
    this.gunSprite = this.add
      .image(GUN_REST.x, GUN_REST.y, painted ? 'shotgun-fp-v3' : 'shotgun-gen3')
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_GUN)
      .setAngle(GUN_REST.angleDeg);
  }

  /**
   * Real sprite-sheet birds where the art pipeline has delivered one
   * (wing-whir animation, folded frame on the fall); generated
   * palette-rectangle sprites for everyone else until their sheets land.
   */
  private makeBirdSprite(
    bird: Bird,
    species: SpeciesConfig,
    x: number,
    y: number,
  ): Phaser.GameObjects.Sprite {
    const sheet = BIRD_SHEETS[species.id];
    if (sheet && this.textures.exists(sheet)) {
      const animKey = `${sheet}-flap`;
      if (!this.anims.exists(animKey)) {
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(sheet, { start: 0, end: 1 }),
          // Wingbeat is species character: quail buzz, roosters row.
          frameRate: species.flight.flapRate ?? 14,
          repeat: -1,
        });
      }
      const sprite = this.add.sprite(x, y, sheet, 0);
      sprite.play(animKey);
      return sprite;
    }
    return this.add.sprite(x, y, this.birdTexture(bird, species));
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
    // Painted icon loads in preload; only generate a procedural fallback.
    if (this.textures.exists('icon-crosshair') || this.textures.exists('crosshair')) return;
    const g = this.add.graphics();
    g.lineStyle(1, 0xffffff);
    g.strokeCircle(8, 8, 7);
    g.lineBetween(8, 0, 8, 16);
    g.lineBetween(0, 8, 16, 8);
    g.generateTexture('crosshair', 17, 17);
    g.destroy();
  }
}
