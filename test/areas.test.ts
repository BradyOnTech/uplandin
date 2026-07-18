import { describe, expect, it } from 'vitest';
import { AREAS, getArea } from '../src/game/areas';
import { FIELD_BOUNDS } from '../src/game/field';

describe('areas', () => {
  it('have unique ids', () => {
    expect(new Set(AREAS.map((a) => a.id)).size).toBe(AREAS.length);
  });

  it('keep all cover inside the field', () => {
    for (const a of AREAS) {
      for (const p of a.patches) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(FIELD_BOUNDS.w);
        expect(p.y + p.h).toBeLessThanOrEqual(FIELD_BOUNDS.h);
      }
    }
  });

  it('have sane bird configs', () => {
    for (const a of AREAS) {
      expect(a.birdCount).toBeGreaterThan(0);
      expect(a.coveyMaxSize).toBeGreaterThanOrEqual(1);
      expect(a.runnerChance).toBeGreaterThanOrEqual(0);
      expect(a.runnerChance).toBeLessThanOrEqual(1);
      expect(a.nerveMinMs).toBeLessThanOrEqual(a.nerveMaxMs);
      expect(a.patches.length).toBeGreaterThan(0);
    }
  });

  it('getArea falls back to the first area for unknown ids', () => {
    expect(getArea(AREAS[1].id)).toBe(AREAS[1]);
    expect(getArea('nope')).toBe(AREAS[0]);
  });
});
