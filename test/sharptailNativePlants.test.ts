import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { LandscapeModel } from '../src/game/landscape';
import { getArea } from '../src/game/areas';
import { SharptailNativePlants, nativePlantGeometry, conformNativePlantMatrix, NativePlantGroundPatch } from '../src/three/subsystems/sharptailNativePlants';

function fixture(lite: boolean) {
  const scene = new THREE.Scene(), material = new THREE.MeshLambertMaterial();
  const source = new THREE.InstancedMesh(nativePlantGeometry('bunch', false), material, 3600);
  const matrix = new THREE.Matrix4(), color = new THREE.Color(.43, .51, .31);
  for (let x = 0; x < 60; x++) for (let z = 0; z < 60; z++) {
    const px = (x - 30) * .4, pz = (z - 30) * .4;
    matrix.makeTranslation(px, .12 * px + .075 * pz - .04, pz);
    conformNativePlantMatrix(matrix, .12, .075);
    source.setMatrixAt(x * 60 + z, matrix); source.setColorAt(x * 60 + z, color);
  }
  source.computeBoundingSphere(); scene.add(source);
  return { system: new SharptailNativePlants(scene, material, [source], lite), source, scene, material };
}
const key = (x: number, z: number) => `${x.toFixed(4)},${z.toFixed(4)}`;

describe('matched opaque Sharptail plant family', () => {
  it.each(['windlaid', 'bunch', 'rank'] as const)('%s detail returns to the same coarse surface and wind under scale/yaw/slope', form => {
    const coarse = nativePlantGeometry(form, false), detail = nativePlantGeometry(form, true);
    expect(coarse.attributes.position.count / 3).toBeGreaterThanOrEqual(54);
    expect(coarse.attributes.position.count / 3).toBeLessThanOrEqual(66);
    expect(detail.attributes.position.count / 3).toBeLessThanOrEqual(280);
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(11, 4, -7),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .8), new THREE.Vector3(1.7, .83, 1.13));
    conformNativePlantMatrix(matrix, .18, -.13);
    const a = new THREE.Vector3(), b = a.clone(), c = a.clone(), p = a.clone(), weights = a.clone(), sum = a.clone();
    for (let i = 0; i < detail.attributes.position.count; i++) {
      const face = detail.attributes.sourceFace.getX(i);
      a.fromBufferAttribute(coarse.attributes.position, face * 3);
      b.fromBufferAttribute(coarse.attributes.position, face * 3 + 1);
      c.fromBufferAttribute(coarse.attributes.position, face * 3 + 2);
      p.fromBufferAttribute(detail.attributes.coarsePosition, i);
      THREE.Triangle.getBarycoord(p, a, b, c, weights);
      expect(Math.min(weights.x, weights.y, weights.z)).toBeGreaterThan(-1e-5);
      sum.copy(a).multiplyScalar(weights.x).addScaledVector(b, weights.y).addScaledVector(c, weights.z);
      expect(sum.applyMatrix4(matrix).distanceTo(p.applyMatrix4(matrix))).toBeLessThan(1e-6);
      // Wind is nonlinear in t. Its already-squared coarse values must be
      // interpolated, or a geometrically matched subdivided leaf still pops.
      for (const attr of ['color', 'uv', 'nativeBend', 'coarseNormal']) {
        const source = coarse.getAttribute(attr), fine = detail.getAttribute(attr);
        for (let channel = 0; channel < source.itemSize; channel++) {
          const expected = source.array[(face * 3) * source.itemSize + channel] * weights.x
            + source.array[(face * 3 + 1) * source.itemSize + channel] * weights.y
            + source.array[(face * 3 + 2) * source.itemSize + channel] * weights.z;
          expect(fine.array[i * fine.itemSize + channel]).toBeCloseTo(expected, 5);
        }
      }
      const normal = detail.attributes.normal;
      expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
      expect(normal.getY(i)).toBeGreaterThan(.7);
      if (detail.attributes.position.getY(i) === 0) expect(detail.attributes.nativeBend.getX(i)).toBe(0);
    }
    coarse.dispose(); detail.dispose();
  });

  it.each([false, true])('keeps every replaced root supported across a saturated moving %s ring', lite => {
    const { system, source } = fixture(lite), camera = new THREE.Vector3();
    const original = source.instanceMatrix.array.slice();
    for (let step = 0; step < 120; step++) {
      camera.set(-3 + step * .064, 1.7, Math.sin(step * .053)); system.update(camera);
      const rendered = new Set<string>(); let count = 0;
      for (const batch of system.batches) {
        count += batch.count;
        const a = batch.instanceMatrix.array;
        for (let i = 0; i < batch.count; i++) rendered.add(key(a[i * 16 + 12], a[i * 16 + 14]));
      }
      expect(count).toBeLessThanOrEqual(lite ? 128 : 400);
      const a = source.instanceMatrix.array;
      for (let i = 0; i < source.count; i++) {
        const x = a[i * 16 + 12], z = a[i * 16 + 14];
        if (Math.hypot(x - camera.x, z - camera.z) < system.stats().handoffRadius) expect(rendered.has(key(x, z))).toBe(true);
      }
    }
    expect(source.instanceMatrix.array).toEqual(original);
    system.dispose(); source.geometry.dispose(); source.dispose();
  });

  it('copies the same grounded transform/color and shares field uniforms without stationary uploads', () => {
    const { system, source, material } = fixture(true), camera = new THREE.Vector3(0, 1.7, 0);
    system.update(camera);
    const byRoot = new Map<string, number>();
    for (let i = 0; i < source.count; i++) byRoot.set(key(source.instanceMatrix.array[i * 16 + 12], source.instanceMatrix.array[i * 16 + 14]), i);
    for (const batch of system.batches) for (let i = 0; i < batch.count; i++) {
      const a = batch.instanceMatrix.array, sourceIndex = byRoot.get(key(a[i * 16 + 12], a[i * 16 + 14]))!;
      expect(Array.from(a.slice(i * 16, i * 16 + 16))).toEqual(Array.from(source.instanceMatrix.array.slice(sourceIndex * 16, sourceIndex * 16 + 16)));
      expect(Array.from(batch.instanceColor!.array.slice(i * 3, i * 3 + 3))).toEqual(Array.from(source.instanceColor!.array.slice(sourceIndex * 3, sourceIndex * 3 + 3)));
      expect(batch.castShadow).toBe(false);
    }
    const versions = system.batches.map(b => b.instanceMatrix.version);
    for (let frame = 0; frame < 120; frame++) system.update(camera);
    expect(system.batches.map(b => b.instanceMatrix.version)).toEqual(versions);
    const time = { value: 7 };
    material.onBeforeCompile = shader => { shader.uniforms.uTime = time; };
    for (const mat of [system.baseMaterial, system.detailMaterial]) {
      const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\nfloat gBend = gT * gT;', fragmentShader: '#include <common>\n#include <clipping_planes_fragment>' } as THREE.WebGLProgramParametersWithUniforms;
      mat.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.uniforms.uTime).toBe(time);
      expect(shader.uniforms.uNativeRange).toBe(system.range);
      expect(shader.vertexShader).toContain('float gBend = nativeBend;');
      expect(mat.transparent).toBe(false); expect(mat.alphaToCoverage).toBe(false);
    }
    system.dispose(); source.geometry.dispose(); source.dispose();
  });

  it('refreshes recycled tiles and disposes only its owned resources', () => {
    const { system, source, scene, material } = fixture(true), camera = new THREE.Vector3(); system.update(camera);
    const disposeEvents = [...system.batches.map(b => b.geometry), system.baseMaterial, system.detailMaterial].map(resource => {
      const fn = vi.fn(); resource.addEventListener('dispose', fn); return fn;
    });
    source.count = 0; source.visible = false;
    system.update(camera, true);
    expect(system.stats().instances).toBe(0); expect(system.batches.every(b => !b.visible)).toBe(true);
    const sourceDispose = vi.fn(); source.geometry.addEventListener('dispose', sourceDispose);
    system.dispose();
    expect(disposeEvents.every(fn => fn.mock.calls.length === 1)).toBe(true);
    expect(sourceDispose).not.toHaveBeenCalled(); expect(source.material).toBe(material);
    expect(scene.children).toEqual([source]);
    source.geometry.dispose(); source.dispose(); material.dispose();
  });
});


