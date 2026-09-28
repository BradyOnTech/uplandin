import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { PropertyHabitatSystem } from '../src/three/subsystems/propertyHabitat';
import { sharptailDrawBrushPlacements } from '../src/three/subsystems/sharptailDrawBrush';
import { VEGETATION_INSTANCE_WIND_GLSL } from '../src/three/subsystems/vegetationWind';

type Components = { x: number; y: number; z?: number };

/** Evaluate the actual injected scalar/cofactor GLSL on the CPU. Only type
 * declarations differ from JavaScript; vector builtins use Three.js, so this
 * exercises the shader body instead of copying its inverse into the test. */
function compileWindHelper(shader: string) {
  const body = shader.match(/vec3 vegetationInstanceWind\(vec2 toward\) \{([\s\S]*?)\n\}/)?.[1];
  expect(body).toBeDefined();
  const vector = (x: number, y: number, z: number) => ({ x, y, z, xz: { x, y: z } });
  const dot = (a: Components, b: Components) => a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
  const cross = (a: Components, b: Components) => {
    const out = new THREE.Vector3(a.x, a.y, a.z).cross(new THREE.Vector3(b.x, b.y, b.z));
    return vector(out.x, out.y, out.z);
  };
  const evaluate = new Function('instanceMatrix', 'toward', 'vec3', 'dot', 'cross', 'sqrt', 'min', 'max',
    body!.replace(/\b(?:vec3|float) (?=\w+\s*=)/g, 'const '));
  return (matrix: THREE.Matrix4, toward: THREE.Vector2) => {
    const columns = [0, 1, 2].map(i => {
      const column = new THREE.Vector3().setFromMatrixColumn(matrix, i);
      return { xyz: vector(column.x, column.y, column.z) };
    });
    const out = evaluate(columns, toward, vector, dot, cross, Math.sqrt, Math.min, Math.max) as Components;
    return new THREE.Vector3(out.x, out.y, out.z);
  };
}

function materialShader(material: THREE.Material, ctx: Ctx) {
  const shader = { vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, ctx.renderer);
  return shader.vertexShader;
}

const area = getArea('sharptail-prairie');

describe('affine-grounded Sharptail shrub wind', () => {
  it.each(area.dropPoints.flatMap(drop => (['high', 'lite'] as const).map(quality => ({ dropId: drop.id, quality }))))(
    'moves real sheared crowns horizontally downwind while retaining still roots at $dropId / $quality', ({ dropId, quality }) => {
      const landscape = new LandscapeModel(area, dropId), system = new PropertyHabitatSystem(landscape);
      const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 0 } as Ctx;
      system.init(ctx);
      try {
        const meshes = ctx.scene.children as THREE.InstancedMesh[];
        const shrubs = meshes.find(mesh => mesh.name.includes('shrub'))!;
        const shader = materialShader(shrubs.material as THREE.Material, ctx);
        const wind = compileWindHelper(shader);
        expect(shader).not.toContain(VEGETATION_INSTANCE_WIND_GLSL);
        // Other prairie kinds keep the shared orthogonal-instance helper.
        for (const mesh of meshes.filter(mesh => mesh !== shrubs)) {
          expect(materialShader(mesh.material as THREE.Material, ctx)).toContain(VEGETATION_INSTANCE_WIND_GLSL);
        }
        const crownCoefficient = Number(shader.match(/max\(position\.y,0\.\)\*([.\d]+);/)?.[1]);
        expect(crownCoefficient).toBe(.055);
        const instances = Array.from({ length: shrubs.count }, (_, i) => {
          const matrix = new THREE.Matrix4(); shrubs.getMatrixAt(i, matrix); return matrix;
        });
        const roots = sharptailDrawBrushPlacements(quality === 'lite').filter(root => root.exterior);
        const top = shrubs.geometry.boundingBox!.max.y;
        let stronglySheared = 0;
        for (const root of roots) {
          const world = landscape.propertyToWorld(root.x, root.y, { x: 0, z: 0 });
          const matrix = instances.find(matrix => Math.hypot(matrix.elements[12] - world.x, matrix.elements[14] - world.z) < .001)!;
          expect(matrix).toBeDefined();
          const m = matrix.elements, basis = new THREE.Matrix3().setFromMatrix4(matrix);
          const horizontalScale = Math.min(Math.hypot(m[0], m[2]), Math.hypot(m[8], m[10]));
          if (Math.hypot(m[1], m[9]) / horizontalScale > .04) stronglySheared++;
          for (const angle of [0, .73, Math.PI / 2, 3.8]) {
            const toward = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
            const local = wind(matrix, toward);
            const displacement = local.clone().multiplyScalar(top * crownCoefficient).applyMatrix3(basis);
            const amplitude = horizontalScale * top * crownCoefficient;
            expect(Math.abs(displacement.y)).toBeLessThan(1e-10);
            expect(displacement.x).toBeCloseTo(toward.x * amplitude, 10);
            expect(displacement.z).toBeCloseTo(toward.y * amplitude, 10);
            expect(displacement.length()).toBeCloseTo(amplitude, 10);
            // Full-strength gusts remain small crown motion, not shrub drift.
            expect(amplitude).toBeGreaterThan(.05); expect(amplitude).toBeLessThan(.3);
            for (const rootHeight of [-.03, 0]) {
              expect(local.clone().multiplyScalar(Math.max(rootHeight, 0) * crownCoefficient).applyMatrix3(basis).length()).toBe(0);
            }
          }
        }
        // This must exercise sloped, non-orthogonal instances, not just a flat
        // matrix on which the previous shortcut happened to work.
        expect(stronglySheared).toBeGreaterThan(roots.length * .5);
      } finally { system.dispose(ctx); }
    },
  );
});
