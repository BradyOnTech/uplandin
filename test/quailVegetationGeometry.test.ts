import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { QUAIL_GRASS_TUFT_ROOTS, quailGrassClumpGeometry } from '../src/three/subsystems/quailGrass';
import { quailShrubGeometry } from '../src/three/subsystems/quailWoody';

describe('Quail vegetation silhouettes', () => {
  it.each([false, true])('retains the basal contacts and principal leaf/seed-head tips through every grass LOD (tall=%s)', (tall) => {
    const geometries = ['near', 'mid', 'far'].map(detail => quailGrassClumpGeometry(tall, detail as 'near' | 'mid' | 'far'));
    const contacts: string[][] = [], tips: string[][] = [];
    for (const geometry of geometries) {
      const p = geometry.getAttribute('position'), leaf = geometry.getAttribute('quailBlade');
      const roots = new Set<string>(), ends = new Set<string>();
      for (let i = 0; i < p.count; i++) {
        expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
        if (leaf.getW(i) === 0) {
          expect(p.getY(i)).toBe(0);
          expect(p.getX(i)).toBe(leaf.getX(i)); expect(p.getZ(i)).toBe(leaf.getY(i));
          roots.add(`${p.getX(i).toFixed(4)},${p.getZ(i).toFixed(4)}`);
        }
        // Every tier keeps the first three leaves, including their flower
        // heads. These anchors must not jump when the remaining leaves fade.
        if (leaf.getW(i) === 1 && leaf.getZ(i) % 16 < 3)
          ends.add(`${leaf.getZ(i)}:${p.getX(i)},${p.getY(i)},${p.getZ(i)}`);
      }
      contacts.push([...roots].sort()); tips.push([...ends].sort());
      expect(p.count / 3).toBeLessThanOrEqual(234);
    }
    expect(contacts[0]).toHaveLength(QUAIL_GRASS_TUFT_ROOTS.length);
    expect(contacts[1]).toEqual(contacts[0]); expect(contacts[2]).toEqual(contacts[0]);
    expect(tips[1]).toEqual(tips[0]); expect(tips[2]).toEqual(tips[0]);
    geometries.forEach(geometry => geometry.dispose());
  });

  it('keeps the shrub visibly open from both principal directions within its former geometry budget', () => {
    const geometry = quailShrubGeometry(), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material), ray = new THREE.Raycaster(); mesh.updateMatrixWorld(true);
    expect(geometry.getAttribute('position').count / 3).toBeLessThanOrEqual(406);
    for (const axis of ['x', 'z']) {
      let hit = 0, total = 0;
      for (let y = .15; y < .87; y += .07) for (let lateral = -.5; lateral < .52; lateral += .065) {
        ray.set(axis === 'x' ? new THREE.Vector3(-2, y, lateral) : new THREE.Vector3(lateral, y, -2),
          axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1));
        if (ray.intersectObject(mesh).length) hit++;
        total++;
      }
      // This checks actual triangle intersections, not a label on the mesh:
      // there must be a readable plant and open windows through its branches.
      expect(hit / total).toBeGreaterThan(.15); expect(hit / total).toBeLessThan(.55);
    }
    geometry.dispose(); material.dispose();
  });
});
