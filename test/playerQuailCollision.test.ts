import { wetPondLayout } from '../src/game/wetPonds';
import { QUAIL_GROUND_PROPS, quailGroundPropObstacles } from '../src/three/subsystems/quailGroundProps';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { PlayerSystem } from '../src/three/subsystems/player';
import { buildQuailFenceGeometry } from '../src/three/subsystems/quailFences';
import { deriveQuailEntrances } from '../src/three/subsystems/quailEntrances';
import { PropertyHabitatSystem } from '../src/three/subsystems/propertyHabitat';

vi.mock('../src/audio', () => ({ unlockAudio: vi.fn(), playFootstep: vi.fn() }));

const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { getElementById: () => null }));
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('HTMLElement', class {});
});
afterEach(() => { cleanup.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); });

function fixture(drop = 'south-gate', areaId = 'quail-fields', withFence = true, withProps = false) {
  const landscape = new LandscapeModel(getArea(areaId), drop);
  const fence = buildQuailFenceGeometry(landscape);
  const scenery = { collisionCircles: () => [...(withFence ? fence.laneObstacles : []), ...(withProps ? quailGroundPropObstacles(landscape) : [])] };
  const terrain = { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z) };
  const systems = { 'quail-environment': scenery, landmarks: { collisionCircles: () => [] }, terrain, hunt3d: { coverPatches: () => [] } };
  const ctx = { paused: false, camera: new THREE.PerspectiveCamera(), renderer: { domElement: new EventTarget() },
    events: new EventTarget(), get: (id: keyof typeof systems) => systems[id] } as unknown as Ctx;
  const player = new PlayerSystem(landscape); player.init(ctx);
  cleanup.push(() => { player.dispose(); fence.wires.dispose(); });
  const press = (...codes: string[]) => codes.forEach(code => window.dispatchEvent(Object.assign(new Event('keydown'), { code })));
  const point = () => new THREE.Vector2(ctx.camera.position.x, ctx.camera.position.z);
  return { player, ctx, landscape, fence, press, point };
}

function laneMidpoint(landscape: LandscapeModel, side: number) {
  const entrance = deriveQuailEntrances(landscape.area).find(e => e.dropPointId === landscape.dropPoint.id)!;
  const { a, b } = entrance.laneFences[side];
  const length = Math.hypot(b.x - a.x, b.y - a.y) * PROPERTY_PX_TO_M;
  const count = Math.ceil(length / .65), t = (Math.floor(count / 2) + .5) / count;
  const world = landscape.propertyToWorld(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, { x: 0, z: 0 });
  const tangent = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
  return { midpoint: new THREE.Vector2(world.x, world.z), tangent, normal: new THREE.Vector2(-tangent.y, tangent.x) };
}
const yaw = (direction: THREE.Vector2) => Math.atan2(-direction.x, -direction.y) * 180 / Math.PI;

