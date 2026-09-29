import { AREAS } from './areas';
import { loadCareer, type StorageLike } from './career';
import { build3DPreparationHref } from './gameplayMode';
import { commitCareerLaunch, commitQuickLaunch } from './huntPreparation';
import { loadQuickConfig, type QuickConfig } from './quick';

export interface ClassicFieldData {
  areaId: string;
  dropPointId: string;
  quick?: QuickConfig;
}
export type ClassicLaunch = { kind: 'field'; data: ClassicFieldData }
  | { kind: 'redirect'; href: string };

function defaultStorage(): StorageLike | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Results return to the common field book without switching renderers. */
export function buildClassicPreparationHref(search: string, areaId: string, dropPointId: string): string {
  return `${build3DPreparationHref(search, areaId, dropPointId)}&renderer=2d`;
}

function recoveryHref(search: string, areaId?: string): string {
  const requested = new URLSearchParams(search);
  const params = new URLSearchParams({ renderer: '2d', mode: requested.get('play') === 'career' ? 'career' : 'quick' });
  const area = AREAS.find(candidate => candidate.id === areaId);
  if (area) {
    params.set('area', area.id);
    const drop = area.dropPoints.find(candidate => candidate.id === requested.get('drop'));
    if (drop) params.set('drop', drop.id);
  }
  const quality = requested.get('quality');
  if (quality === 'auto' || quality === 'lite' || quality === 'high') params.set('quality', quality);
  return `./prepare3d.html?${params}`;
}

/**
 * A fresh classic field has the same validated preparation rules as 3D.
 * Read current saves again at the page boundary; never settle, advance the
 * calendar, persist a loadout, or reconstruct an in-progress FlushScene here.
 */
export function resolveClassicLaunch(search: string, storage: StorageLike | null = defaultStorage()): ClassicLaunch {
  const params = new URLSearchParams(search), kind = params.get('play');
  if (kind !== 'career' && kind !== 'quick') return { kind: 'redirect', href: './home3d.html' };
  const drop = params.get('drop') ?? undefined;
  if (kind === 'career') {
    const areaId = params.get('area') ?? '';
    const result = commitCareerLaunch(loadCareer(storage), { areaId, dropPointId: drop });
    return result.ok
      ? { kind: 'field', data: { areaId, dropPointId: result.dropPointId } }
      : { kind: 'redirect', href: recoveryHref(search, areaId) };
  }
  const config = loadQuickConfig(storage);
  const result = commitQuickLaunch({ ...config, ...(params.get('method') === 'goshawk' ? { huntingMethod: 'goshawk' as const } : {}) }, drop);
  if (!result.ok) return { kind: 'redirect', href: recoveryHref(search, config.areaId) };
  if (result.config.huntingMethod === 'goshawk') {
    // Falconry has no classic renderer; preserve the established 3D exception.
    const url = new URL(result.href, 'https://uplandin.invalid/');
    for (const key of ['quality', 'tod', 'controls', 'challenge', 'coat']) {
      const value = params.get(key);
      if (value && value.length <= 80) url.searchParams.set(key, value);
    }
    return { kind: 'redirect', href: `./index3d.html?${url.searchParams}` };
  }
  return { kind: 'field', data: { areaId: result.config.areaId, dropPointId: result.dropPointId, quick: result.config } };
}
