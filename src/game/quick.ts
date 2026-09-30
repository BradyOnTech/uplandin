import { AREAS } from './areas';
import { BREEDS, LEVEL_CAP } from './breeds';
import type { StorageLike } from './career';
import { CONDITIONS, type Condition } from './conditions';
import { GUNS } from './guns';
import { resolveCoatFor } from './dogCoats';
import { clamp } from './math';
import type { WindStrength } from './wind';

/**
 * Quick Hunt: everything unlocked, pick the exact hunt you want. The career
 * save is never touched — no XP, no records. Career mode keeps the coin
 * slot; this is the free-play switch (and the debugging surface).
 */
export interface QuickConfig {
  /** First falconry slice: one finished GSP on Cattail Coverts, in 3D. */
  huntingMethod?: 'shotgun' | 'goshawk';
  breedId: string;
  /** Lead dog's coat for its 3D model. */
  coatId?: string;
  level: number;
  areaId: string;
  wind: WindStrength | 'random';
  gunId: string;
  /** Dog tracking gear tier 0-3: bell, beeper, GPS, GPS+map. */
  gearTier: number;
  /** Second dog's breed for a brace, or 'none' to hunt solo. */
  breed2Id: string;
  /** Second dog's coat for its 3D model. */
  coat2Id?: string;
  /** The day's weather, or 'random' to roll it. */
  weather: Condition | 'random';
}

export const WEATHER_CHOICES: (Condition | 'random')[] = ['random', ...CONDITIONS];

export const WIND_CHOICES: (WindStrength | 'random')[] = ['random', 'calm', 'breezy', 'strong'];

export function defaultQuickConfig(): QuickConfig {
  return {
    breedId: BREEDS[0].id,
    level: 5,
    areaId: AREAS[0].id,
    wind: 'random',
    gunId: GUNS[0].id,
    gearTier: 1,
    breed2Id: 'none',
    weather: 'random',
  };
}

/** Step through a list of ids in either direction, wrapping at the ends. */
export function cycleId<T>(list: T[], current: T, dir: 1 | -1): T {
  const i = list.indexOf(current);
  return list[(i + dir + list.length) % list.length];
}

/** Sanitize a stored/edited config back to legal values. */
export function normalizeQuickConfig(cfg: Partial<QuickConfig>): QuickConfig {
  const base = defaultQuickConfig();
  if (cfg.huntingMethod === 'goshawk') cfg = { ...cfg, breedId: 'gsp', level: LEVEL_CAP, breed2Id: 'none', areaId: 'pheasant-coverts' };
  const normalized: QuickConfig = {
    ...(cfg.huntingMethod ? { huntingMethod: cfg.huntingMethod === 'goshawk' ? 'goshawk' as const : 'shotgun' as const } : {}),
    breedId: BREEDS.some((b) => b.id === cfg.breedId) ? cfg.breedId! : base.breedId,
    level: clamp(Math.round(cfg.level ?? base.level), 1, LEVEL_CAP),
    areaId: AREAS.some((a) => a.id === cfg.areaId) ? cfg.areaId! : base.areaId,
    wind: WIND_CHOICES.includes(cfg.wind as WindStrength | 'random') ? (cfg.wind as QuickConfig['wind']) : base.wind,
    gunId: GUNS.some((g) => g.id === cfg.gunId) ? cfg.gunId! : base.gunId,
    gearTier: clamp(Math.round(cfg.gearTier ?? base.gearTier), 0, 3),
    breed2Id: cfg.breed2Id === 'none' || BREEDS.some((b) => b.id === cfg.breed2Id) ? cfg.breed2Id! : 'none',
    weather: WEATHER_CHOICES.includes(cfg.weather as Condition | 'random')
      ? (cfg.weather as QuickConfig['weather'])
      : 'random',
  };
  // Coats are only meaningful for the chosen breed's model; keep them valid.
  if (cfg.coatId !== undefined) normalized.coatId = resolveCoatFor(normalized.breedId, cfg.coatId);
  if (cfg.coat2Id !== undefined && normalized.breed2Id !== 'none') normalized.coat2Id = resolveCoatFor(normalized.breed2Id, cfg.coat2Id);
  return normalized;
}

export const QUICK_KEY = 'uplandin.quick.v1';

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Last-used quick setup, so re-testing the same hunt is one tap. */
export function loadQuickConfig(storage: StorageLike | null = defaultStorage()): QuickConfig {
  if (!storage) return defaultQuickConfig();
  try {
    const raw = storage.getItem(QUICK_KEY);
    if (!raw) return defaultQuickConfig();
    return normalizeQuickConfig(JSON.parse(raw) as Partial<QuickConfig>);
  } catch {
    return defaultQuickConfig();
  }
}

export function saveQuickConfig(cfg: QuickConfig, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(QUICK_KEY, JSON.stringify(cfg));
  } catch {
    // storage full or blocked — the setup just doesn't persist
  }
}
