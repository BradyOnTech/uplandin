import { areaBirdCount, getDropPoint, type AreaConfig } from './areas';
import { spawnBirds, type Bird } from './birds';
import { conditionMults, rollCondition, type Condition } from './conditions';
import type { QuickConfig } from './quick';
import type { SpeciesShare } from './species';
import type { RNG, Vec2 } from './types';
import { rollWindStrength, windMults, type WindStrength } from './wind';

/**
 * Everything that needs to survive a scene transition. Plain data, passed
 * from FieldScene to FlushScene and back via Phaser's scene-start payload.
 */
/** One dog's work for the hunt, converted to its XP at the summary. */
export interface DogWork {
  pointFlushes: number;
  retrieves: number;
  downedOverPoint: number;
}

export function emptyDogWork(): DogWork {
  return { pointFlushes: 0, retrieves: 0, downedOverPoint: 0 };
}

export interface HuntState {
  areaId: string;
  dropPointId: string;
  birds: Bird[];
  /** Start/current positions per dog slot (a brace is two dogs). */
  dogsPos: Vec2[];
  hunterPos: Vec2;
  /** Direction the wind blows toward (radians, screen coords) — constant for a hunt. */
  wind: number;
  windStrength: WindStrength;
  /** The day's weather — frost mornings are the good days. */
  condition: Condition;
  downed: number;
  escaped: number;
  /** Flushes where two birds fell — the classic double, bonus hunter XP. */
  doubles: number;
  /** Protected hens downed — each one fines the hunter's XP. */
  henDowns: number;
  /** The shotgun carried this hunt. */
  gunId: string;
  /** Per-dog work tallies, indexed by dog slot. */
  dogWork: DogWork[];
  /** Set on Quick Hunt runs: the picked setup. Career is never touched. */
  quick?: QuickConfig;
}

export interface HuntOptions {
  dropPointId?: string;
  wind?: WindStrength;
  gunId?: string;
  condition?: Condition;
  /** Seasonal climate lean; defaults to the area's flat bias. */
  conditionBias?: Condition;
  /** Season-filtered species mix (openers); defaults to the whole area mix. */
  mix?: SpeciesShare[];
  /** Share of naive young-of-year birds (early season). */
  youngShare?: number;
  /** Educated-survivor nerve multiplier (late season). */
  educatedMult?: number;
}

export function createHunt(area: AreaConfig, rng: RNG = Math.random, opts: HuntOptions = {}): HuntState {
  const w = area.world;
  const windStrength = opts.wind ?? rollWindStrength(rng);
  const condition = opts.condition ?? rollCondition(rng, opts.conditionBias ?? area.conditionBias);
  const drop = getDropPoint(area, opts.dropPointId);
  const side = { x: -Math.sin(drop.heading), y: Math.cos(drop.heading) };
  const forward = { x: Math.cos(drop.heading), y: Math.sin(drop.heading) };
  const openingTarget = {
    x: drop.position.x + forward.x * 62,
    y: drop.position.y + forward.y * 62,
  };
  const openingPatch = area.patches.reduce((best, patch) => {
    const distance = Math.hypot(patch.x + patch.w / 2 - openingTarget.x, patch.y + patch.h / 2 - openingTarget.y);
    return distance < best.distance ? { patch, distance } : best;
  }, { patch: area.patches[0], distance: Infinity }).patch;
  const openingAnchor = openingPatch
    ? {
        x: Math.max(openingPatch.x + 6, Math.min(openingPatch.x + openingPatch.w - 6, openingTarget.x)),
        y: Math.max(openingPatch.y + 6, Math.min(openingPatch.y + openingPatch.h - 6, openingTarget.y)),
      }
    : openingTarget;
  return {
    areaId: area.id,
    dropPointId: drop.id,
    birds: spawnBirds(
      {
        patches: area.patches,
        birdCount: areaBirdCount(area),
        speciesMix: opts.mix && opts.mix.length > 0 ? opts.mix : area.speciesMix,
        bounds: w,
        nerveMult: windMults(windStrength).nerve * conditionMults(condition).nerve * (opts.educatedMult ?? 1),
        youngShare: opts.youngShare,
        exclusionZones: area.dropPoints.map((point) => ({ center: point.position, radius: point.safetyRadius })),
        openingAnchor,
      },
      rng,
    ),
    dogsPos: [
      { x: drop.position.x + forward.x * 8 + side.x * 5, y: drop.position.y + forward.y * 8 + side.y * 5 },
      { x: drop.position.x + forward.x * 8 - side.x * 5, y: drop.position.y + forward.y * 8 - side.y * 5 },
    ],
    hunterPos: { ...drop.position },
    wind: rng() * Math.PI * 2,
    windStrength,
    condition,
    downed: 0,
    escaped: 0,
    doubles: 0,
    henDowns: 0,
    gunId: opts.gunId ?? 'remington-870',
    dogWork: [emptyDogWork(), emptyDogWork()],
  };
}

export function birdsRemaining(hunt: HuntState): number {
  return hunt.birds.filter((b) => b.state === 'hidden').length;
}

/** A hunt is over once every bird is lost or delivered to hand. */
export function huntComplete(hunt: HuntState): boolean {
  return hunt.birds.every((b) => b.state === 'escaped' || b.state === 'retrieved');
}

/**
 * Player elects to quit the field early: every still-hidden or mid-flush bird
 * becomes escaped (and counts as lost). Mutates `hunt` in place and returns
 * how many birds were written off. Already downed/carried/retrieved birds are kept.
 */
export function endHuntEarly(hunt: HuntState): number {
  let writtenOff = 0;
  for (const bird of hunt.birds) {
    if (bird.state === 'hidden' || bird.state === 'flushed') {
      bird.state = 'escaped';
      writtenOff++;
    }
  }
  hunt.escaped += writtenOff;
  return writtenOff;
}
