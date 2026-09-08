import { DogObstacleMotion, type DogObstacle } from './dogObstacles';
import type { Bird } from './birds';
import {
  breakChance as breedBreakChance,
  creepChance as breedCreepChance,
  noseMult,
  pointPressure as breedPointPressure,
  rangeMult,
  speedMult,
  staminaMs as breedStaminaMs,
  windCraftTier,
  type BreedConfig,
} from './breeds';
import { FIELD_BOUNDS, type Rect } from './field';
import type { AreaTrail } from './areas';
import { clamp, dist, turnToward } from './math';
import type { RNG, Vec2 } from './types';
import { huntDoctrineForStyle, huntingDoctrine, type HuntStyle } from './huntDoctrine';

export type DogState =
  | 'marking'
  | 'quartering'
  | 'tracking'
  | 'pointing'
  | 'honoring'
  | 'retrieving'
  | 'recalled'
  | 'heel'
  | 'breaking';

/** Field presentation gait — set each tick by `update`, read by FieldScene. */
export type DogGait = 'run' | 'trot' | 'track' | 'still';

/**
 * The readable beats between open search and a finished point. This stays
 * inside the shared simulation so 2D and 3D present the same dog, timing,
 * bird target and outcome instead of running separate animation scripts.
 */
export type DogScentStage = 'none' | 'checking' | 'locating' | 'stalking' | 'locking';

export interface ScentApproachStyle {
  checkMs: number;
  locateMs: number;
  locateArc: number;
  locateCycles: number;
  locatePace: number;
  stalkPace: number;
  lockMs: number;
}

export const DOG_SPEED = 75; // base px/s while quartering, before breed multipliers
export const TRACKING_SPEED = 90; // base px/s once it has the scent
export const SCENT_RADIUS = 45; // base scent range, before nose multipliers
export const POINT_RANGE = 12; // freezes into a point this close
export const QUARTER_RANGE = 130; // base hunter-anchored quartering radius, × Range multiplier
export const WHISTLE_RANGE = 250; // the whistle only carries this far
export const HONOR_SIGHT = 150; // a dog this close to a packmate's point sees it and should honor

const WEAVE_AMPLITUDE = 0.7; // base radians of serpentine swing while quartering
const WEAVE_RATE = 2.2; // how fast the weave swings
const EDGE_MARGIN = 14;
const EDGE_TURN_RATE = 2.4; // rad/s pulled back toward the middle of the field
const AVOID_HUNTER_RADIUS = 28; // won't point a bird sitting right on the hunter
const RETRIEVE_RANGE = 6; // close enough to pick a downed bird up
const RETRIEVE_HOLD_MS = 700; // mouthing the bird takes a moment
const RETRIEVE_DELIVERY_HOLD_MS = 350; // settle at hand before casting off
const SEARCH_HOLD_MS = 2200; // extra time hunting for a fall it didn't mark
const RECALL_SPEED = 115; // px/s coming back to the whistle
const RECALL_ARRIVE = 10; // close enough to the hunter to count as arrived
const HEEL_FOLLOW = 14; // a heeled dog shadows the hunter this closely
const HEEL_RECOVER_MULT = 3; // stamina recovery rate at heel, × work drain
const BUMP_DISTANCE = 7; // creep this close and the bird is bumped
const CREEP_STEP_PX = 2;
const CREEP_INTERVAL_MS = 800;
const BREAKING_SPEED = 110;
const BREAKING_MS = 2500;
const BREAK_BUMP_RADIUS = 12;
const ANCHOR_TURN_RATE = 2.2; // rad/s pulled back toward the hunter past quartering range
const POINT_SETTLE_RANGE = POINT_RANGE + 1.5;
const SCENT_MEMORY_MULT = 1.35;

/**
 * Derive approach character from the breed facts we already tune. A steady,
 * mature dog takes a more deliberate check and settle; a loose, animated
 * searcher locates with quicker, wider casts. The interface stays small—new
 * breeds receive a coherent sequence from their existing profile.
 */
export function scentApproachStyle(breed: BreedConfig, level: number): ScentApproachStyle {
  const looseness = breed.motion.searchLooseness;
  const headFreedom = breed.motion.headFreedom;
  const maturity = clamp((level - 1) / 9, 0, 1);
  const steady = breed.stats.steadiness;
  return {
    checkMs: clamp(250 + steady * 28 + headFreedom * 45 - maturity * 45, 240, 440),
    locateMs: clamp(430 + (1 - looseness) * 300 + steady * 18 - maturity * 55, 420, 760),
    locateArc: 0.3 + looseness * 0.32,
    locateCycles: 1.05 + looseness * 0.75,
    locatePace: 0.46 + looseness * 0.12,
    stalkPace: 0.42 + (1 - looseness) * 0.12,
    lockMs: clamp(155 + steady * 27 - maturity * 25, 170, 300),
  };
}

// Cover work: a bird dog doesn't scramble open ground — it hunts objectives.
// Pick a likely patch, cast to it, work it until it feels checked, move on.
export const CAST_SPEED_MULT = 1.15; // purposeful trot on the way to cover
export const COVER_WORK_MS_PER_PX2 = 0.9; // base working time per px² of patch
export const COVER_WORK_MIN_MS = 2200;
export const COVER_WORK_MAX_MS = 10_000;
export const COVER_REVISIT_MS = 50_000; // a checked patch stays checked this long
const COVER_TURN_RATE = 3.2; // rad/s steering onto the cast line
const COVER_EDGE_MARGIN = 8; // stay inside the patch while working it
const COVER_GRACE = 9; // weave carrying the dog this far past the edge still counts as working
const COVER_WEAVE_MULT = 1.7; // busier, tighter serpentine inside cover
/** Perimeter lap speed while edge-working (fraction of perimeter per second). */
const COVER_EDGE_LAP_RATE = 0.35;
/**
 * How completely the dog checks cover before calling it empty, by level:
 * a first-season pup pops out of the ragweed early and leaves birds behind;
 * a finished dog combs it. Multiplies the patch's working time.
 */
export function coverThoroughness(level: number): number {
  return Math.min(1.25, 0.55 + 0.07 * level);
}

/**
 * Fraction of a patch's work budget spent on the perimeter before combing
 * the middle. Pups dive the core; finished dogs ring the edge first
 * (where runners hold and singles drop).
 * Level 1 → ~0; level 10 → ~0.45.
 */
export function coverEdgeFraction(level: number): number {
  return Math.min(0.48, Math.max(0, 0.05 * (level - 1)));
}

