import { isFalconryPractice, FALCONRY_PRACTICE } from '../../game/falconryPractice';
import { huntStreamSeed, parseHuntSeed } from '../../game/huntSeed';
import { birdFlightExpired } from '../../game/birdFlightLifetime';
import { buildPheasantBody, buildPheasantWing, buildPheasantTail, posePheasantFoldedWings, pheasantWingbeat } from '../assets/pheasant';
import { createQuailFlight, selectQuailEscapeCover, stepQuailFlight, type QuailFlight } from '../quailFlight';
import { QUAIL_WORLD_SCALE, quailLaunchDelay } from '../quailPresentation';
import { QuailFlushDebris } from '../quailFlushDebris';
import * as THREE from 'three';
import { buildBobwhiteBody, buildBobwhiteWing, poseBobwhiteFoldedWings } from '../assets/bobwhite';
import { buildSharptailBody, buildSharptailWing, poseSharptailFoldedWings } from '../assets/sharptail';
import { sharptailLaunchDelay, sharptailWingbeat } from '../sharptailPresentation';
import { playFlush, playThud, playPheasantFlush, type PheasantFlushSound } from '../../audio';
import { RELIGHT_CHANCE, YOUNG_FLIGHT_MULT } from '../../game/birds';
import { mulberry32 } from '../../game/math';
import {
  escapeVelocityFan,
  exitDirFor,
  flushBias,
  glideStep,
  levelStep,
  type FlushBias,
} from '../../game/shot';
import { getSpecies, SPECIES, type SpeciesConfig } from '../../game/species';
import { isSpatialEncounterArea } from '../../game/huntSimulation';
import { evadeGoshawk, type QuarryTarget } from '../../game/falconry';
import { huntingDoctrine } from '../../game/huntDoctrine';
import type { Ctx, Subsystem } from '../engine';
import { P, fieldTimeOfDay, type TimeOfDay } from '../palette';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';

/** Authored properties use continuous covey launches from actual bird
 * positions. Each covey owns its escape basis and random stream; waiting for
 * a pool slot cannot discard a bird or redirect a covey already airborne.
 * Capture and live play use the same launch law. Flight advances on the fixed
 * tick; render updates write mesh transforms.
 */

/** Local streams — never ctx.rng (per-subsystem determinism law). */
const BIRD_ART_SEED = 0xb0bde7;
const RISE_SEED = 0x2e15e;

/** FlushScene's MAX_AIRBORNE: Duck Hunt rules the sky — at most a few
 *  readable targets at once; a big covey is a longer sequence. */
const WAVE_MAX = 3;
/** FlushScene's LAUNCH_GAP_MS — the breath between waves. */
const LAUNCH_GAP_MS = 300;
/** FlushScene sleeper knobs: chance / delay window (ms). */
const SLEEPER_CHANCE = 0.18;
const SLEEPER_MIN_MS = 350;
const SLEEPER_RAND_MS = 550;
/** FlushScene's per-flush break direction: ±28 px/s (drift = (r-.5)*56). */
const DRIFT_SPAN_PX = 56;
/** FlushScene's WAVE_SLOT_SPREAD — seeds the virtual screen-x that
 *  exitDirFor reads, so lane geometry biases exits exactly as in 2D. */
const SLOT_SPREAD_PX = 78;
/** 2D screen center x — exitDirFor's reference frame. */
const SCREEN_CX = 240;

/**
 * Flush-view px -> meters, horizontal axis. The shooting gallery ran its
 * own scale; 0.14 lands the authority numbers in believable air: a
 * 130 px/s bobwhite burst ≈ 18 m/s, GLIDE_MAX 150 ≈ 21 m/s downwind.
 */
const FLUSH_PX_TO_M = 0.14;
/**
 * Vertical axis runs a TIGHTER scale: the 2D sky was 205 px tall and a
 * burst crossed it in ~1.2 s — mapped 1:1 with the horizontal scale the
 * covey teleports out of every readable frame. 0.10 keeps the same beat
 * (steep climb, ~10 m up when the glide flattens) inside a composable
 * window. Same law, different axis of the translation.
 */
const FLUSH_PX_TO_M_V = 0.1;
/**
 * LAUNCH placement scale (px -> m): FlushScene staged launches on a 480
 * px readable stage — lanes SLOT_SPREAD apart, field position only a
 * clamped ±55 px NUDGE, ±16 px jitter ("this view runs on Duck Hunt
 * rules, not covey GPS"). Iteration 3 lesson: launching from raw sim
 * positions (±9 m covey jitter) scattered the explosion into lone
 * specks; the 2D stage placement IS the authority, so we translate it —
 * anchored at the covey centroid, spread along the fan's right axis.
 */
const LAUNCH_PX_TO_M = 0.035;
/** FlushScene's worldNudge clamp (±px) and launch jitter (±px). */
const NUDGE_CLAMP_PX = 55;
const NUDGE_GAIN = 0.35;
const LAUNCH_JITTER_PX = 16;
/**
 * Property-rise presentation scale on the 0.24 m body. Quail Fields uses
 * QUAIL_WORLD_SCALE consistently in flight and on the ground. The old 2D view
 * paid with chunky sprites (its bobwhite spanned ~9% of the screen):
 * the silhouette must read GAMEBIRD at the 15-25 m a rise honestly
 * frames from, and a to-scale bobwhite is a 6-12 px speck there.
 * Moment round: 3.0, measured — the-rise's camera (fov ~55) puts a
 * bird's 0.82 m scaled wingspan at 18-28 px across the 15-25 m band,
 * the mandated mass. Still a fraction of the 2D license.
 */
const RISE_SCALE = 3.3;
const GROUNDED_SCALE = 2.1;
const PHEASANT_REST_SCALE = 1.25;
/** Tip-to-tip wingspan of the UNSCALED model (m) — telemetry only. */
const SPAN_M = 0.308;

export type BirdFamily = 'quail' | 'partridge' | 'pheasant' | 'grouse' | 'woodcock' | 'chukar';

export interface BirdShape {
  family: BirdFamily;
  bodyLength: number;
  bodyWidth: number;
  bodyDepth: number;
  wingSpan: number;
  wingChord: number;
  tailLength: number;
  tailWidth: number;
  billLength: number;
}

export const BIRD_SHAPES: Record<BirdFamily, BirdShape> = {
  quail: { family: 'quail', bodyLength: 1, bodyWidth: 1, bodyDepth: 1, wingSpan: 1, wingChord: 1, tailLength: 1, tailWidth: 1, billLength: 1 },
  // Hungarian partridge carry more shoulder and a squarer tail than a
  // bobwhite. Keep the silhouette compact enough for a covey rise while
  // giving the bench-country bird its own readable body in the sky.
  partridge: { family: 'partridge', bodyLength: 1.12, bodyWidth: 1.22, bodyDepth: 1.18, wingSpan: 1.24, wingChord: 1.18, tailLength: 1.15, tailWidth: 1.24, billLength: 1.08 },
  pheasant: { family: 'pheasant', bodyLength: 1.32, bodyWidth: 1.13, bodyDepth: 1.05, wingSpan: 1.28, wingChord: 1.1, tailLength: 4.2, tailWidth: 0.7, billLength: 1.15 },
  grouse: { family: 'grouse', bodyLength: 1.16, bodyWidth: 1.34, bodyDepth: 1.24, wingSpan: 1.42, wingChord: 1.34, tailLength: 1.7, tailWidth: 1.85, billLength: 1 },
  woodcock: { family: 'woodcock', bodyLength: 1.05, bodyWidth: 1.04, bodyDepth: 1.13, wingSpan: 1.08, wingChord: 0.9, tailLength: 0.72, tailWidth: 0.85, billLength: 3.6 },
  // Chukar carry a compact, deep chest and a longer, squared tail than a
  // quail. The broad wing and red bill/head palette do the rest of the read
  // at shooting distance; it should look like a mountain gamebird, not a
  // recolored bobwhite.
  chukar: { family: 'chukar', bodyLength: 1.02, bodyWidth: 1.16, bodyDepth: 1.12, wingSpan: 1.28, wingChord: 1.18, tailLength: 1.28, tailWidth: 1.18, billLength: 1.24 },
};

export function birdFamilyFor(speciesId: string): BirdFamily {
  if (speciesId === 'ringneck') return 'pheasant';
  if (speciesId === 'hun') return 'partridge';
  if (speciesId === 'woodcock') return 'woodcock';
  if (speciesId === 'chukar') return 'chukar';
  if (['ruffed-grouse', 'sharptail', 'prairie-chicken', 'blue-grouse'].includes(speciesId)) return 'grouse';
  return 'quail';
}

/** Keep the public four-rig family mapping stable while giving the major
 * grouse countries slightly different proportions in the rendered mesh. */
function birdShapeFor(speciesId: string): BirdShape {
  const family = birdFamilyFor(speciesId);
  const base = BIRD_SHAPES[family];
  // The quail family shares the same low-poly construction, but not the
  // same proportions. These small silhouette changes keep a desert runner,
  // an oak-country topknot, a mountain bird, and a compact Mearns bird from
  // reading as one recolored bobwhite when they cross the sky.
  if (speciesId === 'california-quail') {
    return { ...base, bodyLength: 1.03, bodyWidth: 1.02, bodyDepth: 1.02, wingSpan: 1.08, wingChord: 1.05, tailLength: 1.28, tailWidth: 1.08, billLength: 1.02 };
  }
  if (speciesId === 'gambels-quail') {
    return { ...base, bodyLength: 1.02, bodyWidth: 1.08, bodyDepth: 1.06, wingSpan: 1.12, wingChord: 1.08, tailLength: 1.22, tailWidth: 1.12, billLength: 1.08 };
  }
  if (speciesId === 'scaled-quail') {
    return { ...base, bodyLength: .98, bodyWidth: 1.1, bodyDepth: 1.08, wingSpan: 1.16, wingChord: 1.12, tailLength: 1.08, tailWidth: 1.12, billLength: 1.04 };
  }
  if (speciesId === 'mearns-quail') {
    return { ...base, bodyLength: .9, bodyWidth: 1.08, bodyDepth: 1.12, wingSpan: 1.08, wingChord: 1.04, tailLength: .9, tailWidth: 1.02, billLength: 1.02 };
  }
  if (speciesId === 'mountain-quail') {
    return { ...base, bodyLength: 1.08, bodyWidth: 1.1, bodyDepth: 1.08, wingSpan: 1.2, wingChord: 1.12, tailLength: 1.48, tailWidth: 1.18, billLength: 1.06 };
  }
  if (['sharptail', 'prairie-chicken'].includes(speciesId)) {
    return { ...base, bodyLength: 1.2, bodyWidth: 1.18, bodyDepth: 1.12, wingSpan: 1.5, wingChord: 1.28, tailLength: 1.88, tailWidth: 1.38, billLength: 1.02 };
  }
  if (speciesId === 'blue-grouse') {
    return { ...base, bodyLength: 1.24, bodyWidth: 1.38, bodyDepth: 1.28, wingSpan: 1.48, wingChord: 1.36, tailLength: 2.02, tailWidth: 1.58, billLength: 1.02 };
  }
  return base;
}

export function birdVisualScale(species: SpeciesConfig): number {
  return Math.sqrt((species.size ?? 0.62) / 0.62);
}

/** Minimum forward carry along the escape bearing (m/s). Species speed
 * envelopes take over once the first wingbeats have found their rhythm. */
const FWD_MIN = 3.5;
const FWD_RAMP_MS = 1400;
/** How hard the escape bearing bends downwind (0 = pure away). */
const WIND_BIAS = 0.55;

