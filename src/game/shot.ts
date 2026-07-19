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
