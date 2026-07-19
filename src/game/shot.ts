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

/**
 * A covey rise fans out: each bird gets its own slice of the species'
 * escape arc (plus a little jitter) instead of an independent roll, so
 * covey mates never stack on the same bearing. Slot 0 of N takes the
 * leftmost slice, the last the rightmost.
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
  const jitter = count <= 1 ? 0 : (rng() * 2 - 1) * (halfArc / count) * 0.6;
  // Screen coords: angles past PI/2 point left, so negate the slice offset
  // to keep slot 0 on the left.
  const angle = Math.PI / 2 - (2 * t - 1) * halfArc + jitter;
  return {
    x: Math.cos(angle) * speed,
    y: -Math.abs(Math.sin(angle)) * speed,
  };
}