const rectCx = (r: Rect): number => r.x + r.w / 2;
const rectCy = (r: Rect): number => r.y + r.h / 2;
const rectContains = (r: Rect, p: Vec2): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Positive distance from an interior point to the nearest side (0 on the edge). */
function distToRectEdge(r: Rect, p: Vec2): number {
  return Math.min(p.x - r.x, r.x + r.w - p.x, p.y - r.y, r.y + r.h - p.y);
}

function distanceToTrail(point: Vec2, trails: readonly AreaTrail[]): number {
  let nearest = Infinity;
  for (const trail of trails) {
    for (let i = 1; i < trail.points.length; i++) {
      const a = trail.points[i - 1], b = trail.points[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      nearest = Math.min(nearest, Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t)));
    }
  }
  return nearest;
}

/**
 * Return the nearest point on an authored route. A route is a hunting aid,
 * not a teleport rail: the dog still aims for the cover patch, but a small
 * pull toward this point makes edge, wash, and contour work visible in its
 * cast instead of leaving the route as map-only decoration.
 */
function nearestTrailPoint(point: Vec2, trails: readonly AreaTrail[], maxDistance = 120): Vec2 | null {
  let nearest = Infinity;
  let result: Vec2 | null = null;
  for (const trail of trails) {
    for (let i = 1; i < trail.points.length; i++) {
      const a = trail.points[i - 1], b = trail.points[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < 1e-6) continue;
      const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
      const candidate = { x: a.x + dx * t, y: a.y + dy * t };
      const distance = dist(point, candidate);
      if (distance < nearest) {
        nearest = distance;
        result = candidate;
      }
    }
  }
  return nearest <= maxDistance ? result : null;
}

/** How strongly a property's physical route should shape a dog cast. */
function routeCastPull(style: HuntStyle, areaId?: string): number {
  // Shared styles still need property-specific route commitment. A wide
  // prairie dog should use the wind lane as a destination, while a Valley
  // Oaks dog should keep crossing from one shade island to the next. These
  // values shape the cast only; the authored cover and the sim remain the
  // source of truth for where a bird can actually be found.
  switch (areaId) {
    case 'sharptail-prairie': return 0.42; // long wind lanes and shelterbelts
    case 'valley-oaks': return 0.56; // shade-to-shade oak skirts
    case 'grouse-woods': return 0.38; // the next timber opening
    case 'woodcock-bottoms': return 0.5; // wet alder chain
    case 'mearns-canyons': return 0.44; // oak draw and rim return
    case 'timberline-parks': return 0.4; // park edge and timber fingers
    default: break;
  }
  switch (style) {
    case 'pheasant': return 0.56; // cattail edge, fence, and water line
    case 'desert-wash': return 0.62; // shade-to-water wash chain
    case 'bench-covey': return 0.48; // broad contour flank
    case 'chukar': return 0.44; // switchbacks before the uphill shelf
    case 'woods':
    case 'bottoms':
    case 'canyon':
    case 'alpine-edge':
    case 'oak-savanna': return 0.3; // openings, fingers, and shade islands
    case 'open-covey': return 0.24; // long grass lanes and shelterbelts
    case 'quail': return 0.16; // a light pull keeps plum edges readable
    default: return 0;
  }
}

/** Point on the rectangle perimeter at normalized progress t ∈ [0,1). Clockwise from top-left. */
export function perimeterPoint(r: Rect, t: number): Vec2 {
  const peri = 2 * (r.w + r.h);
  let d = (((t % 1) + 1) % 1) * peri;
  if (d <= r.w) return { x: r.x + d, y: r.y };
  d -= r.w;
  if (d <= r.h) return { x: r.x + r.w, y: r.y + d };
  d -= r.h;
  if (d <= r.w) return { x: r.x + r.w - d, y: r.y + r.h };
  d -= r.w;
  return { x: r.x, y: r.y + r.h - d };
}

/** Nearest perimeter parameter t for a point (for starting edge work). */
export function nearestPerimeterT(r: Rect, p: Vec2): number {
  const peri = 2 * (r.w + r.h);
  if (peri <= 0) return 0;
  // Clamp to rect, then project to closest edge.
  const cx = clamp(p.x, r.x, r.x + r.w);
  const cy = clamp(p.y, r.y, r.y + r.h);
  const dTop = Math.abs(cy - r.y);
  const dBot = Math.abs(cy - (r.y + r.h));
  const dLeft = Math.abs(cx - r.x);
  const dRight = Math.abs(cx - (r.x + r.w));
  const m = Math.min(dTop, dBot, dLeft, dRight);
  let along = 0;
  if (m === dTop) along = cx - r.x;
  else if (m === dRight) along = r.w + (cy - r.y);
  else if (m === dBot) along = r.w + r.h + (r.x + r.w - cx);
  else along = r.w + r.h + r.w + (r.y + r.h - cy);
  return along / peri;
}

/**
 * Where the dog aims when casting to a patch.
 * Tier 0 / calm: geometric center (classic).
 * Wind-craft > 0: downwind side of the patch so the dog approaches from
 * leeward and works into the wind through the cover.
 * `windAngle` is the direction the wind blows TOWARD (screen radians).
 */
export function castAimPoint(
  patch: Rect,
  windAngle: number | undefined,
  craftTier: 0 | 1 | 2,
): Vec2 {
  const cx = rectCx(patch);
  const cy = rectCy(patch);
  if (craftTier === 0 || windAngle === undefined) return { x: cx, y: cy };
  const dx = Math.cos(windAngle);
  const dy = Math.sin(windAngle);
  const halfW = patch.w / 2;
  const halfH = patch.h / 2;
  // Ray from center in the wind direction until it hits the rect edge.
  const sx = Math.abs(dx) < 1e-6 ? Infinity : halfW / Math.abs(dx);
  const sy = Math.abs(dy) < 1e-6 ? Infinity : halfH / Math.abs(dy);
  const s = Math.min(sx, sy) * 0.82; // slightly inside the downwind edge
  return { x: cx + dx * s, y: cy + dy * s };
}

