import { describe, expect, it } from 'vitest';
import { rollWindStrength, windMults } from '../src/game/wind';

describe('wind strength', () => {
  it('rolls all three strengths across the range', () => {
    expect(rollWindStrength(() => 0.1)).toBe('calm');
    expect(rollWindStrength(() => 0.5)).toBe('breezy');
    expect(rollWindStrength(() => 0.9)).toBe('strong');
  });

  it('strong wind trades scent reach for jumpy birds', () => {
    const calm = windMults('calm');
    const strong = windMults('strong');
    expect(calm).toEqual({ scent: 1, nerve: 1, dogScent: 1 });
    expect(strong.scent).toBeGreaterThan(1); // dog smells farther
    expect(strong.nerve).toBeLessThan(1); // birds hold shorter
    expect(strong.dogScent).toBeGreaterThan(1); // birds smell the dog farther too
  });
});
