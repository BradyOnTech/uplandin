import { FIELD_BOUNDS, randomPointIn, type Rect } from './field';
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

const COVEY_JITTER = 10; // birds sit within this of their covey anchor

export const RUNNER_FLEE_RADIUS = 35; // dog this close spooks a runner into running
export const RUNNER_SPEED = 42; // px/s — slower than the dog, but it gets a head start
export const RUNNER_MAX_ENERGY = 2500; // ms of running before the bird is winded
export const RUNNER_REST_MS = 2600; // how long a winded bird holds — the hunter's window
export const RUNNER_NERVE_FACTOR = 0.7; // runners are nervous

/** What an area's bird population looks like. */
export interface SpawnConfig {
  patches: Rect[];
  birdCount: number;
  coveyMaxSize: number;
  runnerChance: number;
  nerveMinMs: number;
  nerveMaxMs: number;
  /** World the birds live in; defaults to FIELD_BOUNDS. */
  bounds?: Rect;
}

let nextBirdId = 1;

/** Scatter birds through the area's cover patches in coveys. */
export function spawnBirds(cfg: SpawnConfig, rng: RNG = Math.random): Bird[] {
  const bounds = cfg.bounds ?? FIELD_BOUNDS;
  const birds: Bird[] = [];
  let coveyId = 0;
  let remaining = cfg.birdCount;
  while (remaining > 0) {
    const size = Math.min(remaining, 1 + Math.floor(rng() * cfg.coveyMaxSize));
    const patch = cfg.patches[Math.floor(rng() * cfg.patches.length)];
    const anchor = randomPointIn(patch, rng);
    for (let i = 0; i < size; i++) {
      const runs = rng() < cfg.runnerChance;
      const nerveRoll = rng();
      birds.push({
        id: nextBirdId++,
        coveyId,
        pos: {
          x: clamp(anchor.x + (rng() * 2 - 1) * COVEY_JITTER, bounds.x + 4, bounds.x + bounds.w - 4),
          y: clamp(anchor.y + (rng() * 2 - 1) * COVEY_JITTER, bounds.y + 4, bounds.y + bounds.h - 4),
        },
        state: 'hidden',
        runs,
        runEnergy: RUNNER_MAX_ENERGY,
        restingMs: 0,
        nerveMs:
          (cfg.nerveMinMs + nerveRoll * (cfg.nerveMaxMs - cfg.nerveMinMs)) *
          (runs ? RUNNER_NERVE_FACTOR : 1),
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
 * pressureMult scales the drain: crowding puppies > 1, steady veterans < 1.
 */
export function updateBirdNerve(
  dtMs: number,
  birds: Bird[],
  pointedBirdId: number | null,
  pressureMult = 1,
): Bird | null {
  if (pointedBirdId === null) return null;
  const b = birds.find((x) => x.id === pointedBirdId);
  if (!b || b.state !== 'hidden') return null;
  b.nerveMs -= dtMs * pressureMult;
  return b.nerveMs <= 0 ? b : null;
}

/**
 * Birds have noses too. A hidden bird downwind of the dog — the wind carries
 * the dog's scent straight to it — flushes the moment the dog gets within
 * `radius`. Returns the trigger birds (scene flushes their coveys). Radius
 * comes from the dog's wind-craft tier; 0 disables this entirely.
 */
export function birdsScentingDog(
  birds: Bird[],
  dogPos: Vec2,
  windAngle: number | undefined,
  radius: number,
): Bird[] {
  if (windAngle === undefined || radius <= 0) return [];
  const wx = Math.cos(windAngle);
  const wy = Math.sin(windAngle);
  const scented: Bird[] = [];
  for (const b of birds) {
    if (b.state !== 'hidden') continue;
    const dx = b.pos.x - dogPos.x;
    const dy = b.pos.y - dogPos.y;
    const d = Math.hypot(dx, dy);
    if (d === 0 || d > radius) continue;
    // >0.6: the bird sits mostly downwind of the dog
    if ((dx * wx + dy * wy) / d > 0.6) scented.push(b);
  }
  return scented;
}

/**
 * A sprinting hunter is loud: hidden birds this close flush wild underfoot.
 * Returns the trigger birds (scene flushes their coveys).
 */
export function birdsSpookedBy(birds: Bird[], pos: Vec2, radius: number): Bird[] {
  return birds.filter((b) => b.state === 'hidden' && dist(b.pos, pos) <= radius);
}

/**
 * Move runner birds. A hidden runner flees the dog while it has energy,
 * then holds still to recover — that's the dog's (and hunter's) window.
 * Only the dog spooks them; the hunter walking up doesn't.
 */
export function updateBirds(dtMs: number, birds: Bird[], dogPos: Vec2, bounds: Rect = FIELD_BOUNDS): void {
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
      x: clamp(b.pos.x + Math.cos(away) * RUNNER_SPEED * dt, bounds.x + 4, bounds.x + bounds.w - 4),
      y: clamp(b.pos.y + Math.sin(away) * RUNNER_SPEED * dt, bounds.y + 4, bounds.y + bounds.h - 4),
    };
  }
}
