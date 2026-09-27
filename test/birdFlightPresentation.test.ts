import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSpecies } from '../src/game/species';
import { mulberry32 } from '../src/game/math';
import { BirdsSystem } from '../src/three/subsystems/birds';
import { GunSystem } from '../src/three/subsystems/gun';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn(), playThud: vi.fn() }));
type Point = { x: number; y: number; z: number };
type FlightSlot = Point & { simId: number; status: string; previousX?: number; previousY?: number; previousZ?: number;
  vxW: number; vyW: number; vzW: number; airMs: number; previousAirMs: number; root: THREE.Group };

function field() {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  const birds = new BirdsSystem();
  const internal = birds as unknown as {
    mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean; spatialEncounter: boolean;
    queue: number[]; qHead: number; qTail: number; riseRng: () => number;
    launchWave(birds: { id: number; speciesId: string; pos: { x: number; y: number } }[]): void;
    slots: FlightSlot[]; buildPool(ctx: Ctx): void; applySpeciesAppearance(slot: FlightSlot, species: ReturnType<typeof getSpecies>): void;
  };
  const simBird = { id: 1, state: 'downed' };
  const hunt = { areaConfig: () => ({ id: 'chukar-ridge' }), huntState: () => ({ gunId: 'over-under', birds: [simBird] }),
    resolveBird: vi.fn(() => true), recordFallWorld: vi.fn(), getActiveChallenge: () => 'wild',
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
    coverPatches: () => [] };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); camera.position.y = 2; camera.updateMatrixWorld();
  const ctx = { scene, camera, fixedAlpha: .25, renderer: { domElement: new EventTarget() }, events: new EventTarget(),
    quality: 'lite', timeOfDay: 'morning', time: 1, paused: false,
    get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]) } as unknown as Ctx;
  internal.mat = new THREE.MeshLambertMaterial({ vertexColors: true }); internal.hunt = hunt;
  internal.terrain = { heightAt: () => 0 }; internal.frozen = false; internal.spatialEncounter = true;
  internal.buildPool(ctx); const slot = internal.slots[0]; internal.applySpeciesAppearance(slot, getSpecies('chukar'));
  Object.assign(slot, { simId: 1, status: 'flying', x: .6, y: 2, z: -12, previousX: 0, previousY: 2, previousZ: -12,
    vxW: 18, vyW: 0, vzW: 0, airMs: 500, previousAirMs: 500 - 1000 / 30 });
  return { birds, internal, slot, ctx, hunt };
}
afterEach(() => vi.unstubAllGlobals());

