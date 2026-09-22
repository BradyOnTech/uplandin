import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { getSpecies } from '../src/game/species';
import { mulberry32 } from '../src/game/math';
import type { Ctx } from '../src/three/engine';
import { stepQuailFlight, type QuailFlight } from '../src/three/quailFlight';
import { TravellingShot } from '../src/three/shotPattern';
import { BirdsSystem } from '../src/three/subsystems/birds';

interface FlightSlot {
  simId: number; status: string; species: ReturnType<typeof getSpecies>;
  x: number; y: number; z: number; vxW: number; vyW: number; vzW: number;
  airMs: number; departureMs?: number; gliding: boolean;
  root: THREE.Group; spatialFlight: QuailFlight;
  flight: { escX: number; escZ: number; rightX: number; rightZ: number; hunterX: number; hunterZ: number; driftPx: number; rng: () => number };
}
function fixture(speciesId = 'sharptail') {
  const system = new BirdsSystem(), scene = new THREE.Scene();
  const internal = system as unknown as {
    mat: THREE.Material; hunt: unknown; terrain: { heightAt: (x: number, z: number) => number };
    frozen: boolean; spatialEncounter: boolean; riseActive: boolean; staged: Set<number>;
    slots: FlightSlot[]; queue: number[]; qHead: number; qTail: number; riseRng: () => number;
    buildPool(ctx: Ctx): void; applySpeciesAppearance(slot: FlightSlot, species: ReturnType<typeof getSpecies>): void;
    launchWave(birds: { id: number; speciesId: string; pos: { x: number; y: number } }[]): void;
  };
  const birds = [{ id: 1, speciesId, coveyId: 1, state: 'flushed', pos: { x: 40, y: 0 } }];
  const resolveBird = vi.fn((id: number, outcome: string, _landing?: { x: number; z: number }) => {
    const bird = birds.find(bird => bird.id === id)!; bird.state = outcome; return true;
  });
  const hunt = { areaConfig: () => getArea('sharptail-prairie'), huntState: () => ({ birds }),
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
    coverPatches: () => [], resolveBird, finishRise: vi.fn(),
    falconry: undefined as undefined | { targetId: number; phase: string; position: { x: number; y: number; z: number } } };
  internal.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  internal.hunt = hunt; internal.terrain = { heightAt: () => 0 };
  internal.frozen = true; internal.spatialEncounter = true; internal.riseActive = true;
  internal.riseRng = mulberry32(517);
  const ctx = { scene, fixedAlpha: 1, camera: new THREE.PerspectiveCamera() } as unknown as Ctx;
  internal.buildPool(ctx);
  const slot = internal.slots[0];
  internal.applySpeciesAppearance(slot, getSpecies(speciesId));
  Object.assign(slot, { simId: 1, status: 'flying', x: 79.8, y: 2.5, z: 0,
    vxW: 23, vyW: 0, vzW: 0, airMs: 2000,
    flight: { escX: 1, escZ: 0, rightX: 0, rightZ: 1, hunterX: 0, hunterZ: 0, driftPx: 0, rng: mulberry32(1) },
    spatialFlight: { bearing: 0, bend: 0, speed: 23, clearance: 2.3, glideAt: .8 } });
  internal.staged.add(1);
  return { system, internal, ctx, slot, hunt, birds, resolveBird };
}

