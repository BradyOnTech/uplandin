import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { GrassSystem } from '../src/three/subsystems/grass';
import { sharptailGrassGeometry } from '../src/three/subsystems/sharptailGrass';

describe('Sharptail mixed grass art contracts', () => {
  it('keeps four distinct silhouettes rooted and within the shared mobile mesh budget', () => {
    const heights: number[] = [];
    for (const kind of ['short', 'medium', 'stalk', 'cover'] as const) {
      const geo = sharptailGrassGeometry(kind), position = geo.getAttribute('position'), uv = geo.getAttribute('uv');
      expect(position.count / 3).toBeLessThanOrEqual(kind === 'cover' ? 112 : 56);
      expect(geo.getAttribute('color').count).toBe(position.count);
      expect(geo.getAttribute('normal').count).toBe(position.count);
      expect(uv.count).toBe(position.count);
      for (let v = 0; v < position.count; v++) {
        expect(Number.isFinite(position.getX(v) + position.getY(v) + position.getZ(v))).toBe(true);
        expect(uv.getY(v)).toBeGreaterThanOrEqual(0);
        expect(uv.getY(v)).toBeLessThanOrEqual(1);
        if (uv.getY(v) === 0) expect(position.getY(v)).toBe(0);
      }
      if (kind === 'medium') {
        const size = geo.boundingBox!.getSize(new THREE.Vector3());
        expect(size.x).toBeGreaterThan(1);
        expect(size.z).toBeGreaterThan(1);
        // Low spent leaves bridge the roots; a vertical-only asset cannot
        // satisfy this contract even if it has the same bounding box.
        let lowLeafTips = 0;
        for (let v = 0; v < position.count; v++) {
          if (uv.getY(v) > 0 && uv.getY(v) < .1 && position.getY(v) < .07) lowLeafTips++;
        }
        expect(lowLeafTips).toBeGreaterThan(12);
      }
      heights.push(geo.boundingBox!.max.y);
      geo.dispose();
    }
    // The dense body batch must not silently become another short-grass copy.
    expect(heights[1]).toBeGreaterThan(heights[0] * 1.4);
    expect(heights[2]).toBeGreaterThan(heights[1] * 1.2);
  });

  it('retains basal grass in the track center while wearing narrow wheel marks', () => {
    const area = { ...getArea('sharptail-prairie'), trails: [
      { id: 'straight-track-fixture', points: [{ x: 600, y: 448 }, { x: 950, y: 448 }] },
    ] };
    const landscape = new LandscapeModel(area, 'south-gate');
    const point = landscape.propertyToWorld(775, 448, { x: 0, z: 0 });
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(point.x, landscape.heightAtWorld(point.x, point.z) + 1.62, point.z);
    const hunt = { huntState: () => ({ areaId: area.id }), coverPatches: () => area.patches.map(p => {
      const c = landscape.propertyToWorld(p.x + p.w / 2, p.y + p.h / 2, { x: 0, z: 0 });
      return { cx: c.x, cz: c.z, hx: p.w * PROPERTY_PX_TO_M / 2, hz: p.h * PROPERTY_PX_TO_M / 2 };
    }) };
    const terrain = { heightAt: (x: number, z: number) => landscape.heightAtWorld(x, z), paintSeed: () => area.terrain.seed };
    const ctx = { scene: new THREE.Scene(), camera, quality: 'high', time: 0, timeOfDay: 'noon', events: new EventTarget(),
      get: (id: string) => { if (id === 'terrain') return terrain; if (id === 'hunt3d') return hunt; throw new Error(id); },
    } as unknown as Ctx;
    const grass = new GrassSystem(landscape); grass.init(ctx); grass.update(ctx);
    const matrix = new THREE.Matrix4();
    let center = 0, wheels = 0;
    for (const mesh of ctx.scene.children as THREE.InstancedMesh[]) {
      if (!['sharptail-native-short', 'sharptail-native-medium'].includes(mesh.geometry.userData.kind)) continue;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        if (Math.abs(matrix.elements[12] - point.x) > 30) continue;
        const d = Math.abs(matrix.elements[14] - point.z);
        if (d < .25) center++;
        if (Math.abs(d - .60) < .15) wheels++;
      }
    }
    expect(center).toBeGreaterThan(30);
    // Normalize by each sampled strip's width: center .5m, two wheels .6m.
    expect(center / .5).toBeGreaterThan(wheels / .6 * 1.8);
    const far = (ctx.scene.children as THREE.InstancedMesh[]).find(mesh => mesh.geometry.userData.detail === 'distant')!;
    let farDisposed = false;
    far.geometry.addEventListener('dispose', () => { farDisposed = true; });
    grass.dispose(ctx);
    expect(farDisposed).toBe(true);
    expect(ctx.scene.children).toHaveLength(0);
  });
});
