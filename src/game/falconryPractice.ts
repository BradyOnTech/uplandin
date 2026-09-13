import type { HuntState } from './state';
import { LandscapeModel } from './landscape';
import { getArea } from './areas';

/** Explicit practice only: never affects career or ordinary Quick Hunts. */
export function isFalconryPractice(search: string): boolean {
  const p = new URLSearchParams(search);
  return p.get('play') === 'quick' && p.get('method') === 'goshawk' && p.get('practice') === 'slip';
}

export const FALCONRY_PRACTICE = {
  // Just outside the dog AI's 28-yard handler exclusion; no AI override.
  hunter: { x: -48, z: -43 },
  quarry: { x: -39.2, z: -69.4 },
  seed: 61,
  drop: 'south-gate',
} as const;

/** Stage the opportunity; pointing, flushing and flight still use normal AI. */
export function stageFalconryPractice(hunt: HuntState): void {
  const landscape = new LandscapeModel(getArea('pheasant-coverts'), FALCONRY_PRACTICE.drop);
  const { hunter, quarry } = FALCONRY_PRACTICE;
  hunt.hunterPos = landscape.worldToProperty(hunter.x, hunter.z, { x: 0, y: 0 });
  hunt.birds = [{
    id: 1, coveyId: 1, speciesId: 'ringneck', sex: 'rooster', state: 'hidden',
    pos: landscape.worldToProperty(quarry.x, quarry.z, { x: 0, y: 0 }),
    runs: false, runEnergy: 0, restingMs: 0, nerveMs: 60000,
  }];
  // Carry the bird's scent straight toward the dog and handler.
  hunt.wind = Math.atan2(hunter.z - quarry.z, hunter.x - quarry.x);
  hunt.windStrength = 'breezy';
  hunt.condition = 'frost';
}