describe('Quail hunter movement against actual lane fences', () => {
  it('blocks a sprint through an actual Grouse Woods trunk', () => {
    const landscape = new LandscapeModel(getArea('grouse-woods'));
    const habitat = new PropertyHabitatSystem(landscape);
    const ctx = { paused: false, quality: 'lite', time: 0, scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(), renderer: { domElement: new EventTarget() }, events: new EventTarget(),
      get: (id: string) => {
        if (id === 'property-habitat') return habitat;
        if (id === 'landmarks') return { collisionCircles: () => [] };
        if (id === 'terrain') return { heightAt: () => 0 };
        if (id === 'hunt3d') return { coverPatches: () => [] };
        throw new Error(id);
      },
    } as unknown as Ctx;
    habitat.init(ctx);
    const player = new PlayerSystem(landscape); player.init(ctx);
    cleanup.push(() => { player.dispose(); habitat.dispose(ctx); });
    const tree = habitat.collisionCircles().find(tree => Math.hypot(tree.x, tree.z - 40) < 45)!;
    player.setPose(ctx, tree.x - 2, tree.z, -90);
    for (const code of ['KeyW', 'ShiftLeft']) window.dispatchEvent(Object.assign(new Event('keydown'), { code }));
    for (let step = 0; step < 30; step++) {
      player.update(ctx, .1);
      expect(Math.hypot(ctx.camera.position.x - tree.x, ctx.camera.position.z - tree.z)).toBeGreaterThanOrEqual(tree.radius + .32 - 1e-7);
    }
    expect(ctx.camera.position.x).toBeLessThan(tree.x);
  });

  it('deflects the hunter around the authored stone without entering its solid footprint', () => {
    const f=fixture('south-gate','quail-fields',false,true);
    const prop=QUAIL_GROUND_PROPS[0];
    const center=f.landscape.propertyToWorld(prop.x,prop.y,{x:0,z:0});
    f.player.setPose(f.ctx,center.x+3,center.z,90);
    f.press('KeyW');
    let deviation=0;
    for(let i=0;i<60;i++) {
      f.player.update(f.ctx,.05);deviation=Math.max(deviation,Math.abs(f.point().y-center.z));
      for(const obstacle of quailGroundPropObstacles(f.landscape)) {
        expect(Math.hypot(f.point().x-obstacle.x,f.point().y-obstacle.z)).toBeGreaterThanOrEqual(obstacle.radius+.32-1e-6);
      }
    }
    expect(deviation).toBeGreaterThan(.3);
  });

  const crossings = ['south-gate', 'west-track'].flatMap(drop => [0, 1].flatMap(side => [-1, 1].map(direction => ({ drop, side, direction }))));
  it.each(crossings)('blocks 100ms sprint frames across $drop lane $side in direction $direction', ({ drop, side, direction }) => {
    const f = fixture(drop); const { midpoint, normal } = laneMidpoint(f.landscape, side);
    const start = midpoint.clone().addScaledVector(normal, -.205 * direction);
    // Both endpoints of the former .418m single step miss every .38m
    // expanded obstacle. The path itself crosses the continuous fence.
    const oldEnd = start.clone().addScaledVector(normal, .418 * direction);
    for (const p of [start, oldEnd]) expect(Math.min(...f.fence.laneObstacles.map(o => Math.hypot(p.x - o.x, p.y - o.z)))).toBeGreaterThan(.38);
    f.player.setPose(f.ctx, start.x, start.y, yaw(normal.clone().multiplyScalar(direction)));
    f.press('KeyW', 'ShiftLeft');
    for (let n = 0; n < 10; n++) {
      f.player.update(f.ctx, .1);
      expect(f.point().sub(midpoint).dot(normal) * direction).toBeLessThan(0);
    }
  });

  it('allows tangential sliding along a lane while retaining the original side', () => {
    const f = fixture(); const { midpoint, normal, tangent } = laneMidpoint(f.landscape, 0);
    const start = midpoint.clone().addScaledVector(normal, -.45);
    const direction = tangent.clone().multiplyScalar(.9).addScaledVector(normal, .5).normalize();
    f.player.setPose(f.ctx, start.x, start.y, yaw(direction)); f.press('KeyW', 'ShiftLeft');
    for (let n = 0; n < 6; n++) { f.player.update(f.ctx, .1); expect(f.point().sub(midpoint).dot(normal)).toBeLessThan(0); }
    expect(f.point().sub(start).dot(tangent)).toBeGreaterThan(1.4);
  });

  it.each(['quail-fields', 'pheasant-coverts'])('preserves unobstructed diagonal speed and camera bob in %s', areaId => {
    const f = fixture('south-gate', areaId, false); const start = new THREE.Vector2(0, 40);
    f.player.setPose(f.ctx, start.x, start.y, 27); f.press('KeyW', 'KeyD', 'ShiftLeft');
    const angle = 27 * Math.PI / 180, direction = new THREE.Vector2(-Math.sin(angle) + Math.cos(angle), -Math.cos(angle) - Math.sin(angle)).normalize();
    const times = [1 / 60, .1, .037]; times.forEach(dt => f.player.update(f.ctx, dt));
    const distance = times.reduce((sum, dt) => sum + dt, 0) * 2.2 * 1.9;
    const expected = start.clone().addScaledVector(direction, distance);
    expect(f.point().distanceTo(expected)).toBeLessThan(1e-10);
    expect(f.ctx.camera.position.y).toBeCloseTo(f.landscape.heightAtWorld(expected.x, expected.y) + 1.62 + Math.sin(distance * 4.3) * .018, 10);
  });

  it('keeps the play bound and bases bob on the actual clipped movement', () => {
    const f = fixture('south-gate', 'quail-fields', false), bound = f.landscape.worldBounds();
    f.player.setPose(f.ctx, bound.minX + 1.52, 40, 90); f.press('KeyW', 'ShiftLeft'); f.player.update(f.ctx, .1);
    expect(f.ctx.camera.position.x).toBeCloseTo(bound.minX + 1.5, 10);
    expect(f.ctx.camera.position.y).toBeCloseTo(f.landscape.heightAtWorld(bound.minX + 1.5, 40) + 1.62 + Math.sin(.02 * 4.3) * .018, 10);
  });
});

it('wades through Woodcock water without sprinting and restores dry-ground sprint', () => {
  const { player, ctx, landscape, press, point } = fixture('west-track', 'woodcock-bottoms', false);
  const pond = wetPondLayout(landscape.area)[0];
  const center = landscape.propertyToWorld(pond.px, pond.py, { x: 0, z: 0 });
  player.setPose(ctx, center.x, center.z, -90);
  press('KeyW', 'ShiftLeft');
  const start = point();
  for (let i = 0; i < 10; i++) player.update(ctx, .1);
  expect(point().distanceTo(start)).toBeCloseTo(2.2 * .55, 2);
  expect(player.isRunning()).toBe(false);
  player.setPose(ctx, 0, 40, -90);
  const dry = point();
  for (let i = 0; i < 10; i++) player.update(ctx, .1);
  expect(point().distanceTo(dry)).toBeCloseTo(2.2 * 1.9, 2);
  expect(player.isRunning()).toBe(true);
});
