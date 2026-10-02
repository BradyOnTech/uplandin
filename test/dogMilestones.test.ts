import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import {
  activeDog, addDogToKennel, awaitsFirstPoint, canNameLastSeason, CAREER_KEY, emptyCareer, inLastSeason, isRetired, loadCareer,
  recordDogHunt, rollToNextSeason, seasonsHunted, setActiveDog, setHomeRegion, setLastSeason, workingDogs, type StorageLike,
} from '../src/game/career';
import { careerPreparation, commitCareerLoadout } from '../src/game/huntPreparation';
import { formatHuntJournalEntry, sanitizeHuntJournal } from '../src/game/huntJournal';
import { settleCareerHunt } from '../src/game/huntResults';
import { mulberry32 } from '../src/game/math';
import { createHunt } from '../src/game/state';
import { LandscapeModel } from '../src/game/landscape';
import { parseDropPointId, resolveThreeHuntArea } from '../src/game/gameplayMode';
import { careerFieldNotes } from '../src/three/fieldNotes';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';
import type { Ctx } from '../src/three/engine';

const at = { huntNumber: 1, areaId: 'quail-fields', season: 1 };
const memory = (entries: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => ({
  data: entries, getItem(key) { return this.data[key] ?? null; }, setItem(key, value) { this.data[key] = value; },
});

describe('a pup\'s first point', () => {
  it('is recorded once, with the dog\'s running totals', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    expect(awaitsFirstPoint(dog)).toBe(true);
    // A hunt with retrieves but no point is not the day.
    const quiet = recordDogHunt(career, dog.id, { points: 0, retrieves: 1 }, at);
    expect(quiet.firstPoint).toBe(false);
    expect(quiet.career.kennel[0]).toMatchObject({ lifetime: { hunts: 1, points: 0, retrieves: 1 } });
    expect(awaitsFirstPoint(quiet.career.kennel[0])).toBe(true);
    const first = recordDogHunt(quiet.career, dog.id, { points: 2, retrieves: 1 }, { ...at, huntNumber: 2 });
    expect(first.firstPoint).toBe(true);
    expect(first.career.kennel[0]).toMatchObject({ firstPoint: { huntNumber: 2, areaId: 'quail-fields', season: 1 },
      lifetime: { hunts: 2, points: 2, retrieves: 2 } });
    const later = recordDogHunt(first.career, dog.id, { points: 3, retrieves: 0 }, { ...at, huntNumber: 3 });
    expect(later.firstPoint).toBe(false);
    expect(later.career.kennel[0].firstPoint?.huntNumber).toBe(2);
    expect(later.career.kennel[0].lifetime).toEqual({ hunts: 3, points: 5, retrieves: 2 });
  });

  it('is never claimed for a seasoned dog from an older save', () => {
    const { dog } = addDogToKennel(emptyCareer(), 'Old Joe', 'english-setter');
    expect(awaitsFirstPoint({ ...dog, xp: 140, level: 6 })).toBe(false);
  });

  it('marks the hunt, the dog\'s line in the journal and the field notes', () => {
    const lead = addDogToKennel(setHomeRegion(emptyCareer(), 'southern-plains'), 'Millie', 'gsp');
    const mate = addDogToKennel(lead.career, 'Sage', 'english-setter');
    const career = { ...mate.career, kennel: mate.career.kennel.map(d => d.id === mate.dog.id ? { ...d, xp: 60, level: 3 } : d) };
    const hunt = createHunt(getArea('quail-fields'), mulberry32(3));
    hunt.dogWork[0] = { pointFlushes: 1, retrieves: 1, downedOverPoint: 0 };
    hunt.dogWork[1] = { pointFlushes: 2, retrieves: 0, downedOverPoint: 0 };
    const result = settleCareerHunt(career, hunt, [career.kennel[0], career.kennel[1]]);
    expect(result.dogAwards.map(award => award.firstPoint ?? false)).toEqual([true, false]);
    const entry = result.career.recentHunts![0];
    expect(entry.dogs[0].milestone).toBe('first-point');
    expect(entry.dogs[1]).not.toHaveProperty('milestone');
    expect(formatHuntJournalEntry(entry).dogsLabel).toMatch(/^Millie \(German Shorthaired Pointer\), first point/);
    expect(careerFieldNotes(result).dogs.map(dog => dog.milestone)).toEqual(['Millie\'s first point', null]);
    expect(result.career.kennel[0].firstPoint).toEqual({ huntNumber: 1, areaId: 'quail-fields', season: 1 });
  });

  it('survives a save, and a damaged record never costs the dog', () => {
    const { career } = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    const saved = { ...career, kennel: [{ ...career.kennel[0], firstPoint: { huntNumber: 4, areaId: 'quail-fields', season: 2 },
      lifetime: { hunts: 9, points: 14, retrieves: 6 } }, { ...career.kennel[0], id: 'dog-2', firstPoint: 'yes', lifetime: { hunts: -1 } }] };
    const loaded = loadCareer(memory({ [CAREER_KEY]: JSON.stringify(saved) }));
    expect(loaded.kennel[0]).toMatchObject({ firstPoint: { huntNumber: 4 }, lifetime: { hunts: 9, points: 14, retrieves: 6 } });
    expect(loaded.kennel[1].name).toBe('Millie');
    expect(loaded.kennel[1]).not.toHaveProperty('firstPoint');
    expect(loaded.kennel[1]).not.toHaveProperty('lifetime');
    expect(sanitizeHuntJournal([{ huntNumber: 1, areaId: 'quail-fields', date: { season: 1, week: 0 }, retrieved: 0, downed: 0,
      escaped: 0, pointFlushes: 0, doubles: 0, henDowns: 0, hunterXp: 0, dogs: [{ name: 'Millie', breedId: 'gsp', milestone: 'best-in-show' }] }])[0].dogs[0])
      .not.toHaveProperty('milestone');
  });
});

