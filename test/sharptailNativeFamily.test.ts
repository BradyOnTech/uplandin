import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CommonGrassPairing, SharptailCommonPlants, nativeFamilyGeometry, commonOriginalSites, deactivateCommonSites } from '../src/three/subsystems/sharptailNativeFamily';
import { nativePlantGeometry, SharptailNativePlants, conformNativePlantMatrix } from '../src/three/subsystems/sharptailNativePlants';
import { GrassSystem } from '../src/three/subsystems/grass';

function mesh(form: 'windlaid' | 'bunch' | 'rank', capacity = 2400) {
  const m = new THREE.InstancedMesh(nativePlantGeometry(form, false), new THREE.MeshLambertMaterial(), capacity);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3); m.count = 0; return m;
}
function plant(m: THREE.InstancedMesh, x: number, z: number) {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, .12 * x - .08 * z - .04, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .41), new THREE.Vector3(1.23, .92, 1.11));
  conformNativePlantMatrix(matrix, .12, -.08); m.setMatrixAt(m.count, matrix); m.setColorAt(m.count++, new THREE.Color(.4 + x * .002, .5, .3 + z * .002));
}
const ids = (m: THREE.InstancedMesh) => Array.from({ length: m.count }, (_, i) => `${m.instanceMatrix.array[i * 16 + 12]},${m.instanceMatrix.array[i * 16 + 14]}`);
function tile(tx: number, tz: number) {
  const a = mesh('windlaid'), b = mesh('bunch');
  for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) plant((x + z) % 3 === 0 ? a : b, tx * 20 + x + .21, tz * 20 + z + .36);
  plant(b, tx * 20 - .12, tz * 20 + .2); // secondary growth crosses its owner's edge
  for (const m of [a, b]) m.computeBoundingSphere(); return [a, b];
}
function compact(pairing: CommonGrassPairing, sources: THREE.InstancedMesh[], tx: number, tz: number) {
  const counts = pairing.compact(sources, sources.map(m => m.count), tx, tz, 1);
  sources.forEach((m, i) => { m.count = counts[i]; m.visible = m.count > 0; m.computeBoundingSphere(); });
}

