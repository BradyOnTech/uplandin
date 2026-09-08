import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx, Quality } from '../src/three/engine';
import { PropertyHabitatSystem } from '../src/three/subsystems/propertyHabitat';

function fixture(quality: Quality) {
  const landscape = new LandscapeModel(getArea('grouse-woods'));
  const system = new PropertyHabitatSystem(landscape);
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 0 } as Ctx;
  system.init(ctx);
  const meshes = ctx.scene.children as THREE.InstancedMesh[];
  return { landscape, system, ctx, meshes };
}

describe('grouse woodland coverage', () => {
  for (const quality of ['high', 'lite'] as const) {
    it(`retains timber throughout the property on ${quality}, with paired crowns`, () => {
      const { landscape, system, ctx, meshes } = fixture(quality);
      const quadrants = [0, 0, 0, 0];
      const matrix = new THREE.Matrix4(), property = { x: 0, y: 0 };
      let trees = 0, crowns = 0;
      for (const mesh of meshes) {
        if (mesh.name.includes('canopy')) crowns += mesh.count;
        if (!mesh.name.includes('trunk')) continue;
        trees += mesh.count;
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          landscape.worldToProperty(matrix.elements[12], matrix.elements[14], property);
          quadrants[(property.x >= 500 ? 1 : 0) + (property.y >= 320 ? 2 : 0)]++;
        }
      }
      expect(trees).toBeGreaterThan(4000);
      expect(trees).toBeLessThan(7000);
      expect(crowns).toBe(trees);
      for (const count of quadrants) expect(count).toBeGreaterThan(800);
      system.dispose(ctx);
    });
  }

  it('culls distant batches, restores them on approach, and releases shared resources once', () => {
    const { system, ctx, meshes } = fixture('lite');
    const visible = meshes.filter(mesh => mesh.visible);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(meshes.length / 2);
    const distant = meshes.find(mesh => !mesh.visible && mesh.name.includes('trunk'))!;
    expect(distant).toBeDefined();
    ctx.camera.position.copy(distant.boundingSphere!.center);
    system.update(ctx);
    expect(distant.visible).toBe(true);
    const geometries = [...new Set(meshes.map(mesh => mesh.geometry))];
    const materials = [...new Set(meshes.map(mesh => mesh.material as THREE.MeshLambertMaterial))];
    for (const material of materials) expect(material.vertexColors).toBe(false);
    const disposals = [...geometries, ...materials].map(resource => vi.spyOn(resource, 'dispose'));
    system.dispose(ctx);
    expect(ctx.scene.children).toHaveLength(0);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });
});
