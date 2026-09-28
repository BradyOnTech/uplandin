import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { SHARPTAIL_ERRATICS } from '../src/game/sharptailFeatures';
import type { Ctx } from '../src/three/engine';
import { PropertyHabitatSystem } from '../src/three/subsystems/propertyHabitat';
import { SHARPTAIL_DRAW_BRUSH_COLONIES, sharptailDrawBrushPlacements } from '../src/three/subsystems/sharptailDrawBrush';
import { sharptailShrubGeometry } from '../src/three/subsystems/sharptailWoody';

const area = getArea('sharptail-prairie');

describe('broken western prairie brush colonies', () => {
  it('keeps bounded, low colonies and the same distributed roots on Lite', () => {
    const high = sharptailDrawBrushPlacements(false), lite = sharptailDrawBrushPlacements(true);
    expect(high).toHaveLength(160); expect(lite).toHaveLength(96);
    expect(high).toEqual(sharptailDrawBrushPlacements(false));
    for (const colony of SHARPTAIL_DRAW_BRUSH_COLONIES) {
      const roots = high.filter(root => root.colony === colony.id);
      expect(lite.filter(root => root.colony === colony.id)).toEqual(roots.slice(0, 12));
      const along = roots.map(root => ((root.x - colony.x) * Math.cos(colony.yaw)
        + (root.y - colony.y) * Math.sin(colony.yaw)) * PROPERTY_PX_TO_M);
      expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(10);
      expect(Math.max(...along) - Math.min(...along)).toBeLessThan(30);
      for (const root of roots) {
        expect(root.scale).toBeGreaterThanOrEqual(1.88); expect(root.scale).toBeLessThan(2.88);
        const distance = Math.hypot(root.x - 135, root.y - 495) * PROPERTY_PX_TO_M;
        expect(distance).toBeGreaterThan(50); expect(distance).toBeLessThan(360);
      }
    }
    // Colony footprints occupy only a small part of the western view's
    // 400-by-240-yard ground, preserving broad open casts between masses.
    const occupied = SHARPTAIL_DRAW_BRUSH_COLONIES.reduce((sum, colony) => sum + Math.PI * colony.rx * colony.ry, 0);
    expect(occupied / (400 * 240)).toBeLessThan(.2);
  });

  it.each([false, true])('overlaps actual crown footprints within each mass while keeping open routes and separate colonies (Lite %s)', lite => {
    const geometry = sharptailShrubGeometry();
    try {
      geometry.computeBoundingBox();
      const size = geometry.boundingBox!.getSize(new THREE.Vector3());
      const radius = (root: ReturnType<typeof sharptailDrawBrushPlacements>[number]) =>
        Math.min(size.x, size.z) * .5 * root.scale * root.spread;
      const roots = sharptailDrawBrushPlacements(lite);
      for (const colony of SHARPTAIL_DRAW_BRUSH_COLONIES) {
        const members = roots.filter(root => root.colony === colony.id);
        const overlap = members.map(root => Math.min(...members.filter(other => other !== root).map(other =>
          Math.hypot(root.x - other.x, root.y - other.y) * PROPERTY_PX_TO_M / (radius(root) + radius(other)))));
        // Most crowns must overlap another actual shrub footprint. A wide
        // scatter of individually larger dots does not satisfy this contract.
        expect(overlap.filter(value => value < .9).length / members.length, colony.id).toBeGreaterThan(.8);
        expect(overlap.sort((a, b) => a - b)[Math.floor(overlap.length / 2)], colony.id).toBeLessThan(.65);
        const outsiders = roots.filter(root => root.colony !== colony.id);
        const gap = Math.min(...members.flatMap(root => outsiders.map(other =>
          Math.hypot(root.x - other.x, root.y - other.y) * PROPERTY_PX_TO_M - radius(root) - radius(other))));
        expect(gap, colony.id).toBeGreaterThan(15);
      }
      for (const root of roots) {
        const crownRadius = Math.hypot(size.x, size.z) * .5 * root.scale * root.spread / PROPERTY_PX_TO_M;
        for (const stone of SHARPTAIL_ERRATICS) {
          const solidRadius = Math.hypot(stone.width, stone.depth) * .5 / PROPERTY_PX_TO_M;
          expect(Math.hypot(root.x - stone.x, root.y - stone.y)).toBeGreaterThan(crownRadius + solidRadius);
        }
        for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
          const a = trail.points[i - 1], b = trail.points[i], dx = b.x - a.x, dy = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((root.x - a.x) * dx + (root.y - a.y) * dy) / (dx * dx + dy * dy)));
          expect(Math.hypot(root.x - a.x - dx * t, root.y - a.y - dy * t)).toBeGreaterThan(3.4 + crownRadius);
        }
      }
    } finally { geometry.dispose(); }
  });

  it.each(area.dropPoints.flatMap(drop => (['high', 'lite'] as const).map(quality => ({ dropId: drop.id, quality }))))(
    'roots all colonies in actual exterior terrain in the existing batch at $dropId / $quality', ({ dropId, quality }) => {
      const landscape = new LandscapeModel(area, dropId), system = new PropertyHabitatSystem(landscape);
      const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 0 } as Ctx;
      system.init(ctx);
      try {
        const meshes = ctx.scene.children as THREE.InstancedMesh[];
        expect(meshes).toHaveLength(5);
        const shrubs = meshes.find(mesh => mesh.name.includes('shrub'))!;
        const matrix = new THREE.Matrix4();
        const actual = Array.from({ length: shrubs.count }, (_, index) => {
          shrubs.getMatrixAt(index, matrix);
          return { x: matrix.elements[12], y: matrix.elements[13], z: matrix.elements[14], matrix: matrix.clone() };
        });
        let exteriorRoots = 0, differentFromClampedEdge = 0;
        for (const root of sharptailDrawBrushPlacements(quality === 'lite')) {
          const world = landscape.propertyToWorld(root.x, root.y, { x: 0, z: 0 });
          const placed = actual.find(p => Math.hypot(p.x - world.x, p.z - world.z) < .001);
          expect(placed, root.colony).toBeDefined();
          expect(placed!.y).toBeCloseTo(landscape.heightAtProperty(root.x, root.y), 4);
          const scale = new THREE.Vector3().setFromMatrixScale(placed!.matrix);
          expect(scale.y).toBeCloseTo(root.scale, 5);
          expect(scale.x).toBeCloseTo(root.scale * root.spread, 5);
          expect(shrubs.geometry.boundingBox!.max.y * scale.y).toBeLessThan(2.3);
          if (root.exterior) {
            exteriorRoots++;
            if (Math.abs(placed!.y - landscape.heightAtProperty(0, root.y)) > .5) differentFromClampedEdge++;
          } else {
            for (const patch of area.patches) {
              const dx = Math.max(patch.x - root.x, 0, root.x - patch.x - patch.w);
              const dy = Math.max(patch.y - root.y, 0, root.y - patch.y - patch.h);
              expect(Math.hypot(dx, dy) * PROPERTY_PX_TO_M).toBeGreaterThan(root.scale * root.spread);
            }
          }
        }
        expect(exteriorRoots).toBe(quality === 'lite' ? 60 : 100);
        expect(differentFromClampedEdge).toBeGreaterThan(exteriorRoots * .8);
        expect(system.collisionCircles()).toHaveLength(0);
      } finally { system.dispose(ctx); }
      expect(ctx.scene.children).toHaveLength(0);
    },
  );
});