/** Environment the dog is hunting in for this tick. */
export interface DogEnv {
  obstacles?: readonly DogObstacle[];
  hunterPos?: Vec2;
  /** Presentation-space pace multiplier; AI clocks still advance in real time. */
  movementScale?: number;
  /** Terrain travel ceiling in property units per second; AI clocks are unchanged. */
  maxTravelSpeed?: number;
  /** Optional working radius override in sim pixels. */
  rangeRadius?: number;
  /** Optional cast center, distinct from the hunter used by recall/scent rules. */
  workAnchor?: Vec2;
  /** Direction the wind blows TOWARD (radians, screen coords). Undefined = calm. */
  windAngle?: number;
  /** Wind-strength multiplier on scent reach (strong wind carries scent farther). */
  scentMult?: number;
  /** A whistle blast this tick. Never breaks a point or a retrieve. */
  recall?: boolean;
  /** How far the recall carries; GPS+map gear recalls at any range. */
  whistleRange?: number;
  /** Where a packmate stands on point — a finished dog stops and backs. */
  honorPoint?: Vec2;
  /** Conditions multiplier on stamina drain (hot dry days burn the dog). */
  drainMult?: number;
  /** Conditions multiplier on unmarked-fall search time (snow helps, rain hurts). */
  searchMult?: number;
  /** Cover patches in this covert — the dog hunts these as objectives. */
  patches?: Rect[];
  /** Authored hunting lines used to choose the next cover objective. */
  trails?: readonly AreaTrail[];
  /** Shared ground score so the dog chooses habitat that fits this property. */
  coverAffinity?: (point: Vec2) => number;
  /** Property hunting language, supplied by the shared adapter. */
  huntStyle?: HuntStyle;
  /** Exact property id; removes ambiguity when several maps share a style. */
  huntAreaId?: string;
  /** Uphill direction in screen/property coordinates for ridge work. */
  slopeAngle?: number;
}

export interface DogProfile {
  breed: BreedConfig;
  level: number;
  /** Age curve on the body (speed/stamina): growing pup <1, prime 1, old dog <1. The nose holds. */
  ageMult?: number;
}

/**
 * Base scent math: how far the dog smells a bird at dx, dy given wind.
 * +1 windDot = bird dead downwind (worst); -1 = dead upwind (best).
 */
export function scentRange(windAngle: number | undefined, dx: number, dy: number): number {
  if (windAngle === undefined) return SCENT_RADIUS;
  const d = Math.hypot(dx, dy);
  if (d === 0) return SCENT_RADIUS;
  const windDot = (dx * Math.cos(windAngle) + dy * Math.sin(windAngle)) / d;
  const mult = 1.125 - 0.775 * windDot; // 1.9x upwind .. 1.125x crosswind .. 0.35x downwind
  return SCENT_RADIUS * mult;
}

/**
 * Pure bird-dog AI. Behavior emerges from the breed/level profile: a level-1
 * Irish Setter and a level-10 Griffon are different animals. No Phaser in
 * here — feed it birds and a timestep, read back position and state.
 */
export class Dog {
  state: DogState = 'quartering';
  pointedBirdId: number | null = null;
  /** Base travel direction; the quartering weave oscillates around this. */
  heading: number;
  /** Set when the dog bumps a bird (creep or breaking); the scene flushes it wild. */
  bumpedBirdId: number | null = null;
  staminaMs: number;
  readonly maxStaminaMs: number;
  /** True after breaking chase: the next retrieve needs a search first. */
  needsSearch = false;
  /**
   * How the dog should animate this frame (run / cast-trot / track / still).
   * Pure presentation — does not affect sim math.
   */
  gait: DogGait = 'run';
  /** True for a brief beat when scent first hits — head up, freeze a step. */
  scentCheck = false;
  /** Close-timber scent approach pauses until the handler can follow. */
  waitingForHandler = false;
  /** Current shared search-to-point beat, consumed by both presentations. */
  scentStage: DogScentStage = 'none';
  /** Normalized progress through the current beat (distance-based for stalk). */
  scentProgress = 0;

  private rng: RNG;
  private weavePhase = 0;
  private retrieveTargetId: number | null = null;
  /** Bird reserved by this dog and visibly carried back to the handler. */
  carryingBirdId: number | null = null;
  private retrieveHoldMs = 0;
  private creepPlanned = false;
  private creepStepsLeft = 0;
  private creepTimerMs = 0;
  private breakMsLeft = 0;
  /** One honor roll per packmate point: a soft pup may steal it instead. */
  private honorRolled = false;
  private willHonor = false;
  /** Current cover objective: index into env.patches, or null (open-ground sweep). */
  private coverIdx: number | null = null;
  private coverWorkMsLeft = 0;
  /** ms remaining of perimeter-first work before interior comb. */
  private coverEdgeMsLeft = 0;
  /** Normalized progress around the patch perimeter while edge-working. */
  private coverEdgeT = 0;
  /** Patch index → ms until the dog considers it worth re-checking. */
  private checkedCovers = new Map<number, number>();
  /** ms left of the first-scent freeze. */
  private scentStageMs = 0;
  private scentStageTotalMs = 0;
  private scentTargetId: number | null = null;
  private scentArcSign = 1;
  private markingBirdIds: number[] = [];

  constructor(
    public pos: Vec2,
    public profile: DogProfile,
    rng: RNG = Math.random,
    public bounds: Rect = FIELD_BOUNDS,
  ) {
    this.heading = rng() * Math.PI * 2;
    this.rng = rng;
    this.maxStaminaMs = breedStaminaMs(profile.breed, profile.level) * (profile.ageMult ?? 1);
    this.staminaMs = this.maxStaminaMs;
  }

  get level(): number {
    return this.profile.level;
  }

  watchedBirdIds(): readonly number[] { return this.markingBirdIds; }

  /** Out of stamina: slower, duller nose, sloppier. */
  get winded(): boolean {
    return this.staminaMs <= 0;
  }

  /** Bird nerve drain multiplier while this dog is on point. */
  get pressure(): number {
    return breedPointPressure(this.profile.breed, this.profile.level);
  }

  /** How far from the hunter this dog works while quartering. */
  get rangeRadius(): number {
    return QUARTER_RANGE * rangeMult(this.profile.breed, this.profile.level);
  }

  private get fatigueMult(): number {
    return this.winded ? 0.6 : 1;
  }

  private get speed(): number {
    return DOG_SPEED * speedMult(this.profile.breed, this.profile.level) * this.fatigueMult * (this.profile.ageMult ?? 1);
  }

  private get trackSpeed(): number {
    return (
      TRACKING_SPEED * speedMult(this.profile.breed, this.profile.level) * this.fatigueMult * (this.profile.ageMult ?? 1)
    );
  }

  /** Apply the property's hunting tempo to search and scent work. Delivery,
   * recall, and a breaking chase keep their shared breed speeds so the
   * doctrine changes the feel of finding birds without making a retrieve
   * arbitrarily slow or fast.
   */
  private workingSpeed(env: DogEnv, base: number): number {
    return base * this.doctrineFor(env).dogPaceMult;
  }

  private get weave(): number {
    return WEAVE_AMPLITUDE * rangeMult(this.profile.breed, this.profile.level);
  }

