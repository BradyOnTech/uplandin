import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { pheasantFields, pheasantHarvestAt, pheasantCoverFringeAt } from '../src/three/subsystems/pheasantLandscape';
import { PheasantCoverSystem } from '../src/three/subsystems/pheasantCover';

describe('Pheasant close ground layer', () => {
  it('culls remote litter and releases instance and shared resources on leaving the field', () => {
    const landscape = new LandscapeModel(getArea('pheasant-coverts'));
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite', time: 0, events: new EventTarget(), get: () => ({ huntState: () => ({ wind: 0, windStrength: 'breezy' }) }) } as unknown as Ctx;
    const cover = new PheasantCoverSystem(landscape);
    cover.init(ctx);
    const meshes = ctx.scene.children as THREE.InstancedMesh[];
    const litter = meshes.filter(mesh => mesh.name === 'Pheasant litter parcel');
    expect(litter.length).toBeGreaterThan(0);
    const nearby = litter.filter(mesh => mesh.visible);
    expect(nearby.length).toBeGreaterThan(0);
    expect(nearby.length).toBeLessThan(litter.length / 10);
    const triangles = nearby.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.getAttribute('position').count / 3, 0);
    expect(triangles).toBeLessThan(15000);
    ctx.camera.position.set(10000, 0, 10000); cover.update(ctx);
    expect(litter.every(mesh => !mesh.visible)).toBe(true);
    ctx.camera.position.set(0, 0, 0); cover.update(ctx);
    expect(litter.filter(mesh => mesh.visible)).toEqual(nearby);
    const geometries = new Set(meshes.map(mesh => mesh.geometry));
    const materials = new Set(meshes.map(mesh => mesh.material as THREE.Material));
    let instanceDisposals = 0, geometryDisposals = 0, materialDisposals = 0;
    for (const mesh of meshes) mesh.addEventListener('dispose', () => instanceDisposals++);
    for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
    for (const material of materials) material.addEventListener('dispose', () => materialDisposals++);
    const count = meshes.length;
    cover.dispose(ctx);
    expect(ctx.scene.children).toHaveLength(0);
    expect(instanceDisposals).toBe(count);
    expect(geometryDisposals).toBe(geometries.size);
    expect(materialDisposals).toBe(materials.size);
  });
});


describe('Pheasant standing habitat', () => {
  it('preserves tall stand placement on lite and simplifies distant blades without removing plants', () => {
    const stands: string[] = [];
    for (const quality of ['high', 'lite'] as const) {
      const landscape = new LandscapeModel(getArea('pheasant-coverts'));
      const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality, time: 0, events: new EventTarget(), get: () => ({ huntState: () => ({ wind: 0, windStrength: 'breezy' }) }) } as unknown as Ctx;
      const cover = new PheasantCoverSystem(landscape);
      cover.init(ctx);
      const prairie = (ctx.scene.children as THREE.InstancedMesh[]).filter(mesh => mesh.name === 'Pheasant prairie parcel');
      const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      const roots: string[] = [];
      let tallMesh: THREE.InstancedMesh | undefined;
      let minimumHeightScale = Infinity, mixedVergeRoots = 0;
      const fields = pheasantFields(landscape.area), property = { x: 0, y: 0 };
      for (const mesh of prairie) for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
        if (scale.y / scale.x < 1.19) {
          landscape.worldToProperty(position.x, position.z, property);
          if (pheasantHarvestAt(landscape.area, property.x, property.y, fields) > .65 &&
            pheasantCoverFringeAt(landscape.area, property.x, property.y) > .02) mixedVergeRoots++;
          continue;
        }
        minimumHeightScale = Math.min(minimumHeightScale, scale.y);
        roots.push(`${position.x},${position.z},${scale.y}`);
        tallMesh ??= mesh;
      }
      expect(mixedVergeRoots, 'Fringe grass must survive into partially harvested ground').toBeGreaterThan(10);
      expect(roots.length).toBeGreaterThan(20000);
      expect(minimumHeightScale).toBeGreaterThan(1.35);
      // Spatial batches can be enumerated differently by tier; compare every
      // complete root/height tuple, including duplicates, independent of order.
      stands.push(roots.sort().join(';'));
      expect(tallMesh).toBeDefined();
      const mesh = tallMesh!;
      ctx.camera.position.copy(mesh.boundingSphere!.center); cover.update(ctx);
      const near = mesh.geometry.getAttribute('position').count;
      const assertFold = () => {
        // Two culm triangles precede the leaf. Its left/right root faces
        // now meet at a shallow ridge instead of sharing one sheet normal.
        const normal=mesh.geometry.getAttribute('normal');
        const left=new THREE.Vector3().fromBufferAttribute(normal,9);
        const right=new THREE.Vector3().fromBufferAttribute(normal,15);
        expect(left.dot(right)).toBeLessThan(.99);
        expect(left.dot(right)).toBeGreaterThan(.5);
      };
      assertFold();
      const count = mesh.count;
      const center = ctx.camera.position.clone();
      ctx.camera.position.x = mesh.boundingBox!.max.x + 29; cover.update(ctx);
      const middle = mesh.geometry.getAttribute('position').count;
      const middleNormals=mesh.geometry.getAttribute('normal');
      expect(new THREE.Vector3().fromBufferAttribute(middleNormals,6)
        .dot(new THREE.Vector3().fromBufferAttribute(middleNormals,9))).toBeCloseTo(1,5);
      expect(middle).toBeLessThan(near);
      ctx.camera.position.copy(center);
      ctx.camera.position.x += 120; cover.update(ctx);
      expect(mesh.visible).toBe(true);
      expect(mesh.geometry.getAttribute('position').count).toBeLessThan(near / 2);
      expect(mesh.geometry.getAttribute('position').count).toBeLessThan(middle);
      expect(mesh.count).toBe(count);
      cover.dispose(ctx);
    }
    expect(stands[1] === stands[0], 'Both tiers must retain identical tall habitat roots and heights').toBe(true);
  }, 15000); // Builds both full-property tiers; allow for concurrent suite workers.
});
