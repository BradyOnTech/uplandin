import { describe, expect, it } from 'vitest';
import {
  BREEDS,
  breakChance,
  creepChance,
  dogScentRadius,
  getBreed,
  growthMult,
  LEVEL_CAP,
  levelForXp,
  noseMult,
  pointPressure,
  statMult,
  windCraftTier,
  xpForLevel,
} from '../src/game/breeds';

const gsp = getBreed('gsp');
const irish = getBreed('irish-setter');

describe('breed configs', () => {
  it('have unique ids and legal stats', () => {
    expect(new Set(BREEDS.map((b) => b.id)).size).toBe(BREEDS.length);
    for (const b of BREEDS) {
      for (const v of Object.values(b.stats)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(5);
      }
      const total = Object.values(b.stats).reduce((a, c) => a + c, 0);
      expect(total).toBeLessThanOrEqual(21); // no strictly-dominant breed
      expect(b.xpRate).toBeGreaterThan(0);
    }
  });

  it('covers all 11 planned breeds', () => {
    expect(BREEDS).toHaveLength(11);
  });
});

describe('stat math', () => {
  it('maps ratings to multipliers', () => {
    expect(statMult(1)).toBeCloseTo(0.9);
    expect(statMult(3)).toBeCloseTo(1.1);
    expect(statMult(5)).toBeCloseTo(1.3);
  });

  it('caps level growth at +40%', () => {
    expect(growthMult(gsp, 1, 'nose')).toBe(1);
    expect(growthMult(gsp, LEVEL_CAP, 'nose')).toBeLessThanOrEqual(1.4);
    expect(growthMult(gsp, LEVEL_CAP, 'range')).toBeLessThanOrEqual(1.4);
  });

  it('puppy noses mature with level', () => {
    expect(noseMult(gsp, 1)).toBeLessThan(noseMult(gsp, LEVEL_CAP));
    expect(noseMult(gsp, 1)).toBeLessThan(statMult(gsp.stats.nose)); // immature
    expect(noseMult(gsp, LEVEL_CAP)).toBeGreaterThan(statMult(gsp.stats.nose)); // grown past rating
  });
});

describe('puppy mistakes', () => {
  it('soft breeds creep more, and all improve with level', () => {
    expect(creepChance(irish, 1)).toBeGreaterThan(creepChance(gsp, 1));
    expect(creepChance(gsp, 1)).toBeGreaterThan(creepChance(gsp, LEVEL_CAP));
    expect(creepChance(irish, LEVEL_CAP)).toBeLessThan(0.03);
  });

  it('puppies pressure pointed birds, veterans give room', () => {
    expect(pointPressure(irish, 1)).toBeCloseTo(1.45, 2);
    expect(pointPressure(gsp, LEVEL_CAP)).toBeLessThan(1);
    expect(pointPressure(gsp, LEVEL_CAP)).toBeGreaterThanOrEqual(0.6);
  });

  it('soft breeds break chase more, and all improve with level', () => {
    expect(breakChance(irish, 1)).toBeGreaterThan(breakChance(gsp, 1));
    expect(breakChance(gsp, 1)).toBeGreaterThan(breakChance(gsp, LEVEL_CAP));
  });
});

describe('wind craft', () => {
  it('tiers by level', () => {
    expect(windCraftTier(1)).toBe(0);
    expect(windCraftTier(4)).toBe(1);
    expect(windCraftTier(8)).toBe(2);
    expect(dogScentRadius(1)).toBe(30);
    expect(dogScentRadius(5)).toBe(15);
    expect(dogScentRadius(10)).toBe(0);
  });
});

describe('xp', () => {
  it('level thresholds increase', () => {
    expect(xpForLevel(1)).toBe(20);
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
  });

  it('computes level from total xp', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(19)).toBe(1);
    expect(levelForXp(20)).toBe(2);
    expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(LEVEL_CAP);
  });
});
