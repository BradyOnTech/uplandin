import { FIELD_BOUNDS, randomPointIn, type Rect } from './field';
import type { AreaTrail } from './areas';
import { clamp, dist } from './math';
import { getSpecies, rollSpecies, type SpeciesShare } from './species';
import type { RNG, Vec2 } from './types';
import type { RunnerStyle } from './huntDoctrine';
import { PROPERTY_PX_TO_M } from './worldUnits';

export type BirdState = 'hidden' | 'flushed' | 'downed' | 'carried' | 'held' | 'escaped' | 'retrieved';

export interface Bird {
  id: number;
  coveyId: number;
  speciesId: string;
  pos: Vec2;
  state: BirdState;
  /** A 3D fall is still airborne; it is not a reachable retrieve target yet. */
  fallPending?: boolean;
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
  /** Seeded individual approach temperament, retained through relights. */
  approachRoll?: number;
  /** Where a downed bird came to earth; a wounded bird may leave it. */
  fallPos?: Vec2;
  /**
   * Whether a dog saw the fall. `false` means the dog must wind the bird (or
   * be sent to hunt dead); undefined keeps the legacy always-known fetch.
   */
  marked?: boolean;
  /** Hit at the fringe of the pattern: it lands alive and runs. */
  wounded?: boolean;
  /** ms of running left to a wounded bird before it tucks in and hides. */
  woundRunMs?: number;
  /** A dog searched for it and gave up; only scent can find it now. */
  lost?: boolean;
}

const COVEY_JITTER = 10; // fallback when a future species omits its spread

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

/** Uniformly scatter one bird inside a species-sized covey disk. The radial
 * square-root keeps the center from becoming unnaturally dense while the
 * hard radius keeps a wide Hun/Chukar covey from becoming a rectangle. */
function coveyOffset(anchor: Vec2, radius: number, rng: RNG): Vec2 {
  const angle = rng() * Math.PI * 2;
  const distance = Math.sqrt(rng()) * radius;
  return { x: anchor.x + Math.cos(angle) * distance, y: anchor.y + Math.sin(angle) * distance };
}

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
  /** Places where loaded guns and wild birds do not mix (trucks, buildings). */
  exclusionZones?: { center: Vec2; radius: number }[];
  /** First piece of cover on the walk-in route; only the opening covey uses it. */
  openingAnchor?: Vec2;
  /** Ordered physical cover locations for a continuous field hunt. */
  coveyAnchors?: readonly Vec2[];
  /** Plan the covey species so a mixed property actually shows its mix:
   * the opening is sometimes a secondary species, and every secondary
   * species holds at least one of the first few coveys. */
  mixedCoveys?: boolean;
}

/** Secondary species that make up less than this share are left to chance. */
const MIXED_MIN_SHARE = .08;
/** How often the opening covey is one of the secondary species. */
const MIXED_OPENING_SECONDARY = .3;

