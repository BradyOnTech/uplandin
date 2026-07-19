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
  | 'retrieving'
  | 'recalled'
  | 'heel'
  | 'breaking';

export const DOG_SPEED = 75; // base px/s while quartering, before breed multipliers
export const TRACKING_SPEED = 90; // base px/s once it has the scent
export const SCENT_RADIUS = 45; // base scent range, before nose multipliers
export const POINT_RANGE = 12; // freezes into a point this close
export const QUARTER_RANGE = 130; // base hunter-anchored quartering radius, × Range multiplier
export const WHISTLE_RANGE = 250; // the whistle only carries this far

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

/** Environment the dog is hunting in for this tick. */
export interface DogEnv {
  hunterPos?: Vec2;
  /** Direction the wind blows TOWARD (radians, screen coords). Undefined = calm. */
  windAngle?: number;
  /** Wind-strength multiplier on scent reach (strong wind carries scent farther). */
  scentMult?: number;
  /** A whistle blast this tick. Never breaks a point or a retrieve. */
  recall?: boolean;
}

export interface DogProfile {
  breed: BreedConfig;
  level: number;
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

  private rng: RNG;
  private weavePhase = 0;
  private retrieveTargetId: number | null = null;
  private retrieveHoldMs = 0;
  private creepPlanned = false;
  private creepStepsLeft = 0;
  private creepTimerMs = 0;
  private breakMsLeft = 0;

  constructor(
    public pos: Vec2,
    public profile: DogProfile,
    rng: RNG = Math.random,
    public bounds: Rect = FIELD_BOUNDS,
  ) {
    this.heading = rng() * Math.PI * 2;
    this.rng = rng;
    this.maxStaminaMs = breedStaminaMs(profile.breed, profile.level);
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
    return DOG_SPEED * speedMult(this.profile.breed, this.profile.level) * this.fatigueMult;
  }

  private get trackSpeed(): number {
    return TRACKING_SPEED * speedMult(this.profile.breed, this.profile.level) * this.fatigueMult;
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

    // The whistle only carries so far — a big-running dog can be out of earshot.
    const hearsWhistle = !env.hunterPos || dist(this.pos, env.hunterPos) <= WHISTLE_RANGE;
    if (env.recall && hearsWhistle && (this.state === 'quartering' || this.state === 'tracking')) {
      this.state = 'recalled';
    }

    if (this.state === 'recalled') {
      if (!env.hunterPos || dist(this.pos, env.hunterPos) <= RECALL_ARRIVE) {
        this.state = 'heel'; // waits at heel until cast off
        return;
      }
      this.heading = Math.atan2(env.hunterPos.y - this.pos.y, env.hunterPos.x - this.pos.x);
      this.advance(this.heading, RECALL_SPEED * dt);
      return;
    }

    if (this.state === 'heel') {
      this.staminaMs = Math.min(this.maxStaminaMs, this.staminaMs + dtMs * HEEL_RECOVER_MULT);
      if (env.hunterPos && dist(this.pos, env.hunterPos) > HEEL_FOLLOW) {
        this.heading = Math.atan2(env.hunterPos.y - this.pos.y, env.hunterPos.x - this.pos.x);
        this.advance(this.heading, RECALL_SPEED * 0.8 * dt);
      }
      return;
    }

    if (this.state === 'breaking') {
      this.work(dtMs);
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
        this.retrieveHoldMs = 0;
        this.heading = Math.atan2(target.pos.y - this.pos.y, target.pos.x - this.pos.x);
        this.advance(this.heading, this.trackSpeed * dt);
      } else {
        this.retrieveHoldMs += dtMs;
        const holdNeeded = RETRIEVE_HOLD_MS + (this.needsSearch ? SEARCH_HOLD_MS : 0);
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

    const bird = this.nearestHiddenBird(birds, env);
    if (bird) {
      this.state = 'tracking';
      this.work(dtMs);
      this.heading = Math.atan2(bird.pos.y - this.pos.y, bird.pos.x - this.pos.x);
      this.advance(this.heading, this.trackSpeed * dt);
      if (dist(this.pos, bird.pos) <= POINT_RANGE) {
        this.state = 'pointing';
        this.pointedBirdId = bird.id;
      }
      return;
    }

    // Quartering: serpentine sweep, anchored to the hunter out to Range.
    this.state = 'quartering';
    this.work(dtMs);
    this.weavePhase += dt * WEAVE_RATE;
    this.steerOffEdges(dt);
    this.steerToAnchor(dt, env.hunterPos);
    const weave = Math.sin(this.weavePhase) * this.weave;
    this.advance(this.heading + weave, this.speed * dt);
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
