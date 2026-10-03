import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BirdsSystem, CLOSE_FAN_WIDEN } from '../src/three/subsystems/birds';
import { mulberry32 } from '../src/game/math';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), prepareGunSounds: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn(), playThud: vi.fn(), playFlush: vi.fn(),
  playPheasantFlush: vi.fn(), playBirdFlush: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

/** Launch one rooster `distance` metres from the hunter and fly it for `ms`. */
function rooster(distance: number, ms: number) {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  const birds = new BirdsSystem();
  const internal = birds as unknown as Record<string, any>;
  const sim = { id: 1, state: 'flushed', speciesId: 'ringneck', pos: { x: 0, y: -distance }, coveyId: 1, sex: 'rooster' as const };
  const hunt = { areaConfig: () => ({ id: 'pheasant-coverts' }), huntState: () => ({ gunId: 'over-under', birds: [sim] }),
    resolveBird: vi.fn(() => true), recordFallWorld: vi.fn(), getActiveChallenge: () => 'balanced', riseSlopeApproach: () => null,
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
    coverPatches: () => [], condition: () => 'mild', lastFlushInfo: () => null };
  const events = new EventTarget(), flinches: number[] = [];
  events.addEventListener('close-flush', ((event: CustomEvent) => { flinches.push(event.detail.intensity); }) as unknown as EventListener);
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), fixedAlpha: 1, renderer: { domElement: new EventTarget() },
    events, quality: 'lite', timeOfDay: 'morning', time: 1, paused: false,
    get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]) } as unknown as Ctx;
  Object.assign(internal, { mat: new THREE.MeshLambertMaterial({ vertexColors: true }), hunt, terrain: { heightAt: () => 0 },
    frozen: false, spatialEncounter: true, coverEvents: events, escX: 0, escZ: -1, rightX: 1, rightZ: 0, hunterX: 0, hunterZ: 0 });
  internal.buildPool(ctx);
  internal.staged.add(1); internal.riseActive = true; internal.queue[internal.qTail++] = 1; internal.launchWave([sim]);
  const slot = internal.slots.find((candidate: { simId: number }) => candidate.simId === 1);
  const start = { x: slot.x, z: slot.z };
  for (let t = 0; t < ms; t += 1000 / 30) internal.tickBirds(1000 / 30);
  return { height: slot.y - .2, travel: Math.hypot(slot.x - start.x, slot.z - start.z), flinches };
}

describe('a rooster flushed underfoot', () => {
  it('towers almost straight up out of the cover before driving away', () => {
    const close = rooster(3, 400), far = rooster(16, 400);
    expect(close.height).toBeGreaterThan(2.5);
    expect(close.height).toBeGreaterThan(far.height * 1.35);
    expect(close.travel).toBeLessThan(1.5);
    expect(close.travel).toBeLessThan(far.travel);
    // Then it tops out and carries off: well out of point-blank range at two seconds.
    const later = rooster(3, 2000);
    expect(later.height).toBeLessThan(8);
    expect(later.travel).toBeGreaterThan(14);
  });

  it('makes the hunter flinch only when the bird goes up at his feet', () => {
    expect(rooster(3, 50).flinches).toEqual([1]);
    expect(rooster(16, 50).flinches).toEqual([]);
  });
});

/** Launch a covey of eight `distance` metres out (the hunter at the origin,
 * escaping toward -z) on the same random stream, and read each bird's break. */
