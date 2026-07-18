import { COVER_PATCHES, FIELD_BOUNDS, randomPointIn } from './field';
import { clamp } from './math';
import type { RNG, Vec2 } from './types';

export type BirdState = 'hidden' | 'flushed' | 'downed' | 'escaped';

export interface Bird {
  id: number;
  coveyId: number;
  pos: Vec2;
  state: BirdState;
}

const COVEY_MAX_SIZE = 3;
const COVEY_JITTER = 10; // birds sit within this of their covey anchor

let nextBirdId = 1;

/** Scatter birds through the cover patches in coveys of 1–3. */
export function spawnBirds(count: number, rng: RNG = Math.random): Bird[] {
  const birds: Bird[] = [];
  let coveyId = 0;
  let remaining = count;
  while (remaining > 0) {
    const size = Math.min(remaining, 1 + Math.floor(rng() * COVEY_MAX_SIZE));
    const patch = COVER_PATCHES[Math.floor(rng() * COVER_PATCHES.length)];
    const anchor = randomPointIn(patch, rng);
    for (let i = 0; i < size; i++) {
      birds.push({
        id: nextBirdId++,
        coveyId,
        pos: {
          x: clamp(anchor.x + (rng() * 2 - 1) * COVEY_JITTER, 4, FIELD_BOUNDS.w - 4),
          y: clamp(anchor.y + (rng() * 2 - 1) * COVEY_JITTER, 4, FIELD_BOUNDS.h - 4),
        },
        state: 'hidden',
      });
    }
    coveyId++;
    remaining -= size;
  }
  return birds;
}

/**
 * Flush a whole covey: the trigger bird plus every other hidden bird in its
 * covey. Returns the birds that took wing (always includes the trigger).
 */
export function flushCovey(birds: Bird[], birdId: number): Bird[] {
  const trigger = birds.find((b) => b.id === birdId);
  if (!trigger) return [];
  const flushed: Bird[] = [];
  for (const b of birds) {
    if (b.state === 'hidden' && b.coveyId === trigger.coveyId) {
      b.state = 'flushed';
      flushed.push(b);
    }
  }
  return flushed;
}