/** LOW BURST LAW (moment round): elevation stays under ~15 deg for the
 *  first LOW_MS, then the climb unlocks over CLIMB_RAMP_MS — birds cross
 *  cover and horizon first, and only then lift away downwind. */
const LOW_ELEV_TAN = Math.tan((15 * Math.PI) / 180);
const LOW_MS = 1500;
const CLIMB_RAMP_MS = 1300;

/** Capture covey stage: the full covey launches clustered inside ~0.8 s. */
const CAPTURE_STAGGER_MS = 800;

/** A glide that touches grass after this long has put down — gone. */
const LAND_MIN_AIR_MS = 1200;

/** Pool = the airborne budget. Gameplay never holds more than a wave +
 *  sleepers aloft; the pool is sized for the capture covey stage, where
 *  a full 9-13 bird covey is up at once (~43 draw calls, ~2k tris). */
const POOL = 14;

/** 2D falling authority: 170 px/s drop, 540 deg/s tumble. */
const FALL_PX_PER_S = 170;
const TUMBLE_RAD_PER_S = (540 * Math.PI) / 180;

const DEBRIS_N = 24;
const DEBRIS_LIFE_MS = 900;

type SlotStatus = 'idle' | 'waiting' | 'flying' | 'falling' | 'grounded' | 'done';

export interface RayBirdTarget {
  simId: number;
  x: number;
  y: number;
  z: number;
  status: string;
}

/** Pure center-pattern hit selection used by the live gun and tests. */
export function pickBirdAlongRay(
  targets: readonly RayBirdTarget[],
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  spreadRad = 0.04,
  targetVisible?: (target: RayBirdTarget) => boolean,
): number | null {
  let bestId: number | null = null;
  let bestAlong = Infinity;
  const directionLength = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const dx = direction.x / directionLength;
  const dy = direction.y / directionLength;
  const dz = direction.z / directionLength;
  for (const target of targets) {
    if (target.status !== 'flying') continue;
    const rx = target.x - origin.x;
    const ry = target.y - origin.y;
    const rz = target.z - origin.z;
    const along = rx * dx + ry * dy + rz * dz;
    if (along <= 0 || along >= bestAlong) continue;
    const distanceSq = rx * rx + ry * ry + rz * rz;
    const perpendicular = Math.sqrt(Math.max(0, distanceSq - along * along));
    // The minimum pattern is intentionally forgiving at close range. It is
    // a gameplay allowance, independent of the bird's rendered wingspan.
    const patternRadius = Math.max(0.48, along * Math.tan(spreadRad));
    if (perpendicular <= patternRadius && (!targetVisible || targetVisible(target))) {
      bestId = target.simId;
      bestAlong = along;
    }
  }
  return bestId;
}

interface FlightContext {
  escX: number; escZ: number; rightX: number; rightZ: number;
  hunterX: number; hunterZ: number; driftPx: number; rng: () => number;
}

interface Slot {
  /** World-space escape profile. The implementation is shared with the
   * original Quail flight controller, but the profile is now authored from
   * each species' flight data and map doctrine. */
  spatialFlight?: QuailFlight;
  launchSound?: PheasantFlushSound;
  launchOriginX?: number;
  launchOriginY?: number;
  launchOriginZ?: number;
  flight?: FlightContext;
  status: SlotStatus;
  simId: number;
  species: SpeciesConfig;
  /** Young-of-year flight modifier copied from the simulation at launch. */
  young: boolean;
  sex?: 'hen' | 'rooster';
  /** Sim-authority velocity in FLUSH px/s: x lateral, y screen-down. */
  vel: { x: number; y: number };
  /** Virtual 2D screen-x (px) — exitDirFor's frame of reference. */
  sxPx: number;
  exitDir: 1 | -1 | 0;
  x: number;
  y: number;
  z: number;
  /** World velocity of the last tick (orientation reads these). */
  vxW: number;
  vyW: number;
  vzW: number;
  airMs: number;
  previousAirMs?: number;
  bank?: number;
  bankYaw?: number;
  fallPose?: { startMs: number; rotation: THREE.Euler; groundedMs?: number };
  delayMs: number;
  wobblePh: number;
  wobbleMult: number;
  gliding: boolean;
  root: THREE.Group;
  body: THREE.Mesh;
  wingLMesh: THREE.Mesh;
  wingRMesh: THREE.Mesh;
  wingL: THREE.Group;
  wingR: THREE.Group;
  tailMesh?: THREE.Mesh;
  visualScale: number;
  spanM: number;
}

interface BirdGeometrySet {
  tail?: THREE.BufferGeometry;
  body: THREE.BufferGeometry;
  wingL: THREE.BufferGeometry;
  wingR: THREE.BufferGeometry;
  shape: BirdShape;
  spanM: number;
}

/* ------------------------------ geometry ------------------------------ */

type V3 = readonly [number, number, number];

class SoupBuilder {
  private pos: number[] = [];
  private col: number[] = [];

  tri(a: V3, b: V3, c: V3, color: THREE.Color): void {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
  }

  quad(a: V3, b: V3, c: V3, d: V3, color: THREE.Color): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /** Both windings — thin wing/tail panels read from above and below. */
  quad2(a: V3, b: V3, c: V3, d: V3, color: THREE.Color): void {
    this.quad(a, b, c, d, color);
    this.quad(d, c, b, a, color);
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    return geo;
  }
}

interface SectZ {
  y: number;
  z: number;
  hw: number;
  hh: number;
}

/** Hex ring: top vertex, flanks, keel — same shape language as the dog. */
const HEX_ANG = [90, 150, 210, 270, 330, 30].map((d) => (d * Math.PI) / 180);

/**
 * Body loft sections, tail root -> head. ~0.24 m beak to tail tip and
 * CHUNKY: the belly ring is nearly as deep as the bird is long — the
 * round-shouldered bowling-pin silhouette that says GAMEBIRD against
 * sky, not songbird.
 */
const BODY_SECTS: SectZ[] = [
  { y: 0.006, z: -0.075, hw: 0.02, hh: 0.018 },
  { y: 0.0, z: -0.03, hw: 0.038, hh: 0.035 },
  { y: 0.0, z: 0.02, hw: 0.044, hh: 0.04 },
  { y: 0.009, z: 0.06, hw: 0.033, hh: 0.031 },
  { y: 0.024, z: 0.092, hw: 0.021, hh: 0.021 },
];

export class BirdsSystem implements Subsystem {
  readonly id = 'birds';

  private hunt!: Hunt3DSystem;
  private terrain!: TerrainSystem;
  private soundOffset = new THREE.Vector3();
  private coverSoundOffset = new THREE.Vector3();
  private soundInverse = new THREE.Quaternion();
  private listener?: THREE.Camera;
  private frozen = false;

  private fallEuler = new THREE.Euler();
  private restRotation = new THREE.Quaternion();
  private mat?: THREE.MeshLambertMaterial;
  private geos: THREE.BufferGeometry[] = [];
  private speciesGeos = new Map<string, BirdGeometrySet>();
  private slots: Slot[] = [];

  /** Sun-answer uniforms (the dog's facet recipe — diffuse only, sized
   *  for russet; NO emissive, NO rim: moment round, item 1). */
  private tone = {
    uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
    uWarmK: { value: 0 },
    uCoolK: { value: 0 },
    uCoolTint: { value: new THREE.Color(P.shadowNeutral) },
  };

  /* --------------------------- rise state --------------------------- */
  /** Sim bird ids already staged into this presentation. */
  private staged = new Set<number>();
  /** Launch queue (sim ids), ring buffer — covey order, like the 2D view. */
  private queue: number[] = [];
  private pendingFlights = new Map<number, FlightContext>();
  private qHead = 0;
  private qTail = 0;
  private riseActive = false;
  private riseSeq = 0;
  private riseSeed = RISE_SEED;
  private riseRng: () => number = mulberry32(RISE_SEED);
  private bias: FlushBias = { min: 0.9, max: 1.15, kind: 'earned' };
  private driftPx = 0;
  /** Escape bearing (unit, world xz) and its right axis — the fan plane. */
  private escX = 0;
  private escZ = 1;
  private rightX = 1;
  private rightZ = 0;
  /** Hunter world position at the flush — range is measured from here. */
  private hunterX = 0;
  private hunterZ = 0;
  /** Covey centroid at the flush: world m (launch anchor) + sim px (nudge). */
  private originX = 0;
  private originZ = 0;
  private originSimX = 0;
  private originSimY = 0;
  /** ms since the flush was staged (rise-local clock). */
  private riseMs = 0;
  private lastLaunchMs = -Infinity;
  private laneBuf = [0, 1, 2];

  /* ----------------------- launch-burst debris ---------------------- */
  private debrisGeo?: THREE.BufferGeometry;
  private debrisMesh?: THREE.Mesh;
  private debrisMat?: THREE.MeshLambertMaterial;
  private refinedQuail = false;
  /** Per-particle dir (xyz) + speed, rolled per burst from the rise rng. */
  private debrisVel = new Float32Array(DEBRIS_N * 4);
  private debrisOx = 0;
  private debrisOy = 0;
  private debrisOz = 0;
  private debrisMs = -1;
  private launchCover?: QuailFlushDebris;
  private coverEvents?: EventTarget;
  /** World-space rises stay attached to their authored cover on all authored
   * properties. Solitary pheasant/Chukar paths retain their dedicated
   * screen-velocity rules because those profiles already encode level-out and
   * downhill escape behavior. */
  private spatialEncounter = false;

  /* ------------------------- hit feather burst ------------------------ */
  private featherGeo?: THREE.BufferGeometry;
  private featherMat?: THREE.PointsMaterial;
  private featherPoints?: THREE.Points;
  private featherPos = new Float32Array(14 * 3);
  private featherVel = new Float32Array(14 * 3);
  private featherMs = -1;

  // Preallocated scratch.
  private w2 = { x: 0, z: 0 };
  private carryW = { x: 0, z: 0 };

