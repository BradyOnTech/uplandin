import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { defaultQuickConfig, QUICK_KEY } from '../src/game/quick';
import { LandscapeModel, PROPERTY_PX_TO_M as M } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';

const DT = 1000 / 30, WALK = 2.2;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/**
 * An ordinary player, not a script that knows where birds are: roams the
 * property's trail network at walking pace, preferring ground it has not
 * walked, follows the dog when it is making game, and walks in past a
 * pointing dog to its bird. Birds that rise escape. This measures the feel
 * of the hunt: how often something happens and how the dog finds birds.
 */
function hunt(areaId: string, seed: number, seconds: number, challenge = 'balanced') {
  const quick = { ...defaultQuickConfig(), areaId, breedId: 'english-setter', level: 6, weather: 'mild' };
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === QUICK_KEY ? JSON.stringify(quick) : null, setItem() {} });
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { search: `?play=quick&seed=${seed}&challenge=${challenge}&breed=english-setter` });
  const area = getArea(areaId), system = new Hunt3DSystem(new LandscapeModel(area, 'south-gate')), camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.62, 40); camera.rotation.y = Math.PI;
  const player = { consumeRecall: () => false, isRunning: () => false,
    setHuntHeading: (_: Ctx, heading: number) => { camera.rotation.y = -heading - Math.PI / 2; } };
  const ctx = { camera, events: new EventTarget(), get: (id: string) => id === 'player' ? player : { isRiseActive: () => false } } as unknown as Ctx;
  system.init(ctx); system.fixedUpdate(ctx, DT);

  const key = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`;
  const nodes = new Map<string, { x: number; y: number; next: Set<string> }>();
  for (const trail of area.trails) trail.points.forEach((point, i) => {
    if (!nodes.has(key(point))) nodes.set(key(point), { ...point, next: new Set() });
    if (i > 0) { nodes.get(key(point))!.next.add(key(trail.points[i - 1])); nodes.get(key(trail.points[i - 1]))!.next.add(key(point)); }
  });
  const walked = new Map<string, number>();
  let rand = seed >>> 0;
  const roll = () => (rand = (rand * 1664525 + 1013904223) >>> 0) / 4294967296;
  const start = system.worldToSim(camera.position.x, camera.position.z, { x: 0, y: 0 });
  let target = [...nodes.keys()].reduce((a, b) => {
    const d = (k: string) => Math.hypot(nodes.get(k)!.x - start.x, nodes.get(k)!.y - start.y);
    return d(b) < d(a) ? b : a;
  });
  const step = (x: number, z: number) => {
    camera.rotation.y = Math.atan2(-(x - camera.position.x), -(z - camera.position.z));
    camera.position.x -= Math.sin(camera.rotation.y) * WALK / 30;
    camera.position.z -= Math.cos(camera.rotation.y) * WALK / 30;
  };

  const result = { points: 0, wild: 0, detections: [] as number[], straightness: [] as number[] };
  const hidden = new Set(system.huntState().birds.filter(b => b.state === 'hidden').map(b => b.id));
  let stage = 'none', state = '', pathM = 0, from = { x: 0, z: 0 }, previous = system.dogWorld({ x: 0, z: 0 });
  for (let frame = 0; frame < seconds * 30; frame++) {
    const dog = system.dog(), dogWorld = system.dogWorld({ x: 0, z: 0 });
    if (dog.state === 'pointing') {
      const bird = system.huntState().birds.find(b => b.id === dog.pointedBirdId);
      const aim = bird ? system.simToWorld(bird.pos.x, bird.pos.y, { x: 0, z: 0 }) : dogWorld;
      if (Math.hypot(aim.x - camera.position.x, aim.z - camera.position.z) > .8) step(aim.x, aim.z);
    } else if (dog.state === 'tracking' && Math.hypot(dogWorld.x - camera.position.x, dogWorld.z - camera.position.z) > 22) {
      step(dogWorld.x, dogWorld.z);
    } else {
      const node = nodes.get(target)!, world = system.simToWorld(node.x, node.y, { x: 0, z: 0 });
      if (Math.hypot(world.x - camera.position.x, world.z - camera.position.z) < 1.5) {
        const here = target, score = (next: string) => (walked.get(here + next) ?? 0) + (walked.get(next + here) ?? 0) + roll() * .5;
        target = [...node.next].sort((a, b) => score(a) - score(b))[0];
        walked.set(here + target, (walked.get(here + target) ?? 0) + 1);
      }
      step(world.x, world.z);
    }
    system.fixedUpdate(ctx, DT);
    const next = system.dog(), at = system.dogWorld({ x: 0, z: 0 });
    pathM += Math.hypot(at.x - previous.x, at.z - previous.z); previous = at;
    if (stage === 'none' && next.scentStage !== 'none') {
      const p = system.worldToSim(at.x, at.z, { x: 0, y: 0 });
      result.detections.push(Math.min(...system.huntState().birds.filter(b => b.state === 'hidden').map(b => Math.hypot(b.pos.x - p.x, b.pos.y - p.y))) * M);
      pathM = 0; from = { x: at.x, z: at.z };
    }
    if (state !== 'pointing' && next.state === 'pointing') {
      result.points++;
      result.straightness.push(Math.hypot(at.x - from.x, at.z - from.z) / Math.max(pathM, .01));
    }
    const risen = system.huntState().birds.filter(b => hidden.has(b.id) && b.state !== 'hidden');
    if (risen.length) {
      if (state !== 'pointing' && next.state !== 'pointing') result.wild++;
      for (const bird of risen) { hidden.delete(bird.id); if (bird.state === 'flushed') system.resolveBird(bird.id, 'escaped'); }
      system.finishRise();
    }
    for (const bird of system.huntState().birds) if (bird.state === 'hidden') hidden.add(bird.id);
    stage = next.scentStage; state = next.state;
  }
  return result;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe('encounter pacing on a balanced hunt', () => {
  it.each(['quail-fields', 'sharptail-prairie', 'chukar-ridge', 'pheasant-coverts'])(
    '%s: something happens every couple of minutes and the dog finds birds by working scent', area => {
      const runs = [23, 41, 73].map(seed => hunt(area, seed * 1009, 360));
      const contactsPerFiveMinutes = runs.reduce((sum, r) => sum + r.points + r.wild, 0) / runs.length * 300 / 360;
      const points = runs.reduce((sum, r) => sum + r.points, 0);
      // Not a slog: a point or a rise every four minutes at worst, usually two for a
      // player roaming the trails at random (a player reading the cover and
      // casting the dog does better). Relaxed and Loaded stock more birds.
      expect(contactsPerFiveMinutes).toBeGreaterThanOrEqual(1.25);
      // Mostly points, not the hunter stumbling into birds.
      expect(points / runs.reduce((sum, r) => sum + r.points + r.wild, 0)).toBeGreaterThan(.6);
      // Birds are winded at tens of yards, not a hundred...
      expect(median(runs.flatMap(r => r.detections))).toBeLessThan(45);
      // ...and located by casting across the scent, not a straight line.
      expect(median(runs.flatMap(r => r.straightness))).toBeLessThan(.93);
    }, 120_000);
});
