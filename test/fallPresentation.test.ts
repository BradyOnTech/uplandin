import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSpecies } from '../src/game/species';
import { BirdsSystem } from '../src/three/subsystems/birds';
import type { Ctx } from '../src/three/engine';
import { fallSoundDelay, synthesizeFall } from '../src/three/fallAudio';
import { fallBall, fallWeight, featherPuffSize, impactSurface, strideLength } from '../src/three/fallPresentation';
import { featherTones } from '../src/three/featherDrift';
import { playFall } from '../src/audio';
import { CoverEruption } from '../src/three/coverEruption';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), prepareGunSounds: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn(), playThud: vi.fn(), playFall: vi.fn(),
  playBirdFlush: vi.fn(), playPheasantFlush: vi.fn(), playCoveyThunder: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.mocked(playFall).mockClear(); });

type Slot = { simId: number; status: string; x: number; y: number; z: number; vxW: number; vyW: number; vzW: number; airMs: number; previousAirMs: number;
  root: THREE.Group; body: THREE.Mesh; wingL: THREE.Group; wingR: THREE.Group; legMesh?: THREE.Mesh; legMeshR?: THREE.Mesh; stride?: number; running?: boolean };

/** One bird over flat ground, hit `height` metres up, `range` metres out from the hunter. */
function field(speciesId = 'chukar', options: { height?: number; range?: number; surface?: { moisture: number; vegetation: number }; pond?: boolean } = {}) {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  const birds = new BirdsSystem();
  const internal = birds as unknown as {
    mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean; listener?: THREE.Camera; slots: Slot[];
    buildPool(ctx: Ctx): void; buildFeathers(ctx: Ctx): void; applySpeciesAppearance(slot: Slot, species: ReturnType<typeof getSpecies>): void; tickBirds(dtMs: number): void;
    eruption?: CoverEruption; featherGeo?: THREE.BufferGeometry; featherMat?: THREE.PointsMaterial;
  };
  const range = options.range ?? 30;
  const simBird: Record<string, unknown> = { id: 1, state: 'downed', speciesId, pos: { x: 0, y: -range } };
  const hunt = {
    areaConfig: () => ({ id: options.pond ? 'pheasant-coverts' : 'chukar-ridge',
      landmarks: options.pond ? [{ id: 'south-slough', name: 'South Slough', kind: 'pond', position: { x: 0, y: -range } }] : [] }),
    huntState: () => ({ gunId: 'over-under', birds: [simBird], hunterPos: { x: 0, y: 0 }, wind: 0 }),
    riseSlopeApproach: () => null, resolveBird: vi.fn(() => true), recordFallWorld: vi.fn(),
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
    coverPatches: () => [], surfaceAtWorld: (_x: number, _z: number, out: { moisture: number; vegetation: number }) =>
      Object.assign(out, options.surface ?? { moisture: .2, vegetation: .4 }),
  };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 844 / 390, .05, 1000);
  camera.position.set(0, 1.62, 0); camera.lookAt(0, 1.62, -range); camera.updateMatrixWorld();
  const ctx = { scene, camera, fixedAlpha: 1, renderer: { domElement: new EventTarget() }, events: new EventTarget(),
    quality: 'lite', timeOfDay: 'morning', time: 1, paused: false,
    get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]) } as unknown as Ctx;
  internal.mat = new THREE.MeshLambertMaterial({ vertexColors: true }); internal.hunt = hunt;
  internal.terrain = { heightAt: () => 0 }; internal.frozen = false; internal.listener = camera;
  internal.buildPool(ctx); internal.buildFeathers(ctx);
  internal.eruption = new CoverEruption('lite', () => 0, 'chukar-ridge');
  const slot = internal.slots[0]; internal.applySpeciesAppearance(slot, getSpecies(speciesId));
  Object.assign(slot, { simId: 1, status: 'flying', x: 0, y: options.height ?? 6, z: -range, vxW: 14, vyW: 0, vzW: 0, airMs: 900, previousAirMs: 900 - 1000 / 30 });
  return { birds, internal, slot, ctx, hunt, simBird };
}

