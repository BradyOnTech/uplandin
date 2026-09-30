import { describe, expect, it } from 'vitest';
import { ASSIST_PRESETS, HUNT_ASSISTS_KEY, effectiveGearTier, matchingPreset, presetAssists, resolveHuntAssists, saveHuntAssists, type AssistPreset } from '../src/game/huntAssists';

const memory = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v) }; };

describe('hunt assists', () => {
  it('each preset is recognised, and changing one assist makes it custom', () => {
    for (const id of Object.keys(ASSIST_PRESETS) as AssistPreset[]) expect(matchingPreset(presetAssists(id))).toBe(id);
    expect(matchingPreset({ ...presetAssists('seasoned'), aimRing: true })).toBeNull();
    // Dog range is a dog preference, not a difficulty.
    expect(matchingPreset({ ...presetAssists('purist'), dogRange: 'big' })).toBe('purist');
  });

  it('presets step down from GPS and a map to a bell and no map', () => {
    const tiers = (['guided', 'standard', 'seasoned', 'purist'] as const).map(id => effectiveGearTier(presetAssists(id), null));
    expect(tiers).toEqual([3, 2, 1, 0]);
    expect(presetAssists('purist').surveyMap).toBe(false);
    expect(presetAssists('seasoned').aimRing).toBe(false);
  });

  it('a career hunter can leave gear at home but never carry more than earned', () => {
    expect(effectiveGearTier(presetAssists('guided'), 1)).toBe(1);
    expect(effectiveGearTier(presetAssists('purist'), 3)).toBe(0);
  });

  it('round-trips a save and lets the URL override single assists', () => {
    const storage = memory();
    expect(resolveHuntAssists('', storage)).toEqual(presetAssists('guided'));
    saveHuntAssists({ ...presetAssists('seasoned'), dogRange: 'big' }, storage);
    expect(resolveHuntAssists('', storage)).toEqual({ ...presetAssists('seasoned'), dogRange: 'big' });
    expect(resolveHuntAssists('?ring=1&range=close&tracking=gps', storage)).toMatchObject({ aimRing: true, dogRange: 'close', tracking: 'gps' });
    expect(resolveHuntAssists('?assists=purist', storage)).toEqual({ ...presetAssists('purist'), dogRange: 'big' });
    storage.setItem(HUNT_ASSISTS_KEY, '{broken');
    expect(resolveHuntAssists('', storage)).toEqual(presetAssists('guided'));
  });
});