  /** Scent reach in a direction, if the dog is old enough to use the wind. */
  private scentDistance(dx: number, dy: number, env: DogEnv): number {
    const windedNose = this.winded ? 0.8 : 1;
    const base =
      SCENT_RADIUS * noseMult(this.profile.breed, this.profile.level) * windedNose * (env.scentMult ?? 1);
    if (windCraftTier(this.profile.level) === 0) return base; // too young to work wind
    return (scentRange(env.windAngle, dx, dy) / SCENT_RADIUS) * base;
  }

  private obstacleMotion = new DogObstacleMotion();
  private obstacles: readonly DogObstacle[] = [];
  private maxTravel = Infinity;

  update(dtMs: number, birds: Bird[], env: DogEnv = {}): void {
    const wasWaitingForHandler = this.waitingForHandler;
    this.waitingForHandler = false;
    this.obstacles = env.obstacles ?? [];
    const dt = dtMs / 1000;
    this.maxTravel = env.maxTravelSpeed === undefined ? Infinity : Math.max(0, env.maxTravelSpeed) * dt;
    const movementDt = dt * (env.movementScale ?? 1);
    // Default presentation; branches below overwrite for cast/track/still.
    this.gait = 'run';
    this.scentCheck = false;

    // The whistle only carries so far — a big-running dog can be out of earshot.
    const hearsWhistle = !env.hunterPos || dist(this.pos, env.hunterPos) <= (env.whistleRange ?? WHISTLE_RANGE);
    if (env.recall && hearsWhistle && (this.state === 'quartering' || this.state === 'tracking' || this.state === 'marking')) {
      if (this.state === 'marking') { this.markingBirdIds = []; this.needsSearch = true; }
      this.state = 'recalled';
      this.resetScentApproach();
    }

    if (this.state === 'recalled') {
      this.gait = 'run';
      if (!env.hunterPos || dist(this.pos, env.hunterPos) <= RECALL_ARRIVE) {
        this.state = 'heel'; // waits at heel until cast off
        this.gait = 'still';
        return;
      }
      this.heading = Math.atan2(env.hunterPos.y - this.pos.y, env.hunterPos.x - this.pos.x);
      this.advance(this.heading, RECALL_SPEED * movementDt);
      return;
    }

    if (this.state === 'heel') {
      this.gait = 'still';
      this.staminaMs = Math.min(this.maxStaminaMs, this.staminaMs + dtMs * HEEL_RECOVER_MULT);
      if (env.hunterPos && dist(this.pos, env.hunterPos) > HEEL_FOLLOW) {
        this.gait = 'trot';
        this.heading = Math.atan2(env.hunterPos.y - this.pos.y, env.hunterPos.x - this.pos.x);
        this.advance(this.heading, RECALL_SPEED * 0.8 * movementDt);
      }
      return;
    }

    if (this.state === 'marking') {
      this.gait = 'still';
      const airborne = birds.some(b => this.markingBirdIds.includes(b.id) &&
        (b.state === 'flushed' || (b.state === 'downed' && b.fallPending)));
      if (airborne) return;
      this.markingBirdIds = [];
      this.state = 'quartering'; // The normal retrieve/search priorities resume below.
    }

    // Backing a packmate's point: stand and face it until the point
    // resolves — unless there's a bird down to fetch.
    if (this.state === 'honoring') {
      this.gait = 'still';
      const hasDowned = birds.some((b) => b.state === 'downed' && !b.fallPending);
      if (!env.honorPoint || hasDowned) {
        this.state = 'quartering'; // resume below (retrieve wins if a bird is down)
      } else {
        this.heading = Math.atan2(env.honorPoint.y - this.pos.y, env.honorPoint.x - this.pos.x);
        return;
      }
    }
    if (!env.honorPoint) {
      this.honorRolled = false;
      this.willHonor = false;
    }

    if (this.state === 'breaking') {
      this.gait = 'run';
      this.work(dtMs * (env.drainMult ?? 1));
      this.breakMsLeft -= dtMs;
      if (this.breakMsLeft <= 0) {
        this.state = 'quartering';
        return;
      }
      this.steerOffEdges(movementDt);
      this.advance(this.heading, BREAKING_SPEED * movementDt);
      // A chasing dog bumps everything it runs past.
      const bumped = this.nearestBirdWithin(birds, 'hidden', BREAK_BUMP_RADIUS);
      if (bumped) this.bumpedBirdId = bumped.id;
      return;
    }

    if (this.state === 'pointing') {
      this.gait = 'still';
      const pointed = birds.find((b) => b.id === this.pointedBirdId);
      if (!pointed || pointed.state !== 'hidden') {
        // Bird flushed or collected — cast off and hunt again.
        this.state = 'quartering';
        this.pointedBirdId = null;
        this.resetCreep();
        this.resetScentApproach();
      } else if (dist(this.pos, pointed.pos) > POINT_RANGE * 2) {
        // A running bird broke the point — road it.
        this.state = 'tracking';
        this.pointedBirdId = null;
        this.resetCreep();
        this.beginScentApproach(pointed, 'stalking');
        this.gait = 'track';
      } else {
        this.creep(dtMs, pointed);
      }
      return;
    }

    if (this.state === 'retrieving') {
      const target = birds.find((b) => b.id === this.retrieveTargetId);
      if (!target || target.fallPending || (target.state !== 'downed' && target.state !== 'carried')) {
        this.state = 'quartering';
        this.retrieveTargetId = null;
        this.carryingBirdId = null;
        this.retrieveHoldMs = 0;
        return;
      }

      if (target.state === 'downed') {
        if (dist(this.pos, target.pos) > RETRIEVE_RANGE) {
          this.gait = 'trot';
          this.retrieveHoldMs = 0;
          this.heading = Math.atan2(target.pos.y - this.pos.y, target.pos.x - this.pos.x);
          this.advance(this.heading, this.trackSpeed * movementDt);
        } else {
          this.gait = 'still';
          this.retrieveHoldMs += dtMs;
          const holdNeeded = RETRIEVE_HOLD_MS +
            (this.needsSearch ? SEARCH_HOLD_MS * (env.searchMult ?? 1) : 0);
          if (this.retrieveHoldMs >= holdNeeded) {
            this.needsSearch = false;
            this.retrieveHoldMs = 0;
            // Direct Dog users without a handler preserve the old fetch-only
            // contract. Both shipped hunt adapters always provide hunterPos
            // and therefore run the complete carry-and-deliver sequence.
            if (!env.hunterPos) {
              target.state = 'retrieved';
              this.state = 'quartering';
              this.retrieveTargetId = null;
            } else {
              target.state = 'carried';
              this.carryingBirdId = target.id;
              target.pos.x = this.pos.x;
              target.pos.y = this.pos.y;
            }
          }
        }
        return;
      }

      // The bird stays authoritative and reserved while carried. Updating
      // its shared position lets both renderers put the fall in the mouth.
      target.pos.x = this.pos.x;
      target.pos.y = this.pos.y;
      if (!env.hunterPos || dist(this.pos, env.hunterPos) <= RETRIEVE_RANGE) {
        this.gait = 'still';
        this.retrieveHoldMs += dtMs;
        if (this.retrieveHoldMs >= RETRIEVE_DELIVERY_HOLD_MS) {
          target.state = 'retrieved';
          target.pos.x = env.hunterPos?.x ?? this.pos.x;
          target.pos.y = env.hunterPos?.y ?? this.pos.y;
          this.state = 'quartering';
          this.retrieveTargetId = null;
          this.carryingBirdId = null;
          this.retrieveHoldMs = 0;
        }
      } else {
        this.gait = 'trot';
        this.retrieveHoldMs = 0;
        this.heading = Math.atan2(env.hunterPos.y - this.pos.y, env.hunterPos.x - this.pos.x);
        this.advance(this.heading, this.trackSpeed * 0.85 * movementDt);
        target.pos.x = this.pos.x;
        target.pos.y = this.pos.y;
      }
      return;
    }

    // A bird on the ground outranks fresh scent: fetch it first.
    const downed = this.nearestBird(birds, 'downed');
    if (downed) {
      this.state = 'retrieving';
      this.resetScentApproach();
      this.retrieveTargetId = downed.id;
      this.carryingBirdId = null;
      this.retrieveHoldMs = 0;
      return;
    }

    // A packmate is on point within sight: a finished dog stops and backs.
    // Soft young dogs may fail the roll and keep hunting — stealing the
    // point, with all the bumping that invites.
    if (env.honorPoint && dist(this.pos, env.honorPoint) <= HONOR_SIGHT) {
      if (!this.honorRolled) {
        this.honorRolled = true;
        this.willHonor = this.rng() >= breedBreakChance(this.profile.breed, this.profile.level);
      }
      if (this.willHonor) {
        this.state = 'honoring';
        this.resetScentApproach();
        this.pointedBirdId = null;
        this.heading = Math.atan2(env.honorPoint.y - this.pos.y, env.honorPoint.x - this.pos.x);
        return;
      }
    }

    const smelledBird = this.nearestHiddenBird(birds, env);
    // Once a dog has made game, hold that scent for a modest margin. This
    // prevents a running bird or one lateral locating step from flickering
    // the sequence back to open search, while still allowing a truly lost
    // bird to break the approach.
    const rememberedBird = this.scentTargetId === null
      ? null
      : birds.find((candidate) => candidate.id === this.scentTargetId && candidate.state === 'hidden') ?? null;
    const rememberedInRange = rememberedBird !== null &&
      dist(this.pos, rememberedBird.pos) <=
        this.scentDistance(rememberedBird.pos.x - this.pos.x, rememberedBird.pos.y - this.pos.y, env) *
          SCENT_MEMORY_MULT;
    const bird = rememberedInRange ? rememberedBird : smelledBird;
    if (bird) {
      if (this.state !== 'tracking' || this.scentTargetId !== bird.id || this.scentStage === 'none') {
        this.beginScentApproach(bird, 'checking');
      }
      this.state = 'tracking';
      this.work(dtMs * (env.drainMult ?? 1));
      const style = scentApproachStyle(this.profile.breed, this.profile.level);
      const direct = Math.atan2(bird.pos.y - this.pos.y, bird.pos.x - this.pos.x);
      const birdDistance = dist(this.pos, bird.pos);
      // The live close-timber range must also constrain a long scent road-in.
      // Retain the scent and its current beat rather than abandon game or
      // declare a point early. Hysteresis avoids repeated stop/start steps.
      if (this.doctrineFor(env).style === 'woods' && env.rangeRadius !== undefined && env.hunterPos &&
        birdDistance > POINT_SETTLE_RANGE &&
        dist(this.pos, env.hunterPos) > this.effectiveRangeRadius(env) * (wasWaitingForHandler ? 1.2 : 1.6)) {
        this.waitingForHandler = true;
        this.heading = turnToward(this.heading, direct, 4 * dt);
        this.gait = 'still';
        return;
      }

      if (this.scentStage === 'checking') {
        // First contact: freeze a beat and face the scent cone. The original
        // scentCheck flag remains for audio and existing 2D art.
        this.heading = turnToward(this.heading, direct, 6 * dt);
        this.tickTimedScentStage(dtMs);
        this.scentCheck = true;
        this.gait = 'still';
        if (this.scentStageMs > 0) return;
        this.startScentStage('locating', style.locateMs);
        return;
      }

      if (this.scentStage === 'locating') {
        // Tightening lateral casts identify the exact source instead of a
        // straight-line charge. The arc collapses as confidence builds.
        this.tickTimedScentStage(dtMs);
        const tighten = 1 - this.scentProgress;
        const wave = Math.sin(this.scentProgress * Math.PI * 2 * style.locateCycles);
        const offset = wave * style.locateArc * tighten * this.scentArcSign;
        this.heading = turnToward(this.heading, direct + offset, 4.8 * dt);
        this.gait = 'trot';
        this.advanceTowardPoint(this.heading, birdDistance, this.workingSpeed(env, this.trackSpeed) * style.locatePace * movementDt);
        if (this.scentStageMs <= 0 || dist(this.pos, bird.pos) <= POINT_SETTLE_RANGE + 5) {
          this.startScentStage('stalking', 0);
        }
        return;
      }

      if (this.scentStage === 'stalking') {
        // Low, increasingly careful road-in. Progress is distance-based so
        // movementScale can slow 3D presentation without desynchronizing it.
        const d = dist(this.pos, bird.pos);
        this.scentProgress = clamp(1 - (d - POINT_SETTLE_RANGE) / Math.max(1, SCENT_RADIUS - POINT_SETTLE_RANGE), 0, 1);
        this.heading = turnToward(this.heading, direct, (2.8 + this.scentProgress * 2.2) * dt);
        this.gait = 'track';
        this.advanceTowardPoint(this.heading, d, this.workingSpeed(env, this.trackSpeed) * style.stalkPace * movementDt);
        if (dist(this.pos, bird.pos) <= POINT_SETTLE_RANGE + 1e-6) {
          this.startScentStage('locking', style.lockMs);
          this.gait = 'still';
        }
        return;
      }

      if (this.scentStage === 'locking') {
        // Settle the body and lift the pointing forefoot before declaring the
        // point. Bird nerve does not begin draining until this finishes.
        this.heading = turnToward(this.heading, direct, 7 * dt);
        this.tickTimedScentStage(dtMs);
        this.gait = 'still';
        if (this.scentStageMs <= 0) {
          this.resetScentApproach();
          this.heading = direct;
          this.state = 'pointing';
          this.pointedBirdId = bird.id;
          this.gait = 'still';
        }
        return;
      }
    }
    this.resetScentApproach();

    // Quartering: hunt objectives, not open ground. With cover in reach the
    // dog casts to a patch and works it until it feels checked; only a
    // covert with nothing left to check gets the plain serpentine sweep.
    this.state = 'quartering';
    this.work(dtMs * (env.drainMult ?? 1));
    this.tickCoverMemory(dtMs);
    const patch = this.chooseCover(env);

    // Working keeps a grace margin: the serpentine naturally swings a body
    // length past the edge, and flapping back to "casting" there would
    // stall the work clock and jitter the dog.
    const working =
      patch &&
      rectContains(
        { x: patch.x - COVER_GRACE, y: patch.y - COVER_GRACE, w: patch.w + COVER_GRACE * 2, h: patch.h + COVER_GRACE * 2 },
        this.pos,
      );

    if (patch && !working) {
      // Casting: purposeful trot to the aim point (center, or downwind edge
      // when the dog knows wind), only a hint of weave.
      this.gait = 'trot';
      this.weavePhase += movementDt * WEAVE_RATE;
      const aimPt = castAimPoint(patch, env.windAngle, windCraftTier(this.profile.level));
      // Route-aware casting is what turns the authored lines into dog work.
      // Pheasant, desert, bench, and ridge dogs should arrive at the cover
      // from the physical edge they are meant to hunt; the softer pull on
      // woods and open country preserves natural casts when a patch sits
      // beside, rather than directly on, a route.
      const routePull = routeCastPull(this.doctrineFor(env).style, env.huntAreaId);
      if (routePull > 0 && env.trails && env.trails.length > 0) {
        const routePoint = nearestTrailPoint(
          { x: rectCx(patch), y: rectCy(patch) },
          env.trails,
        );
        if (routePoint) {
          aimPt.x = clamp(aimPt.x * (1 - routePull) + routePoint.x * routePull,
            patch.x - COVER_GRACE, patch.x + patch.w + COVER_GRACE);
          aimPt.y = clamp(aimPt.y * (1 - routePull) + routePoint.y * routePull,
            patch.y - COVER_GRACE, patch.y + patch.h + COVER_GRACE);
        }
      }
      const aim = Math.atan2(aimPt.y - this.pos.y, aimPt.x - this.pos.x);
      this.heading = turnToward(this.heading, aim, COVER_TURN_RATE * movementDt);
      // Range correction answers real time so a presentation pace scale
      // cannot also make the dog take seconds to turn back into view.
      this.steerToAnchor(dt, env.workAnchor ?? env.hunterPos, this.effectiveRangeRadius(env));
      this.advance(
        this.heading + Math.sin(this.weavePhase) * 0.15,
        this.workingSpeed(env, this.speed) * CAST_SPEED_MULT * movementDt,
      );
      return;
    }

    if (patch && working) {
      // Working the cover: finished dogs ring the perimeter first (edge
      // phase), then comb the interior; pups skip straight to the comb.
      // Birds interrupt this at any moment (above).
      this.gait = 'run';
      this.coverWorkMsLeft -= dtMs;
      if (this.coverWorkMsLeft <= 0) {
        this.checkedCovers.set(this.coverIdx!, COVER_REVISIT_MS);
        this.coverIdx = null;
        this.coverEdgeMsLeft = 0;
        return;
      }
      if (this.coverEdgeMsLeft > 0) {
        this.coverEdgeMsLeft -= dtMs;
        // Snap to the rim first, then lap: birds sit edges, so stay on them.
        const onRim = distToRectEdge(patch, this.pos) <= COVER_EDGE_MARGIN + 2;
        if (!onRim) {
          this.coverEdgeT = nearestPerimeterT(patch, this.pos);
        } else {
          this.coverEdgeT = (this.coverEdgeT + movementDt * COVER_EDGE_LAP_RATE) % 1;
        }
        const edgePt = perimeterPoint(patch, this.coverEdgeT);
        const aim = Math.atan2(edgePt.y - this.pos.y, edgePt.x - this.pos.x);
        this.heading = turnToward(this.heading, aim, COVER_TURN_RATE * 2.4 * movementDt);
        this.steerToAnchor(dt, env.workAnchor ?? env.hunterPos, this.effectiveRangeRadius(env));
        this.advance(this.heading, this.workingSpeed(env, this.speed) * (onRim ? 1 : 1.15) * movementDt);
        return;
      }
      // Interior comb: tight serpentine with a soft pull toward the core
      // (pups spend almost all their budget here).
      this.weavePhase += movementDt * WEAVE_RATE * COVER_WEAVE_MULT;
      const toCore = Math.atan2(rectCy(patch) - this.pos.y, rectCx(patch) - this.pos.x);
      this.heading = turnToward(this.heading, toCore, 0.9 * movementDt);
      this.steerInsideRect(movementDt, patch);
      this.steerToAnchor(dt, env.workAnchor ?? env.hunterPos, this.effectiveRangeRadius(env));
      this.advance(this.heading + Math.sin(this.weavePhase) * this.weave, this.workingSpeed(env, this.speed) * movementDt);
      return;
    }

    // No cover worth checking: the classic open-ground sweep.
    this.gait = 'run';
    this.weavePhase += movementDt * WEAVE_RATE;
    this.steerOffEdges(movementDt);
    this.steerToAnchor(dt, env.workAnchor ?? env.hunterPos, this.effectiveRangeRadius(env));
    const weave = Math.sin(this.weavePhase) * this.weave;
    this.advance(this.heading + weave, this.workingSpeed(env, this.speed) * movementDt);
  }

