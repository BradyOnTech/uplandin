import { describe, expect, it, vi } from 'vitest';
import { addDogToKennel, CAREER_KEY, emptyCareer, type Career, type StorageLike } from '../src/game/career';
import { buildClassicPreparationHref, resolveClassicLaunch } from '../src/game/classicLaunch';
import { createThreeHuntSetup, GAMEPLAY_MODE_KEY } from '../src/game/gameplayMode';
import { commitCareerLaunch } from '../src/game/huntPreparation';
import { defaultQuickConfig, QUICK_KEY, type QuickConfig } from '../src/game/quick';

function careerAt(level = 1, week = 9): Career {
  const career = addDogToKennel(emptyCareer(), 'Sage', 'gsp').career;
  return { ...career, homeRegionId: 'southern-plains', date: { season: 2, week }, hunter: { ...career.hunter, level } };
}
function store(career = careerAt(), quick: QuickConfig = defaultQuickConfig()) {
  const data: Record<string, string> = { [CAREER_KEY]: JSON.stringify(career), [QUICK_KEY]: JSON.stringify(quick), [GAMEPLAY_MODE_KEY]: '3d' };
  const storage: StorageLike = { getItem: key => data[key] ?? null, setItem: vi.fn((key, value) => { data[key] = value; }) };
  return { data, storage };
}
const params = (href: string) => new URL(href, 'https://game.test/subpath/').searchParams;

describe('shared preparation to classic gameplay', () => {
  it('boots a valid current career at the authored entry without changing saves, preferences, or progression', () => {
    const s = store(), before = { ...s.data };
    const launch = resolveClassicLaunch('?play=career&area=quail-fields&drop=west-track', s.storage);
    expect(launch).toEqual({ kind: 'field', data: { areaId: 'quail-fields', dropPointId: 'west-track' } });
    expect(s.data).toEqual(before); expect(s.storage.setItem).not.toHaveBeenCalled();
    const prepared = commitCareerLaunch(careerAt(), { areaId: 'quail-fields', dropPointId: 'west-track' });
    expect(prepared.ok).toBe(true);
  });

  it('boots Quick from its saved setup, independently of career gates and conflicting URL outfit', () => {
    const quick = { ...defaultQuickConfig(), areaId: 'chukar-ridge', breedId: 'english-setter', level: 6, breed2Id: 'gsp', gunId: 'side-by-side' };
    const s = store(emptyCareer(), quick), before = { ...s.data };
    const launch = resolveClassicLaunch('?play=quick&drop=west-track&area=quail-fields&breed=gwp&gun=semi-auto', s.storage);
    expect(launch).toEqual({ kind: 'field', data: { areaId: 'chukar-ridge', dropPointId: 'west-track', quick } });
    expect(s.data).toEqual(before); expect(s.storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    { career: emptyCareer(), area: 'quail-fields', drop: 'west-track' },
    { career: careerAt(1, 0), area: 'quail-fields', drop: 'west-track' },
    { career: careerAt(1, 9), area: 'chukar-ridge', drop: 'west-track' },
    { career: careerAt(8, 22), area: 'quail-fields', drop: 'west-track' },
    { career: careerAt(), area: 'missing-property', drop: 'west-track' },
    { career: careerAt(), area: 'quail-fields', drop: 'missing-entry' },
    { career: { ...careerAt(), activeDogId: 'missing-dog' }, area: 'quail-fields', drop: 'west-track' },
  ])('returns ineligible career launches to editable classic preparation ($area, $drop)', ({ career, area, drop }) => {
    const s = store(career), before = { ...s.data };
    const launch = resolveClassicLaunch(`?play=career&area=${area}&drop=${drop}&quality=auto`, s.storage);
    expect(launch.kind).toBe('redirect'); if (launch.kind !== 'redirect') return;
    const query = params(launch.href);
    expect(new URL(launch.href, 'https://game.test/subpath/').pathname).toBe('/subpath/prepare3d.html');
    expect(query.get('renderer')).toBe('2d'); expect(query.get('mode')).toBe('career'); expect(query.get('quality')).toBe('auto');
    expect(query.get('area')).not.toBe('missing-property'); expect(query.get('drop')).not.toBe('missing-entry');
    expect(s.data).toEqual(before); expect(s.storage.setItem).not.toHaveBeenCalled();
  });

  it('re-reads the current career so replay cannot bypass a season completed in another tab', () => {
    const s = store();
    expect(resolveClassicLaunch('?play=career&area=quail-fields', s.storage).kind).toBe('field');
    s.data[CAREER_KEY] = JSON.stringify(careerAt(3, 22));
    const replay = resolveClassicLaunch('?play=career&area=quail-fields&drop=south-gate', s.storage);
    expect(replay).toMatchObject({ kind: 'redirect' });
    if (replay.kind === 'redirect') expect(params(replay.href).get('mode')).toBe('career');
    expect(s.storage.setItem).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps goshawk 3D-only for saved or explicit method (explicit=%s)', explicit => {
    const quick = { ...defaultQuickConfig(), ...(explicit ? {} : { huntingMethod: 'goshawk' as const }) };
    const s = store(emptyCareer(), quick), before = { ...s.data };
    const launch = resolveClassicLaunch(`?play=quick&drop=west-track&quality=lite&challenge=relaxed${explicit ? '&method=goshawk' : ''}`, s.storage);
    expect(launch.kind).toBe('redirect'); if (launch.kind !== 'redirect') return;
    const url = new URL(launch.href, 'https://game.test/subpath/');
    expect(url.pathname).toBe('/subpath/index3d.html'); expect(url.searchParams.get('method')).toBe('goshawk');
    expect(url.searchParams.get('quality')).toBe('lite');
    const three = createThreeHuntSetup(url.search, () => .5, s.storage);
    expect(three.hunt.huntingMethod).toBe('goshawk'); expect(three.area.id).toBe('pheasant-coverts');
    expect(three.breed.id).toBe('gsp'); expect(three.level).toBe(10); expect(three.brace).toBeNull();
    expect(s.data).toEqual(before);
  });

  it('keeps absent/invalid launch out of gameplay and handles unavailable/corrupt storage safely', () => {
    const blocked: StorageLike = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
    expect(resolveClassicLaunch('', blocked)).toEqual({ kind: 'redirect', href: './home3d.html' });
    expect(resolveClassicLaunch('?play=preview', null)).toEqual({ kind: 'redirect', href: './home3d.html' });
    expect(resolveClassicLaunch('?play=career', blocked)).toMatchObject({ kind: 'redirect' });
    expect(resolveClassicLaunch('?play=quick', blocked)).toEqual({ kind: 'field', data: {
      areaId: defaultQuickConfig().areaId, dropPointId: 'south-gate', quick: defaultQuickConfig(),
    } });
    const s = store(); s.data[CAREER_KEY] = '{broken';
    expect(resolveClassicLaunch('?play=career&area=quail-fields', s.storage).kind).toBe('redirect');
  });

  it.each(['career', 'quick'])('returns %s results to the selected classic property/entry and graphics preference', mode => {
    const href = buildClassicPreparationHref(`?play=${mode}&area=chukar-ridge&quality=lite`, 'chukar-ridge', 'west-track');
    const url = new URL(href, 'https://game.test/subpath/classic.html');
    expect(url.pathname).toBe('/subpath/prepare3d.html');
    expect(Object.fromEntries(url.searchParams)).toEqual({ mode, area: 'chukar-ridge', drop: 'west-track', quality: 'lite', renderer: '2d' });
  });
});
