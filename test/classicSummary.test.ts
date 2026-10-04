import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { addDogToKennel, CAREER_KEY, emptyCareer, loadCareer, type KennelDog } from '../src/game/career';
import { settleCareerHunt } from '../src/game/huntResults';
import { mulberry32 } from '../src/game/math';
import { defaultQuickConfig, type QuickConfig } from '../src/game/quick';
import { createHunt, type HuntState } from '../src/game/state';
import * as summary from '../src/ui/classicSummary';
import { FieldScene } from '../src/scenes/FieldScene';

// Exercise the actual scene's completion boundary without a renderer, asset
// loader, or DOM layout. Native modal behavior is separately browser-reviewed.
vi.mock('phaser', () => ({ default: { Scene: class {}, Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } } } }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('classic field report', () => {
  it('reports delivered birds and active brace work, without inventing duration or exposing hidden stocking', () => {
    const hunt = createHunt(getArea('quail-fields'), mulberry32(9), { dropPointId: 'west-track' });
    hunt.birds[0].state = 'retrieved'; hunt.birds[1].state = 'downed'; hunt.birds[2].state = 'carried';
    hunt.downed = 3; hunt.escaped = 2; hunt.doubles = 1;
    hunt.dogWork[0].pointFlushes = 2; hunt.dogWork[1].pointFlushes = 3;
    const snapshot = JSON.stringify(hunt);
    const notes = summary.classicSummaryNotes(hunt, 2, null);
    expect(notes).toMatchObject({ property: 'Quail Fields', entry: 'West Track', retrieved: 1, mode: 'Quick Hunt', career: null, canReplay: true });
    expect(notes.rows).toEqual([
      { label: 'Birds downed', value: 3 }, { label: 'Point flushes', value: 5 },
      { label: 'Birds escaped', value: 2 }, { label: 'Doubles', value: 1 },
    ]);
    expect(notes.uncollected).toBe('2 downed birds were not brought to hand.');
    expect(JSON.stringify(hunt)).toBe(snapshot);
    hunt.birds.push({ ...hunt.birds[3], id: 99999, state: 'hidden' });
    expect(summary.classicSummaryNotes(hunt, 2, null)).toEqual(notes);
    expect(summary.classicSummaryNotes(hunt, 1, null).rows[1].value).toBe(2);
  });

  it('presents the actual settled awards, penalty and season continuation without changing them', () => {
    const { career, dog } = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
    career.date.week = 21;
    const hunt = createHunt(getArea('pheasant-coverts'), mulberry32(8));
    hunt.henDowns = 1; hunt.downed = 1; hunt.dogWork[0].pointFlushes = 2;
    const result = settleCareerHunt(career, hunt, [dog]);
    const snapshot = JSON.stringify(result);
    const notes = summary.classicSummaryNotes(hunt, 1, result);
    expect(notes.canReplay).toBe(false);
    expect(notes.warning).toContain('1 protected hen was downed');
    expect(notes.career?.hunterAward).toBe('+0 XP · protected-hen penalty applied (4 XP)');
    expect(notes.career?.dogs[0]).toMatchObject({ name: 'Sage', award: `+${result.dogAwards[0].gained} XP · Scent work +4.0 · Steadiness +6.0` });
    expect(notes.career?.next).toContain('Start season 2');
    expect(notes.career?.calendar).toContain('season 1 — over');
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(summary.classicSummaryNotes(hunt, 1, result)).toEqual(notes);
  });
});

interface CompletionBoundary {
  hunt: HuntState;
  area: ReturnType<typeof getArea>;
  quick: QuickConfig | null;
  kennelDogs: (KennelDog | null)[];
  dogs: unknown[];
  input: { enabled: boolean; keyboard: { enabled: boolean } };
  scene: { pause(): void };
  simulation: { update(): void };
  showSummary(): void;
  disposeSummary(): void;
  update(time: number, delta: number): void;
}

function completion(quick: boolean) {
  const { career, dog } = addDogToKennel(emptyCareer(), 'Sage', 'gsp');
  career.homeRegionId = 'southern-plains'; career.date.week = 9;
  const data: Record<string, string> = { [CAREER_KEY]: JSON.stringify(career) };
  const storage = { getItem: (key: string) => data[key] ?? null, setItem: vi.fn((key: string, value: string) => { data[key] = value; }) };
  const location = { search: `?play=${quick ? 'quick' : 'career'}&area=quail-fields&quality=lite`, assign: vi.fn() };
  vi.stubGlobal('localStorage', storage); vi.stubGlobal('location', location);
  const dispose = vi.fn();
  const show = vi.spyOn(summary, 'openClassicSummary').mockReturnValue({ dispose });
  const scene = new FieldScene() as unknown as CompletionBoundary;
  scene.hunt = createHunt(getArea('quail-fields'), mulberry32(11), { dropPointId: 'west-track' });
  scene.area = getArea('quail-fields'); scene.quick = quick ? defaultQuickConfig() : null;
  scene.kennelDogs = quick ? [null] : [dog]; scene.dogs = [{}];
  scene.input = { enabled: true, keyboard: { enabled: true } };
  scene.scene = { pause: vi.fn() }; scene.simulation = { update: vi.fn() };
  return { scene, storage, location, show, dispose, before: JSON.stringify(data) };
}

describe('classic completion boundary', () => {
  it('settles and saves Career exactly once, then freezes the field and disposes the report idempotently', () => {
    const f = completion(false);
    f.scene.hunt.birds[0].state = 'retrieved'; f.scene.hunt.downed = 1;
    f.scene.showSummary(); f.scene.showSummary();
    expect(f.show).toHaveBeenCalledTimes(1); expect(f.storage.setItem).toHaveBeenCalledTimes(1);
    const saved = loadCareer(f.storage);
    expect(saved.hunts).toBe(1); expect(saved.recentHunts).toHaveLength(1);
    expect(saved.recentHunts?.[0]).toMatchObject({ retrieved: 1, downed: 1 });
    expect(f.show.mock.calls[0][0].career?.career).toEqual(saved);
    expect(f.scene.input).toEqual({ enabled: false, keyboard: { enabled: false } });
    expect(f.scene.scene.pause).toHaveBeenCalledTimes(1);
    f.scene.update(500, 1000 / 60); expect(f.scene.simulation.update).not.toHaveBeenCalled();
    f.scene.disposeSummary(); f.scene.disposeSummary(); expect(f.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps Quick career bytes unchanged and returns to the explicit classic preparation', () => {
    const f = completion(true), before = f.storage.getItem(CAREER_KEY);
    f.scene.showSummary(); f.scene.showSummary();
    expect(f.storage.setItem).not.toHaveBeenCalled(); expect(f.storage.getItem(CAREER_KEY)).toBe(before);
    const options = f.show.mock.calls[0][0]; expect(options.career).toBeNull();
    options.onPrepare();
    const href = new URL(f.location.assign.mock.calls[0][0], 'https://game.test/subpath/');
    expect(href.pathname).toBe('/subpath/prepare3d.html');
    expect(Object.fromEntries(href.searchParams)).toEqual({ mode: 'quick', area: 'quail-fields', drop: 'west-track', quality: 'lite', renderer: '2d' });
    options.onReplay();
    const replay = new URL(f.location.assign.mock.calls[1][0], 'https://game.test/subpath/');
    expect(replay.pathname).toBe('/subpath/classic.html'); expect(replay.searchParams.get('play')).toBe('quick');
    expect(replay.searchParams.get('drop')).toBe('west-track');
  });
});
