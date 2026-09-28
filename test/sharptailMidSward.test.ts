import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { SharptailMidSward } from '../src/three/subsystems/sharptailMidSward';

describe('Sharptail connected middle-distance canopy', () => {
  it.each(['high', 'lite'] as const)('follows authoritative ground across the full property within fixed %s budgets', quality => {
    const landscape = new LandscapeModel(getArea('sharptail-prairie'));
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 0 } as Ctx;
    const system = new SharptailMidSward(landscape, ctx);
    expect(system.meshes.length).toBeLessThanOrEqual(48);
    let triangles = 0, bytes = 0, vertices = 0;
    const extent = new THREE.Box3();
    for (const mesh of system.meshes) {
      expect(mesh.castShadow || mesh.receiveShadow).toBe(false);
      expect((mesh.material as THREE.MeshLambertMaterial).transparent).toBe(false);
      const geometry = mesh.geometry, p = geometry.getAttribute('position'), floor = geometry.getAttribute('prairieFloor');
      triangles += geometry.index!.count / 3; vertices += p.count;
      bytes += Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0) + geometry.index!.array.byteLength;
      geometry.computeBoundingBox(); extent.union(geometry.boundingBox!);
      for (let i = 0; i < p.count; i += 7) {
        const ground = landscape.heightAtWorld(p.getX(i), p.getZ(i));
        expect(Math.abs(floor.getX(i) - ground + .045)).toBeLessThan(.0001);
        expect(p.getY(i) - floor.getX(i)).toBeGreaterThanOrEqual(0);
        expect(p.getY(i) - floor.getX(i)).toBeLessThan(.72);
      }
    }
    expect(vertices).toBeGreaterThan(25000);
    expect(extent.getSize(new THREE.Vector3()).x).toBeGreaterThan(1279);
    expect(extent.getSize(new THREE.Vector3()).z).toBeGreaterThan(730);
    expect(triangles).toBeLessThanOrEqual(quality === 'high' ? 120000 : 54000);
    expect(bytes).toBeLessThan(quality === 'high' ? 3100000 : 1450000);
    const versions = system.meshes.map(mesh => (mesh.geometry.getAttribute('position') as THREE.BufferAttribute).version);
    ctx.time = 2; ctx.camera.position.x = 650; system.update(ctx);
    expect(system.meshes.map(mesh => (mesh.geometry.getAttribute('position') as THREE.BufferAttribute).version)).toEqual(versions);
    expect(system.meshes.some(mesh => !mesh.visible)).toBe(true);
    system.dispose(ctx); expect(ctx.scene.children).toHaveLength(0);
  });

  it('keeps the same authored canopy height when entering from another gate', () => {
    const contexts: Ctx[] = [], systems: SharptailMidSward[] = [];
    for (const drop of ['south-gate', 'west-track'] as const) {
      const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite', time: 0 } as Ctx;
      contexts.push(ctx); systems.push(new SharptailMidSward(new LandscapeModel(getArea('sharptail-prairie'), drop), ctx));
    }
    expect(systems[0].meshes.length).toBe(systems[1].meshes.length);
    for (let m = 0; m < systems[0].meshes.length; m++) {
      const a = systems[0].meshes[m].geometry.getAttribute('position'), b = systems[1].meshes[m].geometry.getAttribute('position');
      expect(a.count).toBe(b.count);
      for (let i = 0; i < a.count; i += 31) expect(a.getY(i)).toBeCloseTo(b.getY(i), 5);
    }
    systems.forEach((system, i) => system.dispose(contexts[i]));
  });
});
