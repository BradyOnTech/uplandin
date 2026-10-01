import { describe, expect, it } from 'vitest';
import { LOOK_IDS, LOOKS, resolveLook } from '../src/three/looks';

describe('look development settings', () => {
  it('opts in only for a named look', () => {
    for (const id of LOOK_IDS) expect(resolveLook(id)).toBe(id);
    expect(resolveLook(null)).toBeNull();
    expect(resolveLook('')).toBeNull();
    expect(resolveLook('today')).toBeNull();
    expect(resolveLook('Golden')).toBeNull();
  });

  it.each(LOOK_IDS)('keeps %s inside ranges that read as a grade, not a filter', id => {
    const look = LOOKS[id];
    expect(look.label.length).toBeGreaterThan(0);
    expect(look.ao.radius).toBeGreaterThan(.3); expect(look.ao.radius).toBeLessThan(2);
    expect(look.ao.strength).toBeGreaterThanOrEqual(0); expect(look.ao.strength).toBeLessThanOrEqual(1);
    expect(look.ao.maxDistance).toBeGreaterThan(40);
    expect(look.haze.density).toBeGreaterThanOrEqual(0); expect(look.haze.density).toBeLessThan(.01);
    expect(look.haze.falloff).toBeGreaterThan(0);
    expect(look.bloom.threshold).toBeGreaterThan(.5);
    expect(look.bloom.strength).toBeLessThan(1);
    const g = look.grade;
    expect(g.saturation).toBeGreaterThan(.7); expect(g.saturation).toBeLessThan(1.4);
    expect(g.contrast).toBeGreaterThan(.8); expect(g.contrast).toBeLessThan(1.3);
    expect(g.vignette).toBeGreaterThanOrEqual(0); expect(g.vignette).toBeLessThan(.4);
    for (const triple of [g.whiteBalance, g.slope, g.offset, g.power, g.shadowTint, g.highlightTint, look.haze.tint]) {
      expect(triple).toHaveLength(3);
      for (const value of triple) expect(Number.isFinite(value)).toBe(true);
    }
    for (const value of [...g.offset, ...g.shadowTint, ...g.highlightTint]) expect(Math.abs(value)).toBeLessThan(.06);
  });
});
