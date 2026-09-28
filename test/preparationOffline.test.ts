import { describe, expect, it } from 'vitest';
import { CAREER_KEY } from '../src/game/career';
import { defaultQuickConfig, QUICK_KEY } from '../src/game/quick';
import { loadInstalledHuntChoices, prepareInstalledHuntUrl } from '../src/three/offline';
import { consumePreparationDraft, discardPreparationDraft, preparationInstalledEntry, PREPARATION_CHOICES_KEY, PREPARATION_DRAFT_KEY,
  preservePreparationDraft, rememberPreparationLaunch, type PreparationDraft } from '../src/three/preparationOffline';

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const choice = { mode: 'quick' as const, areaId: 'chukar-ridge', dropPointId: 'west-track', quality: 'lite', light: 'evening', challenge: 'relaxed' };
const draft = (): PreparationDraft => ({ ...choice, quick: { ...defaultQuickConfig(), areaId: 'chukar-ridge', breedId: 'english-setter', gunId: 'over-under' },
  dogId: 'first-dog', braceId: 'second-dog', gunId: 'over-under', addingDog: true,
  puppyDraft: { name: 'Aster', breedId: 'gsp', homeRegionId: 'southern-plains' },
  propertyDrafts: { quick: { areaId: 'chukar-ridge', dropPointId: 'west-track' }, career: { areaId: 'quail-fields', dropPointId: 'south-gate' } } });

describe('installed native preparation', () => {
  it('returns to the last launched career and display without changing either shared save', () => {
    const s = storage(); s.setItem(CAREER_KEY, 'fresh career in another tab'); s.setItem(QUICK_KEY, 'existing quick');
    rememberPreparationLaunch({ ...choice, mode: 'career', areaId: 'quail-fields', dropPointId: 'south-gate' }, s);
    const before = [...s.values]; const quick = { ...defaultQuickConfig(), breedId: 'english-setter' };
    const result = preparationInstalledEntry('https://game.test/play/prepare3d.html?installed=1', quick, s);
    expect(result.url.pathname).toBe('/play/prepare3d.html');
    expect(Object.fromEntries(result.url.searchParams)).toEqual({ mode: 'career', area: 'quail-fields', drop: 'south-gate', challenge: 'relaxed', quality: 'lite', tod: 'evening' });
    expect(result.quick).toEqual(quick); expect([...s.values]).toEqual(before);
  });
  it('migrates legacy standalone choices into an editable Quick draft and leaves legacy launches usable', () => {
    const s = storage(); prepareInstalledHuntUrl('https://game.test/index3d.html?area=chukar-ridge&drop=west-track&breed=gsp&gun=over-under&coat=liver-white&controls=touch&quality=lite&challenge=relaxed&seed=40', s);
    const before = [...s.values]; const quick = { ...defaultQuickConfig(), weather: 'frost' as const, level: 9 };
    const result = preparationInstalledEntry('https://game.test/prepare3d.html?installed=1', quick, s);
    expect(result.quick).toMatchObject({ areaId: 'chukar-ridge', breedId: 'gsp', gunId: 'over-under', weather: 'frost', level: 9 });
    expect(result.url.searchParams.get('drop')).toBe('west-track'); expect(result.url.searchParams.get('coat')).toBe('liver-white');
    expect(result.url.searchParams.get('controls')).toBe('touch'); expect(result.url.searchParams.has('seed')).toBe(false);
    expect([...s.values]).toEqual(before);
    const old = prepareInstalledHuntUrl('https://game.test/index3d.html?installed=1', s, () => 51);
    expect(old.pathname).toBe('/index3d.html'); expect(old.searchParams.get('seed')).toBe('51'); expect(old.searchParams.get('area')).toBe('chukar-ridge');
  });
  it('does not let a preparation lifecycle erase standalone installed preferences', () => {
    const s = storage(); prepareInstalledHuntUrl('https://game.test/index3d.html?area=chukar-ridge&drop=west-track', s);
    const before = loadInstalledHuntChoices(s).toString();
    prepareInstalledHuntUrl('https://game.test/prepare3d.html?mode=career&area=quail-fields', s);
    expect(loadInstalledHuntChoices(s).toString()).toBe(before);
  });
  it('keeps an explicit property from inheriting the old property’s entry', () => {
    const s = storage(); rememberPreparationLaunch(choice, s);
    const result = preparationInstalledEntry('https://game.test/prepare3d.html?installed=1&mode=quick&area=quail-fields', defaultQuickConfig(), s);
    expect(result.url.searchParams.get('area')).toBe('quail-fields'); expect(result.url.searchParams.has('drop')).toBe(false);
  });
  it.each(['legacy', 'native'])('keeps an explicit installed outfit ahead of %s preferences', kind => {
    const s = storage();
    if (kind === 'legacy') prepareInstalledHuntUrl('https://game.test/index3d.html?breed=gsp&gun=semi-auto', s);
    else rememberPreparationLaunch(choice, s);
    const result = preparationInstalledEntry('https://game.test/prepare3d.html?installed=1&breed=english-setter&gun=over-under', defaultQuickConfig(), s);
    expect(result.quick).toMatchObject({ breedId: 'english-setter', gunId: 'over-under' });
    const invalid = preparationInstalledEntry('https://game.test/prepare3d.html?installed=1&breed=not-a-breed&gun=not-a-gun', defaultQuickConfig(), s);
    expect(invalid.quick.breedId).toBe(defaultQuickConfig().breedId); expect(invalid.quick.gunId).toBe(defaultQuickConfig().gunId);
  });
  it('leaves ordinary preparation links and Quick configuration unchanged', () => {
    const s = storage(); rememberPreparationLaunch(choice, s); const quick = defaultQuickConfig();
    const href = 'https://game.test/prepare3d.html?mode=career&area=quail-fields&drop=south-gate';
    const result = preparationInstalledEntry(href, quick, s); expect(result.url.href).toBe(href); expect(result.quick).toBe(quick);
  });
  it('falls back safely for malformed preferences and denied storage', () => {
    const s = storage(); s.setItem(PREPARATION_CHOICES_KEY, '{broken');
    expect(preparationInstalledEntry('https://game.test/prepare3d.html?installed=1', defaultQuickConfig(), s).quick).toEqual(defaultQuickConfig());
    const denied = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } };
    const result = preparationInstalledEntry('https://game.test/prepare3d.html?installed=1', defaultQuickConfig(), denied);
    expect(result.url.search).toBe(''); expect(result.quick).toEqual(defaultQuickConfig());
  });
});

