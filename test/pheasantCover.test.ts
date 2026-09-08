import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { PheasantCoverSystem } from '../src/three/subsystems/pheasantCover';

describe('Pheasant close ground layer', () => {
  it('culls remote litter and releases instance and shared resources on leaving the field', () => {
    const landscape = new LandscapeModel(getArea('pheasant-coverts'));
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), quality: 'lite', time: 0 } as Ctx;
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
