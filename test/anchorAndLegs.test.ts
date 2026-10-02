import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSpecies } from '../src/game/species';
import { getArea } from '../src/game/areas';
import type { Bird } from '../src/game/birds';
import { getBreed } from '../src/game/breeds';
import { Dog } from '../src/game/dog';
import { HuntSimulation } from '../src/game/huntSimulation';
import { mulberry32 } from '../src/game/math';
import { createHunt } from '../src/game/state';
import { BIRD_LEGS, buildBirdLegs } from '../src/three/assets/birdLegs';
import { anchorCall } from '../src/three/shotFx';
import { TravellingShot } from '../src/three/shotPattern';
import { BirdsSystem } from '../src/three/subsystems/birds';
import { GunSystem } from '../src/three/subsystems/gun';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), prepareGunSounds: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn(), playThud: vi.fn() }));
type Point = { x: number; y: number; z: number };
type FlightSlot = Point & { simId: number; status: string; previousX?: number; previousY?: number; previousZ?: number;
  vxW: number; vyW: number; vzW: number; airMs: number; previousAirMs: number; root: THREE.Group; running?: boolean;
  legMesh?: THREE.Mesh; gliding: boolean; reaction?: { kind: string; collapsed: boolean } };

function field(speciesId = 'chukar') {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  const birds = new BirdsSystem();
  const internal = birds as unknown as {
    mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean; spatialEncounter: boolean;
    slots: FlightSlot[]; buildPool(ctx: Ctx): void; applySpeciesAppearance(slot: FlightSlot, species: ReturnType<typeof getSpecies>): void;
  };
  const simBird = { id: 1, state: 'downed' };
  const hunt = { areaConfig: () => ({ id: 'chukar-ridge' }), huntState: () => ({ gunId: 'over-under', birds: [simBird], wind: 0 }),
    resolveBird: vi.fn(() => true), recordFallWorld: vi.fn(), anchorBird: vi.fn(() => true), getActiveChallenge: () => 'wild',
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
    coverPatches: () => [] };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); camera.position.y = 2; camera.updateMatrixWorld();
  const ctx = { scene, camera, fixedAlpha: 1, renderer: { domElement: new EventTarget() }, events: new EventTarget(),
    quality: 'lite', timeOfDay: 'morning', time: 1, paused: false,
    get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]) } as unknown as Ctx;
  internal.mat = new THREE.MeshLambertMaterial({ vertexColors: true }); internal.hunt = hunt;
  internal.terrain = { heightAt: () => 0 }; internal.frozen = false; internal.spatialEncounter = true;
  internal.buildPool(ctx); const slot = internal.slots[0]; internal.applySpeciesAppearance(slot, getSpecies(speciesId));
  Object.assign(slot, { simId: 1, status: 'flying', x: 0, y: 8, z: -14, previousX: 0, previousY: 8, previousZ: -14,
    vxW: 14, vyW: 0, vzW: 0, airMs: 900, previousAirMs: 900 - 1000 / 30 });
  return { birds, internal, slot, ctx, hunt };
}
afterEach(() => vi.unstubAllGlobals());

