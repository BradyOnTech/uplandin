import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { SkySystem } from '../src/three/subsystems/sky';
import type { Ctx, Quality } from '../src/three/engine';

describe('directional shadow placement during ordinary movement', () => {
  it.each<Quality>(['lite', 'high'])('keeps a fixed surface on whole shadow texels while the %s camera moves and turns', quality => {
    const landscape = new LandscapeModel(getArea('chukar-ridge'), 'south-gate');
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 2, .05, 1600);
    const ctx = { scene, camera, quality, timeOfDay: 'morning', events: new EventTarget(),
      renderer: { toneMappingExposure: 1 } } as unknown as Ctx;
    const sky = new SkySystem(landscape); sky.init(ctx);
    const sun = scene.children.find(object => object instanceof THREE.DirectionalLight && object.castShadow) as THREE.DirectionalLight;
    let origin: THREE.Vector3 | undefined;
    try {
      for (let frame = 0; frame < 80; frame++) {
        camera.position.set(frame * .12, landscape.heightAtWorld(frame * .12, 40) + 1.65, 40);
        camera.rotation.y = frame * .003;
        sky.update(ctx); scene.updateMatrixWorld(true); sun.shadow.updateMatrices(sun);
        const projected = new THREE.Vector3(0, landscape.heightAtWorld(0, 40), 40).applyMatrix4(sun.shadow.matrix);
        origin ??= projected.clone();
        for (const axis of ['x', 'y'] as const) {
          const movedTexels = (projected[axis] - origin[axis]) * sun.shadow.mapSize[axis];
          expect(Math.abs(movedTexels - Math.round(movedTexels))).toBeLessThan(.00001);
        }
      }
    } finally { sky.dispose(ctx); }
  });

  it.each(['quail-fields', 'pheasant-coverts', 'chukar-ridge', 'sharptail-prairie'])('keeps the %s local ground and a close dog inside the existing shadow coverage', area => {
    const landscape = new LandscapeModel(getArea(area));
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 2, .05, 1600);
    const ctx = { scene, camera, quality: 'lite', timeOfDay: 'morning', events: new EventTarget(),
      renderer: { toneMappingExposure: 1 } } as unknown as Ctx;
    const sky = new SkySystem(landscape); sky.init(ctx);
    const sun = scene.children.find(object => object instanceof THREE.DirectionalLight && object.castShadow) as THREE.DirectionalLight;
    try {
      for (const x of [-120, 0, 120]) for (const z of [-120, 40, 200]) {
        const ground = landscape.heightAtWorld(x, z); camera.position.set(x, ground + 1.65, z);
        sky.update(ctx); scene.updateMatrixWorld(true); sun.shadow.updateMatrices(sun);
        for (const height of [0, .7]) {
          const projected = new THREE.Vector3(x, ground + height, z - 4).applyMatrix4(sun.shadow.matrix);
          for (const axis of ['x', 'y', 'z'] as const) {
            expect(projected[axis]).toBeGreaterThan(0);
            expect(projected[axis]).toBeLessThan(1);
          }
        }
      }
      expect(sun.shadow.camera.right - sun.shadow.camera.left).toBe(200);
      expect(sun.shadow.mapSize.x).toBe(1024);
    } finally { sky.dispose(ctx); }
  });
});
