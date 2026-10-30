import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BirdsSystem } from '../src/three/subsystems/birds';
import type { Bird } from '../src/game/birds';
import { getSpecies } from '../src/game/species';
import { getArea } from '../src/game/areas';

// The actual fixed flight loop against a stand-in hunt, as in continuousCovey.test.ts.
function fixture() {
  const birds: Bird[] = [];
  const system = new BirdsSystem();
  const runtime = system as unknown as {
    tickBirds(dt: number): void; slots: Array<Record<string, any>>;
    refinedQuail: boolean; spatialEncounter: boolean; frozen: boolean; hunt: unknown; terrain: unknown;
    applySpeciesAppearance: unknown; burstDebris: unknown;
  };
  // The settled rise puts the covey down again, as a Hun circle-back does.
  const finishRise = vi.fn(() => { for (const bird of birds) bird.state = 'hidden'; });
  runtime.refinedQuail = true; runtime.spatialEncounter = true; runtime.frozen = true;
  runtime.hunt = { areaConfig: () => getArea('quail-fields'), huntState: () => ({ birds, hunterPos: { x: 0, y: 0 }, wind: 0 }),
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
    coverPatches: () => [], riseSlopeApproach: () => null, lastFlushInfo: () => null, finishRise, resolveBird: vi.fn(), recordFallWorld: vi.fn() };
  runtime.terrain = { heightAt: () => 0 };
  runtime.applySpeciesAppearance = (slot: { species: unknown }, species: unknown) => { slot.species = species; }; runtime.burstDebris = () => {};
  runtime.slots = Array.from({ length: 14 }, () => ({ status: 'idle', root: new THREE.Group(), vel: { x: 0, y: 0 }, species: getSpecies('bobwhite'),
    wingLMesh: { morphTargetInfluences: [0] }, wingRMesh: { morphTargetInfluences: [0] } }));
  for (let id = 1; id <= 5; id++) birds.push({ id, coveyId: 1, pos: { x: 15 + id * .3, y: (id % 3 - 1) * .4 }, state: 'flushed',
    speciesId: 'bobwhite', runs: false, runEnergy: 0, restingMs: 0, nerveMs: 0 });
  return { runtime, birds, finishRise };
}

const IN_PLAY = ['waiting', 'flying', 'falling'];

describe('a covey put down again by its own rise', () => {
  it('is flown again when it flushes before the birds next look', () => {
    const f = fixture();
    for (let tick = 0; tick < 30 * 150 && !f.finishRise.mock.calls.length; tick++) f.runtime.tickBirds(1000 / 30);
    expect(f.finishRise).toHaveBeenCalledTimes(1);
    expect(f.birds.every(bird => bird.state === 'hidden')).toBe(true);
    // The dog stands beside where it set down: the covey goes up again in the
    // same simulation tick, so the birds never see it hidden.
    for (const bird of f.birds) bird.state = 'flushed';
    const flownAgain = new Set<number>();
    for (let tick = 0; tick < 30 * 20; tick++) {
      f.runtime.tickBirds(1000 / 30);
      for (const slot of f.runtime.slots) if (IN_PLAY.includes(slot.status)) flownAgain.add(slot.simId);
    }
    expect([...flownAgain].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
