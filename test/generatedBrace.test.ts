import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { getArea, getDropPoint } from '../src/game/areas';
import { getSpecies } from '../src/game/species';
import type { Ctx } from '../src/three/engine';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';
import { BirdsSystem } from '../src/three/subsystems/birds';

afterEach(() => vi.unstubAllGlobals());

it('keeps generated brace pose, coat, marking, carry socket and audit ownership independent', () => {
  interface Audit { slot: number; coatId: string; root: number[]; speed: number; jawAngle: number; }
  const scope: { __generatedDogAudit?: () => Audit; __generatedDogAudits?: Record<string, () => Audit> } = {};
  vi.stubGlobal('window', scope);
  const dogs = [
    { state: 'pointing', gait: 'still', scentStage: 'none', carryingBirdId: null as number | null,
      heading: Math.PI / 2, retrieveHoldTimeMs: () => 0, watchedBirdIds: () => [7] },
    { state: 'retrieving', gait: 'trot', scentStage: 'none', carryingBirdId: 12 as number | null,
      heading: Math.PI / 2, retrieveHoldTimeMs: () => 0, watchedBirdIds: () => [8] },
  ];
  const positions = [{ x: 3, z: 4 }, { x: -3, z: 4 }];
  const hunt = {
    areaConfig: () => getArea('quail-fields'), dropPoint: () => getDropPoint(getArea('quail-fields')),
    dog: (slot = 0) => dogs[slot], dogCount: () => 2,
    dogRenderWorld: (_alpha: number, out: { x: number; z: number }, slot = 0) => Object.assign(out, positions[slot]),
    dogRenderHeading: (_alpha: number, slot = 0) => dogs[slot].heading,
    dogRenderTravelHeading: (_alpha: number, slot = 0) => dogs[slot].heading,
    huntState: () => ({ birds: [{ id: 12, speciesId: 'chukar', state: 'carried' }] }),
  };
  const terrain = { heightAt: () => 0 };
  const visuals = [new GeneratedDogSystem('black-roan'), new GeneratedDogSystem('liver-roan', 1)];
  const birds = new BirdsSystem();
  const internal = birds as unknown as {
    mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean;
    slots: { root: THREE.Group; simId: number; status: string }[];
    buildPool(ctx: Ctx): void; applySpeciesAppearance(slot: unknown, species: ReturnType<typeof getSpecies>): void;
  };
  Object.assign(internal, { mat: new THREE.MeshLambertMaterial({ vertexColors: true }), hunt, terrain, frozen: false });
  const registry = new Map<string, unknown>([['hunt3d', hunt], ['terrain', terrain], ['birds', birds], ...visuals.map(dog => [dog.id, dog] as [string, unknown])]);
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite', fixedAlpha: 1,
    get: (id: string) => { const value = registry.get(id); if (!value) throw new Error(`missing ${id}`); return value; },
  } as unknown as Ctx;
  visuals.forEach(visual => visual.init(ctx));
  internal.buildPool(ctx); const bird = internal.slots[0];
  internal.applySpeciesAppearance(bird, getSpecies('chukar')); bird.simId = 12; bird.status = 'grounded';
  const primaryAudit = scope.__generatedDogAudit;
  const inputBefore = JSON.stringify(dogs);
  const mouth = new THREE.Vector3();
  try {
    expect(visuals.map(visual => visual.id)).toEqual(['dog', 'dog-2']);
    for (let f = 0; f < 60; f++) {
      positions[1].z += .03;
      visuals.forEach(visual => visual.update(ctx, 1 / 60)); birds.update(ctx, 1 / 60);
      visuals[1].mouthWorld(mouth);
      expect(bird.root.position.distanceTo(mouth)).toBeLessThan(1e-7);
    }
    expect(JSON.stringify(dogs)).toBe(inputBefore);
    const a = scope.__generatedDogAudits!['dog'](), b = scope.__generatedDogAudits!['dog-2']();
    expect(a.coatId).toBe('black-roan'); expect(b.coatId).toBe('liver-roan');
    expect(a.root[0]).toBe(3); expect(b.root[0]).toBe(-3);
    expect(a.speed).toBe(0); expect(b.speed).toBeGreaterThan(1.7);
    expect(a.jawAngle).toBe(0); expect(b.jawAngle).toBeCloseTo(.60);
    const observed: number[][] = [];
    vi.spyOn(birds, 'markingTarget').mockImplementation((ids, out) => {
      observed.push([...ids]); out.set(ids[0] === 7 ? 8 : -8, 3, 12); return true;
    });
    dogs.forEach(dog => { dog.state = 'marking'; dog.carryingBirdId = null; });
    visuals.forEach(visual => visual.update(ctx, 1 / 60));
    expect(observed).toEqual([[7], [8]]);
    visuals[1].dispose();
    expect(scope.__generatedDogAudit).toBe(primaryAudit);
    expect(Object.keys(scope.__generatedDogAudits!)).toEqual(['dog']);
  } finally {
    visuals.forEach(visual => visual.dispose()); birds.dispose(ctx);
  }
  expect(scope.__generatedDogAudit).toBeUndefined(); expect(scope.__generatedDogAudits).toBeUndefined();
});
