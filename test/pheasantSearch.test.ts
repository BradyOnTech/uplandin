import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { getBreed } from '../src/game/breeds';
import { Dog } from '../src/game/dog';
import { LandscapeModel } from '../src/game/landscape';
import { mulberry32 } from '../src/game/math';
import { HuntSimulation } from '../src/game/huntSimulation';
import { createHunt } from '../src/game/state';
import type { Ctx } from '../src/three/engine';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';
import { PheasantScenerySystem } from '../src/three/subsystems/pheasantScenery';
import { LandmarksSystem } from '../src/three/subsystems/landmarks';

vi.mock('../src/audio', () => ({ playWhistle: vi.fn() }));

function entry() {
  vi.stubGlobal('location', { search: '?area=pheasant-coverts&drop=west-track&seed=1184004868&challenge=relaxed&gun=over-under&dog=generated' });
  const area = getArea('pheasant-coverts'), landscape = new LandscapeModel(area, 'west-track');
  const camera = new THREE.PerspectiveCamera(); camera.rotation.order = 'YXZ'; camera.position.set(0, 2, 40);
  const hunt = new Hunt3DSystem(landscape); let recall = false;
  const player = { setHuntHeading: (_ctx: Ctx, heading: number) => { camera.rotation.y = -heading - Math.PI / 2; },
    consumeRecall: () => { const intent = recall; recall = false; return intent; }, isRunning: () => false };
  const systems = new Map<string, unknown>([['hunt3d', hunt], ['player', player], ['terrain', { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z) }]]);
  const ctx = { scene: new THREE.Scene(), camera, events: new EventTarget(), quality: 'high', timeOfDay: 'evening', time: 0,
    rng: () => .5, paused: false, get: (id: string) => { if (!systems.has(id)) throw Error(id); return systems.get(id); } } as Ctx;
  hunt.init(ctx);
  const flora = new PheasantScenerySystem(landscape); flora.init(ctx); systems.set('flora', flora);
  const landmarks = new LandmarksSystem(); landmarks.init(ctx); systems.set('landmarks', landmarks);
  let dogDistance = 0;
  const tick = (walk = false) => {
    if (walk) { camera.position.x -= Math.sin(camera.rotation.y) * 2.2 / 30; camera.position.z -= Math.cos(camera.rotation.y) * 2.2 / 30; }
    const before = { ...hunt.dog().pos }; ctx.time += 1 / 30; hunt.fixedUpdate(ctx, 1000 / 30);
    dogDistance += Math.hypot(hunt.dog().pos.x - before.x, hunt.dog().pos.y - before.y) * .9144;
  };
  return { hunt, tick, whistle: () => { recall = true; }, distance: () => dogDistance,
    dispose: () => { flora.dispose(ctx); landmarks.dispose(ctx); } };
}

describe('continuous pheasant searched ground', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('finishes a real near-entry check instead of running a kilometre around the stationary handler', () => {
    const f = entry();
    for (let i = 0; i < 9000; i++) f.tick(i < 137);
    expect(f.distance()).toBeLessThan(700);
    expect(f.hunt.dog().state).toBe('heel');
    expect(f.hunt.huntState().birds.every(b => b.state === 'hidden')).toBe(true);
    f.dispose();
  });

  it('resumes checking fresh reachable ground when the handler advances after a completed check', () => {
    const f = entry();
    for (let i = 0; i < 4500; i++) f.tick(i < 137);
    expect(f.hunt.dog().state).toBe('heel');
    const start = { ...f.hunt.dog().pos };
    for (let i = 0; i < 410; i++) f.tick(true);
    expect(f.hunt.dog().state).toBe('quartering');
    expect(Math.hypot(f.hunt.dog().pos.x - start.x, f.hunt.dog().pos.y - start.y) * .9144).toBeGreaterThan(18);
    f.dispose();
  });

  it('keeps a deliberate whistle recall at heel even when the handler walks onward', () => {
    const f = entry();
    for (let i = 0; i < 300; i++) f.tick(true);
    f.whistle();
    for (let i = 0; i < 900; i++) f.tick();
    expect(f.hunt.dog().state).toBe('heel');
    for (let i = 0; i < 600; i++) f.tick(true);
    expect(f.hunt.dog().state).toBe('heel');
    f.dispose();
  });

  it('works the reachable part of a large patch whose center lies beyond its live range', () => {
    const area = { ...getArea('pheasant-coverts'), patches: [{ x: 118, y: 80, w: 150, h: 40 }], trails: [] };
    const hunt = createHunt(area, mulberry32(12)); hunt.birds = []; hunt.hunterPos = { x: 100, y: 100 };
    const dog = new Dog({ x: 100, y: 100 }, { breed: getBreed('english-setter'), level: 8 }, mulberry32(31), area.world);
    const sim = new HuntSimulation({ area, hunt, dogs: [dog], continuousEncounter: true, rng: mulberry32(20) });
    let inside = 0;
    for (let i = 0; i < 1200; i++) {
      sim.update(1000 / 30, { hunterPos: { x: 100, y: 100 }, dogMotion: [{ rangeRadius: 24, workAnchor: { x: 100, y: 100 }, movementScale: dog.gait === 'run' ? .05 : .025 }] });
      if (i === 0) expect(dog.gait).toBe('trot'); // a purposeful cover cast, not the open-ground orbit
      if (dog.pos.x >= 118 && dog.pos.y >= 80 && dog.pos.y <= 120) inside++;
    }
    expect(inside).toBeGreaterThan(60);
  });

  it.each(['quail-fields', 'chukar-ridge'])('preserves the existing search behavior on %s', areaId => {
    const dog = new Dog({ x: 200, y: 200 }, { breed: getBreed('english-setter'), level: 8 }, mulberry32(44), { x: 0, y: 0, w: 500, h: 500 });
    for (let i = 0; i < 9000; i++) dog.update(1000 / 30, [], { huntAreaId: areaId, hunterPos: { x: 200, y: 200 },
      workAnchor: { x: 200, y: 200 }, rangeRadius: 24, movementScale: .05, patches: [] });
    expect(dog.state).toBe('quartering');
    expect(dog.searchAreaChecked).toBe(false);
  });
});
