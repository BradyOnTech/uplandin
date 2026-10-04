import { describe, expect, it } from 'vitest';
import { BREEDS, getBreed } from '../src/game/breeds';
import { addDogToKennel, awardDogXp, CAREER_KEY, emptyCareer, loadCareer } from '../src/game/career';
import { developDog, developedStats, developmentForLevel, DOG_SKILLS, readDevelopment, SKILL_XP_CAP } from '../src/game/dogDevelopment';
import { Dog } from '../src/game/dog';
import { settleCareerHunt } from '../src/game/huntResults';
import { createHunt, emptyDogWork } from '../src/game/state';
import { getArea } from '../src/game/areas';

describe('developing a dog toward breed potential', () => {
  it('caps each ability at its own breed potential, including after excessive awards', () => {
    for (const breed of BREEDS) {
      const result = developDog(developmentForLevel(1), { scent: 99999, steadiness: 99999, retrieving: 99999, handling: 99999, conditioning: 99999 });
      expect(developedStats(breed, result.development)).toEqual(breed.stats);
      expect(Object.values(result.development)).toEqual(DOG_SKILLS.map(() => SKILL_XP_CAP));
    }
  });
  it('keeps a general level-up from developing an unrelated ability', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    const leveled = awardDogXp(career, dog.id, 1000).career.kennel[0];
    expect(leveled.level).toBeGreaterThan(dog.level);
    expect(leveled.development).toEqual(dog.development);
    const practice = developDog(readDevelopment(dog.development), { steadiness: 40 });
    const before = new Dog({ x: 10, y: 10 }, { breed: getBreed('gsp'), level: 1, development: dog.development });
    const after = new Dog({ x: 10, y: 10 }, { breed: getBreed('gsp'), level: leveled.level, development: practice.development });
    expect(after.pressure).toBeLessThan(before.pressure);
    expect(after.rangeRadius).toBe(before.rangeRadius);
    expect(after.maxStaminaMs).toBe(before.maxStaminaMs);
    expect(after.scentLevel).toBe(before.scentLevel);
  });
  it('migrates legacy dogs without losing their established scent, range, stamina or steadiness', () => {
    for (const level of [1, 4, 8, 10]) {
      const { career, dog } = addDogToKennel(emptyCareer(), 'Old Sage', 'gsp');
      delete dog.development; dog.level = level;
      const saved = JSON.stringify(career), migrated = loadCareer({ getItem: key => key === CAREER_KEY ? saved : null, setItem() {} });
      const old = new Dog({ x: 0, y: 0 }, { breed: getBreed('gsp'), level });
      const restored = new Dog({ x: 0, y: 0 }, { breed: getBreed('gsp'), level, development: migrated.kennel[0].development });
      expect(restored.pressure).toBeCloseTo(old.pressure);
      expect(restored.rangeRadius).toBeCloseTo(old.rangeRadius);
      expect(restored.maxStaminaMs).toBeCloseTo(old.maxStaminaMs);
      expect(restored.scentLevel).toBeCloseTo(level);
    }
  });
  it('develops abilities from actual hunting work and preserves other skills', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    const hunt = createHunt(getArea('quail-fields'));
    hunt.dogWork = [{ ...emptyDogWork(), points: 2, pointFlushes: 2, retrieves: 0, activeWorkMs: 120000 }];
    const result = settleCareerHunt(career, hunt, [dog]);
    const developed = result.career.kennel[0].development!;
    expect(developed.scent).toBeGreaterThan(0); expect(developed.steadiness).toBeGreaterThan(0);
    expect(developed.conditioning).toBeGreaterThan(0); expect(developed.retrieving).toBe(0);
  });
  it('repairs individual corrupt skills without removing a saved dog', () => {
    expect(readDevelopment({ scent: Infinity, steadiness: -1, retrieving: 999, handling: 'bad', conditioning: 0 }, 4))
      .toEqual({ ...developmentForLevel(4), steadiness: 0, retrieving: SKILL_XP_CAP, conditioning: 0 });
  });
});
