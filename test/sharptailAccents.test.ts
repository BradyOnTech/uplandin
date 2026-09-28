import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { SHARPTAIL_ERRATICS, sharptailStoneClearance } from '../src/game/sharptailFeatures';
import type { Ctx } from '../src/three/engine';
import { PropertyHabitatSystem } from '../src/three/subsystems/propertyHabitat';
import { SHARPTAIL_ACCENT_POCKETS, SHARPTAIL_ERRATIC_POCKETS, sharptailAccentGroundAt, sharptailAccentPlacements } from '../src/three/subsystems/sharptailAccents';
import { sharptailForbGeometry, sharptailStoneGeometry } from '../src/three/subsystems/sharptailWoody';

const area = getArea('sharptail-prairie');

describe('composed low prairie habitat', () => {
  it('preserves pocket roots across quality tiers with bounded decorative counts', () => {
    const high = sharptailAccentPlacements(false), lite = sharptailAccentPlacements(true);
    expect(high).toEqual(sharptailAccentPlacements(false));
    expect(lite).toHaveLength(356); expect(high).toHaveLength(547);
    const identity = (item: typeof high[number]) => JSON.stringify(item);
    const highItems = new Set(high.map(identity));
    for (const item of lite) {
      expect(highItems.has(identity(item))).toBe(true);
      expect(item.x).toBeGreaterThan(area.world.x); expect(item.x).toBeLessThan(area.world.x + area.world.w);
      expect(item.y).toBeGreaterThan(area.world.y); expect(item.y).toBeLessThan(area.world.y + area.world.h);
    }
    for (const pocket of SHARPTAIL_ACCENT_POCKETS) {
      expect(lite.filter(item => item.pocket === pocket.id && item.kind === 'shrub').length).toBeGreaterThan(10);
      expect(lite.some(item => item.pocket === pocket.id && item.kind === 'reed')).toBe(true);
      expect(lite.some(item => item.pocket === pocket.id && item.kind === 'rock')).toBe(true);
    }
  });

  it('keeps the new low lee pockets outside solid stones and walking lanes with identical Lite roots', () => {
    const high = sharptailAccentPlacements(false), lite = sharptailAccentPlacements(true);
    const distanceToSegment = (x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
    };
    for (const pocket of SHARPTAIL_ERRATIC_POCKETS) {
      const westernApron = pocket.id === 'west-swale-stone-lee';
      for (const kind of ['shrub', 'reed', 'rock'] as const) {
        const highRoots = high.filter(item => item.pocket === pocket.id && item.kind === kind);
        const liteRoots = lite.filter(item => item.pocket === pocket.id && item.kind === kind);
        expect(highRoots).toHaveLength(kind === 'shrub' ? westernApron ? 30 : 21 : 3);
        expect(liteRoots).toEqual(highRoots.slice(0, kind === 'shrub' ? westernApron ? 20 : 14 : 2));
        for (const root of highRoots) {
          expect(sharptailAccentGroundAt(root.x, root.y)).toBeGreaterThan(.05);
          if (kind === 'shrub') {
            expect(root.scale).toBeGreaterThanOrEqual(.8); expect(root.scale).toBeLessThanOrEqual(westernApron ? 1.8 : 1.3);
          }
          // Probe the occupied footprint, not merely the shared origin.
          const radius = (kind === 'rock' ? .82 : kind === 'shrub' ? .55 : .32) * root.scale / .9144;
          for (let i = 0; i < 16; i++) {
            const angle = i * Math.PI / 8;
            expect(sharptailStoneClearance(root.x + Math.cos(angle) * radius, root.y + Math.sin(angle) * radius)).toBeGreaterThan(.99);
          }
          for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
            expect(distanceToSegment(root.x, root.y, trail.points[i - 1], trail.points[i])).toBeGreaterThan(3.4 + radius);
          }
        }
      }
    }
  });

  it('keeps the ground mask local, bounded and continuous under the pocket cores', () => {
    for (const pocket of SHARPTAIL_ACCENT_POCKETS) {
      expect(sharptailAccentGroundAt(pocket.x, pocket.y)).toBeCloseTo(1);
      expect(Math.abs(sharptailAccentGroundAt(pocket.x + .01, pocket.y) - 1)).toBeLessThan(.001);
    }
    for (let x = 0; x <= 1400; x += 31) for (let y = 0; y <= 800; y += 29) {
      const value = sharptailAccentGroundAt(x, y);
      expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
    }
    for (const [x, y] of [[0, 0], [680, 770], [1190, 448], [800, 600]]) expect(sharptailAccentGroundAt(x, y)).toBe(0);
  });

  it('opens a local grass-and-litter fringe around the closer western stone footprints', () => {
    const stones = SHARPTAIL_ERRATICS.filter(stone => stone.id.startsWith('west-swale-'));
    expect(stones).toHaveLength(5);
    const main = stones.find(stone => stone.id === 'west-swale-stone')!;
    expect(Math.hypot(main.x - 135, main.y - 495)).toBeGreaterThan(25);
    expect(Math.hypot(main.x - 135, main.y - 495)).toBeLessThan(40);
    for (const stone of stones) {
      expect(sharptailAccentGroundAt(stone.x, stone.y)).toBe(1);
      // Sample just beyond each rotated solid rather than only its buried
      // center: the full silhouette needs low grass at the visible foot.
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8;
        const u = Math.cos(angle) * (stone.width / 2 + .8) / .9144;
        const v = Math.sin(angle) * (stone.depth / 2 + .8) / .9144;
        const x = stone.x + u * Math.cos(stone.yaw) + v * Math.sin(stone.yaw);
        const y = stone.y - u * Math.sin(stone.yaw) + v * Math.cos(stone.yaw);
        expect(sharptailAccentGroundAt(x, y)).toBeGreaterThan(.5);
      }
    }
    // These are local foot clearings, not a visual reduction in stocked cover.
    for (const patch of area.patches) {
      const x = patch.x + patch.w / 2, y = patch.y + patch.h / 2;
      if (x < 300 && y < 600) expect(sharptailAccentGroundAt(x, y)).toBe(0);
    }
  });

  it('keeps dry forbs rooted and decorative stone groups below a boot step', () => {
    const forb = sharptailForbGeometry(), rock = sharptailStoneGeometry();
    expect(forb.attributes.position.count / 3).toBeLessThanOrEqual(120);
    expect(forb.boundingBox!.max.y).toBeLessThan(.75);
    expect(Math.abs(forb.boundingBox!.min.y)).toBeLessThan(.025);
    expect(rock.attributes.position.count / 3).toBeLessThanOrEqual(40);
    expect(rock.boundingBox!.min.y).toBeLessThan(0);
    expect(rock.boundingBox!.max.y * 1.14).toBeLessThan(.3);
    forb.dispose(); rock.dispose();
  });

  it.each(['lite', 'high'] as const)('roots visible pocket groups in %s without new collision obstacles or unbounded meshes', quality => {
    const landscape = new LandscapeModel(area), system = new PropertyHabitatSystem(landscape);
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 0 } as Ctx;
    system.init(ctx);
    const meshes = ctx.scene.children as THREE.InstancedMesh[];
    expect(meshes).toHaveLength(5);
    const shrubs = meshes.find(mesh => mesh.name.includes('shrub'))!;
    expect(shrubs.count).toBe(quality === 'lite' ? 410 : 593);
    let triangles = 0;
    for (const mesh of meshes) triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * mesh.count;
    // Complete habitat, including the unchanged49 tree pairs: the closer
    // western stone apron and wind lip add34/51 shrubs and5/8 each of
    // bootstones/forbs; eight broken draw colonies add96/160 shrubs. The
    // complete property and exterior still use only five existing batches.
    // The open shrub kit may spend260 triangles per root, and branched
    // forbs120. Existing roots and five draw batches remain unchanged.
    expect(triangles).toBeLessThanOrEqual(quality === 'lite' ? 123000 : 175000);
    const matrix = new THREE.Matrix4(), vertex = new THREE.Vector3();
    const rocks = meshes.find(mesh => mesh.name.includes('rock'))!;
    for (let i = 0; i < rocks.count; i++) {
      rocks.getMatrixAt(i, matrix);
      const p = rocks.geometry.attributes.position;
      for (let j = 0; j < p.count; j++) {
        vertex.fromBufferAttribute(p, j).applyMatrix4(matrix);
        expect(vertex.y - landscape.heightAtWorld(vertex.x, vertex.z)).toBeLessThan(.3);
      }
    }
    expect(system.collisionCircles()).toHaveLength(0);
    const instanceDisposals = meshes.map(() => 0);
    const expectedDisposals = meshes.map(() => 1);
    meshes.forEach((mesh, index) => mesh.addEventListener('dispose', () => instanceDisposals[index]++));
    system.dispose(ctx); expect(ctx.scene.children).toHaveLength(0);
    expect(instanceDisposals).toEqual(expectedDisposals);
    system.dispose(ctx);
    expect(instanceDisposals).toEqual(expectedDisposals);
  });
});
