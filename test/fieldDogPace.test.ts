import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Bird } from '../src/game/birds';
import { Dog } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import { DogObstacleMotion } from '../src/game/dogObstacles';
import { getArea } from '../src/game/areas';
import { defaultQuickConfig, QUICK_KEY } from '../src/game/quick';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';

const DT = 1000 / 30;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function fixture(areaId: string, breedId: string) {
  const quick = { ...defaultQuickConfig(), areaId, breedId, level: 5, weather: 'mild' };
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === QUICK_KEY ? JSON.stringify(quick) : null });
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { search: '?play=quick&seed=1184004868&challenge=relaxed' });
  const area = getArea(areaId), landscape = new LandscapeModel(area, 'south-gate');
  const hunt = new Hunt3DSystem(landscape), camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.62, 40); camera.rotation.y = Math.PI;
  let recall = false, running = false;
  const player = {
    consumeRecall: () => { const value = recall; recall = false; return value; },
    isRunning: () => running,
    setHuntHeading: (_ctx: Ctx, heading: number) => { camera.rotation.y = -heading - Math.PI / 2; },
  };
  const ctx = { camera, get: (id: string) => id === 'player' ? player : { isRiseActive: () => false } } as unknown as Ctx;
  hunt.init(ctx); hunt.fixedUpdate(ctx, DT);
  // This is a movement/effort fixture, not an encounter success test.
  // Removing birds avoids hidden outcomes selecting the duration of work.
  const birdTemplate = { ...hunt.huntState().birds[0] };
  hunt.huntState().birds = [];
  const tick = (speed = 0) => {
    running = speed > 3;
    camera.position.x -= Math.sin(camera.rotation.y) * speed / 30;
    camera.position.z -= Math.cos(camera.rotation.y) * speed / 30;
    hunt.fixedUpdate(ctx, DT);
  };
  const gap = () => {
    const p = hunt.dogWorld({ x: 0, z: 0 });
    return Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
  };
  const start = hunt.worldToSim(camera.position.x, camera.position.z, { x: 0, y: 0 });
  const distance = (p: { x: number; y: number }) => Math.hypot(p.x - start.x, p.y - start.y);
  const trail = area.trails.reduce((best, item) => distance(item.points[0]) < distance(best.points[0]) ? item : best).points;
  let leg = 1;
  const walkTrail = () => {
    const target = hunt.simToWorld(trail[leg].x, trail[leg].y, { x: 0, z: 0 });
    if (Math.hypot(target.x - camera.position.x, target.z - camera.position.z) < 1) leg = (leg + 1) % trail.length;
    camera.rotation.y = Math.atan2(-(target.x - camera.position.x), -(target.z - camera.position.z));
    tick(2.2);
  };
  return { hunt, tick, gap, walkTrail, birdTemplate, whistle: () => { recall = true; } };
}

const cases = ['quail-fields', 'sharptail-prairie', 'chukar-ridge']
  .flatMap(area => ['gsp', 'english-setter'].map(breed => [area, breed] as const));

