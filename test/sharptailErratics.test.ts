import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSharptailErratic } from '../src/three/subsystems/sharptailErratics';

const material = new THREE.MeshLambertMaterial({ vertexColors: true });
const size = { width: 4.7, height: 2.3, depth: 3.6, seed: 1624 };
function rock(groundAt = (_x: number, _z: number) => 17) {
  const root = createSharptailErratic(material, groundAt, size);
  return { root, mesh: root.children[0] as THREE.Mesh<THREE.BufferGeometry> };
}

describe('Sharptail glacial erratics', () => {
  it('keeps authored dimensions, one solid mesh, and a small static geometry budget', () => {
    const { root, mesh } = rock();
    expect(root.children).toHaveLength(1);
    expect(mesh.material).toBe(material);
    expect(mesh.userData.shotSolid).toBe(true);
    const bounds = mesh.geometry.boundingBox!;
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(size.width, 5);
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(size.depth, 5);
    expect(bounds.max.y).toBeCloseTo(size.height, 5);
    expect(bounds.min.y).toBeLessThan(0);
    const faces = mesh.geometry.attributes.position.count / 3;
    expect(faces).toBeGreaterThanOrEqual(150);
    expect(faces).toBeLessThanOrEqual(700);
    expect(mesh.geometry.attributes.color.count).toBe(mesh.geometry.attributes.position.count);
    mesh.geometry.dispose();
  });

  it('buries the complete skirt on slopes without an elevated world-origin offset', () => {
    for (const grade of [-.35, .35]) {
      const { root, mesh } = rock((x, z) => 71 + x * grade + z * .19);
      const contacts = root.userData.contactFootprint as { x: number; z: number; groundY: number; bottomY: number }[];
      expect(contacts.length).toBeGreaterThan(8);
      // The buried foot carries the full stone width/depth. An inset foot
      // underneath a wider shoulder made the earlier asset look perched.
      expect(Math.max(...contacts.map(p => p.x)) - Math.min(...contacts.map(p => p.x))).toBeCloseTo(size.width, 5);
      expect(Math.max(...contacts.map(p => p.z)) - Math.min(...contacts.map(p => p.z))).toBeCloseTo(size.depth, 5);
      for (const p of contacts) {
        expect(p.groundY).toBeCloseTo(p.x * grade + p.z * .19);
        expect(p.bottomY).toBeLessThan(p.groundY - .09);
      }
      expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo(size.height, 5);
      mesh.geometry.dispose();
    }
  });

  it('is deterministic without repeating the same shape for different seeds', () => {
    const first = rock(), same = rock();
    const other = createSharptailErratic(material, () => 17, { ...size, seed: size.seed + 1 });
    const otherGeometry = (other.children[0] as THREE.Mesh).geometry;
    expect(first.mesh.geometry.attributes.position.array).toEqual(same.mesh.geometry.attributes.position.array);
    expect(first.mesh.geometry.attributes.color.array).toEqual(same.mesh.geometry.attributes.color.array);
    expect(first.mesh.geometry.attributes.position.array).not.toEqual(otherGeometry.attributes.position.array);
    first.mesh.geometry.dispose(); same.mesh.geometry.dispose(); otherGeometry.dispose();
  });

  it.each([21, 84, 33, 117, 53, 209, 71, 152, 312, 422, 617, 1624])('keeps fractured seed %s watertight with outward caps and a bounded budget', seed => {
    const root = createSharptailErratic(material, () => 17, { ...size, seed });
    const mesh = root.children[0] as THREE.Mesh<THREE.BufferGeometry>;
    const positions = mesh.geometry.attributes.position;
    const normals = mesh.geometry.attributes.normal;
    const edges = new Map<string, number>();
    const pointKey = (i: number) => [positions.getX(i), positions.getY(i), positions.getZ(i)].join(',');
    for (let i = 0; i < positions.count; i += 3) {
      for (let j = 0; j < 3; j++) {
        const a = pointKey(i + j), b = pointKey(i + (j + 1) % 3);
        const key = [a, b].sort().join('|');
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      const ys = [0, 1, 2].map(j => positions.getY(i + j));
      if (ys.every(y => y >= size.height * .98)) expect(normals.getY(i)).toBeGreaterThan(0);
      expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 5);
    }
    expect([...edges.values()].every(count => count === 2)).toBe(true);
    expect(positions.count / 3).toBeLessThanOrEqual(700);
    // The buried side faces can point outward/upward below y0. Check the
    // actual basal and top caps from outside with a front-side ray instead
    // of mistaking all underground faces for the bottom of the solid.
    mesh.updateMatrixWorld(true);
    const above = new THREE.Raycaster(new THREE.Vector3(0, size.height + 1, 0), new THREE.Vector3(0, -1, 0));
    const below = new THREE.Raycaster(new THREE.Vector3(0, mesh.geometry.boundingBox!.min.y - 1, 0), new THREE.Vector3(0, 1, 0));
    const topHit = above.intersectObject(mesh)[0], baseHit = below.intersectObject(mesh)[0];
    expect(topHit).toBeDefined(); expect(baseHit).toBeDefined();
    expect(topHit.face!.normal.y).toBeGreaterThan(0);
    expect(baseHit.face!.normal.y).toBeLessThan(0);
    mesh.geometry.dispose();
  });
});
