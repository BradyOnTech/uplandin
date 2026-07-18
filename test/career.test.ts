import { describe, expect, it } from 'vitest';
import {
  activeDog,
  addDogToKennel,
  awardDogXp,
  CAREER_KEY,
  emptyCareer,
  loadCareer,
  recordHunt,
  saveCareer,
  type StorageLike,
} from '../src/game/career';

function memStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('career', () => {
  it('starts empty with v2 defaults', () => {
    const c = emptyCareer();
    expect(c.version).toBe(2);
    expect(c.hunts).toBe(0);
    expect(c.kennel).toEqual([]);
    expect(c.activeDogId).toBeNull();
    expect(c.hunter.level).toBe(1);
    expect(c.hunter.shotgunId).toBe('remington-870');
    expect(c.regionsUnlocked).toEqual(['southern-plains']);
  });

  it('accumulates hunts and per-area bests', () => {
    let c = emptyCareer();
    c = recordHunt(c, 'quail-fields', 3, 2);
    c = recordHunt(c, 'quail-fields', 5, 1);
    c = recordHunt(c, 'grouse-woods', 1, 4);
    expect(c.hunts).toBe(3);
    expect(c.downed).toBe(9);
    expect(c.escaped).toBe(7);
    expect(c.areas['quail-fields']).toEqual({ hunts: 2, downed: 8, escaped: 3, best: 5 });
    expect(c.areas['grouse-woods'].best).toBe(1);
  });

  it('does not mutate the previous career', () => {
    const c0 = emptyCareer();
    const c1 = recordHunt(c0, 'quail-fields', 3, 2);
    expect(c0.hunts).toBe(0);
    expect(c1.hunts).toBe(1);
  });

  it('round-trips through storage', () => {
    const s = memStorage();
    const c = recordHunt(emptyCareer(), 'quail-fields', 4, 2);
    saveCareer(c, s);
    expect(loadCareer(s)).toEqual(c);
  });

  it('survives corrupt storage', () => {
    const s = memStorage();
    s.data[CAREER_KEY] = '{not json';
    expect(loadCareer(s)).toEqual(emptyCareer());
  });

  it('handles missing storage', () => {
    expect(loadCareer(null)).toEqual(emptyCareer());
    expect(() => saveCareer(emptyCareer(), null)).not.toThrow();
  });
});

describe('v1 migration', () => {
  it('carries v1 totals into the v2 shell', () => {
    const s = memStorage();
    s.data[CAREER_KEY] = JSON.stringify({
      hunts: 4,
      downed: 9,
      escaped: 7,
      areas: { 'quail-fields': { hunts: 4, downed: 9, escaped: 7, best: 5 } },
    });
    const c = loadCareer(s);
    expect(c.version).toBe(2);
    expect(c.hunts).toBe(4);
    expect(c.downed).toBe(9);
    expect(c.areas['quail-fields'].best).toBe(5);
    expect(c.kennel).toEqual([]);
    expect(c.hunter.level).toBe(1);
  });
});

describe('kennel', () => {
  it('adds a dog and makes the first one active', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    expect(dog).toMatchObject({ name: 'Millie', breedId: 'gsp', level: 1, xp: 0 });
    expect(career.kennel).toHaveLength(1);
    expect(career.activeDogId).toBe(dog.id);
    expect(activeDog(career)).toEqual(dog);
  });

  it('keeps the active dog when adding more', () => {
    const { career: c1, dog: first } = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    const { career: c2 } = addDogToKennel(c1, 'Boone', 'vizsla');
    expect(c2.kennel).toHaveLength(2);
    expect(c2.activeDogId).toBe(first.id);
  });
});

describe('dog xp', () => {
  it('awards xp and levels up', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    const res = awardDogXp(career, dog.id, 20); // exactly level 2
    expect(res.newLevel).toBe(2);
    expect(res.levelsGained).toBe(1);
    expect(res.career.kennel[0].xp).toBe(20);
  });

  it('handles multiple levels at once and respects the cap', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    const res = awardDogXp(career, dog.id, 100000);
    expect(res.newLevel).toBe(10);
    expect(res.levelsGained).toBe(9);
  });

  it('ignores unknown dogs and zero amounts', () => {
    const c = emptyCareer();
    expect(awardDogXp(c, 'nope', 50).career).toBe(c);
    expect(awardDogXp(c, 'nope', 0).levelsGained).toBe(0);
  });
});
