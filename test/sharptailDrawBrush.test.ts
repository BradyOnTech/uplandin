import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import { SHARPTAIL_ERRATICS } from '../src/game/sharptailFeatures';
import type { Ctx } from '../src/three/engine';
import { PropertyHabitatSystem } from '../src/three/subsystems/propertyHabitat';
import { SHARPTAIL_DRAW_BRUSH_COLONIES, sharptailDrawBrushPlacements } from '../src/three/subsystems/sharptailDrawBrush';
import { sharptailShrubGeometry } from '../src/three/subsystems/sharptailWoody';
import { buildSharptailHorizonGeometries } from '../src/three/subsystems/sharptailHorizonGeometry';
import { sampleSharptailVegetationBands } from '../src/game/sharptailVegetationBands';

const area = getArea('sharptail-prairie');

describe('broken western prairie brush colonies', () => {
  it('keeps bounded, low colonies and the same distributed roots on Lite', () => {
    const high = sharptailDrawBrushPlacements(false), lite = sharptailDrawBrushPlacements(true);
    expect(high.filter(root => !root.fringe)).toHaveLength(200);
    expect(lite.filter(root => !root.fringe)).toHaveLength(120);
    expect(high.length).toBeLessThanOrEqual(360); expect(lite.length).toBeLessThanOrEqual(216);
    expect(high.filter(root => root.fringe).length).toBeGreaterThan(100);
    expect(lite.filter(root => root.fringe).length).toBeGreaterThan(60);
    expect(high).toEqual(sharptailDrawBrushPlacements(false));
    const geometry = sharptailShrubGeometry();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3()); geometry.dispose();
    for (const root of lite.filter(root => root.fringe)) expect(high).toContainEqual(root);
    for (const colony of SHARPTAIL_DRAW_BRUSH_COLONIES) {
      const roots = high.filter(root => root.colony === colony.id && !root.fringe);
      expect(lite.filter(root => root.colony === colony.id && !root.fringe)).toEqual(roots.slice(0, 12));
      const along = roots.map(root => ((root.x - colony.x) * Math.cos(colony.yaw)
        + (root.y - colony.y) * Math.sin(colony.yaw)) * PROPERTY_PX_TO_M);
      const radii = roots.map(root => Math.min(size.x, size.z) * .5 * root.scale * root.spread);
      const width = Math.max(...along.map((x, i) => x + radii[i])) - Math.min(...along.map((x, i) => x - radii[i]));
      expect(width).toBeGreaterThan(10); expect(width).toBeLessThan('apron' in colony ? 40 : 30);
      for (const root of roots) {
        expect(root.scale).toBeGreaterThanOrEqual(root.apron ? 1.31 : 1.88);
        expect(root.scale).toBeLessThan(root.apron ? 1.9 : 2.88);
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
        if (!('apron' in colony)) {
          const outsiders = roots.filter(root => root.colony !== colony.id && !root.fringe && !root.apron);
          const gap = Math.min(...members.flatMap(root => outsiders.map(other =>
            Math.hypot(root.x - other.x, root.y - other.y) * PROPERTY_PX_TO_M - radius(root) - radius(other))));
          expect(gap, colony.id).toBeGreaterThan(5);
        }
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

  it.each([false, true])('brings a low connected sage cape into the boundary approach without adding a wall (Lite %s)', lite => {
    const geometry = sharptailShrubGeometry();
    try {
      const roots = sharptailDrawBrushPlacements(lite), aprons = roots.filter(root => root.apron);
      expect(aprons).toHaveLength(lite ? 24 : 40);
      const size = geometry.boundingBox!.getSize(new THREE.Vector3());
      const radius = (root: typeof roots[number]) => Math.min(size.x, size.z) * .5 * root.scale * root.spread;
      for (const root of aprons) expect(geometry.boundingBox!.max.y * root.scale).toBeLessThan(1.45);
      const first = aprons.filter(root => root.colony === 'boundary-sage-apron');
      const distances = first.map(root => Math.hypot(root.x - 25, root.y - 523)).sort((a, b) => a - b);
      expect(distances[Math.floor(distances.length / 2)]).toBeGreaterThan(25);
      expect(distances[Math.floor(distances.length / 2)]).toBeLessThan(40);
      // Overlapping local crowns and short grassy breaks link the two new
      // shoulders to the established mouth. Smaller upright crowns preserve
      // an open gap, while the shared grassy drainage joins their roots.
      for (const [a, b] of [['boundary-sage-apron', 'draw-mouth-sage-apron'], ['draw-mouth-sage-apron', 'outer-draw-mouth']]) {
        const from = roots.filter(root => root.colony === a), to = roots.filter(root => root.colony === b);
        const nearest = from.flatMap(root => to.map(other => ({ root, other,
          gap: Math.hypot(root.x - other.x, root.y - other.y) * PROPERTY_PX_TO_M - radius(root) - radius(other),
        }))).sort((left, right) => left.gap - right.gap)[0];
        expect(nearest.gap).toBeLessThan(7);
        const band = { scrub: 0, grass: 0, litter: 0 };
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          sampleSharptailVegetationBands(nearest.root.x * (1 - t) + nearest.other.x * t,
            nearest.root.y * (1 - t) + nearest.other.y * t, band);
          expect(band.grass).toBeGreaterThan(.9);
          expect(band.scrub).toBeGreaterThan(.35);
        }
      }
    } finally { geometry.dispose(); }
  });

  it('grows short drainage offshoots inside shared scrub bands and leaves their grassy breaks open', () => {
    const geometry = sharptailShrubGeometry(), bands = { scrub: 0, grass: 0, litter: 0 };
    try {
      const roots = sharptailDrawBrushPlacements(false);
      const fringes = roots.filter(root => root.fringe);
      for (const root of fringes) {
        sampleSharptailVegetationBands(root.x, root.y, bands);
        expect(bands.scrub).toBeGreaterThan(.08); expect(bands.grass).toBeGreaterThan(.5);
        expect(geometry.boundingBox!.max.y * root.scale).toBeLessThan(1);
        const colony = SHARPTAIL_DRAW_BRUSH_COLONIES.find(colony => colony.id === root.colony)!;
        expect(Math.hypot(root.x - colony.x, root.y - colony.y)).toBeLessThan(30);
      }
      for (const [x, y] of [[-92, 615], [53, 584], [58, 658]]) {
        sampleSharptailVegetationBands(x, y, bands);
        expect(bands.grass).toBeGreaterThan(.8);
        expect(bands.scrub).toBeLessThan(.01);
        // These authored grassy passages must not become a continuous hedge.
        expect(Math.min(...roots.map(root => Math.hypot(root.x - x, root.y - y)))).toBeGreaterThan(5);
      }
    } finally { geometry.dispose(); }
  });

  it.each(area.dropPoints.flatMap(drop => (['high', 'lite'] as const).map(quality => ({ dropId: drop.id, quality }))))(
    'roots all colonies in actual exterior terrain in the existing batch at $dropId / $quality', ({ dropId, quality }) => {
      const landscape = new LandscapeModel(area, dropId), system = new PropertyHabitatSystem(landscape);
      const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 0 } as Ctx;
      system.init(ctx);
      const material = new THREE.MeshBasicMaterial();
      const horizon = buildSharptailHorizonGeometries(landscape, (_landscape, _x, _y, color) => color.set(0xffffff))
        .map(geometry => new THREE.Mesh(geometry, material));
      const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
      const groundAt = (x: number, z: number) => {
        ray.ray.origin.set(x, 1000, z);
        const hit = ray.intersectObjects(horizon, false)[0];
        expect(hit).toBeDefined(); return hit.point.y;
      };
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
          const scale = new THREE.Vector3().setFromMatrixScale(placed!.matrix);
          expect(scale.y).toBeCloseTo(root.scale, 5);
          const m = placed!.matrix.elements;
          const width = root.exterior ? Math.hypot(m[0], m[2]) : scale.x;
          expect(width).toBeCloseTo(root.scale * root.spread, 5);
          expect(shrubs.geometry.boundingBox!.max.y * scale.y).toBeLessThan(root.fringe ? 1 : root.apron ? 1.45 : 2.3);
          if (root.exterior) {
            exteriorRoots++;
            expect(placed!.y - groundAt(placed!.x, placed!.z), root.colony).toBeCloseTo(-.03, 4);
            // Only the horizontal footprint follows the bank; the stem axis
            // remains vertical. Sample actual basal geometry, not just the
            // instance origin that used to float a metre above the triangles.
            expect(m[4]).toBe(0); expect(m[6]).toBe(0);
            const positions = shrubs.geometry.getAttribute('position'), vertex = new THREE.Vector3();
            let basalVertices = 0;
            for (let i = 0; i < positions.count; i++) {
              if (positions.getY(i) > .025) continue;
              vertex.fromBufferAttribute(positions, i).applyMatrix4(placed!.matrix);
              const gap = vertex.y - groundAt(vertex.x, vertex.z);
              expect(gap, root.colony).toBeLessThan(.05);
              expect(gap, root.colony).toBeGreaterThan(-.12);
              basalVertices++;
            }
            expect(basalVertices).toBeGreaterThan(5);
            if (Math.abs(placed!.y - landscape.heightAtProperty(0, root.y)) > .5) differentFromClampedEdge++;
          } else {
            expect(placed!.y).toBeCloseTo(landscape.heightAtProperty(root.x, root.y), 4);
            for (const patch of area.patches) {
              const dx = Math.max(patch.x - root.x, 0, root.x - patch.x - patch.w);
              const dy = Math.max(patch.y - root.y, 0, root.y - patch.y - patch.h);
              expect(Math.hypot(dx, dy) * PROPERTY_PX_TO_M).toBeGreaterThan(root.scale * root.spread);
            }
          }
        }
        expect(exteriorRoots).toBeGreaterThan(quality === 'lite' ? 100 : 175);
        expect(exteriorRoots).toBeLessThanOrEqual(quality === 'lite' ? 156 : 260);
        expect(differentFromClampedEdge).toBeGreaterThan(exteriorRoots * .8);
        expect(system.collisionCircles()).toHaveLength(0);
      } finally {
        system.dispose(ctx);
        horizon.forEach(mesh => mesh.geometry.dispose()); material.dispose();
      }
      expect(ctx.scene.children).toHaveLength(0);
    },
  );
});
