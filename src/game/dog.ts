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
import { clamp, dist, turnToward } from './math';
import type { RNG, Vec2 } from './types';

export type DogState =
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
  hunterPos?: Vec2;
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

  private rng: RNG;
  private weavePhase = 0;
  private retrieveTargetId: number | null = null;
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
  private scentCheckMs = 0;

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

  update(dtMs: number, birds: Bird[], env: DogEnv = {}): void {
    const dt = dtMs / 1000;
    // Default presentation; branches below overwrite for cast/track/still.
    this.gait = 'run';
    this.scentCheck = false;

    // The whistle only carries so far — a big-running dog can be out of earshot.
    const hearsWhistle = !env.hunterPos || dist(this.pos, env.hunterPos) <= (env.whistleRange ?? WHISTLE_RANGE);
    if (env.recall && hearsWhistle && (this.state === 'quartering' || this.state === 'tracking')) {
      this.state = 'recalled';
    }

    if (this.state === 'recalled') {
      this.gait = 'run';
      if (!env.hunterPos || dist(this.pos, env.hunterPos) <= RECALL_ARRIVE) {
        this.state = 'heel'; // waits at heel until cast off
        this.gait = 'still';
        return;
      }
      this.heading = Math.atan2(env.hunterPos.y - this.pos.y, env.hunterPos.x - this.pos.x);
      this.advance(this.heading, RECALL_SPEED * dt);
      return;
    }

    if (this.state === 'heel') {
      this.gait = 'still';
      this.staminaMs = Math.min(this.maxStaminaMs, this.staminaMs + dtMs * HEEL_RECOVER_MULT);
      if (env.hunterPos && dist(this.pos, env.hunterPos) > HEEL_FOLLOW) {
        this.gait = 'trot';
        this.heading = Math.atan2(env.hunterPos.y - this.pos.y, env.hunterPos.x - this.pos.x);
        this.advance(this.heading, RECALL_SPEED * 0.8 * dt);
      }
      return;
    }

    // Backing a packmate's point: stand and face it until the point
    // resolves — unless there's a bird down to fetch.
    if (this.state === 'honoring') {
      this.gait = 'still';
      const hasDowned = birds.some((b) => b.state === 'downed');
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
      this.steerOffEdges(dt);
      this.advance(this.heading, BREAKING_SPEED * dt);
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
      } else if (dist(this.pos, pointed.pos) > POINT_RANGE * 2) {
        // A running bird broke the point — road it.
        this.state = 'tracking';
        this.pointedBirdId = null;
        this.resetCreep();
        this.gait = 'track';
      } else {
        this.creep(dtMs, pointed);
      }
      return;
    }

    if (this.state === 'retrieving') {
      const target = birds.find((b) => b.id === this.retrieveTargetId);
      if (!target || target.state !== 'downed') {
        this.state = 'quartering';
        this.retrieveTargetId = null;
        this.retrieveHoldMs = 0;
        return;
      }
      if (dist(this.pos, target.pos) > RETRIEVE_RANGE) {
        this.gait = 'trot';
        this.retrieveHoldMs = 0;
        this.heading = Math.atan2(target.pos.y - this.pos.y, target.pos.x - this.pos.x);
        this.advance(this.heading, this.trackSpeed * dt);
      } else {
        this.gait = 'still';
        this.retrieveHoldMs += dtMs;
        const holdNeeded = RETRIEVE_HOLD_MS + (this.needsSearch ? SEARCH_HOLD_MS * (env.searchMult ?? 1) : 0);
        if (this.retrieveHoldMs >= holdNeeded) {
          target.state = 'retrieved';
          this.needsSearch = false;
          this.state = 'quartering';
          this.retrieveTargetId = null;
          this.retrieveHoldMs = 0;
        }
      }
      return;
    }

    // A bird on the ground outranks fresh scent: fetch it first.
    const downed = this.nearestBird(birds, 'downed');
    if (downed) {
      this.state = 'retrieving';
      this.retrieveTargetId = downed.id;
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
        this.pointedBirdId = null;
        this.heading = Math.atan2(env.honorPoint.y - this.pos.y, env.honorPoint.x - this.pos.x);
        return;
      }
    }

    const bird = this.nearestHiddenBird(birds, env);
    if (bird) {
      // First contact with scent: freeze a beat, head locked on the line —
      // the "dog makes game" moment the handler reads from the gallery.
      if (this.state !== 'tracking' && this.scentCheckMs <= 0) {
        this.scentCheckMs = 320;
      }
      this.state = 'tracking';
      this.work(dtMs * (env.drainMult ?? 1));
      this.heading = Math.atan2(bird.pos.y - this.pos.y, bird.pos.x - this.pos.x);
      if (this.scentCheckMs > 0) {
        this.scentCheckMs -= dtMs;
        this.scentCheck = true;
        this.gait = 'still';
        if (this.scentCheckMs > 0) return;
      }
      this.gait = 'track';
      this.advance(this.heading, this.trackSpeed * dt);
      if (dist(this.pos, bird.pos) <= POINT_RANGE) {
        this.state = 'pointing';
        this.pointedBirdId = bird.id;
        this.gait = 'still';
      }
      return;
    }
    this.scentCheckMs = 0;

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
      this.weavePhase += dt * WEAVE_RATE;
      const aimPt = castAimPoint(patch, env.windAngle, windCraftTier(this.profile.level));
      const aim = Math.atan2(aimPt.y - this.pos.y, aimPt.x - this.pos.x);
      this.heading = turnToward(this.heading, aim, COVER_TURN_RATE * dt);
      this.steerToAnchor(dt, env.hunterPos);
      this.advance(this.heading + Math.sin(this.weavePhase) * 0.15, this.speed * CAST_SPEED_MULT * dt);
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
          this.coverEdgeT = (this.coverEdgeT + dt * COVER_EDGE_LAP_RATE) % 1;
        }
        const edgePt = perimeterPoint(patch, this.coverEdgeT);
        const aim = Math.atan2(edgePt.y - this.pos.y, edgePt.x - this.pos.x);
        this.heading = turnToward(this.heading, aim, COVER_TURN_RATE * 2.4 * dt);
        this.advance(this.heading, this.speed * (onRim ? 1 : 1.15) * dt);
        return;
      }
      // Interior comb: tight serpentine with a soft pull toward the core
      // (pups spend almost all their budget here).
      this.weavePhase += dt * WEAVE_RATE * COVER_WEAVE_MULT;
      const toCore = Math.atan2(rectCy(patch) - this.pos.y, rectCx(patch) - this.pos.x);
      this.heading = turnToward(this.heading, toCore, 0.9 * dt);
      this.steerInsideRect(dt, patch);
      this.advance(this.heading + Math.sin(this.weavePhase) * this.weave, this.speed * dt);
      return;
    }

    // No cover worth checking: the classic open-ground sweep.
    this.gait = 'run';
    this.weavePhase += dt * WEAVE_RATE;
    this.steerOffEdges(dt);
    this.steerToAnchor(dt, env.hunterPos);
    const weave = Math.sin(this.weavePhase) * this.weave;
    this.advance(this.heading + weave, this.speed * dt);
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
    // Drop the objective if the hunter has moved on past range of it.
    if (
      this.coverIdx !== null &&
      env.hunterPos &&
      dist({ x: rectCx(patches[this.coverIdx]), y: rectCy(patches[this.coverIdx]) }, env.hunterPos) >
        this.rangeRadius * 1.2
    ) {
      this.coverIdx = null;
    }
    if (this.coverIdx !== null) return patches[this.coverIdx] ?? null;

    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < patches.length; i++) {
      if (this.checkedCovers.has(i)) continue;
      const c = { x: rectCx(patches[i]), y: rectCy(patches[i]) };
      if (env.hunterPos && dist(c, env.hunterPos) > this.rangeRadius) continue;
      const d = dist(this.pos, c);
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
      (0.85 + this.rng() * 0.3);
    this.coverWorkMsLeft = total;
    // Perimeter-first budget: pups ~0, finished dogs nearly half the clock.
    this.coverEdgeMsLeft = total * coverEdgeFraction(this.profile.level);
    this.coverEdgeT = nearestPerimeterT(p, this.pos);
    // Face the cast aim immediately so approach heading matches the objective
    // (center for pups/calm; downwind flank when wind-craft applies).
    const aim = castAimPoint(p, env.windAngle, windCraftTier(this.profile.level));
    this.heading = Math.atan2(aim.y - this.pos.y, aim.x - this.pos.x);
    return p;
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
  private steerToAnchor(dt: number, anchor?: Vec2): void {
    if (!anchor) return;
    const d = dist(this.pos, anchor);
    if (d <= this.rangeRadius) return;
    const toward = Math.atan2(anchor.y - this.pos.y, anchor.x - this.pos.x);
    const urgency = Math.min(2.5, 1 + (d - this.rangeRadius) / 50);
    this.heading = turnToward(this.heading, toward, ANCHOR_TURN_RATE * urgency * dt);
  }

  /**
   * A covey rose: steady dogs stand through it and mark the fall; soft dogs
   * break chase (and won't have marked anything). Returns true if it broke.
   */
  onFlush(rng: RNG, toward: Vec2): boolean {
    if (rng() >= breedBreakChance(this.profile.breed, this.profile.level)) return false;
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
      if (b.state !== state) continue;
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
    this.pos = {
      x: clamp(this.pos.x + Math.cos(heading) * distance, this.bounds.x + 4, this.bounds.x + this.bounds.w - 4),
      y: clamp(this.pos.y + Math.sin(heading) * distance, this.bounds.y + 4, this.bounds.y + this.bounds.h - 4),
    };
  }
}
