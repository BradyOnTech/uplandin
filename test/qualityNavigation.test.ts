import { afterEach, describe, expect, it, vi } from 'vitest';
import { build3DPreparationHref } from '../src/game/gameplayMode';
import { nextHuntUrl } from '../src/game/huntSeed';
import { preferredQuality } from '../src/three/fieldInterface';

afterEach(() => vi.unstubAllGlobals());

function device(touch: boolean, saved: string | null = null) {
  const setItem = vi.fn();
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('matchMedia', () => ({ matches: touch }));
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'uplandin.3d.quality' ? saved : null, setItem });
  return setItem;
}

describe('graphics choice across field and preparation', () => {
  it.each(['lite', 'high', 'auto'])('preserves explicit %s through results and a fresh hunt', quality => {
    const field = `https://game.test/index3d.html?play=quick&drop=south-gate&quality=${quality}&seed=57`;
    const preparation = new URL(build3DPreparationHref(new URL(field).search, 'pheasant-coverts', 'south-gate'), field);
    expect(Object.fromEntries(preparation.searchParams)).toEqual({ mode: 'quick', area: 'pheasant-coverts', drop: 'south-gate', quality });
    const again = nextHuntUrl(field);
    expect(again.searchParams.get('quality')).toBe(quality);
    expect(again.searchParams.has('seed')).toBe(false);
  });

  it('preserves career mode and a later explicit field selection', () => {
    const field = new URL('https://game.test/index3d.html?play=career&area=quail-fields&quality=auto');
    field.searchParams.set('quality', 'high');
    const preparation = new URL(build3DPreparationHref(field.search, 'quail-fields', 'west-track'), field);
    expect(preparation.searchParams.get('mode')).toBe('career');
    expect(preparation.searchParams.get('quality')).toBe('high');
  });

  it.each(['', '?quality=invalid'])('does not invent a preference for a legacy or malformed launch: %s', search => {
    const preparation = new URL(build3DPreparationHref(search, 'quail-fields', 'south-gate'), 'https://game.test');
    expect(preparation.searchParams.has('quality')).toBe(false);
  });

  it.each([[true, 'high', 'high'], [false, 'lite', 'lite'], [true, null, 'lite'], [false, null, 'high']] as const)(
    'Auto retains the device preference without recording its effective tier (touch=%s, saved=%s)', (touch, saved, effective) => {
      const setItem = device(touch, saved);
      const params = new URLSearchParams('quality=auto');
      expect(preferredQuality(params)).toBe(effective);
      const preparation = new URL(build3DPreparationHref(params.toString(), 'quail-fields', 'south-gate'), 'https://game.test');
      expect(preparation.searchParams.get('quality')).toBe('auto');
      expect(setItem).not.toHaveBeenCalled();
    });

  it('keeps legacy saved choices and honors an explicit override when storage is unavailable', () => {
    device(false, 'lite');
    expect(preferredQuality(new URLSearchParams())).toBe('lite');
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); } });
    expect(preferredQuality(new URLSearchParams('quality=lite'))).toBe('lite');
    expect(preferredQuality(new URLSearchParams('quality=auto'))).toBe('high');
  });
});
