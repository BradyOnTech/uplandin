import Phaser from 'phaser';
import {
  playBeeper,
  playBell,
  playBlip,
  playFootstep,
  playFlush,
  playPoint,
  playScentCheck,
  playWhistle,
  unlockAudio,
} from '../audio';
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
  advanceCareerWeeks,
  awardDogXp,
  awardHunterXp,
  braceDog,
  dogAge,
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
import { ageMult, dateLabel, educatedNerveMult, HOME_HUNT_WEEKS, openMix, seasonalBias, seasonOver, TRIP_HUNT_WEEKS, youngShare } from '../game/season';
import { regionOfArea } from '../game/regions';
import { getSpecies } from '../game/species';
import { birdsRemaining, createHunt, endHuntEarly, huntComplete, type HuntState } from '../game/state';
import type { Vec2 } from '../game/types';
import { windMults } from '../game/wind';
import { addWeatherFx } from './weatherFx';
import { pixelText, type PixelText } from './pixelFont';

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
const FOOT_INTERVAL_MS = 280; // hunter walk cadence

// Pokémon-grade movement: frames advance by DISTANCE TRAVELED, not by
// wall-clock — feet plant instead of sliding, at every speed (sprint,
// winded trot, tracking) with no per-state frame-rate table to maintain.
const HUNTER_STEP_PX = 7; // one walk frame per this many px of travel
const DOG_STRIDE_PX = 9; // one gait frame per this many px (4-frame cycle ≈ a body length)
/** The dog only turns around when its heading is decisively sideways —
 * near-vertical serpentine crossings keep the last facing (no flip jitter). */
const FLIP_DEADBAND = 0.25;
const FOOT_SPRINT_MS = 160;
/** States where the bell rings — a standing (pointing/honoring/heeled) dog is silent. */
const BELL_STATES: DogState[] = ['quartering', 'tracking', 'breaking', 'retrieving', 'recalled'];

const COLOR_DOG = 0xf2e3c6;
const COLOR_HUNTER = 0xd6402c;
const TINT_SECOND_DOG = 0xd8c090; // the bracemate wears a darker coat
const TINT_POINTING = 0xffd23f;
const TINT_HONORING = 0xa8d4e8; // backing dog reads cool blue

// Art pipeline rollout (same pattern as FlushScene's FLUSH_BACKDROPS /
// BIRD_SHEETS): breeds and regions with painted assets use them, everything
// else keeps the placeholder textures until its art lands.
const DOG_SHEETS: Record<string, string> = { 'english-setter': 'setter-field' };
/** Painted dogs draw at full sheet size (32×20): the dog is the star of the
 * field view and reads from across the room, mockup-style. Purely visual —
 * every mechanical radius is in sim px and unchanged. */
const DOG_SHEET_SCALE = 1;
/** Sheet layout (english-setter-sheet-alpha.png): 0–3 run, 4 point, 5 heel, 6 retrieve. */
const DOG_FRAME_POINT = 4;
const DOG_FRAME_HEEL = 5;
const DOG_FRAME_RETRIEVE = 6;
const DOG_FRAME_COUNT = 7;
const HUNTER_SHEET = 'hunter-field';
// Directional sheets (Pokémon-grade): rows select by heading.
// hunter-dirs: 3×3 of 20×28 — row 0 toward camera, 1 away, 2 side;
// cols: stand, step-L, step-R. Walk is the Emerald 4-beat: L, stand, R, stand.
const HUNTER_DIRS_SHEET = 'hunter-dirs';
const HUNTER_DIR_ROW = { down: 0, up: 1, side: 2 } as const;
const HUNTER_WALK_SEQ = [1, 0, 2, 0];
// english-setter-dirs: 3×2 of 32×20 — row 0 away, 1 toward; cols: trot A,
// trot B, LOCKED POINT. Side view keeps the richer 7-frame sheet.
const DOG_DIR_SHEETS: Record<string, string> = { 'english-setter': 'english-setter-dirs' };
const DOG_DIR_ROW = { up: 0, down: 1 } as const;
const DOG_DIR_POINT_COL = 2;
/** Enter an end-on facing only when decisively vertical; leave it early —
 * the side rows are the best art, so they win all diagonals. */
const FACING_ENTER_SIN = 0.85;
const FACING_EXIT_SIN = 0.7;
const HUNTER_FRAME_IDLE = 0;
const HUNTER_WALK_FRAMES = [1, 2, 3];
/**
 * Painted hunter sheet is 16×20 vs setter 32×20 — without scale the dog
 * reads as the giant. 1.45 puts them co-equal at GBA overworld weight.
 */
const HUNTER_SHEET_SCALE = 1.45;
// End-hunt control (top-right corner, screen coords).
const END_HUNT_BTN = { x: 428, y: 18, w: 88, h: 18 };
const FIELD_TILESETS: Record<string, string> = { 'southern-plains': 'tiles-southern-plains' };
// Tileset frame order (fixed by the art pipeline): open grass, cover,
// mesquite landmark, two-track (unused until areas define roads).
const TILE_OPEN = 0;
const TILE_COVER = 1;
const TILE_MESQUITE = 2;

// Whistle button zone (bottom-right corner, screen coords). Taps here don't move the hunter.
const WHISTLE_BTN = { x: 452, y: 246, w: 48, h: 20 };