/** Covey species plan for a mixed property: covey index → species id. */
function planMixedCoveys(mix: SpeciesShare[], rng: RNG): Map<number, string> {
  const plan = new Map<number, string>();
  const total = mix.reduce((sum, share) => sum + share.weight, 0);
  const ordered = [...mix].sort((a, b) => b.weight - a.weight);
  const secondaries = ordered.slice(1).filter(share => share.weight / total >= MIXED_MIN_SHARE);
  // Always two draws, so the plan never shifts the rest of the bird stream.
  const openingRoll = rng(), slotRoll = rng();
  if (secondaries.length === 0) return plan;
  plan.set(0, openingRoll < MIXED_OPENING_SECONDARY
    ? rollSpecies(secondaries, openingRoll / MIXED_OPENING_SECONDARY).id
    : ordered[0].speciesId);
  // Remaining secondaries each take one of coveys 1-3, in a random order.
  const slots = [1, 2, 3];
  const offset = Math.floor(slotRoll * slots.length);
  let next = 0;
  for (const share of secondaries) {
    if ([...plan.values()].includes(share.speciesId)) continue;
    plan.set(slots[(offset + next++) % slots.length], share.speciesId);
  }
  return plan;
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
  const outsideExclusions = (point: Vec2) =>
    !(cfg.exclusionZones ?? []).some((zone) => dist(point, zone.center) < zone.radius);
  const safeAnchor = (patch: Rect): Vec2 => {
    let point = randomPointIn(patch, rng);
    for (let attempt = 0; attempt < 31 && !outsideExclusions(point); attempt++) {
      point = randomPointIn(patch, rng);
    }
    return point;
  };
  const pushOutsideExclusions = (point: Vec2): Vec2 => {
    let result = point;
    for (const zone of cfg.exclusionZones ?? []) {
      const dx = result.x - zone.center.x;
      const dy = result.y - zone.center.y;
      const d = Math.hypot(dx, dy);
      if (d >= zone.radius) continue;
      const angle = d > 0 ? Math.atan2(dy, dx) : rng() * Math.PI * 2;
      result = {
        x: clamp(zone.center.x + Math.cos(angle) * (zone.radius + 1), bounds.x + 4, bounds.x + bounds.w - 4),
        y: clamp(zone.center.y + Math.sin(angle) * (zone.radius + 1), bounds.y + 4, bounds.y + bounds.h - 4),
      };
    }
    return result;
  };
  const plan = cfg.mixedCoveys && cfg.speciesMix.length > 1 ? planMixedCoveys(cfg.speciesMix, rng) : undefined;
  const primaryId = [...cfg.speciesMix].sort((a, b) => b.weight - a.weight)[0]?.speciesId;
  // A big covey of a secondary species must not eat a small property's
  // stocking: each secondary keeps to a bird budget and the primary species
  // still leads the day.
  const mixTotal = cfg.speciesMix.reduce((sum, share) => sum + share.weight, 0);
  const secondaryBudget = (id: string) => Math.max(Math.max(3, Math.round(cfg.birdCount * .4)),
    Math.round(cfg.birdCount * (cfg.speciesMix.find(share => share.speciesId === id)?.weight ?? 0) / mixTotal * 1.25));
  const placed = new Map<string, number>();
  while (remaining > 0) {
    const rolled = rollSpecies(coveyMix, rng());
    const planned = plan?.get(coveyId);
    let species = planned ? getSpecies(planned) : rolled;
    let cap = Infinity;
    if (plan && primaryId && species.id !== primaryId) {
      cap = secondaryBudget(species.id) - (placed.get(species.id) ?? 0);
      if (cap <= 0) { species = getSpecies(primaryId); cap = Infinity; }
    }
    const size = Math.min(
      remaining,
      cap,
      species.coveyMin + Math.floor(rng() * (species.coveyMax - species.coveyMin + 1)),
    );
    const patch = cfg.patches[Math.floor(rng() * cfg.patches.length)];
    const plannedAnchor = cfg.coveyAnchors?.[coveyId];
    const anchor = plannedAnchor && outsideExclusions(plannedAnchor) ? plannedAnchor
      : coveyId === 0 && cfg.openingAnchor && outsideExclusions(cfg.openingAnchor)
      ? cfg.openingAnchor
      : safeAnchor(patch);
    // Authored anchors come from the same patch list, but resolve it again so
    // the species spread can be clamped to that patch even when a caller gives
    // us a planned point with a different patch index. Open-country runners
    // can leave cover later through updateBirds; their initial hold still has
    // to begin in the cover that authored the encounter.
    const anchorPatch = cfg.patches.find((candidate) =>
      anchor.x >= candidate.x && anchor.x <= candidate.x + candidate.w &&
      anchor.y >= candidate.y && anchor.y <= candidate.y + candidate.h,
    ) ?? patch;
    const coveyJitter = species.coveyJitter ?? COVEY_JITTER;
    for (let i = 0; i < size; i++) {
      const young = rng() < (cfg.youngShare ?? 0);
      // Young birds haven't learned to run from a dog yet.
      const runs = rng() < species.runnerChance * (young ? 0.5 : 1);
      const nerveRoll = rng();
      const scattered = coveyOffset(anchor, coveyJitter, rng);
      // Keep the covey inside the patch, with a small edge margin. The clamp
      // is only visible on narrow authored pockets; ordinary patches retain
      // the full species radius above.
      const patchMargin = Math.min(4, anchorPatch.w * .24, anchorPatch.h * .24);
      const patchSafe = {
        x: clamp(scattered.x, anchorPatch.x + patchMargin, anchorPatch.x + anchorPatch.w - patchMargin),
        y: clamp(scattered.y, anchorPatch.y + patchMargin, anchorPatch.y + anchorPatch.h - patchMargin),
      };
      birds.push({
        id: nextBirdId++,
        coveyId,
        speciesId: species.id,
        pos: pushOutsideExclusions({
          x: clamp(patchSafe.x, bounds.x + 4, bounds.x + bounds.w - 4),
          y: clamp(patchSafe.y, bounds.y + 4, bounds.y + bounds.h - 4),
        }),
        state: 'hidden',
        sex: species.henRule ? (rng() < 0.5 ? 'hen' : 'rooster') : undefined,
        young: young || undefined,
        runs,
        approachRoll: nerveRoll,
        runEnergy: RUNNER_MAX_ENERGY,
        restingMs: 0,
        nerveMs:
          (species.nerveMinMs + nerveRoll * (species.nerveMaxMs - species.nerveMinMs)) *
          (runs ? RUNNER_NERVE_FACTOR : 1) *
          (young ? YOUNG_NERVE_MULT : 1) *
          nerveMult,
      });
    }
    placed.set(species.id, (placed.get(species.id) ?? 0) + size);
    coveyId++;
    remaining -= size;
  }
  return birds;
}

