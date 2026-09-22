import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { QUAIL_CASTING_OPENINGS, QUAIL_COVERTS, quailCoverPatches, quailOpeningAt, quailPlumAt } from '../src/game/quailComposition';
import { quailCoverAt } from '../src/game/quailLandscape';
import { quailKitOccupies, quailKitPlacements } from '../src/three/subsystems/quailKit';
import { quailTrackDistanceAt } from '../src/three/subsystems/quailTracks';

const area = getArea('quail-fields');

describe('Quail shared covert composition', () => {
  it('keeps each visible refuge spine inside authoritative hunting habitat', () => {
    expect(area.patches).toEqual(quailCoverPatches());
    expect(area.patches.slice(-2)).toEqual([
      { x: 469, y: 572, w: 70, h: 52 }, { x: 76, y: 371, w: 58, h: 70 },
    ]);
    for (const covert of QUAIL_COVERTS) for (let i = 1; i < covert.points.length; i++) {
      const a = covert.points[i - 1], b = covert.points[i];
      for (let n = 0; n <= 8; n++) {
        const x = a.x + (b.x - a.x) * n / 8, y = a.y + (b.y - a.y) * n / 8;
        expect(quailPlumAt(x, y)).toBeCloseTo(1);
        expect(quailCoverAt(area, x, y)).toBe(1);
      }
    }
    // Consumers receive independent patch objects, not mutable shared authoring.
    const first = quailCoverPatches(); first[0].x = -500;
    expect(quailCoverPatches()[0].x).toBeGreaterThan(0);
  });

  it('leaves broad casting openings and no refuge at either truck', () => {
    for (const opening of QUAIL_CASTING_OPENINGS) {
      expect(quailOpeningAt(opening.x, opening.y)).toBe(1);
      expect(quailPlumAt(opening.x, opening.y)).toBeLessThan(.1);
    }
    for (const drop of area.dropPoints) {
      expect(quailPlumAt(drop.position.x, drop.position.y)).toBe(0);
      expect(quailKitOccupies(area, drop.position.x, drop.position.y)).toBe(false);
    }
    for (let y = 0; y <= 700; y += 19) for (let x = 0; x <= 1200; x += 23) {
      const p = quailPlumAt(x, y), opening = quailOpeningAt(x, y);
      expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1);
      expect(opening).toBeGreaterThanOrEqual(0); expect(opening).toBeLessThanOrEqual(1);
      if (p > 0) expect(quailCoverAt(area, x, y)).toBe(1);
    }
  });

  it('extends a bounded accepted asset kit around the working loop with clear access', () => {
    const placements = quailKitPlacements(area);
    expect(placements.length).toBeGreaterThan(80);
    expect(placements.length).toBeLessThanOrEqual(126);
    for (const covert of QUAIL_COVERTS) {
      expect(placements.some(p => covert.points.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 16)), covert.id).toBe(true);
    }
    for (const p of placements) {
      expect(quailCoverAt(area, p.x, p.y)).toBeGreaterThanOrEqual(.9);
      expect(quailTrackDistanceAt(area, p.x, p.y, 16)).toBeGreaterThanOrEqual(5);
      expect(quailOpeningAt(p.x, p.y)).toBeLessThanOrEqual(.3);
      expect(quailKitOccupies(area, p.x, p.y)).toBe(true);
    }
    expect(quailKitPlacements(area)).toEqual(placements);
  });
});
