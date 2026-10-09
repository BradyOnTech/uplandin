import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { getSpecies } from '../src/game/species';
import { mulberry32 } from '../src/game/math';
import { lineFamilyFor, planFlightLine, stepFlightLine, type FlightLine } from '../src/game/flightLine';
import type { Ctx } from '../src/three/engine';
import { TravellingShot } from '../src/three/shotPattern';
import { BirdsSystem } from '../src/three/subsystems/birds';

interface FlightSlot {
  simId: number; status: string; species: ReturnType<typeof getSpecies>;
  x: number; y: number; z: number; vxW: number; vyW: number; vzW: number;
  airMs: number; departureMs?: number; gliding: boolean;
  root: THREE.Group; line: FlightLine;
  flight: { escX: number; escZ: number; rightX: number; rightZ: number; hunterX: number; hunterZ: number; rng: () => number };
}

/** A bird already on its line, a step short of leaving the shot (80 m). */
function fixture(speciesId = 'sharptail') {
  const system = new BirdsSystem(), scene = new THREE.Scene();
  const internal = system as unknown as {
    mat: THREE.Material; hunt: unknown; terrain: { heightAt: (x: number, z: number) => number };
    frozen: boolean; riseActive: boolean; staged: Set<number>; listener?: THREE.Camera;
    slots: FlightSlot[]; riseRng: () => number;
    buildPool(ctx: Ctx): void; applySpeciesAppearance(slot: FlightSlot, species: ReturnType<typeof getSpecies>): void;
    tickBirds(dtMs: number): void;
  };
  const birds: { id: number; speciesId: string; coveyId: number; state: string; pos: { x: number; y: number } }[] =
    [{ id: 1, speciesId, coveyId: 1, state: 'flushed', pos: { x: 40, y: 0 } }];
  const resolveBird = vi.fn((id: number, outcome: string, _landing?: { x: number; z: number }) => {
    const bird = birds.find(bird => bird.id === id)!; bird.state = outcome; return true;
  });
  const hunt = { areaConfig: () => getArea('sharptail-prairie'), huntState: () => ({ birds, hunterPos: { x: 0, y: 0 }, wind: 0 }),
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
    coverPatches: () => [], resolveBird, finishRise: vi.fn(), riseSlopeApproach: () => null,
    falconry: undefined as undefined | { targetId: number; phase: string; position: { x: number; y: number; z: number } } };
  internal.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  internal.hunt = hunt; internal.terrain = { heightAt: () => 0 };
  internal.frozen = true; internal.riseActive = true;
  internal.riseRng = mulberry32(517);
  const ctx = { scene, fixedAlpha: 1, camera: new THREE.PerspectiveCamera() } as unknown as Ctx;
  internal.buildPool(ctx);
  const slot = internal.slots[0];
  internal.applySpeciesAppearance(slot, getSpecies(speciesId));
  const line = planFlightLine({ family: lineFamilyFor(speciesId), flight: getSpecies(speciesId).flight,
    start: { x: 30, y: .2, z: 0 }, eye: { x: 0, y: 60, z: 0 }, bearing: 0, ground: () => 0, rng: mulberry32(9), mayLand: false });
  Object.assign(slot, { simId: 1, status: 'flying', x: 79.8, y: 3, z: 0, vxW: 18, vyW: 0, vzW: 0, airMs: 3000,
    flight: { escX: 1, escZ: 0, rightX: 0, rightZ: 1, hunterX: 0, hunterZ: 0, rng: mulberry32(1) }, line });
  internal.staged.add(1);
  return { system, internal, ctx, slot, hunt, birds, resolveBird };
}

