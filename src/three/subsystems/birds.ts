import type { SlopeApproach } from '../../game/fieldcraft';
import { isFalconryPractice, FALCONRY_PRACTICE } from '../../game/falconryPractice';
import { huntStreamSeed, parseHuntSeed } from '../../game/huntSeed';
import { birdFlightExpired } from '../../game/birdFlightLifetime';
import { fallLine, lineFamilyFor, PASS_CLEAR_M, planFlightLine, skyBehind, stepFlightLine, type FlightLine } from '../../game/flightLine';
import { buildPheasantBody, buildPheasantLegs, buildPheasantWing, buildPheasantTail, pheasantLegTuck, pheasantTailFan, posePheasantFoldedWings, pheasantWingbeat } from '../assets/pheasant';
import { buildBirdLegs } from '../assets/birdLegs';
import { quailLaunchDelay } from '../quailPresentation';
import { flyingBirdScale, type BirdSizeMode } from '../birdScale';
import { identityBoost, SIGHT_FLOOR_PX, shownWingHz } from '../birdIdentity';
import { chooseHitReaction, createHitReaction, featherCount, stepHitReaction, tumbleRate, type HitReaction, type HitReactionKind, type HitShot } from '../hitReactions';
import { FeatherDrift, featherTones } from '../featherDrift';
import { QuailFlushDebris } from '../quailFlushDebris';
import { CoverEruption, type ImpactSurface } from '../coverEruption';
import { BOUNCE_MAX_MPS, BOUNCE_MIN_MPS, BOUNCE_SHARE, COLLAPSE_MS, fallBall, fallWeight, featherPuffSize, impactSurface, strideLength } from '../fallPresentation';
import { fallSoundDelay } from '../fallAudio';
import { pheasantPondRadii } from '../../game/pheasantHabitat';
import type { GroundSample } from '../../game/landscape';
import * as THREE from 'three';
import { buildBobwhiteBody, buildBobwhiteWing, poseBobwhiteFoldedWings } from '../assets/bobwhite';
import { buildSharptailBody, buildSharptailWing, poseSharptailFoldedWings } from '../assets/sharptail';
import { buildChukarBody, buildChukarWing, poseChukarFoldedWings } from '../assets/chukar';
import { buildHunBody, buildHunWing, poseHunFoldedWings } from '../assets/hun';
import { buildPrairieChickenBody, buildPrairieChickenWing, posePrairieChickenFoldedWings } from '../assets/prairieChicken';
import { sharptailLaunchDelay, sharptailWingbeat } from '../sharptailPresentation';
import { addCarriedBirdPoses, poseCarriedBird, restingBirdScale } from '../carriedBirdPresentation';
import { dogRendererId } from '../dogs/rendererId';
import { playFall, playPheasantFlush, playBirdFlush, playCoveyThunder, type PheasantFlushSound } from '../../audio';
import { mulberry32 } from '../../game/math';
import { getSpecies, SPECIES, TRAINING_SPECIES, type SpeciesConfig } from '../../game/species';
import { CLOSE_FLUSH_THRESHOLD, closeFlushIntensity } from '../../game/closeFlush';
import { BELOW_CONTOUR, countsAgainstCap, holdsSky, inTheShot, laneLift, RISE_RANGE_M, lanesClearOfTheGun, lanesOffTheHill, planRise, riseScoreFor, waveLanes, waveMayRise, type RiseGun, type RiseWave, type WaveLane } from '../../game/riseScore';
import { evadeGoshawk, type QuarryTarget } from '../../game/falconry';
import { huntingDoctrine } from '../../game/huntDoctrine';
import { HUNT_SHOT_RANGE } from '../../game/huntSimulation';
import { ObstacleIndex } from '../../game/obstacleIndex';
import { edgeOfCover, glideMark, landingHolds, MARK_RANGE_M, MARK_SAIL_MS, MARK_SIGHT_MS, MarkBook, type HunterMark } from '../../game/marks';
import { quailPlumAt } from '../../game/quailComposition';
import { SIGHT_COVER_M, SightingClock, sightingHolds, sightingKind, type SightingCandidate, type SightingKind } from '../../game/sightings';
import { habitatClassAt } from '../../game/landHabitat';
import { GroundSign, type SignCovey } from '../groundSign';
import { quailCoverAt } from '../../game/quailLandscape';
import type { Ctx, Subsystem } from '../engine';
import { P, fieldTimeOfDay, type TimeOfDay } from '../palette';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';

/** Authored properties launch birds from their actual cover positions, under
 * Duck Hunt rules: the cover erupts and the wing thunder is sized to the
 * whole covey, but at most three birds are in the air at once, in waves
 * (game/riseScore.ts). Each covey owns its escape basis and random stream;
 * a queued bird keeps its covey's flight context until it rises. Capture and
 * live play use the same launch law. Flight advances on the fixed tick;
 * render updates write mesh transforms.
 */

/** Local streams — never ctx.rng (per-subsystem determinism law). */
const BIRD_ART_SEED = 0xb0bde7;
const RISE_SEED = 0x2e15e;

/** How much wider a covey's escape fan opens when it is sat on underfoot
 * (at full close-flush intensity): the birds break across the hunter's front
 * as well as away, instead of lining out down one bearing. */
export const CLOSE_FAN_WIDEN = 1.2;
/**
 * Property-rise presentation scale on the 0.24 m body: the readable size a
 * flying bird eases to by shotgun range (birdScale.ts), on every ground,
 * Quail Fields included since October 2026. The old 2D view
 * paid with chunky sprites (its bobwhite spanned ~9% of the screen):
 * the silhouette must read GAMEBIRD at the 15-25 m a rise honestly
 * frames from, and a to-scale bobwhite is a 6-12 px speck there.
 * Moment round: 3.0, measured — the-rise's camera (fov ~55) puts a
 * bird's 0.82 m scaled wingspan at 18-28 px across the 15-25 m band,
 * the mandated mass. Still a fraction of the 2D license.
 */
const RISE_SCALE = 3.3;
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

/** Hip height and fore-aft place of the legs, model metres, by family. */
const LEG_HIPS: Readonly<Record<string, readonly [number, number]>> = {
  ringneck: [-.021, -.012], pheasant: [-.021, -.012], quail: [-.018, -.008], partridge: [-.02, -.01],
  chukar: [-.02, -.01], grouse: [-.022, -.012], woodcock: [-.016, -.006],
};
/** Every species but the ringneck keeps its legs tucked out of sight from
 * here on in flight (the jump's hang has tucked by then). */
const LEGS_TUCKED_MS = 700;

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
  if (speciesId === 'training-pigeon') return { ...base, bodyLength: 1.2, bodyWidth: 1.06, bodyDepth: .95, wingSpan: 1.65, wingChord: 1.05, tailLength: 1.65, tailWidth: 1.2, billLength: .85 };
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

/** How hard the escape bearing bends downwind (0 = pure away). */
const WIND_BIAS = 0.55;

/** A glide that touches grass after this long has put down — gone. */
const LAND_MIN_AIR_MS = 1200;

/** A bird turned off the gun's line of sight crosses the view at least this
 * much (28 degrees: a straightaway is anything under 25), and how often a
 * lone bird or a pair's bird may go straight away anyway. */
const STRAIGHTAWAY_LIMIT = 28 * Math.PI / 180;
const STRAIGHTAWAY_SHARE = .3;
/** Out of the shot (past 40 m) a bird lines out at this share of its line's pace. */
const LEAVING_SPEED_MULT = 1.2;
/** A popcorn single reads where the birds in the shot are heading this far
 * down their lines (about a second of flight) to break away from them. */
const SIDE_LOOK_M = 15;

/** After its escape is credited a bird flies on, out of the shot, until it
 * sets down in cover or leaves the screen: the frustum, the horizon, or a
 * span under DEPART_MIN_PX. These bound it if no camera is watching. */
const DEPART_MAX_RANGE_M = 320;
const DEPART_MAX_MS = 25000;
const DEPART_MIN_PX = 2;

/** Pool = the airborne budget: three live birds, leaving birds still on
 * their way off-screen or into cover, and shot birds lying for the dog. */
const POOL = 14;

/** Feathers in the hit's puff. */
const FEATHER_PUFF = 20;

/** Birds before the flush (game/sightings.ts): at most this many on the ground at once... */
const SIGHT_POOL = 4;
/** ...of these species, looked for within this range (m) every half second. */
const SIGHT_SPECIES: ReadonlySet<string> = new Set(['ringneck', 'chukar', 'sharptail']);
const SIGHT_LOOK_M = 190;
/** Open ground for chukar to be seen running on: the cheat and bunchgrass slopes, bare ground, talus. */
const CHUKAR_OPEN: ReadonlySet<string> = new Set(['cheat', 'bunchgrass', 'bare', 'talus']);

/** A miss sets down at least this far inside the property line (property px)... */
const LANDING_MARGIN_PX = 10;
/** ...this far clear of any rock, tree, building or pond edge (metres)... */
const LANDING_CLEARANCE_M = 1.5;
/** ...and on ground no steeper than this (rise over run, about 35 degrees). */
const LANDING_GRADE = .7;
/** Subsystems whose collision circles a landing keeps clear of. */
const LANDING_OBSTACLE_SOURCES = ['landmarks', 'flora', 'chukar-environment', 'property-habitat', 'sharptail-ranch', 'quail-environment', 'woodcock-wet-bottoms'] as const;

/** A folded bird's tumble, 540 deg/s. */
const TUMBLE_RAD_PER_S = (540 * Math.PI) / 180;

type SlotStatus = 'idle' | 'waiting' | 'flying' | 'departing' | 'falling' | 'grounded' | 'done';

export interface RayBirdTarget {
  simId: number;
  x: number;
  y: number;
  z: number;
  status: string;
  /** Hit, and still coming down under its own power: a second shot anchors it. */
  anchorable?: boolean;
}

/** A towering, sailing or wing-tipped bird is still in the air on its own
 * wings until it folds or lands; until then a second barrel can anchor it. */