describe('authored common prairie grass', () => {
  it.each(['windlaid', 'bunch'] as const)('%s partitions every source leaf without duplicate survivor submission', form => {
    const geometries = (['base', 'middle', 'near'] as const).map(part => nativeFamilyGeometry(form, part));
    expect(geometries.map(g => g.attributes.position.count / 3)).toEqual([120, 168, 216]);
    const leaves = geometries.map(g => new Set(Array.from(g.attributes.familyLeaf.array)));
    expect(leaves.map(s => s.size)).toEqual([24, 24, 24]); expect(new Set(leaves.flatMap(s => [...s])).size).toBe(72);
    for (const g of geometries) {
      const p = g.attributes.position, r = g.attributes.familyRoot, n = g.attributes.normal, c = g.attributes.color;
      for (let i = 0; i < p.count; i += 3) {
        // Fully collapsed triangles share one exact root, including after a
        // nonuniform grounded affine transform. Wind/parting must not reopen it.
        const matrix = new THREE.Matrix4().makeScale(1.7, .83, 1.24); conformNativePlantMatrix(matrix, .18, -.09);
        const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(r, i + j).applyMatrix4(matrix));
        expect(points[0].distanceTo(points[1])).toBe(0); expect(points[0].distanceTo(points[2])).toBe(0);
      }
      for (let i = 0; i < n.count; i++) { expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5); expect(n.getY(i)).toBeGreaterThan(.80); }
      expect(Math.max(...c.array)).toBeLessThan(.981);
      // Each leaf's distributed roots fit well inside the existing support
      // audit. No ring switch can introduce a wider unsupported root.
      for (let i = 0; i < r.count; i++) {
        expect(r.getY(i)).toBe(0);
        expect(Math.hypot(r.getX(i), r.getZ(i))).toBeLessThan(.27);
      }
      expect(g.boundingBox!.max.y).toBeLessThan(.8);
      expect(g.boundingBox!.min.y).toBe(0);
      expect(g.boundingBox!.getSize(new THREE.Vector3()).length()).toBeLessThan(2.4);
      g.dispose();
    }
  });

  it('pairs only within owner tiles, preserves original transforms/colors and is independent of neighbor load order', () => {
    const pairing = new CommonGrassPairing(2400, 2400), a = tile(-1, 0), b = tile(0, 0), again = tile(-1, 0);
    const original = new Map(a.flatMap(m => ids(m).map((id, i) => [id, { matrix: Array.from(m.instanceMatrix.array.slice(i * 16, i * 16 + 16)), color: Array.from(m.instanceColor!.array.slice(i * 3, i * 3 + 3)) }] as const)));
    compact(pairing, a, -1, 0); compact(pairing, b, 0, 0); b.forEach(deactivateCommonSites); compact(pairing, again, -1, 0);
    expect(a.map(ids)).toEqual(again.map(ids)); expect(a.reduce((n, m) => n + m.count, 0)).toBeGreaterThan(180);
    expect(a.reduce((n, m) => n + m.count, 0)).toBeLessThan(230);
    for (const m of a) for (const [i, id] of ids(m).entries()) {
      expect(Array.from(m.instanceMatrix.array.slice(i * 16, i * 16 + 16))).toEqual(original.get(id)!.matrix);
      expect(Array.from(m.instanceColor!.array.slice(i * 3, i * 3 + 3))).toEqual(original.get(id)!.color);
    }
    expect(a.reduce((n, m) => n + commonOriginalSites(m)!.count, 0)).toBe(401);
  });

  it.each([true, false])('preserves the previous rank-detail cutoff and exact selected rank instances on %s', lite => {
    const old = tile(0, 0), next = tile(0, 0), rankOld = mesh('rank'), rankNext = mesh('rank');
    for (let i = 0; i < 80; i++) { const x = .7 + (i % 10) * 1.8, z = 1.2 + Math.floor(i / 10) * 2.1; plant(rankOld, x, z); plant(rankNext, x, z); }
    rankOld.computeBoundingSphere(); rankNext.computeBoundingSphere();
    const before = new SharptailNativePlants(new THREE.Scene(), new THREE.MeshLambertMaterial(), [...old, rankOld], lite);
    compact(new CommonGrassPairing(2400, 2400), next, 0, 0);
    const after = new SharptailNativePlants(new THREE.Scene(), new THREE.MeshLambertMaterial(), [...next, rankNext], lite, true);
    for (let i = 0; i < 20; i++) {
      const camera = new THREE.Vector3(5 + i * .4, 1.7, 8.2); before.update(camera, true); after.update(camera, true);
      expect(after.range.value).toBe(before.range.value);
      expect(after.batches[2].count).toBe(before.batches[2].count);
      const count = before.batches[2].count;
      expect(Array.from(after.batches[2].instanceMatrix.array.slice(0, count * 16))).toEqual(Array.from(before.batches[2].instanceMatrix.array.slice(0, count * 16)));
      expect(Array.from(after.batches[2].instanceColor!.array.slice(0, count * 3))).toEqual(Array.from(before.batches[2].instanceColor!.array.slice(0, count * 3)));
      expect(after.batches[0].count + after.batches[1].count).toBe(0);
    }
    before.dispose(); after.dispose();
  });

  it.each([true, false])('keeps saturated extra rings supported, copies grounded roots, and avoids stationary uploads on %s', lite => {
    const source = mesh('bunch', 6400); source.geometry.dispose(); source.geometry = nativeFamilyGeometry('bunch', 'base');
    for (let x = 0; x < 80; x++) for (let z = 0; z < 80; z++) plant(source, (x - 40) * .25, (z - 40) * .25);
    source.computeBoundingSphere(); const scene = new THREE.Scene(), material = new THREE.MeshLambertMaterial(), system = new SharptailCommonPlants(scene, material, [source], lite);
    const original = source.instanceMatrix.array.slice(), camera = new THREE.Vector3();
    for (let step = 0; step < 20; step++) {
      camera.set(-1 + step * .14, 1.7, .31); system.update(camera);
      for (let tier = 0; tier < 2; tier++) {
        const group = system.batches.slice(tier * 2, tier * 2 + 2), roots = new Set(group.flatMap(ids));
        const cap = tier === 0 ? (lite ? 640 : 1800) : (lite ? 96 : 256), range = tier === 0 ? system.middleRange.value : system.nearRange.value;
        expect(group.reduce((n, m) => n + m.count, 0)).toBeLessThanOrEqual(cap);
        for (let i = 0; i < source.count; i++) {
          const a = source.instanceMatrix.array, x = a[i * 16 + 12], z = a[i * 16 + 14];
          if (Math.hypot(x - camera.x, z - camera.z) < range - .85) expect(roots.has(`${x},${z}`)).toBe(true);
        }
      }
    }
    const versions = system.batches.map(m => m.instanceMatrix.version);
    for (let frame = 0; frame < 120; frame++) system.update(camera);
    expect(system.batches.map(m => m.instanceMatrix.version)).toEqual(versions); expect(source.instanceMatrix.array).toEqual(original);
    source.count = 0; source.visible = false; system.update(camera, true); expect(system.batches.every(m => !m.visible)).toBe(true);
    const owned = [...system.batches.map(m => m.geometry), system.material].map(resource => { const fn = vi.fn(); resource.addEventListener('dispose', fn); return fn; });
    const sourceDisposed = vi.fn(); source.geometry.addEventListener('dispose', sourceDisposed); system.dispose();
    expect(owned.every(fn => fn.mock.calls.length === 1)).toBe(true); expect(sourceDisposed).not.toHaveBeenCalled(); expect(source.material).toBe(material); expect(scene.children).toHaveLength(0);
  });

  it('keeps shared field uniforms and collapses wind plus every parting input with extra leaves', () => {
    const source = mesh('bunch'), material = new THREE.MeshLambertMaterial(), time = { value: 13 };
    material.onBeforeCompile = shader => { shader.uniforms.uTime = time; };
    const system = new SharptailCommonPlants(new THREE.Scene(), material, [source], true);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\nfloat gT = uv.y;\nfloat gBend = gT * gT;\ngWorld.y-=gPart*.3*gT;', fragmentShader: 'unchanged' } as THREE.WebGLProgramParametersWithUniforms;
    system.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.uTime).toBe(time); expect(shader.vertexShader).toContain('float gT = uv.y * familyKeep;');
    expect(shader.vertexShader).toContain('float gBend = nativeBend * familyKeep * familyKeep;');
    expect(shader.fragmentShader).toBe('unchanged'); expect(system.material.transparent).toBe(false); expect(system.material.alphaToCoverage).toBe(false);
    system.dispose();
  });

  it('applies every family replacement to the actual field material and installed Three Lambert shader', () => {
    // Exercise the real upstream shader injection. A renamed or removed field
    // marker must fail here rather than silently leaving moving collapsed tips.
    const grass = new GrassSystem() as unknown as { makeMaterial(uniforms: Record<string, unknown>): THREE.MeshLambertMaterial };
    const time = { value: 7 }, material = grass.makeMaterial({ uTime: time });
    const source = mesh('bunch'), system = new SharptailCommonPlants(new THREE.Scene(), material, [source], true);
    const shader = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader }) as THREE.WebGLProgramParametersWithUniforms;
    const original = shader(), adapted = shader(), renderer = {} as THREE.WebGLRenderer;
    material.onBeforeCompile(original, renderer); system.material.onBeforeCompile(adapted, renderer);
    expect(original.vertexShader).toContain('float gT = uv.y;');
    expect(original.vertexShader).toContain('float gBend = gT * gT;');
    expect(adapted.vertexShader.match(/float gT = uv.y \* familyKeep;/g)).toHaveLength(1);
    expect(adapted.vertexShader.match(/float gBend = nativeBend \* familyKeep \* familyKeep;/g)).toHaveLength(1);
    expect(adapted.vertexShader.match(/transformed=mix\(familyRoot,position,familyKeep\);/g)).toHaveLength(1);
    expect(adapted.vertexShader).not.toContain('float gT = uv.y;');
    expect(adapted.vertexShader).not.toContain('float gBend = gT * gT;');
    expect(adapted.uniforms.uTime).toBe(time); expect(adapted.uniforms.uFamilyMiddle).toBe(system.middleRange);
    expect(adapted.fragmentShader).toBe(original.fragmentShader);
    system.dispose(); material.dispose();
  });
});
