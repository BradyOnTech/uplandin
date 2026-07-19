import { describe, expect, it } from 'vitest';
import { CONDITIONS, conditionMults, rollCondition } from '../src/game/conditions';

describe('conditions', () => {
  it('mild is the baseline', () => {
    expect(conditionMults('mild')).toEqual({ scent: 1, nerve: 1, stamina: 1, search: 1 });
  });

  it('each day trades the right things', () => {
    const frost = conditionMults('frost');
    expect(frost.scent).toBeGreaterThan(1); // scent carries
    expect(frost.nerve).toBeGreaterThan(1); // birds sit
    const hot = conditionMults('hot');
    expect(hot.scent).toBeLessThan(1); // scent bakes off
    expect(hot.stamina).toBeGreaterThan(1); // the dog cooks
    const rain = conditionMults('rain');
    expect(rain.scent).toBeLessThan(1); // knocked down
    expect(rain.search).toBeGreaterThan(1); // falls are hard to find
    const snow = conditionMults('snow');
    expect(snow.nerve).toBeGreaterThan(1); // tight holds
    expect(snow.search).toBeLessThan(1); // easy marking in the white
  });

  it('rolls every condition across the range', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(rollCondition(() => i / 200));
    }
    for (const c of CONDITIONS) expect(seen.has(c)).toBe(true);
  });

  it('climate bias leans the roll', () => {
    expect(rollCondition(() => 0.1, 'hot')).toBe('hot'); // bias hits at 45%
    expect(rollCondition(() => 0.5, 'hot')).not.toBe('hot'); // past the bias, normal roll (0.5 → frost)
  });
});