describe('bounded planting-tile gradient cache', () => {
  it('keeps X/Z layout on a nonseparable surface and caps query cost independently of plant count', () => {
    const height = vi.fn((x: number, z: number) => .08 * x + .13 * z + .004 * x * z + .003 * x * x);
    const patch = new NativePlantGroundPatch(), out = { x: 0, z: 0 };
    patch.prepare(-40, 20, height);
    expect(height).toHaveBeenCalledTimes(256);
    for (let i = 0; i < 2000; i++) {
      const x = -41.7 + (i % 79) * .29, z = 18.1 + (i % 73) * .32;
      patch.sample(x, z, out);
      expect(out.x).toBeCloseTo(.08 + .004 * z + .006 * x, 10);
      expect(out.z).toBeCloseTo(.13 + .004 * x, 10);
    }
    expect(height).toHaveBeenCalledTimes(256);
    const matrix = new THREE.Matrix4().makeTranslation(-31.7, 12.3, 29.9);
    patch.conform(matrix); expect(matrix.elements[13]).toBe(12.3);
  });

  it.each([
    ['west', 283, 428], ['shack', 982, 327], ['ditch', 810, 437], ['east-steep', 1165, 413],
  ] as const)('bounds derivative error over actual %s support and agrees at adjacent tile seams', (_, px, pz) => {
    const landscape = new LandscapeModel(getArea('sharptail-prairie'), 'south-gate');
    const height = (x: number, z: number) => landscape.heightAtWorld(x, z);
    const center = landscape.propertyToWorld(px, pz, { x: 0, z: 0 });
    const patch = new NativePlantGroundPatch(), neighbor = new NativePlantGroundPatch();
    const slope = { x: 0, z: 0 }, other = { x: 0, z: 0 };
    for (let tx = -1; tx <= 1; tx++) for (let tz = -1; tz <= 1; tz++) {
      const x0 = (Math.floor(center.x / 20) + tx) * 20, z0 = (Math.floor(center.z / 20) + tz) * 20;
      patch.prepare(x0, z0, height); neighbor.prepare(x0 + 20, z0, height);
      for (let a = 0; a < 28; a++) for (let b = 0; b < 28; b++) {
        const x = x0 + .13 + a * .72, z = z0 + .17 + b * .72;
        patch.sample(x, z, slope);
        const dx = height(x + .5, z) - height(x - .5, z), dz = height(x, z + .5) - height(x, z - .5);
        expect(Math.hypot(slope.x - dx, slope.z - dz) * 2).toBeLessThan(.04);
      }
      for (let z = z0; z <= z0 + 20; z += .71) {
        patch.sample(x0 + 20, z, slope); neighbor.sample(x0 + 20, z, other);
        expect(slope.x).toBeCloseTo(other.x, 12); expect(slope.z).toBeCloseTo(other.z, 12);
      }
    }
  });
});