/**
 * Flush a species-appropriate group. Covey birds launch together; solitary
 * birds such as pheasant, grouse, and woodcock only launch the trigger even
 * when setup happened to place a nearby pair in the same authored pocket.
 * Returns the birds that took wing (always includes the trigger).
 */
export function flushCovey(birds: Bird[], birdId: number): Bird[] {
  const trigger = birds.find((b) => b.id === birdId);
  if (!trigger) return [];
  const species = getSpecies(trigger.speciesId);
  const flushed: Bird[] = [];
  for (const b of birds) {
    const sameGroup = species.flushAsCovey !== false && b.coveyId === trigger.coveyId;
    if (b.state === 'hidden' && (b.id === trigger.id || sameGroup)) {
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
  /** Continuous scenes supply actual landings; absent IDs have flown away. */
  landings?: ReadonlyMap<number, Vec2>,
): Bird[] {
  const relit: Bird[] = [];
  for (const id of escapedIds) {
    const b = birds.find((x) => x.id === id);
    if (!b || b.state !== 'escaped' || b.single || b.circled) continue;
    const landing = landings?.get(id);
    if (landings && (!landing || !Number.isFinite(landing.x) || !Number.isFinite(landing.y) ||
      landing.x < bounds.x || landing.x > bounds.x + bounds.w ||
      landing.y < bounds.y || landing.y > bounds.y + bounds.h ||
      !patches.some(p => landing.x >= p.x && landing.x <= p.x + p.w && landing.y >= p.y && landing.y <= p.y + p.h))) continue;
    // Continuous flight has already shown which birds put down. Do not roll
    // a second disappearance after the player has watched one land.
    if (!landings && rng() > RELIGHT_CHANCE) continue;
    const species = getSpecies(b.speciesId);
    // Prefer real cover at single-hunting distance: the next patch over.
    const candidates = patches.filter((p) => {
      const d = dist({ x: p.x + p.w / 2, y: p.y + p.h / 2 }, b.pos);
      return d >= SINGLE_NEAR_COVER && d <= SINGLE_SCATTER_MAX;
    });
    if (landing) {
      b.pos = { ...landing };
    } else if (candidates.length > 0) {
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
 * `radius`. Runners are deliberately excluded: they must get a chance to
 * road ahead of the dog before the hunter decides whether to cut them off.
 * Returns the trigger birds (scene flushes their coveys). Radius comes from
 * the dog's wind-craft tier; 0 disables this entirely.
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
  const scented: { bird: Bird; distance: number }[] = [];
  for (const b of birds) {
    if (b.state !== 'hidden' || b.runs) continue;
    const dx = b.pos.x - dogPos.x;
    const dy = b.pos.y - dogPos.y;
    const d = Math.hypot(dx, dy);
    if (d === 0 || d > radius) continue;
    // >0.6: the bird sits mostly downwind of the dog
    if ((dx * wx + dy * wy) / d > 0.6) scented.push({ bird: b, distance: d });
  }
  // Spawn order is an implementation detail, especially on mixed properties
  // where neighboring coveys can belong to different species. The dog should
  // flush the closest scent source, so its search target and the rise identity
  // stay coherent instead of a farther bycatch bird winning by array order.
  scented.sort((a, b) => a.distance - b.distance || a.bird.id - b.bird.id);
  return scented.map((entry) => entry.bird);
}

/**
 * A sprinting hunter is loud: hidden birds this close flush wild underfoot.
 * Returns the trigger birds (scene flushes their coveys).
 */
export function birdsSpookedBy(birds: Bird[], pos: Vec2, radius: number): Bird[] {
  return birds.filter((b) => b.state === 'hidden' && dist(b.pos, pos) <= radius);
}

/**
 * Grouse and woodcock can flush under the hunter's boots before a dog has a
 * finished point. The radius belongs to the species, so this does not turn a
 * walking hunter into a universal wild-flush button. Runners are excluded:
 * they already own a ground road and should be handled by `updateBirds`.
 * `excludeIds` keeps a dog-held point eligible for the normal earned flush
 * path when the hunter walks into it.
 */
export function birdsDisturbedByHunter(
  birds: Bird[],
  pos: Vec2,
  moving: boolean,
  excludeIds: readonly number[] = [],
): Bird[] {
  if (!moving) return [];
  const disturbed: { bird: Bird; distance: number }[] = [];
  for (const bird of birds) {
    if (bird.state !== 'hidden' || bird.runs || excludeIds.includes(bird.id)) continue;
    const radius = getSpecies(bird.speciesId).hunterDisturbanceRadius ?? 0;
    if (radius <= 0) continue;
    const distance = dist(bird.pos, pos);
    if (distance <= radius) disturbed.push({ bird, distance });
  }
  disturbed.sort((a, b) => a.distance - b.distance || a.bird.id - b.bird.id);
  return disturbed.map((entry) => entry.bird);
}

export interface RunnerEnv {
  /** Use species world pace in continuous 3D; legacy screen-space speed otherwise. */
  worldScale?: boolean;
  /** Continuous Quail scenes keep a hidden bobwhite covey together until
   * coordinated ground movement exists; relit singles may still run. */
  holdBobwhiteCoveys?: boolean;
  /** Species with a covey approach hold their group unless its runners road. */
  holdCoveys?: boolean;
  bounds?: Rect;
  /** Cover patches: a runner holds at the edge of its cover instead of crossing open ground. */
  patches?: Rect[];
  /** Uphill direction on sloped ground — runners angle uphill (the chukar move). */
  slopeAngle?: number;
  /** Map route context: pheasants road an edge, desert birds use a wash. */
  runnerStyle?: RunnerStyle;
  /** Authored walking lines used as habitat corridors by route-biased runners. */
  trails?: readonly AreaTrail[];
  /** Local blocking pressure for continuous pheasant encounters, in property yards. */
  hunterPos?: Vec2;
}

const SLOPE_RUN_BIAS = 0.55; // how strongly sloped-ground runners pull uphill

function inAnyPatch(p: Vec2, patches: Rect[]): boolean {
  return patches.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
}

function nearestTrailDirection(point: Vec2, trails: readonly AreaTrail[]): Vec2 | null {
  let bestDistance = Infinity;
  let bestX = 0;
  let bestY = 0;
  for (const trail of trails) {
    for (let i = 1; i < trail.points.length; i++) {
      const a = trail.points[i - 1];
      const b = trail.points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-5) continue;
      const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (length * length), 0, 1);
      const distance = Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestX = dx / length;
        bestY = dy / length;
      }
    }
  }
  return Number.isFinite(bestDistance) && bestDistance <= 90 ? { x: bestX, y: bestY } : null;
}

/**
 * Move runner birds. A hidden runner flees the dog while it has energy,
 * then holds still to recover — that's the dog's (and hunter's) window.
 * The dog starts ground movement; a nearby hunter can block a covered exit.
 * Walking flushes remain the encounter controller's responsibility. A runner that
 * reaches the end of its cover pins there rather than crossing the open —
 * that's how you block a rooster at the end of a slough.
 */
export function updateBirds(dtMs: number, birds: Bird[], dogPos: Vec2, env: RunnerEnv = {}): void {
  const bounds = env.bounds ?? FIELD_BOUNDS;
  const dt = dtMs / 1000;
  for (const b of birds) {
    if (b.state !== 'hidden' || !b.runs) continue;
    const species = getSpecies(b.speciesId);
    // The bird owns its running temperament. A Hun bycatch bird in pheasant
    // country keeps the Hun rhythm, while the map still supplies the route
    // it can follow below. This prevents a palette/map style from rewriting
    // the ecology of every runner in the field.
    const runner = species.runnerBehavior;
    const fleeRadius = runner?.fleeRadius ?? RUNNER_FLEE_RADIUS;
    const energyRate = runner?.energyRate ?? 1;
    const restMs = RUNNER_REST_MS * (runner?.restMultiplier ?? 1);
    const coveyHeld = (env.holdBobwhiteCoveys && b.speciesId === 'bobwhite') ||
      (env.holdCoveys && species.coveyApproach === true && species.roadAsCovey !== true);
    if (coveyHeld && birds.some(other =>
      other.id !== b.id && other.coveyId === b.coveyId && other.state === 'hidden')) continue;
    if (b.restingMs > 0) {
      b.restingMs = Math.max(0, b.restingMs - dtMs);
      continue;
    }
    if (dist(b.pos, dogPos) > fleeRadius) continue;
    if (b.runEnergy <= 0) {
      b.restingMs = restMs;
      b.runEnergy = RUNNER_MAX_ENERGY;
      continue;
    }
    b.runEnergy -= dtMs * energyRate;
    const speed = env.worldScale && runner?.worldSpeedMps !== undefined
      ? runner.worldSpeedMps / PROPERTY_PX_TO_M
      : RUNNER_SPEED * (species.runSpeedMult ?? 1);
    const away = Math.atan2(b.pos.y - dogPos.y, b.pos.x - dogPos.x);
    let dirX = Math.cos(away);
    let dirY = Math.sin(away);
    // Country runners do not choose an arbitrary bearing across the map. They
    // road the nearest authored line, with the flee vector deciding which way
    // along it to travel. This makes pheasant and desert-wash pursuits read as
    // a cut-and-relocate problem, while the existing species bias also lets
    // Huns, grouse, prairie birds, and mountain quail use their own contour,
    // timber, or grass-lane routes on properties whose style is otherwise
    // `default`.
    if (env.trails && env.trails.length > 0) {
      const route = nearestTrailDirection(b.pos, env.trails);
      if (route) {
        const sign = route.x * dirX + route.y * dirY < 0 ? -1 : 1;
        const mapRouteBias = env.runnerStyle === 'pheasant' ? .42
          : env.runnerStyle === 'desert' ? .5
            : env.runnerStyle === 'chukar' ? .24 : 0;
        const routeBias = runner?.routeBias ?? mapRouteBias;
        if (routeBias > 0) {
          dirX = dirX * (1 - routeBias) + route.x * sign * routeBias;
          dirY = dirY * (1 - routeBias) + route.y * sign * routeBias;
          const routeLength = Math.hypot(dirX, dirY) || 1;
          dirX /= routeLength;
          dirY /= routeLength;
        }
      }
    }
    if (env.slopeAngle !== undefined && species.groundResponse === 'uphill') {
      dirX = dirX * (1 - SLOPE_RUN_BIAS) + Math.cos(env.slopeAngle) * SLOPE_RUN_BIAS;
      dirY = dirY * (1 - SLOPE_RUN_BIAS) + Math.sin(env.slopeAngle) * SLOPE_RUN_BIAS;
      const len = Math.hypot(dirX, dirY) || 1;
      dirX /= len;
      dirY /= len;
    }
    let next = {
      x: clamp(b.pos.x + dirX * speed * dt, bounds.x + 4, bounds.x + bounds.w - 4),
      y: clamp(b.pos.y + dirY * speed * dt, bounds.y + 4, bounds.y + bounds.h - 4),
    };
    const hunter = env.worldScale && env.runnerStyle === 'pheasant' && b.speciesId === 'ringneck'
      ? env.hunterPos : undefined;
    const blockedByHunter = (end: Vec2): boolean => {
      if (!hunter) return false;
      const dx = end.x - b.pos.x, dy = end.y - b.pos.y;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq < 1e-10) return false;
      const t = clamp(((hunter.x - b.pos.x) * dx + (hunter.y - b.pos.y) * dy) / lengthSq, 0, 1);
      const closest = Math.hypot(b.pos.x + dx * t - hunter.x, b.pos.y + dy * t - hunter.y);
      // Local pressure only: do not road into the handler, but allow a lateral
      // covered escape. Segment distance also prevents a long tick crossing
      // the occupied route and ending safely on the other side.
      return closest < 12 / PROPERTY_PX_TO_M && closest < dist(b.pos, hunter) - 1e-5;
    };
    if (env.patches && inAnyPatch(b.pos, env.patches)) {
      const patches = env.patches;
      const coveredStep = (end: Vec2): boolean => {
        const steps = Math.max(1, Math.ceil(dist(b.pos, end)));
        for (let i = 1; i <= steps; i++) {
          if (!inAnyPatch({ x: b.pos.x + (end.x - b.pos.x) * i / steps,
            y: b.pos.y + (end.y - b.pos.y) * i / steps }, patches)) return false;
        }
        return true;
      };
      if (!coveredStep(next) || blockedByHunter(next)) {
        // A rooster can road sideways along a dry shoulder when the direct
        // escape is blocked. Do not transfer this behavior to a Hun or Quail
        // merely because it shares the property. Every candidate must stay
        // in cover along its whole step, including across fragmented strips.
        let escape: Vec2 | undefined;
        let bestDistance = dist(b.pos, dogPos);
        if (runner?.turnAlongCover) for (const angle of [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
          const c = Math.cos(angle), s = Math.sin(angle);
          const candidate = {
            x: clamp(b.pos.x + (dirX * c - dirY * s) * speed * dt, bounds.x + 4, bounds.x + bounds.w - 4),
            y: clamp(b.pos.y + (dirX * s + dirY * c) * speed * dt, bounds.y + 4, bounds.y + bounds.h - 4),
          };
          const distance = dist(candidate, dogPos);
          if (distance > bestDistance && coveredStep(candidate) && !blockedByHunter(candidate)) { escape = candidate; bestDistance = distance; }
        }
        if (!escape) { b.restingMs = restMs; continue; }
        next = escape;
      }
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
  options: { returnTrail?: AreaTrail; patches?: readonly Rect[] } = {},
): Bird[] {
  // A spatial rise reaches this seam after the flight has either settled or
  // left the readable envelope, so survivors may already be marked escaped.
  // Scene-cut callers still hand us flushed birds. Downed/retrieved birds are
  // omitted: the covey can circle back around the birds the hunter took.
  const covey = flushedIds
    .map((id) => birds.find((b) => b.id === id))
    .filter((b): b is Bird => b !== undefined && (b.state === 'flushed' || b.state === 'escaped'));
  if (covey.length === 0) return [];
  if (!covey.every((b) => b.speciesId === 'hun' && !b.circled && !b.single)) {
    return [];
  }
  const cx = covey.reduce((a, b) => a + b.pos.x, 0) / covey.length;
  const cy = covey.reduce((a, b) => a + b.pos.y, 0) / covey.length;
  let anchor: Vec2 | undefined;
  const returnTrail = options.returnTrail;
  const patches = options.patches ?? [];
  if (returnTrail && returnTrail.points.length >= 2) {
    // Sample a point along the authored return contour, then pull it into the
    // nearest usable cover pocket when one is close. Huns remember a flank;
    // they do not choose a fresh random bearing through bare ground.
    const candidates: Vec2[] = [];
    for (let index = 1; index < returnTrail.points.length; index++) {
      const start = returnTrail.points[index - 1];
      const end = returnTrail.points[index];
      const t = 0.28 + rng() * 0.44;
      const routePoint = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
      const distance = dist(routePoint, { x: cx, y: cy });
      if (distance < 80 || distance > 360) continue;
      let nearestPatch: Rect | undefined;
      let nearestPatchDistance = Infinity;
      for (const patch of patches) {
        const patchCenter = { x: patch.x + patch.w / 2, y: patch.y + patch.h / 2 };
        const patchDistance = dist(routePoint, patchCenter);
        if (patchDistance < nearestPatchDistance) {
          nearestPatchDistance = patchDistance;
          nearestPatch = patch;
        }
      }
      if (nearestPatch && nearestPatchDistance <= 128) {
        const insetX = Math.min(8, nearestPatch.w * .24);
        const insetY = Math.min(8, nearestPatch.h * .24);
        candidates.push({
          x: clamp(routePoint.x, nearestPatch.x + insetX, nearestPatch.x + nearestPatch.w - insetX),
          y: clamp(routePoint.y, nearestPatch.y + insetY, nearestPatch.y + nearestPatch.h - insetY),
        });
      } else {
        candidates.push(routePoint);
      }
    }
    if (candidates.length > 0) anchor = candidates[Math.floor(rng() * candidates.length) % candidates.length];
  }
  if (!anchor) {
    const away = rng() * Math.PI * 2;
    const distance = 150 + rng() * 150;
    anchor = {
      x: clamp(cx + Math.cos(away) * distance, bounds.x + 12, bounds.x + bounds.w - 12),
      y: clamp(cy + Math.sin(away) * distance, bounds.y + 12, bounds.y + bounds.h - 12),
    };
  }
  const species = getSpecies('hun');
  const spread = species.coveyJitter ?? COVEY_JITTER;
  for (const b of covey) {
    const scattered = coveyOffset(anchor, spread, rng);
    b.pos = {
      x: clamp(scattered.x, bounds.x + 4, bounds.x + bounds.w - 4),
      y: clamp(scattered.y, bounds.y + 4, bounds.y + bounds.h - 4),
    };
    b.state = 'hidden';
    b.circled = true;
    b.nerveMs = (species.nerveMinMs + rng() * (species.nerveMaxMs - species.nerveMinMs)) * nerveMult;
  }
  return covey;
}
