import { dist } from './math';
import type { RNG, Vec2 } from './types';

/** True if a shot aimed at `aim` connects with a bird at `birdPos`. */
export function hitTest(aim: Vec2, birdPos: Vec2, spreadRadius: number): boolean {
  return dist(aim, birdPos) <= spreadRadius;
}

/**
 * Initial escape velocity for a flushed bird. Screen coordinates have y
 * pointing down, so a negative y means climbing. Always climbs, with the
 * sideways component varying by bird.
 */
export function escapeVelocity(rng: RNG = Math.random): Vec2 {
  const speed = 120 + rng() * 50;
  const angle = Math.PI / 2 + (rng() * 2 - 1) * (Math.PI / 3); // straight up ± 60°
  return {
    x: Math.cos(angle) * speed,
    y: -Math.abs(Math.sin(angle)) * speed,
  };
}
