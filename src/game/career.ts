import { levelForXp } from './breeds';

/**
 * Career persistence v2: hunt totals plus the kennel, the hunter profile,
 * and unlocked regions. Pure logic is unit-tested; the localStorage shell
 * degrades silently when storage is unavailable.
 */

export interface AreaRecord {
  hunts: number;
  downed: number;
  escaped: number;
  /** Most birds downed in a single hunt in this area. */
  best: number;
}

export interface KennelDog {
  id: string;
  name: string;
  breedId: string;
  level: number;
  xp: number;
}

export interface HunterProfile {
  level: number;
  xp: number;
  shotgunId: string;
  truckTier: number;
  dogBoxTier: number;
}

export interface Career {
  version: 2;
  hunts: number;
  downed: number;
  escaped: number;
  areas: Record<string, AreaRecord>;
  kennel: KennelDog[];
  activeDogId: string | null;
  hunter: HunterProfile;
  regionsUnlocked: string[];
}

export const STARTER_REGION = 'southern-plains';
export const STARTER_SHOTGUN = 'remington-870';

export function emptyCareer(): Career {
  return {
    version: 2,
    hunts: 0,
    downed: 0,
    escaped: 0,
    areas: {},
    kennel: [],
    activeDogId: null,
    hunter: { level: 1, xp: 0, shotgunId: STARTER_SHOTGUN, truckTier: 0, dogBoxTier: 1 },
    regionsUnlocked: [STARTER_REGION],
  };
}

/** Record a finished hunt. Pure: returns a new Career. */
export function recordHunt(career: Career, areaId: string, downed: number, escaped: number): Career {
  const prev = career.areas[areaId] ?? { hunts: 0, downed: 0, escaped: 0, best: 0 };
  return {
    ...career,
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

/** Add a dog to the kennel; the first dog becomes the active dog. */
export function addDogToKennel(
  career: Career,
  name: string,
  breedId: string,
): { career: Career; dog: KennelDog } {
  const dog: KennelDog = {
    id: `dog-${career.kennel.length + 1}`,
    name,
    breedId,
    level: 1,
    xp: 0,
  };
  return {
    dog,
    career: {
      ...career,
      kennel: [...career.kennel, dog],
      activeDogId: career.activeDogId ?? dog.id,
    },
  };
}

/** Award XP to a dog. Pure. Returns the new career plus level-up info. */
export function awardDogXp(
  career: Career,
  dogId: string,
  amount: number,
): { career: Career; newLevel: number; levelsGained: number } {
  const dog = career.kennel.find((d) => d.id === dogId);
  if (!dog || amount <= 0) {
    return { career, newLevel: dog?.level ?? 1, levelsGained: 0 };
  }
  const xp = dog.xp + amount;
  const newLevel = levelForXp(xp);
  const updated: KennelDog = { ...dog, xp, level: newLevel };
  return {
    career: {
      ...career,
      kennel: career.kennel.map((d) => (d.id === dogId ? updated : d)),
    },
    newLevel,
    levelsGained: newLevel - dog.level,
  };
}

export function activeDog(career: Career): KennelDog | null {
  return career.kennel.find((d) => d.id === career.activeDogId) ?? null;
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

/** v1 saves held only totals; wrap them in the v2 shell. */
function migrate(parsed: Record<string, unknown>): Career {
  const base = emptyCareer();
  if (parsed.version === 2) {
    const v2 = parsed as Partial<Career>;
    return {
      ...base,
      ...v2,
      areas: v2.areas ?? {},
      kennel: v2.kennel ?? [],
      hunter: { ...base.hunter, ...v2.hunter },
      regionsUnlocked: v2.regionsUnlocked ?? base.regionsUnlocked,
    };
  }
  return {
    ...base,
    hunts: typeof parsed.hunts === 'number' ? parsed.hunts : 0,
    downed: typeof parsed.downed === 'number' ? parsed.downed : 0,
    escaped: typeof parsed.escaped === 'number' ? parsed.escaped : 0,
    areas: (parsed.areas as Career['areas']) ?? {},
  };
}

export function loadCareer(storage: StorageLike | null = defaultStorage()): Career {
  if (!storage) return emptyCareer();
  try {
    const raw = storage.getItem(CAREER_KEY);
    if (!raw) return emptyCareer();
    return migrate(JSON.parse(raw) as Record<string, unknown>);
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