  private beginScentApproach(bird: Bird, stage: Exclude<DogScentStage, 'none'>): void {
    const style = scentApproachStyle(this.profile.breed, this.profile.level);
    this.scentTargetId = bird.id;
    // Alternate the opening cast without consuming the gameplay RNG stream
    // used by creep, break and honor rolls.
    this.scentArcSign *= -1;
    const duration = stage === 'checking'
      ? style.checkMs
      : stage === 'locating'
        ? style.locateMs
        : stage === 'locking'
          ? style.lockMs
          : 0;
    this.startScentStage(stage, duration);
  }

  private startScentStage(stage: Exclude<DogScentStage, 'none'>, durationMs: number): void {
    this.scentStage = stage;
    this.scentStageMs = durationMs;
    this.scentStageTotalMs = durationMs;
    this.scentProgress = 0;
  }

  private tickTimedScentStage(dtMs: number): void {
    this.scentStageMs = Math.max(0, this.scentStageMs - dtMs);
    this.scentProgress = this.scentStageTotalMs <= 0
      ? 1
      : clamp(1 - this.scentStageMs / this.scentStageTotalMs, 0, 1);
  }

  private resetScentApproach(): void {
    this.scentStage = 'none';
    this.scentProgress = 0;
    this.scentStageMs = 0;
    this.scentStageTotalMs = 0;
    this.scentTargetId = null;
    this.scentCheck = false;
  }

