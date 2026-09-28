import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx, Quality } from '../src/three/engine';
import { QuailEnvironmentSystem } from '../src/three/subsystems/quailEnvironment';
import { quailTrackDistanceAt } from '../src/three/subsystems/quailTracks';

describe('Quail grass distance-layer continuity', () => {
  it.each<Quality>(['high', 'lite'])('keeps the same generated clumps in both %s distance layers', (quality) => {
    // Use the production area: shrinking its bounds would leave the existing
    // tracks and landmarks outside the artificial fixture's terrain.
    const landscape = new LandscapeModel(getArea('quail-fields'), 'south-gate');
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const ctx = { scene, camera, quality, time: 0 } as Ctx;
    const environment = new QuailEnvironmentSystem(landscape);
    const near = new Map<string, number>(), distant = new Map<string, number>();
    let nearCount = 0, distantCount = 0;
    let routeClearance = Infinity, castingRoots = 0, apronRoots = 0;
    const matrix = new THREE.Matrix4();
    try {
      environment.init(ctx);
      scene.traverse((object) => {
        if (!(object instanceof THREE.InstancedMesh) || object.geometry.userData.kind !== 'quail-bunchgrass') return;
        const isNear = object.geometry.userData.detail === (quality === 'high' ? 'near' : 'mid');
        const roots = isNear ? near : distant;
        if (isNear) nearCount += object.count; else distantCount += object.count;
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix);
          const key = `${matrix.elements[12]},${matrix.elements[14]}`;
          roots.set(key, (roots.get(key) ?? 0) + 1);
          if (isNear) {
            const point = landscape.worldToProperty(matrix.elements[12], matrix.elements[14], { x: 0, y: 0 });
            if (point.x >= 590 && point.x <= 940 && point.y >= 220 && point.y <= 385)
              routeClearance = Math.min(routeClearance, quailTrackDistanceAt(landscape.area, point.x, point.y) * .9144);
            if (Math.hypot(point.x - 661, point.y - 328) < 10) castingRoots++;
            if (Math.hypot(point.x - 863, point.y - 283) < 10) apronRoots++;
          }
        }
      });
      expect(nearCount).toBeGreaterThan(100);
      // A floating extra row at a tile edge formerly generated duplicate roots.
      expect(near.size).toBe(nearCount); expect(distant.size).toBe(distantCount);
      expect(near.size).toBe(distant.size);
      expect(distantCount).toBe(nearCount);
      expect([...near].filter(([root, count]) => distant.get(root) !== count).slice(0, 10)).toEqual([]);
      expect([...distant].filter(([root, count]) => near.get(root) !== count).slice(0, 10)).toEqual([]);
      // Test actual generated roots, not just the authoring mask: broadening
      // the apron must retain the open crossing and the clump-sized road gap.
      expect(Number.isFinite(routeClearance)).toBe(true);
      expect(routeClearance).toBeGreaterThanOrEqual(2.749);
      expect(apronRoots).toBeGreaterThan(35);
      expect(castingRoots).toBeLessThan(apronRoots * .35);
    } finally {
      environment.dispose(ctx);
    }
  }, 30_000);
});
