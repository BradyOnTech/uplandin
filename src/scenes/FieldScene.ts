import Phaser from 'phaser';
import { configureLogicalViewport } from './logicalViewport';
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
import { buildClassicPreparationHref } from '../game/classicLaunch';
import {
  circleBack,
  type Bird,
} from '../game/birds';
import { conditionMults } from '../game/conditions';
import { getBreed, type BreedConfig } from '../game/breeds';
import {
  activeDog,
  braceDog,
  dogAge,
  loadCareer,
  saveCareer,
  type KennelDog,
} from '../game/career';
import { devDogLevel } from '../game/dev';
import { Dog, WHISTLE_RANGE, type DogState } from '../game/dog';
import {
  HUNT_SHOT_RANGE,
  HuntSimulation,
  type HuntSimulationEvent,
} from '../game/huntSimulation';
import { VIEWPORT } from '../game/field';
import { inCoverFringe, inRaggedCoverCore } from '../game/fieldDraw';
import {
  authoredLayoutFor,
  type AuthoredFieldLayout,
} from '../game/fieldLayouts';
import { dist, moveToward, mulberry32, windArrow } from '../game/math';
import { settleCareerHunt } from '../game/huntResults';
import { openClassicSummary } from '../ui/classicSummary';
import { gearTierFor, twoDogUnlocked } from '../game/progression';
import type { QuickConfig } from '../game/quick';
import { ageMult, educatedNerveMult, openMix, seasonalBias, youngShare } from '../game/season';
import { regionOfArea } from '../game/regions';
import { getSpecies } from '../game/species';
import { birdsRemaining, createHunt, endHuntEarly, huntComplete, type HuntState } from '../game/state';
import type { Vec2 } from '../game/types';
import { windMults } from '../game/wind';
import { addWeatherFx } from './weatherFx';
import { ensureHunterGenSheet, HUNTER_GEN_SHEET } from './hunterSheet';
import { pixelText, type PixelText } from './pixelFont';

const HUNTER_SPEED = 55; // px/s walking
const SPRINT_MULT = 2; // sprint speed multiplier
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DIST = 30;

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
const DOG_SHEETS: Record<string, string> = { 'english-setter': 'setter-field', gsp: 'gsp-field' };
/** Painted dogs draw at full sheet size (32×20): the dog is the star of the
 * field view and reads from across the room, mockup-style. Purely visual —
 * every mechanical radius is in sim px and unchanged. */
const DOG_SHEET_SCALE = 1;
/** Sheet layout (english-setter-sheet-alpha.png): 0–3 run, 4 point, 5 heel, 6 retrieve. */
const DOG_FRAME_POINT = 4;
const DOG_FRAME_HEEL = 5;
const DOG_FRAME_RETRIEVE = 6;
const DOG_FRAME_COUNT = 7;
// The shipping hunter: the painted side-view sheet (idle + 3 walk frames,
// flip for left) — the look that passed playtesting. Directional facing is
// wired but DORMANT until painted art passes ART.md acceptance as
// hunter-dirs-v2; the hand-drawn generated sheet is a last-resort fallback.
const HUNTER_SHEET = 'hunter-field';
const HUNTER_FRAME_IDLE = 0;
const HUNTER_WALK_FRAMES = [1, 2, 3];
const HUNTER_SHEET_SCALE = 1.45; // ART.md law exception, standing until v2 lands
// Directional sheets (Pokémon-grade): rows select by heading.
// hunter-dirs: 3×3 of 20×28 — row 0 toward camera, 1 away, 2 side;
// cols: stand, step-L, step-R. Walk is the Emerald 4-beat: L, stand, R, stand.
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
/**
 * Painted hunter sheet is 16×20 vs setter 32×20 — without scale the dog
 * reads as the giant. 1.45 puts them co-equal at GBA overworld weight.
 */
// End-hunt control (top-right corner, screen coords).
const END_HUNT_BTN = { x: 428, y: 18, w: 88, h: 18 };
/**
 * Path B (painted/cutout): continuous open plate + cover clump stamps + props.
 * Sim patch rects stay the cover truth for dog AI; art only follows them.
 */
interface RegionPlate {
  /** Seamless open-ground texture (tiled across the world). */
  plateKey: string;
  /** Tall-grass / cattail clump sheet for stamping into ragged cover cores. */
  coverKey: string;
  coverFrames: number[];
  coverCell: { w: number; h: number };
  props?: { key: string; frames: number[] };
}
/**
 * Legacy tile strips (still used by prairie-pothole until it gets a plate).
 * SP open frames kept for tests / fallback if the plate texture is missing.
 */
