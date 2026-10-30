import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { kitCulmGeometry, kitMassGeometry, kitMatGeometry, kitStandGeometry, kitTuftGeometry } from '../src/three/groundKit/kitGeometry';
import { lattice } from '../src/three/groundKit/groundKitSystem';

const triangles = (g: THREE.BufferGeometry) => g.getAttribute('position').count / 3;
const heights = (g: THREE.BufferGeometry) => {
  const p = g.getAttribute('position');
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < p.count; i++) { min = Math.min(min, p.getY(i)); max = Math.max(max, p.getY(i)); }
  return { min, max };
};

describe('ground kit geometry', () => {
  // Unit height, so instances scale to the cover map's crown height and
  // position.y doubles as the wind bend weight.
  const pieces: [string, THREE.BufferGeometry, number][] = [
    ['tuft', kitTuftGeometry(7), 40], ['mat', kitMatGeometry(6), 26], ['culm', kitCulmGeometry(3), 8],
    ['mass', kitMassGeometry(6), 48], ['tall mass', kitMassGeometry(7), 56], ['stand', kitStandGeometry(14, 16), 32],
  ];
  for (const [name, geometry, budget] of pieces) {
    it(`keeps the ${name} at unit height, rooted, within ${budget} triangles`, () => {
      const { min, max } = heights(geometry);
      expect(min).toBeGreaterThanOrEqual(-.06);
      expect(min).toBeLessThan(.01);
      expect(max).toBeGreaterThan(.6);
      expect(max).toBeLessThan(1.35);
      expect(triangles(geometry)).toBeLessThanOrEqual(budget);
      geometry.dispose();
    });
  }

  it('gives each chunk an exact share of the planting lattice', () => {
    const seen = new Set<string>();
    let total = 0;
    for (const x0 of [0, 12, 24]) for (const y0 of [0, 12]) for (const [ix, iy] of lattice(x0, y0, 12, .62)) {
      const key = `${ix},${iy}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key); total++;
    }
    expect(total).toBe(Math.ceil(36 / .62) * Math.ceil(24 / .62));
  });
});
