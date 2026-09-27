import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getSpecies } from '../src/game/species';
import type { Ctx, Subsystem } from '../src/three/engine';
import { BirdsSystem } from '../src/three/subsystems/birds';
import { DogSystem } from '../src/three/subsystems/dog';
import { RiggedDogSystem } from '../src/three/subsystems/riggedDog';

describe('bird retrieval by either member of a brace', () => {
  it.each([[0, 'segmented'], [1, 'segmented'], [0, 'rigged'], [1, 'rigged']] as const)('uses the registered renderer and position for carrying dog %i (%s)', (carrier, renderer) => {
    const dogs = [
      { carryingBirdId: carrier === 0 ? 12 : null, gait: 'trot', heading: 0 },
      { carryingBirdId: carrier === 1 ? 12 : null, gait: 'trot', heading: Math.PI / 2 },
    ];
    const positions = [{ x: 70, z: 80 }, { x: 3, z: 4 }];
    // Keep the actual production subsystem identities; permissive get stubs
    // hide missing renderers, which used to crash only the second retrieval.
    const visuals = renderer === 'segmented'
      ? [new DogSystem('gsp', 'liver-white'), new DogSystem('english-setter', 'blue-belton', 1)]
      : [new RiggedDogSystem(), new RiggedDogSystem(1)];
    // Supply the loaded asset's mouth nodes without fetching GLBs; the real
    // rigged mouthWorld method and subsystem registration still run below.
    const mouths = [new THREE.Object3D(), new THREE.Object3D()];
    if (renderer === 'rigged') visuals.forEach((visual, i) => {
      (visual as unknown as { mouth: THREE.Object3D }).mouth = mouths[i];
    });
    const registry = new Map<string, Subsystem>(visuals.map(dog => [dog.id, dog]));
    const system = new BirdsSystem();
    const internal = system as unknown as {
      mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean;
      slots: { root: THREE.Group; simId: number; status: string }[];
      buildPool(ctx: Ctx): void;
      applySpeciesAppearance(slot: unknown, species: ReturnType<typeof getSpecies>): void;
    };
    internal.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    internal.hunt = {
      huntState: () => ({ birds: [{ id: 12, state: 'carried' }] }),
      dogCount: () => dogs.length, dog: (slot: number) => dogs[slot],
      dogRenderWorld: (_alpha: number, out: { x: number; z: number }, slot: number) => Object.assign(out, positions[slot]),
    };
    internal.terrain = { heightAt: () => 2 }; internal.frozen = false;
    const requested: string[] = [];
    const ctx = {
      scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), fixedAlpha: 1,
      get: (id: string) => {
        requested.push(id); const renderer = registry.get(id);
        if (!renderer) throw new Error(`subsystem not registered: ${id}`);
        return renderer;
      },
    } as unknown as Ctx;
    internal.buildPool(ctx);
    const bird = internal.slots[0];
    internal.applySpeciesAppearance(bird, getSpecies('chukar'));
    bird.simId = 12; bird.status = 'grounded';
    const before = JSON.stringify(dogs);
    try {
      for (let frame = 0; frame < 3; frame++) {
        mouths.forEach((mouth, i) => mouth.position.set(positions[i].x + Math.cos(dogs[i].heading) * .32,
          2.58, positions[i].z + Math.sin(dogs[i].heading) * .32));
        system.update(ctx, 1 / 60);
        expect(bird.root.position.x).toBeCloseTo(positions[carrier].x + Math.cos(dogs[carrier].heading) * .32);
        expect(bird.root.position.y).toBeCloseTo(2.58);
        expect(bird.root.position.z).toBeCloseTo(positions[carrier].z + Math.sin(dogs[carrier].heading) * .32);
        positions[carrier].x += .5;
      }
      expect(requested).toEqual(Array(3).fill(visuals[carrier].id));
      expect(JSON.stringify(dogs)).toBe(before);
    } finally { system.dispose(ctx); }
  });
});
