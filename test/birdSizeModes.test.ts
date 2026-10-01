import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSpecies } from '../src/game/species';
import { restingBirdScale } from '../src/three/carriedBirdPresentation';
import { QUAIL_WORLD_SCALE } from '../src/three/quailPresentation';
import { BirdsSystem, type BirdsOptions } from '../src/three/subsystems/birds';
import { flyingBirdScale, LIFE_SIZE_FAR_M, LIFE_SIZE_NEAR_M, resolveBirdSize } from '../src/three/birdScale';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn(), playThud: vi.fn() }));

type FlightSlot = { simId: number; status: string; x: number; y: number; z: number; visualScale: number;
  vxW: number; vyW: number; vzW: number; airMs: number; previousAirMs: number; root: THREE.Group;
  legMesh?: THREE.Mesh; tailMesh?: THREE.Mesh };

/** One flying rooster on a non-quail ground, as birdFlightPresentation builds its chukar.
 * The camera stands 2 m up at the origin; the bird is `ahead` metres out. */
function rooster(options?: BirdsOptions, airMs = 120, ahead = 20) {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  const birds = new BirdsSystem(options);
  const internal = birds as unknown as {
    mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean; spatialEncounter: boolean; refinedQuail: boolean; listener: THREE.Camera;
    slots: FlightSlot[]; buildPool(ctx: Ctx): void;
    applySpeciesAppearance(slot: FlightSlot, species: ReturnType<typeof getSpecies>, sex?: 'hen' | 'rooster'): void;
  };
  const hunt = { areaConfig: () => ({ id: 'pheasant-coverts' }), huntState: () => ({ gunId: 'over-under', birds: [] }),
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }), coverPatches: () => [] };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); camera.position.y = 2; camera.updateMatrixWorld();
  const ctx = { scene, camera, fixedAlpha: 1, renderer: { domElement: new EventTarget() }, events: new EventTarget(),
    quality: 'high', timeOfDay: 'morning', time: 1, paused: false,
    get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]) } as unknown as Ctx;
  internal.mat = new THREE.MeshLambertMaterial({ vertexColors: true }); internal.hunt = hunt; internal.listener = camera;
  internal.terrain = { heightAt: () => 0 }; internal.frozen = false; internal.spatialEncounter = true;
  internal.buildPool(ctx); const slot = internal.slots[0];
  internal.applySpeciesAppearance(slot, getSpecies('ringneck'), 'rooster');
  Object.assign(slot, { simId: 1, status: 'flying', x: 0, y: 2, z: -ahead, vxW: 0, vyW: 4, vzW: 8,
    airMs, previousAirMs: airMs - 1000 / 30 });
  birds.update(ctx, 1 / 60);
  return { birds, internal, slot, ctx };
}
afterEach(() => vi.unstubAllGlobals());

describe('flying bird size modes', () => {
  it('reads the field link and keeps today\'s sizes by default', () => {
    expect(resolveBirdSize('life')).toBe('life');
    expect(resolveBirdSize('true')).toBe('true');
    for (const value of [null, '', 'Life', 'today', 'readable']) expect(resolveBirdSize(value)).toBe('readable');
  });

  it.each([['pheasant', 1.25], ['chukar', 1.175], ['partridge', 1.35], ['grouse', 1.45]])(
    'eases a %s from true size up close to the readable size at range, shrinking on screen all the way', (family, trueScale) => {
      expect(restingBirdScale(family)).toBe(trueScale);
      expect(flyingBirdScale('life', trueScale, 3.3, 2)).toBe(trueScale);
      expect(flyingBirdScale('life', trueScale, 3.3, LIFE_SIZE_NEAR_M)).toBe(trueScale);
      expect(flyingBirdScale('life', trueScale, 3.3, LIFE_SIZE_FAR_M)).toBe(3.3);
      expect(flyingBirdScale('life', trueScale, 3.3, 80)).toBe(3.3);
      let previousApparent = Infinity, previousScale = 0;
      for (let d = 1; d <= 60; d += .25) {
        const scale = flyingBirdScale('life', trueScale, 3.3, d);
        expect(scale).toBeGreaterThanOrEqual(previousScale);
        expect(scale / d).toBeLessThan(previousApparent);
        previousScale = scale; previousApparent = scale / d;
      }
      expect(flyingBirdScale('true', trueScale, 3.3, 30)).toBe(trueScale);
      expect(flyingBirdScale('readable', trueScale, 3.3, 2)).toBe(3.3);
    });

  it('draws a rooster at the size its mode asks for', () => {
    const today = rooster(), honest = rooster({ size: 'true' }), near = rooster({ size: 'life' }, 120, 3), far = rooster({ size: 'life' }, 120, 50);
    const trueSize = restingBirdScale('pheasant') * honest.slot.visualScale;
    expect(today.slot.root.scale.x).toBeCloseTo(3.3 * today.slot.visualScale, 9);
    expect(honest.slot.root.scale.x).toBeCloseTo(trueSize, 9);
    expect(near.slot.root.scale.x).toBeCloseTo(trueSize, 9);
    expect(far.slot.root.scale.x).toBeCloseTo(3.3 * far.slot.visualScale, 9);
    // The harness's projected wingspan follows the drawn size.
    expect(today.birds.airborne()[0].sizeM / honest.birds.airborne()[0].sizeM).toBeCloseTo(3.3 / restingBirdScale('pheasant'), 9);
    expect(near.birds.airborne()[0].sizeM).toBeCloseTo(honest.birds.airborne()[0].sizeM, 9);
    for (const f of [today, honest, near, far]) f.birds.dispose(f.ctx);
  });

  it('leaves Quail Fields at its own world scale in every mode', () => {
    for (const options of [undefined, { size: 'true' as const }, { size: 'life' as const }]) {
      const f = rooster(options);
      f.internal.refinedQuail = true; f.birds.update(f.ctx, 1 / 60);
      expect(f.slot.root.scale.x).toBeCloseTo(QUAIL_WORLD_SCALE * f.slot.visualScale, 9);
      f.birds.dispose(f.ctx);
    }
  });

  it('hangs the legs and fans the tail on the jump, then tucks and closes them', () => {
    const jump = rooster(undefined, 120), level = rooster(undefined, 1600);
    expect(jump.slot.legMesh?.visible).toBe(true);
    expect(jump.slot.legMesh!.rotation.x).toBeLessThan(.5);
    expect(level.slot.legMesh!.rotation.x).toBeGreaterThan(1.3);
    const fan = (f: ReturnType<typeof rooster>) => f.slot.tailMesh!.morphTargetInfluences![0];
    expect(fan(jump)).toBeGreaterThan(.75);
    expect(fan(level)).toBeLessThan(.35);
    jump.birds.dispose(jump.ctx); level.birds.dispose(level.ctx);
  });
});
