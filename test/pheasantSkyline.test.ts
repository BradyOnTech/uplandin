import { describe, expect, it } from 'vitest';
import { samplePheasantSkyline } from '../src/three/pheasantSkyline';

describe('Pheasant prairie backdrop', () => {
  it('joins cleanly behind the hunter and repeats through full turns', () => {
    for (let layer = 0; layer < 3; layer++) {
      for (const angle of [-Math.PI, -.7, 0, 1.4, Math.PI]) {
        const sample = samplePheasantSkyline(layer, angle);
        for (const turn of [-2, -1, 1, 2]) {
          const repeated = samplePheasantSkyline(layer, angle + turn * Math.PI * 2);
          expect(repeated.ground).toBeCloseTo(sample.ground, 9);
          expect(repeated.crest).toBeCloseTo(sample.crest, 9);
        }
      }
      const left = samplePheasantSkyline(layer, Math.PI - 1e-6);
      const right = samplePheasantSkyline(layer, -Math.PI + 1e-6);
      expect(left.crest).toBeCloseTo(right.crest, 6);
    }
  });

  it('keeps an open low prairie horizon with separated shelterbelts', () => {
    const radii = [420, 750, 1200];
    for (let layer = 0; layer < 3; layer++) {
      let wooded = 0;
      for (let degrees = 0; degrees < 360; degrees++) {
        const sample = samplePheasantSkyline(layer, degrees * Math.PI / 180);
        expect(sample.crest).toBeGreaterThanOrEqual(sample.ground);
        expect(sample.ground).toBeGreaterThanOrEqual(0);
        // This is a decorative prairie silhouette, never a mountain wall.
        expect(Math.atan2(sample.crest, radii[layer]) * 180 / Math.PI).toBeLessThan(4);
        if (sample.crown > 0) wooded++;
      }
      if (layer < 2) {
        expect(wooded).toBeGreaterThan(60);
        expect(wooded).toBeLessThan(170);
      } else expect(wooded).toBe(0);
    }
  });
});
