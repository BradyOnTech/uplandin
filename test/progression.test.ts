import { describe, expect, it } from 'vitest';
import { addDogToKennel, awardHunterXp, emptyCareer, setActiveDog, setBraceDog } from '../src/game/career';
import { getGun, GUNS, unlockedGuns } from '../src/game/guns';
import {
  gearTierFor,
  hunterLevelForXp,
  hunterXpForLevel,
  kennelSlots,
  truckUnlocked,
  twoDogUnlocked,
  unlocksAtLevel,
} from '../src/game/progression';

describe('guns', () => {
  it('match the design table', () => {
    expect(GUNS.map((g) => [g.shells, g.cooldownMs, g.spread, g.unlockLevel])).toEqual([
      [3, 500, 14, 1],
      [3, 250, 14, 3],
      [2, 0, 16, 5],
      [2, 0, 18, 8],
    ]);
  });

  it('unlock by hunter level, starter always available', () => {
    expect(unlockedGuns(1).map((g) => g.id)).toEqual(['remington-870']);
    expect(unlockedGuns(5).map((g) => g.id)).toEqual(['remington-870', 'semi-auto', 'over-under']);
    expect(unlockedGuns(10)).toHaveLength(4);
    expect(getGun('nope').id).toBe('remington-870');
  });
});

describe('hunter progression', () => {
  it('levels from xp with a cap of 10', () => {
    expect(hunterLevelForXp(0)).toBe(1);
    expect(hunterLevelForXp(hunterXpForLevel(1))).toBe(2);
    expect(hunterLevelForXp(1e9)).toBe(10);
  });

  it('the truck opens at level 2, gear and kennel grow with levels', () => {
    expect(truckUnlocked(1)).toBe(false);
    expect(truckUnlocked(2)).toBe(true);
    expect([1, 3, 6, 9].map(gearTierFor)).toEqual([0, 1, 2, 3]);
    expect([1, 4, 7].map(kennelSlots)).toEqual([1, 3, 5]);
  });

  it('every unlock is announced at some level', () => {
    const all = Array.from({ length: 10 }, (_, i) => unlocksAtLevel(i + 1)).flat();
    expect(all.join(' ')).toContain('truck');
    expect(all.join(' ')).toContain('Browning A5');
    expect(all.join(' ')).toContain('RFM Venus');
    expect(all.join(' ')).toContain('Beretta 686 Silver Pigeon');
    expect(all.join(' ')).toContain('beeper');
    expect(all.join(' ')).toContain('GPS + map');
    expect(all.join(' ')).toContain('dog box');
    expect(unlocksAtLevel(1)).toEqual([]); // nothing to announce at the start
  });
});

describe('awardHunterXp', () => {
  it('accumulates and levels up', () => {
    let c = emptyCareer();
    const res = awardHunterXp(c, hunterXpForLevel(1)); // exactly level 2
    expect(res.newLevel).toBe(2);
    expect(res.levelsGained).toBe(1);
    expect(res.career.hunter.xp).toBe(hunterXpForLevel(1));
    c = res.career;
    expect(awardHunterXp(c, 0).career).toBe(c); // zero is a no-op
  });

  it('does not mutate the input career', () => {
    const c = emptyCareer();
    awardHunterXp(c, 50);
    expect(c.hunter.xp).toBe(0);
  });
});

describe('setActiveDog', () => {
  it('switches among kennel dogs and ignores strangers', () => {
    const { career: c1, dog: first } = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    const { career: c2, dog: second } = addDogToKennel(c1, 'Boone', 'vizsla');
    expect(c2.activeDogId).toBe(first.id);
    const switched = setActiveDog(c2, second.id);
    expect(switched.activeDogId).toBe(second.id);
    expect(setActiveDog(switched, 'stray')).toBe(switched);
  });
});

describe('the brace', () => {
  it('unlocks with the big dog box', () => {
    expect(twoDogUnlocked(6)).toBe(false);
    expect(twoDogUnlocked(7)).toBe(true);
  });

  it('marks and clears a bracemate; the lead dog cannot brace itself', () => {
    const { career: c1 } = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    const { career: c2, dog: second } = addDogToKennel(c1, 'Boone', 'vizsla');
    expect(setBraceDog(c2, c2.activeDogId!)).toBe(c2); // lead can't brace itself
    const braced = setBraceDog(c2, second.id);
    expect(braced.braceDogId).toBe(second.id);
    expect(setBraceDog(braced, second.id).braceDogId).toBeNull(); // toggle off
    expect(setBraceDog(braced, null).braceDogId).toBeNull();
    expect(setBraceDog(braced, 'stray')).toBe(braced);
  });

  it('promoting the bracemate to lead clears the brace', () => {
    const { career: c1 } = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    const { career: c2, dog: second } = addDogToKennel(c1, 'Boone', 'vizsla');
    const braced = setBraceDog(c2, second.id);
    const promoted = setActiveDog(braced, second.id);
    expect(promoted.activeDogId).toBe(second.id);
    expect(promoted.braceDogId).toBeNull();
  });
});
