import { describe, expect, it } from 'vitest';
import { scatterRects, type Rect } from '../src/game/field';
import { mulberry32 } from '../src/game/math';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('different seeds diverge', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(Array.from({ length: 5 }, a)).not.toEqual(Array.from({ length: 5 }, b));
  });

  it('stays in [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('scatterRects', () => {
  const world: Rect = { x: 0, y: 0, w: 1200, h: 700 };
  const spec = { count: 25, minW: 60, maxW: 120, minH: 40, maxH: 80 };

  it('produces the requested count, sized per spec, inside the bounds', () => {
    const rects = scatterRects(world, spec, mulberry32(9));
    expect(rects).toHaveLength(25);
    for (const r of rects) {
      expect(r.w).toBeGreaterThanOrEqual(spec.minW);
      expect(r.w).toBeLessThanOrEqual(spec.maxW);
      expect(r.h).toBeGreaterThanOrEqual(spec.minH);
      expect(r.h).toBeLessThanOrEqual(spec.maxH);
      expect(r.x).toBeGreaterThanOrEqual(world.x);
      expect(r.y).toBeGreaterThanOrEqual(world.y);
      expect(r.x + r.w).toBeLessThanOrEqual(world.x + world.w);
      expect(r.y + r.h).toBeLessThanOrEqual(world.y + world.h);
    }
  });

  it('same seed lays out the same covert every time', () => {
    expect(scatterRects(world, spec, mulberry32(11))).toEqual(scatterRects(world, spec, mulberry32(11)));
  });
});
