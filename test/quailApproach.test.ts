import { expect, it } from 'vitest';
import { quailPointApproach } from '../src/game/quailApproach';

it('gives steadier dogs tighter approaches with stable, varied covey disposition', () => {
  const radii=new Set<number>();
  for(let covey=0;covey<20;covey++) {
    const puppy=quailPointApproach(covey,1.45,false);
    const steady=quailPointApproach(covey,.6,false);
    expect(steady.flushRadius).toBeGreaterThanOrEqual(8);
    expect(puppy.flushRadius).toBeLessThanOrEqual(18);
    expect(steady.flushRadius).toBeLessThan(puppy.flushRadius);
    expect(steady).toEqual(quailPointApproach(covey,.6,false));
    expect(steady.nerveScale).toBeGreaterThan(0);
    radii.add(steady.flushRadius);
  }
  expect(radii.size).toBe(20);
});
