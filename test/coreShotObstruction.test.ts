import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { loadQuailTreeKit } from '../src/three/assets/quailTreeKit';
import { QuailEnvironmentSystem } from '../src/three/subsystems/quailEnvironment';
import { ChukarEnvironmentSystem } from '../src/three/subsystems/chukarEnvironment';
import { PropertyHabitatSystem } from '../src/three/subsystems/propertyHabitat';
import { GunSystem } from '../src/three/subsystems/gun';

vi.mock('../src/audio', () => ({ playShot: vi.fn(), prepareGunSounds: vi.fn(), unlockAudio: vi.fn(), playActionClick: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// Cross an actual rendered triangle, rather than a broad movement circle.
function throughFace(mesh: THREE.Mesh, instance = 0) {
  mesh.updateWorldMatrix(true, false);
  const matrix = mesh.matrixWorld.clone();
  if (mesh instanceof THREE.InstancedMesh) { const local = new THREE.Matrix4(); mesh.getMatrixAt(instance, local); matrix.multiply(local); }
  const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index;
  for (let face = 0; face < (indices?.count ?? positions.count); face += 3) {
    const vertices = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(positions, indices?.getX(face + offset) ?? face + offset).applyMatrix4(matrix));
    const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
    if (normal.length() < .001) continue;
    normal.normalize(); const center = vertices[0].add(vertices[1]).add(vertices[2]).multiplyScalar(1 / 3);
    return { start: center.clone().addScaledVector(normal, .06), end: center.clone().addScaledVector(normal, -.06) };
  }
  throw Error('No nondegenerate solid triangle');
}

describe('core property solid shots', () => {
  it.each(['high', 'lite'].flatMap(quality => ['quail-fields', 'chukar-ridge', 'sharptail-prairie'].map(areaId => ({ quality: quality as 'high' | 'lite', areaId }))))('blocks actual $quality $areaId solids independently of render culling', async ({ quality, areaId }) => {
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(async url => {
      const bytes = await readFile(new URL('../public/' + url.replace(/^\//, ''), import.meta.url));
      return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    });
      const landscape = new LandscapeModel(getArea(areaId));
      const system = areaId === 'quail-fields' ? new QuailEnvironmentSystem(landscape, loadQuailTreeKit)
        : areaId === 'chukar-ridge' ? new ChukarEnvironmentSystem(landscape) : new PropertyHabitatSystem(landscape);
      const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 0, timeOfDay: 'morning' } as Ctx;
      try {
        await system.init(ctx); ctx.scene.updateMatrixWorld(true);
        const meshes: THREE.Mesh[] = []; ctx.scene.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
        // Quail treeStand emits rooted timber then its separate leafy crown.
        const solid = areaId === 'quail-fields' ? (system as unknown as { batches: { mesh: THREE.Mesh; range: number }[] }).batches.find(batch => batch.range === 780)!.mesh
          : areaId === 'chukar-ridge' ? meshes.find(m => m.geometry.userData.kind === 'chukar-authored-basalt')!
            : meshes.find(m => m.name.includes('trunk habitat'))!;
        const foliage = areaId === 'quail-fields'
          ? (system as unknown as { batches: { mesh: THREE.Mesh; range: number }[] }).batches.filter(batch => batch.range === 780)[1].mesh
          : areaId === 'chukar-ridge' ? meshes.find(m => m.geometry.hasAttribute('quailInstanceGround'))!
            : meshes.find(m => m.name.includes('canopy habitat'))!;
        const { start, end } = throughFace(solid);
        const blocks = (a: THREE.Vector3, b: THREE.Vector3) => (system as { blocksShot?: (a: THREE.Vector3, b: THREE.Vector3) => boolean }).blocksShot?.(a, b) ?? false;
        expect(blocks(start, end), areaId + ' solid face').toBe(true);
        const leaf = throughFace(foliage);
        expect(blocks(leaf.start, leaf.end), areaId + ' non-solid leaf face').toBe(false);
        expect(blocks(start, start.clone().lerp(end, .2)), areaId + ' target before face').toBe(false);
        solid.visible = false; solid.parent!.visible = false;
        expect(blocks(start, end), areaId + ' culled face').toBe(true);
        system.dispose(ctx);
        expect(blocks(start, end), areaId + ' disposed face').toBe(false);
      } finally { if (ctx.scene.children.length) system.dispose(ctx); }
  }, 30000);

  it.each(['quail-environment', 'chukar-environment'])('honors %s obstruction during the real gun sweep without blocking a nearer bird', providerId => {
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
    for (const targetDistance of [12, 3]) {
      const resolveBird = vi.fn(() => true), downBird = vi.fn();
      const target = { simId: 7, status: 'flying', x: 0, y: 1.6, z: -targetDistance };
      const blocksShot = vi.fn((_origin, end) => end.z < -5);
      const providers: Record<string, unknown> = { hunt3d: { huntState: () => ({ gunId: 'over-under', birds: [] }), resolveBird },
        birds: { shotTargets: () => [target], downBird }, terrain: { heightAt: () => -100 }, [providerId]: { blocksShot } };
      const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: { domElement: new EventTarget() },
        events: new EventTarget(), quality: 'lite', timeOfDay: 'morning', time: 1, paused: false, fixedAlpha: 1,
        get: (id: string) => providers[id] } as unknown as Ctx;
      ctx.camera.position.set(0, 1.6, 0);
      const gun = new GunSystem(); gun.init(ctx);
      const key = (code: string) => window.dispatchEvent(Object.assign(new Event('keydown'), { code, key: code === 'KeyF' ? 'f' : ' ' }));
      key('KeyF'); gun.update(ctx, .2); key('Space');
      for (let i = 0; i < 6; i++) gun.fixedUpdate(ctx, 1000 / 30);
      expect(gun.shellsRemaining()).toBe(1);
      expect(blocksShot).toHaveBeenCalled();
      expect(resolveBird.mock.calls.length).toBe(targetDistance < 5 ? 1 : 0);
      expect(downBird.mock.calls.length).toBe(targetDistance < 5 ? 1 : 0);
      gun.dispose(ctx);
    }
  });
});