describe('actual field dog travel and effort', () => {
  it('preserves legacy follow movement and a zero-time capture without field ranges', () => {
    const dog = new Dog({ x: 100, y: 100 }, { breed: getBreed('gsp'), level: 5 });
    dog.state = 'heel';
    const env = { hunterPos: { x: 300, y: 100 } };
    dog.update(0, [], env);
    expect(dog.pos).toEqual({ x: 100, y: 100 });
    dog.update(100, [], env);
    expect(dog.pos.x).toBeCloseTo(109.2);
    expect(dog.pos.y).toBe(100);
  });

  it.each(cases)('keeps a working %s %s energetic through a five-minute public-trail walk', (area, breed) => {
    const f = fixture(area, breed), dog = f.hunt.dog();
    let earlyTravel = 0, lateTravel = 0, earlyFrames = 0, lateFrames = 0;
    let prior = { ...dog.pos };
    for (let frame = 0; frame < 300 * 30; frame++) {
      f.walkTrail();
      const distance = Math.hypot(dog.pos.x - prior.x, dog.pos.y - prior.y) * PROPERTY_PX_TO_M;
      if (dog.state === 'quartering' && distance > .001) {
        if (frame > 10 * 30 && frame < 60 * 30) { earlyTravel += distance; earlyFrames++; }
        if (frame > 240 * 30) { lateTravel += distance; lateFrames++; }
      }
      prior = { ...dog.pos };
    }
    expect(earlyFrames).toBeGreaterThan(1000);
    expect(lateFrames).toBeGreaterThan(1000);
    expect(dog.winded).toBe(false);
    expect(dog.staminaMs / dog.maxStaminaMs).toBeGreaterThan(.8);
    // Keep the breed's normal cast variations; reject the old sudden40% loss.
    expect(lateTravel / lateFrames).toBeGreaterThan(earlyTravel / earlyFrames * .8);
  });

  it.each(cases)('lets a heeled %s %s follow a walking/running handler and settle without overshoot', (area, breed) => {
    for (const speed of [2.2, 4.18]) {
      const f = fixture(area, breed);
      for (let frame = 0; frame < 60; frame++) f.tick(2.2);
      f.whistle(); for (let frame = 0; frame < 180; frame++) f.tick();
      expect(f.hunt.dog().state).toBe('heel');
      for (let frame = 0; frame < 20 * 30; frame++) f.tick(speed);
      // The old2.10m/s follow fell42m behind a running handler here.
      expect(f.gap()).toBeLessThan(4);
      for (let frame = 0; frame < 60; frame++) f.tick();
      expect(f.gap()).toBeLessThanOrEqual(2);
      expect(f.gap()).toBeGreaterThan(1.4);
      expect(f.hunt.dog().state).toBe('heel');
      expect(f.hunt.dog().gait).toBe('still');
    }
  });

  it.each(['gsp', 'english-setter'])('retains purposeful %s pickup and carried return after five minutes of work', breed => {
    const f = fixture('chukar-ridge', breed), dog = f.hunt.dog();
    for (let frame = 0; frame < 300 * 30; frame++) f.walkTrail();
    const bird: Bird = { ...f.birdTemplate, state: 'downed', fallPending: false,
      pos: { x: dog.pos.x + 20 / PROPERTY_PX_TO_M, y: dog.pos.y } };
    f.hunt.huntState().birds.push(bird);
    const outbound: number[] = [], carried: number[] = [];
    let previous = { ...dog.pos };
    for (let frame = 0; frame < 30 * 30 && bird.state !== 'retrieved'; frame++) {
      f.tick();
      const speed = Math.hypot(dog.pos.x - previous.x, dog.pos.y - previous.y) * PROPERTY_PX_TO_M * 30;
      if (speed > .1) (dog.carryingBirdId === null ? outbound : carried).push(speed);
      previous = { ...dog.pos };
    }
    expect(bird.state).toBe('retrieved');
    for (const samples of [outbound, carried]) {
      expect(samples.length).toBeGreaterThan(30);
      samples.sort((a, b) => a - b);
      // The healthy field return keeps its established4.3–5m/s breed pace,
      // rather than inheriting the old2.6–3m/s exhausted carry after minutes.
      expect(samples[Math.floor(samples.length / 2)]).toBeGreaterThan(4.18);
    }
  });

  it.each(cases)('turns a %s %s through cast/rim/comb without snapping its travel heading', (area, breed) => {
    const f = fixture(area, breed), dog = f.hunt.dog();
    const move = DogObstacleMotion.prototype.move;
    let detoured = false, previousDetour = false;
    vi.spyOn(DogObstacleMotion.prototype, 'move').mockImplementation(function (this: DogObstacleMotion, ...args) {
      const direction = move.apply(this, args);
      detoured ||= Math.abs(Math.atan2(Math.sin(direction - args[1]), Math.cos(direction - args[1]))) > .001;
      return direction;
    });
    let prior = { ...dog.pos }, previousAngle = dog.heading, previousSpeed = 0, maximumTurn = 0;
    for (let frame = 0; frame < 225 * 30; frame++) {
      detoured = false;
      f.walkTrail();
      const dx = dog.pos.x - prior.x, dy = dog.pos.y - prior.y;
      const speed = Math.hypot(dx, dy) * PROPERTY_PX_TO_M * 30;
      const angle = Math.atan2(dy, dx);
      // Leave actual solid-obstacle detours to their separate collision
      // contract; this regression isolates ordinary cover-work steering.
      if (frame > 30 && speed > .1 && previousSpeed > .1 && !detoured && !previousDetour) {
        maximumTurn = Math.max(maximumTurn, Math.abs(Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle))));
      }
      previousAngle = angle; previousSpeed = speed; previousDetour = detoured; prior = { ...dog.pos };
    }
    // Objective resets reversed150+degrees in one33ms step. Rim-to-comb
    // could also add an instantaneous78-degree weave at full travel pace.
    expect(maximumTurn).toBeLessThan(Math.PI / 6);
  });
});
