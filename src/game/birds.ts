import { COVER_PATCHES, randomPointIn } from './field';
import type { RNG, Vec2 } from './types';

export type BirdState = 'hidden' | 'flushed' | 'downed' | 'escaped';

export interface Bird {
  id: number;
  pos: Vec2;
  state: BirdState;
}

let nextBirdId = 1;

/** Scatter birds through the cover patches. */
export function spawnBirds(count: number, rng: RNG = Math.random): Bird[] {
  const birds: Bird[] = [];
  for (let i = 0; i < count; i++) {
    const patch = COVER_PATCHES[Math.floor(rng() * COVER_PATCHES.length)];
    birds.push({ id: nextBirdId++, pos: randomPointIn(patch, rng), state: 'hidden' });
  }
  return birds;
}
