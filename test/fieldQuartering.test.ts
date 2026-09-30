import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { defaultQuickConfig, QUICK_KEY } from '../src/game/quick';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';

const DT = 1000 / 30;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function fixture(areaId: string, breedId: string, level: number, withBirds: boolean) {
  const quick = { ...defaultQuickConfig(), areaId, breedId, level, weather: 'mild' };
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === QUICK_KEY ? JSON.stringify(quick) : null });
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { search: '?play=quick&seed=1184004868&challenge=relaxed' });
  const area = getArea(areaId), landscape = new LandscapeModel(area, 'south-gate');
  const hunt = new Hunt3DSystem(landscape), camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.62, 40); camera.rotation.y = Math.PI;
  let running = false;
  const player = { consumeRecall: () => false, isRunning: () => running,
    setHuntHeading: (_ctx: Ctx, heading: number) => { camera.rotation.y = -heading - Math.PI / 2; } };
  const ctx = { camera, get: (id: string) => id === 'player' ? player : { isRiseActive: () => false } } as unknown as Ctx;
  hunt.init(ctx); hunt.fixedUpdate(ctx, DT);
  if (!withBirds) hunt.huntState().birds = [];
  const start = hunt.worldToSim(camera.position.x, camera.position.z, { x: 0, y: 0 });
  const distance = (p: { x: number; y: number }) => Math.hypot(p.x - start.x, p.y - start.y);
  const trail = area.trails.reduce((best, item) => distance(item.points[0]) < distance(best.points[0]) ? item : best).points;
  let leg = 1;
  const walk = (speed: number) => {
    const target = hunt.simToWorld(trail[leg].x, trail[leg].y, { x: 0, z: 0 });
    if (Math.hypot(target.x - camera.position.x, target.z - camera.position.z) < 1) leg = (leg + 1) % trail.length;
    camera.rotation.y = Math.atan2(-(target.x - camera.position.x), -(target.z - camera.position.z));
    running = speed > 3;
    camera.position.x -= Math.sin(camera.rotation.y) * speed / 30;
    camera.position.z -= Math.cos(camera.rotation.y) * speed / 30;
    hunt.fixedUpdate(ctx, DT);
  };
  return { hunt, camera, walk };
}

function measure(areaId: string, breedId: string, level = 7, seconds = 180, speed = 1.5) {
  const f = fixture(areaId, breedId, level, false);
  let ahead = 0, behind = 0, n = 0, crossings = 0, lastSide = 0, sumDist = 0, sumAbsLat = 0, sumFwd = 0;
  const dists: number[] = [], turn: number[] = [], speeds: number[] = [], accel: number[] = [];
  let prevH: number | null = null, prev = f.hunt.dogWorld({ x: 0, z: 0 }), prevSpeed = 0;
  let quarteringFrames = 0, reversalFrames = 0;
  for (let frame = 0; frame < seconds * 30; frame++) {
    f.walk(speed);
    if (frame < 150) { prev = f.hunt.dogWorld({ x: 0, z: 0 }); continue; }
    const p = f.hunt.dogWorld({ x: 0, z: 0 }), cam = f.camera;
    const fx = -Math.sin(cam.rotation.y), fz = -Math.cos(cam.rotation.y); // hunter forward
    const dx = p.x - cam.position.x, dz = p.z - cam.position.z;
    const fwd = dx * fx + dz * fz, lat = dx * fz - dz * fx;
    const d = Math.hypot(dx, dz);
    n++; sumDist += d; sumAbsLat += Math.abs(lat); sumFwd += fwd; dists.push(d);
    if (fwd > 2) ahead++; if (fwd < -5) behind++;
    const side = lat > 3 ? 1 : lat < -3 ? -1 : 0;
    if (side !== 0) { if (lastSide !== 0 && side !== lastSide) crossings++; lastSide = side; }
    const vx = (p.x - prev.x) * 30, vz = (p.z - prev.z) * 30, sp = Math.hypot(vx, vz);
    speeds.push(sp); accel.push(Math.abs(sp - prevSpeed) * 30); prevSpeed = sp;
    if (sp > .3) {
      const h = Math.atan2(vx, vz);
      if (prevH !== null) { const dh = Math.abs(Math.atan2(Math.sin(h - prevH), Math.cos(h - prevH))) * 30; turn.push(dh); if (dh > 6) reversalFrames++; }
      prevH = h;
    }
    if (f.hunt.dog().state === 'quartering') quarteringFrames++;
    prev = p;
  }
  const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(q * (s.length - 1))]; };
  return { areaId, breedId, meanDist: +(sumDist / n).toFixed(1), p90Dist: +pct(dists, .9).toFixed(1), aheadPct: +(ahead / n * 100).toFixed(0),
    behindPct: +(behind / n * 100).toFixed(0), meanFwd: +(sumFwd / n).toFixed(1), meanAbsLat: +(sumAbsLat / n).toFixed(1),
    crossingsPerMin: +(crossings / (n / 30 / 60)).toFixed(1), medSpeed: +pct(speeds, .5).toFixed(2), p95Speed: +pct(speeds, .95).toFixed(2),
    p95Turn: +pct(turn, .95).toFixed(2), p99Turn: +pct(turn, .99).toFixed(2), snapTurnPct: +(reversalFrames / n * 100).toFixed(1),
    p99Accel: +pct(accel, .99).toFixed(1), quarteringPct: +(quarteringFrames / n * 100).toFixed(0) };
}

