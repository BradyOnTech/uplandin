import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSpecies } from '../src/game/species';
import type { Ctx, Subsystem } from '../src/three/engine';
import { BirdsSystem } from '../src/three/subsystems/birds';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';
import { getArea, getDropPoint } from '../src/game/areas';

afterEach(() => vi.unstubAllGlobals());

describe('bird retrieval by either member of a brace', () => {
  it.each([[0, 'skinned'], [1, 'skinned']] as const)('uses the registered renderer and position for carrying dog %i (%s)', (carrier, renderer) => {
    const dogs = [
      { carryingBirdId: carrier === 0 ? 12 : null, gait: 'trot', heading: 0 },
      { carryingBirdId: carrier === 1 ? 12 : null, gait: 'trot', heading: Math.PI / 2 },
    ];
    const positions = [{ x: 70, z: 80 }, { x: 3, z: 4 }];
    // Keep the actual production subsystem identities; permissive get stubs
    // hide missing renderers, which used to crash only the second retrieval.
    expect(renderer).toBe('skinned');
    const visuals = [new GeneratedDogSystem('liver-white', 0), new GeneratedDogSystem('blue-belton', 1, 'faceted')];
    const mouths = [new THREE.Object3D(), new THREE.Object3D()];
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

  it('keeps a Setter-carried bird at the animated jaw rather than a fixed ground offset', () => {
    vi.stubGlobal('window', {});
    const visual = new GeneratedDogSystem('blue-belton', 1, 'faceted');
    const scene = new THREE.Scene();
    const carrier = { state: 'retrieving', gait: 'trot', heading: Math.PI / 2, scentStage: 'none', scentProgress: 0, carryingBirdId: 12 as number | null };
    const hunt = {
      areaConfig: () => getArea('quail-fields'), dropPoint: () => getDropPoint(getArea('quail-fields')),
      huntState: () => ({ birds: [{ id: 12, state: 'carried' }] }), dogCount: () => 2,
      dog: (slot: number) => slot === 1 ? carrier : { ...carrier, carryingBirdId: null },
      dogRenderWorld: (_alpha: number, out: { x: number; z: number }) => Object.assign(out, { x: 3, z: 4 }),
      dogRenderHeading: () => carrier.heading, dogRenderTravelHeading: () => carrier.heading,
    };
    const terrain = { heightAt: () => 2, markingTarget: () => false };
    const ctx = { scene, camera: new THREE.PerspectiveCamera(), fixedAlpha: 1, quality: 'lite',
      get: (id: string) => id === 'hunt3d' ? hunt : id === visual.id ? visual : terrain,
    } as unknown as Ctx;
    visual.init(ctx);
    const system = new BirdsSystem();
    const internal = system as unknown as {
      mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean;
      slots: { root: THREE.Group; simId: number; status: string }[];
      buildPool(ctx: Ctx): void;
      applySpeciesAppearance(slot: unknown, species: ReturnType<typeof getSpecies>): void;
    };
    internal.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    internal.hunt = hunt; internal.terrain = terrain; internal.frozen = false;
    internal.buildPool(ctx); const bird = internal.slots[0];
    internal.applySpeciesAppearance(bird, getSpecies('chukar')); bird.simId = 12; bird.status = 'grounded';
    const expected = new THREE.Vector3();
    const root = scene.getObjectByName('generated-english-setter')!;
    const neck = root.getObjectByName('neck')!;
    try {
      for (const [heading, pitch] of [[Math.PI / 2, 0], [.8, .16], [-1.2, -.22]]) {
        carrier.heading = heading;
        visual.update(ctx, 1 / 60);
        // The rig moves under the bird: the body pitches and the neck bends.
        root.rotation.x = pitch; neck.rotation.x += pitch; root.updateMatrixWorld(true);
        system.update(ctx, 1 / 60);
        expect(visual.mouthWorld(expected)).toBe(true);
        expect(bird.root.position.distanceTo(expected)).toBeLessThan(1e-6);
        expect(bird.root.position.distanceTo(new THREE.Vector3(3 + Math.cos(heading) * .32, 2.58, 4 + Math.sin(heading) * .32))).toBeGreaterThan(.05);
      }
    } finally { system.dispose(ctx); visual.dispose(); }
  });
});
