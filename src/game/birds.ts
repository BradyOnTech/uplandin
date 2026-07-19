import { FIELD_BOUNDS, randomPointIn, type Rect } from './field';
import { clamp, dist } from './math';
import { getSpecies, rollSpecies, type SpeciesShare } from './species';
import type { RNG, Vec2 } from './types';

export type BirdState = 'hidden' | 'flushed' | 'downed' | 'escaped' | 'retrieved';

export interface Bird {
  id: number;
  coveyId: number;
  speciesId: string;
  pos: Vec2;
  state: BirdState;
  /** Ringneck rule: hens are protected. Only set for henRule species. */
  sex?: 'hen' | 'rooster';
  /** A relit covey survivor — holds tight, and next escape is for good. */
  single?: boolean;
  /** Hun circle-back already used — the next wild flush is for good. */
  circled?: boolean;
  /** Young-of-year: naive early-season bird — sits longer, flies slower. */
  young?: boolean;
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

export const SINGLE_NERVE_MULT = 1.7; // relit singles hold very tight
export const RELIGHT_CHANCE = 0.65; // the rest are gone to the next county
const SINGLE_SCATTER_MIN = 140; // survivors put real ground behind them...
const SINGLE_SCATTER_MAX = 420;
const SINGLE_NEAR_COVER = 70; // ...but sometimes drop into surprisingly close cover

/** What an area's bird population looks like. */
export interface SpawnConfig {
  patches: Rect[];
  birdCount: number;
  speciesMix: SpeciesShare[];
  /** World the birds live in; defaults to FIELD_BOUNDS. */
  bounds?: Rect;
  /** Wind strength shortens nerve (strong wind = jumpy birds). */
  nerveMult?: number;
  /** Share of birds that are naive young-of-year (early season). */
  youngShare?: number;
}

export const YOUNG_NERVE_MULT = 1.3; // a young bird sits longer
export const YOUNG_FLIGHT_MULT = 0.9; // and flies slower when it finally goes

let nextBirdId = 1;

/** Scatter birds through the area's cover patches in coveys, species by weighted mix. */
export function spawnBirds(cfg: SpawnConfig, rng: RNG = Math.random): Bird[] {
  const bounds = cfg.bounds ?? FIELD_BOUNDS;
  const nerveMult = cfg.nerveMult ?? 1;
  // Mix weights mean share of BIRDS, but we roll per covey — so divide each
  // weight by the species' average covey size, or big-covey species (a
  // 9-bird hun covey vs a 2-bird ringneck pair) would eat the stocking.
  const coveyMix = cfg.speciesMix.map((s) => {
    const sp = getSpecies(s.speciesId);
    return { speciesId: s.speciesId, weight: s.weight / ((sp.coveyMin + sp.coveyMax) / 2) };
  });
  const birds: Bird[] = [];
  let coveyId = 0;
  let remaining = cfg.birdCount;
  while (remaining > 0) {
    const species = rollSpecies(coveyMix, rng());
    const size = Math.min(
      remaining,
      species.coveyMin + Math.floor(rng() * (species.coveyMax - species.coveyMin + 1)),
    );
    const patch = cfg.patches[Math.floor(rng() * cfg.patches.length)];
    const anchor = randomPointIn(patch, rng);
    for (let i = 0; i < size; i++) {
      const young = rng() < (cfg.youngShare ?? 0);
      // Young birds haven't learned to run from a dog yet.
      const runs = rng() < species.runnerChance * (young ? 0.5 : 1);
      const nerveRoll = rng();
      birds.push({
        id: nextBirdId++,
        coveyId,
        speciesId: species.id,
        pos: {
          x: clamp(anchor.x + (rng() * 2 - 1) * COVEY_JITTER, bounds.x + 4, bounds.x + bounds.w - 4),
          y: clamp(anchor.y + (rng() * 2 - 1) * COVEY_JITTER, bounds.y + 4, bounds.y + bounds.h - 4),
        },
        state: 'hidden',
        sex: species.henRule ? (rng() < 0.5 ? 'hen' : 'rooster') : undefined,
        young: young || undefined,
        runs,
        runEnergy: RUNNER_MAX_ENERGY,
        restingMs: 0,
        nerveMs:
          (species.nerveMinMs + nerveRoll * (species.nerveMaxMs - species.nerveMinMs)) *
          (runs ? RUNNER_NERVE_FACTOR : 1) *
          (young ? YOUNG_NERVE_MULT : 1) *
          nerveMult,
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
 * Hunt the singles: SOME covey survivors of a shooting opportunity relight
 * and hold tight — the rest are simply gone. The ones that stay mostly
 * make for the next cover patch (occasionally surprisingly close, often a
 * real hike away); in open country they put a long random put-down behind
 * them. A bird only relights once. Mutates and returns the relit birds.
 */
export function relightSurvivors(
  birds: Bird[],
  escapedIds: number[],
  bounds: Rect,
  rng: RNG = Math.random,
  nerveMult = 1,
  patches: Rect[] = [],
): Bird[] {
  const relit: Bird[] = [];
  for (const id of escapedIds) {
    const b = birds.find((x) => x.id === id);
    if (!b || b.state !== 'escaped' || b.single) continue;
    if (rng() > RELIGHT_CHANCE) continue; // sailed on — gone for good
    const species = getSpecies(b.speciesId);
    // Prefer real cover at single-hunting distance: the next patch over.
    const candidates = patches.filter((p) => {
      const d = dist({ x: p.x + p.w / 2, y: p.y + p.h / 2 }, b.pos);
      return d >= SINGLE_NEAR_COVER && d <= SINGLE_SCATTER_MAX;
    });
    if (candidates.length > 0) {
      const p = candidates[Math.floor(rng() * candidates.length) % candidates.length];
      b.pos = {
        x: clamp(p.x + rng() * p.w, bounds.x + 8, bounds.x + bounds.w - 8),
        y: clamp(p.y + rng() * p.h, bounds.y + 8, bounds.y + bounds.h - 8),
      };
    } else {
      const away = rng() * Math.PI * 2;
      const distance = SINGLE_SCATTER_MIN + rng() * (SINGLE_SCATTER_MAX - SINGLE_SCATTER_MIN);
      b.pos = {
        x: clamp(b.pos.x + Math.cos(away) * distance, bounds.x + 8, bounds.x + bounds.w - 8),
        y: clamp(b.pos.y + Math.sin(away) * distance, bounds.y + 8, bounds.y + bounds.h - 8),
      };
    }
    b.state = 'hidden';
    b.single = true;
    b.coveyId = -b.id; // scattered singles sit alone — the old covey bond is broken
    b.runs = false; // a scattered single sits, it doesn't run
    b.nerveMs =
      (species.nerveMinMs + rng() * (species.nerveMaxMs - species.nerveMinMs)) *
      SINGLE_NERVE_MULT *
      nerveMult;
    relit.push(b);
  }
  return relit;
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

export interface RunnerEnv {
  bounds?: Rect;
  /** Cover patches: a runner holds at the edge of its cover instead of crossing open ground. */
  patches?: Rect[];
  /** Uphill direction on sloped ground — runners angle uphill (the chukar move). */
  slopeAngle?: number;
}

const SLOPE_RUN_BIAS = 0.55; // how strongly sloped-ground runners pull uphill

function inAnyPatch(p: Vec2, patches: Rect[]): boolean {
  return patches.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
}

/**
 * Move runner birds. A hidden runner flees the dog while it has energy,
 * then holds still to recover — that's the dog's (and hunter's) window.
 * Only the dog spooks them; the hunter walking up doesn't. A runner that
 * reaches the end of its cover pins there rather than crossing the open —
 * that's how you block a rooster at the end of a slough.
 */
export function updateBirds(dtMs: number, birds: Bird[], dogPos: Vec2, env: RunnerEnv = {}): void {
  const bounds = env.bounds ?? FIELD_BOUNDS;
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
    const speed = RUNNER_SPEED * (getSpecies(b.speciesId).runSpeedMult ?? 1);
    const away = Math.atan2(b.pos.y - dogPos.y, b.pos.x - dogPos.x);
    let dirX = Math.cos(away);
    let dirY = Math.sin(away);
    if (env.slopeAngle !== undefined) {
      dirX = dirX * (1 - SLOPE_RUN_BIAS) + Math.cos(env.slopeAngle) * SLOPE_RUN_BIAS;
      dirY = dirY * (1 - SLOPE_RUN_BIAS) + Math.sin(env.slopeAngle) * SLOPE_RUN_BIAS;
      const len = Math.hypot(dirX, dirY) || 1;
      dirX /= len;
      dirY /= len;
    }
    const next = {
      x: clamp(b.pos.x + dirX * speed * dt, bounds.x + 4, bounds.x + bounds.w - 4),
      y: clamp(b.pos.y + dirY * speed * dt, bounds.y + 4, bounds.y + bounds.h - 4),
    };
    // Blocked at the cover's end: hold rather than cross open ground.
    if (env.patches && inAnyPatch(b.pos, env.patches) && !inAnyPatch(next, env.patches)) {
      b.restingMs = RUNNER_REST_MS;
      continue;
    }
    b.pos = next;
  }
}

/**
 * The hun move: a covey wild-flushed out of range flies a wide loop and
 * relands together in the same field — once per hunt. Returns the relanded
 * birds (empty if this covey doesn't do that, or already has).
 */
export function circleBack(
  birds: Bird[],
  flushedIds: number[],
  bounds: Rect,
  rng: RNG = Math.random,
  nerveMult = 1,
): Bird[] {
  const covey = flushedIds
    .map((id) => birds.find((b) => b.id === id))
    .filter((b): b is Bird => b !== undefined);
  if (covey.length === 0) return [];
  if (!covey.every((b) => b.speciesId === 'hun' && b.state === 'flushed' && !b.circled && !b.single)) {
    return [];
  }
  const cx = covey.reduce((a, b) => a + b.pos.x, 0) / covey.length;
  const cy = covey.reduce((a, b) => a + b.pos.y, 0) / covey.length;
  const away = rng() * Math.PI * 2;
  const distance = 150 + rng() * 150;
  const anchor = {
    x: clamp(cx + Math.cos(away) * distance, bounds.x + 12, bounds.x + bounds.w - 12),
    y: clamp(cy + Math.sin(away) * distance, bounds.y + 12, bounds.y + bounds.h - 12),
  };
  const species = getSpecies('hun');
  for (const b of covey) {
    b.pos = {
      x: clamp(anchor.x + (rng() * 2 - 1) * 12, bounds.x + 4, bounds.x + bounds.w - 4),
      y: clamp(anchor.y + (rng() * 2 - 1) * 12, bounds.y + 4, bounds.y + bounds.h - 4),
    };
    b.state = 'hidden';
    b.circled = true;
    b.nerveMs = (species.nerveMinMs + rng() * (species.nerveMaxMs - species.nerveMinMs)) * nerveMult;
  }
  return covey;
}
