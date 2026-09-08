import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx, Quality } from '../src/three/engine';
import { PropertyHabitatSystem } from '../src/three/subsystems/propertyHabitat';
import { DogObstacleMotion } from '../src/game/dogObstacles';

function fixture(quality: Quality) {
  const landscape = new LandscapeModel(getArea('grouse-woods'));
  const system = new PropertyHabitatSystem(landscape);
  const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 0 } as Ctx;
  system.init(ctx);
  const meshes = ctx.scene.children as THREE.InstancedMesh[];
  return { landscape, system, ctx, meshes };
}

describe('grouse woodland coverage', () => {
  it('blocks a shot through a real trunk while allowing a shot above it, even in a culled cell', () => {
    const { system, ctx, meshes } = fixture('lite');
    const trunk = meshes.find(mesh => !mesh.visible && mesh.name.includes('trunk'))!;
    const matrix = new THREE.Matrix4(); trunk.getMatrixAt(0, matrix);
    const center = new THREE.Vector3(0, .1, 0).applyMatrix4(matrix);
    const start = { x: center.x - 1, y: center.y, z: center.z };
    const end = { x: center.x + 1, y: center.y, z: center.z };
    expect(system.blocksShot(start, end)).toBe(true);
    expect(system.blocksShot({ ...start, y: center.y + 25 }, { ...end, y: center.y + 25 })).toBe(false);
    expect(system.blocksShot(start, { ...start, x: start.x + .1 })).toBe(false);
    system.dispose(ctx);
    expect(system.blocksShot(start, end)).toBe(false);
  });

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
      expect(system.collisionCircles()).toHaveLength(trees);
      for (const count of quadrants) expect(count).toBeGreaterThan(800);
      system.dispose(ctx);
    });
  }

  it('keeps physical trees across quality settings and allows a dog to detour around one', () => {
    const high = fixture('high'), lite = fixture('lite');
    expect(lite.system.collisionCircles()).toEqual(high.system.collisionCircles());
    const circles = high.system.collisionCircles().map(tree => ({ x: tree.x, y: tree.z, radius: tree.radius }));
    const tree = circles.find(tree => circles.every(other => other === tree || Math.hypot(tree.x - other.x, tree.y - other.y) > 5))!;
    expect(tree).toBeDefined();
    const pos = { x: tree.x - 2, y: tree.y }, goal = { x: tree.x + 2, y: tree.y };
    const motion = new DogObstacleMotion();
    for (let step = 0; step < 250 && Math.hypot(goal.x - pos.x, goal.y - pos.y) > .1; step++) {
      motion.move(pos, Math.atan2(goal.y - pos.y, goal.x - pos.x), .08, circles);
      expect(Math.hypot(pos.x - tree.x, pos.y - tree.y)).toBeGreaterThanOrEqual(tree.radius + .3 - 1e-7);
    }
    expect(Math.hypot(goal.x - pos.x, goal.y - pos.y)).toBeLessThan(.1);
    for (const fixture of [high, lite]) fixture.system.dispose(fixture.ctx);
  });

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