function anchorable(slot: { status: string; reaction?: HitReaction }): boolean {
  return slot.status === 'falling' && !!slot.reaction && slot.reaction.kind !== 'fold' && !slot.reaction.collapsed;
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

/** The simulation's view of a bird about to rise. */
interface SimLaunchBird {
  id: number;
  coveyId?: number;
  pos: { x: number; y: number };
  state?: string;
  young?: boolean;
  single?: boolean;
  circled?: boolean;
  speciesId: string;
  sex?: 'hen' | 'rooster';
}

/** What the sky reads from the gun (subsystems/gun.ts): waves never rise
 * into an empty gun, except the sleeper. */
interface GunReadout { shellsRemaining(): number; shellCapacity(): number; isReloading(): boolean }

interface FlightContext {
  escX: number; escZ: number; rightX: number; rightZ: number;
  hunterX: number; hunterZ: number; rng: () => number;
  /** Actual rise classification, frozen before a queued bird launches. */
  slopeApproach?: SlopeApproach | null;
  /** The fall line under the covey (world bearing), for birds that pour downhill. */
  downhill?: number;
}

interface Slot {
  /** The bird's whole line, planned at launch (game/flightLine.ts). */
  line?: FlightLine;
  launchSound?: PheasantFlushSound;
  /** Sky clock when its wave rose: a wave holds the sky only so long. */
  launchedSkyMs?: number;
  /** Close-flush intensity at launch, 0..1 (game/closeFlush.ts). */
  closeness?: number;
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
  x: number;
  y: number;
  z: number;
  /** Previous authoritative tick; render and shot sampling share this span. */
  previousX?: number;
  previousY?: number;
  previousZ?: number;
  /** World velocity of the last tick (orientation reads these). */
  vxW: number;
  vyW: number;
  vzW: number;
  airMs: number;
  previousAirMs?: number;
  /** Presentation-only time since the authoritative escape was credited. */
  departureMs?: number;
  bank?: number;
  bankYaw?: number;
  fallPose?: { startMs: number; rotation: THREE.Euler; groundedMs?: number };
  /** How the bird came down when it was hit (hitReactions.ts). */
  reaction?: HitReaction;
  /** Set for shot sampling: hit, and still coming down under its own power. */
  anchorable?: boolean;
  /** A wounded bird on the ground, running from the dog. */
  running?: boolean;
  runYaw?: number;
  /** A runner's stride phase, radians, advanced by the ground it covers. */
  stride?: number;
  /** A dead bird's first strike: it has bounced (or splashed) once. */
  struck?: boolean;
  /** Where and when (field clock, ms) the hunter last had this bird in sight,
   * and where its glide was taking it (marks.ts glideMark). */
  sighted?: { ms: number; x: number; z: number; goingX: number; goingZ: number };
  /** A Hun covey flying its loop back round to set down together. */
  circling?: boolean;
  /** When and where (field clock, ms) the hunter last saw it sailing on set wings for its spot. */
  sailed?: { ms: number; x: number; z: number };
  /** It rose as a relit single: its next escape is for good, never a mark. */
  launchedSingle?: boolean;
  /** Held by the goshawk where it took it (falconry): not lying on the ground. */
  hawkHeld?: boolean;
  /** The wings as they were when the bird was hit: the collapse eases from them. */
  collapseFrom?: { left: THREE.Quaternion; right: THREE.Quaternion; ms: number };
  carryPose?: { elapsed: number; rotation: THREE.Quaternion };
  /** Taken from the dog: the bird follows the hunter's grip until stowed. */
  inHand?: { position: THREE.Vector3; quaternion: THREE.Quaternion; blend: number };
  /** The hunter's hand is on its way to take it: keep it through the give. */
  handClaim?: boolean;
  delayMs: number;
  wobblePh: number;
  gliding: boolean;
  root: THREE.Group;
  body: THREE.Mesh;
  wingLMesh: THREE.Mesh;
  wingRMesh: THREE.Mesh;
  wingL: THREE.Group;
  wingR: THREE.Group;
  tailMesh?: THREE.Mesh;
  /** Pheasant legs: hanging on the jump, tucked aft in flight. */
  legMesh?: THREE.Mesh;
  /** A runner's far leg, so its legs can stride in turn. */
  legMeshR?: THREE.Mesh;
  visualScale: number;
  spanM: number;
}

interface BirdGeometrySet {
  tail?: THREE.BufferGeometry;
  legs?: THREE.BufferGeometry;
  /** Each leg on its own, for a runner's stride. */
  legL?: THREE.BufferGeometry;
  legR?: THREE.BufferGeometry;
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

export interface BirdsOptions {
  /** How flying birds are sized (see birdScale.ts); `readable` when left
   * out. The field passes the link's mode, `life` by default. Quail Fields
   * keeps its own world scale in every mode. */
  size?: BirdSizeMode;
}

export class BirdsSystem implements Subsystem {
  readonly id = 'birds';
  private readonly size: BirdSizeMode;
  constructor(options: BirdsOptions = {}) { this.size = options.size ?? 'readable'; }

  private hunt!: Hunt3DSystem;
  private terrain!: TerrainSystem;
  private soundOffset = new THREE.Vector3();
  private coverSoundOffset = new THREE.Vector3();
  private soundInverse = new THREE.Quaternion();
  private listener?: THREE.Camera;
  private lifetime = new AbortController();
  private frozen = false;

  private fallEuler = new THREE.Euler();
  private restRotation = new THREE.Quaternion();
  private mat?: THREE.MeshLambertMaterial;
  private geos: THREE.BufferGeometry[] = [];
  private speciesGeos = new Map<string, BirdGeometrySet>();
  private slots: Slot[] = [];
  private shotSamples: RayBirdTarget[] = [];
  private renderedPhase = 1;

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
  /** Each queued bird's covey flight context, kept until it rises. */
  private pendingFlights = new Map<number, FlightContext>();
  private riseActive = false;
  private riseSeq = 0;
  private riseSeed = RISE_SEED;
  private riseRng: () => number = mulberry32(RISE_SEED);
  /** Escape bearing (unit, world xz) and its right axis — the fan plane. */
  private escX = 0;
  private escZ = 1;
  private rightX = 1;
  private rightZ = 0;
  /** Hunter world position at the flush — range is measured from here. */
  private hunterX = 0;
  private hunterZ = 0;
  /** Covey centroid at the flush, world metres. */
  private originX = 0;
  private originZ = 0;
  /** ms since the flush was staged (rise-local clock). */
  private riseMs = 0;
  /** Spatial rises still holding birds in the cover, in flush order: each
   * covey's planned waves (game/riseScore.ts) and how many have risen. */
  private rises: { speciesId: string; waves: RiseWave[]; next: number; circleBack?: boolean; curl?: number }[] = [];
  /** Rock, trees, buildings and ponds the hunter and dog respect: no miss sets down in them. */
  private landingObstacleIndex?: ObstacleIndex;
  private obstacleCtx?: Ctx;
  private readonly simPoint = { x: 0, y: 0 };
  /** Where the hunter watched misses go down (game/marks.ts). */
  private readonly markBook = new MarkBook();
  /** Birds before the flush: a small pool of their own, never the rise's. */
  private readonly sightSlots: Slot[] = [];
  private readonly sightClock = new SightingClock();
  private readonly sightShown = new Map<number, Slot>();
  private readonly sightPrev = new Map<number, { x: number; z: number; ground: number }>();
  private readonly sightProbe2 = { x: 0, z: 0 };
  private tod: TimeOfDay = 'morning';
  /** Sign on the ground near some coveys (groundSign.ts), laid on the first tick. */
  private sign?: GroundSign;
  private signLaid = false;
  private sceneRef?: THREE.Scene;
  /** Capture only: each hit's feather puff, a feather's size on screen. */
  private readonly hitLog: { simId: number; fieldMs: number; rangeM: number; featherPx: number }[] = [];
  /** Capture only: each shot bird's strike and when its thump would be heard. */
  private readonly strikeLog: { simId: number; fieldMs: number; surface: ImpactSurface; rangeM: number; thumpDelayMs: number; x: number; z: number }[] = [];
  /** Field clock, ms: every tick, rise or not. */
  private fieldMs = 0;
  private readonly sightProbe = new THREE.Vector3();
  /** Crown of the standing cover over the ground at a world point (m): what
   * hides a bird going in. Read lazily (the cover registers after the birds). */
  private coverCrown?: (x: number, z: number) => number;
  private coverCtx?: Ctx;
  /** Sky clock shared by every covey: the wave rule is global. */
  private skyMs = 0;
  private lastWaveMs = -Infinity;
  private skyClearSinceMs: number | null = null;
  private gunEmptied = false;
  private gunReadout?: () => GunReadout | undefined;

  /* ----------------------- launch-burst cover ---------------------- */
  private refinedQuail = false;
  private launchCover?: QuailFlushDebris;
  /** The covey's cover blowing out across its footprint at the flush. */
  private eruption?: CoverEruption;
  /** How far the cover shakes round the covey (burstPoint), metres. */
  private burstRadius = 2.7;
  private coverEvents?: EventTarget;
  private lastFlinchMs = -Infinity;
  /** The screen a leaving bird must drive off (its height in px). */
  private viewHeight = () => 810;
  private ponds?: { x: number; z: number; rx: number; rz: number }[];
  private readonly groundSample: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
  private readonly collapseTo = new THREE.Quaternion();
  private departProbe = new THREE.Vector3();
  private departAxis = new THREE.Vector3();
  private departMatrix = new THREE.Matrix4();
  private departFrustum = new THREE.Frustum();

  /* ------------------------- hit feather burst ------------------------ */
  private featherGeo?: THREE.BufferGeometry;
  private featherMat?: THREE.PointsMaterial;
  private featherPoints?: THREE.Points;
  private featherPos = new Float32Array(FEATHER_PUFF * 3);
  private featherVel = new Float32Array(FEATHER_PUFF * 3);
  private featherCol = new Float32Array(FEATHER_PUFF * 3);
  private featherMs = -1;
  /** Body feathers that drift down after a hit and lie where they land. */
  private loose?: FeatherDrift;
  private readonly windDrift = { x: 0, z: 0 };

  // Preallocated scratch.
  private w2 = { x: 0, z: 0 };
  private carryW = { x: 0, z: 0 };
  private crippleWorld = { x: 0, z: 0 };

  init(ctx: Ctx): void {
    // Vary practice flights with the visit while preserving exact URL replays
    // and the established flight streams of other hunt modes.
    this.riseSeed = isFalconryPractice(location.search)
      ? huntStreamSeed(parseHuntSeed(location.search) ?? FALCONRY_PRACTICE.seed, RISE_SEED) : RISE_SEED;
    this.listener = ctx.camera;
    this.coverEvents = ctx.events;
    this.obstacleCtx = ctx;
    this.coverCtx = ctx;
    this.sceneRef = ctx.scene;
    const signal = this.lifetime.signal;
    ctx.events.addEventListener('pause', ((event: CustomEvent<boolean>) => {
      if (event.detail) this.stopLaunchSounds();
    }) as EventListener, { signal });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopLaunchSounds();
    }, { signal });
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.stopLaunchSounds(), { signal });
    this.frozen = new URLSearchParams(location.search).has('capture');
    // The gun registers after the birds; read it when a wave asks.
    this.gunReadout = () => { try { return ctx.get<Subsystem & GunReadout>('gun'); } catch { return undefined; } };
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.terrain = ctx.get<TerrainSystem>('terrain');
    this.refinedQuail = this.hunt.areaConfig().id === 'quail-fields';
    this.viewHeight = () => ctx.renderer?.domElement?.clientHeight || 810;

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
      this.tod = tod;
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
    ctx.events.addEventListener('tod', ((e: CustomEvent) => applyTod(e.detail)) as EventListener, { signal });

    this.buildPool(ctx);
    const pheasant = this.hunt.areaConfig().id === 'pheasant-coverts';
    const cover = pheasant ? ctx.get<Subsystem & { launchHeightAt?(x: number, z: number): number }>('grass') : undefined;
    this.launchCover = new QuailFlushDebris(ctx.quality, (x, z) => this.drawnGround(x, z),
      pheasant ? 'tall-cover' : 'ground', cover?.launchHeightAt ? (x, z) => cover.launchHeightAt!(x, z) : undefined);
    ctx.scene.add(this.launchCover.mesh);
    this.eruption = new CoverEruption(ctx.quality, (x, z) => this.drawnGround(x, z), this.hunt.areaConfig().id,
      cover?.launchHeightAt ? (x, z) => cover.launchHeightAt!(x, z) : undefined);
    ctx.scene.add(this.eruption.puffMesh, this.eruption.chaffMesh);
    this.buildFeathers(ctx);
    this.loose = new FeatherDrift(); ctx.scene.add(this.loose.points);

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
        /** Rise review's handler: blow the whistle (cast, dead bird, whoa,
         * release) toward where the camera looks, as the player would. */
        command: (kind: 'cast' | 'dead' | 'whoa' | 'release') => {
          ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'), { detail: kind }));
        },
        /** Where escaping birds set down, world metres, for the review's marks. */
        landings: () => this.slots.filter(slot => (slot.status === 'flying' || slot.status === 'departing') && slot.line?.target)
          .map(slot => ({ simId: slot.simId, x: slot.line!.target!.x, z: slot.line!.target!.z })),
        /** Hits: the feather puff, each feather's size on screen. */
        hits: () => this.hitLog.map(hit => ({ ...hit })),
        /** Shot birds striking the ground, and when the thump would arrive. */
        strikes: () => this.strikeLog.map(strike => ({ ...strike })),
        /** The field clock (ms), the strike log's clock. */
        fieldMs: () => this.fieldMs,
        /** Sign on the ground (where, what), and birds before the flush now shown. */
        sign: () => this.sign?.spots.map(spot => ({ ...spot })) ?? [],
        sightings: () => this.sightings(),
        /** The hunter's marks: where he watched misses go down. */
        marks: () => this.markBook.marks.map(mark => ({ ...mark, birdIds: [...mark.birdIds], freshness: this.markBook.freshness(mark, this.fieldMs) })),
        /** Rise review's shooting hunter: the capture never fires the real
         * gun, so the tool reports a double's shells and reload here and the
         * wave rule reads them as it reads the gun (null restores the gun). */
        gun: (state: { shells: number; capacity: number; reloading: boolean } | null) => {
          const gun = ctx.get<Subsystem & GunReadout>('gun');
          this.gunReadout = state
            ? () => ({ shellsRemaining: () => state.shells, shellCapacity: () => state.capacity, isReloading: () => state.reloading })
            : () => gun;
        },
        /** The pointed bird's species and covey (null = no point). */
        pointedBird: () => {
          const dog = this.hunt.dog();
          if (dog.state !== 'pointing' || dog.pointedBirdId === null) return null;
          const bird = this.hunt.huntState().birds.find(b => b.id === dog.pointedBirdId);
          return bird ? { id: bird.id, speciesId: bird.speciesId, coveyId: bird.coveyId, sex: bird.sex } : null;
        },
        /** Rise review (tools3d/review-rise.mjs): every bird the sky holds,
         * including a launch still waiting on its delay and an escaped
         * silhouette finishing its departure, plus the birds still queued. */
        sky: () => ({
          queued: this.rises.reduce((n, rise) =>
            n + rise.waves.slice(rise.next).reduce((m, wave) => m + wave.ids.length, 0), 0),
          riseActive: this.riseActive,
          birds: this.slots.filter(s => s.status === 'flying' || s.status === 'falling' || s.status === 'waiting' || s.status === 'departing')
            .map(s => ({ simId: s.simId, status: s.status, x: s.x, y: s.y, z: s.z, airMs: s.airMs,
              sizeM: s.spanM * this.flightScale(s.species.id, s) * s.visualScale,
              vx: s.vxW, vy: s.vyW, vz: s.vzW, speciesId: s.species.id, sex: s.sex,
              target: s.line?.target ? { ...s.line.target } : null })),
        }),
      };
    }
  }

  /* ------------------------------ build ------------------------------ */

  private buildPool(ctx: Ctx): void {
    const rng = mulberry32(BIRD_ART_SEED);
    for (const species of [...SPECIES, ...TRAINING_SPECIES]) this.buildSpeciesGeometry(species, false);
    this.buildSpeciesGeometry(getSpecies('ringneck'), true);
    const fallback = this.speciesGeos.get('bobwhite')!;

    const makeSlot = (): Slot => {
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
      return {
        status: 'idle',
        simId: -1,
        species: getSpecies('bobwhite'),
        young: false,
        x: 0,
        y: 0,
        z: 0,
        vxW: 0,
        vyW: 0,
        vzW: 0,
        airMs: 0,
        delayMs: 0,
        wobblePh: rng() * 6.28,
        gliding: false,
        root,
        body,
        wingLMesh: wl,
        wingRMesh: wr,
        wingL,
        wingR,
        visualScale: 1,
        spanM: SPAN_M,
      };
    };
    for (let i = 0; i < POOL; i++) this.slots.push(makeSlot());
    for (let i = 0; i < SIGHT_POOL; i++) this.sightSlots.push(makeSlot());
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
      : species.id === 'sharptail' ? buildSharptailBody() : species.id === 'chukar' ? buildChukarBody()
        : species.id === 'hun' ? buildHunBody() : species.id === 'prairie-chicken' ? buildPrairieChickenBody()
          : this.buildBodyGeo(back, backDim, belly, cap, throat, tail, shape);
    const wing = (side: -1 | 1) => species.id === 'ringneck' ? buildPheasantWing(side, hen) : species.id === 'bobwhite' ? buildBobwhiteWing(side)
      : species.id === 'sharptail' ? buildSharptailWing(side) : species.id === 'chukar' ? buildChukarWing(side)
        : species.id === 'hun' ? buildHunWing(side) : species.id === 'prairie-chicken' ? buildPrairieChickenWing(side)
          : this.buildWingGeo(side, wingTop, wingTopDim, wingUnder, shape);
    const wingL = wing(-1), wingR = wing(1);
    const tailGeo = species.id === 'ringneck' ? buildPheasantTail(hen) : undefined;
    const legsGeo = species.id === 'ringneck' ? buildPheasantLegs(hen) : buildBirdLegs(species.id);
    const legSide = (side: -1 | 1) => species.id === 'ringneck' ? buildPheasantLegs(hen, [side]) : buildBirdLegs(species.id, [side]);
    const legL = legSide(-1), legR = legSide(1);
    addCarriedBirdPoses(body, wingL, wingR, species.id);
    if (tailGeo) this.geos.push(tailGeo);
    if (legsGeo) this.geos.push(legsGeo, legL, legR);
    this.geos.push(body, wingL, wingR);
    wingR.computeBoundingBox();
    const spanM = 2 * (0.03 * shape.bodyWidth + wingR.boundingBox!.max.x);
    this.speciesGeos.set(`${species.id}${hen ? ':hen' : ''}`, { body, wingL, wingR, tail: tailGeo, legs: legsGeo, legL, legR, shape, spanM });
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
      slot.tailMesh.updateMorphTargets();
      slot.tailMesh.visible = true;
      slot.tailMesh.rotation.set(0,0,0);
    } else if (slot.tailMesh) slot.tailMesh.visible = false;
    if (geometry.legs) {
      if (!slot.legMesh) {
        slot.legMesh = new THREE.Mesh(geometry.legs, this.mat!);
        slot.root.add(slot.legMesh);
      }
      // Hips just inside the belly, a little aft of the middle.
      const hips = LEG_HIPS[species.id === 'ringneck' ? 'ringneck' : birdFamilyFor(species.id)] ?? LEG_HIPS.quail;
      slot.legMesh.position.set(0, hips[0], hips[1]);
      slot.legMesh.geometry = geometry.legs;
      slot.legMesh.visible = true;
      slot.legMesh.rotation.set(pheasantLegTuck(0), 0, 0);
      if (!slot.legMeshR) {
        slot.legMeshR = new THREE.Mesh(geometry.legR ?? geometry.legs, this.mat!);
        slot.root.add(slot.legMeshR);
      }
      slot.legMeshR.position.set(0, hips[0], hips[1]);
      slot.legMeshR.visible = false;
    } else {
      if (slot.legMesh) slot.legMesh.visible = false;
      if (slot.legMeshR) slot.legMeshR.visible = false;
    }
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
    slot.carryPose = undefined;
    slot.inHand = undefined;
    slot.handClaim = undefined;
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

  private buildFeathers(ctx: Ctx): void {
    this.featherGeo = new THREE.BufferGeometry();
    this.featherGeo.setAttribute('position', new THREE.BufferAttribute(this.featherPos, 3));
    this.featherGeo.setAttribute('color', new THREE.BufferAttribute(this.featherCol, 3));
    this.featherMat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.085,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.featherMat.onBeforeCompile = shader => {
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

  /** The hit's puff of feathers: the species' own body colours, sized for
   * the range the way the bird is, so it reads as far off as the bird does. */
  private burstFeathers(slot: Slot, rng: () => number): void {
    const camera = this.listener?.position;
    const distance = camera ? Math.hypot(slot.x - camera.x, slot.y - camera.y, slot.z - camera.z) : 25;
    const enlarge = this.flightScale(slot.species.id, slot) / restingBirdScale(birdFamilyFor(slot.species.id));
    const puff = featherPuffSize(distance, enlarge, this.viewHeight());
    const tones = featherTones(slot.species.id, slot.sex);
    for (let i = 0; i < FEATHER_PUFF; i++) {
      const j = i * 3;
      this.featherPos[j] = slot.x;
      this.featherPos[j + 1] = slot.y;
      this.featherPos[j + 2] = slot.z;
      const azimuth = rng() * Math.PI * 2;
      const speed = (0.7 + rng() * 1.8) * puff.spread;
      this.featherVel[j] = Math.cos(azimuth) * speed + slot.vxW * .25;
      this.featherVel[j + 1] = (0.5 + rng() * 1.7) * puff.spread;
      this.featherVel[j + 2] = Math.sin(azimuth) * speed + slot.vzW * .25;
      const tone = tones[i % tones.length];
      this.featherCol[j] = tone.r; this.featherCol[j + 1] = tone.g; this.featherCol[j + 2] = tone.b;
    }
    if (this.featherMat) this.featherMat.size = puff.size;
    if (this.frozen) this.hitLog.push({ simId: slot.simId, fieldMs: Math.round(this.fieldMs), rangeM: +distance.toFixed(1),
      featherPx: +(puff.size * this.viewHeight() / 2 / Math.max(1, distance)).toFixed(1) });
    this.featherMs = 0;
    if (this.featherPoints) this.featherPoints.visible = true;
    const position = this.featherGeo?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (position) position.needsUpdate = true;
    const color = this.featherGeo?.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (color) color.needsUpdate = true;
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
    this.fieldMs += dtMs;
    if (!this.signLaid) this.laySign();

    // 1. Detect newly flushed sim birds -> stage a rise (covey order).
    const simBirds = this.hunt.huntState().birds;
    const newCoveys = new Map<number, typeof simBirds>();
    for (const bird of simBirds) {
      if (bird.state === 'hidden') this.staged.delete(bird.id);
      if (bird.state !== 'flushed' || this.staged.has(bird.id)) continue;
      this.staged.add(bird.id);
      // A marked bird rising again is the follow-up: its mark is settled.
      this.markBook.release(bird.id);
      const covey = newCoveys.get(bird.coveyId) ?? [];
      covey.push(bird); newCoveys.set(bird.coveyId, covey);
    }
    {
      for (const covey of newCoveys.values()) {
        this.stageRise(covey);
        const flight: FlightContext = { escX:this.escX,escZ:this.escZ,rightX:this.rightX,rightZ:this.rightZ,
          hunterX:this.hunterX,hunterZ:this.hunterZ,rng:this.riseRng, downhill: this.fallLineUnder(covey) };
        // The bird nearest the hunter's boots goes first; the rest wait their wave.
        const boots = this.hunt.huntState().hunterPos;
        const speciesId = this.riseSpecies(covey);
        const waves = planRise(covey.map(bird => ({ id: bird.id, distance: Math.hypot(bird.pos.x - boots.x, bird.pos.y - boots.y) })),
          speciesId, this.riseRng);
        for (const bird of covey) this.pendingFlights.set(bird.id, { ...flight, slopeApproach: this.hunt.riseSlopeApproach(bird.id) });
        this.rises.push({ speciesId, waves, next: 0, circleBack: this.circlesBack(covey, speciesId) });
        this.erupt(covey, new Set(waves[0]?.ids ?? []), speciesId);
      }
    }

    // 2. Fly what's flying.
    let anyAloft = false;
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (s.status === 'idle' || s.status === 'done') continue;
      this.rememberFlightPosition(s);
      if (s.status === 'grounded') {
        if (s.fallPose?.groundedMs !== undefined) s.fallPose.groundedMs += dtMs;
        const bird = simBirds.find((candidate) => candidate.id === s.simId);
        if (s.inHand || s.handClaim) {
          // Being taken, or in the hunter's hand: the hand-off owns it.
        } else if (!bird || bird.state === 'retrieved' || bird.state === 'escaped') {
          s.status = 'done';
          s.root.visible = false;
        } else if (bird.state === 'downed' && bird.wounded && !bird.fallPending) {
          // A cripple lands alive and runs; the shared sim owns where it goes.
          this.hunt.simToWorld(bird.pos.x, bird.pos.y, this.crippleWorld);
          const dx = this.crippleWorld.x - s.x, dz = this.crippleWorld.z - s.z;
          s.running = (bird.woundRunMs ?? 0) > 0 && dx * dx + dz * dz > 1e-6;
          if (s.running) s.runYaw = Math.atan2(dx, dz);
          // Its legs keep pace with the ground it covers: a stride, not a slide.
          s.stride = ((s.stride ?? 0) + Math.hypot(dx, dz) / strideLength(s.species.id) * Math.PI) % (Math.PI * 2);
          s.x = this.crippleWorld.x; s.z = this.crippleWorld.z;
          s.y = this.drawnGround(s.x, s.z) + .06;
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
        if (s.reaction) {
          // The hit's reaction carries the bird: a fold keeps its launch or
          // crossing momentum, bled by drag and bent down by gravity; a tower
          // or a sail plays out first, then folds where it ends.
          const reaction = s.reaction, held = !reaction.collapsed;
          stepHitReaction(s, reaction, (s.airMs - reaction.startMs) / 1000, dt, birdFamilyFor(s.species.id));
          if (held && reaction.collapsed) {
            s.gliding = false;
            s.fallPose = { startMs: s.airMs + dtMs, rotation: s.root.rotation.clone() };
            this.beginCollapse(s);
          }
        }
        s.airMs += dtMs;
        const g = this.drawnGround(s.x, s.z);
        if (s.y <= g + 0.06) {
          const surface = this.fallSurface(s.x, s.z), strike = -s.vyW;
          const dead = !s.reaction || s.reaction.kind === 'fold' || !!s.reaction.collapsed;
          if (!s.struck) this.strike(s, surface);
          if (!s.struck && dead && surface === 'ground' && strike > BOUNCE_MIN_MPS) {
            // Dead weight on hard ground: it bounces once, then lies still.
            s.struck = true;
            s.y = g + .07;
            s.vyW = Math.min(BOUNCE_MAX_MPS, strike * BOUNCE_SHARE);
            s.vxW *= .45; s.vzW *= .45;
            continue;
          }
          s.struck = true;
          s.y = g + 0.06;
          s.status = 'grounded';
          s.gliding = false;
          this.rememberFlightPosition(s);
          // A sailing or spiralling bird lands as it flew; it rests from there.
          s.fallPose ??= { startMs: s.airMs, rotation: s.root.rotation.clone() };
          s.fallPose.groundedMs = 0;
          this.hunt.recordFallWorld(s.simId, s.x, s.z);
        }
        continue;
      }
      // Live targets and birds already out of the shot fly the same planned
      // line; only live targets hold the hunt open.
      const departing = s.status === 'departing';
      if (!departing) anyAloft = true;
      if (departing) s.departureMs = (s.departureMs ?? 0) + dtMs;
      s.airMs += dtMs;
      const flight = s.flight!;
      if (s.line) {
        stepFlightLine(s.line, s, dt, (x, z) => this.terrain.heightAt(x, z));
        // Out of the shot a bird stops dodging and lines out at its full pace,
        // so it is past the leaving range and off the cap sooner; a bird easing
        // into its landing keeps the pace its line gives it.
        const out = THREE.MathUtils.smoothstep(Math.hypot(s.x - flight.hunterX, s.z - flight.hunterZ), RISE_RANGE_M, RISE_RANGE_M + 12);
        const into = s.line.target ? THREE.MathUtils.clamp((Math.hypot(s.line.target.x - s.x, s.line.target.z - s.z) - 12) / 20, 0, 1) : 1;
        const boost = 1 + (LEAVING_SPEED_MULT - 1) * out * into;
        s.vxW *= boost; s.vzW *= boost;
      }
      const hawk = this.hunt.falconry;
      if (!departing && hawk?.targetId === s.simId && (hawk.phase === 'launching' || hawk.phase === 'chasing')) evadeGoshawk(s, s.simId, hawk.position);
      this.updateBank(s, dt);
      s.x += s.vxW * dt;
      s.z += s.vzW * dt;
      s.y += s.vyW * dt;
      const g = this.terrain.heightAt(s.x, s.z);
      if (s.y < g + 0.25) {
        s.y = g + 0.25;
        if (s.airMs > LAND_MIN_AIR_MS) {
          // Set down: the bird goes into the cover the hunter watched it
          // reach, and the simulation keeps it there for the follow-up. A
          // bird already credited out of the shot gets no second credit.
          s.status = 'done';
          s.root.visible = false;
          if (!departing) this.hunt.resolveBird(s.simId, 'escaped', { x: s.x, z: s.z });
          this.markLanding(s, departing && s.line?.target ? s.line.target : s);
          continue;
        }
      }
      // What the hunter sees of a bird going down, a few times a second: a
      // miss he watches go in is marked.
      const goingDown = s.line?.target ? Math.hypot(s.line.target.x - s.x, s.line.target.z - s.z) < 45 : s.y - g < 3 && s.airMs > LAND_MIN_AIR_MS;
      // A bird sailing on set wings for its spot can be marked by the sail.
      const sailing = !!s.line?.target && s.gliding;
      if ((goingDown || sailing) && (this.fieldMs / dtMs | 0) % 2 === 0 && this.sees(s)) {
        if (sailing) s.sailed = { ms: this.fieldMs, x: s.x, z: s.z };
        if (goingDown) {
          const going = glideMark(s, s.vxW, s.vyW, s.vzW, g);
          s.sighted = { ms: this.fieldMs, x: s.x, z: s.z, goingX: going.x, goingZ: going.z };
        }
      }
      if (departing) {
        if (this.leftTheScreen(s, flight)) {
          s.status = 'done'; s.root.visible = false;
          // Bound for its spot, it goes down there out of his sight: he may
          // still have marked it by its sail.
          if (s.line?.target) this.markLanding(s, s.line.target, false);
        }
        continue;
      }
      const rx = s.x - flight.hunterX;
      const rz = s.z - flight.hunterZ;
      const pursued = hawk?.targetId === s.simId && (hawk.phase === 'launching' || hawk.phase === 'chasing');
      if (birdFlightExpired(rx * rx + rz * rz, s.airMs, false, pursued)) {
        // Out of the shot: credit the escape now (with the cover its line
        // sets down in, so the single is there to hunt), and let the bird
        // fly on, honestly, until it lands in that cover or leaves the screen.
        s.status = 'departing';
        s.departureMs = 0;
        if (s.line?.target) this.hunt.resolveBird(s.simId, 'escaped', { ...s.line.target });
        else this.hunt.resolveBird(s.simId, 'escaped');
      }
    }

    // Release each covey's waves under the sky rule.
    this.releaseWaves(simBirds, dtMs);
    if (this.riseActive && !anyAloft && this.rises.length === 0) {
      let quiet = true;
      for (let i = 0; i < POOL; i++) {
        if (['falling', 'flying', 'waiting'].includes(this.slots[i].status)) quiet = false;
      }
      if (quiet) {
        this.riseActive = false; // the sky settled
        this.hunt.finishRise();
      }
    }
    // Between rises a mark keeps only birds still down where he saw them go:
    // a miss the field did not keep, or one put up again, settles its mark.
    if (!this.riseActive && this.markBook.marks.length && (this.fieldMs / dtMs | 0) % 15 === 0) {
      this.markBook.prune(id => simBirds.find(bird => bird.id === id)?.state === 'hidden');
      this.markBook.forget(this.fieldMs);
    }

    // 4. Debris clock.
    this.launchCover?.advance(dtMs);
    this.eruption?.advance(dtMs);
    if (this.loose && this.loose.count > 0) {
      // Loose feathers drift with the hunt's wind (blowing toward `wind`).
      const hunt = this.hunt.huntState();
      const drift = hunt.windStrength === 'strong' ? .55 : hunt.windStrength === 'breezy' ? .28 : .08;
      this.windDrift.x = Math.cos(hunt.wind) * drift; this.windDrift.z = Math.sin(hunt.wind) * drift;
      this.loose.step(dt, (x, z) => this.drawnGround(x, z), this.windDrift);
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

    // 5. Birds before the flush.
    this.stepSightings(simBirds, dtMs);
  }

  /** A covey just blew: a fresh per-rise stream, the covey's centroid and
   * its escape bearing, away from the gun and bent down the wind. It is
   * scoped to the birds that flushed: the rise leaves the cover the player
   * just watched, not a centroid of every hidden bird on the property.
   */
  private stageRise(stageBirds: readonly { id: number; pos: { x: number; y: number } }[]): void {
    this.riseActive = true;
    this.riseSeq++;
    this.riseMs = 0;
    this.riseRng = mulberry32((this.riseSeed + this.riseSeq * 0x9e3779b9) >>> 0);
    let cx = 0;
    let cz = 0;
    for (const bird of stageBirds) {
      this.hunt.simToWorld(bird.pos.x, bird.pos.y, this.w2);
      cx += this.w2.x / stageBirds.length;
      cz += this.w2.z / stageBirds.length;
    }
    this.originX = cx;
    this.originZ = cz;
    const hs = this.hunt.huntState();
    this.hunt.simToWorld(hs.hunterPos.x, hs.hunterPos.y, this.w2);
    this.hunterX = this.w2.x;
    this.hunterZ = this.w2.z;
    // Escape bearing: away from the gun, bent DOWN THE WIND (sim wind
    // blows toward angle a: sim x -> world x, sim y -> world z). Species
    // terrain responses are applied per bird at launch; this shared basis
    // keeps a covey together without making the map override a bycatch
    // bird's own flight language.
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
   * Give a bird's flight its species-owned terrain response while preserving
   * the covey's shared burst basis. Chukar are the first authored example:
   * they break down the fall line on a sloped property. Keeping this at the
   * per-slot seam matters on mixed properties, where a Hun or another
   * bycatch bird must not inherit Chukar Ridge's downhill escape.
   */
  private flightContextForSpecies(base: FlightContext, species: SpeciesConfig): FlightContext {
    if (species.flightDirection !== 'downhill') return base;
    const downhill = this.downhillOf(base);
    if (downhill === undefined) return base;
    const downhillX = Math.cos(downhill);
    const downhillZ = Math.sin(downhill);
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

  /**
   * Where the ground falls away under a covey that pours downhill: the land's
   * own fall line (into the draw, off the spur), read wider on a flat bench,
   * on a ground with an uphill at all. Undefined for any other covey.
   */
  private fallLineUnder(covey: readonly SimLaunchBird[]): number | undefined {
    if (this.hunt.areaConfig().slope === undefined) return undefined;
    if (!covey.some(bird => getSpecies(bird.speciesId).flightDirection === 'downhill')) return undefined;
    const ground = (x: number, z: number) => this.terrain.heightAt(x, z);
    return (fallLine(this.originX, this.originZ, ground) ?? fallLine(this.originX, this.originZ, ground, [40, 70]))?.bearing;
  }

  /** The way down for a downhill flier: the covey's fall line, else the ground's. */
  private downhillOf(flight: FlightContext): number | undefined {
    if (flight.downhill !== undefined) return flight.downhill;
    const slope = this.hunt.areaConfig().slope;
    return slope === undefined ? undefined : slope + Math.PI;
  }

  /** The species a covey's rise follows: most of its birds. A bycatch bird
   * sharing the group still flies its own way inside that score. */
  private riseSpecies(covey: readonly { id: number; speciesId: string }[]): string {
    const counts = new Map<string, number>();
    for (const bird of covey) counts.set(bird.speciesId, (counts.get(bird.speciesId) ?? 0) + 1);
    let best = covey[0]?.speciesId ?? 'bobwhite';
    for (const [speciesId, n] of counts) if (n > (counts.get(best) ?? 0)) best = speciesId;
    return best;
  }

  /** Birds holding the sky against the next wave (game/riseScore.ts holdsSky):
   * live, inside effective range of where the hunter stands now, and within
   * their wave's few seconds; and every bird the cap counts (countsAgainstCap:
   * live targets and leaving birds not yet 55 m off), whatever their clocks. */
  private birdsInTheSky(): { holding: number; inSky: number } {
    const boots = this.hunt.huntState().hunterPos;
    const gun = this.hunt.simToWorld(boots.x, boots.y, { x: 0, z: 0 });
    let holding = 0, inSky = 0;
    for (const slot of this.slots) {
      const bird = { status: slot.status, rangeM: Math.hypot(slot.x - gun.x, slot.z - gun.z),
        sinceLaunchMs: this.skyMs - (slot.launchedSkyMs ?? -Infinity) };
      if (countsAgainstCap(bird)) inSky++;
      if (holdsSky(bird)) holding++;
    }
    return { holding, inSky };
  }

  /** The gun as the sky reads it; a fixture or tool without one reads loaded. */
  private riseGun(): RiseGun | undefined {
    const gun = this.gunReadout?.();
    if (!gun) return undefined;
    const loaded = gun.shellsRemaining(), reloading = gun.isReloading();
    if (loaded <= 0 || reloading) this.gunEmptied = true;
    return { loaded, capacity: gun.shellCapacity(), reloading, emptiedSinceWave: this.gunEmptied };
  }

  /**
   * Duck Hunt rules the sky: release each covey's next wave when its rise
   * score allows (game/riseScore.ts). Coveys are served in flush order, and a
   * later covey's first wave goes with its own eruption whenever it fits.
   */
  private releaseWaves(simBirds: readonly SimLaunchBird[], dtMs: number): void {
    this.skyMs += dtMs;
    // Only a covey still in the cover cares when the sky cleared.
    if (this.rises.length === 0) { this.skyClearSinceMs = null; return; }
    let { holding: inPlay, inSky } = this.birdsInTheSky();
    if (inPlay > 0) this.skyClearSinceMs = null;
    else this.skyClearSinceMs ??= this.skyMs;
    const gun = this.riseGun();
    for (const rise of this.rises) {
      const score = riseScoreFor(rise.speciesId);
      while (rise.next < rise.waves.length) {
        const wave = rise.waves[rise.next];
        const sky = { nowMs: this.skyMs, inPlay, inSky, lastWaveMs: this.lastWaveMs, clearSinceMs: this.skyClearSinceMs, gun };
        if (!waveMayRise(wave, score, sky, rise.next === 0)) break;
        // A queued bird can only leave the queue by rising (or by the hunt
        // ending around it); wave-mates wait together for room in the pool.
        const live = wave.ids.filter(id => simBirds.some(bird => bird.id === id && bird.state === 'flushed'));
        const free = this.slots.filter(slot => slot.status === 'idle' || slot.status === 'done' || slot.status === 'departing').length;
        if (free < live.length) break;
        rise.next++;
        if (live.length === 0) continue;
        const doctrine = huntingDoctrine(this.hunt.areaConfig().id);
        // A covey sat on underfoot bursts wide across the hunter's front
        // (CLOSE_FAN_WIDEN): its wave's lanes open with the closest bird.
        const close = Math.max(...live.map(id => this.closenessOf(simBirds.find(bird => bird.id === id)!)));
        const lanes = this.laneByBird(live, simBirds, this.planLanes(live, simBirds, score.laneStep * (1 + CLOSE_FAN_WIDEN * close)));
        const straight = this.straightaways(live, lanes);
        // A Hun covey curves as a bunch (and loops round together when it circles back).
        const curlSign = rise.speciesId === 'hun' ? (rise.circleBack ? rise.curl ??= (this.riseRng() < .5 ? -1 : 1) : (this.riseRng() < .5 ? -1 : 1)) : undefined;
        live.forEach((id, k) => {
          const slot = this.slots.find(candidate => candidate.status === 'idle' || candidate.status === 'done')
            ?? this.slots.find(candidate => candidate.status === 'departing')!;
          const lane = score.laneStep > 0 ? lanes.get(id) : undefined;
          this.launchBird(slot, simBirds.find(bird => bird.id === id)!, k, live.length, lane, doctrine,
            { curlSign, minOffSight: straight.has(id) || rise.circleBack ? undefined : STRAIGHTAWAY_LIMIT, circleBack: rise.circleBack });
        });
        for (const slot of this.slots) if (live.includes(slot.simId) && (slot.status === 'waiting' || slot.status === 'flying')) slot.launchedSkyMs = this.skyMs;
        inPlay += live.length; inSky += live.length;
        this.lastWaveMs = this.skyMs;
        this.skyClearSinceMs = null;
        this.gunEmptied = false;
      }
    }
    this.rises = this.rises.filter(rise => rise.next < rise.waves.length);
  }

  /** A wave's lanes around its escape line (its first bird's, with the
   * species' own terrain response). A downhill flier's wave pours off the
   * slope, turned so no lane climbs above the contour its low burst cannot
   * clear; any other wave opens across the shooter's view. */
  private planLanes(ids: readonly number[], simBirds: readonly SimLaunchBird[], step: number): WaveLane[] {
    const lead = simBirds.find(bird => bird.id === ids[0]);
    const base = this.pendingFlights.get(ids[0]);
    if (!lead || !base) return waveLanes(ids.length, step, this.riseRng);
    const species = getSpecies(lead.speciesId), flight = this.flightContextForSpecies(base, species);
    const downhill = this.downhillOf(flight);
    if (species.flightDirection === 'downhill' && downhill !== undefined) {
      const uphill = downhill + Math.PI, escape = Math.atan2(flight.escZ, flight.escX);
      const poured = lanesOffTheHill(waveLanes(ids.length, step, this.riseRng), escape, uphill);
      // With the hunter below the covey the wave swings wide of him, down and across.
      const boots = this.hunt.huntState().hunterPos;
      const gun = this.hunt.simToWorld(boots.x, boots.y, { x: 0, z: 0 });
      this.hunt.simToWorld(lead.pos.x, lead.pos.y, this.w2);
      return lanesClearOfTheGun(poured, escape, uphill, Math.atan2(gun.z - this.w2.z, gun.x - this.w2.x),
        Math.hypot(gun.x - this.w2.x, gun.z - this.w2.z), PASS_CLEAR_M, this.riseRng() < .5 ? -1 : 1);
    }
    return waveLanes(ids.length, step, this.riseRng, this.escapeOffSight(ids, simBirds, flight), this.sideInTheShot(ids, simBirds));
  }

  /** Which side of a new wave's line of sight the birds already in the shot
   * are heading for (+1 or -1 as a bearing turns, 0 for none), so a popcorn
   * single breaks away from them rather than across them. */
  private sideInTheShot(ids: readonly number[], simBirds: readonly SimLaunchBird[]): number {
    const boots = this.hunt.huntState().hunterPos;
    const gun = this.hunt.simToWorld(boots.x, boots.y, { x: 0, z: 0 });
    const bird = simBirds.find(candidate => candidate.id === ids[0]);
    if (!bird) return 0;
    this.hunt.simToWorld(bird.pos.x, bird.pos.y, this.w2);
    const sight = Math.atan2(this.w2.z - gun.z, this.w2.x - gun.x);
    let side = 0;
    for (const slot of this.slots) {
      if (!inTheShot({ status: slot.status, rangeM: Math.hypot(slot.x - gun.x, slot.z - gun.z) })) continue;
      // Where it is heading: a second or so down its line, not where it is now.
      const speed = Math.hypot(slot.vxW, slot.vzW);
      const heading = speed > 2 ? Math.atan2(slot.vzW, slot.vxW) : slot.line?.bearing ?? Math.atan2(slot.vzW, slot.vxW);
      const bearing = Math.atan2(slot.z + Math.sin(heading) * SIDE_LOOK_M - gun.z, slot.x + Math.cos(heading) * SIDE_LOOK_M - gun.x);
      side += Math.sign(Math.atan2(Math.sin(bearing - sight), Math.cos(bearing - sight)));
    }
    return Math.sign(side);
  }

  /** The escape line as an angle off the line of sight from where the hunter
   * stands now to the wave's cover. */
  private escapeOffSight(ids: readonly number[], simBirds: readonly SimLaunchBird[], flight: FlightContext): number {
    let x = 0, z = 0;
    for (const id of ids) {
      const bird = simBirds.find(candidate => candidate.id === id)!;
      this.hunt.simToWorld(bird.pos.x, bird.pos.y, this.w2);
      x += this.w2.x / ids.length; z += this.w2.z / ids.length;
    }
    const boots = this.hunt.huntState().hunterPos;
    this.hunt.simToWorld(boots.x, boots.y, this.w2);
    const sight = Math.atan2(z - this.w2.z, x - this.w2.x), escape = Math.atan2(flight.escZ, flight.escX);
    return Math.atan2(Math.sin(escape - sight), Math.cos(escape - sight));
  }

  /** How close to the hunter's boots a queued bird sits (game/closeFlush.ts). */
  private closenessOf(bird: SimLaunchBird): number {
    const boots = this.hunt.huntState().hunterPos;
    const gun = this.hunt.simToWorld(boots.x, boots.y, { x: 0, z: 0 });
    this.hunt.simToWorld(bird.pos.x, bird.pos.y, this.w2);
    return closeFlushIntensity(bird.speciesId, Math.hypot(this.w2.x - gun.x, this.w2.z - gun.z));
  }

  /** Which of a wave's birds may go straight away from the gun: the middle
   * lane of a wave of three; a lone bird or a pair's bird now and then. The
   * rest are turned off the line of sight (STRAIGHTAWAY_LIMIT), so crossing
   * and quartering shots are the common ones. */
  private straightaways(ids: readonly number[], lanes: ReadonlyMap<number, WaveLane>): Set<number> {
    if (ids.length >= 3) {
      const middle = [...ids].sort((a, b) => (lanes.get(a)?.side ?? 1) - (lanes.get(b)?.side ?? 1))[0];
      return new Set([middle]);
    }
    return new Set(ids.filter(() => this.riseRng() < STRAIGHTAWAY_SHARE));
  }

  /** Hand a wave's lanes to its birds in the order the gun sees them, left to
   * right, so their lines open from the cover instead of crossing. */
  private laneByBird(ids: readonly number[], simBirds: readonly SimLaunchBird[], lanes: readonly WaveLane[]): Map<number, WaveLane> {
    const boots = this.hunt.huntState().hunterPos;
    const gun = this.hunt.simToWorld(boots.x, boots.y, { x: 0, z: 0 });
    const seen = ids.map(id => {
      const bird = simBirds.find(candidate => candidate.id === id)!;
      this.hunt.simToWorld(bird.pos.x, bird.pos.y, this.w2);
      return { id, bearing: Math.atan2(this.w2.z - gun.z, this.w2.x - gun.x) };
    });
    const mid = Math.atan2(seen.reduce((s, b) => s + Math.sin(b.bearing), 0), seen.reduce((s, b) => s + Math.cos(b.bearing), 0));
    const off = (bearing: number) => Math.atan2(Math.sin(bearing - mid), Math.cos(bearing - mid));
    seen.sort((a, b) => off(a.bearing) - off(b.bearing) || a.id - b.id);
    const ordered = [...lanes].sort((a, b) => a.offset - b.offset);
    return new Map(seen.map((bird, i) => [bird.id, ordered[i]]));
  }

  /**
   * Put one bird in the air from its cover on its planned line
   * (game/flightLine.ts). `index` and `waveN` place it in its wave's burst
   * clock; `lane` is its wave lane, `plan` its wave's line constraints.
   */
  private launchBird(slot: Slot, sim: SimLaunchBird, index: number, waveN: number, lane: WaveLane | undefined,
    doctrine: ReturnType<typeof huntingDoctrine>, plan: { minOffSight?: number; curlSign?: number; circleBack?: boolean } = {}): void {
    const id = sim.id;
    slot.launchSound?.stop();
    slot.launchSound = undefined;
    const flight = this.pendingFlights.get(id);
    this.pendingFlights.delete(id);
    const baseFlight = flight ?? { escX: this.escX, escZ: this.escZ, rightX: this.rightX, rightZ: this.rightZ,
      hunterX: this.hunterX, hunterZ: this.hunterZ, rng: this.riseRng };
    const rng = flight?.rng ?? this.riseRng;
    const species = getSpecies(sim.speciesId);
    // A covey shares its burst clock, but the bird still owns its terrain
    // response: chukar use the fall line while Hun bycatch on the same
    // property keeps the common gun-away/wind bearing.
    const speciesFlight = this.flightContextForSpecies(baseFlight, species);
    slot.flight = speciesFlight;
    slot.simId = id;
    slot.young = !!sim.young;
    this.applySpeciesAppearance(slot, species, sim.sex);
    this.hunt.simToWorld(sim.pos.x, sim.pos.y, this.w2);
    slot.x = this.w2.x; slot.z = this.w2.z;
    slot.y = this.terrain.heightAt(slot.x, slot.z) + 0.2;
    const closeness = closeFlushIntensity(species.id, Math.hypot(slot.x - speciesFlight.hunterX, slot.z - speciesFlight.hunterZ));
    slot.closeness = closeness;
    // A bird without a lane (a pheasant) still breaks a little off its line,
    // wider when it goes up underfoot.
    const offset = lane?.offset ?? (rng() - .5) * .3 * (1 + CLOSE_FAN_WIDEN * closeness);
    const eye = this.listener?.position ?? { x: speciesFlight.hunterX, z: speciesFlight.hunterZ,
      y: this.terrain.heightAt(speciesFlight.hunterX, speciesFlight.hunterZ) + 1.62 };
    slot.line = planFlightLine({
      family: lineFamilyFor(species.id), flight: species.flight,
      start: { x: slot.x, y: slot.y, z: slot.z }, eye: { x: eye.x, y: eye.y, z: eye.z },
      bearing: Math.atan2(speciesFlight.escZ, speciesFlight.escX) + offset, lift: laneLift(lane), burst: closeness,
      young: !!sim.young, doctrine: doctrine.flight,
      slope: species.flightDirection === 'downhill' ? speciesFlight.slopeApproach ?? null : null,
      curlSign: plan.curlSign, minOffSight: plan.minOffSight, lean: lane ? Math.sign(lane.offset) : undefined, mayLand: !sim.single,
      wild: !!sim.single, circleBack: plan.circleBack && !sim.single, landable: this.landable, fan: this.pourFan(speciesFlight, species),
      ground: (x, z) => this.terrain.heightAt(x, z), cover: this.hunt.coverPatches?.() ?? [], rng,
    });
    slot.circling = !!slot.line.target && !!plan.circleBack && !sim.single;
    slot.launchedSingle = !!sim.single;
    slot.sighted = undefined; slot.sailed = undefined; slot.hawkHeld = false;
    slot.vxW = Math.cos(slot.line.bearing) * .5;
    slot.vzW = Math.sin(slot.line.bearing) * .5;
    slot.vyW = 0;
    slot.airMs = 0;
    slot.previousAirMs = 0;
    this.rememberFlightPosition(slot);
    slot.departureMs = undefined;
    slot.fallPose = undefined;
    slot.bank = 0;
    slot.bankYaw = undefined;
    slot.wobblePh = index * 2.1;
    slot.gliding = false;
    // Wave-mates break together, inside about a fifth of a second; a covey
    // sat on underfoot erupts as one.
    slot.delayMs = (species.id === 'sharptail' ? sharptailLaunchDelay(index, waveN, rng) : quailLaunchDelay(index, waveN, rng))
      * (1 - .65 * closeness);
    const waiting = slot.delayMs > 0;
    slot.status = waiting ? 'waiting' : 'flying';
    slot.root.visible = !waiting;
    if (!waiting) this.disturbLaunchCover(slot);
  }

  /** A downhill flier's lines stay on or below the contour of its fall line. */
  private pourFan(flight: FlightContext, species: SpeciesConfig): { centre: number; half: number } | undefined {
    const downhill = species.flightDirection === 'downhill' ? this.downhillOf(flight) : undefined;
    return downhill === undefined ? undefined : { centre: downhill, half: Math.PI / 2 - BELOW_CONTOUR };
  }

  /** A bird out of the shot has driven off the screen: out of the camera's
   * view, behind the land, or too small to see; or, unwatched, far enough. A
   * bird bound for cover the hunter can see is never too small: it glides
   * down into it however far off, so the miss can be marked. */
  private leftTheScreen(slot: Slot, flight: FlightContext): boolean {
    if ((slot.departureMs ?? 0) > DEPART_MAX_MS) return true;
    const camera = this.listener as THREE.PerspectiveCamera | undefined;
    if (!camera?.isPerspectiveCamera) return Math.hypot(slot.x - flight.hunterX, slot.z - flight.hunterZ) > DEPART_MAX_RANGE_M;
    if (camera.position.distanceTo(this.departProbe.set(slot.x, slot.y, slot.z)) > DEPART_MAX_RANGE_M) return true;
    camera.updateMatrixWorld();
    this.departFrustum.setFromProjectionMatrix(this.departMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    if (!this.departFrustum.containsPoint(this.departProbe)) return true;
    const depth = this.departProbe.clone().sub(camera.position).dot(camera.getWorldDirection(this.departAxis));
    const span = slot.spanM * this.flightScale(slot.species.id, slot, camera.position) * slot.visualScale;
    if (!slot.line?.target && depth > 0 && span * this.viewHeight() / (2 * Math.tan(camera.fov * Math.PI / 360) * depth) < DEPART_MIN_PX) return true;
    return this.behindTheLand(camera.position, slot);
  }

  /** Terrain stands between the camera and the bird. */
  private behindTheLand(eye: THREE.Vector3, at: { x: number; y: number; z: number }): boolean {
    const dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z, length = Math.hypot(dx, dz);
    for (let s = 3; s < length - 2; s += Math.max(2, length / 48)) {
      const k = s / length;
      if (this.terrain.heightAt(eye.x + dx * k, eye.z + dz * k) > eye.y + dy * k) return true;
    }
    return false;
  }

  /**
   * The cover blows out across the whole covey's footprint at the flush.
   * Every bird held back for a later wave throws its own cover now and is
   * heard in one wing thunder sized to them; the first wave's birds burst and
   * sound for themselves as they go. The whole covey is heard; at most three
   * are seen.
   */
  private erupt(covey: readonly SimLaunchBird[], firstWave: ReadonlySet<number>, speciesId: string): void {
    // Every covey, however small, blows its cover out where it sat: dust and
    // chaff over the whole footprint and the stems shaking round it, sized to
    // the birds.
    const footprint = covey.map(bird => { this.hunt.simToWorld(bird.pos.x, bird.pos.y, this.w2); return { x: this.w2.x, z: this.w2.z }; });
    const reach = Math.max(0, ...footprint.map(spot => Math.hypot(spot.x - this.originX, spot.z - this.originZ)));
    this.burstRadius = Math.min(7, Math.max(2.7, (reach + 1.5) * (.85 + .05 * covey.length)));
    const hunt = this.hunt.huntState();
    const wind = hunt.windStrength === 'strong' ? 1.6 : hunt.windStrength === 'breezy' ? .8 : .3;
    this.eruption?.erupt({ footprint, birds: covey.length, windX: Math.cos(hunt.wind ?? 0) * wind, windZ: Math.sin(hunt.wind ?? 0) * wind,
      seed: (this.riseSeq * 0x85ebca6b ^ (covey[0]?.id ?? 0)) >>> 0, snow: this.hunt.condition?.() === 'snow',
      intensity: Math.max(0, ...footprint.map(spot => closeFlushIntensity(speciesId, Math.hypot(spot.x - this.hunterX, spot.z - this.hunterZ)))) });
    const held = covey.filter(bird => !firstWave.has(bird.id));
    if (held.length === 0) return;
    let cx = 0, cy = 0, cz = 0;
    for (const bird of held) {
      this.hunt.simToWorld(bird.pos.x, bird.pos.y, this.w2);
      const x = this.w2.x, z = this.w2.z;
      cx += x; cy += this.terrain.heightAt(x, z) + .2; cz += z;
      this.coverEvents?.dispatchEvent(new CustomEvent('bird-cover-disturbance', { detail: { x, z } }));
      this.launchCover?.launch(x, z, this.escX, this.escZ, (bird.id * 0x9e3779b9 + this.riseSeq * 0x85ebca6b) >>> 0 ^ 0x51ed, {
        intensity: closeFlushIntensity(speciesId, Math.hypot(x - this.hunterX, z - this.hunterZ)),
        snow: this.hunt.condition?.() === 'snow',
      });
    }
    if (this.frozen) return;
    const offset = new THREE.Vector3(cx / held.length, cy / held.length, cz / held.length);
    if (this.listener) offset.sub(this.listener.position).applyQuaternion(this.listener.quaternion.clone().invert());
    else offset.sub(new THREE.Vector3(this.hunterX, 0, this.hunterZ));
    playCoveyThunder(speciesId, held.length, offset.length(), offset, {
      seed: (this.riseSeq * 0x9e3779b9 ^ held[0].id) >>> 0, flapRate: getSpecies(speciesId).flight.flapRate ?? 9,
    });
  }

  private disturbLaunchCover(slot: Slot): void {
    if (!this.frozen) {
      const offset = new THREE.Vector3(slot.x, slot.y, slot.z);
      if (this.listener) offset.sub(this.listener.position).applyQuaternion(this.listener.quaternion.clone().invert());
      else offset.sub(new THREE.Vector3(this.hunterX, 0, this.hunterZ));
      slot.launchSound?.stop();
      slot.launchOriginX = slot.x; slot.launchOriginY = slot.y; slot.launchOriginZ = slot.z;
      const closeness = slot.closeness ?? 0;
      const voice = {
        seed: (slot.simId * 0x9e3779b9 + this.riseSeq * 0x85ebca6b) >>> 0,
        // A rooster's claps are timed to the downstrokes you see, so they
        // follow the shown beat; a small bird's whirr keeps its real rate.
        flapRate: slot.species.id === 'ringneck' ? shownWingHz(slot.species.flight.flapRate ?? 9) : slot.species.flight.flapRate ?? 9,
        phaseOffset: slot.wobblePh * .35,
        // Every bird of a close covey adds its own clap; keep the sum sane.
        burst: slot.species.id === 'ringneck' ? closeness : closeness * .7,
      };
      if (closeness >= CLOSE_FLUSH_THRESHOLD && this.riseMs - this.lastFlinchMs > 450) {
        this.lastFlinchMs = this.riseMs;
        this.coverEvents?.dispatchEvent(new CustomEvent('close-flush', { detail: {
          intensity: closeness, x: slot.x, z: slot.z, speciesId: slot.species.id } }));
      }
      slot.launchSound = slot.species.id === 'ringneck'
        ? playPheasantFlush(offset.length(), slot.sex === 'rooster', offset, voice)
        : playBirdFlush(slot.species.id, offset.length(), offset, { ...voice,
          glideAfterMs: slot.line && Number.isFinite(slot.line.glideAt) ? slot.line.glideAt * 1000 : slot.species.flight.glideAfterMs,
        });
    }
    this.coverEvents?.dispatchEvent(new CustomEvent('bird-cover-disturbance', {
      detail: { x: slot.x, z: slot.z },
    }));
    const closeness = slot.closeness ?? 0;
    this.launchCover?.launch(slot.x, slot.z, slot.flight?.escX ?? 0, slot.flight?.escZ ?? 0,
      (slot.simId * 0x9e3779b9 + this.riseSeq * 0x85ebca6b) >>> 0, {
        intensity: closeness,
        snow: this.hunt.condition?.() === 'snow',
        // A rooster clawing up out of cover at your feet loses a feather or two.
        feathers: slot.species.id === 'ringneck' && closeness > .5 ? 1 + Number(closeness > .85) : 0,
        featherColor: slot.sex === 'hen' ? 0xb08b5c : 0x9a5328,
      });
  }

  /* ------------------------- read-only surface ----------------------- */

  /** Model scale while airborne, before the species' own size factor. The
   * `life` size mode reads the bird's distance from the camera. Quail Fields
   * flew its birds at true size at every range until the October 2026
   * playtest found a covey a speck by 20 m; it eases like every ground now,
   * from the bobwhite's true size (QUAIL_WORLD_SCALE) up close. */
  private flightScale(speciesId: string, at: { x: number; y: number; z: number }, camera = this.listener?.position): number {
    const range = camera ? Math.hypot(at.x - camera.x, at.y - camera.y, at.z - camera.z) : 0;
    const distanceM = this.size === 'life' ? range : 0;
    const scale = flyingBirdScale(this.size, restingBirdScale(birdFamilyFor(speciesId)), RISE_SCALE, distanceM);
    return this.size === 'true' ? scale : scale * this.identityBoostAt(range);
  }

  /** The ground as it is drawn under a point (the terrain's own triangles at
   * the camera's level of detail), else the heightfield. */
  private drawnGround(x: number, z: number): number {
    return this.terrain.surfaceHeightAt?.(x, z) ?? this.terrain.heightAt(x, z);
  }

  /** On a small screen a flying bird is drawn large enough that a bobwhite
   * as far off would still read as a bird, not a dot (birdIdentity.ts). */
  private identityBoostAt(range: number): number {
    const reference = this.speciesGeos.get('bobwhite')?.spanM;
    if (!reference || !(range > 0)) return 1;
    const fov = (this.listener as THREE.PerspectiveCamera | undefined)?.fov ?? 70;
    const referenceSpan = reference * flyingBirdScale(this.size, restingBirdScale('quail'), RISE_SCALE, this.size === 'life' ? range : 0);
    return identityBoost(range, referenceSpan, this.viewHeight(), fov);
  }

  /**
   * Bring a hit bird down (the gun's hook). `shot` says how squarely the
   * pattern took it, which picks the reaction: a fold, a tower, a sail or a
   * wing-tipped spiral (hitReactions.ts). Without it the bird folds.
   */
  downBird(simId: number, impact?: { x: number; y: number; z: number }, shot?: HitShot, force?: HitReactionKind): boolean {
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (s.simId === simId && s.status === 'flying') {
        s.status = 'falling';
        // The projectile can meet the bird between ticks. Begin the fall
        // there, rather than jumping to its later authoritative flight point.
        if (impact) { s.x = impact.x; s.y = impact.y; s.z = impact.z; }
        this.rememberFlightPosition(s);
        s.launchSound?.stop();
        s.launchSound = undefined;
        {
          // Its own stream per bird and rise: the rise's dice stay untouched.
          const rng = mulberry32((this.riseSeed ^ Math.imul(s.simId + 1, 0x9e3779b1) ^ Math.imul(this.riseSeq + 1, 0x85ebca6b)) >>> 0);
          const chosen = chooseHitReaction(birdFamilyFor(s.species.id), shot, {
            heightM: s.y - this.terrain.heightAt(s.x, s.z), speedMps: Math.hypot(s.vxW, s.vzW),
          }, rng);
          // Capture tooling may ask for a particular reaction to review it.
          const kind = force ?? chosen;
          s.reaction = createHitReaction(kind, s.airMs, Math.atan2(s.vxW, s.vzW), s.vyW, rng);
          s.gliding = kind === 'sail';
          if (kind === 'fold') s.fallPose = { startMs: s.airMs, rotation: s.root.rotation.clone() };
          this.loose?.emit(s, { x: s.vxW, y: s.vyW, z: s.vzW }, featherCount(kind, shot?.offset ?? 0),
            featherTones(s.species.id, s.sex), rng);
          if (kind === 'fold') this.beginCollapse(s);
          this.burstFeathers(s, rng);
        }
        return true;
      }
    }
    return false;
  }

  /** How a hit bird is coming down, while it is falling or after. */
  hitReaction(simId: number): HitReaction['kind'] | undefined {
    return this.slots.find(s => s.simId === simId && s.reaction)?.reaction?.kind;
  }

  quarryTargets(): QuarryTarget[] {
    return this.slots.filter(s => s.status === 'flying').map(s => ({ id:s.simId,x:s.x,y:s.y,z:s.z,vx:s.vxW,vy:s.vyW,vz:s.vzW }));
  }

  holdQuarry(id: number, x: number, y: number, z: number): void {
    const slot = this.slots.find(s => s.simId === id && s.status !== 'idle' && s.status !== 'done' && s.status !== 'departing');
    if (!slot) return;
    slot.status = 'grounded'; slot.x=x; slot.y=y; slot.z=z; slot.hawkHeld = true;
    this.rememberFlightPosition(slot);
    slot.launchSound?.stop(); slot.launchSound=undefined;
  }

  /** No argument returns authoritative positions for existing simulation
   * callers. A fired shot retains its displayed phase while advancing on the
   * fixed clock, so its sweep follows the same timeline the player saw.
   * The sample buffer is reused; callers must copy retained positions. */
  shotTargets(presentationPhase = 1): readonly RayBirdTarget[] {
    const phase = this.flightPresentationPhase(presentationPhase);
    if (phase === 1) {
      for (const slot of this.slots) slot.anchorable = anchorable(slot);
      return this.slots;
    }
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const target = this.shotSamples[i] ??= { simId: slot.simId, status: slot.status, x: 0, y: 0, z: 0 };
      target.simId = slot.simId; target.status = slot.status; target.anchorable = anchorable(slot);
      this.sampleFlightPosition(slot, phase, target);
    }
    return this.shotSamples;
  }

  /** A hit bird a second shot can still take (see anchorable()). */
  isAnchorable(simId: number): boolean {
    return this.slots.some(slot => slot.simId === simId && anchorable(slot));
  }

  /**
   * Anchor a towering, sailing or wing-tipped bird with a second shot: it
   * folds where it is and drops on its own momentum, throwing feathers. The
   * hunt already counted it down; whether it lands alive is the hunt's call.
   */
  anchorBird(simId: number, shot?: HitShot): boolean {
    const s = this.slots.find(slot => slot.simId === simId && anchorable(slot));
    if (!s?.reaction) return false;
    s.reaction.collapsed = true;
    s.gliding = false;
    s.fallPose = { startMs: s.airMs, rotation: s.root.rotation.clone() };
    this.beginCollapse(s);
    const rng = mulberry32((this.riseSeed ^ Math.imul(s.simId + 7, 0x9e3779b1) ^ Math.imul(this.riseSeq + 3, 0x85ebca6b)) >>> 0);
    this.loose?.emit(s, { x: s.vxW, y: s.vyW, z: s.vzW }, featherCount('fold', shot?.offset ?? 0), featherTones(s.species.id, s.sex), rng);
    this.burstFeathers(s, rng);
    return true;
  }

  /** Select the first live target inside the camera-centered shot pattern. */
  shootRay(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    spreadRad = 0.04,
    targetVisible?: (target: RayBirdTarget) => boolean,
  ): number | null {
    return pickBirdAlongRay(this.shotTargets(this.renderedPhase), origin, direction, spreadRad, targetVisible);
  }

  riseSequence(): number {
    return this.riseSeq;
  }

  isRiseActive(): boolean {
    return this.riseActive;
  }

  /** The hunter's marks: where he watched misses go down (game/marks.ts). */
  marks(): readonly HunterMark[] { return this.markBook.marks; }

  /** Birds before the flush now on the ground in view (world metres), and how many this hunt. */
  sightings(): { kind: SightingKind | null; shown: number; birds: { simId: number; speciesId: string; x: number; y: number; z: number }[] } {
    return { kind: this.sightClock.current?.kind ?? null, shown: this.sightClock.count,
      birds: [...this.sightShown.values()].map(s => ({ simId: s.simId, speciesId: s.species.id, x: s.x, y: s.y, z: s.z })) };
  }

  /** The mark he made last, and how sure of it he still is (1 fresh, 0 forgotten). */
  latestMark(): { mark: HunterMark; freshness: number } | null {
    const mark = this.markBook.latest();
    return mark ? { mark, freshness: this.markBook.freshness(mark, this.fieldMs) } : null;
  }

  /** The mark a cast the way he faces (a world bearing) means, within `reach` metres. */
  aimedMark(x: number, z: number, facing: number, reach: number): HunterMark | null {
    return this.markBook.aimedAt({ x, z }, facing, reach);
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
    slopeApproach: SlopeApproach | null; velocity: { x: number; y: number; z: number }; speciesId: string; sex?: 'hen' | 'rooster';
  }[] {
    const out: {
      simId: number; x: number; y: number; z: number; airMs: number; status: string; sizeM: number;
      slopeApproach: SlopeApproach | null; velocity: { x: number; y: number; z: number }; speciesId: string; sex?: 'hen' | 'rooster';
    }[] = [];
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (s.status === 'flying' || s.status === 'falling' || s.status === 'waiting') {
        const point = this.sampleFlightPosition(s, this.renderedPhase, { x: 0, y: 0, z: 0 });
        out.push({
          simId: s.simId, ...point,
          airMs: THREE.MathUtils.lerp(s.previousAirMs ?? s.airMs, s.airMs, this.renderedPhase), status: s.status,
          sizeM: s.spanM * this.flightScale(s.species.id, point) * s.visualScale,
          slopeApproach: s.species.flightDirection === 'downhill' ? s.flight?.slopeApproach ?? null : null,
          velocity: { x: s.vxW, y: s.vyW, z: s.vzW }, speciesId: s.species.id, sex: s.sex,
        });
      }
    }
    return out;
  }

  /** Tooling/HUD telemetry: shot birds still lying in the cover. */
  /**
   * A bird of the day's bag for the tailgate photo: limp, wings folded, at
   * the size it lies in the grass. Shares the species' geometry and the
   * flock's material; the caller removes the group and disposes nothing.
   */
  trophyBird(speciesId: string, sex?: 'hen' | 'rooster'): THREE.Group {
    const species = getSpecies(speciesId);
    const geometry = this.speciesGeos.get(`${species.id}${sex === 'hen' ? ':hen' : ''}`) ?? this.speciesGeos.get(species.id)!;
    const root = new THREE.Group(); root.name = `Tailgate ${species.id}`;
    const body = new THREE.Mesh(geometry.body, this.mat!);
    const wingLMesh = new THREE.Mesh(geometry.wingL, this.mat!), wingRMesh = new THREE.Mesh(geometry.wingR, this.mat!);
    const wingL = new THREE.Group(), wingR = new THREE.Group();
    wingL.add(wingLMesh); wingR.add(wingRMesh);
    const shape = geometry.shape;
    wingL.position.set(-0.03 * shape.bodyWidth, 0.016 * shape.bodyDepth, 0.028 * shape.bodyLength);
    wingR.position.set(0.03 * shape.bodyWidth, 0.016 * shape.bodyDepth, 0.028 * shape.bodyLength);
    root.add(body, wingL, wingR);
    let tailMesh: THREE.Mesh | undefined;
    if (geometry.tail) {
      tailMesh = new THREE.Mesh(geometry.tail, this.mat!); tailMesh.position.set(0, .004, -.085);
      tailMesh.updateMorphTargets(); root.add(tailMesh);
    }
    for (const mesh of [body, wingLMesh, wingRMesh]) mesh.updateMorphTargets();
    // As a downed bird lies in the grass: the limp shape, wings folded.
    this.foldWings({ species, wingL, wingR, wingLMesh, wingRMesh } as unknown as Slot);
    if (body.morphTargetInfluences) body.morphTargetInfluences[0] = 1;
    if (tailMesh?.morphTargetInfluences) tailMesh.morphTargetInfluences[0] = 0;
    root.scale.setScalar(restingBirdScale(birdFamilyFor(species.id)) * birdVisualScale(species));
    root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    return root;
  }

  /** Capture: where a bird on the ground lies or runs, world metres. */
  groundedAt(simId: number): { x: number; y: number; z: number; running: boolean } | null {
    const s = this.slots.find(slot => slot.simId === simId && slot.status === 'grounded');
    return s ? { x: s.root.position.x, y: s.root.position.y, z: s.root.position.z, running: !!s.running } : null;
  }

  groundedIds(): number[] {
    const ids: number[] = [];
    for (let i = 0; i < POOL; i++) {
      if (this.slots[i].status === 'grounded') ids.push(this.slots[i].simId);
    }
    return ids;
  }

  /** Actual visible fall centre for the reserved dog's pickup reach. */
  /**
   * The hunter takes this bird from the dog: from now until `releaseFromHand`
   * it is drawn at the given world grip, whatever the hunt says about it.
   * `blend` eases its orientation from the mouth's grip into the hand's.
   */
  holdInHand(simId: number, position: THREE.Vector3, quaternion: THREE.Quaternion, blend: number): boolean {
    const slot = this.slots.find(candidate => candidate.simId === simId && candidate.status === 'grounded');
    if (!slot) return false;
    slot.inHand ??= { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), blend: 0 };
    slot.inHand.position.copy(position); slot.inHand.quaternion.copy(quaternion);
    slot.inHand.blend = THREE.MathUtils.clamp(blend, 0, 1);
    return true;
  }

  /**
   * The hunter's hand is reaching for this bird in the dog's mouth. A claimed
   * bird survives the dog's give until the hand has it; dropping the claim
   * before then leaves it with the dog.
   */
  claimForHand(simId: number, claimed: boolean): void {
    for (const slot of this.slots) if (slot.simId === simId && slot.status === 'grounded') slot.handClaim = claimed || undefined;
  }

  /** Stowed in the game bag: the bird leaves the scene. */
  releaseFromHand(simId: number): void {
    for (const slot of this.slots) {
      if (slot.simId !== simId || (!slot.inHand && !slot.handClaim)) continue;
      slot.inHand = undefined; slot.handClaim = undefined;
      slot.status = 'done';
      slot.root.visible = false;
    }
  }

  groundedTarget(simId: number, out: THREE.Vector3): boolean {
    const slot = this.slots.find(candidate => candidate.simId === simId && candidate.status === 'grounded');
    if (!slot) return false;
    this.sampleFlightPosition(slot, this.renderedPhase, out);
    return true;
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
      r = Math.max(1e-4, this.burstRadius * grow * settle * shake);
    }
    out.r = r;
  }

  /** Read-only effect budget and actual launch count for field review. */
  launchCoverAudit(): { launches: number; visible: number; capacity: number } | null {
    return this.launchCover?.audit() ?? null;
  }

  /* ------------------------------ render ----------------------------- */

  private flightPresentationPhase(alpha = 1): number {
    return this.frozen ? 1 : THREE.MathUtils.clamp(alpha, 0, 1);
  }

  private rememberFlightPosition(slot: Slot): void {
    slot.previousX = slot.x; slot.previousY = slot.y; slot.previousZ = slot.z;
    slot.previousAirMs = slot.airMs;
  }

  private sampleFlightPosition<T extends { x: number; y: number; z: number }>(slot: Slot, phase: number, out: T): T {
    out.x = THREE.MathUtils.lerp(slot.previousX ?? slot.x, slot.x, phase);
    out.y = THREE.MathUtils.lerp(slot.previousY ?? slot.y, slot.y, phase);
    out.z = THREE.MathUtils.lerp(slot.previousZ ?? slot.z, slot.z, phase);
    return out;
  }

  /** A restrained bank into the line's turns on the fixed clock: a rooster
   * leaning into its swing, a sharptail tipping through its long curls. */
  private updateBank(slot: Slot, dt: number): void {
    if (dt <= 0) return;
    const yaw = Math.atan2(slot.vxW, slot.vzW);
    const turn = slot.bankYaw === undefined ? 0
      : Math.atan2(Math.sin(yaw - slot.bankYaw), Math.cos(yaw - slot.bankYaw)) / dt;
    const limit = slot.species.id === 'ringneck' ? .35 : slot.line?.family === 'grouse' ? .5 : .3;
    const target = THREE.MathUtils.clamp(-Math.atan2(Math.hypot(slot.vxW, slot.vzW) * turn, 9.81) * .65, -limit, limit);
    slot.bank = THREE.MathUtils.lerp(slot.bank ?? 0, target, 1 - Math.exp(-dt * 5));
    slot.bankYaw = yaw;
  }

  /**
   * Is this bird in the hunter's sight? In his view (the screen, with the
   * corner of his eye), within marking range, and not behind the land or the
   * standing cover between him and it. Tiny on a phone or not: a hunter's
   * eye follows a bird down far past what the screen can draw.
   */
  private sees(slot: Slot): boolean {
    const camera = this.listener as THREE.PerspectiveCamera | undefined;
    if (!camera?.isPerspectiveCamera) return false;
    const eye = camera.position;
    if (Math.hypot(slot.x - eye.x, slot.z - eye.z) > MARK_RANGE_M) return false;
    const p = this.sightProbe.set(slot.x, slot.y, slot.z).project(camera);
    if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return false;
    return this.clearSight(eye, slot.x, slot.y, slot.z);
  }

  /** Nothing between the eye and a point: not the land, and past the cover
   * he stands in, not the crown of the standing cover. */
  private clearSight(eye: THREE.Vector3Like, x: number, y: number, z: number): boolean {
    const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, length = Math.hypot(dx, dz);
    const crown = this.coverCrownAt();
    for (let s = 2; s < length - .6; s += Math.max(1.2, length / 80)) {
      const k = s / length, px = eye.x + dx * k, pz = eye.z + dz * k, py = eye.y + dy * k;
      const ground = this.terrain.heightAt(px, pz);
      if (py < ground) return false;
      if (s > 6 && py < ground + crown(px, pz)) return false;
    }
    return true;
  }

  /** The standing cover's crown height sampler for this ground: the cover
   * system's own where it has one; sand plum thickets on the Red Plains,
   * from the same plum runs the thickets grow on; grass elsewhere. */
  private coverCrownAt(): (x: number, z: number) => number {
    if (this.coverCrown) return this.coverCrown;
    let cover: { launchHeightAt?(x: number, z: number): number } | undefined;
    try { cover = this.coverCtx?.get('grass') as typeof cover; } catch { cover = undefined; }
    const area = this.hunt.areaConfig();
    let crown: (x: number, z: number) => number;
    if (cover?.launchHeightAt) crown = (x, z) => cover!.launchHeightAt!(x, z);
    else if (area.id === 'quail-fields' && this.hunt.worldToSim) {
      crown = (x, z) => {
        const at = this.hunt.worldToSim(x, z, this.simPoint);
        const plum = quailPlumAt(at.x, at.y) * quailCoverAt(area, at.x, at.y);
        return plum > .35 ? 1.7 : plum > .15 ? 1 : .45;
      };
    } else crown = () => .4;
    // The cover never moves: remember it on a 2 m grid.
    const memo = new Map<number, number>();
    this.coverCrown = (x, z) => {
      const key = Math.round(x / 2) * 65536 + Math.round(z / 2);
      let height = memo.get(key);
      if (height === undefined) {
        if (memo.size > 200_000) memo.clear();
        height = crown(Math.round(x / 2) * 2, Math.round(z / 2) * 2); memo.set(key, height);
      }
      return height;
    };
    return this.coverCrown;
  }

  /**
   * Birds before the flush (game/sightings.ts). Shown birds follow their
   * hidden birds over the ground every tick, striding as they go; every half
   * second the shown ones are checked (still in sight, still out of cover)
   * and, when the clock allows, the birds in reach are looked over for a new
   * sighting: one group at a time, rare by design.
   */
  private stepSightings(simBirds: readonly SimLaunchBird[], dtMs: number): void {
    for (const [id, slot] of this.sightShown) {
      const bird = simBirds.find(candidate => candidate.id === id);
      if (!bird || bird.state !== 'hidden') { this.hideSighting(id); continue; }
      this.hunt.simToWorld(bird.pos.x, bird.pos.y, this.w2);
      const dx = this.w2.x - slot.x, dz = this.w2.z - slot.z, d = Math.hypot(dx, dz);
      slot.running = d > 1e-3 && this.sightClock.current?.kind !== 'skyline';
      if (slot.running) { slot.runYaw = Math.atan2(dx, dz); slot.stride = ((slot.stride ?? 0) + d / strideLength(slot.species.id) * Math.PI) % (Math.PI * 2); }
      slot.x = this.w2.x; slot.z = this.w2.z; slot.y = this.drawnGround(slot.x, slot.z) + .02;
    }
    if (this.sightClock.current && this.sightShown.size === 0) this.sightClock.end(this.fieldMs);
    if ((this.fieldMs / dtMs | 0) % 15 !== 0) return;
    const camera = this.listener as THREE.PerspectiveCamera | undefined;
    if (!camera?.isPerspectiveCamera) return;
    const eye = camera.position, hunterGround = this.terrain.heightAt(eye.x, eye.z), dawn = this.tod === 'dawn';
    const candidates = new Map<number, SightingCandidate>();
    for (const bird of simBirds) {
      if (bird.state !== 'hidden' || !SIGHT_SPECIES.has(bird.speciesId)) continue;
      this.hunt.simToWorld(bird.pos.x, bird.pos.y, this.sightProbe2);
      const range = Math.hypot(this.sightProbe2.x - eye.x, this.sightProbe2.z - eye.z);
      if (range > SIGHT_LOOK_M) { this.sightPrev.delete(bird.id); continue; }
      candidates.set(bird.id, this.sightingCandidate(bird, this.sightProbe2.x, this.sightProbe2.z, range, eye, hunterGround));
    }
    const active = this.sightClock.current;
    if (active) {
      for (const id of [...this.sightShown.keys()]) {
        const seen = candidates.get(id);
        if (!seen || !sightingHolds(seen, active.kind)) this.hideSighting(id);
      }
      if (this.sightShown.size === 0 || this.sightClock.expired(this.fieldMs)) {
        for (const id of [...this.sightShown.keys()]) this.hideSighting(id);
        this.sightClock.end(this.fieldMs);
      }
      return;
    }
    if (this.riseActive || !this.sightClock.mayBegin(this.fieldMs)) return;
    const ordered = [...candidates.values()].sort((a, b) => a.range - b.range);
    for (const first of ordered) {
      const kind = sightingKind(first, dawn);
      if (!kind) continue;
      // The group: this bird and any of its covey that read the same way.
      const group = ordered.filter(bird => bird.coveyId === first.coveyId && sightingKind(bird, dawn) === kind).slice(0, SIGHT_POOL);
      for (const bird of group) this.showSighting(simBirds.find(candidate => candidate.id === bird.id)!, bird, kind);
      this.sightClock.begin(kind, first.coveyId, this.fieldMs);
      return;
    }
  }

  /** What the hunter could know of a hidden bird for a sighting, and how it moved since the last look. */
  private sightingCandidate(bird: SimLaunchBird, x: number, z: number, range: number, eye: THREE.Vector3, hunterGround: number): SightingCandidate {
    const ground = this.drawnGround(x, z), prev = this.sightPrev.get(bird.id);
    this.sightPrev.set(bird.id, { x, z, ground });
    const area = this.hunt.areaConfig();
    const crown = this.coverCrownAt()(x, z);
    const habitat = area.id === 'chukar-ridge' ? habitatClassAt(area, bird.pos.x, bird.pos.y) : null;
    const open = habitat ? CHUKAR_OPEN.has(habitat) : crown < SIGHT_COVER_M;
    let trackM = Infinity;
    for (const trail of area.trails ?? []) for (let i = 1; i < trail.points.length; i++) {
      const a = trail.points[i - 1], b = trail.points[i], abx = b.x - a.x, aby = b.y - a.y, l2 = abx * abx + aby * aby || 1;
      const t = Math.max(0, Math.min(1, ((bird.pos.x - a.x) * abx + (bird.pos.y - a.y) * aby) / l2));
      trackM = Math.min(trackM, Math.hypot(bird.pos.x - a.x - abx * t, bird.pos.y - a.y - aby * t) * .9144);
    }
    const head = ground + .35;
    const p = this.sightProbe.set(x, head, z).project(this.listener as THREE.PerspectiveCamera);
    const inView = p.z < 1 && p.z > -1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
    const ring = [0, 1, 2, 3, 4, 5, 6, 7].filter(k => this.terrain.heightAt(x + Math.cos(k * Math.PI / 4) * 20, z + Math.sin(k * Math.PI / 4) * 20) < ground - .5).length;
    return { id: bird.id, coveyId: bird.coveyId ?? bird.id, speciesId: bird.speciesId, sex: bird.sex, x, z, ground,
      moved: prev ? Math.hypot(x - prev.x, z - prev.z) : 0, climbed: prev ? ground - prev.ground : 0,
      range, hunterGround, crown, open, trackM,
      inSight: inView && this.clearSight(eye, x, head, z),
      skyBehind: skyBehind(eye, { x, y: head, z }, (gx, gz) => this.terrain.heightAt(gx, gz)), onCrest: ring >= 6 };
  }

  private showSighting(bird: SimLaunchBird, seen: SightingCandidate, kind: SightingKind): void {
    const slot = this.sightSlots.find(candidate => !candidate.root.visible);
    if (!slot) return;
    this.applySpeciesAppearance(slot, getSpecies(bird.speciesId), bird.sex);
    slot.simId = bird.id; slot.status = 'grounded';
    slot.x = seen.x; slot.z = seen.z; slot.y = seen.ground + .02;
    slot.running = kind !== 'skyline'; slot.stride = 0;
    // A crest bird looks out over the country; a runner faces where it goes.
    slot.runYaw = kind === 'skyline' ? Math.atan2(slot.x - (this.listener?.position.x ?? 0), slot.z - (this.listener?.position.z ?? 0)) + (bird.id % 5 - 2) * .5 : slot.runYaw ?? 0;
    slot.root.visible = true;
    this.sightShown.set(bird.id, slot);
  }

  private hideSighting(id: number): void {
    const slot = this.sightShown.get(id);
    if (slot) { slot.root.visible = false; slot.status = 'idle'; slot.running = false; }
    this.sightShown.delete(id);
  }

  /** Sign on the ground near some coveys, where they are, on open ground
   * only (groundSign.ts). Laid once the cover is up, on the first tick. */
  private laySign(): void {
    this.signLaid = true;
    if (!this.sceneRef || this.hunt.training || !this.hunt.coverPatches) return;
    const area = this.hunt.areaConfig(), byCovey = new Map<number, SimLaunchBird[]>();
    for (const bird of this.hunt.huntState().birds) if (bird.state === 'hidden') byCovey.set(bird.coveyId, [...(byCovey.get(bird.coveyId) ?? []), bird]);
    const coveys: SignCovey[] = [];
    for (const covey of byCovey.values()) {
      const x = covey.reduce((sum, b) => sum + b.pos.x, 0) / covey.length, y = covey.reduce((sum, b) => sum + b.pos.y, 0) / covey.length;
      const world = this.hunt.simToWorld(x, y, { x: 0, z: 0 });
      let track: SignCovey['track'];
      if (covey[0].speciesId === 'ringneck') {
        let best = 25 / .9144;
        for (const trail of area.trails ?? []) for (let i = 1; i < trail.points.length; i++) {
          const a = trail.points[i - 1], b = trail.points[i], abx = b.x - a.x, aby = b.y - a.y, l2 = abx * abx + aby * aby || 1;
          const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / l2)), px = a.x + abx * t, py = a.y + aby * t;
          const d = Math.hypot(x - px, y - py);
          if (d < best) { best = d; const w = this.hunt.simToWorld(px, py, { x: 0, z: 0 }); track = { x: w.x, z: w.z, heading: Math.atan2(aby, abx) }; }
        }
      }
      coveys.push({ speciesId: covey[0].speciesId, sex: covey.find(b => b.sex === 'rooster') ? 'rooster' : covey[0].sex, x: world.x, z: world.z, track });
    }
    const crown = this.coverCrownAt();
    const open = (x: number, z: number) => {
      if (crown(x, z) >= .5) return false;
      if (area.id !== 'chukar-ridge' || !this.hunt.worldToSim) return true;
      const at = this.hunt.worldToSim(x, z, this.simPoint);
      return CHUKAR_OPEN.has(habitatClassAt(area, at.x, at.y) ?? '');
    };
    this.sign = new GroundSign(coveys, this.riseSeed, (x, z) => this.terrain.heightAt(x, z), open);
    this.sceneRef.add(this.sign.mesh);
  }

  /** A shown ground bird, posed: running with its legs in stride, or standing up on a crest. */
  private poseSighting(slot: Slot, camera: THREE.Vector3 | undefined): void {
    slot.root.position.set(slot.x, slot.y, slot.z);
    const range = camera ? Math.hypot(slot.x - camera.x, slot.y - camera.y, slot.z - camera.z) : 0;
    const reference = this.speciesGeos.get('bobwhite')?.spanM;
    const fov = (this.listener as THREE.PerspectiveCamera | undefined)?.fov ?? 70;
    // Seen far off on the ground it is drawn large enough to read, as a flying bird is.
    const boost = reference && range > 0 ? Math.max(1, SIGHT_FLOOR_PX / (reference * restingBirdScale('quail') * this.viewHeight()
      / (2 * Math.tan(fov * Math.PI / 360) * range))) : 1;
    slot.root.scale.setScalar(restingBirdScale(birdFamilyFor(slot.species.id)) * slot.visualScale * boost);
    if (slot.running) { this.poseRunner(slot); return; }
    slot.root.rotation.set(-.3, slot.runYaw ?? 0, 0, 'YXZ');
    this.foldWings(slot);
    if (slot.legMeshR) slot.legMeshR.visible = false;
    if (slot.legMesh) { slot.legMesh.visible = true; slot.legMesh.rotation.set(.3, 0, 0); }
  }

  /** A bird on the ground running: head down, low, its legs striding in turn, body bobbing and rocking. */
  private poseRunner(s: Slot): void {
    const stride = s.stride ?? 0, step = Math.sin(stride);
    s.root.rotation.set(.14 + .05 * Math.sin(stride * 2), s.runYaw ?? 0, .06 * step, 'YXZ');
    s.root.position.y += Math.abs(Math.cos(stride)) * .018 * s.visualScale;
    this.foldWings(s);
    const geometry = this.speciesGeos.get(`${s.species.id}${s.sex === 'hen' ? ':hen' : ''}`) ?? this.speciesGeos.get(s.species.id);
    if (s.legMesh && s.legMeshR && geometry?.legL && geometry.legR) {
      s.legMesh.geometry = geometry.legL; s.legMeshR.geometry = geometry.legR;
      s.legMesh.visible = s.legMeshR.visible = true;
      s.legMesh.rotation.set(.75 * step, 0, 0); s.legMeshR.rotation.set(-.75 * step, 0, 0);
    }
  }

  /**
   * A miss set down. If the hunter watched it go in, he marks it: where it
   * touched down if he saw it to the ground, else where its glide was taking
   * it when the cover hid it (marks.ts glideMark); only a bird the field keeps
   * there to hunt (marks.ts landingHolds), and never a relit single's last
   * escape.
   */
  private markLanding(slot: Slot, landing: { x: number; z: number }, landed = true): void {
    // (A bird still gliding in may already be relit where it is going: the
    // rise settles without waiting for birds out of the shot.)
    if (slot.launchedSingle) return;
    const seen = slot.sighted && this.fieldMs - slot.sighted.ms <= MARK_SIGHT_MS ? slot.sighted : undefined;
    const sailed = slot.sailed && this.fieldMs - slot.sailed.ms <= MARK_SAIL_MS ? slot.sailed : undefined;
    if (!seen && !sailed) return;
    const area = this.hunt.areaConfig();
    const at = this.hunt.worldToSim?.(landing.x, landing.z, { x: 0, y: 0 });
    if (!at || !landingHolds(slot.species.id, at, area.world, area.patches, slot.circling)) return;
    const toGround = landed && !!seen && this.fieldMs - seen.ms <= 70;
    // Into a stand of cover he did not see it touch down in: he marks it
    // where it went in, at the stand's edge on its line ("he went in by that
    // point of cattails"). In the open, where its glide was taking it, or by
    // its sail, the spot it was sailing for.
    const stand = toGround ? undefined : this.standAround(landing);
    const from = sailed ?? seen!;
    const spot = toGround ? { x: slot.x, z: slot.z } : stand ? edgeOfCover(from, landing, stand)
      : seen ? { x: seen.goingX, z: seen.goingZ } : { x: landing.x, z: landing.z };
    const mark = this.markBook.add(slot.simId, spot, Math.atan2(slot.vzW, slot.vxW), slot.species.id, toGround, this.fieldMs,
      { covey: !!slot.circling, edge: !!stand, sex: slot.sex });
    this.coverEvents?.dispatchEvent(new CustomEvent('hunt-mark', { detail: mark }));
  }

  /** The stand of cover (a cover patch, world metres) a landing spot is in, if any. */
  private standAround(spot: { x: number; z: number }): { cx: number; cz: number; hx: number; hz: number } | undefined {
    return this.hunt.coverPatches?.().find(p => Math.abs(spot.x - p.cx) <= p.hx && Math.abs(spot.z - p.cz) <= p.hz);
  }

  /**
   * Does this Hun covey circle back? The simulation's rule (game/huntSimulation
   * finishRise): a Hun covey that flushed wild, beyond the gun, on a ground
   * whose doctrine allows it. The presentation flies the loop and sets it down.
   */
  private circlesBack(covey: readonly SimLaunchBird[], speciesId: string): boolean {
    if (speciesId !== 'hun' || !huntingDoctrine(this.hunt.areaConfig().id).circleBack) return false;
    if (!covey.every(bird => bird.speciesId === 'hun' && !bird.single && !bird.circled)) return false;
    const info = this.hunt.lastFlushInfo?.();
    const boots = this.hunt.huntState().hunterPos;
    const distance = info && covey.some(bird => info.ids.includes(bird.id)) ? info.distPx
      : Math.min(...covey.map(bird => Math.hypot(bird.pos.x - boots.x, bird.pos.y - boots.y)));
    return distance > HUNT_SHOT_RANGE;
  }

  /**
   * Where a miss may set down: inside the property with room to spare, clear
   * of rock, trees, buildings and ponds (every collision circle the hunter
   * and dog respect), on ground a dog can climb, and dry.
   */
  private readonly landable = (x: number, z: number): boolean => {
    const world = this.hunt.areaConfig().world;
    if (world && this.hunt.worldToSim) {
      const at = this.hunt.worldToSim(x, z, this.simPoint);
      if (at.x < world.x + LANDING_MARGIN_PX || at.x > world.x + world.w - LANDING_MARGIN_PX
        || at.y < world.y + LANDING_MARGIN_PX || at.y > world.y + world.h - LANDING_MARGIN_PX) return false;
    }
    // The canyon's rimrock, from the land itself (so a headless hunt knows it too).
    if (this.hunt.rockAtWorld?.(x, z)) return false;
    for (const circle of this.landingObstacles().nearby(x, z, LANDING_CLEARANCE_M)) {
      if ((x - circle.x) ** 2 + (z - circle.y) ** 2 < (circle.radius + LANDING_CLEARANCE_M) ** 2) return false;
    }
    const h = (dx: number, dz: number) => this.terrain.heightAt(x + dx, z + dz);
    if (Math.hypot(h(1, 0) - h(-1, 0), h(0, 1) - h(0, -1)) / 2 > LANDING_GRADE) return false;
    return this.fallSurface(x, z) !== 'water';
  };

  /** Every collision circle a landing keeps clear of, indexed (world x, z as
   * x, y): the canyon alone has some 1,400 rim blocks. */
  private landingObstacles(): ObstacleIndex {
    if (this.landingObstacleIndex) return this.landingObstacleIndex;
    const circles: { x: number; y: number; radius: number }[] = [];
    for (const id of LANDING_OBSTACLE_SOURCES) {
      let provider: { collisionCircles?: () => readonly { x: number; z: number; radius: number }[] } | undefined;
      try { provider = this.obstacleCtx?.get(id) as typeof provider; } catch { continue; }
      for (const circle of provider?.collisionCircles?.() ?? []) circles.push({ x: circle.x, y: circle.z, radius: circle.radius });
    }
    const index = new ObstacleIndex(circles, 16);
    // Kept once the world has built its obstacles; asked again until then.
    if (circles.length) this.landingObstacleIndex = index;
    return index;
  }

  /** The wings as the shot found them: the fold eases in from here. */
  private beginCollapse(slot: Slot): void {
    if (!slot.wingL || !slot.wingR) return;
    slot.collapseFrom = { left: slot.wingL.quaternion.clone(), right: slot.wingR.quaternion.clone(), ms: slot.airMs };
  }

  /** What a falling bird strikes here: water, cattails and heavy reeds, or ground. */
  private fallSurface(x: number, z: number): ImpactSurface {
    for (const pond of this.ponds ?? (this.ponds = this.findPonds())) {
      if (((x - pond.x) / pond.rx) ** 2 + ((z - pond.z) / pond.rz) ** 2 <= 1) return 'water';
    }
    const ground = this.hunt.surfaceAtWorld?.(x, z, this.groundSample);
    return impactSurface(0, ground);
  }

  /** Standing water a bird can fall into, world metres (the Cattail Coverts' sloughs). */
  private findPonds(): { x: number; z: number; rx: number; rz: number }[] {
    const area = this.hunt.areaConfig();
    if (area.id !== 'pheasant-coverts') return [];
    return (area.landmarks ?? []).filter(landmark => landmark.kind === 'pond').map(landmark => {
      const at = this.hunt.simToWorld(landmark.position.x, landmark.position.y, { x: 0, z: 0 });
      const { rx, rz } = pheasantPondRadii(landmark.id);
      return { x: at.x, z: at.z, rx: rx * .92, rz: rz * .92 };
    });
  }

  /**
   * A shot bird striking the ground: dust and stems off open ground, seed
   * fluff out of cattails, water thrown up, sized for the range as the bird
   * is; and its thump (or swish, or splash) heard late at range, from where
   * it fell.
   */
  private strike(slot: Slot, surface: ImpactSurface): void {
    const enlarge = this.flightScale(slot.species.id, slot) / restingBirdScale(birdFamilyFor(slot.species.id));
    const seed = (Math.imul(slot.simId + 1, 0x9e3779b1) ^ Math.imul(this.riseSeq + 7, 0x85ebca6b)) >>> 0;
    this.eruption?.impact({ x: slot.x, z: slot.z }, surface, enlarge, seed);
    if (surface !== 'water') {
      this.coverEvents?.dispatchEvent(new CustomEvent('bird-cover-disturbance', { detail: {
        x: slot.x, z: slot.z, radius: surface === 'reeds' ? 1.6 : .8, intensity: surface === 'reeds' ? .8 : .4 } }));
    }
    const offset = new THREE.Vector3(slot.x, slot.y, slot.z);
    if (this.listener) offset.sub(this.listener.position).applyQuaternion(this.listener.quaternion.clone().invert());
    else offset.sub(new THREE.Vector3(this.hunterX, 0, this.hunterZ));
    if (this.frozen) {
      // Capture: no sound, but the review reads when the thump would arrive.
      this.strikeLog.push({ simId: slot.simId, fieldMs: Math.round(this.fieldMs), surface, rangeM: +offset.length().toFixed(1),
        thumpDelayMs: Math.round(fallSoundDelay(offset.length()) * 1000), x: slot.x, z: slot.z });
      return;
    }
    playFall(surface, fallWeight(slot.species.id), offset.length(), offset, seed);
  }

  /** Dead weight tumbling from the pose it folded in. */
  private poseFalling(slot: Slot): void {
    const fall = slot.fallPose!;
    const t = Math.max(0, slot.airMs - fall.startMs) / 1000;
    slot.root.rotation.copy(fall.rotation);
    slot.root.rotation.x += t * tumbleRate(birdFamilyFor(slot.species.id));
    slot.root.rotation.z += t * .65;
  }

  /**
   * A wing-tipped bird: the broken wing folds on the inside of the turn,
   * the other still beats, and the body rolls toward the broken side as it
   * corkscrews down.
   */
  private poseSpiral(slot: Slot, reaction: HitReaction, wingMs: number): void {
    const t = Math.max(0, wingMs - reaction.startMs) / 1000;
    const turn = Math.sign(reaction.spin) || 1;
    slot.root.rotation.order = 'YXZ';
    slot.root.rotation.set(.22, reaction.yaw + reaction.spin * t, -turn * .7);
    this.foldWings(slot);
    // The model's +X wing (wingR) is the bird's left: inside a left turn.
    const beating = turn > 0 ? slot.wingL : slot.wingR, mesh = turn > 0 ? slot.wingLMesh : slot.wingRMesh;
    const hz = Math.min(7.5, shownWingHz(slot.species.flight.flapRate ?? 14) * 1.15);
    const angle = .2 + Math.sin(t * hz * Math.PI * 2 + slot.wobblePh) * .62;
    beating.rotation.set(0, 0, turn > 0 ? -angle : angle);
    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[0] = 0;
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
    } else if (slot.species.id === 'chukar') {
      poseChukarFoldedWings(slot.wingL, slot.wingR);
    } else if (slot.species.id === 'hun') {
      poseHunFoldedWings(slot.wingL, slot.wingR);
    } else if (slot.species.id === 'prairie-chicken') {
      posePrairieChickenFoldedWings(slot.wingL, slot.wingR);
    } else if (this.refinedQuail && slot.species.id === 'bobwhite') {
      poseBobwhiteFoldedWings(slot.wingL, slot.wingR);
    } else {
      slot.wingL.rotation.set(0, 0.9, -1.35, 'XYZ');
      slot.wingR.rotation.set(0, -0.9, 1.35, 'XYZ');
    }
  }

  update(ctx: Ctx, _dt: number): void {
    this.launchCover?.render();
    this.eruption?.render();
    this.renderedPhase = this.flightPresentationPhase(ctx.fixedAlpha);
    for (const s of this.sightSlots) if (s.root.visible) this.poseSighting(s, ctx.camera?.position ?? this.listener?.position);
    const simBirds = this.hunt.huntState().birds;
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (s.launchSound) {
        if (!s.launchSound.active) s.launchSound = undefined;
        else if (!this.frozen) {
          this.sampleFlightPosition(s, this.renderedPhase, this.soundOffset).sub(ctx.camera.position);
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
      const visible = s.status === 'flying' || s.status === 'departing' || s.status === 'falling' || s.status === 'grounded';
      s.root.visible = visible;
      if (!visible) continue;
      s.body.scale.set(1, 1, 1);
      if (s.species.id === 'ringneck' && s.body.morphTargetInfluences) {
        s.body.morphTargetInfluences[0] = s.status === 'grounded' ? s.running ? 0 : 1
          : s.status === 'falling' ? THREE.MathUtils.smoothstep(s.airMs - (s.fallPose?.startMs ?? s.airMs), 0, 300) : 0;
      }
      if (s.status === 'grounded' && s.inHand) {
        // Taken from the dog's mouth: cradled in the glove, wings folded,
        // legs hanging, easing from the mouth's grip into the hand's.
        s.root.position.copy(s.inHand.position);
        s.root.quaternion.slerp(s.inHand.quaternion, s.inHand.blend);
        s.root.scale.setScalar(restingBirdScale(birdFamilyFor(s.species.id)) * s.visualScale);
        this.foldWings(s);
        poseCarriedBird(s, 1, s.carryPose?.elapsed ?? 1, false);
        if (s.legMesh) { s.legMesh.rotation.x = 1.45; s.legMesh.visible = s.species.id === 'ringneck'; }
        if (s.tailMesh?.morphTargetInfluences) s.tailMesh.morphTargetInfluences[0] = 0;
        continue;
      }
      const simBird = s.status === 'grounded'
        ? simBirds.find((candidate) => candidate.id === s.simId)
        : undefined;
      // Given to the hunter this frame, before his hand has it: hold still.
      if (s.handClaim && simBird?.state !== 'carried') continue;
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
          const visual = ctx.get<Subsystem & { mouthWorld?: (out: THREE.Vector3) => boolean }>(dogRendererId(carrierSlot));
          visual.mouthWorld?.(s.root.position);
          s.carryPose ??= { elapsed: 0, rotation: s.root.quaternion.clone() };
          s.carryPose.elapsed += Math.max(0, _dt);
          const presence = THREE.MathUtils.smoothstep(s.carryPose.elapsed, 0, .22);
          s.root.scale.setScalar(restingBirdScale(birdFamilyFor(s.species.id)) * s.visualScale);
          // The mouth is the fixed grip. The relaxed crosswise pose settles
          // during pickup without moving the bird away from that attachment.
          s.root.rotation.set(.10, dogYaw + Math.PI / 2, .24, 'YXZ');
          s.root.quaternion.slerp(s.carryPose.rotation, 1 - presence);
          this.foldWings(s);
          poseCarriedBird(s, presence, s.carryPose.elapsed, dog.gait !== 'still');
          if (s.legMesh) { s.legMesh.rotation.x = 1.3; s.legMesh.visible = s.species.id === 'ringneck'; }
          if (s.tailMesh?.morphTargetInfluences) s.tailMesh.morphTargetInfluences[0] = 0;
          continue;
        }
      }
      this.sampleFlightPosition(s, this.renderedPhase, s.root.position);
      // A towering or sailing hit bird still flies until it folds.
      const holding = s.status === 'falling' && !!s.reaction && !s.reaction.collapsed
        && (s.reaction.kind === 'tower' || s.reaction.kind === 'sail');
      let scale = s.status === 'grounded' ? restingBirdScale(birdFamilyFor(s.species.id))
        : this.flightScale(s.species.id, s.root.position, ctx.camera?.position ?? this.listener?.position);
      if (s.status === 'falling') {
        const height = s.y - this.terrain.heightAt(s.x, s.z);
        // Resolve the airborne readability enlargement before touchdown,
        // rather than changing size when the dog takes the bird into its grip.
        scale = THREE.MathUtils.lerp(restingBirdScale(birdFamilyFor(s.species.id)), scale, THREE.MathUtils.smoothstep(height, .06, 2));
      }
      s.root.scale.setScalar(scale * s.visualScale);
      if (s.tailMesh?.visible) {
        const flying = s.status === 'flying';
        const settle = Math.exp(-s.airMs / 650);
        s.tailMesh.rotation.x = flying ? -.13 * settle + .025 * Math.sin(s.airMs * .009) : .08;
        s.tailMesh.rotation.y = flying ? .045 * Math.sin(s.airMs * .005 + s.wobblePh) : 0;
        if (s.tailMesh.morphTargetInfluences) s.tailMesh.morphTargetInfluences[0] =
          flying ? pheasantTailFan(s.airMs, s.gliding) : s.status === 'falling' ? .6 : 0;
      }
      if (s.legMesh && s.species.id !== 'ringneck') {
        // Other species fly with their legs tucked in the body's own shape:
        // the legs show on the jump, dropped on a body hit, trailing in a
        // fall and under a running cripple.
        s.legMesh.visible = s.status === 'flying' ? s.airMs < LEGS_TUCKED_MS
          : holding || s.status === 'falling' || (s.status === 'grounded' && !!s.running);
      }
      if (s.legMesh?.visible) {
        // Legs hang as the bird jumps, tuck aft within the first strokes,
        // drop on a body hit (the tower and the sail), trail loose in a fall
        // and stand under a running cripple.
        s.legMesh.rotation.x = s.status === 'flying' ? pheasantLegTuck(s.airMs)
          : holding ? .12 : s.status === 'falling' ? .5 : s.status === 'grounded' && s.running ? 0 : 1.3;
      }
      if (s.status === 'grounded' && s.running) {
        // Head down, running low for the nearest cover.
        this.poseRunner(s);
        continue;
      }
      if (s.legMeshR?.visible) {
        // Standing or carried again: both legs back on the one mesh.
        s.legMeshR.visible = false;
        const geometry = this.speciesGeos.get(`${s.species.id}${s.sex === 'hen' ? ':hen' : ''}`) ?? this.speciesGeos.get(s.species.id);
        if (s.legMesh && geometry?.legs) s.legMesh.geometry = geometry.legs;
      }
      if (s.status === 'grounded') {
        // It lies on the ground as it is drawn here, whichever tiles the
        // camera's distance draws (terrain surfaceHeightAt), not on the
        // smooth heightfield the triangles sample.
        if (!s.hawkHeld) s.root.position.y = this.drawnGround(s.root.position.x, s.root.position.z) + .06;
        // Folded bird remains marked in the grass until the dog picks it up.
        if (s.fallPose) {
          this.poseFalling(s);
          this.restRotation.setFromEuler(this.fallEuler.set(0, s.fallPose.rotation.y, 1.2, 'YXZ'));
          s.root.quaternion.slerp(this.restRotation, THREE.MathUtils.smoothstep(s.fallPose.groundedMs ?? 0, 0, 260));
        } else s.root.rotation.set(0, s.root.rotation.y, 1.2);
        this.foldWings(s);
        continue;
      }
      if (s.status === 'falling' && s.reaction?.kind === 'spiral' && !s.reaction.collapsed) {
        this.poseSpiral(s, s.reaction, this.frozen ? s.airMs : THREE.MathUtils.lerp(s.previousAirMs ?? s.airMs, s.airMs, ctx.fixedAlpha ?? 1));
        continue;
      }
      if (s.status === 'falling' && !holding) {
        // Folded frame: the wings collapse in from where they were when the
        // shot took it, and it tumbles as a ball: dead weight.
        if (s.fallPose) this.poseFalling(s);
        else s.root.rotation.set(s.airMs * 0.001 * TUMBLE_RAD_PER_S, s.root.rotation.y, 0.5);
        this.foldWings(s);
        const collapse = s.collapseFrom ? THREE.MathUtils.smoothstep(s.airMs - s.collapseFrom.ms, 0, COLLAPSE_MS) : 1;
        if (s.collapseFrom && collapse < 1) {
          this.collapseTo.copy(s.wingL.quaternion); s.wingL.quaternion.copy(s.collapseFrom.left).slerp(this.collapseTo, collapse);
          this.collapseTo.copy(s.wingR.quaternion); s.wingR.quaternion.copy(s.collapseFrom.right).slerp(this.collapseTo, collapse);
        }
        // The body balls up; the bird's own scale (and so its hit centre) is untouched.
        const ball = fallBall(collapse);
        s.body.scale.set(ball.x, ball.y, ball.z);
        continue;
      }
      // A towering or sailing bird still flies: it takes the flight pose
      // below, beating up the tower or with its wings set for the sail.
      // Nose along the world velocity; pitch climbs with the burst and
      // flattens into the glide. The profile controls how much each species
      // climbs before it settles or leaves the readable envelope.
      const hSpeed = Math.hypot(s.vxW, s.vzW);
      const yaw = Math.atan2(s.vxW, s.vzW);
      const pitch = THREE.MathUtils.clamp(Math.atan2(s.vyW, Math.max(hSpeed, 0.3)), -0.5, 1.1);
      s.root.rotation.order = 'YXZ';
      s.root.rotation.set(-pitch * 0.85, yaw, s.bank ?? 0);
      if (s.species.id === 'sharptail' && !(holding && s.reaction?.kind === 'sail')) {
        // Render on the interpolated clock, not held 30Hz simulation poses.
        // Beat/glide phrasing changes only this species' mesh and morphs;
        // spatial velocities, clearance, glide state and hit center stay live.
        const wingMs = this.frozen ? s.airMs : THREE.MathUtils.lerp(s.previousAirMs ?? s.airMs, s.airMs, ctx.fixedAlpha ?? 1);
        const beat = sharptailWingbeat(wingMs / 1000, shownWingHz(s.species.flight.flapRate ?? 13),
          s.wobblePh * .35, s.line?.glideAt ?? .8);
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
      } else if (s.species.id === 'ringneck') {
        // A fast pheasant beat otherwise has only three held poses at the
        // 30 Hz simulation rate. Interpolate its visual clock at render
        // frequency; capture still samples the exact requested sim pose.
        const wingMs = this.frozen ? s.airMs : THREE.MathUtils.lerp(s.previousAirMs ?? s.airMs, s.airMs, ctx.fixedAlpha ?? 1);
        const beat = pheasantWingbeat(wingMs / 1000, shownWingHz(s.species.flight.flapRate ?? 14), s.species.flight.climb, s.wobblePh * .35);
        s.wingL.rotation.set(0, 0, -beat.angle);
        s.wingR.rotation.set(0, 0, beat.angle);
        s.wingLMesh.morphTargetInfluences![0] = beat.recovery;
        s.wingRMesh.morphTargetInfluences![0] = beat.recovery;
      } else {
        // Wings run on the render clock, at a beat a 30 fps screen can show
        // (birdIdentity.ts): a real 15-18 Hz beat strobes at three poses or
        // fewer. Interpolate the phase as well as the wing angle; flight and
        // hit centre stay on the fixed tick. Capture holds the exact tick pose.
        const hz = shownWingHz(s.species.flight.flapRate ?? 14);
        const wingMs = !this.frozen
          ? THREE.MathUtils.lerp(s.previousAirMs ?? s.airMs, s.airMs, ctx.fixedAlpha ?? 1) : s.airMs;
        const cycles = wingMs / 1000 * hz;
        const ph = Math.sin(cycles * Math.PI * 2 + s.wobblePh * 0.35);
        const beatAmplitude = 0.58 + s.species.flight.climb * 0.28 + (s.species.timber ? 0.06 : 0);
        const ang = .05 + ph * beatAmplitude;
        s.wingL.rotation.set(0, 0, -ang);
        s.wingR.rotation.set(0, 0, ang);
      }
    }

  }

  dispose(ctx: Ctx): void {
    this.lifetime.abort();
    this.stopLaunchSounds();
    this.coverEvents = undefined;
    this.launchCover?.dispose();
    this.eruption?.dispose();
    this.eruption = undefined;
    this.launchCover = undefined;
    for (const s of this.slots) ctx.scene.remove(s.root);
    for (const s of this.sightSlots) ctx.scene.remove(s.root);
    this.slots.length = 0; this.sightSlots.length = 0; this.sightShown.clear();
    if (this.sign) { ctx.scene.remove(this.sign.mesh); this.sign.dispose(); this.sign = undefined; }
    this.shotSamples.length = 0;
    if (this.featherPoints) ctx.scene.remove(this.featherPoints);
    this.loose?.dispose();
    this.loose = undefined;
    this.featherGeo?.dispose();
    this.featherMat?.dispose();
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    this.mat?.dispose();
    this.mat = undefined;
  }

  private stopLaunchSounds(): void {
    for (const slot of this.slots) { slot.launchSound?.stop(); slot.launchSound = undefined; }
  }
}
