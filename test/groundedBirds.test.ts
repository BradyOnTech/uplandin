import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSpecies } from '../src/game/species';
import { BirdsSystem } from '../src/three/subsystems/birds';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ playThud: vi.fn(), playFall: vi.fn(), playBirdFlush: vi.fn(), playPheasantFlush: vi.fn(), playCoveyThunder: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('a shot bird lies on the ground as it is drawn', () => {
  it('strikes, rests and stays on the drawn triangles, not the smooth heightfield under them', () => {
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
    const birds = new BirdsSystem();
    const internal = birds as unknown as {
      mat: THREE.Material; hunt: unknown; terrain: { heightAt(x: number, z: number): number; surfaceHeightAt(x: number, z: number): number };
      frozen: boolean; staged: Set<number>; tickBirds(dtMs: number): void; buildPool(ctx: Ctx): void;
      slots: { status: string; x: number; y: number; z: number; vxW: number; vyW: number; vzW: number; airMs: number; previousAirMs: number;
        simId: number; root: THREE.Group; flight?: unknown }[];
      applySpeciesAppearance(slot: unknown, species: ReturnType<typeof getSpecies>): void;
    };
    const simBirds = [{ id: 1, coveyId: 1, speciesId: 'bobwhite', state: 'downed', pos: { x: 0, y: 20 } }];
    const recordFallWorld = vi.fn();
    internal.hunt = { areaConfig: () => ({ id: 'quail-fields', world: { x: -500, y: -500, w: 1000, h: 1000 }, patches: [], landmarks: [] }),
      huntState: () => ({ birds: simBirds, hunterPos: { x: 0, y: 0 }, wind: 0 }), recordFallWorld,
      simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }) };
    // The drawn ground sits 0.3 m above the heightfield here (a coarse far tile).
    let drawn = .3;
    internal.terrain = { heightAt: () => 0, surfaceHeightAt: () => drawn };
    internal.mat = new THREE.MeshLambertMaterial(); internal.frozen = true;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const ctx = { scene, camera, fixedAlpha: 1, events: new EventTarget(), get: () => ({}) } as unknown as Ctx;
    internal.buildPool(ctx); internal.staged.add(1);
    const slot = internal.slots[0];
    internal.applySpeciesAppearance(slot, getSpecies('bobwhite'));
    // Coming down slowly onto the drawn ground (no bounce), just through its face.
    Object.assign(slot, { simId: 1, status: 'falling', x: 0, y: .32, z: 20, vxW: 0, vyW: -1, vzW: 0, airMs: 900, previousAirMs: 870,
      flight: { escX: 0, escZ: 1, rightX: -1, rightZ: 0, hunterX: 0, hunterZ: 0, rng: () => .5 } });
    for (let i = 0; i < 40 && slot.status !== 'grounded'; i++) internal.tickBirds(1000 / 30);
    expect(slot.status).toBe('grounded');
    expect(slot.y).toBeCloseTo(.36, 6);
    expect(recordFallWorld).toHaveBeenCalled();
    birds.update(ctx, 0);
    expect(slot.root.position.y).toBeCloseTo(.36, 6);
    // The camera walks closer and a finer tile is drawn under it: it follows.
    drawn = .1; birds.update(ctx, 0);
    expect(slot.root.position.y).toBeCloseTo(.16, 6);
    birds.dispose(ctx);
  });
});