describe('the first point in the field', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is called out once, for a career pup', () => {
    const { career } = addDogToKennel(setHomeRegion(emptyCareer(), 'southern-plains'), 'Millie', 'gsp');
    vi.stubGlobal('localStorage', memory({ [CAREER_KEY]: JSON.stringify({ ...career, date: { season: 1, week: 10 } }) }));
    vi.stubGlobal('location', { search: '?play=career&area=quail-fields&seed=1184004868' });
    const events = new EventTarget(), heard: string[] = [];
    events.addEventListener('hunt-milestone', event => heard.push((event as CustomEvent<string>).detail));
    const ctx = { camera: { position: { x: 0, z: 40 }, rotation: { y: Math.PI } }, events } as unknown as Ctx;
    const player = { isRunning: () => false, consumeRecall: () => false, setHuntHeading: () => undefined };
    (ctx as unknown as { get: (id: string) => unknown }).get = (id) => id === 'player' ? player : { isRiseActive: () => false };
    const hunt = new Hunt3DSystem(new LandscapeModel(resolveThreeHuntArea(location.search), parseDropPointId(location.search)));
    hunt.init(ctx);
    expect(hunt.dogName()).toBe('Millie');
    const record = hunt as unknown as { recordEvents(events: { type: string; dogIndex: number }[]): void };
    record.recordEvents([{ type: 'dog-pointed', dogIndex: 0 }]);
    record.recordEvents([{ type: 'dog-pointed', dogIndex: 0 }]);
    expect(heard).toEqual(['Millie\'s first point']);
  });
});