describe('anchoring a hit bird with the second barrel', () => {
  it('lets the pattern take a bird still coming down under its own power, never a dead one', () => {
    const bird = (anchorable: boolean) => ({ simId: 3, status: 'falling', anchorable, x: 0, y: 2, z: -20 });
    for (const anchorable of [true, false]) {
      const shot = new TravellingShot({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: -1 }, .04, [bird(anchorable)]);
      let hit: number | null = null;
      for (let tick = 0; tick < 12 && !shot.done; tick++) hit = shot.advance(1 / 30, [bird(anchorable)], () => true) ?? hit;
      expect(hit).toBe(anchorable ? 3 : null);
    }
  });

  it.each(['tower', 'sail', 'spiral'] as const)('marks a %s bird anchorable until a second shot folds it', kind => {
    const f = field();
    f.birds.downBird(1, undefined, undefined, kind);
    expect(f.birds.isAnchorable(1)).toBe(true);
    expect(f.birds.shotTargets(1)[0].anchorable).toBe(true);
    expect(f.birds.anchorBird(1, { offset: .2, wounded: false, rangeM: 25 })).toBe(true);
    expect(f.slot.reaction?.collapsed).toBe(true);
    expect(f.slot.gliding).toBe(false);
    expect(f.birds.isAnchorable(1)).toBe(false);
    expect(f.birds.anchorBird(1)).toBe(false);
    // Folded, it drops on its own momentum.
    const y = f.slot.y;
    f.birds.fixedUpdate(f.ctx, 1000 / 30); f.birds.fixedUpdate(f.ctx, 1000 / 30);
    expect(f.slot.y).toBeLessThan(y);
    f.birds.dispose(f.ctx);
  });

  it('never offers a folded, dead bird to the pattern', () => {
    const f = field(); f.birds.downBird(1, undefined, undefined, 'fold');
    expect(f.birds.isAnchorable(1)).toBe(false);
    expect(f.birds.shotTargets(1)[0].anchorable).toBe(false);
    f.birds.dispose(f.ctx);
  });

  it('anchors through the gun without counting the bird twice', () => {
    const f = field(); f.birds.downBird(1, undefined, undefined, 'sail');
    f.slot.airMs = 1200; f.slot.previousAirMs = 1200 - 1000 / 30;
    const gun = new GunSystem(); gun.init(f.ctx);
    // Aim straight at the gliding bird, leading it by the pattern's flight time.
    const lead = f.slot.vxW * Math.hypot(f.slot.z, f.slot.y - 2) / 300;
    f.ctx.camera.lookAt(f.slot.x + lead, f.slot.y, f.slot.z); f.ctx.camera.updateMatrixWorld();
    (gun as unknown as { mountT: number }).mountT = 1;
    f.ctx.events.dispatchEvent(Object.assign(new Event('hunt-action'), { detail: 'mount' }));
    window.dispatchEvent(Object.assign(new Event('keydown'), { code: 'Space', key: ' ', repeat: false }));
    for (let tick = 0; tick < 4; tick++) { f.birds.fixedUpdate(f.ctx, 1000 / 30); gun.fixedUpdate(f.ctx, 1000 / 30); }
    expect(f.hunt.resolveBird).not.toHaveBeenCalled();
    expect(f.hunt.anchorBird).toHaveBeenCalledWith(1);
    expect(f.slot.reaction?.collapsed).toBe(true);
    gun.dispose(f.ctx); f.birds.dispose(f.ctx);
  });

  it('kills a wing-tipped bird outright: it will not run when it lands', () => {
    const area = getArea('chukar-ridge'), hunt = createHunt(area, mulberry32(11), { wind: 'calm', condition: 'mild' });
    const at = (id: number): Bird => ({ id, coveyId: 1, speciesId: 'chukar', pos: { x: 120 + id * 30, y: 120 }, state: 'flushed',
      runs: false, runEnergy: 2500, restingMs: 0, nerveMs: 60000 });
    hunt.birds = [at(1), at(2)]; hunt.hunterPos = { x: 100, y: 100 };
    const dog = new Dog({ x: 60, y: 60 }, { breed: getBreed('english-setter'), level: 8 }, mulberry32(12), area.world);
    const sim = new HuntSimulation({ hunt, dogs: [dog], area, rng: mulberry32(13), continuousEncounter: true });
    for (const bird of hunt.birds) {
      expect(sim.resolveBird(bird.id, 'downed', undefined, { wounded: true })).toBe(true);
      expect(bird.wounded).toBe(true);
    }
    // Only while it is still coming down: not before the fall is under way.
    expect(sim.anchorBird(1)).toBe(false);
    for (const bird of hunt.birds) bird.fallPending = true;
    expect(sim.anchorBird(1)).toBe(true);
    expect(hunt.birds[0]).toMatchObject({ wounded: false, woundRunMs: 0 });
    expect(hunt.downed).toBe(2);
    // Both land; only the bird that was not anchored runs.
    for (const bird of hunt.birds) sim.recordFall(bird.id, { ...bird.pos });
    const steps = sim as unknown as { stepCripples(dtMs: number, hunter: { x: number; y: number }): void };
    for (let tick = 0; tick < 30; tick++) steps.stepCripples(1000 / 30, hunt.hunterPos);
    expect(hunt.birds[0].pos).toEqual({ x: 150, y: 120 });
    expect(hunt.birds[1].pos.x).toBeGreaterThan(181);
    // A bird already down on the ground is past anchoring.
    expect(sim.anchorBird(2)).toBe(false);
    expect(anchorCall(true).text).toContain('WON\'T RUN');
    expect(anchorCall(false)).toEqual({ text: 'ANCHORED', tone: 'hit' });
  });
});

describe('legs on every gamebird', () => {
  it.each(Object.keys(BIRD_LEGS))('builds sound %s legs that hang from the hips', speciesId => {
    const legs = buildBirdLegs(speciesId), p = legs.getAttribute('position'), n = legs.getAttribute('normal'), c = legs.getAttribute('color');
    expect(p.count % 3).toBe(0); expect(n.count).toBe(p.count); expect(c.count).toBe(p.count);
    expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
    expect(Array.from(c.array).every(value => value >= 0 && value <= 1)).toBe(true);
    const box = legs.boundingBox!, spec = BIRD_LEGS[speciesId];
    // Hung from the hips, standing on the toes, splayed either side of the keel.
    expect(box.max.y).toBeCloseTo(0, 3); expect(box.min.y).toBeCloseTo(-spec.length, 2);
    expect(box.max.x).toBeCloseTo(-box.min.x, 6);
    expect(box.max.x).toBeGreaterThan(spec.spread + spec.toe * .4);
    expect(box.max.x).toBeLessThan(spec.spread + spec.toe * .5 + spec.thickness * 1.6);
    expect(box.max.z).toBeGreaterThan(spec.toe * .85); expect(box.min.z).toBeLessThan(-spec.toe * .3);
    legs.dispose();
  });

  it('shows a chukar\'s legs on the jump, dropped on a body hit, in a fall and under a running cripple, and nowhere else', () => {
    const f = field(), legs = () => f.slot.legMesh!;
    const show = () => { f.birds.update(f.ctx, 0); return legs().visible ? +legs().rotation.x.toFixed(2) : null; };
    f.slot.airMs = 200; f.slot.previousAirMs = 200;
    expect(show()).not.toBeNull();
    f.slot.airMs = 900; f.slot.previousAirMs = 900;
    expect(show()).toBeNull();
    f.birds.downBird(1, undefined, undefined, 'sail');
    expect(show()).toBe(.12);
    f.birds.anchorBird(1);
    expect(show()).toBe(.5);
    Object.assign(f.slot, { status: 'grounded', running: true, y: 0 });
    expect(show()).toBe(0);
    f.slot.running = false;
    expect(show()).toBeNull();
    f.birds.dispose(f.ctx);
  });
});
