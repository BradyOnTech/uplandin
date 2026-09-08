import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createQuailTruck } from '../src/three/subsystems/quailLandmarks';

const models: THREE.Group[] = [];
function model(): THREE.Group {
  const root = createQuailTruck(); root.updateMatrixWorld(true); models.push(root); return root;
}
afterEach(() => {
  for (const root of models.splice(0)) root.traverse(o => {
    if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
  });
});

describe('Quail pickup shape and budget', () => {
  it('fits the approved prop budget after material consolidation', () => {
    const root = model(); let triangles = 0, bytes = 0;
    for (const child of root.children) {
      expect(child).toBeInstanceOf(THREE.Mesh);
      const geometry = (child as THREE.Mesh).geometry;
      triangles += geometry.index!.count / 3;
      bytes += geometry.index!.array.byteLength + Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0);
    }
    expect(triangles).toBeLessThanOrEqual(1800);
    expect(root.children.length).toBeLessThanOrEqual(11);
    expect(bytes).toBeLessThanOrEqual(120 * 1024);
  });

  it('rakes and narrows the actual windshield toward the roof', () => {
    const root = model();
    const mesh = root.children.find(o => ((o as THREE.Mesh).material as THREE.Material).name === 'Quail pickup glazing') as THREE.Mesh;
    const attribute = mesh.geometry.getAttribute('position');
    const windshield = Array.from({ length: attribute.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(attribute, i))
      .filter(p => p.z < -.78 && Math.abs(p.x) < .85);
    const low = Math.min(...windshield.map(p => p.y)), high = Math.max(...windshield.map(p => p.y));
    const bottom = windshield.filter(p => Math.abs(p.y - low) < 1e-5), top = windshield.filter(p => Math.abs(p.y - high) < 1e-5);
    expect(bottom).toHaveLength(2); expect(top).toHaveLength(2);
    expect(top[0].z - bottom[0].z).toBeGreaterThan(.25);
    expect(Math.abs(top[0].x)).toBeLessThan(Math.abs(bottom[0].x));
  });

  it('leaves real wheel-arch space in the outer body panels', () => {
    const root = model();
    const body = root.children.find(o => ((o as THREE.Mesh).material as THREE.Material).name === 'Quail pickup body') as THREE.Mesh;
    const ray = new THREE.Raycaster();
    for (const side of [-1, 1]) for (const axle of [-1.42, 1.53]) {
      // Between the tyre crown and arch: the old rectangular hood crossed
      // this ray at the exterior panel instead of leaving the opening.
      ray.set(new THREE.Vector3(side * 1.5, .935, axle), new THREE.Vector3(-side, 0, 0));
      for (const hit of ray.intersectObject(body)) expect(Math.abs(hit.point.x)).toBeLessThan(.92);
    }
  });
});