  /** Advance without crossing the distance where the dog must settle. */
  private advanceTowardPoint(heading: number, distance: number, requested: number): void {
    const available = Math.max(0, distance - POINT_SETTLE_RANGE);
    this.advance(heading, Math.min(requested, available));
  }

  /** Checked patches become interesting again as their cooldown runs out. */
  private tickCoverMemory(dtMs: number): void {
    for (const [idx, ms] of this.checkedCovers) {
      if (ms - dtMs <= 0) this.checkedCovers.delete(idx);
      else this.checkedCovers.set(idx, ms - dtMs);
    }
  }

  /**
   * The current cover objective, picking a new one when free: the nearest
   * unchecked patch that stays inside the dog's range of the hunter. The
   * pick sets the working clock — patch size × level thoroughness, so a
   * pup calls a big CRP field checked long before it is.
   */
  private chooseCover(env: DogEnv): Rect | null {
    const patches = env.patches ?? [];
    const anchor = env.workAnchor ?? env.hunterPos;
    const doctrine = this.doctrineFor(env);
    const styleRange = this.effectiveRangeRadius(env);
    // Drop the objective if the hunter has moved on past range of it.
    if (
      this.coverIdx !== null &&
      anchor &&
      dist({ x: rectCx(patches[this.coverIdx]), y: rectCy(patches[this.coverIdx]) }, anchor) >
        styleRange * 1.2
    ) {
      this.coverIdx = null;
    }
    if (this.coverIdx !== null) return patches[this.coverIdx] ?? null;

    let best: number | null = null;
    let bestDist = Infinity;
    const routeWeight = doctrine.style === 'pheasant' ? .62
      : doctrine.style === 'chukar' || doctrine.style === 'bench-covey' ? .74
        : doctrine.style === 'woods' || doctrine.style === 'bottoms' || doctrine.style === 'canyon' ? .82
          : doctrine.style === 'desert-wash' ? .68 : .38;
    const habitatWeight = doctrine.style === 'woods' || doctrine.style === 'bottoms' || doctrine.style === 'canyon'
      ? 46
      : doctrine.style === 'chukar' || doctrine.style === 'bench-covey' || doctrine.style === 'alpine-edge'
        ? 38
        : doctrine.style === 'pheasant' || doctrine.style === 'desert-wash' || doctrine.style === 'oak-savanna'
          ? 30 : 22;
    for (let i = 0; i < patches.length; i++) {
      if (this.checkedCovers.has(i)) continue;
      const c = { x: rectCx(patches[i]), y: rectCy(patches[i]) };
      if (anchor && dist(c, anchor) > styleRange) continue;
      const routeDistance = env.trails && env.trails.length > 0
        ? distanceToTrail(c, env.trails)
        : 0;
      const habitat = env.coverAffinity?.(c) ?? .5;
      const d = dist(this.pos, c) + routeDistance * routeWeight + (1 - habitat) * habitatWeight;
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    }
    if (best === null) return null;
    this.coverIdx = best;
    const p = patches[best];
    const total =
      clamp(p.w * p.h * COVER_WORK_MS_PER_PX2, COVER_WORK_MIN_MS, COVER_WORK_MAX_MS) *
      coverThoroughness(this.profile.level) *
      doctrine.coverWorkMult *
      (0.85 + this.rng() * 0.3);
    this.coverWorkMsLeft = total;
    // Pheasants are a rim-and-run problem: spend a deliberate opening lap on
    // the outside before combing the core. Chukar get a shorter contour lap;
    // quail retain the established level-based recipe.
    this.coverEdgeMsLeft = total * Math.min(0.78, coverEdgeFraction(this.profile.level) + doctrine.dogEdgeBias);
    this.coverEdgeT = nearestPerimeterT(p, this.pos);
    // Face the cast aim immediately so approach heading matches the objective
    // (center for pups/calm; downwind flank when wind-craft applies).
    const aim = castAimPoint(p, env.windAngle, windCraftTier(this.profile.level));
    if ((env.huntStyle === 'chukar' || env.huntStyle === 'alpine-edge') && env.slopeAngle !== undefined) {
      const center = { x: rectCx(p), y: rectCy(p) };
      const uphillReach = Math.min(p.w, p.h) * 0.34;
      const uphill = {
        x: center.x + Math.cos(env.slopeAngle) * uphillReach,
        y: center.y + Math.sin(env.slopeAngle) * uphillReach,
      };
      aim.x = aim.x * 0.52 + uphill.x * 0.48;
      aim.y = aim.y * 0.52 + uphill.y * 0.48;
    }
    this.heading = Math.atan2(aim.y - this.pos.y, aim.x - this.pos.x);
    return p;
  }

