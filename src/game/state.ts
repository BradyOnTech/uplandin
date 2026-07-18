import { spawnBirds, type Bird } from './birds';
import { FIELD_BOUNDS } from './field';
import type { RNG, Vec2 } from './types';

/**
 * Everything that needs to survive a scene transition. Plain data, passed
 * from FieldScene to FlushScene and back via Phaser's scene-start payload.
 */
export interface HuntState {
  birds: Bird[];
  dogPos: Vec2;
  hunterPos: Vec2;
  downed: number;
  escaped: number;
}

export function createHunt(birdCount = 6, rng: RNG = Math.random): HuntState {
  return {
    birds: spawnBirds(birdCount, rng),
    dogPos: { x: FIELD_BOUNDS.w / 2 - 30, y: FIELD_BOUNDS.h - 30 },
    hunterPos: { x: FIELD_BOUNDS.w / 2, y: FIELD_BOUNDS.h - 20 },
    downed: 0,
    escaped: 0,
  };
}

export function birdsRemaining(hunt: HuntState): number {
  return hunt.birds.filter((b) => b.state === 'hidden').length;
}

/** A hunt is over once no bird is still hidden or mid-flush. */
export function huntComplete(hunt: HuntState): boolean {
  return hunt.birds.every((b) => b.state !== 'hidden' && b.state !== 'flushed');
}
