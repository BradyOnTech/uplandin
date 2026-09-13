import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { ChukarEnvironmentSystem } from '../src/three/subsystems/chukarEnvironment';
import { CHUKAR_GROUND_DETAIL } from '../src/three/subsystems/chukarTerrain';
import { quailGroundTileAt } from '../src/three/subsystems/quailGroundGeometry';
import { buildQuailTerrainGeometry } from '../src/three/subsystems/quailTerrain';

// Rock export contents have their own production checks. This exercises the
// real environment builder and rendered terrain without browser asset fetches.
vi.mock('../src/three/assets/chukarKit', () => ({
  loadChukarKit: async () => [0, 1, 2].map(() => new THREE.IcosahedronGeometry(1, 0)),
}));

describe('Chukar plant contact', () => {
  it.each(['high', 'lite'] as const)('roots %s plants on both rendered terrain grids', async quality => {
    const landscape = new LandscapeModel(getArea('chukar-ridge'));
    const system = new ChukarEnvironmentSystem(landscape);
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 2,
      timeOfDay: 'morning' } as Ctx;
    const surfaceMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const matrix = new THREE.Matrix4(), ray = new THREE.Raycaster();
    try {
      await system.init(ctx);
      const plants: THREE.InstancedMesh[] = [];
      ctx.scene.traverse(object => {
        if (object instanceof THREE.InstancedMesh && object.geometry.getAttribute('quailInstanceGround')) plants.push(object);
      });
      expect(plants.length).toBeGreaterThan(10);
      // Spread samples across the property, including both plant families.
      for (const mesh of plants.filter((_, i) => i % Math.ceil(plants.length / 8) === 0)) {
        const i = Math.floor(mesh.count / 2);
        mesh.getMatrixAt(i, matrix);
        const root = new THREE.Vector3().setFromMatrixPosition(matrix);
        const p = landscape.worldToProperty(root.x, root.z, { x: 0, y: 0 });
        const tile = quailGroundTileAt(landscape, p.x, p.y);
        for (const level of ['near', 'far'] as const) {
          const geometry = buildQuailTerrainGeometry(landscape, tile.x, tile.y, tile.width, tile.depth, CHUKAR_GROUND_DETAIL[quality][level]);
          const terrain = new THREE.Mesh(geometry, surfaceMaterial); terrain.updateMatrixWorld(true);
          ray.set(new THREE.Vector3(root.x, 1000, root.z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(terrain)[0]; expect(hit).toBeDefined();
          const shift = level === 'far' ? mesh.geometry.getAttribute('quailInstanceGround').getX(i) : 0;
          expect(root.y + shift - hit.point.y).toBeCloseTo(-.018, 3);
          geometry.dispose();
        }
      }
      const mesh = plants[0], material = mesh.material as THREE.MeshLambertMaterial;
      const shader = (type: 'lambert' | 'depth') => ({ vertexShader: THREE.ShaderLib[type].vertexShader,
        fragmentShader: THREE.ShaderLib[type].fragmentShader, uniforms: {} }) as THREE.WebGLProgramParametersWithUniforms;
      const visible = shader('lambert'), depth = shader('depth');
      material.onBeforeCompile(visible, ctx.renderer);
      mesh.customDepthMaterial!.onBeforeCompile(depth, ctx.renderer);
      ctx.camera.position.set(150, 90, -80); ctx.time = 3; system.update(ctx);
      // Light-camera rendering must use the same terrain tier and wind frame
      // as the visible plants, even after climbing to another ground tile.
      expect(depth.uniforms.uChukarViewPosition).toBe(visible.uniforms.uChukarViewPosition);
      expect(depth.uniforms.uChukarViewPosition.value).toEqual(ctx.camera.position);
      expect(depth.uniforms.uChukarWind).toBe(visible.uniforms.uChukarWind);
      expect(depth.uniforms.uChukarWind.value).toBe(3);
      expect(depth.uniforms.uQuailGrassGroundNearDistance.value).toBe(CHUKAR_GROUND_DETAIL[quality].range);
    } finally { system.dispose(ctx); surfaceMaterial.dispose(); }
  }, 30000);
});