describe('an old dog\'s last season', () => {
  afterEach(() => vi.unstubAllGlobals());
  /** Belle, in her ninth season, and a young dog beside her. */
  function oldKennel() {
    const belle = addDogToKennel(setHomeRegion(emptyCareer(), 'southern-plains'), 'Belle', 'english-setter');
    const pup = addDogToKennel(belle.career, 'Scout', 'gsp');
    const career = { ...pup.career, date: { season: 9, week: 4 }, activeDogId: belle.dog.id, braceDogId: pup.dog.id,
      hunter: { ...pup.career.hunter, level: 9 },
      kennel: [{ ...belle.dog, bornSeason: 1, xp: 900, level: 9, lifetime: { hunts: 120, points: 310, retrieves: 140 } }, { ...pup.dog, bornSeason: 9 }] };
    return { career, belle: career.kennel[0], pup: career.kennel[1] };
  }

  it('is named by the handler, only for an old dog, and can be taken back', () => {
    const { career, belle, pup } = oldKennel();
    expect(canNameLastSeason(career, pup)).toBe(false);
    expect(setLastSeason(career, pup.id, true)).toBe(career);
    const named = setLastSeason(career, belle.id, true);
    expect(named.kennel[0].lastSeason).toBe(9);
    expect(inLastSeason(named, named.kennel[0])).toBe(true);
    expect(setLastSeason(named, belle.id, false).kennel[0]).not.toHaveProperty('lastSeason');
    // Never on its own: an old dog with no season named keeps hunting.
    expect(rollToNextSeason(career).kennel.every(dog => !isRetired(dog))).toBe(true);
  });

  it('retires the dog to the porch when the season rolls over, and the kennel carries on', () => {
    const { career, belle, pup } = oldKennel();
    const next = rollToNextSeason({ ...setLastSeason(career, belle.id, true), date: { season: 9, week: 22 } });
    expect(next.date).toEqual({ season: 10, week: 0 });
    expect(next.kennel[0]).toMatchObject({ name: 'Belle', retiredSeason: 9 });
    expect(seasonsHunted(next.kennel[0])).toBe(9);
    expect(workingDogs(next).map(dog => dog.name)).toEqual(['Scout']);
    expect(next.activeDogId).toBe(pup.id);
    expect(next.braceDogId).toBeNull();
    expect(activeDog(next)?.name).toBe('Scout');
    // A retired dog can't be taken back out, and frees its kennel place.
    expect(setActiveDog(next, belle.id)).toBe(next);
    expect(commitCareerLoadout(next, { activeDogId: belle.id }).ok).toBe(false);
    expect(careerPreparation(next).needsDog).toBe(false);
    const alone = rollToNextSeason({ ...setLastSeason(next, pup.id, false), kennel: next.kennel.map(dog => dog.id === pup.id ? { ...dog, bornSeason: 1, lastSeason: 10 } : dog), date: { season: 10, week: 22 } });
    expect(careerPreparation(alone).needsDog).toBe(true);
    expect(alone.activeDogId).toBeNull();
  });

  it('marks the last hunt of the season with a farewell', () => {
    const { career, belle } = oldKennel();
    const last = { ...setLastSeason(career, belle.id, true), date: { season: 9, week: 21 }, braceDogId: null };
    const hunt = createHunt(getArea('quail-fields'), mulberry32(5));
    hunt.dogWork[0] = { pointFlushes: 2, retrieves: 1, downedOverPoint: 1 };
    const result = settleCareerHunt(last, hunt, [last.kennel[0]]);
    expect(result.seasonEnded).toBe(true);
    expect(result.dogAwards[0].lastHunt).toBe(true);
    expect(result.career.recentHunts![0].dogs[0].milestone).toBe('last-hunt');
    expect(formatHuntJournalEntry(result.career.recentHunts![0]).dogsLabel).toMatch(/^Belle \(English Setter\), last hunt/);
    expect(careerFieldNotes(result).dogs[0].milestone)
      .toBe('Belle\'s last hunt. Belle retires to the porch after 9 seasons, 312 points and 141 retrieves on record.');
    // Mid-season hunts are not the last.
    const midSeason = settleCareerHunt({ ...last, date: { season: 9, week: 10 } }, hunt, [last.kennel[0]]);
    expect(midSeason.dogAwards[0].lastHunt).toBeUndefined();
  });

  it('keeps a damaged season record from costing the dog', () => {
    const { career } = oldKennel();
    const saved = { ...career, kennel: [{ ...career.kennel[0], lastSeason: 'soon', retiredSeason: -2 }] };
    const loaded = loadCareer(memory({ [CAREER_KEY]: JSON.stringify(saved) }));
    expect(loaded.kennel[0].name).toBe('Belle');
    expect(loaded.kennel[0]).not.toHaveProperty('lastSeason');
    expect(loaded.kennel[0]).not.toHaveProperty('retiredSeason');
  });

  it('is said as the dogs leave the truck', () => {
    const { career, belle } = oldKennel();
    const named = { ...setLastSeason(career, belle.id, true), braceDogId: null, date: { season: 9, week: 16 } };
    vi.stubGlobal('localStorage', memory({ [CAREER_KEY]: JSON.stringify(named) }));
    vi.stubGlobal('location', { search: '?play=career&area=quail-fields&seed=1184004868' });
    const events = new EventTarget(), heard: string[] = [];
    events.addEventListener('hunt-milestone', event => heard.push((event as CustomEvent<string>).detail));
    const ctx = { camera: { position: { x: 0, z: 40 }, rotation: { y: Math.PI } }, events } as unknown as Ctx;
    const player = { isRunning: () => false, consumeRecall: () => false, setHuntHeading: () => undefined };
    (ctx as unknown as { get: (id: string) => unknown }).get = (id) => id === 'player' ? player : { isRiseActive: () => false };
    const hunt = new Hunt3DSystem(new LandscapeModel(resolveThreeHuntArea(location.search), parseDropPointId(location.search)));
    hunt.init(ctx);
    expect(heard).toEqual([]);
    expect(hunt.releaseFromTruck(ctx, [{ x: -3, z: 38, heading: .7 }])).toBe(true);
    expect(heard).toEqual(['Belle\'s last season · 6 weeks left']);
  });
});