  /**
   * Resolve the property doctrine at the movement seam. The adapter may
   * supply a presentation-space range, but the property still owns how far
   * a dog is expected to cast before checking back with the hunter.
   */
  private doctrineFor(env: DogEnv) {
    return env.huntAreaId
      ? huntingDoctrine(env.huntAreaId)
      : huntDoctrineForStyle(env.huntStyle);
  }

  private effectiveRangeRadius(env: DogEnv): number {
    return (env.rangeRadius ?? this.rangeRadius) * this.doctrineFor(env).dogRangeMult;
  }

  /** While working cover, bounce off the patch edges instead of the field's. */
  private steerInsideRect(dt: number, r: Rect): void {
    let tx = 0;
    let ty = 0;
    if (this.pos.x < r.x + COVER_EDGE_MARGIN) tx = 1;
    else if (this.pos.x > r.x + r.w - COVER_EDGE_MARGIN) tx = -1;
    if (this.pos.y < r.y + COVER_EDGE_MARGIN) ty = 1;
    else if (this.pos.y > r.y + r.h - COVER_EDGE_MARGIN) ty = -1;
    if (tx === 0 && ty === 0) return;
    const toward = Math.atan2(ty || Math.sin(this.heading) * 0.2, tx || Math.cos(this.heading) * 0.2);
    this.heading = turnToward(this.heading, toward, EDGE_TURN_RATE * 1.4 * dt);
  }

