import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { addDogToKennel, CAREER_KEY, emptyCareer, loadCareer, saveCareer, setHomeRegion, type Career, type StorageLike } from '../src/game/career';
import { formatHuntJournalEntry, HUNT_JOURNAL_LIMIT, readHuntJournal, type CareerJournalEntry } from '../src/game/huntJournal';
import { settleCareerHunt } from '../src/game/huntResults';
import { mulberry32 } from '../src/game/math';
import { createHunt, endFieldSession } from '../src/game/state';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx } from '../src/three/engine';
import { Hunt3DSystem } from '../src/three/subsystems/hunt3d';

afterEach(() => vi.unstubAllGlobals());

const entry = (huntNumber = 1): CareerJournalEntry => ({
  huntNumber, areaId: 'quail-fields', date: { season: 2, week: 9 }, retrieved: 1,
  downed: 2, escaped: 3, pointFlushes: 2, doubles: 1, henDowns: 0, hunterXp: 5,
  dogs: [{ name: 'Millie', breedId: 'gsp' }],
});

function storage(raw: unknown): StorageLike & { writes: string[] } {
  let saved = JSON.stringify(raw);
  const writes: string[] = [];
  return { writes, getItem: () => saved, setItem: (key, value) => { expect(key).toBe(CAREER_KEY); writes.push(value); saved = value; } };
}

describe('career hunt journal settlement', () => {
  it('records recovered birds separately from downed birds and snapshots the hunt date and actual active dogs', () => {
    const lead = addDogToKennel(setHomeRegion(emptyCareer(), 'southern-plains'), 'Millie', 'gsp');
    const brace = addDogToKennel(lead.career, 'Boone', 'english-setter');
    const career = { ...brace.career, date: { season: 2, week: 21 } };
    const hunt = createHunt(getArea('quail-fields'), mulberry32(12));
    hunt.birds[0].state = 'retrieved';
    hunt.birds[1].state = 'downed';
    hunt.birds[2].state = 'escaped';
    hunt.downed = 2; hunt.escaped = 1; hunt.doubles = 1;
    hunt.dogWork[0] = { pointFlushes: 2, retrieves: 9, downedOverPoint: 1 };
    hunt.dogWork[1] = { pointFlushes: 1, retrieves: 7, downedOverPoint: 0 };
    const before = structuredClone(career);

    const result = settleCareerHunt(career, hunt, [lead.dog, brace.dog]);
    expect(result.career.recentHunts).toEqual([{
      huntNumber: 1, areaId: 'quail-fields', date: { season: 2, week: 21 },
      retrieved: 1, downed: 2, escaped: 1, pointFlushes: 3, doubles: 1, henDowns: 0, hunterXp: 5,
      dogs: [{ name: 'Millie', breedId: 'gsp' }, { name: 'Boone', breedId: 'english-setter' }],
    }]);
    expect(result.career.date).toEqual({ season: 2, week: 22 });
    expect(result.seasonEnded).toBe(true);
    expect(career).toEqual(before);
    career.date.week = 8; lead.dog.name = 'Changed later';
    expect(result.career.recentHunts![0].date.week).toBe(21);
    expect(result.career.recentHunts![0].dogs[0].name).toBe('Millie');
  });

  it('ignores an inactive dog slot, retains fine-adjusted XP and counts only actual escapes on an early exit', () => {
    const added = addDogToKennel(emptyCareer(), 'Sage', 'english-setter');
    const hunt = createHunt(getArea('quail-fields'), mulberry32(12));
    hunt.birds[0].state = 'retrieved'; hunt.birds[1].state = 'escaped';
    hunt.downed = 1; hunt.escaped = 1; hunt.henDowns = 1;
    hunt.dogWork[0].pointFlushes = 1;
    hunt.dogWork[1].pointFlushes = 99;
    endFieldSession(hunt);
    const result = settleCareerHunt(added.career, hunt, [added.dog, null]);
    expect(result.career.recentHunts![0]).toMatchObject({ retrieved: 1, escaped: 1, pointFlushes: 1, hunterXp: 0, henDowns: 1 });
    expect(result.career.recentHunts![0].dogs).toHaveLength(1);
    expect(hunt.birds.some((bird) => bird.state === 'hidden')).toBe(true);
    expect(result.weeks).toBe(2);
    expect(result.career.recentHunts![0].date.week).toBe(0);
  });

  it('keeps the latest thirty in order without inventing a legacy hunt history', () => {
    const added = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    const hunt = createHunt(getArea('quail-fields'), mulberry32(7));
    let career: Career = { ...added.career, hunts: 100 };
    career = settleCareerHunt(career, hunt, [added.dog]).career;
    expect(career.recentHunts!.map((row) => row.huntNumber)).toEqual([101]);
    for (let i = 0; i < 33; i++) career = settleCareerHunt(career, hunt, [added.dog]).career;
    expect(career.recentHunts).toHaveLength(HUNT_JOURNAL_LIMIT);
    expect(career.recentHunts!.map((row) => row.huntNumber)).toEqual(Array.from({ length: 30 }, (_, i) => 134 - i));
  });

  it('saves the journal in the same existing write as career totals, XP and calendar', () => {
    const added = addDogToKennel(emptyCareer(), 'Millie', 'gsp');
    const hunt = createHunt(getArea('quail-fields'), mulberry32(7));
    const result = settleCareerHunt(added.career, hunt, [added.dog]);
    const store = storage(added.career);
    saveCareer(result.career, store);
    expect(store.writes).toHaveLength(1);
    expect(loadCareer(store)).toEqual(result.career);
    expect(JSON.parse(store.writes[0])).toMatchObject({ hunts: 1, hunter: { xp: 2 }, date: { week: 2 }, recentHunts: [{ huntNumber: 1 }] });
  });
});

