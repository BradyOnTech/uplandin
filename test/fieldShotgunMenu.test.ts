import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldInterface } from '../src/three/fieldInterface';
import { parseHuntLaunch } from '../src/game/gameplayMode';
import { CAREER_KEY, emptyCareer, loadCareer, saveCareer } from '../src/game/career';
import { QUICK_KEY, defaultQuickConfig, loadQuickConfig, saveQuickConfig } from '../src/game/quick';

vi.mock('../src/audio', () => ({ setAudioEnabled: vi.fn(), unlockAudio: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

function menu(search: string, equipped = 'remington-870') {
  const data: Record<string, string> = {};
  vi.stubGlobal('localStorage', { getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => { data[key] = value; } });
  const elements = Object.fromEntries(['shotgun-setting', 'shotgun-options', 'shotgun-equipped', 'shotgun-rack', 'shotgun-status'].map(id => [id, {
    value: '', textContent: '', href: '', hidden: true, disabled: true,
    children: [] as { value: string; textContent: string }[],
    replaceChildren(...children: { value: string; textContent: string }[]) { this.children = children; },
  }]));
  vi.stubGlobal('document', { getElementById: (id: string) => elements[id], createElement: () => ({ value: '', textContent: '' }) });
  const location = { search, href: `http://localhost/index3d.html${search}#field` };
  vi.stubGlobal('location', location);
  const replaceState = vi.fn((_state, _title, url) => { location.href = String(url); location.search = new URL(location.href).search; });
  vi.stubGlobal('history', { replaceState });
  const gun = { equippedGunId: () => equipped, equipGun: vi.fn((_ctx, id: string) => { equipped = id; return true; }) };
  const ctx = { paused: true, get: () => gun };
  const renderOnce = vi.fn();
  const ui = Object.assign(Object.create(FieldInterface.prototype), {
    engine: { ctx, renderOnce }, launch: parseHuntLaunch(search), entered: true,
    readyState: true, complete: false, lostContext: false,
  }) as { changeShotgun(id: string): void; refreshShotgunMenu(): void };
  return { ui, gun, ctx, data, elements, replaceState, location, renderOnce };
}

describe('field shotgun selection', () => {
  it('equips a standalone preview in place and changes only its gun URL parameter', () => {
    const m = menu('?area=pheasant-coverts&drop=west-track&seed=57&tod=morning&dog=generated');
    m.ui.changeShotgun('over-under');
    expect(m.gun.equipGun).toHaveBeenCalledWith(m.ctx, 'over-under');
    const url = new URL(m.location.href);
    expect(Object.fromEntries(url.searchParams)).toEqual({ area: 'pheasant-coverts', drop: 'west-track', seed: '57', tod: 'morning', dog: 'generated', gun: 'over-under' });
    expect(url.hash).toBe('#field');
    expect(m.data).toEqual({});
    expect(m.elements['shotgun-rack'].href).toBe('./shotguns3d.html?gun=over-under');
    expect(m.elements['shotgun-setting'].value).toBe('over-under');
    expect(m.elements['shotgun-equipped'].textContent).toContain('2-shell capacity');
    expect(m.renderOnce).toHaveBeenCalledOnce();
  });

  it('updates only the explicit Quick Hunt gun using the latest configuration', () => {
    const m = menu('?play=quick&drop=west-track&seed=57');
    saveCareer(emptyCareer());
    const career = m.data[CAREER_KEY];
    const latest = { ...defaultQuickConfig(), areaId: 'pheasant-coverts', breedId: 'gsp', level: 9, gearTier: 3, weather: 'frost' as const };
    saveQuickConfig(latest);
    m.ui.changeShotgun('semi-auto');
    expect(loadQuickConfig()).toEqual({ ...latest, gunId: 'semi-auto' });
    expect(m.data[CAREER_KEY]).toBe(career);
    expect(m.replaceState).not.toHaveBeenCalled();
    expect(m.elements['shotgun-setting'].children).toHaveLength(4);
  });

  it('limits career choices to unlocked guns and preserves fresh career progress', () => {
    const m = menu('?play=career&area=pheasant-coverts&seed=57');
    saveQuickConfig(defaultQuickConfig());
    const quick = m.data[QUICK_KEY];
    const career = emptyCareer(); career.hunter.level = 3; career.downed = 17;
    saveCareer(career);
    const before = loadCareer();
    m.ui.refreshShotgunMenu();
    expect(m.elements['shotgun-setting'].children.map(option => option.value)).toEqual(['remington-870', 'semi-auto']);
    m.ui.changeShotgun('side-by-side');
    expect(m.gun.equipGun).not.toHaveBeenCalled();
    expect(loadCareer()).toEqual(before);
    m.ui.changeShotgun('semi-auto');
    expect(loadCareer()).toEqual({ ...before, hunter: { ...before.hunter, shotgunId: 'semi-auto' } });
    expect(m.data[QUICK_KEY]).toBe(quick);
    expect(m.replaceState).not.toHaveBeenCalled();
  });

  it('leaves preferences alone when gameplay is active or equip is rejected', () => {
    const m = menu('?play=quick'); saveQuickConfig(defaultQuickConfig());
    const saved = m.data[QUICK_KEY];
    m.ctx.paused = false; m.ui.changeShotgun('semi-auto');
    expect(m.gun.equipGun).not.toHaveBeenCalled();
    m.ctx.paused = true; m.gun.equipGun.mockReturnValue(false); m.ui.changeShotgun('semi-auto');
    expect(m.data[QUICK_KEY]).toBe(saved);
    expect(m.replaceState).not.toHaveBeenCalled();
    expect(m.renderOnce).not.toHaveBeenCalled();
  });
});