describe('save-safe preparation update draft', () => {
  const href = 'https://game.test/play/prepare3d.html?mode=career';
  it('keeps every editable choice and puppy name through one reload without a career snapshot', () => {
    const s = storage(), original = draft();
    expect(preservePreparationDraft(href, original, s)).toBe(true);
    expect([...s.values.keys()]).toEqual([PREPARATION_DRAFT_KEY]);
    expect(consumePreparationDraft(href, s)).toEqual(original);
    expect(consumePreparationDraft(href, s)).toBeNull();
  });
  it('re-snapshots changes made while the worker is activating', () => {
    const s = storage(), original = draft(); preservePreparationDraft(href, original, s);
    original.puppyDraft.name = 'Sage'; original.quick.level = 7; original.dropPointId = 'south-gate';
    expect(preservePreparationDraft(href, original, s)).toBe(true);
    expect(consumePreparationDraft(href, s)).toMatchObject({ puppyDraft: { name: 'Sage' }, quick: { level: 7 }, dropPointId: 'south-gate' });
  });
  it('blocks updates when the draft cannot round trip', () => {
    const denied = { getItem: () => null, setItem: () => { throw Error('full'); }, removeItem: () => {} };
    expect(preservePreparationDraft(href, draft(), null)).toBe(false);
    expect(preservePreparationDraft(href, draft(), denied)).toBe(false);
    expect(preservePreparationDraft(href, draft(), { ...denied, setItem: () => {} })).toBe(false);
  });
  it('does not apply a draft to another entry or retain a blocked update', () => {
    const s = storage(); preservePreparationDraft(href, draft(), s);
    expect(consumePreparationDraft('https://game.test/prepare3d.html', s)).toBeNull();
    preservePreparationDraft(href, draft(), s); discardPreparationDraft(s);
    expect(consumePreparationDraft(href, s)).toBeNull();
  });
  it('rejects corrupt draft data without modifying shared career or Quick saves', () => {
    const s = storage(); s.setItem(CAREER_KEY, 'newer career'); s.setItem(QUICK_KEY, 'newer quick');
    for (const bad of [null, [], { ...draft(), quick: null }, { ...draft(), puppyDraft: 'broken' }, { ...draft(), quick: { ...draft().quick, level: 'seven' } }]) {
      s.setItem(PREPARATION_DRAFT_KEY, JSON.stringify({ href, draft: bad })); expect(consumePreparationDraft(href, s)).toBeNull();
    }
    expect(s.getItem(CAREER_KEY)).toBe('newer career'); expect(s.getItem(QUICK_KEY)).toBe('newer quick');
  });
});