describe('visible flight and shot sampling', () => {
  it('moves the visible bird continuously between ticks and samples that exact center for shots', () => {
    const f = field(), physical = [f.slot.x, f.slot.y, f.slot.z, f.slot.airMs];
    for (const alpha of [0, .25, .5, .75, 1]) {
      f.ctx.fixedAlpha = alpha; f.birds.update(f.ctx, 1 / 120);
      expect(f.slot.root.position.x).toBeCloseTo(.6 * alpha, 12);
      const sampled = f.birds.shotTargets(alpha)[0];
      expect([sampled.x, sampled.y, sampled.z]).toEqual(f.slot.root.position.toArray());
      const shown = f.birds.airborne()[0];
      expect([shown.x, shown.y, shown.z]).toEqual(f.slot.root.position.toArray());
      expect([f.slot.x, f.slot.y, f.slot.z, f.slot.airMs]).toEqual(physical);
      expect(f.birds.quarryTargets()[0].x).toBe(.6);
    }
    f.birds.dispose(f.ctx);
  });

  it.each(['capture', 'legacy'])('preserves authoritative %s positions and samples', mode => {
    const f = field(); f.internal.frozen = mode === 'capture'; f.internal.spatialEncounter = mode !== 'legacy';
    f.ctx.fixedAlpha = .1; f.birds.update(f.ctx, 0);
    expect(f.slot.root.position.x).toBe(.6); expect(f.birds.shotTargets(.1)[0].x).toBe(.6);
    expect(f.birds.airborne()[0].x).toBe(.6); f.birds.dispose(f.ctx);
  });

  it('begins the fall at the actual swept hit and clears old flight/held-quarry history', () => {
    const f = field(), impact = { x: .31, y: 2, z: -12 };
    expect(f.birds.downBird(1, impact)).toBe(true);
    for (const alpha of [0, .5, 1]) {
      f.ctx.fixedAlpha = alpha; f.birds.update(f.ctx, 0);
      expect(f.slot.root.position.toArray()).toEqual([impact.x, impact.y, impact.z]);
    }
    // Falconry's external hold must not interpolate from an old airborne point.
    f.birds.holdQuarry(1, 5, .3, -9); f.ctx.fixedAlpha = 0; f.birds.update(f.ctx, 0);
    expect(f.slot.root.position.toArray()).toEqual([5, .3, -9]);
    f.birds.dispose(f.ctx);
  });

  it('discards the old flight when a pooled slot launches from new cover', () => {
    const f = field(); f.slot.status = 'done';
    f.internal.frozen = true; // Silence audio for this exact launch fixture.
    f.internal.riseRng = mulberry32(517); f.internal.queue = [2]; f.internal.qHead = 0; f.internal.qTail = 1;
    f.internal.launchWave([{ id: 2, speciesId: 'chukar', pos: { x: 20, y: 30 } }]);
    f.internal.frozen = false;
    for (const alpha of [0, .5, 1]) {
      f.ctx.fixedAlpha = alpha; f.birds.update(f.ctx, 0);
      expect(f.slot.root.position.toArray()).toEqual([20, .2, 30]);
      expect(f.birds.shotTargets(alpha)[0]).toMatchObject({ simId: 2, x: 20, y: .2, z: 30 });
    }
    f.birds.dispose(f.ctx);
  });

  it('keeps a settled fall exactly grounded and records the actual landing once', () => {
    const f = field(); f.birds.downBird(1, { x: .31, y: .061, z: -12 });
    f.birds.fixedUpdate(f.ctx, 1000 / 30);
    expect(f.slot.status).toBe('grounded');
    for (const alpha of [0, .5, 1]) {
      f.ctx.fixedAlpha = alpha; f.birds.update(f.ctx, 0);
      expect(f.slot.root.position.toArray()).toEqual([.31, .06, -12]);
    }
    f.birds.fixedUpdate(f.ctx, 1000 / 30);
    expect(f.hunt.recordFallWorld).toHaveBeenCalledExactlyOnceWith(1, .31, -12);
    f.birds.dispose(f.ctx);
  });

  it.each([0, .25, .5, .9, 1])('keeps a crossing shot on the fired presentation phase %s across later render frames', phase => {
    const f = field(); f.ctx.fixedAlpha = phase; f.birds.update(f.ctx, 1 / 120);
    const gun = new GunSystem(); gun.init(f.ctx);
    const visibleX = .6 * phase, flightSeconds = Math.hypot(visibleX + .72, 12) / 300;
    f.ctx.camera.lookAt(visibleX + 18 * flightSeconds, 2, -12); f.ctx.camera.updateMatrixWorld();
    (gun as unknown as { mountT: number }).mountT = 1;
    f.ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'), { detail: 'mount' }));
    window.dispatchEvent(Object.assign(new Event('keydown'), { code: 'Space', key: ' ', repeat: false }));
    expect(gun.shellsRemaining()).toBe(1);
    // The next render's phase differs; the in-flight shot retains its own
    // coherent target timeline, rather than mixing new camera-frame samples.
    f.ctx.fixedAlpha = .99;
    for (let tick = 0; tick < 3 && f.slot.status === 'flying'; tick++) {
      f.slot.previousX = f.slot.x; f.slot.x += .6;
      gun.fixedUpdate(f.ctx, 1000 / 30);
    }
    expect(f.hunt.resolveBird).toHaveBeenCalledExactlyOnceWith(1, 'downed');
    expect(f.slot.status).toBe('falling');
    expect(f.slot.x).toBeCloseTo(visibleX + 18 * flightSeconds, 2);
    expect(f.slot.x).toBeLessThan(1.8);
    f.ctx.fixedAlpha = 0; f.birds.update(f.ctx, 0);
    expect(f.slot.root.position.x).toBe(f.slot.x);
    gun.dispose(f.ctx); f.birds.dispose(f.ctx);
  });
});
