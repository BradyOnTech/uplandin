import { describe, expect, it } from 'vitest';
import { AREAS, areaBirdCount, getArea } from '../src/game/areas';
import { VIEWPORT } from '../src/game/field';

describe('areas', () => {
  it('have unique ids', () => {
    expect(new Set(AREAS.map((a) => a.id)).size).toBe(AREAS.length);
  });

  it('give every named location a stable, distinct terrain identity', () => {
    expect(new Set(AREAS.map((area) => area.terrain.seed)).size).toBe(AREAS.length);
    for (const area of AREAS) {
      expect(area.terrain.seed).toBeGreaterThan(0);
      expect(area.terrain.broadRelief).toBeGreaterThan(0);
      expect(area.dropPoints.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('give locations distinct access-road and drop-point geography', () => {
    const signatures = AREAS.map((area) => JSON.stringify({
      drops: area.dropPoints.map((drop) => drop.position),
      junctions: area.trails.map((trail) => trail.points.at(-1)),
    }));
    expect(new Set(signatures).size).toBe(AREAS.length);
  });

  it('worlds are bigger than the viewport', () => {
    for (const a of AREAS) {
      expect(a.world.w).toBeGreaterThan(VIEWPORT.w);
      expect(a.world.h).toBeGreaterThan(VIEWPORT.h);
    }
  });

  it('keep all cover inside the world', () => {
    for (const a of AREAS) {
      for (const p of a.patches) {
        expect(p.x).toBeGreaterThanOrEqual(a.world.x);
        expect(p.y).toBeGreaterThanOrEqual(a.world.y);
        expect(p.x + p.w).toBeLessThanOrEqual(a.world.x + a.world.w);
        expect(p.y + p.h).toBeLessThanOrEqual(a.world.y + a.world.h);
      }
    }
  });

  it('have sane bird configs, with stocking scaled to world size', () => {
    for (const a of AREAS) {
      const count = areaBirdCount(a);
      expect(count).toBeGreaterThanOrEqual(5);
      expect(count).toBeLessThanOrEqual(20);
      expect(a.patches.length).toBeGreaterThan(0);
      expect(a.speciesMix.length).toBeGreaterThan(0);
      for (const share of a.speciesMix) expect(share.weight).toBeGreaterThan(0);
    }
  });

  it('getArea falls back to the first area for unknown ids', () => {
    expect(getArea(AREAS[1].id)).toBe(AREAS[1]);
    expect(getArea('nope')).toBe(AREAS[0]);
  });
});
