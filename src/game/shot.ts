import { dist } from './math';
import type { FlightStyle } from './species';
import type { RNG, Vec2 } from './types';

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
 * escape arc (slot 0 leftmost), a guaranteed lateral push away from the
 * covey's center, and a golden-ratio speed scatter — so covey mates
 * diverge in bearing, spacing, AND depth instead of flying formation.
 * A steep climber like a bobwhite has a narrow arc; the push is what
 * keeps six of them from riding the same elevator.
 */
export function escapeVelocityFan(
  flight: FlightStyle,
  slot: number,
  count: number,
  rng: RNG = Math.random,
): Vec2 {
  // Golden-ratio stepping scatters speeds across the covey instead of
  // clustering them near the middle of the range.
  const speedT = count <= 1 ? rng() : (((slot * 0.61) % 1) * 0.7 + rng() * 0.3);
  const speed = flight.speedMin + speedT * (flight.speedMax - flight.speedMin);
  const halfArc = (Math.PI / 3) * Math.max(0.12, 1.15 - flight.climb);
  const t = count <= 1 ? rng() : (slot + 0.5) / count;
  const jitter = count <= 1 ? 0 : (rng() * 2 - 1) * (halfArc / count) * 0.6;
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
