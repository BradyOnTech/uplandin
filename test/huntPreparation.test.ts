import { describe, expect, it } from 'vitest';
import { AREAS, getArea } from '../src/game/areas';
import { BREEDS } from '../src/game/breeds';
import { addDogToKennel, CAREER_KEY, emptyCareer, type Career, type StorageLike } from '../src/game/career';
import { createThreeHuntSetup, loadGameplayMode, parseHuntLaunch } from '../src/game/gameplayMode';
import { GUNS } from '../src/game/guns';
import {
  careerPreparation, commitCareerLaunch, commitCareerLoadout, commitCareerSetup,
  commitPreparationCalendar, commitPreparationDog, commitQuickLaunch, quickPreparation,
} from '../src/game/huntPreparation';
import { mulberry32 } from '../src/game/math';
import { defaultQuickConfig, QUICK_KEY } from '../src/game/quick';
import { REGIONS } from '../src/game/regions';

function careerAt(level = 1, week = 9): Career {
  const base = addDogToKennel(emptyCareer(), 'Millie', 'gsp').career;
  return { ...base, homeRegionId: 'southern-plains', hunter: { ...base.hunter, level }, date: { season: 2, week } };
}
function store(career: Career, quick = defaultQuickConfig()): StorageLike {
  const data: Record<string, string> = { [CAREER_KEY]: JSON.stringify(career), [QUICK_KEY]: JSON.stringify(quick) };
  return { getItem: (key) => data[key] ?? null, setItem: () => { throw Error('Pure preparation must not write storage'); } };
}
const search = (href: string) => new URL(href, 'https://example.test/game/').search;

describe('read-only preparation snapshots', () => {
  it('preserves real career gates and leaves saves/preferences untouched', () => {
    const career = careerAt(1, 0), before = structuredClone(career);
    const prep = careerPreparation(career);
    expect(prep.availableBreeds.map((breed) => breed.id)).toEqual(BREEDS.map((breed) => breed.id));
    expect(prep.availableGuns.map((gun) => gun.id)).toEqual(['remington-870']);
    expect(prep.kennelCapacity).toBe(1); expect(prep.canAddDog).toBe(false); expect(prep.canBrace).toBe(false);
    expect(prep.gearTier).toBe(0);
    const home = prep.areas.find((row) => row.area.id === 'quail-fields')!;
    expect(home).toMatchObject({ accessible: true, open: false, selectable: false, opensWeek: 9, weeks: 1 });
    expect(prep.areas.find((row) => row.area.id === 'grouse-woods')).toMatchObject({ accessible: false, open: true, selectable: false, weeks: 2 });
    expect(prep.calendarAction).toMatchObject({ kind: 'opener', weeks: 9 });
    prep.activeDog!.name = 'Only a display snapshot';
    expect(career).toEqual(before);
    expect(loadGameplayMode(store(career))).toBe('2d');
  });

  it('uses hunter level/home rather than legacy region or equipment fields for access', () => {
    const career = { ...careerAt(2, 4), regionsUnlocked: [], hunter: { ...careerAt(2).hunter, truckTier: 0, dogBoxTier: 1 } };
    const prep = careerPreparation(career);
    expect(prep.areas.find((row) => row.area.id === 'chukar-ridge')).toMatchObject({ accessible: true, open: true, selectable: true, weeks: 2 });
    expect(prep.calendarAction).toMatchObject({ kind: 'rest', weeks: 1 });
    const locked = careerPreparation({ ...career, hunter: { ...career.hunter, level: 1, truckTier: 9, dogBoxTier: 9 }, regionsUnlocked: REGIONS.map((region) => region.id) });
    expect(locked.areas.find((row) => row.area.id === 'chukar-ridge')!.accessible).toBe(false);
    expect(locked.kennelCapacity).toBe(1);
  });

  it('exposes only seasonally open species and blocks all launches when the season ends', () => {
    const prep = careerPreparation(careerAt(2, 2));
    for (const row of prep.areas.filter((area) => area.open)) expect(row.openSpeciesIds.length).toBeGreaterThan(0);
    // Cattails and Chukar Ridge also carry Huns, whose earlier opener is legal.
    expect(prep.areas.find((row) => row.area.id === 'pheasant-coverts')).toMatchObject({ selectable: true, openSpeciesIds: ['hun'] });
    expect(prep.areas.find((row) => row.area.id === 'sharptail-prairie')!.selectable).toBe(true);
    const over = careerPreparation(careerAt(10, 22));
    expect(over.areas.every((row) => !row.open && !row.selectable && row.openSpeciesIds.length === 0)).toBe(true);
    expect(over.calendarAction).toMatchObject({ kind: 'next-season', weeks: 0 });
  });

  it('offers unrestricted Quick choices while retaining the existing fixed falconry setup', () => {
    const quick = quickPreparation({ ...defaultQuickConfig(), areaId: 'chukar-ridge', level: 10, breed2Id: 'english-setter' });
    expect(quick.areas.every((area) => area.selectable && area.weeks === 0)).toBe(true);
    expect(quick.availableGuns).toHaveLength(GUNS.length);
    const hawk = quickPreparation({ ...quick.config, huntingMethod: 'goshawk', breedId: 'vizsla' });
    expect(hawk.config).toMatchObject({ huntingMethod: 'goshawk', breedId: 'gsp', level: 10, breed2Id: 'none', areaId: 'pheasant-coverts' });
    expect(hawk.fixedCompanions).toBe(true);
    expect(hawk.areas.filter((area) => area.selectable).map((area) => area.area.id)).toEqual(['pheasant-coverts']);
  });
});

