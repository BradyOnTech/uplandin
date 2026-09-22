import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { PropertyHabitatSystem } from '../src/three/subsystems/propertyHabitat';
import { SHARPTAIL_ACCENT_POCKETS, sharptailAccentGroundAt, sharptailAccentPlacements } from '../src/three/subsystems/sharptailAccents';
import { sharptailForbGeometry, sharptailStoneGeometry } from '../src/three/subsystems/sharptailWoody';

const area = getArea('sharptail-prairie');

describe('composed low prairie habitat', () => {
  it('preserves pocket roots across quality tiers with bounded decorative counts', () => {
    const high = sharptailAccentPlacements(false), lite = sharptailAccentPlacements(true);
    expect(high).toEqual(sharptailAccentPlacements(false));
    expect(lite).toHaveLength(240); expect(high).toHaveLength(372);
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

  it('keeps dry forbs rooted and decorative stone groups below a boot step', () => {
    const forb = sharptailForbGeometry(), rock = sharptailStoneGeometry();
    expect(forb.attributes.position.count / 3).toBeLessThanOrEqual(90);
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
    expect(shrubs.count).toBeGreaterThan(180); expect(shrubs.count).toBeLessThanOrEqual(quality === 'lite' ? 320 : 520);
    let triangles = 0;
    for (const mesh of meshes) triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * mesh.count;
    expect(triangles).toBeLessThan(quality === 'lite' ? 55000 : 90000);
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
