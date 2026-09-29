import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHuntLaunch } from '../src/game/gameplayMode';
import { FieldInterface } from '../src/three/fieldInterface';

vi.mock('../src/audio', () => ({ setAudioEnabled: vi.fn(), unlockAudio: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

function menu(search: string) {
  const classes = new Set<string>();
  const review = { hidden: true, innerHTML: '', attributes: new Map<string, string>(),
    setAttribute(key: string, value: string) { this.attributes.set(key, value); } };
  const preparation = { textContent: 'Hunt preparation' };
  vi.stubGlobal('document', { getElementById: (id: string) => id === 'field-arrival-review' ? review : preparation });
  const pause = vi.fn();
  const ui = Object.assign(Object.create(FieldInterface.prototype), {
    launch: parseHuntLaunch(search), entered: false, arrivalReviewExpanded: false,
    readyState: false, lostContext: false, complete: false, engine: { pause },
    overlay: { classList: { toggle(name: string, value: boolean) { if (value) classes.add(name); else classes.delete(name); } } },
  }) as { syncArrivalMenu(forceFull?: boolean): void; arrivalReviewExpanded: boolean; entered: boolean; readyState: boolean; lostContext: boolean; complete: boolean };
  return { ui, classes, review, preparation, pause };
}

describe('prepared hunt arrival menu', () => {
  it.each(['?play=quick', '?play=career&area=chukar-ridge', '?play=quick&method=goshawk'])('gives %s a compact arrival without changing loading or simulation', search => {
    const m = menu(search); m.ui.syncArrivalMenu();
    expect([...m.classes]).toEqual(['prepared-arrival']);
    expect(m.review.hidden).toBe(false);
    expect(m.review.attributes.get('aria-expanded')).toBe('false');
    expect(m.preparation.textContent).toBe('Back to preparation');
    expect(m.ui.readyState).toBe(false); expect(m.ui.complete).toBe(false);
    expect(m.pause).not.toHaveBeenCalled();
  });

  it.each(['?area=quail-fields', '?play=career', '?play=unknown'])('keeps %s in the full standalone field menu', search => {
    const m = menu(search); m.ui.syncArrivalMenu();
    expect(m.classes.size).toBe(0); expect(m.review.hidden).toBe(true);
    expect(m.preparation.textContent).toBe('Hunt preparation');
  });

  it('can reveal the existing setup and return to arrival while keeping failure authority unchanged', () => {
    const m = menu('?play=quick');
    m.ui.lostContext = true; m.ui.arrivalReviewExpanded = true; m.ui.syncArrivalMenu();
    expect([...m.classes]).toEqual(['prepared-arrival', 'review-expanded']);
    expect(m.review.attributes.get('aria-expanded')).toBe('true');
    expect(m.review.innerHTML).toContain('Back to arrival');
    m.ui.arrivalReviewExpanded = false; m.ui.syncArrivalMenu();
    expect([...m.classes]).toEqual(['prepared-arrival']);
    expect(m.ui.lostContext).toBe(true); expect(m.ui.readyState).toBe(false);
  });

  it('always restores the complete menu on pause and after entering, even after expanding review', () => {
    const m = menu('?play=career&area=quail-fields');
    m.ui.arrivalReviewExpanded = true; m.ui.syncArrivalMenu();
    m.ui.syncArrivalMenu(true);
    expect(m.classes.size).toBe(0); expect(m.review.hidden).toBe(true);
    m.ui.entered = true; m.ui.syncArrivalMenu();
    expect(m.classes.size).toBe(0); expect(m.review.hidden).toBe(true);
    expect(m.review.attributes.get('aria-expanded')).toBe('false');
    expect(m.preparation.textContent).toBe('Hunt preparation');
    expect(m.pause).not.toHaveBeenCalled();
  });
});
