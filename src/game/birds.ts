import { COVER_PATCHES, FIELD_BOUNDS, randomPointIn } from './field';
import { clamp, dist } from './math';
import type { RNG, Vec2 } from './types';

export type BirdState = 'hidden' | 'flushed' | 'downed' | 'escaped' | 'retrieved';

export interface Bird {
  id: number;
  coveyId: number;
  pos: Vec2;
  state: BirdState;
  /** Runners (pheasant-types) flee the dog on foot instead of holding tight. */
  runs: boolean;
  /** ms of running left before the bird is winded and must hold. */
  runEnergy: number;
  /** ms left holding still to recover. */
  restingMs: number;
  /** ms of being pointed the bird will tolerate before flushing wild. */
  nerveMs: number;
}

const COVEY_MAX_SIZE = 3;
const COVEY_JITTER = 10; // birds sit within this of their covey anchor

export const RUNNER_CHANCE = 0.4; // share of birds that are runners
export const RUNNER_FLEE_RADIUS = 35; // dog this close spooks a runner into running
export const RUNNER_SPEED = 42; // px/s — slower than the dog, but it gets a head start
export const RUNNER_MAX_ENERGY = 2500; // ms of running before the bird is winded
export const RUNNER_REST_MS = 2600; // how long a winded bird holds — the hunter's window

export const NERVE_MIN_MS = 5000; // the calmest bird holds this long on point
export const NERVE_MAX_MS = 9000; // the steadiest
export const RUNNER_NERVE_FACTOR = 0.7; // runners are nervous

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
      const runs = rng() < RUNNER_CHANCE;
      const nerveRoll = rng();
      birds.push({
        id: nextBirdId++,
        coveyId,
        pos: {
          x: clamp(anchor.x + (rng() * 2 - 1) * COVEY_JITTER, 4, FIELD_BOUNDS.w - 4),
          y: clamp(anchor.y + (rng() * 2 - 1) * COVEY_JITTER, 4, FIELD_BOUNDS.h - 4),
        },
        state: 'hidden',
        runs,
        runEnergy: RUNNER_MAX_ENERGY,
        restingMs: 0,
        nerveMs:
          (NERVE_MIN_MS + nerveRoll * (NERVE_MAX_MS - NERVE_MIN_MS)) * (runs ? RUNNER_NERVE_FACTOR : 1),
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

/**
 * A pointed bird gets nervous. When its nerve runs out it flushes wild —
 * returns the trigger bird if one broke this tick, else null. Only the
 * pointed bird's nerve drains; a covey rises when any member breaks.
 */
export function updateBirdNerve(dtMs: number, birds: Bird[], pointedBirdId: number | null): Bird | null {
  if (pointedBirdId === null) return null;
  const b = birds.find((x) => x.id === pointedBirdId);
  if (!b || b.state !== 'hidden') return null;
  b.nerveMs -= dtMs;
  return b.nerveMs <= 0 ? b : null;
}

/**
 * Move runner birds. A hidden runner flees the dog while it has energy,
 * then holds still to recover — that's the dog's (and hunter's) window.
 * Only the dog spooks them; the hunter walking up doesn't.
 */
export function updateBirds(dtMs: number, birds: Bird[], dogPos: Vec2): void {
  const dt = dtMs / 1000;
  for (const b of birds) {
    if (b.state !== 'hidden' || !b.runs) continue;
    if (b.restingMs > 0) {
      b.restingMs = Math.max(0, b.restingMs - dtMs);
      continue;
    }
    if (dist(b.pos, dogPos) > RUNNER_FLEE_RADIUS) continue;
    if (b.runEnergy <= 0) {
      b.restingMs = RUNNER_REST_MS;
      b.runEnergy = RUNNER_MAX_ENERGY;
      continue;
    }
    b.runEnergy -= dtMs;
    const away = Math.atan2(b.pos.y - dogPos.y, b.pos.x - dogPos.x);
    b.pos = {
      x: clamp(b.pos.x + Math.cos(away) * RUNNER_SPEED * dt, 4, FIELD_BOUNDS.w - 4),
      y: clamp(b.pos.y + Math.sin(away) * RUNNER_SPEED * dt, 4, FIELD_BOUNDS.h - 4),
    };
  }
}
