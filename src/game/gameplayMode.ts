import { getArea, type AreaConfig } from './areas';
import { BREEDS, getBreed, type BreedConfig } from './breeds';
import {
  activeDog,
  braceDog,
  dogAge,
  loadCareer,
  type KennelDog,
  type StorageLike,
} from './career';
import { gearTierFor, twoDogUnlocked } from './progression';
import { loadQuickConfig, type QuickConfig } from './quick';
import {
  ageMult,
  educatedNerveMult,
  openMix,
  seasonalBias,
  youngShare,
} from './season';
import { createHunt, type HuntState } from './state';
import type { RNG } from './types';

/** The renderer is a preference, never a separate player/profile. */
export type GameplayMode = '2d' | '3d';

export const GAMEPLAY_MODE_KEY = 'uplandin.gameplay-mode.v1';

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadGameplayMode(storage: StorageLike | null = defaultStorage()): GameplayMode {
  if (!storage) return '2d';
  try {
    return storage.getItem(GAMEPLAY_MODE_KEY) === '3d' ? '3d' : '2d';
  } catch {
    return '2d';
  }
}

export function saveGameplayMode(
  mode: GameplayMode,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(GAMEPLAY_MODE_KEY, mode);
  } catch {
    // A blocked/full store only makes the mode fall back to 2D next boot.
  }
}

export type HuntLaunch =
  | { kind: 'career'; areaId: string }
  | { kind: 'quick' };

export function build3DHuntHref(launch: HuntLaunch, dropPointId?: string): string {
  const params = new URLSearchParams({ play: launch.kind });
  if (launch.kind === 'career') params.set('area', launch.areaId);
  if (dropPointId) params.set('drop', dropPointId);
  return `./index3d.html?${params.toString()}`;
}

export function parseDropPointId(search: string): string | undefined {
  return new URLSearchParams(search).get('drop') ?? undefined;
}

export function parseHuntLaunch(search: string): HuntLaunch | null {
  const params = new URLSearchParams(search);
  if (params.get('play') === 'quick') return { kind: 'quick' };
  if (params.get('play') === 'career') {
    const areaId = params.get('area');
    if (areaId) return { kind: 'career', areaId };
  }
  return null;
}

export interface ThreeHuntProfile {
  breedId: string;
  level: number;
  ageMultiplier: number;
  kennelDog: KennelDog | null;
  quick: QuickConfig | null;
  gearTier: number;
  brace: {
    breedId: string;
    level: number;
    ageMultiplier: number;
    kennelDog: KennelDog | null;
  } | null;
}

/** Resolve the same selected dog/setup regardless of which renderer boots. */
export function resolveThreeHuntProfile(
  search: string,
  storage: StorageLike | null = defaultStorage(),
): ThreeHuntProfile {
  const launch = parseHuntLaunch(search);
  if (launch?.kind === 'quick') {
    const quick = loadQuickConfig(storage);
    return {
      breedId: quick.breedId,
      level: quick.level,
      ageMultiplier: 1,
      kennelDog: null,
      quick,
      gearTier: quick.gearTier,
      brace: quick.breed2Id === 'none'
        ? null
        : { breedId: quick.breed2Id, level: quick.level, ageMultiplier: 1, kennelDog: null },
    };
  }
  if (launch?.kind === 'career') {
    const career = loadCareer(storage);
    const kennelDog = activeDog(career);
    if (kennelDog) {
      const mate = twoDogUnlocked(career.hunter.level) ? braceDog(career) : null;
      return {
        breedId: kennelDog.breedId,
        level: kennelDog.level,
        ageMultiplier: ageMult(dogAge(career, kennelDog)),
        kennelDog,
        quick: null,
        gearTier: gearTierFor(career.hunter.level),
        brace: mate
          ? {
              breedId: mate.breedId,
              level: mate.level,
              ageMultiplier: ageMult(dogAge(career, mate)),
              kennelDog: mate,
            }
          : null,
      };
    }
  }

  const params = new URLSearchParams(search);
  const requestedBreed = params.get('breed') ?? 'english-setter';
  const breedId = BREEDS.some((breed) => breed.id === requestedBreed)
    ? requestedBreed
    : 'english-setter';
  return {
    breedId,
    level: 8,
    ageMultiplier: 1,
    kennelDog: null,
    quick: null,
    gearTier: 3,
    brace: null,
  };
}

export interface ThreeHuntSetup extends ThreeHuntProfile {
  launch: HuntLaunch | null;
  area: AreaConfig;
  hunt: HuntState;
  breed: BreedConfig;
}

/**
 * Deep launch seam for Three.js: URL + shared saves in, complete hunt setup
 * out. The renderer never needs to know career calendar or Quick Hunt rules.
 */
export function createThreeHuntSetup(
  search: string,
  rng: RNG = Math.random,
  storage: StorageLike | null = defaultStorage(),
): ThreeHuntSetup {
  const launch = parseHuntLaunch(search);
  const profile = resolveThreeHuntProfile(search, storage);
  const dropPointId = parseDropPointId(search);

  if (launch?.kind === 'quick') {
    const quick = profile.quick ?? loadQuickConfig(storage);
    const area = getArea(quick.areaId);
    const hunt = createHunt(area, rng, {
      wind: quick.wind === 'random' ? undefined : quick.wind,
      gunId: quick.gunId,
      condition: quick.weather === 'random' ? undefined : quick.weather,
      dropPointId,
    });
    hunt.quick = quick;
    return { ...profile, launch, area, hunt, breed: getBreed(profile.breedId) };
  }

  if (launch?.kind === 'career') {
    const career = loadCareer(storage);
    const area = getArea(launch.areaId);
    const hunt = createHunt(area, rng, {
      gunId: career.hunter.shotgunId,
      conditionBias: seasonalBias(career.date.week, area.conditionBias),
      mix: openMix(area, career.date.week),
      youngShare: youngShare(career.date.week),
      educatedMult: educatedNerveMult(career.date.week),
      dropPointId,
    });
    return { ...profile, launch, area, hunt, breed: getBreed(profile.breedId) };
  }

  // Standalone review/capture keeps the old deterministic showcase setup.
  const params = new URLSearchParams(search);
  const area = getArea(params.get('area') ?? 'quail-fields');
  const hunt = createHunt(area, rng, { wind: 'breezy', condition: 'frost', dropPointId });
  return { ...profile, launch, area, hunt, breed: getBreed(profile.breedId) };
}
