import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx, Quality } from '../src/three/engine';
import { QuailEnvironmentSystem } from '../src/three/subsystems/quailEnvironment';

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
        }
      });
      expect(nearCount).toBeGreaterThan(100);
      // A floating extra row at a tile edge formerly generated duplicate roots.
      expect(near.size).toBe(nearCount); expect(distant.size).toBe(distantCount);
      expect(near.size).toBe(distant.size);
      expect(distantCount).toBe(nearCount);
      expect([...near].filter(([root, count]) => distant.get(root) !== count).slice(0, 10)).toEqual([]);
      expect([...distant].filter(([root, count]) => near.get(root) !== count).slice(0, 10)).toEqual([]);
    } finally {
      environment.dispose(ctx);
    }
  }, 30_000);
});
