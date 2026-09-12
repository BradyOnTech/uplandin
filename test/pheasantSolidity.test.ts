import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { PheasantScenerySystem } from '../src/three/subsystems/pheasantScenery';
import { PlayerSystem } from '../src/three/subsystems/player';
import { pheasantWestFence } from '../src/game/pheasantHabitat';

vi.mock('../src/audio', () => ({ unlockAudio: vi.fn(), playFootstep: vi.fn(), playCoverBrush: vi.fn() }));
describe('solid Pheasant trees', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(['south-gate', 'west-track'])('blocks movement and shots at %s without making foliage an invisible wall', drop => {
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', Object.assign(new EventTarget(), { getElementById: () => null }));
    vi.stubGlobal('HTMLElement', class {});
    vi.stubGlobal('location', { search: '' });
    const landscape = new LandscapeModel(getArea('pheasant-coverts'), drop);
    const scenery = new PheasantScenerySystem(landscape);
    const ctx = { quality: 'lite', time: 0, paused: false, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
      renderer: { domElement: new EventTarget() }, events: new EventTarget(),
      get: (id: string) => ({ flora: scenery, terrain: { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z) },
        landmarks: { collisionCircles: () => [] }, hunt3d: { condition: () => 'mild', coverPatches: () => [] } }[id]),
    } as unknown as Ctx;
    scenery.init(ctx);
    const posts = ctx.scene.getObjectByName('West Pothole fence posts') as THREE.InstancedMesh;
    const fence = pheasantWestFence(landscape.area.landmarks);
    const postMatrix = new THREE.Matrix4(), postPosition = new THREE.Vector3();
    for (const [index, expected] of [[0, fence[0]], [posts.count - 1, fence[1]]] as const) {
      posts.getMatrixAt(index, postMatrix); postPosition.setFromMatrixPosition(postMatrix);
      const property = landscape.worldToProperty(postPosition.x, postPosition.z, { x: 0, y: 0 });
      expect(property.x).toBeCloseTo(expected.x, 3);
      expect(property.y).toBeCloseTo(expected.y, 3);
    }
    const trees = scenery.collisionCircles();
    expect(trees.length).toBeGreaterThan(30);
    for (const tree of [trees[0], trees[2]]) {
      const y = landscape.heightAtWorld(tree.x, tree.z) + 1.6;
      const origin = { x: tree.x - 2, y, z: tree.z };
      expect(scenery.blocksShot(origin, { x: tree.x + 2, y, z: tree.z })).toBe(true);
      expect(scenery.blocksShot(origin, { x: tree.x - 1, y, z: tree.z })).toBe(false);
      expect(scenery.blocksShot({ ...origin, y: y + 30 }, { x: tree.x + 2, y: y + 30, z: tree.z })).toBe(false);
    }
    const player = new PlayerSystem(landscape); player.init(ctx);
    const tree = trees[0];
    player.setPose(ctx, tree.x - 2, tree.z, -90);
    for (const code of ['KeyW', 'ShiftLeft']) window.dispatchEvent(Object.assign(new Event('keydown'), { code }));
    for (let step = 0; step < 30; step++) {
      player.update(ctx, .1);
      expect(Math.hypot(ctx.camera.position.x - tree.x, ctx.camera.position.z - tree.z)).toBeGreaterThanOrEqual(tree.radius + .32 - 1e-7);
    }
    expect(ctx.camera.position.x).toBeLessThan(tree.x);
    player.dispose(); scenery.dispose(ctx);
    expect(scenery.collisionCircles()).toHaveLength(0);
    expect(scenery.blocksShot({ x: tree.x - 2, y: 1.6, z: tree.z }, { x: tree.x + 2, y: 1.6, z: tree.z })).toBe(false);
  });
});
