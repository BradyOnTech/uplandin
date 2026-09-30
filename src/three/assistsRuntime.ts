import { HUNT_ASSISTS_EVENT, resolveHuntAssists, saveHuntAssists, type HuntAssists } from '../game/huntAssists';

/** The field's live assists: read once from the save and URL, then changed
 * in place from any menu. Subsystems read current() each frame or listen. */
const storage = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const search = () => typeof location === 'undefined' ? '' : location.search;

let current: HuntAssists | null = null;
let resolvedFor = '';

export function huntAssists(): HuntAssists {
  // A new page address (a new hunt, or a test fixture) reads the save again.
  if (!current || resolvedFor !== search()) { current = resolveHuntAssists(search(), storage()); resolvedFor = search(); }
  return current;
}

export function setHuntAssists(next: HuntAssists): void {
  current = { ...next }; resolvedFor = search();
  saveHuntAssists(current, storage());
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(HUNT_ASSISTS_EVENT, { detail: current }));
  }
}

export function onHuntAssists(listener: (assists: HuntAssists) => void, signal?: AbortSignal): void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener(HUNT_ASSISTS_EVENT, event => listener((event as CustomEvent<HuntAssists>).detail), { signal });
}

/** Tests and a fresh page load start from the save again. */
export function resetHuntAssistsForTest(): void { current = null; }