describe('field quartering and search movement', () => {
  // A handler walking a public trail at an ordinary pace, with no birds, so
  // the result measures search pattern and locomotion rather than encounters.
  it.each(['quail-fields', 'sharptail-prairie', 'chukar-ridge'].flatMap(area => ['gsp', 'english-setter'].map(breed => [area, breed] as const)))(
    'works ahead of the handler and turns like a running dog in %s (%s)', (area, breed) => {
      const m = measure(area, breed, 7, 120);
      expect(m.aheadPct).toBeGreaterThanOrEqual(85);
      expect(m.behindPct).toBeLessThanOrEqual(5);
      // Crossing the handler's line: a real side-to-side pattern, not a straight run.
      expect(m.crossingsPerMin).toBeGreaterThanOrEqual(3);
      // No on-the-spot pivots while running (>6 rad/s path turn).
      expect(m.snapTurnPct).toBeLessThan(1);
    }, 60_000);
});

describe('search momentum', () => {
  it('curves through a reversal of its search line instead of snapping onto it', async () => {
    const { Dog } = await import('../src/game/dog');
    const { getBreed } = await import('../src/game/breeds');
    const { PROPERTY_PX_TO_M } = await import('../src/game/worldUnits');
    const area = getArea('quail-fields');
    const hunter = { x: 300, y: 300 };
    const dog = new Dog({ x: 300, y: 290 }, { breed: getBreed('gsp'), level: 8 }, () => .5, area.world);
    const env = { huntAreaId: area.id, hunterPos: hunter, workAnchor: { ...hunter }, rangeRadius: 22 / PROPERTY_PX_TO_M,
      movementScale: .05, patches: [], trails: [] };
    for (let i = 0; i < 60; i++) dog.update(DT, [], env);
    dog.heading += Math.PI; // steering asks for a full reversal
    const before = { ...dog.pos };
    dog.update(DT, [], env);
    const first = { ...dog.pos };
    dog.update(DT, [], env);
    const d1 = { x: first.x - before.x, y: first.y - before.y }, d2 = { x: dog.pos.x - first.x, y: dog.pos.y - first.y };
    const turn = Math.abs(Math.atan2(d1.x * d2.y - d1.y * d2.x, d1.x * d2.x + d1.y * d2.y));
    expect(turn).toBeLessThan(.5);
  });
});