describe('explicit career preparation transactions', () => {
  it('creates the first dog and home atomically and rejects a stale duplicate setup', () => {
    const career = emptyCareer(), before = structuredClone(career);
    const invalid = commitCareerSetup(career, { homeRegionId: 'missing', dog: { name: 'Sage', breedId: 'gsp' } });
    expect(invalid.ok).toBe(false); expect(career).toEqual(before);
    const result = commitCareerSetup(career, { homeRegionId: 'great-basin', dog: { name: 'Sage', breedId: 'english-setter' } });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.career).toMatchObject({ homeRegionId: 'great-basin', activeDogId: 'dog-1', hunts: 0, date: { season: 1, week: 0 } });
    expect(result.career.kennel[0]).toMatchObject({ name: 'Sage', breedId: 'english-setter', bornSeason: 1, level: 1 });
    expect(career).toEqual(before);
    expect(commitCareerSetup(result.career, { homeRegionId: 'north-woods', dog: { name: 'Duplicate', breedId: 'gsp' } })).toMatchObject({ ok: false, code: 'setup-complete' });
  });

  it('adds home to a legacy save without altering its dog or inventing history', () => {
    const career = { ...careerAt(), homeRegionId: null, hunts: 12 };
    const result = commitCareerSetup(career, { homeRegionId: 'north-woods' });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.career).toEqual({ ...career, homeRegionId: 'north-woods' });
    expect(result.career.recentHunts).toBeUndefined();
    expect(commitCareerSetup(career, { homeRegionId: 'north-woods', dog: { name: 'Duplicate', breedId: 'gsp' } }).ok).toBe(false);
  });

  it('revalidates earned kennel capacity and makes an added puppy active without changing home', () => {
    expect(commitPreparationDog(careerAt(1), { name: 'Boone', breedId: 'gwp' })).toMatchObject({ ok: false, code: 'kennel-full' });
    const career = careerAt(4), result = commitPreparationDog(career, { name: 'Boone', breedId: 'gwp' });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.career).toMatchObject({ homeRegionId: career.homeRegionId, activeDogId: 'dog-2', date: career.date });
    expect(result.dog).toMatchObject({ name: 'Boone', bornSeason: 2, level: 1 });
    expect(career.kennel).toHaveLength(1);
    expect(commitPreparationDog(career, { name: 'Boone', breedId: 'missing' }).ok).toBe(false);
    expect(commitPreparationDog(career, { name: '  ', breedId: 'gsp' }).ok).toBe(false);
  });

  it('revalidates loadout unlocks, keeps brace selections idempotent and never braces the lead dog', () => {
    const career = addDogToKennel(careerAt(7), 'Boone', 'gwp').career;
    const chosen = commitCareerLoadout(career, { braceDogId: 'dog-2', gunId: 'over-under' });
    expect(chosen.ok).toBe(true); if (!chosen.ok) return;
    expect(chosen.career).toMatchObject({ activeDogId: 'dog-1', braceDogId: 'dog-2', hunter: { shotgunId: 'over-under' } });
    expect(commitCareerLoadout(chosen.career, { braceDogId: 'dog-2' })).toMatchObject({ ok: true, career: { braceDogId: 'dog-2' } });
    expect(commitCareerLoadout(chosen.career, { activeDogId: 'dog-2' })).toMatchObject({ ok: true, career: { activeDogId: 'dog-2', braceDogId: null } });
    expect(commitCareerLoadout(career, { braceDogId: 'dog-1' }).ok).toBe(false);
    expect(commitCareerLoadout(career, { activeDogId: 'unknown' }).ok).toBe(false);
    expect(commitCareerLoadout(careerAt(1), { gunId: 'over-under' }).ok).toBe(false);
    expect(commitCareerLoadout({ ...career, hunter: { ...career.hunter, level: 6 } }, { braceDogId: 'dog-2' }).ok).toBe(false);
    expect(career.braceDogId).toBeNull();
  });

  it('advances only through explicit current opener, rest and next-season actions', () => {
    const career = careerAt(1, 0), opener = commitPreparationCalendar(career, 'opener');
    expect(opener.ok).toBe(true); if (!opener.ok) return;
    expect(opener.career.date).toEqual({ season: 2, week: 9 });
    expect(career.date.week).toBe(0);
    expect(commitPreparationCalendar(opener.career, 'opener').ok).toBe(false);
    expect(commitPreparationCalendar(opener.career, 'rest')).toMatchObject({ ok: true, career: { date: { season: 2, week: 10 } } });
    expect(commitPreparationCalendar(career, 'next-season').ok).toBe(false);
    const next = commitPreparationCalendar(careerAt(1, 22), 'next-season');
    expect(next).toMatchObject({ ok: true, career: { date: { season: 3, week: 0 } } });
  });
});

