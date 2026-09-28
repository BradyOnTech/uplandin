import { describe, expect, it } from 'vitest';
import { addDogToKennel, emptyCareer, type KennelDog } from '../src/game/career';
import { dogCareerProgress, hunterCareerProgress } from '../src/game/careerProgress';
import { commitCareerLoadout, careerPreparation } from '../src/game/huntPreparation';
import { settleCareerHunt } from '../src/game/huntResults';
import { createHunt } from '../src/game/state';
import { getArea } from '../src/game/areas';
import { mulberry32 } from '../src/game/math';
import { hunterXpForLevel } from '../src/game/progression';
import { xpForLevel } from '../src/game/breeds';
import { ageMult } from '../src/game/season';

const threshold = (level: number, cost: (level: number) => number) =>
  Array.from({ length: level - 1 }, (_, i) => cost(i + 1)).reduce((a, b) => a + b, 0);

describe('Career outlook from existing progression', () => {
  it('connects a settled outing to the next unlock and dog improvement without changing the save', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    career.hunter.xp = 9; dog.xp = 19;
    expect(hunterCareerProgress(career).nextUnlock).toEqual({ level: 2, labels: ['Truck · travel between regions'] });
    expect(dogCareerProgress(career, dog).progress?.remaining).toBe(1);
    const hunt = createHunt(getArea('quail-fields'), mulberry32(2)); hunt.dogWork[0].pointFlushes = 1;
    const result = settleCareerHunt(career, hunt, [dog]);
    const before = JSON.stringify(result.career);
    expect(hunterCareerProgress(result.career)).toMatchObject({ level: 2,
      progress: { earned: 1, required: 28, remaining: 27, nextLevel: 3 },
      nextUnlock: { level: 3, labels: ['Browning A5', 'beeper collar'] } });
    expect(dogCareerProgress(result.career, result.career.kennel[0])).toMatchObject({ level: 2,
      progress: { earned: 1, required: 57, remaining: 56, nextLevel: 3 },
      nextBenefit: 'Stronger scenting and steadier points' });
    expect(JSON.stringify(result.career)).toBe(before);
  });

  it('shows each wind-work transition only for the next actual level', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Scout', 'english-setter');
    dog.level = 3; dog.xp = threshold(4, xpForLevel) - 1;
    expect(dogCareerProgress(career, dog)).toMatchObject({ progress: { remaining: 1, nextLevel: 4 }, nextBenefit: 'More effective upwind scenting' });
    dog.level = 7; dog.xp = threshold(8, xpForLevel) - 1;
    expect(dogCareerProgress(career, dog)).toMatchObject({ progress: { remaining: 1, nextLevel: 8 }, nextBenefit: 'Less scent pressure on birds while searching' });
    dog.level = 8; dog.xp = threshold(8, xpForLevel);
    expect(dogCareerProgress(career, dog).nextBenefit).not.toContain('pressure');
  });

  it('follows projected lead and brace choices, not the previously saved active dog', () => {
    const first = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    const second = addDogToKennel(first.career, 'Wren', 'vizsla');
    second.career.hunter.level = 7;
    second.career.kennel[0].xp = 19; second.dog.level = 4; second.dog.xp = threshold(4, xpForLevel) + 10;
    const before = JSON.stringify(second.career);
    const projected = commitCareerLoadout(second.career, { activeDogId: second.dog.id, braceDogId: first.dog.id });
    expect(projected.ok).toBe(true); if (!projected.ok) return;
    const selection = careerPreparation(projected.career);
    expect(dogCareerProgress(second.career, selection.activeDog!)).toMatchObject({ name: 'Wren', level: 4, progress: { earned: 10 } });
    expect(dogCareerProgress(second.career, selection.braceDog!)).toMatchObject({ name: 'Sage', level: 1, progress: { remaining: 1 } });
    expect(JSON.stringify(second.career)).toBe(before);
  });

  it('explains the existing growing and aging pace effects without claiming nose decline', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    expect(ageMult(1)).toBeLessThan(1);
    expect(dogCareerProgress(career, dog).ageEffect).toContain('Still growing');
    career.date.season = 7;
    expect(dogCareerProgress(career, dog).ageEffect).toBeNull();
    career.date.season = 8;
    expect(ageMult(8)).toBeLessThan(1);
    expect(dogCareerProgress(career, dog)).toMatchObject({ ageLabel: 'slowing down · 8th season', ageEffect: 'Age lowers speed and stamina; scenting is unchanged.' });
  });

  it('does not invent a level or equipment reward after the cap', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    career.hunter.level = 9; career.hunter.xp = threshold(9, hunterXpForLevel);
    expect(hunterCareerProgress(career)).toMatchObject({ progress: { nextLevel: 10 }, nextUnlock: null });
    career.hunter.level = 10; career.hunter.xp = 100_000; dog.level = 10; dog.xp = 100_000;
    expect(hunterCareerProgress(career)).toMatchObject({ progress: null, nextUnlock: null });
    expect(dogCareerProgress(career, dog)).toMatchObject({ progress: null, nextBenefit: null });
  });

  it('renders incomplete legacy XP safely without repairing or downgrading the saved level', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    career.hunter.level = 4; career.hunter.xp = Number.NaN;
    const legacy = { ...dog, level: 3, xp: undefined, bornSeason: undefined } as unknown as KennelDog;
    expect(hunterCareerProgress(career)).toMatchObject({ level: 4, progress: { earned: 0 } });
    expect(dogCareerProgress(career, legacy)).toMatchObject({ level: 3, ageLabel: 'first season', progress: { earned: 0 } });
    expect(legacy.xp).toBeUndefined(); expect(legacy.level).toBe(3);
  });
});
