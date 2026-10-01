import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BirdsSystem } from '../src/three/subsystems/birds';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn(), playThud: vi.fn(), playFlush: vi.fn(),
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