describe('validated preparation launch handoff', () => {
  it('uses the existing URL/save seam for a real career setup without charging weeks or awarding XP', () => {
    const career = addDogToKennel(careerAt(7), 'Boone', 'english-setter').career;
    const result = commitCareerLaunch(career, { areaId: 'chukar-ridge', dropPointId: 'west-track', braceDogId: 'dog-2', gunId: 'over-under' });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.href).toBe('./index3d.html?play=career&area=chukar-ridge&drop=west-track');
    expect(result.dropPointId).toBe('west-track');
    expect(result.career).toMatchObject({ hunts: career.hunts, date: career.date, hunter: { xp: career.hunter.xp } });
    const setup = createThreeHuntSetup(search(result.href), mulberry32(7), store(result.career));
    expect(setup.launch).toEqual(result.launch);
    expect(setup.hunt).toMatchObject({ areaId: 'chukar-ridge', dropPointId: 'west-track', gunId: 'over-under' });
    expect(setup.kennelDog?.name).toBe('Millie');
    expect(setup.brace?.kennelDog?.name).toBe('Boone');
    expect(setup.level).toBe(1); expect(setup.gearTier).toBe(2);
  });

  it('rejects locked/closed/stale choices against the passed current save', () => {
    const choice = { areaId: 'chukar-ridge' };
    expect(commitCareerLaunch(careerAt(2, 4), choice).ok).toBe(true);
    expect(commitCareerLaunch(careerAt(1, 4), choice).ok).toBe(false);
    expect(commitCareerLaunch(careerAt(2, 1), choice).ok).toBe(false);
    expect(commitCareerLaunch(careerAt(2, 22), choice).ok).toBe(false);
    expect(commitCareerLaunch({ ...careerAt(2, 4), activeDogId: null }, choice).ok).toBe(false);
    expect(commitCareerLaunch({ ...careerAt(2, 4), homeRegionId: null }, choice).ok).toBe(false);
    expect(commitCareerLaunch(careerAt(2, 4), { areaId: 'missing' }).ok).toBe(false);
    expect(commitCareerLaunch(careerAt(2, 4), { ...choice, dropPointId: 'missing' }).ok).toBe(false);
    expect(commitCareerLaunch(careerAt(2, 4), { ...choice, gunId: 'side-by-side' }).ok).toBe(false);
  });

  it('defaults to each authored first drop and keeps Quick independent of career locks', () => {
    for (const area of AREAS) {
      const launch = commitQuickLaunch({ ...defaultQuickConfig(), areaId: area.id });
      expect(launch.ok).toBe(true); if (!launch.ok) continue;
      expect(launch.dropPointId).toBe(area.dropPoints[0].id);
      expect(parseHuntLaunch(search(launch.href))).toEqual({ kind: 'quick' });
    }
    const quick = { ...defaultQuickConfig(), areaId: 'chukar-ridge', gunId: 'side-by-side', level: 10, breed2Id: 'gwp' };
    const launch = commitQuickLaunch(quick, 'west-track');
    expect(launch.ok).toBe(true); if (!launch.ok) return;
    const setup = createThreeHuntSetup(search(launch.href), mulberry32(5), store(emptyCareer(), launch.config));
    expect(setup.kennelDog).toBeNull();
    expect(setup.hunt).toMatchObject({ areaId: 'chukar-ridge', dropPointId: 'west-track', gunId: 'side-by-side', quick: launch.config });
    expect(setup.brace?.breedId).toBe('gwp');
    expect(commitQuickLaunch(quick, 'missing').ok).toBe(false);
  });

  it('retains the 3D-only goshawk launch contract and normalized fixed dog/property', () => {
    const launch = commitQuickLaunch({ ...defaultQuickConfig(), huntingMethod: 'goshawk', areaId: 'chukar-ridge' });
    expect(launch.ok).toBe(true); if (!launch.ok) return;
    expect(launch.href).toBe(`./index3d.html?play=quick&method=goshawk&drop=${getArea('pheasant-coverts').dropPoints[0].id}`);
    expect(launch.config).toMatchObject({ breedId: 'gsp', level: 10, breed2Id: 'none', areaId: 'pheasant-coverts' });
    const setup = createThreeHuntSetup(search(launch.href), mulberry32(2), store(emptyCareer(), launch.config));
    expect(setup.hunt.huntingMethod).toBe('goshawk');
  });
});
