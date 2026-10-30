import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BirdsSystem, CLOSE_FAN_WIDEN } from '../src/three/subsystems/birds';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), prepareGunSounds: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn(), playThud: vi.fn(), playFall: vi.fn(), playFlush: vi.fn(),
  playPheasantFlush: vi.fn(), playBirdFlush: vi.fn(), playCoveyThunder: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

/** Launch one rooster `distance` metres from the hunter and fly it for `ms`. */
function rooster(distance: number, ms: number) {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  const birds = new BirdsSystem();
  const internal = birds as unknown as Record<string, any>;
  const sim = { id: 1, state: 'flushed', speciesId: 'ringneck', pos: { x: 0, y: -distance }, coveyId: 1, sex: 'rooster' as const };
  const hunt = { areaConfig: () => ({ id: 'pheasant-coverts' }), huntState: () => ({ gunId: 'over-under', birds: [sim], hunterPos: { x: 0, y: 0 }, wind: -Math.PI / 2 }),
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
  internal.tickBirds(1000 / 30);
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
    // Then it tops out, hangs and carries off: well out of point-blank range at two seconds.
    const later = rooster(3, 2000);
    expect(later.height).toBeLessThan(9);
    expect(later.travel).toBeGreaterThan(9);
  });

  it('makes the hunter flinch only when the bird goes up at his feet', () => {
    expect(rooster(3, 50).flinches).toEqual([1]);
    expect(rooster(16, 50).flinches).toEqual([]);
  });
});

/** Flush a covey of eight `distance` metres out (the hunter at the origin,
 * the wind and the escape toward -z) on the same random stream, and read the
 * break of each bird in its first wave. */
function covey(speciesId: string, areaId: string, distance: number) {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  const birds = new BirdsSystem();
  const internal = birds as unknown as Record<string, any>;
  const sims = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, state: 'flushed', speciesId, coveyId: 1,
    pos: { x: (i % 4 - 1.5) * .8, y: -distance - Math.floor(i / 4) * .8 } }));
  const hunt = { areaConfig: () => ({ id: areaId }), huntState: () => ({ gunId: 'over-under', birds: sims, hunterPos: { x: 0, y: 0 }, wind: -Math.PI / 2 }),
    resolveBird: vi.fn(() => true), recordFallWorld: vi.fn(), getActiveChallenge: () => 'balanced', riseSlopeApproach: () => null,
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
    coverPatches: () => [], condition: () => 'mild', lastFlushInfo: () => null };
  const events = new EventTarget();
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), fixedAlpha: 1, renderer: { domElement: new EventTarget() },
    events, quality: 'lite', timeOfDay: 'morning', time: 1, paused: false,
    get: (id: string) => ({ hunt3d: hunt, birds, terrain: { heightAt: () => 0 } }[id]) } as unknown as Ctx;
  Object.assign(internal, { mat: new THREE.MeshLambertMaterial({ vertexColors: true }), hunt, terrain: { heightAt: () => 0 },
    frozen: false, spatialEncounter: true, coverEvents: events });
  internal.buildPool(ctx);
  internal.tickBirds(1000 / 30);
  const wave = internal.slots.filter((slot: { status: string }) => slot.status === 'waiting' || slot.status === 'flying');
  expect(wave).toHaveLength(3);
  return wave;
}

describe('a covey sat on underfoot', () => {
  it('bursts wide across the hunter\'s front instead of lining out down one bearing', () => {
    // Compare each bird's asked-for bearing (its lane) off its escape line,
    // before the launch constraints turn it across the gun.
    const off = (slot: { line: { aim: number }; flight: { escX: number; escZ: number } }) => {
      const away = Math.atan2(slot.flight.escZ, slot.flight.escX);
      return Math.abs(Math.atan2(Math.sin(slot.line.aim - away), Math.cos(slot.line.aim - away)));
    };
    const widest = (values: number[]) => Math.max(...values);
    for (const [species, area] of [['bobwhite', 'quail-fields'], ['chukar', 'chukar-ridge']]) {
      const close = covey(species, area, 2.5).map(off), far = covey(species, area, 16).map(off);
      // The lanes open by up to (1 + CLOSE_FAN_WIDEN); lanes are spaced by how
      // they cross the view, so the outside lanes close up short of square.
      expect(widest(close) / widest(far)).toBeGreaterThan(1.5);
      expect(widest(close) / widest(far)).toBeLessThan(1 + CLOSE_FAN_WIDEN);
      // Still a burst away from the gun: no bird turns back past square.
      expect(widest(close)).toBeLessThan(Math.PI / 2);
      // Wave-mates fly a lane either side of the line (game/riseScore.ts).
      expect(widest(far)).toBeLessThan(.7);
    }
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
    // Its wave-mates, the next nearest, follow it out within a quarter of a
    // second; the rest of the covey waits in the cover for the next wave.
    for (let t = 0; t < 250; t += 1000 / 30) internal.tickBirds(1000 / 30);
    const flying = internal.slots.filter((slot: { status: string }) => slot.status === 'flying');
    expect(flying.map((slot: { simId: number }) => slot.simId).sort()).toEqual([4, 5, 6]);
  });
});
