/**
 * Career stats: pure accumulation logic plus a thin localStorage shell.
 * The pure parts are unit-tested; the IO degrades silently when storage
 * is unavailable (private mode, embedded webviews).
 */

export interface AreaRecord {
  hunts: number;
  downed: number;
  escaped: number;
  /** Most birds downed in a single hunt in this area. */
  best: number;
}

export interface Career {
  hunts: number;
  downed: number;
  escaped: number;
  areas: Record<string, AreaRecord>;
}

export function emptyCareer(): Career {
  return { hunts: 0, downed: 0, escaped: 0, areas: {} };
}

/** Record a finished hunt. Pure: returns a new Career. */
export function recordHunt(career: Career, areaId: string, downed: number, escaped: number): Career {
  const prev = career.areas[areaId] ?? { hunts: 0, downed: 0, escaped: 0, best: 0 };
  return {
    hunts: career.hunts + 1,
    downed: career.downed + downed,
    escaped: career.escaped + escaped,
    areas: {
      ...career.areas,
      [areaId]: {
        hunts: prev.hunts + 1,
        downed: prev.downed + downed,
        escaped: prev.escaped + escaped,
        best: Math.max(prev.best, downed),
      },
    },
  };
}

export const CAREER_KEY = 'uplandin.career.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadCareer(storage: StorageLike | null = defaultStorage()): Career {
  if (!storage) return emptyCareer();
  try {
    const raw = storage.getItem(CAREER_KEY);
    if (!raw) return emptyCareer();
    const parsed = JSON.parse(raw) as Partial<Career>;
    return { ...emptyCareer(), ...parsed, areas: parsed.areas ?? {} };
  } catch {
    return emptyCareer();
  }
}

export function saveCareer(career: Career, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(CAREER_KEY, JSON.stringify(career));
  } catch {
    // storage full or blocked — career simply doesn't persist
  }
}
