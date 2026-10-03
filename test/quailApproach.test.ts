import { expect, it } from 'vitest';
import { bobwhiteApproachNerveScale, quailPointApproach } from '../src/game/quailApproach';

it('gives steadier dogs tighter approaches with stable, varied covey disposition', () => {
  const radii=new Set<number>();
  for(let covey=0;covey<20;covey++) {
    const puppy=quailPointApproach(covey,1.45,false);
    const steady=quailPointApproach(covey,.6,false);
    // A quiet walk-in reaches the covey: a few strides out, never at the old 8-18 yards.
    expect(steady.flushRadius).toBeGreaterThanOrEqual(3.5);
    expect(puppy.flushRadius).toBeLessThanOrEqual(11);
    expect(steady.flushRadius).toBeLessThan(puppy.flushRadius);
    expect(steady).toEqual(quailPointApproach(covey,.6,false));
    expect(steady.nerveScale).toBeGreaterThan(0);
    radii.add(steady.flushRadius);
  }
  expect(radii.size).toBe(20);
});

it('keeps distant patience finite, ordered by difficulty, and full near the bird or while running', () => {
  for (const challenge of ['relaxed', 'balanced', 'wild'] as const) {
    const scales = [0, 16, 20, 26, 30, 1000].map(distance => bobwhiteApproachNerveScale(distance, false, challenge));
    expect(scales[0]).toBe(1);
    expect(scales[1]).toBe(1);
    expect(scales.every(scale => scale > 0 && scale <= 1)).toBe(true);
    expect(scales.every((scale, index) => index === 0 || scale <= scales[index - 1])).toBe(true);
    expect(scales.at(-1)).toBe(scales.at(-2));
    expect(bobwhiteApproachNerveScale(1000, true, challenge)).toBe(1);
  }
  expect(bobwhiteApproachNerveScale(30, false, 'relaxed')).toBeLessThan(bobwhiteApproachNerveScale(30, false, 'balanced'));
  expect(bobwhiteApproachNerveScale(30, false, 'balanced')).toBeLessThan(bobwhiteApproachNerveScale(30, false, 'wild'));
});