  init(ctx: Ctx): void {
    // Vary practice flights with the visit while preserving exact URL replays
    // and the established flight streams of other hunt modes.
    this.riseSeed = isFalconryPractice(location.search)
      ? huntStreamSeed(parseHuntSeed(location.search) ?? FALCONRY_PRACTICE.seed, RISE_SEED) : RISE_SEED;
    this.listener = ctx.camera;
    this.coverEvents = ctx.events;
    this.frozen = new URLSearchParams(location.search).has('capture');
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.terrain = ctx.get<TerrainSystem>('terrain');
    this.refinedQuail = this.hunt.areaConfig().id === 'quail-fields';
    this.spatialEncounter = isSpatialEncounterArea(this.hunt.areaConfig().id);

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // Moment round, item 1: NO emissive, NO rim — the ember-speck read
    // was exactly the old glow kit. Bodies take the WORLD's light like
    // everything else: warm lift on sun-facing facets, shade facets
    // multiplied toward the hour's shadow tint with the dog's sky-grade
    // modeling — dark against the dawn sky between camera and sun, lit
    // buff bellies when the sun catches them.
    const tone = this.tone;
    this.mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, tone);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uSunDirW;\nuniform float uWarmK;\nuniform float uCoolK;\n' +
            'uniform vec3 uCoolTint;',
        )
        .replace(
          '#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\n' +
            '\tvec3 gWN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );\n' +
            '\tfloat gSplit = smoothstep( -0.15, 0.3, dot( gWN, uSunDirW ) );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.26, 1.1, 0.88 ), gSplit * uWarmK );\n' +
            '\tfloat gSky = clamp( gWN.y * 0.5 + 0.5, 0.0, 1.0 );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), uCoolTint * mix( 0.72, 1.1, gSky ), ( 1.0 - gSplit ) * uCoolK );',
        );
    };
    const applyTod = (tod: TimeOfDay): void => {
      const spec = fieldTimeOfDay(this.hunt.huntState().areaId,tod);
      const silh = spec.grassLumCap < 1;
      const lowSun = THREE.MathUtils.clamp(1 - (spec.sunElevation - 2) / 13, 0, 1);
      const el = THREE.MathUtils.degToRad(spec.sunElevation);
      const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
      this.tone.uSunDirW.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      this.tone.uWarmK.value = 0.3 + spec.floraWarm * 0.5;
      this.tone.uCoolTint.value.setHex(spec.grassShadow).multiplyScalar(0.82);
      this.tone.uCoolK.value = silh ? 0.65 : 0.35 + lowSun * 0.35;
    };
    applyTod(ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => applyTod(e.detail)) as EventListener);

    this.buildPool(ctx);
    if (this.spatialEncounter) {
      const pheasant = this.hunt.areaConfig().id === 'pheasant-coverts';
      const cover = pheasant ? ctx.get<Subsystem & { launchHeightAt?(x: number, z: number): number }>('grass') : undefined;
      this.launchCover = new QuailFlushDebris(ctx.quality, (x, z) => this.terrain.heightAt(x, z),
        pheasant ? 'tall-cover' : 'ground', cover?.launchHeightAt ? (x, z) => cover.launchHeightAt!(x, z) : undefined);
      ctx.scene.add(this.launchCover.mesh);
    } else this.buildDebris(ctx);
    this.buildFeathers(ctx);

    // Tooling-only family gallery: a frozen, live-material bird at honest
    // shooting distance. Useful for silhouette review without needing a
    // particular species to survive the dog/nerve loop long enough to point.
    const previewSpecies = new URLSearchParams(location.search).get('birdPreview');
    if (this.frozen && previewSpecies && SPECIES.some((species) => species.id === previewSpecies)) {
      const slot = this.slots[0];
      const species = getSpecies(previewSpecies);
      this.applySpeciesAppearance(slot, species, previewSpecies === 'ringneck' ? new URLSearchParams(location.search).get('birdSex') === 'hen' ? 'hen' : 'rooster' : undefined);
      slot.simId = -999;
      slot.status = 'flying';
      slot.x = 0;
      slot.z = 30;
      slot.y = this.terrain.heightAt(slot.x, slot.z) + 3;
      slot.vxW = 1;
      slot.vyW = 0;
      slot.vzW = 0;
      slot.airMs = 450;
      slot.root.visible = true;
    }

    // CAPTURE AUDIT (moment round): read-only measurement handle so the
    // harness can gate the rise on a REAL covey (9-13 birds, not the
    // 4-bird family the first point happens to find) and frame off the
    // true escape bearing. Tooling-only; never runs in gameplay frames.
    if (this.frozen) {
      (window as unknown as { __riseAudit?: unknown }).__riseAudit = {
        /** Hidden-bird head count per covey, plus the pointed covey. */
        census: () => {
          const counts = new Map<number, number>();
          const birds = this.hunt.huntState().birds;
          for (const b of birds) {
            if (b.state !== 'hidden') continue;
            counts.set(b.coveyId, (counts.get(b.coveyId) ?? 0) + 1);
          }
          return [...counts.entries()].map(([coveyId, n]) => ({ coveyId, n }));
        },
        /** Hidden birds in the covey the dog is pointing (0 = no point). */
        pointedCoveySize: () => {
          const dog = this.hunt.dog();
          if (dog.state !== 'pointing' || dog.pointedBirdId === null) return 0;
          const birds = this.hunt.huntState().birds;
          let cid = -1;
          for (const b of birds) {
            if (b.id === dog.pointedBirdId) {
              cid = b.coveyId;
              break;
            }
          }
          let n = 0;
          for (const b of birds) {
            if (b.state === 'hidden' && b.coveyId === cid) n++;
          }
          return n;
        },
        /** The staged rise's geometry: escape bearing, origin, hunter. */
        rise: () => ({
          escX: this.escX,
          escZ: this.escZ,
          originX: this.originX,
          originZ: this.originZ,
          hunterX: this.hunterX,
          hunterZ: this.hunterZ,
        }),
      };
    }
  }

  /* ------------------------------ build ------------------------------ */

  private buildPool(ctx: Ctx): void {
    const rng = mulberry32(BIRD_ART_SEED);
    for (const species of SPECIES) this.buildSpeciesGeometry(species, false);
    this.buildSpeciesGeometry(getSpecies('ringneck'), true);
    const fallback = this.speciesGeos.get('bobwhite')!;

    for (let i = 0; i < POOL; i++) {
      const root = new THREE.Group();
      const body = new THREE.Mesh(fallback.body, this.mat!);
      body.castShadow = false;
      body.receiveShadow = false;
      root.add(body);
      const wingL = new THREE.Group();
      const wingR = new THREE.Group();
      const wl = new THREE.Mesh(fallback.wingL, this.mat!);
      const wr = new THREE.Mesh(fallback.wingR, this.mat!);
      wl.castShadow = wl.receiveShadow = false;
      wr.castShadow = wr.receiveShadow = false;
      wingL.add(wl);
      wingR.add(wr);
      // Shoulder pivots high on the chest — the flap arcs over the back.
      wingL.position.set(-0.03, 0.016, 0.028);
      wingR.position.set(0.03, 0.016, 0.028);
      root.add(wingL);
      root.add(wingR);
      root.scale.setScalar(RISE_SCALE);
      root.visible = false;
      ctx.scene.add(root);
      this.slots.push({
        status: 'idle',
        simId: -1,
        species: getSpecies('bobwhite'),
        young: false,
        vel: { x: 0, y: 0 },
        sxPx: SCREEN_CX,
        exitDir: 0,
        x: 0,
        y: 0,
        z: 0,
        vxW: 0,
        vyW: 0,
        vzW: 0,
        airMs: 0,
        delayMs: 0,
        wobblePh: rng() * 6.28,
        wobbleMult: 1,
        gliding: false,
        root,
        body,
        wingLMesh: wl,
        wingRMesh: wr,
        wingL,
        wingR,
        visualScale: 1,
        spanM: SPAN_M,
      });
    }
  }

  private buildSpeciesGeometry(species: SpeciesConfig, hen: boolean): void {
    const shape = birdShapeFor(species.id);
    const muted = hen ? 0.68 : 1;
    const back = new THREE.Color(species.palette.body).lerp(new THREE.Color(P.warmGray), hen ? 0.5 : 0.16);
    const backDim = back.clone().multiplyScalar(0.76);
    const belly = back.clone().lerp(new THREE.Color(P.strawPale), 0.48).multiplyScalar(muted);
    const cap = new THREE.Color(hen ? species.palette.body : species.palette.head).multiplyScalar(muted);
    const throat = cap.clone().lerp(new THREE.Color(P.strawPale), hen ? 0.3 : 0.58);
    const tail = new THREE.Color(species.palette.tail).multiplyScalar(muted);
    const wingTop = back.clone().multiplyScalar(0.9);
    const wingTopDim = wingTop.clone().multiplyScalar(0.8);
    const wingUnder = belly.clone().multiplyScalar(0.78);
    const body = species.id === 'ringneck' ? buildPheasantBody(hen) : species.id === 'bobwhite' ? buildBobwhiteBody()
      : species.id === 'sharptail' ? buildSharptailBody() : this.buildBodyGeo(back, backDim, belly, cap, throat, tail, shape);
    const wingL = species.id === 'ringneck' ? buildPheasantWing(-1,hen) : species.id === 'bobwhite' ? buildBobwhiteWing(-1)
      : species.id === 'sharptail' ? buildSharptailWing(-1) : this.buildWingGeo(-1, wingTop, wingTopDim, wingUnder, shape);
    const wingR = species.id === 'ringneck' ? buildPheasantWing(1,hen) : species.id === 'bobwhite' ? buildBobwhiteWing(1)
      : species.id === 'sharptail' ? buildSharptailWing(1) : this.buildWingGeo(1, wingTop, wingTopDim, wingUnder, shape);
    const tailGeo = species.id === 'ringneck' ? buildPheasantTail(hen) : undefined;
    if (tailGeo) this.geos.push(tailGeo);
    this.geos.push(body, wingL, wingR);
    wingR.computeBoundingBox();
    const spanM = 2 * (0.03 * shape.bodyWidth + wingR.boundingBox!.max.x);
    this.speciesGeos.set(`${species.id}${hen ? ':hen' : ''}`, { body, wingL, wingR, tail: tailGeo, shape, spanM });
  }

  private applySpeciesAppearance(
    slot: Slot,
    species: SpeciesConfig,
    sex?: 'hen' | 'rooster',
  ): void {
    const geometry = this.speciesGeos.get(`${species.id}${sex === 'hen' ? ':hen' : ''}`)
      ?? this.speciesGeos.get(species.id)!;
    if (geometry.tail) {
      if (!slot.tailMesh) {
        slot.tailMesh = new THREE.Mesh(geometry.tail, this.mat!);
        slot.tailMesh.position.set(0,.004,-.085);
        slot.root.add(slot.tailMesh);
      }
      slot.tailMesh.geometry = geometry.tail;
      slot.tailMesh.visible = true;
      slot.tailMesh.rotation.set(0,0,0);
    } else if (slot.tailMesh) slot.tailMesh.visible = false;
    slot.species = species;
    slot.sex = sex;
    slot.body.geometry = geometry.body;
    slot.body.updateMorphTargets();
    slot.wingLMesh.geometry = geometry.wingL;
    slot.wingRMesh.geometry = geometry.wingR;
    slot.wingLMesh.updateMorphTargets();
    slot.wingRMesh.updateMorphTargets();
    slot.wingL.position.set(
      -0.03 * geometry.shape.bodyWidth,
      0.016 * geometry.shape.bodyDepth,
      0.028 * geometry.shape.bodyLength,
    );
    slot.wingR.position.set(
      0.03 * geometry.shape.bodyWidth,
      0.016 * geometry.shape.bodyDepth,
      0.028 * geometry.shape.bodyLength,
    );
    slot.visualScale = birdVisualScale(species);
    slot.spanM = geometry.spanM;
  }

  /** Hex-lofted body + stub tail fan, one geometry (one draw call). */
  private buildBodyGeo(
    back: THREE.Color,
    backDim: THREE.Color,
    belly: THREE.Color,
    cap: THREE.Color,
    throat: THREE.Color,
    tailC: THREE.Color,
    shape: BirdShape,
  ): THREE.BufferGeometry {
    const b = new SoupBuilder();
    const rings: V3[][] = BODY_SECTS.map((s) => {
      const r: V3[] = new Array(6);
      for (let i = 0; i < 6; i++) {
        r[i] = [
          Math.cos(HEX_ANG[i]) * s.hw * shape.bodyWidth,
          (s.y + Math.sin(HEX_ANG[i]) * s.hh) * shape.bodyDepth,
          s.z * shape.bodyLength,
        ];
      }
      return r;
    });
    // Per-segment coloring around the ring: segments 5-0 and 0-1 are the
    // BACK (russet), 1-2 / 4-5 the flanks (dimmed), 2-3 / 3-4 the BELLY
    // (buff) — the two-tone gamebird read. The head band (last) swaps to
    // dark cap over buff throat: bobwhite's face pattern at silhouette
    // scale.
    const segTone = (band: number, j: number): THREE.Color => {
      const isHead = band === BODY_SECTS.length - 2;
      if (j === 5 || j === 0) return isHead ? cap : back;
      if (j === 1 || j === 4) return isHead ? cap : backDim;
      return isHead ? throat : belly;
    };
    for (let k = 0; k < rings.length - 1; k++) {
      const rear = rings[k];
      const front = rings[k + 1];
      for (let j = 0; j < 6; j++) {
        const j2 = (j + 1) % 6;
        b.quad(rear[j], rear[j2], front[j2], front[j], segTone(k, j));
      }
    }
    // Caps: tail-root point and the beak.
    const capRear: V3 = [0, 0.008 * shape.bodyDepth, -0.092 * shape.bodyLength];
    const capFront: V3 = [0, 0.02 * shape.bodyDepth, 0.118 * shape.bodyLength + 0.045 * (shape.billLength - 1)];
    const first = rings[0];
    const last = rings[rings.length - 1];
    for (let j = 0; j < 6; j++) {
      const j2 = (j + 1) % 6;
      b.tri(first[j2], first[j], capRear, backDim);
      b.tri(last[j], last[j2], capFront, cap);
    }
    // Stub tail: two short fan panels — bobwhite barely has one, and the
    // SHORT tail is half of what separates quail from songbird in the sky.
    const tailRoot = -0.07 * shape.bodyLength;
    const tailTip = tailRoot - 0.048 * shape.tailLength;
    const tw = shape.tailWidth;
    b.quad2([-0.018 * tw, 0.01, tailRoot], [0.004 * tw, 0.012, tailRoot], [0.002 * tw, 0.0, tailTip], [-0.02 * tw, -0.002, tailTip * 0.96], tailC);
    b.quad2([-0.004 * tw, 0.012, tailRoot], [0.018 * tw, 0.01, tailRoot], [0.02 * tw, -0.002, tailTip * 0.96], [-0.002 * tw, 0.0, tailTip], tailC);
    return b.build();
  }

  /**
   * One wing: broad inner panel, shorter ROUNDED outer panel, and a blunt
   * tip cap that rounds the silhouette — the stubby quail paddle, nothing
   * like a swallow's taper. Each panel is emitted with BOTH windings and
   * TWO colors: dark russet reads from above, buff belly-tone from below
   * (moment round: lit bellies when the sun catches the beat).
   * side -1 = left (extends -x), +1 = right.
   */
  private buildWingGeo(
    side: 1 | -1,
    top: THREE.Color,
    topDim: THREE.Color,
    under: THREE.Color,
    shape: BirdShape,
  ): THREE.BufferGeometry {
    const b = new SoupBuilder();
    const s = side;
    const v = (p: V3): V3 => [p[0] * shape.wingSpan, p[1], p[2] * shape.wingChord];
    const panel = (a: V3, p2: V3, c: V3, d: V3, up: THREE.Color): void => {
      b.quad(v(a), v(p2), v(c), v(d), up); // top winding — dark russet
      b.quad(v(d), v(c), v(p2), v(a), under); // underside winding — pale buff
    };
    // Inner panel: shoulder edge hugs the body, trailing edge full-chord.
    panel(
      [0, 0, -0.034],
      [0, 0, 0.038],
      [s * 0.06, -0.002, 0.034],
      [s * 0.06, -0.004, -0.046],
      top,
    );
    // Outer panel: chord eases in, tip barely sweeps — ROUND, not tapered.
    panel(
      [s * 0.06, -0.004, -0.046],
      [s * 0.06, -0.002, 0.034],
      [s * 0.102, -0.008, 0.022],
      [s * 0.102, -0.009, -0.032],
      topDim,
    );
    // Blunt tip cap: closes the paddle with a rounded end.
    panel(
      [s * 0.102, -0.009, -0.032],
      [s * 0.102, -0.008, 0.022],
      [s * 0.124, -0.011, 0.008],
      [s * 0.124, -0.011, -0.016],
      topDim,
    );
    return b.build();
  }

  private buildDebris(ctx: Ctx): void {
    // Launch burst: two dozen straw/duff bits kicked out of the cover as
    // the covey blows — one mesh, vertex-colored, visible only while a
    // burst lives. Grass-parting note: the shader parting uniforms belong
    // to grass/dog; this debris is the birds' own half of the moment.
    const rng = mulberry32(BIRD_ART_SEED ^ 0x5eed);
    const pos = new Float32Array(DEBRIS_N * 4 * 3);
    const col = new Float32Array(DEBRIS_N * 4 * 3);
    const idx = new Uint16Array(DEBRIS_N * 6);
    const tones = [
      new THREE.Color(P.straw),
      new THREE.Color(P.oliveMid),
      new THREE.Color(P.khaki),
      new THREE.Color(P.soilBrown),
    ];
    for (let i = 0; i < DEBRIS_N; i++) {
      const c = tones[Math.floor(rng() * tones.length)];
      for (let v = 0; v < 4; v++) {
        col[(i * 4 + v) * 3] = c.r;
        col[(i * 4 + v) * 3 + 1] = c.g;
        col[(i * 4 + v) * 3 + 2] = c.b;
      }
      idx[i * 6] = i * 4;
      idx[i * 6 + 1] = i * 4 + 1;
      idx[i * 6 + 2] = i * 4 + 2;
      idx[i * 6 + 3] = i * 4;
      idx[i * 6 + 4] = i * 4 + 2;
      idx[i * 6 + 5] = i * 4 + 3;
    }
    this.debrisGeo = new THREE.BufferGeometry();
    this.debrisGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.debrisGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.debrisGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    if (this.refinedQuail) this.debrisMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    this.debrisMesh = new THREE.Mesh(this.debrisGeo, this.debrisMat ?? this.mat!);
    this.debrisMesh.castShadow = this.debrisMesh.receiveShadow = false;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.visible = false;
    ctx.scene.add(this.debrisMesh);
  }

  private buildFeathers(ctx: Ctx): void {
    this.featherGeo = new THREE.BufferGeometry();
    this.featherGeo.setAttribute('position', new THREE.BufferAttribute(this.featherPos, 3));
    this.featherMat = new THREE.PointsMaterial({
      color: P.strawPale,
      size: 0.085,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    if (this.refinedQuail) this.featherMat.onBeforeCompile = shader => {
      // Small tapered down feathers instead of untextured square point sprites.
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 featherUV = gl_PointCoord * 2.0 - 1.0;
        float featherEdge = 1.0 - abs(featherUV.y) - abs(featherUV.x) * 2.5;
        if (featherEdge <= 0.0) discard;
        diffuseColor.a *= smoothstep(0.0, 0.2, featherEdge);
      `);
    };
    this.featherPoints = new THREE.Points(this.featherGeo, this.featherMat);
    this.featherPoints.frustumCulled = false;
    this.featherPoints.visible = false;
    ctx.scene.add(this.featherPoints);
  }

  private burstFeathers(slot: Slot): void {
    for (let i = 0; i < this.featherPos.length / 3; i++) {
      const j = i * 3;
      this.featherPos[j] = slot.x;
      this.featherPos[j + 1] = slot.y;
      this.featherPos[j + 2] = slot.z;
      const azimuth = this.riseRng() * Math.PI * 2;
      const speed = 0.7 + this.riseRng() * 1.8;
      this.featherVel[j] = Math.cos(azimuth) * speed;
      this.featherVel[j + 1] = 0.5 + this.riseRng() * 1.7;
      this.featherVel[j + 2] = Math.sin(azimuth) * speed;
    }
    this.featherMs = 0;
    if (this.featherPoints) this.featherPoints.visible = true;
    const position = this.featherGeo?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (position) position.needsUpdate = true;
  }

  /* ----------------------------- sim tick ---------------------------- */

  fixedUpdate(ctx: Ctx, dtMs: number): void {
    if (this.frozen) return;
    this.tickBirds(dtMs);
  }

  /** Capture harness: advance the rise by exact 30 Hz ticks (the 2D
   *  scene-cut translated — field sim may hold while the rise plays). */
  step(_ctx: Ctx, ticks: number): void {
    for (let i = 0; i < ticks; i++) this.tickBirds(1000 / 30);
  }

  private tickBirds(dtMs: number): void {
    const dt = dtMs / 1000;
    this.riseMs += dtMs;

    // 1. Detect newly flushed sim birds -> stage a rise (covey order).
    const simBirds = this.hunt.huntState().birds;
    let newRise = false;
    const newCoveys = new Map<number, typeof simBirds>();
    for (const bird of simBirds) {
      if (bird.state === 'hidden' && this.spatialEncounter) this.staged.delete(bird.id);
      if (bird.state !== 'flushed' || this.staged.has(bird.id)) continue;
      this.staged.add(bird.id);
      if (this.spatialEncounter) {
        const covey = newCoveys.get(bird.coveyId) ?? [];
        covey.push(bird); newCoveys.set(bird.coveyId, covey);
      } else {
        this.queue[this.qTail++] = bird.id;
        if (!this.riseActive) newRise = true;
      }
    }
    if (this.spatialEncounter) {
      for (const covey of newCoveys.values()) {
        this.stageRise(covey);
        const flight: FlightContext = { escX:this.escX,escZ:this.escZ,rightX:this.rightX,rightZ:this.rightZ,
          hunterX:this.hunterX,hunterZ:this.hunterZ,driftPx:this.driftPx,rng:this.riseRng };
        for (const bird of covey) { this.queue[this.qTail++] = bird.id; this.pendingFlights.set(bird.id,flight); }
        if (!this.frozen && covey.some(bird => bird.speciesId !== 'ringneck')) playFlush();
      }
    } else if (newRise) {
      this.stageRise(simBirds);
      if (!this.frozen) playFlush();
    }

    // 2. Fly what's flying.
    let anyAloft = false;
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (s.status === 'idle' || s.status === 'done') continue;
      if (s.status === 'grounded') {
        if (s.fallPose?.groundedMs !== undefined) s.fallPose.groundedMs += dtMs;
        const bird = simBirds.find((candidate) => candidate.id === s.simId);
        if (!bird || bird.state === 'retrieved' || bird.state === 'escaped') {
          s.status = 'done';
          s.root.visible = false;
        }
        continue;
      }
      if (s.status === 'waiting') {
        anyAloft = true;
        s.delayMs -= dtMs;
        if (s.delayMs <= 0) {
          s.status = 'flying';
          this.disturbLaunchCover(s);
        }
        continue;
      }
      if (s.status === 'falling') {
        if (this.spatialEncounter && s.species.id === 'ringneck') {
          // Retain launch/crossing momentum at impact. Drag bleeds forward
          // carry while gravity turns even an upward hit into a falling arc.
          const drag = .65, decay = Math.exp(-drag * dt);
          s.x += s.vxW * (1 - decay) / drag;
          s.z += s.vzW * (1 - decay) / drag;
          s.vxW *= decay; s.vzW *= decay;
          s.y += s.vyW * dt - .5 * 9.81 * dt * dt;
          s.vyW -= 9.81 * dt;
        } else {
          // Legacy screen-space falling remains unchanged for other birds.
          s.vyW = -FALL_PX_PER_S * FLUSH_PX_TO_M_V;
          s.y += s.vyW * dt;
        }
        s.airMs += dtMs;
        const g = this.terrain.heightAt(s.x, s.z);
        if (s.y <= g + 0.06) {
          s.y = g + 0.06;
          s.status = 'grounded';
          if (s.fallPose) s.fallPose.groundedMs = 0;
          this.hunt.recordFallWorld(s.simId, s.x, s.z);
          playThud();
        }
        continue;
      }
      // flying
      anyAloft = true;
      s.previousAirMs = s.airMs;
      s.airMs += dtMs;
      const fl = s.species.flight;
      const doctrine = huntingDoctrine(this.hunt.areaConfig().id);
      const flight = s.flight!;
      if (s.spatialFlight) {
        stepQuailFlight(s.spatialFlight,s,dt,(x,z)=>this.terrain.heightAt(x,z));
      } else {
        // Legacy scenes retain screen-space velocity and exit-drive shaping.
        if (fl.glideAfterMs !== undefined && s.airMs > fl.glideAfterMs) {
          if (s.exitDir === 0) s.exitDir = exitDirFor(s.vel.x, s.sxPx);
          glideStep(s.vel, s.exitDir, dt);
          s.gliding = true;
        }
        if (fl.levelAfterMs !== undefined && s.airMs > fl.levelAfterMs) {
          if (s.exitDir === 0) s.exitDir = exitDirFor(s.vel.x, s.sxPx);
          levelStep(s.vel, s.exitDir, dt);
        }
        s.wobblePh += dt * 9;
        const latPx = s.vel.x + Math.sin(s.wobblePh) * fl.wobble * doctrine.flight.wobble * s.wobbleMult;
        s.sxPx += s.vel.x * dt;
        // 3D translation: lateral px on the fan's right axis, climb from
        // screen-y, forward carry along the escape bearing (ramping as the
        // wings bite). Range from the hunter grows every single tick.
        // Spatial rises still honor the species' authored speed envelope. The
        // old common 3.5→9 m/s impulse made woodcock, pheasant, and Chukar
        // share the same pace once they left the cover. Keep a gentle wing-in
        // ramp, then let each species' glide/level beat shape the carry.
        const speedT = Math.min(1, s.airMs / FWD_RAMP_MS);
        const pheasantLaunch = s.species.id === 'ringneck';
        const launchDrive = pheasantLaunch ? .45 + .55 * THREE.MathUtils.smoothstep(s.airMs, 0, 900) : 1;
        const speciesFwd = (fl.speedMin + (fl.speedMax - fl.speedMin) * speedT) * .055;
        const glideK = fl.glideAfterMs !== undefined && s.airMs > fl.glideAfterMs ? .84 : 1;
        const levelK = fl.levelAfterMs !== undefined && s.airMs > fl.levelAfterMs ? 1.1 : 1;
        const fwd = Math.max(FWD_MIN, speciesFwd * launchDrive) * doctrine.flight.carry *
          (s.young ? YOUNG_FLIGHT_MULT : 1) * glideK * levelK;
        // Lateral ramp (iteration 3): the 2D fan speeds are instant-on —
        // honest on a flat screen, but in world space they tore the covey
        // 20 m wide inside a second. The burst leaves as ONE explosion and
        // the fan opens as the wings bite (full authority by 1.5 s).
        const latK = 0.5 + 0.5 * Math.min(1, s.airMs / 1500);
        const latM = latPx * FLUSH_PX_TO_M * latK * doctrine.flight.lateral;
        s.vxW = flight.escX * fwd + flight.rightX * latM;
        s.vzW = flight.escZ * fwd + flight.rightZ * latM;
        s.vyW = -s.vel.y * FLUSH_PX_TO_M_V * doctrine.flight.climb;
        // LOW BURST LAW (moment round, item 2): cap the climb under ~15 deg
        // for the first 1.5 s, unlocking over the next 1.3 — the covey
        // crosses COVER and HORIZON, then lifts away downwind. Surplus
        // climb is not thrown away: it becomes drive down the escape
        // bearing, so the burst reads VIOLENT, not clipped.
        const horizV = Math.hypot(s.vxW, s.vzW);
        // The low, downhill Chukar break belongs to the bird, not the map.
        // Chukar can appear as a small share on another property, while a
        // Hun or other bycatch bird can share Chukar Ridge. Keep the terrain
        // doctrine's wet-bottom/canyon pacing for those properties, but do
        // not let a map label rewrite another species' flight envelope.
        const downhillFlight = s.species.flightDirection === 'downhill';
        const lowMs = downhillFlight ? 550
          : doctrine.style === 'bottoms' || doctrine.style === 'canyon' ? 750 : LOW_MS;
        const climbRampMs = downhillFlight ? 900
          : doctrine.style === 'bottoms' || doctrine.style === 'canyon' ? 850 : CLIMB_RAMP_MS;
        const lowElevationTan = downhillFlight ? Math.tan(9 * Math.PI / 180)
          : doctrine.style === 'bottoms' ? Math.tan(28 * Math.PI / 180)
            : doctrine.style === 'canyon' ? Math.tan(24 * Math.PI / 180) : LOW_ELEV_TAN;
        const free = Math.min(1, Math.max(0, (s.airMs - lowMs) / climbRampMs));
        const climbCap = horizV * (lowElevationTan + free * (downhillFlight ? 1.05 : 1.8));
        // Pheasants punch upward out of standing cover; the authored
        // levelAfterMs controller then turns the burst into forward carry.
        // Applying the covey's low cap here buried the first wingbeats.
        if (!pheasantLaunch && s.vyW > climbCap) {
          const excess = s.vyW - climbCap;
          s.vyW = climbCap;
          s.vxW += flight.escX * excess * 0.4;
          s.vzW += flight.escZ * excess * 0.4;
        }
        // A bobwhite tops out near 18 m/s over the ground — the transfer
        // must not turn the burst into artillery (iteration 2: 0.85 of the
        // freed climb sent birds 20 m in 0.8 s).
        const hv2 = Math.hypot(s.vxW, s.vzW);
        if (hv2 > 18.5) {
          const k = 18.5 / hv2;
          s.vxW *= k;
          s.vzW *= k;
        }
      }
      const hawk = this.hunt.falconry;
      if (hawk?.targetId === s.simId && (hawk.phase === 'launching' || hawk.phase === 'chasing')) evadeGoshawk(s, s.simId, hawk.position);
      this.updatePheasantBank(s, dt);
      s.x += s.vxW * dt;
      s.z += s.vzW * dt;
      s.y += s.vyW * dt;
      const g = this.terrain.heightAt(s.x, s.z);
      if (s.y < g + 0.25) {
        s.y = g + 0.25;
        if (s.airMs > LAND_MIN_AIR_MS) {
          // Preserve the visible put-down so following the flight leads to
          // the same cover for this survivor. Range/time exits below
          // have no landing and cannot silently reappear elsewhere.
          s.status = 'done';
          s.root.visible = false;
          this.hunt.resolveBird(s.simId, 'escaped', this.spatialEncounter ? { x: s.x, z: s.z } : undefined);
          continue;
        }
      }
      const rx = s.x - flight.hunterX;
      const rz = s.z - flight.hunterZ;
      const pursued = hawk?.targetId === s.simId && (hawk.phase === 'launching' || hawk.phase === 'chasing');
      if (birdFlightExpired(rx * rx + rz * rz, s.airMs, !!s.spatialFlight?.target, pursued)) {
        s.status = 'done';
        s.root.visible = false;
        this.hunt.resolveBird(s.simId, 'escaped');
      }
    }

    // Spatial properties launch every available bird from its real cover;
    // queue order is still deterministic when a covey is larger than the pool.
    if (this.qHead < this.qTail && (this.spatialEncounter || (!anyAloft && this.riseMs - this.lastLaunchMs >= LAUNCH_GAP_MS))) {
      this.launchWave(simBirds);
    }
    if (this.riseActive && !anyAloft && this.qHead >= this.qTail) {
      let quiet = true;
      for (let i = 0; i < POOL; i++) {
        if (['falling', 'flying', 'waiting'].includes(this.slots[i].status)) quiet = false;
      }
      if (quiet) {
        this.riseActive = false; // the sky settled
        this.hunt.finishRise();
      }
    }

    // 4. Debris clock.
    this.launchCover?.advance(dtMs);
    if (this.debrisMs >= 0) {
      this.debrisMs += dtMs;
      if (this.debrisMs > DEBRIS_LIFE_MS) this.debrisMs = -1;
    }
    if (this.featherMs >= 0) {
      this.featherMs += dtMs;
      for (let i = 0; i < this.featherPos.length; i += 3) {
        this.featherVel[i + 1] -= 3.2 * dt;
        this.featherPos[i] += this.featherVel[i] * dt;
        this.featherPos[i + 1] += this.featherVel[i + 1] * dt;
        this.featherPos[i + 2] += this.featherVel[i + 2] * dt;
      }
      const position = this.featherGeo?.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (position) position.needsUpdate = true;
      if (this.featherMat) this.featherMat.opacity = Math.max(0, 1 - this.featherMs / 900);
      if (this.featherMs >= 900) {
        this.featherMs = -1;
        if (this.featherPoints) this.featherPoints.visible = false;
      }
    }
  }

  /** A covey just blew: roll the rise's character (bias, break direction,
   *  escape bearing bent down the wind) from a fresh per-rise stream.
   *
   * Spatial properties pass the actual covey that flushed. Keeping this
   * parameter scoped to that group matters: the rise must leave the cover the
   * player just watched, rather than inheriting a centroid from every hidden
   * bird in the property. The non-spatial shooting view still passes its full
   * queued population because its fan is intentionally scene-local.
   */
  private stageRise(stageBirds: readonly { id: number; pos: { x: number; y: number } }[]): void {
    this.riseActive = true;
    this.riseSeq++;
    this.riseMs = 0;
    this.lastLaunchMs = -Infinity;
    this.riseRng = mulberry32((this.riseSeed + this.riseSeq * 0x9e3779b9) >>> 0);
    const info = this.hunt.lastFlushInfo();
    this.bias = this.spatialEncounter ? {min:.9,max:1.15,kind:'earned'} : flushBias(info ? info.distPx : 25, this.riseRng);
    this.driftPx = (this.riseRng() - 0.5) * DRIFT_SPAN_PX;

    // Covey centroid (queued birds) and hunter, in world meters — the
    // launch anchor; also kept in sim px for the 2D worldNudge law.
    let cx = 0;
    let cz = 0;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let q = this.spatialEncounter ? 0 : this.qHead; q < (this.spatialEncounter ? stageBirds.length : this.qTail); q++) {
      const id = this.spatialEncounter ? stageBirds[q].id : this.queue[q];
      for (let i = 0; i < stageBirds.length; i++) {
        if (stageBirds[i].id === id) {
          sx += stageBirds[i].pos.x;
          sy += stageBirds[i].pos.y;
          this.hunt.simToWorld(stageBirds[i].pos.x, stageBirds[i].pos.y, this.w2);
          cx += this.w2.x;
          cz += this.w2.z;
          n++;
          break;
        }
      }
    }
    if (n > 0) {
      cx /= n;
      cz /= n;
      sx /= n;
      sy /= n;
    }
    this.originX = cx;
    this.originZ = cz;
    this.originSimX = sx;
    this.originSimY = sy;
    const hs = this.hunt.huntState();
    this.hunt.simToWorld(hs.hunterPos.x, hs.hunterPos.y, this.w2);
    this.hunterX = this.w2.x;
    this.hunterZ = this.w2.z;
    // Escape bearing: away from the gun, bent DOWN THE WIND (sim wind
    // blows toward angle a: sim x -> world x, sim y -> world z). Species
    // specific terrain responses are applied per slot in launchWave; this
    // shared basis keeps a covey clustered without making the map override
    // a bycatch bird's own flight language.
    let ax = cx - this.hunterX;
    let az = cz - this.hunterZ;
    const al = Math.hypot(ax, az) || 1;
    ax /= al;
    az /= al;
    const wx = Math.cos(hs.wind);
    const wz = Math.sin(hs.wind);
    let ex = ax + wx * WIND_BIAS;
    let ez = az + wz * WIND_BIAS;
    const el = Math.hypot(ex, ez) || 1;
    this.escX = ex / el;
    this.escZ = ez / el;
    this.rightX = -this.escZ;
    this.rightZ = this.escX;
  }

  /**
   * Translate the shared shooting-view flight envelope into a world-space
   * escape profile. The old renderer only created this profile on Quail
   * Fields, which made a Hun, grouse, or woodcock rise fall back to the same
   * generic screen-velocity path. Keep the low-poly controller and its
   * deterministic stream, but derive speed, turn, height, and wingbeat
   * character from the species and the property's doctrine.
   *
   * Ringnecks and Chukar intentionally stay on the generic path: their
   * existing `levelAfterMs` and terrain-specific break treatments are more
   * specific than this cover-following controller. The launch context still
   * applies Chukar's downhill basis per bird.
   */
  private spatialFlightFor(
    species: SpeciesConfig,
    escapeX: number,
    escapeZ: number,
    doctrine: ReturnType<typeof huntingDoctrine>,
    rng: () => number,
    young: boolean,
  ): QuailFlight | undefined {
    if (!this.spatialEncounter || species.id === 'ringneck' || species.id === 'chukar') return undefined;

    const profile = createQuailFlight(escapeX, escapeZ, rng, false);
    const fl = species.flight;
    // FlightStyle speed is shared with the 2D shooting view. Preserve its
    // ordering while translating to plausible metres/second for the field.
    const speedMin = Math.max(FWD_MIN, fl.speedMin * 0.12 * doctrine.flight.carry);
    const speedMax = Math.max(speedMin + 0.8, fl.speedMax * 0.12 * doctrine.flight.carry);
    profile.speed = (speedMin + rng() * (speedMax - speedMin)) * (young ? YOUNG_FLIGHT_MULT : 1);

    // High-climbing birds keep more air under the body; timber birds break
    // more erratically, while each property still supplies the carry.
    const climb = THREE.MathUtils.clamp(fl.climb * doctrine.flight.climb, 0.2, 1.6);
    profile.clearance = 0.9 + climb * (species.timber ? 2.8 : 3.3) + rng() * 0.65;

    const bearingSpread = THREE.MathUtils.clamp(
      (0.12 + fl.wobble / 190) * (species.timber ? 1.1 : 1) * Math.max(0.65, doctrine.flight.lateral),
      0.1,
      0.7,
    );
    profile.bearing = Math.atan2(escapeZ, escapeX) + (rng() - 0.5) * bearingSpread;
    const bendRange = THREE.MathUtils.clamp(
      (0.06 + fl.wobble / 220) * doctrine.flight.wobble * (species.timber ? 1.2 : 1),
      0.04,
      0.52,
    );
    profile.bend = (rng() - 0.5) * bendRange;
    // No glide field means a bird keeps flapping until it leaves the readable
    // envelope. Covey species with a glide phase still settle into cover.
    profile.glideAt = fl.glideAfterMs === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0.75, fl.glideAfterMs / 1000);
    return profile;
  }

  /**
   * Give a bird's flight its species-owned terrain response while preserving
   * the covey's shared burst basis. Chukar are the first authored example:
   * they break down the fall line on a sloped property. Keeping this at the
   * per-slot seam matters on mixed properties, where a Hun or another
   * bycatch bird must not inherit Chukar Ridge's downhill escape.
   */
  private flightContextForSpecies(base: FlightContext, species: SpeciesConfig): FlightContext {
    if (species.flightDirection !== 'downhill') return base;
    const slope = this.hunt.areaConfig().slope;
    if (slope === undefined) return base;
    const downhillX = -Math.cos(slope);
    const downhillZ = -Math.sin(slope);
    const escapeX = base.escX * 0.52 + downhillX * 0.48;
    const escapeZ = base.escZ * 0.52 + downhillZ * 0.48;
    const length = Math.hypot(escapeX, escapeZ) || 1;
    const escX = escapeX / length;
    const escZ = escapeZ / length;
    return {
      ...base,
      escX,
      escZ,
      rightX: -escZ,
      rightZ: escX,
    };
  }

  /** Launch the available covey from its actual positions in a tight burst.
   * Each authored property uses the same spatial queue, while its doctrine
   * controls the impulse and the family controller below controls the shape. */
  private launchWave(simBirds: readonly {
    id: number;
    pos: { x: number; y: number };
    young?: boolean;
    single?: boolean;
    speciesId: string;
    sex?: 'hen' | 'rooster';
  }[]): void {
    this.lastLaunchMs = this.riseMs;
    const doctrine = huntingDoctrine(this.hunt.areaConfig().id);
    // Shuffled lanes per wave (Fisher-Yates on the rise stream).
    for (let i = 2; i > 0; i--) {
      const j = Math.floor(this.riseRng() * (i + 1));
      const t = this.laneBuf[i];
      this.laneBuf[i] = this.laneBuf[j];
      this.laneBuf[j] = t;
    }
    const waveN = this.frozen || this.spatialEncounter ? this.qTail - this.qHead : WAVE_MAX;
    let bx = 0;
    let bz = 0;
    let launched = 0;
    for (let k = 0; k < waveN && this.qHead < this.qTail; k++) {
      const id = this.queue[this.qHead];
      let sim: (typeof simBirds)[number] | null = null;
      for (let i = 0; i < simBirds.length; i++) {
        if (simBirds[i].id === id) {
          sim = simBirds[i];
          break;
        }
      }
      if (!sim) { this.qHead++; this.pendingFlights.delete(id); continue; }
      let slot: Slot | null = null;
      for (let i = 0; i < POOL; i++) {
        if (this.slots[i].status === 'idle' || this.slots[i].status === 'done') {
          slot = this.slots[i];
          break;
        }
      }
      if (!slot) break; // Keep the queued id until a presentation slot is free.
      slot.launchSound?.stop();
      slot.launchSound = undefined;
      this.qHead++;
      const flight = this.pendingFlights.get(id);
      this.pendingFlights.delete(id);
      const baseFlight = flight ?? {escX:this.escX,escZ:this.escZ,rightX:this.rightX,rightZ:this.rightZ,hunterX:this.hunterX,hunterZ:this.hunterZ,driftPx:this.driftPx,rng:this.riseRng};
      const rng = flight?.rng ?? this.riseRng;
      const species = getSpecies(sim.speciesId);
      // A covey shares its burst clock, but the bird still owns its terrain
      // response. In particular, Chukar use the fall line while Hun bycatch
      // on the same property keeps the common gun-away/wind bearing.
      const speciesFlight = this.flightContextForSpecies(baseFlight, species);
      slot.flight = speciesFlight;
      const lane = this.laneBuf[k % 3];
      // Spatial rises start at the real cover position. Their first impulse
      // still carries the species' hunting language: woodcock climb, chukar
      // stay flat, and pheasants carry hard across the next line.
      const v = this.spatialEncounter
        ? {
            x: (12 + species.flight.wobble * 0.16) * (this.riseRng() - 0.5) * doctrine.flight.lateral,
            y: -(42 + this.riseRng() * 28) * doctrine.flight.climb * (0.72 + species.flight.climb * 0.28),
          }
        : escapeVelocityFan(species.flight, lane, WAVE_MAX, this.riseRng);
      // ...hot and lazy rolls (wild rises come out hotter)...
      const roll = (!this.spatialEncounter && this.bias.kind === 'wild' ? 0.95 : 0.85) + rng() * 0.45;
      v.x *= roll;
      v.y *= roll;
      // ...the per-flush break direction...
      v.x += flight?.driftPx ?? this.driftPx;
      // ...and the young-bird wings.
      if (sim.young) {
        v.x *= YOUNG_FLIGHT_MULT;
        v.y *= YOUNG_FLIGHT_MULT;
      }
      slot.vel.x = v.x;
      slot.vel.y = v.y;
      slot.simId = id;
      slot.young = !!sim.young;
      this.applySpeciesAppearance(slot, species, sim.sex);
      slot.sxPx = SCREEN_CX + (lane - 1) * SLOT_SPREAD_PX;
      slot.exitDir = 0;
      // FlushScene's launch placement, translated onto the fan's right
      // axis at the covey centroid: lane spread + the bird's own field
      // position as a CLAMPED nudge (±55 px × 0.35 gain, sim px — the
      // "not covey GPS" law) + launch jitter, plus a hair of depth along
      // the escape axis so the burst isn't a picket line.
      const projPx =
        (sim.pos.x - this.originSimX) * speciesFlight.rightX + (sim.pos.y - this.originSimY) * speciesFlight.rightZ;
      const nudgePx = Math.max(-NUDGE_CLAMP_PX, Math.min(NUDGE_CLAMP_PX, projPx * NUDGE_GAIN));
      const offM =
        ((lane - 1) * SLOT_SPREAD_PX + nudgePx + (rng() * 2 - 1) * LAUNCH_JITTER_PX) *
        LAUNCH_PX_TO_M;
      // Capture covey stage deepens the cluster: 12 birds off 3 lanes
      // need the depth axis or the burst reads as a picket line.
      const alongM = (rng() * 2 - 1) * (this.frozen ? 1.7 : 0.7);
      slot.x = this.originX + speciesFlight.rightX * offM + speciesFlight.escX * alongM;
      slot.z = this.originZ + speciesFlight.rightZ * offM + speciesFlight.escZ * alongM;
      if (this.spatialEncounter) {
        this.hunt.simToWorld(sim.pos.x, sim.pos.y, this.w2);
        slot.x = this.w2.x; slot.z = this.w2.z;
      }
      slot.y = this.terrain.heightAt(slot.x, slot.z) + 0.2;
      slot.vxW = speciesFlight.escX * FWD_MIN;
      slot.vzW = speciesFlight.escZ * FWD_MIN;
      if (this.spatialEncounter && species.id === 'ringneck') {
        const distance = Math.hypot(slot.x - speciesFlight.hunterX, slot.z - speciesFlight.hunterZ);
        // Close birds break upward; distant birds carry away sooner. Keep
        // the actual launch location and random individual impulse intact.
        // Adjust the persistent controller input: flight ticks rebuild vyW
        // from vel.y, and levelStep eases this impulse into forward flight.
        slot.vel.y *= THREE.MathUtils.lerp(1.25, .85, THREE.MathUtils.smoothstep(distance, 5, 28));
      }
      slot.vyW = -slot.vel.y * FLUSH_PX_TO_M_V;
      slot.spatialFlight = this.spatialFlightFor(
        species,
        speciesFlight.escX,
        speciesFlight.escZ,
        doctrine,
        rng,
        !!sim.young,
      );
      if (slot.spatialFlight && species.coveyApproach === true && !sim.single && rng() <= RELIGHT_CHANCE) {
        slot.spatialFlight.target = selectQuailEscapeCover(
          slot.x,
          slot.z,
          speciesFlight.escX,
          speciesFlight.escZ,
          this.hunt.coverPatches(),
          rng,
        );
      }
      slot.airMs = 0;
      slot.previousAirMs = 0;
      slot.fallPose = undefined;
      slot.bank = 0;
      slot.bankYaw = undefined;
      slot.wobblePh = launched * 2.1;
      slot.wobbleMult = 0.6 + rng();
      slot.gliding = false;
      if (this.spatialEncounter) {
        slot.delayMs = species.id === 'sharptail' ? sharptailLaunchDelay(launched, waveN, rng) : quailLaunchDelay(launched, waveN, rng);
      } else if (this.frozen) {
        // Capture covey stage: clustered staggered launch across ~0.8 s
        // — the first birds are 10 m out while the last still blow from
        // the grass. (The sleeper roll stays a gameplay beat.)
        slot.delayMs = launched === 0 ? 0 : rng() * CAPTURE_STAGGER_MS;
      } else {
        // The sleeper: rises a beat after its wave.
        const sleeper = rng() < SLEEPER_CHANCE;
        slot.delayMs = sleeper ? SLEEPER_MIN_MS + rng() * SLEEPER_RAND_MS : 0;
      }
      const sleeper = slot.delayMs > 0;
      slot.status = sleeper ? 'waiting' : 'flying';
      slot.root.visible = !sleeper;
      if (!sleeper) this.disturbLaunchCover(slot);
      bx += slot.x;
      bz += slot.z;
      launched++;
    }
    if (this.qHead === this.qTail) { this.queue.length = 0; this.qHead = this.qTail = 0; }
    if (launched > 0 && !this.spatialEncounter) this.burstDebris(bx / launched, bz / launched);
  }

  private disturbLaunchCover(slot: Slot): void {
    if (!this.frozen && this.spatialEncounter && slot.species.id === 'ringneck') {
      const offset = new THREE.Vector3(slot.x, slot.y, slot.z);
      if (this.listener) offset.sub(this.listener.position).applyQuaternion(this.listener.quaternion.clone().invert());
      else offset.sub(new THREE.Vector3(this.hunterX, 0, this.hunterZ));
      slot.launchSound?.stop();
      slot.launchOriginX = slot.x; slot.launchOriginY = slot.y; slot.launchOriginZ = slot.z;
      slot.launchSound = playPheasantFlush(offset.length(), slot.sex === 'rooster', offset, {
        seed: (slot.simId * 0x9e3779b9 + this.riseSeq * 0x85ebca6b) >>> 0,
        flapRate: slot.species.flight.flapRate ?? 9, phaseOffset: slot.wobblePh * .35,
      });
    }
    this.coverEvents?.dispatchEvent(new CustomEvent('bird-cover-disturbance', {
      detail: { x: slot.x, z: slot.z },
    }));
    this.launchCover?.launch(slot.x, slot.z, slot.flight?.escX ?? 0, slot.flight?.escZ ?? 0,
      (slot.simId * 0x9e3779b9 + this.riseSeq * 0x85ebca6b) >>> 0);
  }

  private burstDebris(x: number, z: number): void {
    this.debrisOx = x;
    this.debrisOz = z;
    this.debrisOy = this.terrain.heightAt(x, z) + 0.25;
    this.debrisMs = 0;
    for (let i = 0; i < DEBRIS_N; i++) {
      const az = this.riseRng() * Math.PI * 2;
      const up = 0.35 + this.riseRng() * 0.6; // mostly upward — cover blows UP
      const horiz = Math.sqrt(Math.max(0, 1 - up * up));
      this.debrisVel[i * 4] = Math.cos(az) * horiz;
      this.debrisVel[i * 4 + 1] = up;
      this.debrisVel[i * 4 + 2] = Math.sin(az) * horiz;
      this.debrisVel[i * 4 + 3] = 1.6 + this.riseRng() * 3.2;
    }
  }

  /* ------------------------- read-only surface ----------------------- */

  /** Fold a bird out of the sky (the gun phase's hook — falling frame). */
  downBird(simId: number): boolean {
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (s.simId === simId && s.status === 'flying') {
        s.status = 'falling';
        s.launchSound?.stop();
        s.launchSound = undefined;
        if (this.spatialEncounter && s.species.id === 'ringneck') {
          s.fallPose = { startMs: s.airMs, rotation: s.root.rotation.clone() };
        }
        this.burstFeathers(s);
        return true;
      }
    }
    return false;
  }

  quarryTargets(): QuarryTarget[] {
    return this.slots.filter(s => s.status === 'flying').map(s => ({ id:s.simId,x:s.x,y:s.y,z:s.z,vx:s.vxW,vy:s.vyW,vz:s.vzW }));
  }

  holdQuarry(id: number, x: number, y: number, z: number): void {
    const slot = this.slots.find(s => s.simId === id && s.status !== 'idle' && s.status !== 'done');
    if (!slot) return;
    slot.status = 'grounded'; slot.x=x; slot.y=y; slot.z=z;
    slot.launchSound?.stop(); slot.launchSound=undefined;
  }

  /** Live positions for swept shot collision; callers must copy retained samples. */
  shotTargets(): readonly RayBirdTarget[] { return this.slots; }

  /** Select the first live target inside the camera-centered shot pattern. */
  shootRay(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    spreadRad = 0.04,
    targetVisible?: (target: RayBirdTarget) => boolean,
  ): number | null {
    return pickBirdAlongRay(this.slots, origin, direction, spreadRad, targetVisible);
  }

  riseSequence(): number {
    return this.riseSeq;
  }

  isRiseActive(): boolean {
    return this.riseActive;
  }

  /** A marking dog's visual attention: prioritize its falling birds, otherwise
   * watch the airborne group. Writes into caller storage without allocations. */
  markingTarget(ids: readonly number[], out: THREE.Vector3): boolean {
    out.set(0,0,0); let count=0; let falling=false;
    for (const slot of this.slots) {
      if (!ids.includes(slot.simId) || (slot.status!=='flying' && slot.status!=='falling')) continue;
      if (slot.status==='falling' && !falling) { out.set(0,0,0);count=0;falling=true; }
      if (falling && slot.status!=='falling') continue;
      out.x+=slot.x;out.y+=slot.y;out.z+=slot.z;count++;
    }
    if (count) out.multiplyScalar(1/count);
    return count>0;
  }

  /** Capture telemetry: airborne birds (world m). Allocates — tooling only.
   *  sizeM is the SCALED wingspan: the harness projects it to pixels. */
  airborne(): {
    simId: number; x: number; y: number; z: number; airMs: number; status: string; sizeM: number;
  }[] {
    const out: {
      simId: number; x: number; y: number; z: number; airMs: number; status: string; sizeM: number;
    }[] = [];
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (s.status === 'flying' || s.status === 'falling' || s.status === 'waiting') {
        out.push({
          simId: s.simId, x: s.x, y: s.y, z: s.z, airMs: s.airMs, status: s.status,
          sizeM: s.spanM * (this.refinedQuail ? QUAIL_WORLD_SCALE : RISE_SCALE) * s.visualScale,
        });
      }
    }
    return out;
  }

  /** Tooling/HUD telemetry: shot birds still lying in the cover. */
  groundedIds(): number[] {
    const ids: number[] = [];
    for (let i = 0; i < POOL; i++) {
      if (this.slots[i].status === 'grounded') ids.push(this.slots[i].simId);
    }
    return ids;
  }

  /** Read-only presentation positions, so a carried bird can be checked against its socket. */
  carriedTransforms(): { simId: number; x: number; y: number; z: number }[] {
    const birds = this.hunt.huntState().birds;
    return this.slots.filter(slot => slot.status === 'grounded' && birds.some(bird => bird.id === slot.simId && bird.state === 'carried'))
      .map(slot => ({ simId: slot.simId, x: slot.root.position.x, y: slot.root.position.y, z: slot.root.position.z }));
  }

  /**
   * GROUNDING CONTRACT (moment round, item 2): grass reads this via
   * ctx.get('birds') — the launch burst PARTS the cover at the rise
   * origin. World meters; r carries the whole envelope: it pops open
   * with the first wave, breathes a decaying shake, and settles closed.
   * Keyed to the rise clock — deterministic under capture stepping.
   */
  burstPoint(out: { x: number; z: number; r: number }): void {
    out.x = this.originX;
    out.z = this.originZ;
    let r = 1e-4;
    if (this.riseSeq > 0 && this.riseMs < 2600) {
      const t = this.riseMs;
      const grow = Math.min(1, t / 200);
      const settle = 1 - THREE.MathUtils.smoothstep(t, 1500, 2600);
      const shake = 1 + 0.16 * Math.sin(t * 0.05) * settle;
      r = Math.max(1e-4, 2.7 * grow * settle * shake);
    }
    out.r = r;
  }

  /** Read-only effect budget and actual launch count for field review. */
  launchCoverAudit(): { launches: number; visible: number; capacity: number } | null {
    return this.launchCover?.audit() ?? null;
  }

  /* ------------------------------ render ----------------------------- */

  private updatePheasantBank(slot: Slot, dt: number): void {
    if (!this.spatialEncounter || slot.species.id !== 'ringneck' || dt <= 0) return;
    const yaw = Math.atan2(slot.vxW, slot.vzW);
    const turn = slot.bankYaw === undefined ? 0
      : Math.atan2(Math.sin(yaw - slot.bankYaw), Math.cos(yaw - slot.bankYaw)) / dt;
    const target = THREE.MathUtils.clamp(-Math.atan2(Math.hypot(slot.vxW, slot.vzW) * turn, 9.81) * .65, -.35, .35);
    slot.bank = THREE.MathUtils.lerp(slot.bank ?? 0, target, 1 - Math.exp(-dt * 5));
    slot.bankYaw = yaw;
  }

  private poseFallingPheasant(slot: Slot): void {
    const fall = slot.fallPose!;
    const t = Math.max(0, slot.airMs - fall.startMs) / 1000;
    slot.root.rotation.copy(fall.rotation);
    slot.root.rotation.x += t * 4.2;
    slot.root.rotation.z += t * .65;
  }

  private foldWings(slot: Slot): void {
    if (slot.species.id === 'ringneck') {
      if (slot.wingLMesh.morphTargetInfluences) slot.wingLMesh.morphTargetInfluences[0] = 0;
      if (slot.wingRMesh.morphTargetInfluences) slot.wingRMesh.morphTargetInfluences[0] = 0;
      posePheasantFoldedWings(slot.wingL, slot.wingR);
    } else if (slot.species.id === 'sharptail') {
      if (slot.wingLMesh.morphTargetInfluences) slot.wingLMesh.morphTargetInfluences[0] = 0;
      if (slot.wingRMesh.morphTargetInfluences) slot.wingRMesh.morphTargetInfluences[0] = 0;
      poseSharptailFoldedWings(slot.wingL, slot.wingR);
    } else if (this.refinedQuail && slot.species.id === 'bobwhite') {
      poseBobwhiteFoldedWings(slot.wingL, slot.wingR);
    } else {
      slot.wingL.rotation.set(0, 0.9, -1.35, 'XYZ');
      slot.wingR.rotation.set(0, -0.9, 1.35, 'XYZ');
    }
  }

  update(ctx: Ctx, _dt: number): void {
    this.launchCover?.render();
    const simBirds = this.hunt.huntState().birds;
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (s.launchSound) {
        if (!s.launchSound.active) s.launchSound = undefined;
        else if (!this.frozen) {
          this.soundOffset.set(s.x, s.y, s.z).sub(ctx.camera.position);
          const distance = this.soundOffset.length();
          this.soundInverse.copy(ctx.camera.quaternion).invert();
          this.soundOffset.applyQuaternion(this.soundInverse);
          s.launchSound.updateSpatial(distance, this.soundOffset);
          // The broken stems stay behind as the wings pull away. Update
          // their bearing for head turns and walking without moving the source.
          if (s.launchOriginX !== undefined) {
            this.coverSoundOffset.set(s.launchOriginX, s.launchOriginY!, s.launchOriginZ!).sub(ctx.camera.position);
            const coverDistance = this.coverSoundOffset.length();
            this.coverSoundOffset.applyQuaternion(this.soundInverse);
            s.launchSound.updateCoverSpatial?.(coverDistance, this.coverSoundOffset);
          }
        }
      }
      const visible = s.status === 'flying' || s.status === 'falling' || s.status === 'grounded';
      s.root.visible = visible;
      if (!visible) continue;
      if (s.species.id === 'ringneck' && s.body.morphTargetInfluences) {
        s.body.morphTargetInfluences[0] = s.status === 'grounded' ? 1
          : s.status === 'falling' ? THREE.MathUtils.smoothstep(s.airMs - (s.fallPose?.startMs ?? s.airMs), 0, 300) : 0;
      }
      const simBird = s.status === 'grounded'
        ? simBirds.find((candidate) => candidate.id === s.simId)
        : undefined;
      if (simBird?.state === 'carried') {
        let carrierSlot = -1;
        for (let slot = 0; slot < this.hunt.dogCount(); slot++) {
          if (this.hunt.dog(slot).carryingBirdId === simBird.id) {
            carrierSlot = slot;
            break;
          }
        }
        if (carrierSlot >= 0) {
          const dog = this.hunt.dog(carrierSlot);
          if (this.frozen) this.hunt.dogWorld(this.carryW, carrierSlot);
          else this.hunt.dogRenderWorld(ctx.fixedAlpha, this.carryW, carrierSlot);
          const dogYaw = Math.atan2(Math.cos(dog.heading), Math.sin(dog.heading));
          s.root.position.set(
            this.carryW.x + Math.cos(dog.heading) * 0.32,
            this.terrain.heightAt(this.carryW.x, this.carryW.z) + 0.58,
            this.carryW.z + Math.sin(dog.heading) * 0.32,
          );
          const visual = ctx.get<Subsystem & { mouthWorld?: (out: THREE.Vector3) => boolean }>(carrierSlot === 0 ? 'dog' : 'dog2');
          visual.mouthWorld?.(s.root.position);
          s.root.scale.setScalar((s.species.id === 'ringneck' ? PHEASANT_REST_SCALE : this.refinedQuail ? QUAIL_WORLD_SCALE : GROUNDED_SCALE) * s.visualScale);
          // Carry the bird crosswise in the mouth, wings folded.
          s.root.rotation.set(0.12, dogYaw + Math.PI / 2, 0.42);
          this.foldWings(s);
          continue;
        }
      }
      s.root.position.set(s.x, s.y, s.z);
      let scale = this.refinedQuail ? QUAIL_WORLD_SCALE : s.status === 'grounded' ? GROUNDED_SCALE : RISE_SCALE;
      if (s.species.id === 'ringneck' && (s.status === 'grounded' || s.status === 'falling')) {
        const height = s.y - this.terrain.heightAt(s.x, s.z);
        scale = s.status === 'grounded' ? PHEASANT_REST_SCALE
          : THREE.MathUtils.lerp(PHEASANT_REST_SCALE, scale, THREE.MathUtils.smoothstep(height, .06, 2));
      }
      s.root.scale.setScalar(scale * s.visualScale);
      if (s.tailMesh?.visible) {
        const flying = s.status === 'flying';
        const settle = Math.exp(-s.airMs / 650);
        s.tailMesh.rotation.x = flying ? -.13 * settle + .025 * Math.sin(s.airMs * .009) : .08;
        s.tailMesh.rotation.y = flying ? .045 * Math.sin(s.airMs * .005 + s.wobblePh) : 0;
      }
      if (s.status === 'grounded') {
        // Folded bird remains marked in the grass until the dog picks it up.
        if (s.fallPose) {
          this.poseFallingPheasant(s);
          this.restRotation.setFromEuler(this.fallEuler.set(0, s.fallPose.rotation.y, 1.2, 'YXZ'));
          s.root.quaternion.slerp(this.restRotation, THREE.MathUtils.smoothstep(s.fallPose.groundedMs ?? 0, 0, 260));
        } else s.root.rotation.set(0, s.root.rotation.y, 1.2);
        this.foldWings(s);
        continue;
      }
      if (s.status === 'falling') {
        // Folded frame: wings pinned to the body, tumbling — dead weight.
        if (s.fallPose) this.poseFallingPheasant(s);
        else s.root.rotation.set(s.airMs * 0.001 * TUMBLE_RAD_PER_S, s.root.rotation.y, 0.5);
        this.foldWings(s);
        continue;
      }
      // Nose along the world velocity; pitch climbs with the burst and
      // flattens into the glide. The profile controls how much each species
      // climbs before it settles or leaves the readable envelope.
      const hSpeed = Math.hypot(s.vxW, s.vzW);
      const yaw = Math.atan2(s.vxW, s.vzW);
      const pitch = THREE.MathUtils.clamp(Math.atan2(s.vyW, Math.max(hSpeed, 0.3)), -0.5, 1.1);
      s.root.rotation.order = 'YXZ';
      s.root.rotation.set(-pitch * 0.85, yaw, this.spatialEncounter && s.species.id === 'ringneck' ? (s.bank ?? 0) : 0);
      if (s.species.id === 'sharptail') {
        // Render on the interpolated clock, not held 30Hz simulation poses.
        // Beat/glide phrasing changes only this species' mesh and morphs;
        // spatial velocities, clearance, glide state and hit center stay live.
        const wingMs = this.frozen ? s.airMs : THREE.MathUtils.lerp(s.previousAirMs ?? s.airMs, s.airMs, ctx.fixedAlpha ?? 1);
        const beat = sharptailWingbeat(wingMs / 1000, s.species.flight.flapRate ?? 13,
          s.wobblePh * .35, s.spatialFlight?.glideAt ?? .8);
        s.wingL.rotation.set(0, 0, -beat.angle);
        s.wingR.rotation.set(0, 0, beat.angle);
        s.wingLMesh.morphTargetInfluences![0] = beat.recovery;
        s.wingRMesh.morphTargetInfluences![0] = beat.recovery;
      } else if (s.gliding) {
        // Wings locked in the set-wing dihedral — the glide read.
        s.wingL.rotation.set(0, 0, -0.16);
        s.wingR.rotation.set(0, 0, 0.16);
        if (s.species.id === 'ringneck') {
          s.wingLMesh.morphTargetInfluences![0] = 0;
          s.wingRMesh.morphTargetInfluences![0] = 0;
        }
      } else if (this.spatialEncounter && s.species.id === 'ringneck') {
        // A fast pheasant beat otherwise has only three held poses at the
        // 30 Hz simulation rate. Interpolate its visual clock at render
        // frequency; capture still samples the exact requested sim pose.
        const wingMs = this.frozen ? s.airMs : THREE.MathUtils.lerp(s.previousAirMs ?? s.airMs, s.airMs, ctx.fixedAlpha ?? 1);
        const beat = pheasantWingbeat(wingMs / 1000, s.species.flight.flapRate ?? 14, s.species.flight.climb, s.wobblePh * .35);
        s.wingL.rotation.set(0, 0, -beat.angle);
        s.wingR.rotation.set(0, 0, beat.angle);
        s.wingLMesh.morphTargetInfluences![0] = beat.recovery;
        s.wingRMesh.morphTargetInfluences![0] = beat.recovery;
      } else {
        // World-space rises use continuous wingbeats. Legacy screen-space
        // waves retain the stepped pose so their silhouettes stay readable.
        const hz = s.species.flight.flapRate ?? 14;
        const seconds = s.airMs / 1000;
        const cycles = seconds * hz;
        const ph = Math.sin(cycles * Math.PI * 2 + s.wobblePh * 0.35);
        const beatAmplitude = 0.58 + s.species.flight.climb * 0.28 + (s.species.timber ? 0.06 : 0);
        const ang = s.spatialFlight ? .05 + ph * beatAmplitude : ph > 0.33 ? 0.88 : ph < -0.33 ? -0.78 : 0.1;
        s.wingL.rotation.set(0, 0, -ang);
        s.wingR.rotation.set(0, 0, ang);
      }
    }

    // Debris: kinematics re-derived from the burst clock — no per-frame
    // state, exact under both live frames and capture stepping.
    if (this.debrisMesh) {
      const active = this.debrisMs >= 0;
      this.debrisMesh.visible = active;
      if (active) {
        const t = this.debrisMs / 1000;
        const fade = 1 - this.debrisMs / DEBRIS_LIFE_MS;
        const attr = this.debrisGeo!.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < DEBRIS_N; i++) {
          const spd = this.debrisVel[i * 4 + 3];
          const px = this.debrisOx + this.debrisVel[i * 4] * spd * t;
          const py = this.debrisOy + this.debrisVel[i * 4 + 1] * spd * t - 4.9 * t * t;
          const pz = this.debrisOz + this.debrisVel[i * 4 + 2] * spd * t;
          if (this.refinedQuail) {
            // Real walk-in rises can happen close to the camera. Duff is a
            // few centimetres long, never a 32 cm opaque presentation card.
            const length = (0.012 + (i % 5) * 0.0045) * fade;
            const width = (0.003 + (i % 3) * 0.001) * fade;
            const azimuth = i * 2.399 + t * (2 + i % 3);
            const pitch = i * 0.71 + t * 4;
            const lx = Math.cos(azimuth) * Math.sin(pitch) * length;
            const ly = Math.cos(pitch) * length;
            const lz = Math.sin(azimuth) * Math.sin(pitch) * length;
            const wx = Math.sin(azimuth) * width, wz = -Math.cos(azimuth) * width;
            const o = i * 12;
            arr[o] = px - lx; arr[o + 1] = py - ly; arr[o + 2] = pz - lz;
            arr[o + 3] = px + wx; arr[o + 4] = py; arr[o + 5] = pz + wz;
            arr[o + 6] = px + lx; arr[o + 7] = py + ly; arr[o + 8] = pz + lz;
            arr[o + 9] = px - wx; arr[o + 10] = py; arr[o + 11] = pz - wz;
            continue;
          }
          // Big enough to read at the 15-20 m the rise frames from.
          const sz = 0.16 * fade;
          const o = i * 12;
          arr[o] = px - sz;
          arr[o + 1] = py - sz;
          arr[o + 2] = pz;
          arr[o + 3] = px + sz;
          arr[o + 4] = py - sz;
          arr[o + 5] = pz;
          arr[o + 6] = px + sz;
          arr[o + 7] = py + sz;
          arr[o + 8] = pz + sz * 0.6;
          arr[o + 9] = px - sz;
          arr[o + 10] = py + sz;
          arr[o + 11] = pz + sz * 0.6;
        }
        attr.needsUpdate = true;
        if (this.refinedQuail) this.debrisGeo!.computeVertexNormals();
      }
    }
  }

  dispose(ctx: Ctx): void {
    this.coverEvents = undefined;
    this.launchCover?.dispose();
    this.launchCover = undefined;
    for (const s of this.slots) { s.launchSound?.stop(); ctx.scene.remove(s.root); }
    this.slots.length = 0;
    if (this.debrisMesh) ctx.scene.remove(this.debrisMesh);
    if (this.featherPoints) ctx.scene.remove(this.featherPoints);
    this.debrisGeo?.dispose();
    this.debrisMat?.dispose();
    this.featherGeo?.dispose();
    this.featherMat?.dispose();
    this.debrisGeo = undefined;
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    this.mat?.dispose();
    this.mat = undefined;
  }
}