describe('optional journal persistence and display', () => {
  it('leaves pre-journal v1 and v2 progression intact, with no fabricated rows', () => {
    for (const old of [{ hunts: 8, downed: 14, escaped: 6 }, { ...emptyCareer(), hunts: 8, downed: 14, escaped: 6 }]) {
      const career = loadCareer(storage(old));
      expect(career).toMatchObject({ hunts: 8, downed: 14, escaped: 6 });
      expect(readHuntJournal(career)).toEqual([]);
      expect(career.recentHunts).toBeUndefined();
    }
  });

  it.each([null, 'broken', {}, [null, { huntNumber: 1 }, { ...entry(), date: { season: 2, week: -1 } }, { ...entry(), retrieved: '1' }]])(
    'discards malformed optional history while preserving the full career', (recentHunts) => {
      const base = { ...addDogToKennel(emptyCareer(), 'Millie', 'gsp').career, hunts: 10, downed: 14, homeRegionId: 'southern-plains' };
      const career = loadCareer(storage({ ...base, recentHunts }));
      expect(career).toEqual({ ...base, recentHunts: [] });
    },
  );

  it('keeps valid rows, bounds/reorders history, and returns detached nested snapshots', () => {
    const history: unknown[] = Array.from({ length: 35 }, (_, i) => entry(i + 1));
    history.push({ ...entry(36), dogs: [null] }, entry(35), { ...entry(37), escaped: -2 });
    const career = loadCareer(storage({ ...emptyCareer(), hunts: 37, recentHunts: history }));
    const rows = readHuntJournal(career);
    expect(rows.map((row) => row.huntNumber)).toEqual(Array.from({ length: 30 }, (_, i) => 35 - i));
    rows[0].date.week = 20; rows[0].dogs[0].name = 'Mutated display';
    expect(career.recentHunts![0]).toEqual(entry(35));
  });

  it('formats known snapshots and handles unknown IDs or invalid dates without inventing another property', () => {
    const formatted = formatHuntJournalEntry(entry());
    expect(formatted).toMatchObject({ areaName: getArea('quail-fields').name, dateLabel: 'season 2 · early November', resultLabel: '1 retrieved · 2 down · 3 escaped' });
    expect(formatted.dogsLabel).toContain('Millie');
    expect(formatHuntJournalEntry({ ...entry(), areaId: 'future-ground', dogs: [{ name: 'Boone', breedId: 'future-breed' }] }))
      .toMatchObject({ areaName: 'Unlisted hunting ground', dogsLabel: 'Boone' });
    expect(formatHuntJournalEntry({ ...entry(), date: { season: 2, week: -1 } }).dateLabel).toBe('Date unavailable');
  });
});

describe('3D journal settlement boundary', () => {
  it.each(['quick', 'preview', 'career'])('keeps %s settlement behind the existing career gate and writes once', (mode) => {
    const career = { ...addDogToKennel(emptyCareer(), 'Millie', 'gsp').career, hunts: 1, recentHunts: [entry()] };
    const original = JSON.stringify(career);
    const data: Record<string, string> = { [CAREER_KEY]: original };
    const writes: string[] = [];
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => { writes.push(key); data[key] = value; },
    });
    vi.stubGlobal('location', { search: `?area=quail-fields&seed=17${mode === 'preview' ? '' : `&play=${mode}`}` });
    const ctx = { camera: { position: { x: 0, z: 40 }, rotation: { y: Math.PI } }, get: () => ({ setHuntHeading: () => {} }) } as unknown as Ctx;
    const hunt = new Hunt3DSystem(new LandscapeModel(getArea('quail-fields')));
    hunt.init(ctx);
    hunt.endHunt();
    const result = hunt.settleCareer();
    expect(hunt.settleCareer()).toBe(result);
    if (mode === 'career') {
      expect(writes).toEqual([CAREER_KEY]);
      expect(loadCareer().recentHunts!.map((row) => row.huntNumber)).toEqual([2, 1]);
    } else {
      expect(result).toBeNull();
      expect(writes).toEqual([]);
      expect(data[CAREER_KEY]).toBe(original);
    }
  });
});