function covey(speciesId: string, areaId: string, distance: number) {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  const birds = new BirdsSystem();
  const internal = birds as unknown as Record<string, any>;
  const sims = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, state: 'flushed', speciesId, coveyId: 1,
    pos: { x: (i % 4 - 1.5) * .8, y: -distance - Math.floor(i / 4) * .8 } }));
  const hunt = { areaConfig: () => ({ id: areaId }), huntState: () => ({ gunId: 'over-under', birds: sims }),
    resolveBird: vi.fn(() => true), recordFallWorld: vi.fn(), getActiveChallenge: () => 'balanced', riseSlopeApproach: () => null,
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
    coverPatches: () => [], condition: () => 'mild', lastFlushInfo: () => null };
  const events = new EventTarget();
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), fixedAlpha: 1, renderer: { domElement: new EventTarget() },
    events, quality: 'lite', timeOfDay: 'morning', time: 1, paused: false,
    get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]) } as unknown as Ctx;
  Object.assign(internal, { mat: new THREE.MeshLambertMaterial({ vertexColors: true }), hunt, terrain: { heightAt: () => 0 },
    frozen: false, spatialEncounter: true, coverEvents: events, escX: 0, escZ: -1, rightX: 1, rightZ: 0, hunterX: 0, hunterZ: 0,
    riseRng: mulberry32(7) });
  internal.buildPool(ctx);
  internal.riseActive = true;
  for (const sim of sims) { internal.staged.add(sim.id); internal.queue[internal.qTail++] = sim.id; }
  internal.launchWave(sims);
  return sims.map(sim => internal.slots.find((slot: { simId: number }) => slot.simId === sim.id));
}

describe('a covey sat on underfoot', () => {
  it('bursts wide across the hunter\'s front instead of lining out down one bearing', () => {
    // Bobwhite fly the world-space controller: compare each bird's bearing off the escape line.
    const away = Math.atan2(-1, 0), off = (slot: { spatialFlight: { bearing: number } }) =>
      Math.abs(Math.atan2(Math.sin(slot.spatialFlight.bearing - away), Math.cos(slot.spatialFlight.bearing - away)));
    const close = covey('bobwhite', 'quail-fields', 2.5).map(off), far = covey('bobwhite', 'quail-fields', 16).map(off);
    const widest = (values: number[]) => Math.max(...values);
    expect(widest(close)).toBeCloseTo(widest(far) * (1 + CLOSE_FAN_WIDEN), 6);
    // Still a burst away from the gun: no bird turns back past square.
    expect(widest(close)).toBeLessThan(Math.PI / 2);
    expect(widest(far)).toBeLessThan(.42);
    // Chukar keep their authored break; its lateral impulse opens the same way.
    const lateral = (slots: { vel: { x: number } }[]) => Math.max(...slots.map(slot => Math.abs(slot.vel.x)));
    expect(lateral(covey('chukar', 'chukar-ridge', 2.5))).toBeCloseTo(lateral(covey('chukar', 'chukar-ridge', 16)) * (1 + CLOSE_FAN_WIDEN), 6);
  });
});

describe('a covey rise', () => {
  it('starts with the bird nearest the hunter\'s boots, whatever the covey\'s order', () => {
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
    const birds = new BirdsSystem();
    const internal = birds as unknown as Record<string, any>;
    // Lower ids sit farther out: the nearest bird is the last in the covey's own order.
    const sims = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, state: 'flushed', speciesId: 'bobwhite', coveyId: 3,
      runs: false, pos: { x: (i % 2 - .5) * 1.5, y: -(9 - i * 1.2) } }));
    const hunt = { areaConfig: () => ({ id: 'quail-fields' }), huntState: () => ({ gunId: 'over-under', birds: sims, hunterPos: { x: 0, y: 0 }, wind: 0 }),
      resolveBird: vi.fn(() => true), recordFallWorld: vi.fn(), riseSlopeApproach: () => null,
      simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
      coverPatches: () => [], condition: () => 'mild', lastFlushInfo: () => null };
    const events = new EventTarget();
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), fixedAlpha: 1, renderer: { domElement: new EventTarget() },
      events, quality: 'lite', timeOfDay: 'morning', time: 1, paused: false,
      get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]) } as unknown as Ctx;
    Object.assign(internal, { mat: new THREE.MeshLambertMaterial({ vertexColors: true }), hunt, terrain: { heightAt: () => 0 },
      frozen: false, spatialEncounter: true, refinedQuail: true, coverEvents: events });
    internal.buildPool(ctx);
    internal.tickBirds(1000 / 30);
    const up = internal.slots.filter((slot: { status: string }) => slot.status === 'flying');
    expect(up.map((slot: { simId: number }) => slot.simId)).toEqual([6]);
    // The rest follow it out within a quarter of a second.
    for (let t = 0; t < 250; t += 1000 / 30) internal.tickBirds(1000 / 30);
    expect(internal.slots.filter((slot: { status: string }) => slot.status === 'flying').length).toBeGreaterThanOrEqual(5);
  });
});