describe('every escaping bird leaves honestly', () => {
  it('flies on along its own line after one escape credit, holding nothing open', () => {
    const f = fixture();
    f.internal.tickBirds(1000 / 30); f.system.update(f.ctx, 1 / 30);
    expect(f.slot.status).toBe('departing'); expect(f.slot.root.visible).toBe(true);
    expect(f.resolveBird).toHaveBeenCalledExactlyOnceWith(1, 'escaped');
    const expected = { ...f.slot };
    for (let tick = 0; tick < 12; tick++) {
      expected.airMs += 1000 / 30;
      stepFlightLine(f.slot.line, expected, 1 / 30, () => 0);
      expected.x += expected.vxW / 30; expected.y += expected.vyW / 30; expected.z += expected.vzW / 30;
      f.internal.tickBirds(1000 / 30);
      expect([f.slot.x, f.slot.y, f.slot.z]).toEqual([expected.x, expected.y, expected.z]);
    }
    expect(f.resolveBird).toHaveBeenCalledTimes(1);
    expect(f.hunt.finishRise).toHaveBeenCalledTimes(1);
    expect(f.system.isRiseActive()).toBe(false);
    f.system.dispose(f.ctx);
  });

  it('cannot be shot, acquired by a hawk, retrieved or used as a dog marking target even if approached', () => {
    const f = fixture(); f.internal.tickBirds(1000 / 30);
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

  it('gives every species the same honest exit, and keeps the hawk chase exemption', () => {
    for (const id of ['bobwhite', 'chukar', 'ringneck', 'hun']) {
      const f = fixture(id); f.internal.tickBirds(1000 / 30); f.system.update(f.ctx, 1 / 30);
      expect(f.slot.status).toBe('departing'); expect(f.slot.root.visible).toBe(true);
      expect(f.resolveBird).toHaveBeenCalledExactlyOnceWith(1, 'escaped'); f.system.dispose(f.ctx);
    }
    const pursued = fixture();
    pursued.hunt.falconry = { targetId: 1, phase: 'chasing', position: { x: 25, y: 2, z: 0 } };
    for (let i = 0; i < 3; i++) pursued.internal.tickBirds(1000 / 30);
    expect(pursued.slot.x).toBeGreaterThan(80); expect(pursued.slot.status).toBe('flying');
    expect(pursued.resolveBird).not.toHaveBeenCalled();
    pursued.hunt.falconry.phase = 'returning'; pursued.internal.tickBirds(1000 / 30);
    expect(pursued.slot.status).toBe('departing'); expect(pursued.resolveBird).toHaveBeenCalledTimes(1);
    pursued.system.dispose(pursued.ctx);
  });

  it('credits a bird bound for cover with the cover it will set down in, then lets it land there', () => {
    const f = fixture('ringneck');
    f.slot.line = { ...f.slot.line, target: { x: 140, z: 6 } };
    f.internal.tickBirds(1000 / 30);
    expect(f.slot.status).toBe('departing');
    expect(f.resolveBird).toHaveBeenCalledExactlyOnceWith(1, 'escaped', { x: 140, z: 6 });
    for (let tick = 0; tick < 30 * 15 && f.slot.status === 'departing'; tick++) f.internal.tickBirds(1000 / 30);
    expect(f.slot.status).toBe('done');
    expect(Math.hypot(f.slot.x - 140, f.slot.z - 6)).toBeLessThan(1);
    expect(f.resolveBird).toHaveBeenCalledTimes(1);
    f.system.dispose(f.ctx);
  });

  it('keeps genuine landing authority inside the shot', () => {
    const landed = fixture(); landed.slot.x = 40; landed.slot.y = .1;
    landed.internal.tickBirds(1000 / 30);
    expect(landed.slot.status).toBe('done');
    expect(landed.resolveBird).toHaveBeenCalledExactlyOnceWith(1, 'escaped', { x: landed.slot.x, z: landed.slot.z });
    landed.system.dispose(landed.ctx);
  });

  it('ends a leaving bird when it drives off the screen: out of view, behind the land, or too small to see', () => {
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, .05, 1600);
    camera.position.set(0, 1.62, 0); camera.lookAt(100, 1.62, 0); camera.updateMatrixWorld();
    const watched = () => { const f = fixture(); f.internal.listener = camera; f.internal.tickBirds(1000 / 30); return f; };
    const inView = watched();
    for (let i = 0; i < 10; i++) inView.internal.tickBirds(1000 / 30);
    expect(inView.slot.status).toBe('departing');
    const turned = watched(); camera.lookAt(-100, 1.62, 0); camera.updateMatrixWorld();
    turned.internal.tickBirds(1000 / 30);
    expect(turned.slot.status).toBe('done');
    camera.lookAt(100, 1.62, 0); camera.updateMatrixWorld();
    const hidden = watched(); hidden.internal.terrain.heightAt = (x: number) => x > 40 && x < 60 ? 30 : 0;
    hidden.internal.tickBirds(1000 / 30);
    expect(hidden.slot.status).toBe('done');
    // On a small screen a sharptail past 300 m is under a pixel and a half.
    const far = watched(); (far.internal as unknown as { viewHeight: () => number }).viewHeight = () => 300;
    far.slot.x = 310; far.internal.tickBirds(1000 / 30);
    expect(far.slot.status).toBe('done');
    // A bird bound for cover the hunter can see glides down into it however
    // small it has become: the miss is marked, not lost.
    const bound = watched(); (bound.internal as unknown as { viewHeight: () => number }).viewHeight = () => 300;
    bound.slot.x = 270; bound.slot.line = { ...bound.slot.line, target: { x: 290, z: 0 } };
    bound.internal.tickBirds(1000 / 30);
    expect(bound.slot.status).toBe('departing');
    for (let tick = 0; tick < 30 * 10 && bound.slot.status === 'departing'; tick++) bound.internal.tickBirds(1000 / 30);
    expect(bound.slot.status).toBe('done');
    expect(Math.hypot(bound.slot.x - 290, bound.slot.z)).toBeLessThan(1);
    for (const f of [inView, turned, hidden, far, bound]) f.system.dispose(f.ctx);
  });

  it('bounds an unwatched leaving bird by distance and time', () => {
    const distance = fixture(); distance.internal.tickBirds(1000 / 30); distance.slot.x = 330;
    distance.internal.tickBirds(1000 / 30);
    expect(distance.slot.status).toBe('done'); expect(distance.resolveBird).toHaveBeenCalledTimes(1);
    distance.system.dispose(distance.ctx);
    const time = fixture(); time.internal.tickBirds(1000 / 30);
    time.slot.line = { ...time.slot.line, speed: .5, curl: 0 };
    for (let i = 0; i < 30 * 24; i++) time.internal.tickBirds(1000 / 30);
    expect(time.slot.status).toBe('departing');
    for (let i = 0; i < 40; i++) time.internal.tickBirds(1000 / 30);
    expect(time.slot.status).toBe('done');
    time.system.dispose(time.ctx);
  });

  it('reclaims a leaving bird\'s slot before delaying a real incoming bird, within the same pool', () => {
    const f = fixture(); f.internal.tickBirds(1000 / 30);
    for (const slot of f.internal.slots.slice(1)) { slot.status = 'grounded'; slot.simId = 100; }
    f.birds.push({ id: 100, speciesId: 'sharptail', coveyId: 9, state: 'downed', pos: { x: 0, y: 0 } });
    f.birds.push({ id: 2, speciesId: 'sharptail', coveyId: 2, state: 'flushed', pos: { x: 15, y: 25 } });
    f.internal.tickBirds(1000 / 30);
    expect(f.internal.slots).toHaveLength(14);
    expect(f.slot.simId).toBe(2); expect(['flying', 'waiting']).toContain(f.slot.status);
    expect(f.slot.departureMs ?? 0).toBe(0);
    expect(f.resolveBird).toHaveBeenCalledTimes(1);
    f.system.dispose(f.ctx);
  });
});