describe('a shot bird reads coming down', () => {
  it('collapses into a tumbling ball and bounces once off hard ground, with dust and a late thump', () => {
    const f = field('chukar', { height: 6, range: 34 });
    expect(f.birds.downBird(1)).toBe(true);
    const heights: number[] = [];
    let ball = Infinity;
    for (let tick = 0; tick < 90 && f.slot.status === 'falling'; tick++) {
      f.internal.tickBirds(1000 / 30); heights.push(f.slot.y);
      if (f.slot.status === 'falling') { f.birds.update(f.ctx, 1 / 30); ball = Math.min(ball, f.slot.body.scale.z); }
    }
    expect(f.slot.status).toBe('grounded');
    // Balled up in the fall: shorter nose to tail.
    expect(ball).toBeLessThan(.85);
    // Down to the ground, back up off it, then down to rest.
    const first = heights.findIndex(y => y < .1);
    expect(first).toBeGreaterThan(0);
    expect(Math.max(...heights.slice(first))).toBeGreaterThan(.12);
    expect(f.hunt.recordFallWorld).toHaveBeenCalledTimes(1);
    expect(f.internal.eruption!.audit().bursts).toBe(1);
    expect(playFall).toHaveBeenCalledTimes(1);
    const [surface, weight, distance] = vi.mocked(playFall).mock.calls[0];
    expect(surface).toBe('ground'); expect(weight).toBe(fallWeight('chukar')); expect(distance).toBeGreaterThan(30);
    // Back at rest the body is its own shape again.
    f.birds.update(f.ctx, 1 / 30);
    expect(f.slot.body.scale.toArray()).toEqual([1, 1, 1]);
    f.birds.dispose(f.ctx);
  });

  it('swishes into cattails and splashes into a slough without bouncing', () => {
    const reeds = field('ringneck', { height: 5, surface: { moisture: .8, vegetation: .9 } });
    reeds.birds.downBird(1);
    for (let tick = 0; tick < 90 && reeds.slot.status === 'falling'; tick++) reeds.internal.tickBirds(1000 / 30);
    expect(reeds.slot.status).toBe('grounded');
    expect(vi.mocked(playFall).mock.calls.at(-1)![0]).toBe('reeds');
    reeds.birds.dispose(reeds.ctx);
    const water = field('ringneck', { height: 5, pond: true });
    water.birds.downBird(1);
    for (let tick = 0; tick < 90 && water.slot.status === 'falling'; tick++) water.internal.tickBirds(1000 / 30);
    expect(vi.mocked(playFall).mock.calls.at(-1)![0]).toBe('water');
    water.birds.dispose(water.ctx);
  });

  it('throws a feather puff in the bird\'s own colours, big enough to see at 35 m on a phone', () => {
    const f = field('hun', { range: 35 });
    f.birds.downBird(1);
    const colors = f.internal.featherGeo!.getAttribute('color') as THREE.BufferAttribute;
    const tones = featherTones('hun');
    expect([colors.getX(0), colors.getY(0), colors.getZ(0)]).toEqual([tones[0].r, tones[0].g, tones[0].b].map(v => expect.closeTo(v, 5)));
    // three draws a point size * height / 2 / depth pixels across.
    const viewHeight = (f.birds as unknown as { viewHeight: () => number }).viewHeight();
    expect(f.internal.featherMat!.size * viewHeight / 2 / 35).toBeGreaterThanOrEqual(2.9);
    f.birds.dispose(f.ctx);
  });

  it('runs a wing-tipped bird on striding legs, not sliding', () => {
    const f = field('chukar');
    Object.assign(f.slot, { status: 'grounded', y: .06 });
    Object.assign(f.simBird, { wounded: true, woundRunMs: 5000, fallPending: false });
    const strides: number[] = [], legs: number[][] = [];
    for (let tick = 0; tick < 12; tick++) {
      (f.simBird.pos as { x: number }).x += 1.3 / 30;
      f.internal.tickBirds(1000 / 30); f.birds.update(f.ctx, 1 / 30);
      strides.push(f.slot.stride!); legs.push([f.slot.legMesh!.rotation.x, f.slot.legMeshR!.rotation.x]);
    }
    expect(f.slot.running).toBe(true);
    // Half a stride turn for every strideLength of ground: 11 ticks at 1.3 m/s.
    const turned = strides.slice(1).reduce((sum, v, i) => sum + ((v - strides[i] + Math.PI * 2) % (Math.PI * 2)), 0);
    expect(turned).toBeCloseTo(11 * 1.3 / 30 / strideLength('chukar') * Math.PI, 5);
    expect(f.slot.legMeshR!.visible).toBe(true);
    // The legs swing in turn.
    for (const [left, right] of legs) expect(left).toBeCloseTo(-right, 9);
    expect(Math.max(...legs.map(([left]) => Math.abs(left)))).toBeGreaterThan(.3);
    f.birds.dispose(f.ctx);
  });
});

describe('fall numbers', () => {
  it('hears a fall later the farther it is, as sound comes back', () => {
    expect(fallSoundDelay(0)).toBe(0);
    expect(fallSoundDelay(343)).toBeCloseTo(1, 9);
    expect(fallSoundDelay(40)).toBeGreaterThan(.11);
  });

  it('makes a thump, a swish and a splash, each finite and heard', () => {
    for (const surface of ['ground', 'reeds', 'water'] as const) {
      const samples = synthesizeFall(surface, .5, 3);
      const peak = Math.max(...samples.map(Math.abs));
      expect(samples.every(Number.isFinite)).toBe(true);
      expect(peak).toBeGreaterThan(.05); expect(peak).toBeLessThan(1.5);
    }
    // A rooster lands heavier than a quail.
    const energy = (s: Float32Array) => s.reduce((sum, v) => sum + v * v, 0);
    expect(energy(synthesizeFall('ground', 1, 3))).toBeGreaterThan(energy(synthesizeFall('ground', .15, 3)));
    expect(synthesizeFall('ground', .5, 3)).toEqual(synthesizeFall('ground', .5, 3));
  });

  it('balls up, keeps feathers at three pixels or more, and reads the surface', () => {
    expect(fallBall(0)).toEqual({ x: 1, y: 1, z: 1 });
    expect(fallBall(1).z).toBeLessThan(.8);
    const near = featherPuffSize(8, 1, 390), far = featherPuffSize(35, 1.6, 390);
    expect(far.size * 195 / 35).toBeGreaterThanOrEqual(3 - 1e-9);
    expect(far.spread).toBeGreaterThan(near.spread);
    expect(impactSurface(.2)).toBe('water');
    expect(impactSurface(0, { moisture: .8, vegetation: .9 })).toBe('reeds');
    expect(impactSurface(0, { moisture: .3, vegetation: .9 })).toBe('ground');
    expect(strideLength('ringneck')).toBeGreaterThan(strideLength('bobwhite'));
  });
});
