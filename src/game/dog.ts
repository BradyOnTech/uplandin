import type { Bird } from './birds';
import { FIELD_BOUNDS } from './field';
import { clamp, dist, turnToward } from './math';
import type { RNG, Vec2 } from './types';

export type DogState = 'quartering' | 'tracking' | 'pointing' | 'retrieving' | 'recalled';

export const DOG_SPEED = 75; // px/s while quartering
export const TRACKING_SPEED = 90; // px/s once it has the scent
export const SCENT_RADIUS = 45; // smells a hidden bird this far away
export const POINT_RANGE = 12; // freezes into a point this close

const WEAVE_AMPLITUDE = 0.7; // radians of serpentine swing while quartering
const WEAVE_RATE = 2.2; // how fast the weave swings
const EDGE_MARGIN = 14;
const EDGE_TURN_RATE = 2.4; // rad/s pulled back toward the middle of the field
const AVOID_HUNTER_RADIUS = 28; // won't point a bird sitting right on the hunter
const RETRIEVE_RANGE = 6; // close enough to pick a downed bird up
const RETRIEVE_HOLD_MS = 700; // mouthing the bird takes a moment
const RECALL_SPEED = 115; // px/s coming back to the whistle
const RECALL_ARRIVE = 10; // close enough to the hunter to count as arrived

/** Environment the dog is hunting in for this tick. */
export interface DogEnv {
  hunterPos?: Vec2;
  /** Direction the wind blows TOWARD (radians, screen coords). Undefined = calm. */
  windAngle?: number;
  /** A whistle blast this tick. Never breaks a point or a retrieve. */
  recall?: boolean;
}

/**
 * How far the dog can smell a bird that sits `dx, dy` away from it,
 * accounting for wind. Scent travels with the wind, so a bird upwind of the
 * dog can be smelled from far off; a bird downwind is nearly invisible.
 */
export function scentRange(windAngle: number | undefined, dx: number, dy: number): number {
  if (windAngle === undefined) return SCENT_RADIUS;
  const d = Math.hypot(dx, dy);
  if (d === 0) return SCENT_RADIUS;
  // +1 = bird dead downwind of the dog (worst); -1 = dead upwind (best)
  const windDot = (dx * Math.cos(windAngle) + dy * Math.sin(windAngle)) / d;
  const mult = 1.125 - 0.775 * windDot; // 1.9x upwind .. 1.125x crosswind .. 0.35x downwind
  return SCENT_RADIUS * mult;
}

/**
 * Pure bird-dog AI. No Phaser in here — feed it birds and a timestep,
 * read back its position and state. Tuning these constants is where the
 * "feel" of the hunt lives.
 */
export class Dog {
  state: DogState = 'quartering';
  pointedBirdId: number | null = null;
  /** Base travel direction; the quartering weave oscillates around this. */
  heading: number;
  private weavePhase = 0;
  private retrieveTargetId: number | null = null;
  private retrieveHoldMs = 0;

  constructor(public pos: Vec2, rng: RNG = Math.random) {
    this.heading = rng() * Math.PI * 2;
  }

  update(dtMs: number, birds: Bird[], env: DogEnv = {}): void {
    const dt = dtMs / 1000;

    if (env.recall && (this.state === 'quartering' || this.state === 'tracking')) {
      this.state = 'recalled';
    }

    if (this.state === 'recalled') {
      if (!env.hunterPos || dist(this.pos, env.hunterPos) <= RECALL_ARRIVE) {
        this.state = 'quartering';
        return;
      }
      this.heading = Math.atan2(env.hunterPos.y - this.pos.y, env.hunterPos.x - this.pos.x);
      this.advance(this.heading, RECALL_SPEED * dt);
      return;
    }

    if (this.state === 'pointing') {
      const pointed = birds.find((b) => b.id === this.pointedBirdId);
      if (!pointed || pointed.state !== 'hidden') {
        // Bird flushed or collected — cast off and hunt again.
        this.state = 'quartering';
        this.pointedBirdId = null;
      } else if (dist(this.pos, pointed.pos) > POINT_RANGE * 2) {
        // A running bird broke the point — road it.
        this.state = 'tracking';
        this.pointedBirdId = null;
      }
      return; // holding the point: don't move
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
        this.advance(this.heading, TRACKING_SPEED * dt);
      } else {
        this.retrieveHoldMs += dtMs;
        if (this.retrieveHoldMs >= RETRIEVE_HOLD_MS) {
          target.state = 'retrieved';
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
      this.heading = Math.atan2(bird.pos.y - this.pos.y, bird.pos.x - this.pos.x);
      this.advance(this.heading, TRACKING_SPEED * dt);
      if (dist(this.pos, bird.pos) <= POINT_RANGE) {
        this.state = 'pointing';
        this.pointedBirdId = bird.id;
      }
      return;
    }

    // Quartering: serpentine sweep back and forth across the field.
    this.state = 'quartering';
    this.weavePhase += dt * WEAVE_RATE;
    this.steerOffEdges(dt);
    const weave = Math.sin(this.weavePhase) * WEAVE_AMPLITUDE;
    this.advance(this.heading + weave, DOG_SPEED * dt);
  }

  private nearestBird(birds: Bird[], state: Bird['state']): Bird | null {
    let best: Bird | null = null;
    let bestDist = Infinity;
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

  private nearestHiddenBird(birds: Bird[], env: DogEnv): Bird | null {
    let best: Bird | null = null;
    let bestRange = Infinity;
    for (const b of birds) {
      if (b.state !== 'hidden') continue;
      if (env.hunterPos && dist(b.pos, env.hunterPos) <= AVOID_HUNTER_RADIUS) continue;
      const d = dist(this.pos, b.pos);
      const range = scentRange(env.windAngle, b.pos.x - this.pos.x, b.pos.y - this.pos.y);
      if (d <= range && d < bestRange) {
        best = b;
        bestRange = d;
      }
    }
    return best;
  }

  private steerOffEdges(dt: number): void {
    const { x, y } = this.pos;
    let dx = 0;
    let dy = 0;
    if (x < EDGE_MARGIN) dx += 1;
    if (x > FIELD_BOUNDS.w - EDGE_MARGIN) dx -= 1;
    if (y < EDGE_MARGIN) dy += 1;
    if (y > FIELD_BOUNDS.h - EDGE_MARGIN) dy -= 1;
    if (dx !== 0 || dy !== 0) {
      this.heading = turnToward(this.heading, Math.atan2(dy, dx), EDGE_TURN_RATE * dt);
    }
  }

  private advance(heading: number, distance: number): void {
    this.pos = {
      x: clamp(this.pos.x + Math.cos(heading) * distance, 4, FIELD_BOUNDS.w - 4),
      y: clamp(this.pos.y + Math.sin(heading) * distance, 4, FIELD_BOUNDS.h - 4),
    };
  }
}