/** Brighten/darken a 0xRRGGBB color by a factor. */
function scaleColor(c: number, f: number): number {
  const ch = (v: number) => Math.min(255, Math.round(v * f));
  return (ch((c >> 16) & 0xff) << 16) | (ch((c >> 8) & 0xff) << 8) | ch(c & 0xff);
}

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
  /** Soft ground blobs under hunter/dogs — sell contact with the prairie. */
  private hunterShadow!: Phaser.GameObjects.Ellipse;
  private dogShadows: Phaser.GameObjects.Ellipse[] = [];
  /** Landmarks that participate in Y-sort with actors. */
  private landmarkSprites: Phaser.GameObjects.Image[] = [];
  private windLeanGfx: Phaser.GameObjects.Graphics | null = null;
  private windLeanMs = 0;
  private pointMarkers: PixelText[] = [];
  private dogArrows: PixelText[] = [];
  private dogDistLabels: PixelText[] = [];
  private miniMap: { x: number; y: number; sx: number; sy: number } | null = null;
  private miniHunter!: Phaser.GameObjects.Rectangle;
  private miniDogs: Phaser.GameObjects.Rectangle[] = [];
  private hud!: PixelText;
  private whistleLabel!: PixelText;
  private toastText: PixelText | null = null;
  /** Hidden (B-key debug) + always-on downed bird field sprites. */
  private birdMarkers: Phaser.GameObjects.Sprite[] = [];
  private footMs = 0;
  // Distance-driven stepping state (see HUNTER_STEP_PX / DOG_STRIDE_PX).
  private hunterStepAcc = 0;
  private hunterStepFrame = 0;
  private prevHunterPos: Vec2 = { x: 0, y: 0 };
  private dogStepAcc: number[] = [];
  private dogStepFrame: number[] = [];
  private prevDogPos: Vec2[] = [];
  private dogFaceLeft: boolean[] = [];
  private hunterFacing: 'down' | 'up' | 'side' = 'down';
  private hunterSideLeft = false;
  private dogFacing: ('side' | 'up' | 'down')[] = [];
  /** Blade-shake tones for the rustle burst, matched to the covert's cover. */
  private rustleColors: number[] = [];
  private prevDogStatesForScent: DogState[] = [];

  constructor() {
    super('FieldScene');
  }

  preload(): void {
    // Already-cached keys are skipped, so this is a no-op after the first visit.
    this.load.spritesheet('setter-field', 'art/english-setter-sheet-alpha.png', {
      frameWidth: 32,
      frameHeight: 20,
    });
    this.load.spritesheet(HUNTER_DIRS_SHEET, 'art/hunter-dirs.png', {
      frameWidth: 20,
      frameHeight: 28,
    });
    this.load.spritesheet('english-setter-dirs', 'art/english-setter-dirs.png', {
      frameWidth: 32,
      frameHeight: 20,
    });
    this.load.spritesheet(HUNTER_SHEET, 'art/hunter-sheet-alpha.png', {
      frameWidth: 16,
      frameHeight: 20,
    });
    this.load.spritesheet('tiles-southern-plains', 'art/tileset-southern-plains.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
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
        this.quick
          ? {
              wind: this.quick.wind !== 'random' ? this.quick.wind : undefined,
              gunId: this.quick.gunId,
              condition: this.quick.weather !== 'random' ? this.quick.weather : undefined,
            }
          : {
              // Career: the calendar shapes the hunt — what's open, how the
              // weather leans, how naive or educated the birds are.
              gunId: career.hunter.shotgunId,
              conditionBias: seasonalBias(career.date.week, this.area.conditionBias),
              mix: openMix(this.area, career.date.week),
              youngShare: youngShare(career.date.week),
              educatedMult: educatedNerveMult(career.date.week),
            },
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
    // The calendar ages the body: a growing pup or an old campaigner is a
    // touch slower and shallower-winded. Quick Hunt dogs are always prime.
    const ageMults = this.kennelDogs.map((kd) =>
      this.quick || !kd ? 1 : ageMult(dogAge(career, kd)),
    );
    // Dog instances ride through FlushScene and back so breaking chase,
    // creep state, and heading survive the transition.
    this.dogs =
      data.dogs ??
      this.breeds.map(
        (breed, i) =>
          new Dog(
            { ...this.hunt.dogsPos[i] },
            { breed, level: levels[i], ageMult: ageMults[i] },
            Math.random,
            this.area.world,
          ),
      );
    this.dogs.forEach((dog, i) => {
      dog.profile = { breed: this.breeds[i], level: levels[i], ageMult: ageMults[i] };
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
    this.landmarkSprites = [];
    this.drawField();
    // Weather you can see: tint + falling snow/rain pinned to the camera,
    // above the world (depth 13) and below the HUD (15).
    addWeatherFx(this, this.hunt.condition, true, 13);

    // Ground contact: shallow ellipses under every actor (depth under bodies).
    this.hunterShadow = this.add
      .ellipse(this.hunt.hunterPos.x, this.hunt.hunterPos.y + 5, 10, 4, 0x1e2316, 0.28)
      .setDepth(1);
    this.dogShadows = this.dogs.map((dog) =>
      this.add.ellipse(dog.pos.x, dog.pos.y + 4, 14, 5, 0x1e2316, 0.28).setDepth(1),
    );

    const hunterKey = this.textures.exists(HUNTER_DIRS_SHEET)
      ? HUNTER_DIRS_SHEET // native 20×28, ×1 — retires the ×1.45 scale hack
      : this.textures.exists(HUNTER_SHEET)
        ? HUNTER_SHEET
        : 'hunter';
    this.hunterSprite = this.add.sprite(this.hunt.hunterPos.x, this.hunt.hunterPos.y, hunterKey);
    if (hunterKey === HUNTER_DIRS_SHEET) {
      // Integer scale law: authored at native size, drawn at ×1.
      this.hunterSprite.setFrame(HUNTER_DIR_ROW.down * 3);
      this.hunterShadow.setSize(14, 5);
    } else if (hunterKey === HUNTER_SHEET) {
      this.hunterSprite.setScale(HUNTER_SHEET_SCALE);
      this.hunterSprite.setFrame(HUNTER_FRAME_IDLE);
      // Shadow scales with the painted hunter.
      this.hunterShadow.setSize(14, 5);
    }
    this.dogSprites = this.dogs.map((dog, i) => {
      const sheet = this.dogSheet(i);
      const sprite = this.add.sprite(dog.pos.x, dog.pos.y, sheet ?? 'dog');
      if (sheet) {
        sprite.setScale(DOG_SHEET_SCALE);
        if (!this.anims.exists(`${sheet}-run`)) {
          this.anims.create({
            key: `${sheet}-run`,
            frames: this.anims.generateFrameNumbers(sheet, { frames: [0, 1, 2, 3] }),
            frameRate: 7, // four-frame lope reads smoother slower than a 2-frame skitter
            repeat: -1,
          });
        }
      }
      return sprite;
    });
    // Wind tell: sparse grass ticks that lean with the hunt wind (screen space).
    this.windLeanGfx = this.add.graphics().setScrollFactor(0).setDepth(12);
    this.windLeanMs = 0;
    this.pointMarkers = this.dogs.map(() =>
      pixelText(this, 0, 0, '!', 1, '#ffd23f')
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
      pixelText(this, 0, 0, '▲', 1, '#f2e3c6')
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(15)
        .setVisible(false),
    );
    this.dogDistLabels = this.dogs.map(() =>
      pixelText(this, 0, 0, '', 1, '#f2e3c6')
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
      this.drawUiPanel(mapX - 2, mapY - 2, mapW + 4, mapH + 4, 14);
      this.add.rectangle(mapX, mapY, mapW, mapH, 0x0c120e, 0.85).setOrigin(0, 0).setScrollFactor(0).setDepth(14);
      this.miniHunter = this.add.rectangle(0, 0, 2, 2, 0xd6402c).setScrollFactor(0).setDepth(15);
      this.miniDogs = this.dogs.map(() => this.add.rectangle(0, 0, 2, 2, 0xf2e3c6).setScrollFactor(0).setDepth(15));
      this.miniMap = { x: mapX, y: mapY, sx: mapW / w.w, sy: mapH / w.h };
    } else {
      this.miniMap = null;
    }

    this.hud = pixelText(this, 4, 4, '', 1, '#ffffff')
      .setScrollFactor(0)
      .setDepth(15);
    pixelText(this, VIEWPORT.w / 2, VIEWPORT.h - 8, 'tap to walk · double-tap to run', 1, '#dfe9d8')
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(15);

    // Field birds: downed always visible; hidden only with B (debug).
    this.birdMarkers = this.hunt.birds.map((b) => {
      const key = b.state === 'downed' ? 'bird-downed' : 'bird-hidden';
      return this.add.sprite(b.pos.x, b.pos.y, key).setVisible(b.state === 'downed').setDepth(8);
    });
    this.input.keyboard?.on('keydown-B', () => {
      this.birdMarkers.forEach((m, i) => {
        const bird = this.hunt.birds[i];
        if (bird.state === 'downed') {
          m.setVisible(true);
          return;
        }
        if (bird.state === 'hidden') m.setVisible(!m.visible);
        else m.setVisible(false);
      });
    });
    this.footMs = 0;
    this.prevDogStatesForScent = this.dogs.map((d) => d.state);
    this.hunterStepAcc = 0;
    this.hunterStepFrame = 0;
    this.prevHunterPos = { ...this.hunt.hunterPos };
    this.dogStepAcc = this.dogs.map(() => 0);
    this.dogStepFrame = this.dogs.map(() => 0);
    this.prevDogPos = this.dogs.map((d) => ({ ...d.pos }));
    this.dogFaceLeft = this.dogs.map((d) => Math.cos(d.heading) < 0);
    this.hunterFacing = 'down';
    this.hunterSideLeft = false;
    this.dogFacing = this.dogs.map(() => 'side');
    // Rustle blades take the same tones as the organic cover render.
    const rustleTiled = !!FIELD_TILESETS[regionOfArea(this.area.id).id];
    // Light shade leads: kicked blades must read against the dark thicket.
    this.rustleColors = rustleTiled
      ? [0x8a8248, 0x6e6832, 0x545026]
      : [scaleColor(this.area.cover, 1.55), scaleColor(this.area.cover, 1.3), this.area.cover];

    // Whistle button + keyboard shortcut call the dogs back to the hunter.
    this.drawUiPanel(WHISTLE_BTN.x - WHISTLE_BTN.w / 2 - 2, WHISTLE_BTN.y - WHISTLE_BTN.h / 2 - 2, WHISTLE_BTN.w + 4, WHISTLE_BTN.h + 4, 15);
    const btn = this.add
      .rectangle(WHISTLE_BTN.x, WHISTLE_BTN.y, WHISTLE_BTN.w, WHISTLE_BTN.h, 0x14201c, 0.92)
      .setScrollFactor(0)
      .setDepth(15)
      .setInteractive();
    this.whistleLabel = pixelText(this, WHISTLE_BTN.x, WHISTLE_BTN.y, 'whistle', 1, '#dfe9d8')
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(16);
    btn.on('pointerdown', () => this.whistle());
    this.input.keyboard?.on('keydown-W', () => this.whistle());
    this.input.keyboard?.on('keydown-SPACE', () => this.whistle());
    this.shiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // End hunt early — top-right, Esc/E also work.
    this.drawUiPanel(END_HUNT_BTN.x - END_HUNT_BTN.w / 2 - 2, END_HUNT_BTN.y - END_HUNT_BTN.h / 2 - 2, END_HUNT_BTN.w + 4, END_HUNT_BTN.h + 4, 15);
    const endBtn = this.add
      .rectangle(END_HUNT_BTN.x, END_HUNT_BTN.y, END_HUNT_BTN.w, END_HUNT_BTN.h, 0x1a1410, 0.92)
      .setScrollFactor(0)
      .setDepth(15)
      .setInteractive();
    pixelText(this, END_HUNT_BTN.x, END_HUNT_BTN.y, 'end hunt', 1, '#e8c9a0')
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(16);
    endBtn.on('pointerdown', () => this.requestEndHunt());
    this.input.keyboard?.on('keydown-E', () => this.requestEndHunt());
    this.input.keyboard?.on('keydown-ESC', () => this.requestEndHunt());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      unlockAudio();
      // Summary buttons handle their own taps.
      if (this.summaryShown) return;
      if (this.flushing) return;
      // Taps on the end-hunt control are commands, not walk orders.
      if (
        p.x > END_HUNT_BTN.x - END_HUNT_BTN.w / 2 &&
        p.x < END_HUNT_BTN.x + END_HUNT_BTN.w / 2 &&
        p.y > END_HUNT_BTN.y - END_HUNT_BTN.h / 2 &&
        p.y < END_HUNT_BTN.y + END_HUNT_BTN.h / 2
      ) {
        return;
      }
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
    this.toastText = pixelText(this, VIEWPORT.w / 2, 24, msg, 1, '#ffb0a0')
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
        patches: this.area.patches,
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
    this.hunterShadow.setPosition(this.hunt.hunterPos.x, this.hunt.hunterPos.y + 5);
    // Hunter facing + walk/idle. The directional branch below owns flipX;
    // this legacy flip only serves the single-row sheet and placeholder.
    if (this.hunterTarget && this.hunterSprite.texture.key !== HUNTER_DIRS_SHEET) {
      const dx = this.hunterTarget.x - this.hunt.hunterPos.x;
      if (Math.abs(dx) > 0.5) this.hunterSprite.setFlipX(dx < 0);
    }
    const hunterKey = this.hunterSprite.texture.key;
    if (hunterKey === HUNTER_DIRS_SHEET || hunterKey === HUNTER_SHEET) {
      // Feet plant: the walk frame advances by distance covered, so sprint
      // legs pump double-time and there is no ice-skating at any speed.
      const hdx = this.hunt.hunterPos.x - this.prevHunterPos.x;
      const hdy = this.hunt.hunterPos.y - this.prevHunterPos.y;
      const moved = Math.hypot(hdx, hdy);
      this.hunterSprite.anims.stop();
      if (moved >= 0.01) {
        // Facing follows the dominant movement axis, sticky on diagonals.
        if (Math.abs(hdy) > Math.abs(hdx) * 1.2) this.hunterFacing = hdy > 0 ? 'down' : 'up';
        else if (Math.abs(hdx) > Math.abs(hdy) * 1.2) this.hunterFacing = 'side';
        if (Math.abs(hdx) > 0.05) this.hunterSideLeft = hdx < 0;
        this.hunterStepAcc += moved;
        while (this.hunterStepAcc >= HUNTER_STEP_PX) {
          this.hunterStepAcc -= HUNTER_STEP_PX;
          this.hunterStepFrame = (this.hunterStepFrame + 1) % HUNTER_WALK_SEQ.length;
          this.stepDressing(this.hunt.hunterPos, running);
        }
      } else {
        this.hunterStepAcc = 0;
      }
      if (hunterKey === HUNTER_DIRS_SHEET) {
        const row = HUNTER_DIR_ROW[this.hunterFacing];
        const col = moved >= 0.01 ? HUNTER_WALK_SEQ[this.hunterStepFrame] : 0;
        this.hunterSprite.setFrame(row * 3 + col);
        // Side row is authored facing right; up/down never mirror.
        this.hunterSprite.setFlipX(this.hunterFacing === 'side' && this.hunterSideLeft);
      } else {
        this.hunterSprite.setFrame(
          moved >= 0.01 ? HUNTER_WALK_FRAMES[this.hunterStepFrame % HUNTER_WALK_FRAMES.length] : HUNTER_FRAME_IDLE,
        );
      }
    }
    this.prevHunterPos = { ...this.hunt.hunterPos };
    this.dogs.forEach((dog, i) => {
      const sprite = this.dogSprites[i];
      const sheet = this.dogSheet(i);
      sprite.setPosition(dog.pos.x, dog.pos.y);
      this.dogShadows[i].setPosition(dog.pos.x, dog.pos.y + 4);
      // Winded dogs: dimmer shadow + slower gait.
      this.dogShadows[i].setAlpha(dog.winded ? 0.16 : 0.28);
      // Only turn around on a decisively sideways heading — near-vertical
      // serpentine crossings keep the last facing instead of flip-jittering.
      const cosH = Math.cos(dog.heading);
      if (Math.abs(cosH) > FLIP_DEADBAND) this.dogFaceLeft[i] = cosH < 0;
      // End-on facing with hysteresis: enter only decisively vertical,
      // exit early — the side rows are the best art and win diagonals.
      const sinH = Math.sin(dog.heading);
      if (Math.abs(sinH) > FACING_ENTER_SIN) this.dogFacing[i] = sinH < 0 ? 'up' : 'down';
      else if (Math.abs(sinH) < FACING_EXIT_SIN) this.dogFacing[i] = 'side';
      sprite.setFlipX(this.dogFacing[i] === 'side' && this.dogFaceLeft[i]);
      // Distance-driven gait: legs move exactly as fast as the ground does.
      const dogMoved = dist(dog.pos, this.prevDogPos[i]);
      this.dogStepAcc[i] += dogMoved;
      while (this.dogStepAcc[i] >= DOG_STRIDE_PX) {
        this.dogStepAcc[i] -= DOG_STRIDE_PX;
        this.dogStepFrame[i] = (this.dogStepFrame[i] + 1) % 4;
        if (this.inCoverAt(dog.pos)) this.spawnRustle(dog.pos.x, dog.pos.y);
      }
      this.prevDogPos[i] = { ...dog.pos };
      if (sheet) {
        this.applyDogPose(sprite, sheet, dog, this.dogStepFrame[i], this.dogFacing[i], this.dogDirSheet(i));
      }
      const marker = this.pointMarkers[i];
      if (dog.state === 'pointing') {
        // The pose carries the point on painted dogs; placeholders get the tint.
        if (sheet) sprite.clearTint();
        else sprite.setTint(TINT_POINTING);
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
        else if (dog.winded) sprite.setTint(0xc8c0b0);
        else if (i === 1) sprite.setTint(TINT_SECOND_DOG);
        else sprite.clearTint();
        marker.setVisible(false);
      }
    });

    // Y-sort field actors + landmarks (lower on screen = in front).
    this.hunterSprite.setDepth(10 + this.hunt.hunterPos.y * 0.01);
    this.dogSprites.forEach((s, i) => s.setDepth(10 + this.dogs[i].pos.y * 0.01));
    this.landmarkSprites.forEach((img) => img.setDepth(10 + img.y * 0.01));

    // Field bird markers: runners move; downed always show; hidden B-key only.
    this.birdMarkers.forEach((m, i) => {
      const bird = this.hunt.birds[i];
      m.setPosition(bird.pos.x, bird.pos.y);
      if (bird.state === 'downed') {
        m.setTexture('bird-downed').setVisible(true).setDepth(8 + bird.pos.y * 0.01);
      } else if (bird.state === 'hidden') {
        m.setTexture('bird-hidden');
        // leave visibility as B-key toggled
      } else {
        m.setVisible(false);
      }
    });

    // Scent-check cue: first tick of tracking plays a soft audio tell.
    this.dogs.forEach((dog, i) => {
      if (dog.scentCheck && this.prevDogStatesForScent[i] !== 'tracking') {
        playScentCheck();
      }
      this.prevDogStatesForScent[i] = dog.state;
    });

    this.updateWindLean(delta);
    this.updateBell(delta);
    this.updateFootsteps(delta, running);
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

  /** Player elects to leave the field; remaining birds are written off as lost. */
  private requestEndHunt(): void {
    if (this.summaryShown || this.flushing) return;
    unlockAudio();
    playBlip();
    const n = endHuntEarly(this.hunt);
    if (n > 0) {
      pixelText(this, VIEWPORT.w / 2, 40, `hunt called — ${n} bird${n > 1 ? 's' : ''} left in the cover`, 1, '#e8c9a0')
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(18);
    }
    this.showSummary();
  }

  private showSummary(): void {
    this.summaryShown = true;

    // Convert each dog's work into XP (breed XP rate applies). The hen fine
    // comes out of the hunter's XP — he pulled the trigger, not the dog.
    const fine = HEN_FINE_XP * this.hunt.henDowns;
    const hunterGained = Math.max(0, this.hunt.downed + this.hunt.doubles + 2 - fine);
    const lines: { text: string; color: string }[] = [];
    let seasonEnded = false;
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
      // The calendar takes its cut: a home weekend, or two weeks for a trip.
      const home = regionOfArea(this.hunt.areaId).id === career.homeRegionId;
      const cost = home ? HOME_HUNT_WEEKS : TRIP_HUNT_WEEKS;
      career = advanceCareerWeeks(career, cost);
      lines.push({
        text: `${cost} week${cost > 1 ? 's' : ''} pass${cost > 1 ? '' : 'es'} — ${dateLabel(career.date)}`,
        color: '#c9dcc0',
      });
      if (seasonOver(career.date)) {
        seasonEnded = true;
        lines.push({ text: 'the season is over — head home for summer', color: '#ffd23f' });
      }
      saveCareer(career);
    }

    const cx = VIEWPORT.w / 2;
    const cy = VIEWPORT.h / 2;
    this.add.rectangle(cx, cy, VIEWPORT.w, VIEWPORT.h, 0x000000, 0.65).setScrollFactor(0).setDepth(20);
    const total = this.hunt.birds.length;
    pixelText(this, cx, cy - 42, 'HUNT OVER', 2, '#ffd23f')
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(21);
    pixelText(this, cx, cy - 18, `${this.area.name} — downed: ${this.hunt.downed} / ${total}   lost: ${this.hunt.escaped}`, 1, '#ffffff')
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(21);
    lines.forEach((line, i) => {
      pixelText(this, cx, cy - 2 + i * 11, line.text, 1, '#ffffff')
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(21);
    });
    const buttonY = Math.max(cy + 44, cy - 2 + lines.length * 11 + 16);
    if (this.quick) {
      this.summaryButton(cx - 62, buttonY, 'hunt again', () => this.scene.restart({ quick: this.quick }));
      this.summaryButton(cx + 62, buttonY, 'setup', () => this.scene.start('QuickScene'));
    } else if (seasonEnded) {
      this.summaryButton(cx, buttonY, 'head home', () => this.scene.start('MapScene'));
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
    pixelText(this, x, y, label, 1, '#dfe9d8')
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
    pixelText(this, bird.pos.x, bird.pos.y - 10, label, 1, '#ffffff')
      .setOrigin(0.5);

    if (hunterDist <= SHOT_RANGE) {
      // Fade the field out before the shot view so the cut doesn't feel like
      // two separate prototypes glued together.
      this.time.delayedCall(280, () => {
        this.cameras.main.fadeOut(180, 16, 20, 16);
      });
      this.time.delayedCall(480, () => {
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
      pixelText(this, bird.pos.x, bird.pos.y + 2, 'the covey swings wide and relands — mark them!', 1, '#c9dcc0')
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
    pixelText(this, bird.pos.x, bird.pos.y + 2, 'too far off for a shot', 1, '#ffb0a0')
      .setOrigin(0.5);
    this.time.delayedCall(900, () => {
      this.flushing = false;
    });
  }

  /**
   * Sparse screen-space grass ticks that lean with the hunt wind — a cheap
   * tell so wind-aware cast reads as craft, not a secret.
   */
  private updateWindLean(delta: number): void {
    if (!this.windLeanGfx) return;
    this.windLeanMs += delta;
    const g = this.windLeanGfx;
    g.clear();
    const wx = Math.cos(this.hunt.wind);
    const wy = Math.sin(this.hunt.wind);
    const strength = this.hunt.windStrength === 'strong' ? 1.35 : this.hunt.windStrength === 'breezy' ? 1 : 0.55;
    const lean = 4 * strength;
    const phase = this.windLeanMs * 0.004;
    g.lineStyle(1, 0x6e6832, 0.35);
    // Fixed pattern in view space so it doesn't fight the camera scroll.
    for (let i = 0; i < 28; i++) {
      const x = 18 + ((i * 53) % 450);
      const y = 36 + ((i * 97) % 210);
      const wobble = Math.sin(phase + i * 0.7) * 1.2;
      g.lineBetween(x, y, x + wx * lean + wobble, y + wy * lean);
    }
  }

  /** Painted sheet key for dog i, or null while this breed still wears the placeholder. */
  private dogSheet(i: number): string | null {
    const key = DOG_SHEETS[this.breeds[i]?.id ?? ''];
    return key && this.textures.exists(key) ? key : null;
  }

  /**
   * Map dog AI state + gait → painted frame/anim.
   * Stills for point/honor/heel/retrieve/scent-check; run rates differ for
   * cast-trot vs work-run vs track so the gallery can read the dog.
   */
  private applyDogPose(
    sprite: Phaser.GameObjects.Sprite,
    sheet: string,
    dog: Dog,
    gaitFrame: number,
    facing: 'side' | 'up' | 'down' = 'side',
    dirSheet: string | null = null,
  ): void {
    // End-on rows (away/toward) live on the directional sheet; everything
    // else — and every pose the dirs sheet lacks (heel, retrieve) — falls
    // back to the richer side-view sheet. Texture swaps are guarded.
    const setTex = (key: string) => {
      if (sprite.texture.key !== key) sprite.setTexture(key);
    };
    const endOn = dirSheet !== null && facing !== 'side';
    if (endOn) {
      const base = DOG_DIR_ROW[facing as 'up' | 'down'] * 3;
      const pointing =
        dog.scentCheck || dog.state === 'pointing' || dog.state === 'honoring';
      const gaitStates = dog.state === 'quartering' || dog.state === 'tracking' || dog.state === 'breaking';
      if (pointing) {
        setTex(dirSheet);
        sprite.anims.stop();
        sprite.setFrame(base + DOG_DIR_POINT_COL);
        return;
      }
      if (gaitStates && dog.gait !== 'still') {
        setTex(dirSheet);
        sprite.anims.stop();
        sprite.setFrame(base + (gaitFrame % 2));
        return;
      }
      // Heel / retrieve / stills: the side sheet has the pose, dirs doesn't.
    }
    setTex(sheet);
    const still = (frame: number) => {
      sprite.anims.stop();
      // Guard missing cells on older cached sheets.
      const max = (sprite.texture.frameTotal || DOG_FRAME_COUNT) - 1;
      sprite.setFrame(Math.min(frame, Math.max(0, max)));
    };
    // Scent check: freeze on point pose for a beat (locked-up look).
    if (dog.scentCheck || dog.gait === 'still') {
      if (dog.state === 'retrieving') still(DOG_FRAME_RETRIEVE);
      else if (dog.state === 'heel' || dog.state === 'recalled') still(DOG_FRAME_HEEL);
      else if (dog.state === 'pointing' || dog.state === 'honoring' || dog.scentCheck) still(DOG_FRAME_POINT);
      else still(DOG_FRAME_HEEL);
      return;
    }
    switch (dog.state) {
      case 'pointing':
      case 'honoring':
        still(DOG_FRAME_POINT);
        break;
      case 'heel':
      case 'recalled':
        still(DOG_FRAME_HEEL);
        break;
      case 'retrieving':
        // Moving to the fall uses retrieve still carried at trot speed via gait;
        // when moving we show retrieve frame bobbing via run is wrong — keep retrieve.
        still(DOG_FRAME_RETRIEVE);
        break;
      default: {
        // Distance-driven gait (stepped by the caller): a casting trot, a
        // tracking burst, and a winded shuffle all read honestly because
        // the legs turn exactly as fast as the ground moves — no per-state
        // frame-rate table to maintain. A paused dog freezes mid-stride.
        sprite.anims.stop();
        sprite.setFrame(gaitFrame);
        break;
      }
    }
  }

  /** Olive frame + cream inner edge — shared chrome for whistle + minimap. */
  private drawUiPanel(x: number, y: number, w: number, h: number, depth: number): void {
    const g = this.add.graphics().setScrollFactor(0).setDepth(depth);
    g.fillStyle(0x1e2316, 0.95).fillRect(x, y, w, h);
    g.lineStyle(1, 0x6e6832, 0.9).strokeRect(x, y, w, h);
    g.lineStyle(1, 0xd4d1c2, 0.35).strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  /** Walk/sprint footfalls; softer when the hunter stands in a cover patch. */
  private updateFootsteps(delta: number, sprinting: boolean): void {
    const moving = this.hunterTarget !== null || sprinting;
    if (!moving) {
      this.footMs = 0;
      return;
    }
    this.footMs += delta;
    const interval = sprinting ? FOOT_SPRINT_MS : FOOT_INTERVAL_MS;
    if (this.footMs < interval) return;
    this.footMs = 0;
    playFootstep(this.inCoverAt(this.hunt.hunterPos), sprinting ? 0.14 : 0.1);
  }

  private inCoverAt(pos: Vec2): boolean {
    return this.area.patches.some(
      (p) => pos.x >= p.x && pos.x <= p.x + p.w && pos.y >= p.y && pos.y <= p.y + p.h,
    );
  }

  /** The world answers a footfall: cover rustles, dry open ground dusts. */
  private stepDressing(pos: Vec2, sprinting: boolean): void {
    if (this.inCoverAt(pos)) this.spawnRustle(pos.x, pos.y);
    else if (sprinting) this.spawnDust(pos.x, pos.y);
  }

  /** A kicked-grass shake at the feet — Emerald's tall-grass rustle, our way. */
  private spawnRustle(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const bx = x + (Math.random() * 12 - 6);
      const by = y + 4 + (Math.random() * 4 - 2);
      const blade = this.add
        .rectangle(bx, by, 1, 3 + Math.floor(Math.random() * 3), this.rustleColors[i % this.rustleColors.length])
        .setOrigin(0.5, 1)
        .setDepth(10 + (y + 2) * 0.01);
      this.tweens.add({
        targets: blade,
        y: by - (2 + Math.random() * 3),
        angle: (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 24),
        alpha: 0,
        duration: 240 + Math.random() * 140,
        onComplete: () => blade.destroy(),
      });
    }
  }

  /** Dust motes off a sprinting boot on open ground. */
  private spawnDust(x: number, y: number): void {
    for (let i = 0; i < 2; i++) {
      const mote = this.add
        .circle(x + (Math.random() * 8 - 4), y + 5, 1 + Math.random(), 0xcbb98a, 0.45)
        .setDepth(10 + (y + 2) * 0.01);
      this.tweens.add({
        targets: mote,
        x: mote.x - (3 + Math.random() * 5),
        y: mote.y - (3 + Math.random() * 3),
        scale: 1.9,
        alpha: 0,
        duration: 360 + Math.random() * 120,
        onComplete: () => mote.destroy(),
      });
    }
  }

  /** Directional sheet for dog i, or null while this breed only has side art. */
  private dogDirSheet(i: number): string | null {
    const key = DOG_DIR_SHEETS[this.breeds[i]?.id ?? ''];
    return key && this.textures.exists(key) ? key : null;
  }

  private makeTextures(): void {
    if (this.textures.exists('dog')) return;
    const g = this.add.graphics();
    g.fillStyle(COLOR_DOG).fillRect(0, 1, 9, 4); // body
    g.fillStyle(0xb08d5f).fillRect(7, 0, 3, 3); // head
    g.generateTexture('dog', 10, 6);
    g.clear();
    // Procedural fallback only when hunter-sheet-alpha.png is missing.
    g.fillStyle(COLOR_HUNTER).fillRect(1, 0, 6, 3); // cap (also the minimap color)
    g.fillStyle(0xd8a878).fillRect(2, 3, 4, 2); // face
    g.fillStyle(0x5c5a34).fillRect(1, 5, 6, 4); // vest
    g.fillStyle(0x6b4a2a).fillRect(6, 4, 3, 1); // gun over the shoulder
    g.fillStyle(0x3a3226).fillRect(2, 9, 2, 3); // legs
    g.fillStyle(0x3a3226).fillRect(5, 9, 2, 3);
    g.generateTexture('hunter', 9, 12);
    g.clear();
    // Tiny field birds: hidden = dark olive speck; downed = russet with wing.
    g.fillStyle(0x3a3a1e).fillRect(1, 2, 4, 3);
    g.fillStyle(0x2a2814).fillRect(4, 1, 2, 2);
    g.generateTexture('bird-hidden', 7, 5);
    g.clear();
    g.fillStyle(0x8f4a26).fillRect(1, 2, 5, 3);
    g.fillStyle(0x6b4a2a).fillRect(0, 3, 2, 2);
    g.fillStyle(0xb44a1a).fillRect(5, 1, 3, 2); // wing splay
    g.generateTexture('bird-downed', 9, 6);
    g.destroy();
  }

  private drawField(): void {
    const w = this.area.world;
    // Landmark scatter comes from a stable per-area seed so the covert
    // looks the same every visit.
    const seed = [...this.area.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const rng = mulberry32(seed);
    // Denser landmarks than the original sparse scatter — still seeded stable.
    const treeCount = Math.round((w.w * w.h) / 18_000);

    const tiles = FIELD_TILESETS[regionOfArea(this.area.id).id];
    const tiled = !!tiles && this.textures.exists(tiles);
    if (tiled) {
      this.add.tileSprite(w.x, w.y, w.w, w.h, tiles, TILE_OPEN).setOrigin(0, 0);
    } else {
      this.add.graphics().fillStyle(this.area.grass).fillRect(w.x, w.y, w.w, w.h);
    }

    // Cover is grass you can hide in, not a painted rectangle: dense tuft
    // clusters with ragged edges (the field-view-mockup look). It must stay
    // unmistakably darker than open ground — that contrast is mechanical
    // (runners hold at cover edges, singles relight into it).
    this.drawOrganicCover(rng, tiled);

    if (tiled) {
      for (let i = 0; i < treeCount; i++) {
        const img = this.add.image(
          w.x + 8 + rng() * (w.w - 24),
          w.y + 8 + rng() * (w.h - 24),
          tiles,
          TILE_MESQUITE,
        );
        // Slight size variety so mesquite isn't a rubber stamp.
        img.setScale(0.85 + rng() * 0.45);
        this.landmarkSprites.push(img);
      }
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x6b4a2a);
      for (let i = 0; i < treeCount; i++) {
        g.fillRect(w.x + 8 + rng() * (w.w - 24), w.y + 8 + rng() * (w.h - 24), 8, 8);
      }
    }
  }

  /**
   * Stamp every cover patch as a thicket of individual grass tufts into one
   * static world-sized RenderTexture (drawn once — a Graphics this dense
   * would replay tens of thousands of rects every frame). Tuft positions
   * average two rolls so they crowd the patch core and straggle past the
   * rect edge: the ragged organic fringe. Rust shrub accents echo the
   * mockup's sumac; a sparse sprinkle of pale tufts textures open ground.
   */
  private drawOrganicCover(rng: () => number, tiled: boolean): void {
    const w = this.area.world;
    const rt = this.add.renderTexture(w.x, w.y, w.w, w.h).setOrigin(0, 0);
    const g = this.make.graphics({}, false);
    // Tiled regions get dried-grass olives to sit on the tan plate; painted-
    // color regions derive their tuft shades from the area's cover color.
    const [dark, mid, light] = tiled
      ? [0x3a3a1e, 0x545026, 0x6e6832]
      : [scaleColor(this.area.cover, 0.62), this.area.cover, scaleColor(this.area.cover, 1.3)];
    const seedHead = tiled ? 0x2a2814 : scaleColor(this.area.cover, 0.4);
    const rust = [0x8f4a26, 0xa85c30];
    const tilesKey = FIELD_TILESETS[regionOfArea(this.area.id).id];

    for (const p of this.area.patches) {
      // Stamp cover tiles under the organic fringe so patches read as
      // hide-here at a glance (mechanical contrast, not just tuft noise).
      if (tiled && tilesKey && this.textures.exists(tilesKey)) {
        for (let ty = Math.floor(p.y / 16) * 16; ty < p.y + p.h; ty += 16) {
          for (let tx = Math.floor(p.x / 16) * 16; tx < p.x + p.w; tx += 16) {
            rt.drawFrame(tilesKey, TILE_COVER, tx - w.x, ty - w.y);
          }
        }
      }
      const pad = 8; // strays land this far outside the rect
      // Denser cover thatch — still darker than open (mechanical).
      const tufts = Math.round((p.w * p.h) / 14);
      for (let i = 0; i < tufts; i++) {
        const fx = (rng() + rng()) / 2;
        const fy = (rng() + rng()) / 2;
        const x = Math.round(p.x - pad + fx * (p.w + pad * 2)) - w.x;
        const y = Math.round(p.y - pad + fy * (p.h + pad * 2)) - w.y;
        const blades = 4 + Math.floor(rng() * 4);
        for (let b = 0; b < blades; b++) {
          const bx = x + Math.floor(rng() * 9) - 4;
          const h = 4 + Math.floor(rng() * 6);
          g.fillStyle([dark, mid, dark, light][Math.floor(rng() * 4)], 1).fillRect(bx, y - h, 1, h);
          if (rng() < 0.28) g.fillStyle(seedHead, 1).fillRect(bx, y - h - 2, 1, 2);
        }
        // Occasional cattail stem (vertical dark with brown head).
        if (rng() < 0.06) {
          const ch = 8 + Math.floor(rng() * 8);
          g.fillStyle(0x2a3a1e, 1).fillRect(x, y - ch, 1, ch);
          g.fillStyle(0x4a3820, 1).fillRect(x - 1, y - ch - 3, 3, 4);
        }
      }
      // Rust shrubs + a few olive clumps for variety.
      const shrubs = Math.max(2, Math.round((p.w * p.h) / 3200));
      for (let i = 0; i < shrubs; i++) {
        const sx = Math.round(p.x + rng() * p.w) - w.x;
        const sy = Math.round(p.y + rng() * p.h) - w.y;
        const r = 2 + Math.floor(rng() * 4);
        if (rng() < 0.55) {
          g.fillStyle(rust[Math.floor(rng() * 2)], 1).fillCircle(sx, sy, r);
          g.fillStyle(rust[0], 1).fillCircle(sx - r / 2, sy + 1, Math.max(1, r - 1));
        } else {
          g.fillStyle(0x3a4a24, 1).fillCircle(sx, sy, r + 1);
          g.fillStyle(mid, 1).fillCircle(sx + 1, sy - 1, r);
        }
      }
    }

    // Open-ground texture: denser pale flecks, still lighter than cover.
    const openTone = tiled ? 0x9c8a56 : scaleColor(this.area.grass, 1.2);
    const openTone2 = tiled ? 0x8a7848 : scaleColor(this.area.grass, 1.05);
    const openTufts = Math.round((w.w * w.h) / 1400);
    for (let i = 0; i < openTufts; i++) {
      const x = Math.floor(rng() * w.w);
      const y = Math.floor(rng() * w.h);
      const h = 2 + Math.floor(rng() * 4);
      const tone = rng() < 0.5 ? openTone : openTone2;
      g.fillStyle(tone, 0.85).fillRect(x, y - h, 1, h);
      if (rng() < 0.55) g.fillStyle(tone, 0.8).fillRect(x + 1, y - h + 1, 1, h - 1);
    }
    // Sparse open-ground rust accents (not cover — just place).
    const openShrubs = Math.round((w.w * w.h) / 45_000);
    for (let i = 0; i < openShrubs; i++) {
      const sx = Math.floor(rng() * w.w);
      const sy = Math.floor(rng() * w.h);
      g.fillStyle(0xa85c30, 0.9).fillCircle(sx, sy, 2);
    }

    rt.draw(g);
    g.destroy();
  }
}