  /** Past its Range from the hunter, the dog swings back — harder the farther it is. */
  private steerToAnchor(dt: number, anchor?: Vec2, rangeRadius = this.rangeRadius): void {
    if (!anchor) return;
    const d = dist(this.pos, anchor);
    if (d <= rangeRadius) return;
    const toward = Math.atan2(anchor.y - this.pos.y, anchor.x - this.pos.x);
    const urgency = Math.min(2.5, 1 + (d - rangeRadius) / 50);
    this.heading = turnToward(this.heading, toward, ANCHOR_TURN_RATE * urgency * dt);
  }

  /**
   * A covey rose: steady dogs stand through it and mark the fall; soft dogs
   * break chase (and won't have marked anything). Returns true if it broke.
   */
  onFlush(rng: RNG, toward: Vec2, watchBirdIds?: readonly number[]): boolean {
    if (watchBirdIds && this.state === 'breaking') return true;
    if (watchBirdIds && ['retrieving', 'recalled', 'heel'].includes(this.state)) return false;
    if (rng() >= breedBreakChance(this.profile.breed, this.profile.level)) {
      if (watchBirdIds?.length && this.state !== 'retrieving' && this.state !== 'recalled' && this.state !== 'heel') {
        this.state = 'marking'; this.gait = 'still';
        this.markingBirdIds = [...new Set([...this.markingBirdIds, ...watchBirdIds])];
        this.pointedBirdId = null;
        this.resetScentApproach(); this.resetCreep();
        this.heading = Math.atan2(toward.y - this.pos.y, toward.x - this.pos.x);
        this.needsSearch = false;
      }
      return false;
    }
    this.markingBirdIds = [];
    this.state = 'breaking';
    this.breakMsLeft = BREAKING_MS;
    this.heading = Math.atan2(toward.y - this.pos.y, toward.x - this.pos.x);
    this.needsSearch = true;
    return true;
  }

  /** Release a heeled dog to hunt again. */
  castOff(): void {
    if (this.state === 'heel') this.state = 'quartering';
  }

  /** A young dog on point may creep forward — and bump the bird. */
  private creep(dtMs: number, pointed: Bird): void {
    if (!this.creepPlanned) {
      this.creepPlanned = true;
      if (this.rng() < breedCreepChance(this.profile.breed, this.profile.level)) {
        this.creepStepsLeft = 1 + Math.floor(this.rng() * 3);
        this.creepTimerMs = CREEP_INTERVAL_MS;
      }
      return;
    }
    if (this.creepStepsLeft === 0) return;
    this.creepTimerMs -= dtMs;
    if (this.creepTimerMs > 0) return;
    this.creepTimerMs = CREEP_INTERVAL_MS;
    this.creepStepsLeft--;
    this.heading = Math.atan2(pointed.pos.y - this.pos.y, pointed.pos.x - this.pos.x);
    this.advance(this.heading, CREEP_STEP_PX);
    if (dist(this.pos, pointed.pos) <= BUMP_DISTANCE) {
      this.bumpedBirdId = pointed.id;
      this.creepStepsLeft = 0;
    }
  }

  private resetCreep(): void {
    this.creepPlanned = false;
    this.creepStepsLeft = 0;
    this.creepTimerMs = 0;
  }

  /** Active work drains the stamina pool. */
  private work(dtMs: number): void {
    this.staminaMs = Math.max(0, this.staminaMs - dtMs);
  }

  private nearestHiddenBird(birds: Bird[], env: DogEnv): Bird | null {
    let best: Bird | null = null;
    let bestRange = Infinity;
    for (const b of birds) {
      if (b.state !== 'hidden') continue;
      if (env.hunterPos && dist(b.pos, env.hunterPos) <= AVOID_HUNTER_RADIUS) continue;
      const d = dist(this.pos, b.pos);
      const range = this.scentDistance(b.pos.x - this.pos.x, b.pos.y - this.pos.y, env);
      if (d <= range && d < bestRange) {
        best = b;
        bestRange = d;
      }
    }
    return best;
  }

  private nearestBird(birds: Bird[], state: Bird['state']): Bird | null {
    return this.nearestBirdWithin(birds, state, Infinity);
  }

  private nearestBirdWithin(birds: Bird[], state: Bird['state'], radius: number): Bird | null {
    let best: Bird | null = null;
    let bestDist = radius;
    for (const b of birds) {
      if (b.state !== state || (state === 'downed' && b.fallPending)) continue;
      const d = dist(this.pos, b.pos);
      if (d < bestDist) {
        best = b;
        bestDist = d;
      }
    }
    return best;
  }

  private steerOffEdges(dt: number): void {
    const { x, y } = this.pos;
    let dx = 0;
    let dy = 0;
    if (x < this.bounds.x + EDGE_MARGIN) dx += 1;
    if (x > this.bounds.x + this.bounds.w - EDGE_MARGIN) dx -= 1;
    if (y < this.bounds.y + EDGE_MARGIN) dy += 1;
    if (y > this.bounds.y + this.bounds.h - EDGE_MARGIN) dy -= 1;
    if (dx !== 0 || dy !== 0) {
      this.heading = turnToward(this.heading, Math.atan2(dy, dx), EDGE_TURN_RATE * dt);
    }
  }

  private advance(heading: number, distance: number): void {
    distance = Math.min(distance, this.maxTravel);
    if (this.obstacles.length) {
      // The travel direction may include a temporary quartering weave.
      // Feed back only an obstacle's detour, not that weave: accumulating
      // it into the base heading each frame makes an unobstructed dog circle.
      const travel = this.obstacleMotion.move(this.pos, heading, distance, this.obstacles);
      this.heading += travel - heading;
      this.pos.x = clamp(this.pos.x, this.bounds.x + 4, this.bounds.x + this.bounds.w - 4);
      this.pos.y = clamp(this.pos.y, this.bounds.y + 4, this.bounds.y + this.bounds.h - 4);
      return;
    }
    this.pos = {
      x: clamp(this.pos.x + Math.cos(heading) * distance, this.bounds.x + 4, this.bounds.x + this.bounds.w - 4),
      y: clamp(this.pos.y + Math.sin(heading) * distance, this.bounds.y + 4, this.bounds.y + this.bounds.h - 4),
    };
  }
}
