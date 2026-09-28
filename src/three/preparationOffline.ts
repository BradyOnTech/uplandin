import { AREAS } from '../game/areas';
import type { StorageLike } from '../game/career';
import { parseHuntChallenge } from '../game/huntChallenge';
import { normalizeQuickConfig, type QuickConfig } from '../game/quick';
import { loadInstalledHuntChoices } from './offline';

export const PREPARATION_CHOICES_KEY = 'uplandin.3d.preparation-choices.v1';
export const PREPARATION_DRAFT_KEY = 'uplandin.3d.preparation-update-draft.v1';
export interface PreparationView {
  mode: 'quick' | 'career'; areaId: string; dropPointId: string;
  challenge: string; quality: string; light: string; coat?: string; controls?: string;
}
export interface PreparationDraft extends PreparationView {
  quick: QuickConfig; dogId: string; braceId: string; gunId: string; addingDog: boolean;
  puppyDraft: { breedId: string; name: string; homeRegionId: string };
  propertyDrafts: Record<'quick' | 'career', { areaId: string; dropPointId: string }>;
}
type DraftStorage = StorageLike & { removeItem(key: string): void };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 100;
const read = (storage: StorageLike | null, key: string): unknown => {
  try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; }
};
function view(value: unknown): PreparationView | null {
  if (!record(value) || !['quick', 'career'].includes(String(value.mode)) || !text(value.areaId) || !text(value.dropPointId)) return null;
  const area = AREAS.find(area => area.id === value.areaId);
  if (!area) return null;
  return { mode: value.mode as PreparationView['mode'], areaId: area.id,
    dropPointId: area.dropPoints.some(drop => drop.id === value.dropPointId) ? value.dropPointId : area.dropPoints[0].id,
    challenge: parseHuntChallenge(typeof value.challenge === 'string' ? value.challenge : null), quality: ['auto', 'lite', 'high'].includes(String(value.quality)) ? String(value.quality) : 'auto',
    light: ['morning', 'noon', 'evening'].includes(String(value.light)) ? String(value.light) : 'morning',
    ...(text(value.coat) ? { coat: value.coat } : {}), ...(text(value.controls) ? { controls: value.controls } : {}) };
}

/** Installed entry restores the last committed outing; ordinary deep links stay explicit.
 * A legacy direct-field install migrates to an editable Quick draft, never a career write. */
export function preparationInstalledEntry(href: string, quick: QuickConfig, storage: StorageLike | null): { url: URL; quick: QuickConfig } {
  const url = new URL(href);
  if (url.searchParams.get('installed') !== '1') return { url, quick };
  const saved = view(read(storage, PREPARATION_CHOICES_KEY));
  const fallback = saved ? null : loadInstalledHuntChoices(storage);
  const choices = saved ? new URLSearchParams({ mode: saved.mode, area: saved.areaId, drop: saved.dropPointId,
    challenge: saved.challenge, quality: saved.quality, tod: saved.light,
    ...(saved.coat ? { coat: saved.coat } : {}), ...(saved.controls ? { controls: saved.controls } : {}) }) : fallback!;
  const explicitArea = url.searchParams.has('area');
  for (const key of ['mode', 'area', 'drop', 'challenge', 'quality', 'tod', 'coat', 'controls']) {
    if (key === 'drop' && explicitArea) continue;
    const value = choices.get(key);
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  url.searchParams.delete('installed'); url.searchParams.delete('seed');
  if (url.searchParams.get('mode') !== 'career' && (fallback || url.searchParams.has('breed') || url.searchParams.has('gun'))) quick = normalizeQuickConfig({ ...quick,
    ...((url.searchParams.get('breed') ?? fallback?.get('breed')) ? { breedId: (url.searchParams.get('breed') ?? fallback?.get('breed'))! } : {}),
    ...((url.searchParams.get('gun') ?? fallback?.get('gun')) ? { gunId: (url.searchParams.get('gun') ?? fallback?.get('gun'))! } : {}),
    ...(url.searchParams.get('area') ? { areaId: url.searchParams.get('area')! } : {}),
  });
  return { url, quick };
}

/** Called only after a launch has passed the existing save/eligibility transaction. */
export function rememberPreparationLaunch(choice: PreparationView, storage: StorageLike | null): void {
  const parsed = view(choice);
  if (!parsed) return;
  try { storage?.setItem(PREPARATION_CHOICES_KEY, JSON.stringify(parsed)); } catch { /* Optional preferences never block a hunt. */ }
}

function draft(value: unknown): PreparationDraft | null {
  const parsed = view(value);
  if (!parsed || !record(value) || !record(value.quick) || !record(value.puppyDraft) || !record(value.propertyDrafts)) return null;
  if (!['dogId', 'braceId', 'gunId'].every(key => text(value[key])) || typeof value.addingDog !== 'boolean') return null;
  const puppy = value.puppyDraft;
  if (!['breedId', 'name', 'homeRegionId'].every(key => text(puppy[key]))) return null;
  if (!Number.isFinite(value.quick.level) || !Number.isFinite(value.quick.gearTier)) return null;
  for (const mode of ['quick', 'career']) {
    const property = value.propertyDrafts[mode];
    if (!record(property) || !text(property.areaId) || !text(property.dropPointId)) return null;
  }
  return { ...parsed, quick: normalizeQuickConfig(value.quick), dogId: String(value.dogId), braceId: String(value.braceId), gunId: String(value.gunId),
    addingDog: value.addingDog, puppyDraft: value.puppyDraft as PreparationDraft['puppyDraft'], propertyDrafts: value.propertyDrafts as PreparationDraft['propertyDrafts'] };
}

/** No career/Quick save is written. A failed round trip makes reloading unsafe. */
export function preservePreparationDraft(href: string, value: PreparationDraft, storage: DraftStorage | null): boolean {
  if (!storage) return false;
  const serialized = JSON.stringify({ href, draft: value });
  try { storage.setItem(PREPARATION_DRAFT_KEY, serialized); return storage.getItem(PREPARATION_DRAFT_KEY) === serialized; } catch { return false; }
}
export function discardPreparationDraft(storage: DraftStorage | null): void {
  try { storage?.removeItem(PREPARATION_DRAFT_KEY); } catch { /* Optional session storage. */ }
}
/** One reload, one URL. Fresh career state is loaded independently by preparation. */
export function consumePreparationDraft(href: string, storage: DraftStorage | null): PreparationDraft | null {
  const saved = read(storage, PREPARATION_DRAFT_KEY); discardPreparationDraft(storage);
  return record(saved) && saved.href === href ? draft(saved.draft) : null;
}