interface RegionTiles {
  key: string;
  open: number[];
  cover: number;
  fringe?: number;
  landmark?: { key: string; frame: number };
  props?: { key: string; frames: number[] };
}
const FIELD_PLATES: Record<string, RegionPlate> = {
  'southern-plains': {
    plateKey: 'plate-southern-plains-open',
    coverKey: 'cover-clumps',
    coverFrames: [0, 1, 2, 3],
    coverCell: { w: 80, h: 56 },
    props: { key: 'field-props', frames: [0, 1, 2, 3] },
  },
};
const FIELD_TILESETS: Record<string, RegionTiles> = {
  // Fallback if plate art missing; also documents the old open-tile path.
  'southern-plains': {
    key: 'tiles-southern-plains-v3',
    open: [0, 1, 2, 3, 4, 5],
    cover: 6,
    fringe: 2,
    props: { key: 'field-props', frames: [0, 1, 2, 3] },
  },
  'prairie-pothole': {
    key: 'tiles-prairie-pothole',
    open: [0, 1, 2],
    cover: 3,
    props: { key: 'field-props', frames: [2, 3] },
  },
};
/** Prop cutouts: 64px for mockup-scale oaks (shrubs/cattails share the sheet). */
const PROP_CELL = 64;

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
  private summaryUi: { dispose(): void } | null = null;
  private simulation!: HuntSimulation;
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
  private hunterDirectional = false;
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
    // The painted directional hunter (v2 — passed acceptance): wins in
    // create() and turns directional facing on.
    this.load.spritesheet('hunter-dirs-v2', 'art/hunter-dirs-v2.png', {
      frameWidth: 20,
      frameHeight: 28,
    });
    this.load.spritesheet('tiles-southern-plains-v3', 'art/tileset-southern-plains-v3.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet('tiles-southern-plains-v2', 'art/tileset-southern-plains-v2.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet('tiles-prairie-pothole', 'art/tileset-prairie-pothole.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    // Path B: continuous prairie plate + cover cutout stamps (Southern Plains).
    this.load.image('plate-southern-plains-open', 'art/plate-southern-plains-open.png');
    this.load.spritesheet('cover-clumps', 'art/cover-clumps.png', {
      frameWidth: 80,
      frameHeight: 56,
    });
    this.load.spritesheet('field-props', 'art/field-props.png', {
      frameWidth: PROP_CELL,
      frameHeight: PROP_CELL,
    });
    // Fixed Quail Fields kit: mockup-cropped props + beds (authored layout).
    this.load.spritesheet('mockup-field-props', 'art/mockup-field-props.png', {
      frameWidth: 72,
      frameHeight: 72,
    });
    this.load.spritesheet('mockup-cover-beds', 'art/mockup-cover-beds.png', {
      frameWidth: 80,
      frameHeight: 64,
    });
    this.load.spritesheet('gsp-field', 'art/gsp-sheet-alpha.png', {
      frameWidth: 32,
      frameHeight: 20,
    });
    this.load.spritesheet(HUNTER_SHEET, 'art/hunter-sheet-alpha.png', {
      frameWidth: 16,
      frameHeight: 20,
    });
    this.load.spritesheet('english-setter-dirs', 'art/english-setter-dirs.png', {
      frameWidth: 32,
      frameHeight: 20,
    });
    this.load.spritesheet('tiles-southern-plains', 'art/tileset-southern-plains.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
  }

  create(data: {
    hunt?: HuntState;
    areaId?: string;
    dogs?: Dog[];
    quick?: QuickConfig;
    simulation?: HuntSimulation;
    dropPointId?: string;
  }): void {
    this.disposeSummary();
    // A scene restart after FlushScene must not retain old DOM or handlers.
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.disposeSummary, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.disposeSummary, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.disposeSummary, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.disposeSummary, this);
    configureLogicalViewport(this, 'pixel');
    if (this.input.keyboard) this.input.keyboard.enabled = true;
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
              dropPointId: data.dropPointId,
            }
          : {
              // Career: the calendar shapes the hunt — what's open, how the
              // weather leans, how naive or educated the birds are.
              gunId: career.hunter.shotgunId,
              conditionBias: seasonalBias(career.date.week, this.area.conditionBias),
              mix: openMix(this.area, career.date.week),
              youngShare: youngShare(career.date.week),
              educatedMult: educatedNerveMult(career.date.week),
              dropPointId: data.dropPointId,
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
    this.simulation =
      data.simulation ??
      new HuntSimulation({
        hunt: this.hunt,
        dogs: this.dogs,
        area: this.area,
        rng: Math.random,
      });
    this.recallPending = false;
    this.bellMs = 0;
    this.beeperMs = 0;
    this.toastText = null;

    this.makeTextures();
    this.landmarkSprites = [];
    this.drawField();
    this.drawSharedLandmarks();
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

    ensureHunterGenSheet(this);
    const hunterKey = this.textures.exists('hunter-dirs-v2')
      ? 'hunter-dirs-v2'
      : this.textures.exists(HUNTER_SHEET)
        ? HUNTER_SHEET
        : HUNTER_GEN_SHEET;
    this.hunterDirectional = hunterKey !== HUNTER_SHEET;
    this.hunterSprite = this.add.sprite(this.hunt.hunterPos.x, this.hunt.hunterPos.y, hunterKey);
    if (this.hunterDirectional) {
      this.hunterSprite.setFrame(HUNTER_DIR_ROW.down * 3);
    } else {
      this.hunterSprite.setScale(HUNTER_SHEET_SCALE);
      this.hunterSprite.setFrame(HUNTER_FRAME_IDLE);
    }
    this.hunterShadow.setSize(14, 5);
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
      const grounded = b.state === 'downed' || b.state === 'carried';
      const key = grounded ? 'bird-downed' : 'bird-hidden';
      return this.add.sprite(b.pos.x, b.pos.y, key).setVisible(grounded).setDepth(8);
    });
    this.input.keyboard?.on('keydown-B', () => {
      this.birdMarkers.forEach((m, i) => {
        const bird = this.hunt.birds[i];
        if (bird.state === 'downed' || bird.state === 'carried') {
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
    // Rustle blades take the same tones as painted/tile cover (not bare grass).
    const rid = regionOfArea(this.area.id).id;
    const rustleCover =
      !!FIELD_PLATES[rid] || !!FIELD_TILESETS[rid];
    // Light shade leads: kicked blades must read against the dark thicket.
    this.rustleColors = rustleCover
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
    if (this.flushing || this.summaryShown) return;
    const dt = delta / 1000;
    const recall = this.recallPending;
    this.recallPending = false;

    // Walk (or run) the hunter. Sprinting is loud.
    const running = (this.sprinting || this.shiftKey?.isDown === true) && this.hunterTarget !== null;
    let nextHunterPos = this.hunt.hunterPos;
    if (this.hunterTarget) {
      const speed = HUNTER_SPEED * (running ? SPRINT_MULT : 1);
      nextHunterPos = moveToward(this.hunt.hunterPos, this.hunterTarget, speed * dt);
      if (dist(nextHunterPos, this.hunterTarget) < 1.5) {
        this.hunterTarget = null;
        this.sprinting = false;
      }
    }
    const simEvents = this.simulation.update(delta, {
      hunterPos: nextHunterPos,
      hunterRunning: running,
      recall,
      whistleRange: this.gearTier >= 3 ? Infinity : undefined,
    });
    for (const event of simEvents) {
      if (event.type === 'dog-pointed') playPoint();
      else if (event.type === 'bird-retrieved') playBlip();
      else if (event.type === 'covey-flushed') {
        this.presentFlush(event);
        return;
      }
    }

    this.hunterSprite.setPosition(this.hunt.hunterPos.x, this.hunt.hunterPos.y);
    this.hunterShadow.setPosition(this.hunt.hunterPos.x, this.hunt.hunterPos.y + 5);
    {
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
      if (this.hunterDirectional) {
        const row = HUNTER_DIR_ROW[this.hunterFacing];
        const col = moved >= 0.01 ? HUNTER_WALK_SEQ[this.hunterStepFrame] : 0;
        this.hunterSprite.setFrame(row * 3 + col);
        // Side row is authored facing right; up/down never mirror.
        this.hunterSprite.setFlipX(this.hunterFacing === 'side' && this.hunterSideLeft);
      } else {
        // Painted side-view sheet: distance-stepped walk frames, flip for left.
        this.hunterSprite.setFrame(
          moved >= 0.01 ? HUNTER_WALK_FRAMES[this.hunterStepFrame % HUNTER_WALK_FRAMES.length] : HUNTER_FRAME_IDLE,
        );
        this.hunterSprite.setFlipX(this.hunterSideLeft);
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
      if (bird.state === 'downed' || bird.state === 'carried') {
        const carried = bird.state === 'carried';
        m.setTexture('bird-downed')
          .setPosition(bird.pos.x, bird.pos.y - (carried ? 4 : 0))
          .setVisible(true)
          .setDepth((carried ? 10.2 : 8) + bird.pos.y * 0.01);
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
        const huntRead = dog.scentStage === 'none' ? dog.state : `${dog.state}/${dog.scentStage}`;
        return `${this.dogName(i)} lv${dog.level}${this.devLevel !== null ? ' (dev)' : ''} ${huntRead}${dog.winded ? ' winded' : ''} ${pips}`;
      })
      .join('\n');
    const slopeNote = this.area.slope !== undefined ? `   uphill ${windArrow(this.area.slope)}` : '';
    this.hud.setText(
      `${this.hunt.condition} · wind ${windArrow(this.hunt.wind)} ${this.hunt.windStrength}${slopeNote}   birds: ${birdsRemaining(this.hunt)}   downed: ${this.hunt.downed}   lost: ${this.hunt.escaped}${running ? '   RUNNING' : ''}\n` +
        dogLines,
    );
    this.whistleLabel.setText(this.dogs.every((d) => d.state === 'heel') ? 'cast off' : 'whistle');

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

  private disposeSummary(): void {
    this.summaryUi?.dispose();
    this.summaryUi = null;
  }

  private showSummary(): void {
    // End-button and natural completion share one irreversible settlement.
    // Latch before saving or opening DOM so repeated callbacks cannot award twice.
    if (this.summaryShown) return;
    this.summaryShown = true;
    this.hunterTarget = null;
    this.recallPending = false;
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    const result = this.quick ? null : settleCareerHunt(loadCareer(), this.hunt, this.kennelDogs);
    if (result) saveCareer(result.career);

    const returnParams = new URLSearchParams(location.search);
    returnParams.set('play', this.quick ? 'quick' : 'career');
    const prepare = () => location.assign(buildClassicPreparationHref(
      returnParams.toString(), this.area.id, this.hunt.dropPointId,
    ));
    // A fresh page revalidates the current season/loadout and preserves the
    // selected truck entry. Live FlushScene returns never pass through here.
    const replay = () => {
      const params = new URLSearchParams(returnParams);
      params.set('drop', this.hunt.dropPointId);
      if (!this.quick) params.set('area', this.area.id);
      location.assign(`./classic.html?${params}`);
    };
    this.summaryUi = openClassicSummary({
      hunt: this.hunt, dogCount: this.dogs.length, career: result,
      onReplay: replay, onPrepare: prepare, onContinue: prepare,
    });
    this.scene.pause();
  }

  private presentFlush(
    event: Extract<HuntSimulationEvent, { type: 'covey-flushed' }>,
  ): void {
    const bird = this.hunt.birds.find((candidate) => candidate.id === event.birdId);
    if (!bird) return;
    this.flushing = true;
    const flushed = event.birdIds
      .map((id) => this.hunt.birds.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is Bird => candidate !== undefined);
    playFlush();
    this.cameras.main.flash(180, 255, 244, 214);
    const label =
      event.cause === 'proximity'
        ? flushed.length > 1
          ? 'COVEY FLUSH!'
          : 'FLUSH!'
        : event.cause === 'nerve'
          ? 'FLUSHED WILD!'
          : event.cause === 'bump'
            ? 'BUMPED!'
            : event.cause === 'spook'
              ? 'SPOOKED!'
              : 'WINDED!';
    pixelText(this, bird.pos.x, bird.pos.y - 10, label, 1, '#ffffff')
      .setOrigin(0.5);

    if (event.hunterDistance <= HUNT_SHOT_RANGE) {
      // Fade the field out before the shot view so the cut doesn't feel like
      // two separate prototypes glued together.
      this.time.delayedCall(280, () => {
        this.cameras.main.fadeOut(180, 16, 20, 16);
      });
      this.time.delayedCall(480, () => {
        this.scene.start('FlushScene', {
          hunt: this.hunt,
          birdIds: event.birdIds,
          flushDistance: event.hunterDistance,
          dogs: this.dogs,
          simulation: this.simulation,
          pointingSlot: event.pointCredit ? event.pointingSlot : null,
          slopeApproach: event.slopeApproach,
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
      {
        returnTrail: this.area.trails.find((trail) => trail.id === 'circleback-return'),
        patches: this.area.patches,
      },
    );
    if (relanded.length > 0) {
      this.simulation.finishRise({ relight: false });
      pixelText(this, bird.pos.x, bird.pos.y + 2, 'the covey swings wide and relands — mark them!', 1, '#c9dcc0')
        .setOrigin(0.5);
      this.time.delayedCall(900, () => {
        this.flushing = false;
      });
      return;
    }
    for (const b of flushed) {
      this.simulation.resolveBird(b.id, 'escaped');
    }
    this.simulation.finishRise({ relight: false });
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
        dog.scentCheck || dog.scentStage === 'locking' || dog.state === 'pointing' || dog.state === 'honoring';
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
    if (dog.scentCheck || dog.scentStage === 'locking' || dog.gait === 'still') {
      if (dog.state === 'retrieving') still(DOG_FRAME_RETRIEVE);
      else if (dog.state === 'heel' || dog.state === 'recalled') still(DOG_FRAME_HEEL);
      else if (
        dog.state === 'pointing' ||
        dog.state === 'honoring' ||
        dog.scentCheck ||
        dog.scentStage === 'locking'
      ) still(DOG_FRAME_POINT);
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
    // Landmark scatter seed: stable per-area for non-authored regions.
    const seed = [...this.area.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const rng = mulberry32(seed);

    // Fixed one-covert layouts (Quail Fields): designed placement, same every hunt.
    // Birds still randomize among AreaConfig.patches — only the *look* is authored.
    const authored = authoredLayoutFor(this.area.id);
    if (authored && this.textures.exists(authored.propKey)) {
      this.drawAuthoredField(authored);
      return;
    }

    const regionId = regionOfArea(this.area.id).id;
    const plate = FIELD_PLATES[regionId];
    const tileCfg = FIELD_TILESETS[regionId];
    const usePlate =
      !!plate &&
      this.textures.exists(plate.plateKey) &&
      this.textures.exists(plate.coverKey);
    const tiled = !usePlate && !!tileCfg && this.textures.exists(tileCfg.key);

    if (usePlate && plate) {
      this.drawPaintedField(rng, plate);
      this.scatterProps(rng, plate.props);
    } else {
      if (!tiled) {
        this.add.graphics().fillStyle(this.area.grass).fillRect(w.x, w.y, w.w, w.h);
      }
      this.drawOrganicCover(rng, tiled);
      this.scatterProps(rng, tileCfg?.props);
    }
  }

  /** Truck and named map landmarks share exact simulation coordinates. */
  private drawSharedLandmarks(): void {
    const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      if (this.textures.exists(key)) return;
      const g = this.add.graphics();
      draw(g);
      g.generateTexture(key, 28, 22);
      g.destroy();
    };
    make('map-truck', (g) => {
      g.fillStyle(0x263d34).fillRect(4, 6, 20, 10).fillRect(7, 2, 10, 7);
      g.fillStyle(0x141714).fillCircle(8, 17, 3).fillCircle(20, 17, 3);
      g.fillStyle(0xa8c4c2).fillRect(9, 4, 6, 4);
    });
    make('map-gate', (g) => {
      g.fillStyle(0x6d5134).fillRect(3, 2, 3, 20).fillRect(22, 2, 3, 20)
        .fillRect(3, 7, 22, 2).fillRect(3, 15, 22, 2);
    });
    make('map-windmill', (g) => {
      g.lineStyle(2, 0xaaa99a).lineBetween(14, 7, 14, 22);
      for (let i = 0; i < 8; i++) g.lineBetween(14, 7, 14 + Math.cos(i * Math.PI / 4) * 7, 7 + Math.sin(i * Math.PI / 4) * 7);
    });
    make('map-barn', (g) => {
      g.fillStyle(0x7f3828).fillRect(4, 8, 20, 14);
      g.fillStyle(0x3e332e).fillTriangle(2, 9, 14, 1, 26, 9);
    });
    make('map-pond', (g) => g.fillStyle(0x4d8292, 0.85).fillEllipse(14, 13, 26, 13));
    make('map-fence', (g) => {
      g.fillStyle(0x6d5134).fillRect(2, 4, 2, 18).fillRect(24, 4, 2, 18)
        .fillRect(2, 9, 24, 2).fillRect(2, 16, 24, 2);
    });

    for (const landmark of this.area.landmarks) {
      const image = this.add.image(landmark.position.x, landmark.position.y, `map-${landmark.kind}`)
        .setOrigin(0.5, landmark.kind === 'pond' ? 0.5 : 1);
      this.landmarkSprites.push(image);
    }
    const drop = this.area.dropPoints.find((point) => point.id === this.hunt.dropPointId)
      ?? this.area.dropPoints[0];
    const truck = this.add.image(
      drop.position.x - Math.cos(drop.heading) * 6,
      drop.position.y - Math.sin(drop.heading) * 6,
      'map-truck',
    ).setOrigin(0.5, 0.8).setRotation(drop.heading + Math.PI / 2);
    this.landmarkSprites.push(truck);
  }

  /**
   * One fixed covert: open plate + hand-listed cover beds + props.
   * Edit `src/game/fieldLayouts.ts` to move trees/beds — no scatter soup.
   */
  private drawAuthoredField(layout: AuthoredFieldLayout): void {
    const w = this.area.world;
    const regionId = regionOfArea(this.area.id).id;
    const plateKey = FIELD_PLATES[regionId]?.plateKey ?? 'plate-southern-plains-open';

    if (this.textures.exists(plateKey)) {
      const ground = this.add.tileSprite(w.x, w.y, w.w, w.h, plateKey);
      ground.setOrigin(0, 0);
      ground.setDepth(-20);
    } else {
      this.add.graphics().fillStyle(this.area.grass).fillRect(w.x, w.y, w.w, w.h);
    }

    const rt = this.add.renderTexture(w.x, w.y, w.w, w.h).setOrigin(0, 0);
    rt.setDepth(-10);
    const hasBeds = this.textures.exists(layout.coverKey);
    const { w: dw, h: dh } = layout.coverCell;

    for (const bed of layout.coverBeds) {
      // Soft olive under each bed so it reads as cover, not a sticker.
      const wash = this.make.graphics({}, false);
      const sc = bed.scale ?? 1;
      wash.fillStyle(0x3d4a1e, 0.32);
      wash.fillEllipse(bed.x - w.x, bed.y - w.y, 34 * sc, 20 * sc);
      rt.draw(wash);
      wash.destroy();

      if (!hasBeds) continue;
      const frame = bed.frame ?? 0;
      // Scale via optional draw size: Phaser drawFrame is 1:1; approximate with
      // multiple offsets only when scale≈1. For scale≠1 use an Image instead.
      if (Math.abs(sc - 1) < 0.08) {
        rt.drawFrame(
          layout.coverKey,
          frame,
          Math.round(bed.x - w.x - dw / 2),
          Math.round(bed.y - w.y - dh * 0.9),
        );
      } else {
        const img = this.add.image(bed.x, bed.y, layout.coverKey, frame);
        img.setOrigin(0.5, 0.9);
        img.setScale(sc);
        img.setDepth(-9);
      }
    }

    // Authored props (oaks/shrubs/cattails) — Y-sorted with dogs/hunter.
    if (this.textures.exists(layout.propKey)) {
      for (const p of layout.props) {
        const img = this.add.image(p.x, p.y, layout.propKey, p.frame);
        img.setOrigin(0.5, 1);
        img.setScale(p.scale ?? 1);
        if (p.flipX) img.setFlipX(true);
        this.landmarkSprites.push(img);
      }
    }
  }

  /**
   * Path B open ground: seamless prairie plate.
   * Cover: a few large cattail/grass *islands* per patch (not a green rain carpet).
   * Sim patch rects stay the dog-AI truth; art only follows them loosely.
   */
  private drawPaintedField(rng: () => number, plate: RegionPlate): void {
    const w = this.area.world;
    const ground = this.add.tileSprite(w.x, w.y, w.w, w.h, plate.plateKey);
    ground.setOrigin(0, 0);
    ground.setDepth(-20);

    const rt = this.add.renderTexture(w.x, w.y, w.w, w.h).setOrigin(0, 0);
    rt.setDepth(-10);
    const g = this.make.graphics({}, false);
    const hasClumps = this.textures.exists(plate.coverKey);
    const dw = plate.coverCell.w;
    const dh = plate.coverCell.h;

    for (const p of this.area.patches) {
      // 2–4 island centers inside the patch — mockup beds, not a filled AABB.
      const islandN = Math.max(2, Math.min(4, Math.round((p.w * p.h) / 4500)));
      const islands: { x: number; y: number }[] = [];
      let tries = 0;
      while (islands.length < islandN && tries < islandN * 12) {
        tries++;
        const ix = p.x + p.w * (0.2 + rng() * 0.6);
        const iy = p.y + p.h * (0.25 + rng() * 0.55);
        if (!inRaggedCoverCore(ix, iy, p) && rng() < 0.55) continue;
        // Keep islands apart so beds stay distinct.
        if (islands.some((o) => Math.hypot(o.x - ix, o.y - iy) < 36)) continue;
        islands.push({ x: ix, y: iy });
      }
      if (islands.length === 0) {
        islands.push({ x: p.x + p.w * 0.5, y: p.y + p.h * 0.55 });
      }

      for (const isl of islands) {
        // Soft olive wash only under the bed (not the whole patch).
        const wash = this.make.graphics({}, false);
        const rw = 28 + rng() * 18;
        const rh = 18 + rng() * 12;
        wash.fillStyle(0x3d4a1e, 0.35);
        wash.fillEllipse(isl.x - w.x, isl.y - w.y, rw, rh);
        wash.fillStyle(0x545026, 0.2);
        wash.fillEllipse(isl.x - w.x, isl.y - w.y + 4, rw * 0.7, rh * 0.55);
        rt.draw(wash);
        wash.destroy();

        // 2–4 clump stamps per island — readable beds, not a hash field.
        if (hasClumps) {
          const stamps = 2 + Math.floor(rng() * 3);
          for (let i = 0; i < stamps; i++) {
            const ox = (rng() - 0.5) * 22;
            const oy = (rng() - 0.5) * 14;
            const frame = plate.coverFrames[Math.floor(rng() * plate.coverFrames.length)] ?? 0;
            rt.drawFrame(
              plate.coverKey,
              frame,
              Math.round(isl.x - w.x - dw / 2 + ox),
              Math.round(isl.y - w.y - dh * 0.92 + oy),
            );
          }
        }
      }

      // Tiny accent only — never a blade carpet (that caused the green rain).
      for (const isl of islands) {
        const accents = 3 + Math.floor(rng() * 4);
        for (let i = 0; i < accents; i++) {
          const bx = Math.round(isl.x - w.x + (rng() - 0.5) * 28);
          const by = Math.round(isl.y - w.y + (rng() - 0.5) * 12);
          const hgt = 4 + Math.floor(rng() * 5);
          g.fillStyle([0x3a3a1e, 0x545026, 0x6e6832][Math.floor(rng() * 3)], 0.9);
          g.fillRect(bx, by - hgt, 1, hgt);
          if (rng() < 0.35) g.fillStyle(0x2a2814, 1).fillRect(bx, by - hgt - 2, 1, 2);
        }
      }
    }

    // Very sparse open-ground flecks — plate carries the prairie look.
    const openTufts = Math.round((w.w * w.h) / 6000);
    for (let i = 0; i < openTufts; i++) {
      const x = Math.floor(rng() * w.w);
      const y = Math.floor(rng() * w.h);
      if (this.area.patches.some((p) => inRaggedCoverCore(x + w.x, y + w.y, p))) continue;
      g.fillStyle(rng() < 0.5 ? 0xb89858 : 0x887038, 0.55).fillRect(x, y - (2 + Math.floor(rng() * 2)), 1, 2);
    }

    rt.draw(g);
    g.destroy();
  }

  /**
   * Mockup hierarchy: few large oaks, sparse shrubs, cattails only near cover.
   * Leave open lanes for the white dog.
   */
  private scatterProps(
    rng: () => number,
    props: { key: string; frames: number[] } | undefined,
  ): void {
    const w = this.area.world;
    if (!props || !this.textures.exists(props.key)) {
      const g = this.add.graphics();
      g.fillStyle(0x6b4a2a);
      const n = Math.round((w.w * w.h) / 28_000);
      for (let i = 0; i < n; i++) {
        g.fillRect(w.x + 8 + rng() * (w.w - 24), w.y + 8 + rng() * (w.h - 24), 8, 8);
      }
      return;
    }
    // Sparse like the mockup: big trees dominate, shrubs are accents.
    const oakN = Math.max(4, Math.round((w.w * w.h) / 70_000));
    const shrubN = Math.max(5, Math.round((w.w * w.h) / 45_000));
    const cattailN = Math.max(3, Math.round((w.w * w.h) / 55_000));
    const place = (
      frame: number,
      n: number,
      scaleLo: number,
      scaleHi: number,
      prefer: 'open' | 'fringe' | 'any' = 'any',
      minSep = 40,
    ) => {
      const placedPts: { x: number; y: number }[] = [];
      let placed = 0;
      let tries = 0;
      while (placed < n && tries < n * 14) {
        tries++;
        const x = w.x + 28 + rng() * (w.w - 56);
        const y = w.y + 28 + rng() * (w.h - 56);
        const inCore = this.area.patches.some((p) => inRaggedCoverCore(x, y, p));
        const inFringe = this.area.patches.some((p) => inCoverFringe(x, y, p));
        if (inCore && rng() < 0.85) continue;
        if (prefer === 'open' && (inCore || inFringe) && rng() < 0.7) continue;
        if (prefer === 'fringe' && !inFringe && !inCore && rng() < 0.55) continue;
        if (placedPts.some((o) => Math.hypot(o.x - x, o.y - y) < minSep)) continue;
        const img = this.add.image(x, y, props.key, frame);
        img.setOrigin(0.5, 1);
        img.setScale(scaleLo + rng() * (scaleHi - scaleLo));
        this.landmarkSprites.push(img);
        placedPts.push({ x, y });
        placed++;
      }
    };
    const frames = props.frames;
    // 64px props: oaks large, shrubs secondary, cattails near cover beds.
    if (frames[0] !== undefined) place(frames[0], oakN, 1.15, 1.65, 'open', 72);
    if (frames[1] !== undefined) place(frames[1], Math.ceil(shrubN * 0.55), 0.7, 1.0, 'any', 48);
    if (frames[2] !== undefined) place(frames[2], Math.ceil(shrubN * 0.45), 0.65, 0.95, 'any', 48);
    if (frames[3] !== undefined) place(frames[3], cattailN, 0.95, 1.25, 'fringe', 40);
  }

  /**
   * Legacy tile path: multi-tone open frames + ragged cover tile stamps.
   * Kept for regions without a painted plate (and as SP fallback).
   */
  private drawOrganicCover(rng: () => number, tiled: boolean): void {
    const w = this.area.world;
    const rt = this.add.renderTexture(w.x, w.y, w.w, w.h).setOrigin(0, 0);
    const g = this.make.graphics({}, false);
    const [dark, mid, light] = tiled
      ? [0x3a3a1e, 0x545026, 0x6e6832]
      : [scaleColor(this.area.cover, 0.62), this.area.cover, scaleColor(this.area.cover, 1.3)];
    const seedHead = tiled ? 0x2a2814 : scaleColor(this.area.cover, 0.4);
    const rust = [0x8f4a26, 0xa85c30];
    const cfg = FIELD_TILESETS[regionOfArea(this.area.id).id];

    if (tiled && cfg) {
      for (let gy = 0; gy < Math.ceil(w.h / 16); gy++) {
        for (let gx = 0; gx < Math.ceil(w.w / 16); gx++) {
          const frame = cfg.open[Math.floor(rng() * cfg.open.length)];
          rt.drawFrame(cfg.key, frame, gx * 16, gy * 16);
        }
      }
    }

    for (const p of this.area.patches) {
      if (tiled && cfg) {
        const pad = 16;
        const x0 = Math.floor((p.x - pad) / 16) * 16;
        const y0 = Math.floor((p.y - pad) / 16) * 16;
        const x1 = Math.ceil((p.x + p.w + pad) / 16) * 16;
        const y1 = Math.ceil((p.y + p.h + pad) / 16) * 16;
        const fringeFrame = cfg.fringe ?? cfg.open[0];
        for (let ty = y0; ty < y1; ty += 16) {
          for (let tx = x0; tx < x1; tx += 16) {
            const cx = tx + 8;
            const cy = ty + 8;
            if (inCoverFringe(cx, cy, p)) {
              rt.drawFrame(cfg.key, fringeFrame, tx - w.x, ty - w.y);
            }
          }
        }
        for (let ty = Math.floor(p.y / 16) * 16; ty < p.y + p.h; ty += 16) {
          for (let tx = Math.floor(p.x / 16) * 16; tx < p.x + p.w; tx += 16) {
            if (inRaggedCoverCore(tx + 8, ty + 8, p)) {
              rt.drawFrame(cfg.key, cfg.cover, tx - w.x, ty - w.y);
            }
          }
        }
      }

      const pad = 14;
      const tufts = Math.round((p.w * p.h) / 14);
      for (let i = 0; i < tufts; i++) {
        const fx = (rng() + rng()) / 2;
        const fy = (rng() + rng()) / 2;
        const wx = p.x - pad + fx * (p.w + pad * 2);
        const wy = p.y - pad + fy * (p.h + pad * 2);
        if (!inRaggedCoverCore(wx, wy, p) && !inCoverFringe(wx, wy, p)) continue;
        const x = Math.round(wx) - w.x;
        const y = Math.round(wy) - w.y;
        const blades = 4 + Math.floor(rng() * 4);
        for (let b = 0; b < blades; b++) {
          const bx = x + Math.floor(rng() * 9) - 4;
          const h = 4 + Math.floor(rng() * 7);
          g.fillStyle([dark, mid, dark, light][Math.floor(rng() * 4)], 1).fillRect(bx, y - h, 1, h);
          if (rng() < 0.28) g.fillStyle(seedHead, 1).fillRect(bx, y - h - 2, 1, 2);
        }
      }
      const shrubs = Math.max(2, Math.round((p.w * p.h) / 3200));
      for (let i = 0; i < shrubs; i++) {
        const sx = Math.round(p.x + rng() * p.w) - w.x;
        const sy = Math.round(p.y + rng() * p.h) - w.y;
        const r = 2 + Math.floor(rng() * 3);
        g.fillStyle(rust[Math.floor(rng() * 2)], 1).fillCircle(sx, sy, r);
      }
    }

    const openTone = tiled ? 0xb89858 : scaleColor(this.area.grass, 1.15);
    const openDark = tiled ? 0x887038 : scaleColor(this.area.grass, 0.85);
    const openTufts = Math.round((w.w * w.h) / 1400);
    for (let i = 0; i < openTufts; i++) {
      const x = Math.floor(rng() * w.w);
      const y = Math.floor(rng() * w.h);
      if (this.area.patches.some((p) => inRaggedCoverCore(x + w.x, y + w.y, p))) continue;
      const h = 2 + Math.floor(rng() * 4);
      g.fillStyle(rng() < 0.55 ? openTone : openDark, 0.85).fillRect(x, y - h, 1, h);
    }

    rt.draw(g);
    g.destroy();
  }
}
