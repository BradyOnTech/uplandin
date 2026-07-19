import { describe, expect, it } from 'vitest';
import {
  activeDog,
  addDogToKennel,
  advanceCareerWeeks,
  awardDogXp,
  CAREER_KEY,
  dogAge,
  emptyCareer,
  loadCareer,
  recordHunt,
  rollToNextSeason,
  saveCareer,
  setHomeRegion,
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

describe('seasons in the career', () => {
  it('starts in week 0 of season 1 with no home chosen', () => {
    const c = emptyCareer();
    expect(c.date).toEqual({ season: 1, week: 0 });
    expect(c.homeRegionId).toBeNull();
  });

  it('hunts move the calendar; summer rolls the season and ages the dogs', () => {
    let { career: c, dog } = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    c = setHomeRegion(c, 'southern-plains');
    expect(dog.bornSeason).toBe(1);
    expect(dogAge(c, dog)).toBe(1);
    c = advanceCareerWeeks(c, 22);
    expect(c.date.week).toBe(22);
    c = rollToNextSeason(c);
    expect(c.date).toEqual({ season: 2, week: 0 });
    expect(dogAge(c, c.kennel[0])).toBe(2);
    // A pup raised in season 3 is younger than the old dog.
    c = rollToNextSeason(c);
    const { career: c2, dog: pup } = addDogToKennel(c, 'Boone', 'vizsla');
    expect(pup.bornSeason).toBe(3);
    expect(dogAge(c2, pup)).toBe(1);
    expect(dogAge(c2, c2.kennel[0])).toBe(3);
  });

  it('pre-season v2 saves gain a calendar and season-1 dogs', () => {
    const s = memStorage();
    const old = { ...emptyCareer(), kennel: [{ id: 'dog-1', name: 'Rex', breedId: 'gsp', level: 4, xp: 100 }] };
    delete (old as Record<string, unknown>).date;
    delete (old as Record<string, unknown>).homeRegionId;
    delete ((old.kennel as Record<string, unknown>[])[0] as Record<string, unknown>).bornSeason;
    s.data[CAREER_KEY] = JSON.stringify(old);
    const c = loadCareer(s);
    expect(c.date).toEqual({ season: 1, week: 0 });
    expect(c.homeRegionId).toBeNull();
    expect(c.kennel[0].bornSeason).toBe(1);
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
