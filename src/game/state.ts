import { areaBirdCount, type AreaConfig } from './areas';
import { spawnBirds, type Bird } from './birds';
import type { QuickConfig } from './quick';
import type { RNG, Vec2 } from './types';
import { rollWindStrength, windMults, type WindStrength } from './wind';

/**
 * Everything that needs to survive a scene transition. Plain data, passed
 * from FieldScene to FlushScene and back via Phaser's scene-start payload.
 */
/** Dog-work tallies for the hunt, converted to XP at the summary. */
export interface XpEvents {
  pointFlushes: number;
  retrieves: number;
  downedOverPoint: number;
  /** Protected hens downed — each one is an XP fine. */
  henDowns: number;
}

export interface HuntState {
  areaId: string;
  birds: Bird[];
  dogPos: Vec2;
  hunterPos: Vec2;
  /** Direction the wind blows toward (radians, screen coords) — constant for a hunt. */
  wind: number;
  windStrength: WindStrength;
  downed: number;
  escaped: number;
  /** Flushes where two birds fell — the classic double, bonus hunter XP. */
  doubles: number;
  /** The shotgun carried this hunt. */
  gunId: string;
  xpEvents: XpEvents;
  /** Set on Quick Hunt runs: the picked setup. Career is never touched. */
  quick?: QuickConfig;
}

export function createHunt(
  area: AreaConfig,
  rng: RNG = Math.random,
  windOverride?: WindStrength,
  gunId = 'remington-870',
): HuntState {
  const w = area.world;
  const windStrength = windOverride ?? rollWindStrength(rng);
  return {
    areaId: area.id,
    birds: spawnBirds(
      {
        patches: area.patches,
        birdCount: areaBirdCount(area),
        speciesMix: area.speciesMix,
        bounds: w,
        nerveMult: windMults(windStrength).nerve,
      },
      rng,
    ),
    dogPos: { x: w.x + w.w / 2 - 30, y: w.y + w.h - 30 },
    hunterPos: { x: w.x + w.w / 2, y: w.y + w.h - 20 },
    wind: rng() * Math.PI * 2,
    windStrength,
    downed: 0,
    escaped: 0,
    doubles: 0,
    gunId,
    xpEvents: { pointFlushes: 0, retrieves: 0, downedOverPoint: 0, henDowns: 0 },
  };
}

export function birdsRemaining(hunt: HuntState): number {
  return hunt.birds.filter((b) => b.state === 'hidden').length;
}

/** A hunt is over once no bird is still hidden or mid-flush. */
export function huntComplete(hunt: HuntState): boolean {
  return hunt.birds.every((b) => b.state !== 'hidden' && b.state !== 'flushed');
}
