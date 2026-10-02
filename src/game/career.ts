import { levelForXp } from './breeds';
import { hunterLevelForXp } from './progression';
import { advanceWeeks, nextSeason, startingDate, type SeasonDate } from './season';
import { sanitizeHuntJournal, type CareerJournalEntry } from './huntJournal';

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
  /** The season this dog's career started — age derives from the calendar. */
  bornSeason: number;
  /** Coat id for the breed's 3D model. Absent on older saves: the breed default. */
  coatId?: string;
  /** Where and when it first pointed a bird: the pup's first point. */
  firstPoint?: DogFirstPoint;
  /** Career totals since this record began (older saves start at their next hunt). */
  lifetime?: DogLifetime;
  /** The season its handler named as its last. */
  lastSeason?: number;
  /** Retired to the porch when its last season ended; it hunts no more. */
  retiredSeason?: number;
}

export interface DogFirstPoint { huntNumber: number; areaId: string; season: number }
export interface DogLifetime { hunts: number; points: number; retrieves: number }

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
  /** Second dog for two-dog hunts (hunter lv 7+); null hunts solo. */
  braceDogId: string | null;
  hunter: HunterProfile;
  regionsUnlocked: string[];
  /** Where the season calendar stands. */
  date: SeasonDate;
  /** Home ground: hunts here cost 1 week, trips elsewhere cost 2. */
  homeRegionId: string | null;
  /** Latest settled hunts, newest first. Absent on saves made before the journal. */
  recentHunts?: CareerJournalEntry[];
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
    braceDogId: null,
    hunter: { level: 1, xp: 0, shotgunId: STARTER_SHOTGUN, truckTier: 0, dogBoxTier: 1 },
    regionsUnlocked: [STARTER_REGION],
    date: startingDate(),
    homeRegionId: null,
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
  coatId?: string,
): { career: Career; dog: KennelDog } {
  const dog: KennelDog = {
    id: `dog-${career.kennel.length + 1}`,
    name,
    breedId,
    level: 1,
    xp: 0,
    bornSeason: career.date.season,
    ...(coatId ? { coatId } : {}),
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

/** A dog that has yet to point a bird for this hunter. A dog from an older
 * save that was already earning experience before the record began has. */
export function awaitsFirstPoint(dog: KennelDog): boolean {
  if (dog.firstPoint) return false;
  return dog.lifetime ? dog.lifetime.points === 0 : dog.xp === 0;
}

/** One hunt's work into a dog's record, noting its first point. Pure. */
export function recordDogHunt(
  career: Career,
  dogId: string,
  work: { points: number; retrieves: number },
  at: DogFirstPoint,
): { career: Career; firstPoint: boolean } {
  const dog = career.kennel.find((d) => d.id === dogId);
  if (!dog) return { career, firstPoint: false };
  const firstPoint = work.points > 0 && awaitsFirstPoint(dog);
  const before = dog.lifetime ?? { hunts: 0, points: 0, retrieves: 0 };
  const updated: KennelDog = {
    ...dog,
    lifetime: { hunts: before.hunts + 1, points: before.points + work.points, retrieves: before.retrieves + work.retrieves },
    ...(firstPoint ? { firstPoint: { ...at } } : {}),
  };
  return { career: { ...career, kennel: career.kennel.map((d) => (d.id === dogId ? updated : d)) }, firstPoint };
}

/** From its eighth season a dog is slowing down, and its handler may name its last. */
export const LAST_SEASON_AGE = 8;

export function isRetired(dog: KennelDog): boolean {
  return dog.retiredSeason !== undefined;
}

/** The dogs that still hunt; retired dogs keep their place in the record. */
export function workingDogs(career: Career): KennelDog[] {
  return career.kennel.filter((d) => !isRetired(d));
}

export function inLastSeason(career: Career, dog: KennelDog): boolean {
  return !isRetired(dog) && dog.lastSeason === career.date.season;
}

export function canNameLastSeason(career: Career, dog: KennelDog): boolean {
  return !isRetired(dog) && dogAge(career, dog) >= LAST_SEASON_AGE;
}

/** Name this season as an old dog's last, or take it back. The game never
 * retires a dog on its own; only its handler decides. Pure. */
export function setLastSeason(career: Career, dogId: string, last: boolean): Career {
  const dog = career.kennel.find((d) => d.id === dogId);
  if (!dog || isRetired(dog) || (last && !canNameLastSeason(career, dog))) return career;
  return {
    ...career,
    kennel: career.kennel.map((d) => {
      if (d.id !== dogId) return d;
      const { lastSeason: _named, ...rest } = d;
      return last ? { ...rest, lastSeason: career.date.season } : rest;
    }),
  };
}

export function activeDog(career: Career): KennelDog | null {
  return career.kennel.find((d) => d.id === career.activeDogId && !isRetired(d)) ?? null;
}

/** Choose which kennel dog rides along. Unknown ids leave the career as-is. */
export function setActiveDog(career: Career, dogId: string): Career {
  if (!workingDogs(career).some((d) => d.id === dogId)) return career;
  // The lead dog can't also be its own bracemate.
  return { ...career, activeDogId: dogId, braceDogId: career.braceDogId === dogId ? null : career.braceDogId };
}

/** Pick (or clear, with null) the bracemate for two-dog hunts. */
export function setBraceDog(career: Career, dogId: string | null): Career {
  if (dogId === null) return { ...career, braceDogId: null };
  if (!workingDogs(career).some((d) => d.id === dogId) || dogId === career.activeDogId) return career;
  return { ...career, braceDogId: career.braceDogId === dogId ? null : dogId };
}

export function braceDog(career: Career): KennelDog | null {
  return career.kennel.find((d) => d.id === career.braceDogId && !isRetired(d)) ?? null;
}

/** How many seasons this dog has hunted, counting the current one. */
export function dogAge(career: Career, dog: KennelDog): number {
  return Math.max(1, career.date.season - dog.bornSeason + 1);
}

/** Pick where you live. Home hunts cost a week; everywhere else is a trip. */
export function setHomeRegion(career: Career, regionId: string): Career {
  return { ...career, homeRegionId: regionId };
}

/** A hunt (or a skipped week) moves the calendar. Pure. */
export function advanceCareerWeeks(career: Career, weeks: number): Career {
  return { ...career, date: advanceWeeks(career.date, weeks) };
}

/** Summer passes: the calendar rolls to next September and every dog is a
 * season older. A dog whose last season this was retires to the porch. */
export function rollToNextSeason(career: Career): Career {
  const ending = career.date.season;
  const kennel = career.kennel.map((d) => !isRetired(d) && d.lastSeason === ending ? { ...d, retiredSeason: ending } : d);
  const working = kennel.filter((d) => !isRetired(d));
  const keep = (id: string | null) => id !== null && working.some((d) => d.id === id) ? id : null;
  const activeDogId = keep(career.activeDogId) ?? working[0]?.id ?? null;
  const braceDogId = keep(career.braceDogId);
  return { ...career, kennel, activeDogId, braceDogId: braceDogId === activeDogId ? null : braceDogId, date: nextSeason(career.date) };
}

/** The seasons a retired dog hunted, counting its first and its last. */
export function seasonsHunted(dog: KennelDog): number {
  return Math.max(1, (dog.retiredSeason ?? dog.lastSeason ?? dog.bornSeason) - dog.bornSeason + 1);
}

/** Award hunter XP. Pure. Returns the new career plus level-up info. */
export function awardHunterXp(
  career: Career,
  amount: number,
): { career: Career; newLevel: number; levelsGained: number } {
  if (amount <= 0) return { career, newLevel: career.hunter.level, levelsGained: 0 };
  const xp = career.hunter.xp + amount;
  const newLevel = hunterLevelForXp(xp);
  return {
    career: { ...career, hunter: { ...career.hunter, xp, level: newLevel } },
    newLevel,
    levelsGained: newLevel - career.hunter.level,
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

const savedCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** A dog's optional records must never cost the player the dog. */
function readKennelDog(saved: KennelDog): KennelDog {
  const dog: KennelDog = { ...saved, bornSeason: (saved as Partial<KennelDog>).bornSeason ?? 1 };
  const first = dog.firstPoint as Partial<DogFirstPoint> | undefined;
  if (first !== undefined && !(first && savedCount(first.huntNumber) && typeof first.areaId === 'string' && savedCount(first.season))) delete dog.firstPoint;
  const life = dog.lifetime as Partial<DogLifetime> | undefined;
  if (life !== undefined && !(life && savedCount(life.hunts) && savedCount(life.points) && savedCount(life.retrieves))) delete dog.lifetime;
  if (dog.lastSeason !== undefined && !(savedCount(dog.lastSeason) && dog.lastSeason >= 1)) delete dog.lastSeason;
  if (dog.retiredSeason !== undefined && !(savedCount(dog.retiredSeason) && dog.retiredSeason >= 1)) delete dog.retiredSeason;
  return dog;
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
      // Pre-season saves: existing dogs count as born in season 1.
      kennel: (v2.kennel ?? []).map(readKennelDog),
      hunter: { ...base.hunter, ...v2.hunter },
      regionsUnlocked: v2.regionsUnlocked ?? base.regionsUnlocked,
      date: v2.date ?? base.date,
      homeRegionId: v2.homeRegionId ?? null,
      ...(v2.recentHunts === undefined ? {} : { recentHunts: sanitizeHuntJournal(v2.recentHunts) }),
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

/** A career read from outside this browser (a save file): the same
 * migration and checks as a load, or null when it is not a career at all. */
export function readCareer(value: unknown): Career | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const parsed = value as Record<string, unknown>;
  if (parsed.version !== 2 && typeof parsed.hunts !== 'number') return null;
  try {
    return migrate(parsed);
  } catch {
    return null;
  }
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