describe('Sharptail visual departure after authoritative escape', () => {
  it('continues the same airborne trajectory after one escape credit without holding the hunt open', () => {
    const f = fixture();
    f.system.step(f.ctx, 1); f.system.update(f.ctx, 1 / 30);
    expect(f.slot.status).toBe('departing'); expect(f.slot.root.visible).toBe(true);
    expect(f.resolveBird).toHaveBeenCalledExactlyOnceWith(1, 'escaped');
    const expected = { ...f.slot }, profile = { ...f.slot.spatialFlight };
    for (let tick = 0; tick < 12; tick++) {
      expected.airMs += 1000 / 30;
      stepQuailFlight(profile, expected, 1 / 30, () => 0);
      expected.x += expected.vxW / 30; expected.y += expected.vyW / 30; expected.z += expected.vzW / 30;
      f.system.step(f.ctx, 1);
      expect([f.slot.x, f.slot.y, f.slot.z]).toEqual([expected.x, expected.y, expected.z]);
    }
    expect(f.resolveBird).toHaveBeenCalledTimes(1);
    expect(f.hunt.finishRise).toHaveBeenCalledTimes(1);
    expect(f.system.isRiseActive()).toBe(false);
    f.system.dispose(f.ctx);
  });

  it('cannot be shot, acquired by a hawk, retrieved or used as a dog marking target even if approached', () => {
    const f = fixture(); f.system.step(f.ctx, 1);
    const origin = { x: f.slot.x - 10, y: f.slot.y, z: f.slot.z }, direction = { x: 1, y: 0, z: 0 };
    expect(f.system.shootRay(origin, direction)).toBeNull();
    const shot = new TravellingShot(origin, direction, .04, f.system.shotTargets());
    expect(shot.advance(.2, f.system.shotTargets(), () => true)).toBeNull();
    expect(f.system.downBird(1)).toBe(false);
    expect(f.system.quarryTargets()).toEqual([]); expect(f.system.groundedIds()).toEqual([]);
    expect(f.system.markingTarget([1], new THREE.Vector3())).toBe(false);
    expect(f.system.airborne()).toEqual([]);
    f.system.holdQuarry(1, 0, 0, 0);
    expect(f.slot.status).toBe('departing');
    f.system.dispose(f.ctx);
  });

  it('ends a departing mesh at real terrain contact without another escape or relight credit', () => {
    const f = fixture(); f.system.step(f.ctx, 1);
    f.internal.terrain.heightAt = () => 3;
    f.system.step(f.ctx, 1); f.system.update(f.ctx, 1 / 30);
    expect(f.slot.status).toBe('done'); expect(f.slot.root.visible).toBe(false);
    expect(f.resolveBird).toHaveBeenCalledExactlyOnceWith(1, 'escaped');
    f.system.dispose(f.ctx);
  });

  it('keeps genuine landing authority before escape and keeps a planned cover destination live', () => {
    const landed = fixture(); landed.slot.x = 40; landed.slot.y = .1;
    landed.system.step(landed.ctx, 1);
    expect(landed.slot.status).toBe('done');
    expect(landed.resolveBird).toHaveBeenCalledExactlyOnceWith(1, 'escaped', { x: landed.slot.x, z: landed.slot.z });
    landed.system.dispose(landed.ctx);
    const targeted = fixture(); targeted.slot.spatialFlight.target = { x: 120, z: 0 };
    targeted.system.step(targeted.ctx, 1);
    expect(targeted.slot.x).toBeGreaterThan(80); expect(targeted.slot.status).toBe('flying');
    expect(targeted.resolveBird).not.toHaveBeenCalled(); targeted.system.dispose(targeted.ctx);
  });

  it('reclaims a decorative departing slot before delaying a real incoming bird, within the same pool', () => {
    const f = fixture(); f.system.step(f.ctx, 1);
    for (const slot of f.internal.slots.slice(1)) slot.status = 'grounded';
    const newBird = { id: 2, speciesId: 'sharptail', pos: { x: 15, y: 25 } };
    f.internal.queue = [newBird.id]; f.internal.qHead = 0; f.internal.qTail = 1;
    f.internal.launchWave([newBird]);
    expect(f.internal.slots).toHaveLength(14); expect(f.internal.queue).toHaveLength(0);
    expect(f.slot.simId).toBe(2); expect(f.slot.status).toBe('flying');
    expect(f.slot.departureMs ?? 0).toBe(0);
    expect(f.resolveBird).toHaveBeenCalledTimes(1);
    f.system.dispose(f.ctx);
  });

  it('retains other species exits and the existing hawk chase exemption', () => {
    for (const id of ['bobwhite', 'chukar', 'ringneck']) {
      const f = fixture(id); f.system.step(f.ctx, 1); f.system.update(f.ctx, 1 / 30);
      expect(f.slot.status).toBe('done'); expect(f.slot.root.visible).toBe(false);
      expect(f.resolveBird).toHaveBeenCalledExactlyOnceWith(1, 'escaped'); f.system.dispose(f.ctx);
    }
    const pursued = fixture();
    pursued.hunt.falconry = { targetId: 1, phase: 'chasing', position: { x: 25, y: 2, z: 0 } };
    pursued.system.step(pursued.ctx, 3);
    expect(pursued.slot.x).toBeGreaterThan(80); expect(pursued.slot.status).toBe('flying');
    expect(pursued.resolveBird).not.toHaveBeenCalled();
    pursued.hunt.falconry.phase = 'returning'; pursued.system.step(pursued.ctx, 1);
    expect(pursued.slot.status).toBe('departing'); expect(pursued.resolveBird).toHaveBeenCalledTimes(1);
    pursued.system.dispose(pursued.ctx);
  });

  it('bounds decorative lifetime by distance and time, and does not extend the gameplay timeout', () => {
    const distance = fixture(); distance.system.step(distance.ctx, 1); distance.slot.x = 179.8;
    distance.system.step(distance.ctx, 1);
    expect(distance.slot.status).toBe('done'); expect(distance.resolveBird).toHaveBeenCalledTimes(1);
    distance.system.dispose(distance.ctx);
    const time = fixture(); time.system.step(time.ctx, 1);
    time.slot.spatialFlight = { bearing: 0, bend: 0, speed: 1, clearance: 4, glideAt: Infinity };
    time.system.step(time.ctx, 179); expect(time.slot.status).toBe('departing');
    time.system.step(time.ctx, 2); expect(time.slot.status).toBe('done');
    expect(time.resolveBird).toHaveBeenCalledTimes(1); time.system.dispose(time.ctx);
    const timeout = fixture(); timeout.slot.x = 10; timeout.slot.airMs = 15000;
    timeout.system.step(timeout.ctx, 1); expect(timeout.slot.status).toBe('done');
    timeout.system.dispose(timeout.ctx);
  });
});
