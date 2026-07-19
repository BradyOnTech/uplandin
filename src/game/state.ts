import { areaBirdCount, type AreaConfig } from './areas';
import { spawnBirds, type Bird } from './birds';
import type { RNG, Vec2 } from './types';

/**
 * Everything that needs to survive a scene transition. Plain data, passed
 * from FieldScene to FlushScene and back via Phaser's scene-start payload.
 */
/** Dog-work tallies for the hunt, converted to XP at the summary. */
export interface XpEvents {
  pointFlushes: number;
  retrieves: number;
  downedOverPoint: number;
}

export interface HuntState {
  areaId: string;
  birds: Bird[];
  dogPos: Vec2;
  hunterPos: Vec2;
  /** Direction the wind blows toward (radians, screen coords) — constant for a hunt. */
  wind: number;
  downed: number;
  escaped: number;
  xpEvents: XpEvents;
}

export function createHunt(area: AreaConfig, rng: RNG = Math.random): HuntState {
  const w = area.world;
  return {
    areaId: area.id,
    birds: spawnBirds({ ...area, birdCount: areaBirdCount(area), bounds: w }, rng),
    dogPos: { x: w.x + w.w / 2 - 30, y: w.y + w.h - 30 },
    hunterPos: { x: w.x + w.w / 2, y: w.y + w.h - 20 },
    wind: rng() * Math.PI * 2,
    downed: 0,
    escaped: 0,
    xpEvents: { pointFlushes: 0, retrieves: 0, downedOverPoint: 0 },
  };
}

export function birdsRemaining(hunt: HuntState): number {
  return hunt.birds.filter((b) => b.state === 'hidden').length;
}

/** A hunt is over once no bird is still hidden or mid-flush. */
export function huntComplete(hunt: HuntState): boolean {
  return hunt.birds.every((b) => b.state !== 'hidden' && b.state !== 'flushed');
}
