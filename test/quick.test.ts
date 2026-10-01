import { describe, expect, it } from 'vitest';
import { AREAS } from '../src/game/areas';
import { BREEDS } from '../src/game/breeds';
import type { StorageLike } from '../src/game/career';
import {
  cycleId,
  defaultQuickConfig,
  loadQuickConfig,
  normalizeQuickConfig,
  QUICK_KEY,
  saveQuickConfig,
  WIND_CHOICES,
} from '../src/game/quick';

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('quick hunt config', () => {
  it('defaults are legal values', () => {
    const cfg = defaultQuickConfig();
    expect(BREEDS.some((b) => b.id === cfg.breedId)).toBe(true);
    expect(AREAS.some((a) => a.id === cfg.areaId)).toBe(true);
    expect(WIND_CHOICES).toContain(cfg.wind);
    expect(cfg.level).toBeGreaterThanOrEqual(1);
    expect(cfg.level).toBeLessThanOrEqual(10);
  });

  it('cycleId wraps both directions', () => {
    const ids = ['a', 'b', 'c'];
    expect(cycleId(ids, 'a', 1)).toBe('b');
    expect(cycleId(ids, 'c', 1)).toBe('a');
    expect(cycleId(ids, 'a', -1)).toBe('c');
  });

  it('normalize repairs junk values', () => {
    const cfg = normalizeQuickConfig({ breedId: 'nope', level: 99, areaId: 'gone', wind: 'hurricane' as never });
    expect(cfg.breedId).toBe(defaultQuickConfig().breedId);
    expect(cfg.areaId).toBe(defaultQuickConfig().areaId);
    expect(cfg.wind).toBe('random');
    expect(cfg.level).toBe(10); // clamped, not reset
    expect(normalizeQuickConfig({ level: -3 }).level).toBe(1);
    expect(normalizeQuickConfig({ level: 7.6 }).level).toBe(8);
  });

  it('persists and reloads the last setup', () => {
    const storage = memoryStorage();
    const cfg = {
      breedId: 'irish-setter',
      level: 3,
      areaId: 'chukar-ridge',
      wind: 'strong' as const,
      gunId: 'over-under',
      gearTier: 3,
      breed2Id: 'gsp',
      weather: 'frost' as const,
    };
    saveQuickConfig(cfg, storage);
    expect(loadQuickConfig(storage)).toEqual(cfg);
  });

  it('returns a setup saved on a hidden ground to the default ground', () => {
    expect(normalizeQuickConfig({ areaId: 'grouse-woods' }).areaId).toBe('quail-fields');
    expect(normalizeQuickConfig({ areaId: 'sharptail-prairie' }).areaId).toBe('sharptail-prairie');
  });

  it('older saved setups gain gun, gear, second-dog, and weather defaults', () => {
    const storage = memoryStorage();
    storage.data[QUICK_KEY] = JSON.stringify({ breedId: 'vizsla', level: 4, areaId: 'quail-fields', wind: 'calm' });
    const cfg = loadQuickConfig(storage);
    expect(cfg.gunId).toBe('remington-870');
    expect(cfg.gearTier).toBe(1);
    expect(cfg.breed2Id).toBe('none');
    expect(cfg.weather).toBe('random');
  });

  it('falls back to defaults on missing or corrupt storage', () => {
    expect(loadQuickConfig(null)).toEqual(defaultQuickConfig());
    const storage = memoryStorage();
    storage.data[QUICK_KEY] = '{not json';
    expect(loadQuickConfig(storage)).toEqual(defaultQuickConfig());
  });
});
