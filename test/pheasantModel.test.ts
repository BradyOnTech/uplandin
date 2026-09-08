import { describe, it, expect } from 'vitest';
import { buildPheasantBody, buildPheasantWing, buildPheasantTail } from '../src/three/assets/pheasant';

describe('shared pheasant geometry', () => {
  it('builds complete colored rooster and hen meshes within a small per-bird budget', () => {
    for (const hen of [false,true]) {
      const parts=[buildPheasantBody(hen),buildPheasantWing(-1,hen),buildPheasantWing(1,hen),buildPheasantTail(hen)];
      let triangles=0;
      for(const geo of parts) {
        const p=geo.attributes.position;
        expect(geo.attributes.color.count).toBe(p.count);
        expect(geo.attributes.normal.count).toBe(p.count);
        expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
        triangles+=(geo.index?.count ?? p.count)/3;
        geo.dispose();
      }
      expect(triangles).toBeLessThan(3000);
    }
  });
  it('gives the hen a shorter tail and mirrors the two flight wings', () => {
    const rooster=buildPheasantTail(),hen=buildPheasantTail(true);
    rooster.computeBoundingBox();hen.computeBoundingBox();
    expect(Math.abs(rooster.boundingBox!.min.z)).toBeGreaterThan(Math.abs(hen.boundingBox!.min.z)*1.4);
    const left=buildPheasantWing(-1),right=buildPheasantWing(1);
    left.computeBoundingBox();right.computeBoundingBox();
    expect(left.boundingBox!.min.x).toBeCloseTo(-right.boundingBox!.max.x,5);
    expect(left.boundingBox!.max.z).toBeCloseTo(right.boundingBox!.max.z,5);
    for(const geo of [rooster,hen,left,right])geo.dispose();
  });
});
