import { dist } from './math';
import type { FlightStyle } from './species';
import type { RNG, Vec2 } from './types';

/*
 * Pure shot-view math: hit testing, the covey fan, walk-in difficulty
 * (flushBias + wild/gift), and the exit-drive flight phases. Every
 * constant here is a gameplay knob — see docs/TUNING.md for the map and
 * the two laws (Duck Hunt rules the sky; skill loads the dice).
 */

/** True if a shot aimed at `aim` connects with a bird at `birdPos`. */
export function hitTest(aim: Vec2, birdPos: Vec2, spreadRadius: number): boolean {
  return dist(aim, birdPos) <= spreadRadius;
}

/** Fallback flight for anything without a species (tests, legacy paths). */
export const DEFAULT_FLIGHT: FlightStyle = { speedMin: 120, speedMax: 170, climb: 0.7, wobble: 24 };

/**
 * Initial escape velocity for a flushed bird, shaped by its species. Screen
 * coordinates have y pointing down, so negative y climbs. `climb` narrows
 * the arc around straight-up: a towering woodcock goes nearly vertical, a
 * low burner fans out to ±60°.
 */
export function escapeVelocity(flight: FlightStyle = DEFAULT_FLIGHT, rng: RNG = Math.random): Vec2 {
  const speed = flight.speedMin + rng() * (flight.speedMax - flight.speedMin);
  const halfArc = (Math.PI / 3) * Math.max(0.12, 1.15 - flight.climb);
  const angle = Math.PI / 2 + (rng() * 2 - 1) * halfArc;
  return {
    x: Math.cos(angle) * speed,
    y: -Math.abs(Math.sin(angle)) * speed,
  };
}

/** Lateral divergence added per covey slot (px/s) — guarantees separation
 * even for steep climbers whose escape arc is narrow. */
export const FAN_SPREAD_PUSH = 24;

/**
 * A covey rise fans out: each bird gets its own slice of the species'
 * escape arc (slot 0 leftmost), full-slice bearing jitter, a random speed
 * within the species range, and a guaranteed lateral push away from the
 * covey's center — so covey mates diverge instead of flying formation.
 * A steep climber like a bobwhite has a narrow arc; the push is what
 * keeps six of them from riding the same elevator. (The caller layers on
 * per-flush drift, speed rolls, and slope/young multipliers — see the
 * FlushScene pipeline docblock.)
 */
export function escapeVelocityFan(
  flight: FlightStyle,
  slot: number,
  count: number,
  rng: RNG = Math.random,
): Vec2 {
  const speed = flight.speedMin + rng() * (flight.speedMax - flight.speedMin);
  const halfArc = (Math.PI / 3) * Math.max(0.12, 1.15 - flight.climb);
  const t = count <= 1 ? rng() : (slot + 0.5) / count;
  // Full-slice jitter keeps consecutive flushes from flying carbon-copy
  // bearings; the lateral push still guarantees separation.
  const jitter = count <= 1 ? 0 : (rng() * 2 - 1) * (halfArc / count);
  // Screen coords: angles past PI/2 point left, so negate the slice offset
  // to keep slot 0 on the left.
  const angle = Math.PI / 2 - (2 * t - 1) * halfArc + jitter;
  const push = count <= 1 ? 0 : (slot - (count - 1) / 2) * FAN_SPREAD_PUSH;
  return {
    x: Math.cos(angle) * speed + push,
    y: -Math.abs(Math.sin(angle)) * speed,
  };
}

// The tilted playfield: an arcade target must always threaten to leave.
// Whatever a bird's flight phase, it accelerates toward a screen exit —
// floating mid-screen is realism the game can't afford.
export const GLIDE_SINK = 18; // px/s of gentle descent on locked wings
export const GLIDE_ACCEL = 130; // px/s² toward the exit
export const GLIDE_MAX = 150; // glide exit speed cap
export const LEVEL_ACCEL = 150; // the rooster pours it on harder
export const LEVEL_MAX = 210;

export const WILD_RISE_CHANCE = 0.18; // birds do wild bird things
export const GIFT_RISE_CHANCE = 0.08; // ...and sometimes they sit like stones

export interface FlushBias {
  min: number;
  max: number;
  /** earned: your walk-in decided it. wild: they blew out anyway. gift: they sat tight anyway. */
  kind: 'earned' | 'wild' | 'gift';
}

/**
 * Skill-linked difficulty — but skill loads the dice, it never replaces
 * them. Usually, how well you walked in decides the rise: point-blank over
 * a solid point → big close birds; a scramble at the edge of range → small
 * birds already going away. But some rises are WILD no matter how well you
 * did (they behave like an edge-of-range scramble), and a few are gifts no
 * matter how badly you did. Even a perfect hunter gets surprised.
 */
export function flushBias(flushDistance: number, rng: RNG = Math.random): FlushBias {
  const roll = rng();
  let t = Math.max(0, Math.min(1, (flushDistance - 8) / 32)); // 8px point-blank .. 40px max range
  let kind: FlushBias['kind'] = 'earned';
  if (roll < WILD_RISE_CHANCE) {
    kind = 'wild';
    t = Math.max(t, 0.72 + rng() * 0.28);
  } else if (roll < WILD_RISE_CHANCE + GIFT_RISE_CHANCE) {
    kind = 'gift';
    t = Math.min(t, rng() * 0.2);
  }
  return { min: 0.9 - 0.3 * t, max: 1.15 - 0.35 * t, kind };
}

/** Which side a bird should leave by: with its momentum, else the nearer edge. */
export function exitDirFor(velX: number, x: number, screenW = 480): 1 | -1 {
  if (Math.abs(velX) > 20) return velX > 0 ? 1 : -1;
  return x >= screenW / 2 ? 1 : -1;
}

/** Quail glide: wings locked, gentle sink, always accelerating off-screen. */
export function glideStep(vel: Vec2, exitDir: 1 | -1, dt: number): void {
  vel.y += (GLIDE_SINK - vel.y) * Math.min(1, dt * 2.2);
  vel.x += exitDir * GLIDE_ACCEL * dt;
  if (vel.x * exitDir > GLIDE_MAX) vel.x = GLIDE_MAX * exitDir;
}

/** Rooster level-off: climb dies, speed builds — a fast crossing exit. */
export function levelStep(vel: Vec2, exitDir: 1 | -1, dt: number): void {
  vel.y += (0 - vel.y) * Math.min(1, dt * 2.5);
  vel.x += exitDir * LEVEL_ACCEL * dt;
  if (vel.x * exitDir > LEVEL_MAX) vel.x = LEVEL_MAX * exitDir;
}
