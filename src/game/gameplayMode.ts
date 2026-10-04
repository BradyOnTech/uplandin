import { parseTraining, trainingStage } from './training';
import { isFalconryPractice, FALCONRY_PRACTICE, stageFalconryPractice } from './falconryPractice';
import { areaBirdCount, getArea, type AreaConfig } from './areas';
import { getSpecies } from './species';
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
import { loadQuickConfig, normalizeQuickConfig, type QuickConfig } from './quick';
import {
  ageMult,
  educatedNerveMult,
  openMix,
  seasonalBias,
  youngShare,
} from './season';
import { createHunt, type HuntState } from './state';
import type { RNG } from './types';
import { mulberry32 } from './math';
import { huntStreamSeed, parseHuntSeed } from './huntSeed';
import { QUAIL_FIELD_BIRD_COUNT, quailEncounterAnchors } from './quailEncounters';
import { authoredEncounterAnchors } from './areaEncounters';
import { HUNT_CHALLENGES, HUNT_CHALLENGE_KEY, parseHuntChallenge, type HuntChallenge } from './huntChallenge';
import { huntingDoctrine } from './huntDoctrine';
import { getGun } from './guns';

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
  | { kind: 'quick'; method?: 'goshawk' };

export function build3DHuntHref(launch: HuntLaunch, dropPointId?: string): string {
  const params = new URLSearchParams({ play: launch.kind });
  if (launch.kind === 'career') params.set('area', launch.areaId);
  if (launch.kind === 'quick' && launch.method) params.set('method', launch.method);
  if (dropPointId) params.set('drop', dropPointId);
  return `./index3d.html?${params.toString()}`;
}

/** Return with the chosen graphics preference, never the device's effective tier. */
export function build3DPreparationHref(search: string, areaId: string, dropPointId: string): string {
  const mode = parseHuntLaunch(search)?.kind === 'career' ? 'career' : 'quick';
  if (parseTraining(search)) {
    const params = new URLSearchParams(search);
    params.set('mode', mode);
    for (const key of [...params.keys()]) if (!['mode', 'training', 'trainingDifficulty', 'trainingCover', 'wind', 'seed', 'trainee', 'breed', 'level', 'coat', 'quality'].includes(key)) params.delete(key);
    return `./training3d.html?${params}`;
  }
  const params = new URLSearchParams({ mode, area: areaId, drop: dropPointId });
  const quality = new URLSearchParams(search).get('quality');
  if (quality === 'auto' || quality === 'lite' || quality === 'high') params.set('quality', quality);
  return `./prepare3d.html?${params}`;
}

export function parseDropPointId(search: string): string | undefined {
  return isFalconryPractice(search) ? FALCONRY_PRACTICE.drop : new URLSearchParams(search).get('drop') ?? undefined;
}

export function parseHuntLaunch(search: string): HuntLaunch | null {
  const params = new URLSearchParams(search);
  if (params.get('play') === 'quick') return params.get('method') === 'goshawk' ? { kind: 'quick', method: 'goshawk' } : { kind: 'quick' };
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
  const training = parseTraining(search);
  if (training) {
    const params = new URLSearchParams(search), career = training.mode === 'career' ? loadCareer(storage) : null;
    const dog = career?.kennel.find(d => d.id === params.get('trainee') && d.retiredSeason === undefined) ?? (career ? activeDog(career) : null);
    if (career && !dog) throw new Error('Choose a working career dog before training.');
    const requested = params.get('breed') ?? loadQuickConfig(storage).breedId;
    const breedId = dog?.breedId ?? getBreed(requested).id;
    const requestedLevel = Number(params.get('level') ?? loadQuickConfig(storage).level);
    const level = dog?.level ?? Math.max(1, Math.min(10, Math.round(Number.isFinite(requestedLevel) ? requestedLevel : 5)));
    const mentor = training.drill === 'honoring' ? { breedId: 'english-setter', level: 10, ageMultiplier: 1, kennelDog: null } : null;
    return { breedId, level, ageMultiplier: career && dog ? ageMult(dogAge(career, dog)) : 1,
      kennelDog: dog, quick: career ? null : normalizeQuickConfig({ ...loadQuickConfig(storage), breedId, level, areaId: 'quail-fields', huntingMethod: 'shotgun', breed2Id: mentor?.breedId ?? 'none' }),
      gearTier: 3, brace: mentor };
  }
  if (launch?.kind === 'quick') {
    const quick = normalizeQuickConfig({ ...loadQuickConfig(storage), ...(launch.method ? { huntingMethod: launch.method } : {}) });
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
  const requestedBreed = params.get('breed')
    ?? (launch === null && resolveThreeHuntArea(search, storage).id === 'quail-fields' ? 'gsp' : 'english-setter');
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
  seed?: number;
  challenge: HuntChallenge;
  launch: HuntLaunch | null;
  area: AreaConfig;
  hunt: HuntState;
  breed: BreedConfig;
}

export function resolveThreeHuntChallenge(search: string, storage: StorageLike | null = defaultStorage()): HuntChallenge {
  if (isFalconryPractice(search) || parseTraining(search)) return 'balanced';
  if (!huntingDoctrine(resolveThreeHuntArea(search, storage).id).spatialEncounter) return 'balanced';
  const params = new URLSearchParams(search);
  let challenge: HuntChallenge;
  if (params.has('challenge')) challenge = parseHuntChallenge(params.get('challenge'));
  else try { challenge = parseHuntChallenge(storage?.getItem(HUNT_CHALLENGE_KEY)); } catch { challenge = 'balanced'; }
  // A Loaded field is a quick-hunt preserve day, not a season's hunting:
  // a career outing on it would be free experience.
  return challenge === 'loaded' && parseHuntLaunch(search)?.kind === 'career' ? 'balanced' : challenge;
}

/** Resolve location identity without rolling weather, wind, or birds. */
export function resolveThreeHuntArea(
  search: string,
  storage: StorageLike | null = defaultStorage(),
): AreaConfig {
  const launch = parseHuntLaunch(search);
  if (parseTraining(search)) return getArea('quail-fields');
  if (launch?.kind === 'quick') return getArea(launch.method === 'goshawk' ? 'pheasant-coverts' : loadQuickConfig(storage).areaId);
  if (launch?.kind === 'career') return getArea(launch.areaId);
  return getArea(new URLSearchParams(search).get('area') ?? 'quail-fields');
}

/**
 * Deep launch seam for Three.js: URL + shared saves in, complete hunt setup
 * out. The renderer never needs to know career calendar or Quick Hunt rules.
 */
/** Coveys a balanced 3D property holds; challenge stocking scales it. */
export const FIELD_COVEY_TARGET = 10;

export function createThreeHuntSetup(
  search: string,
  rng: RNG = Math.random,
  storage: StorageLike | null = defaultStorage(),
): ThreeHuntSetup {
  const launch = parseHuntLaunch(search);
  const profile = resolveThreeHuntProfile(search, storage);
  const dropPointId = parseDropPointId(search);
  const challenge = resolveThreeHuntChallenge(search, storage);
  const tuning = HUNT_CHALLENGES[challenge];
  const resolvedArea = resolveThreeHuntArea(search, storage);
  const training = parseTraining(search);
  if (training) {
    const stage = trainingStage(resolvedArea, training, 0);
    const hunt = createHunt(resolvedArea, mulberry32(training.seed), { dropPointId, wind: training.wind, condition: 'frost' });
    hunt.birds = stage.birds; hunt.hunterPos = stage.hunter; hunt.dogsPos = stage.dogs;
    hunt.wind = -Math.PI / 2 + Math.PI; hunt.windStrength = training.wind; hunt.preserve = true;
    if (profile.quick) hunt.quick = profile.quick;
    return { ...profile, launch, area: resolvedArea, hunt, challenge: 'balanced', seed: training.seed, breed: getBreed(profile.breedId) };
  }
  const isQuail = resolvedArea.id === 'quail-fields';
  const seed = parseHuntSeed(search) ?? Math.floor(rng() * 0x100000000);
  const environmentRng = mulberry32(huntStreamSeed(seed, 0xe071));
  // Authored non-Quail properties use their own stable encounter streams so
  // route sampling cannot consume the weather/wind stream or change when a
  // player revisits the same drop. The two drop entries get different, but
  // repeatable, cover ordering. An explicit replay seed varies both streams
  // without changing the property terrain or the authored placement rules.
  const dropSalt = dropPointId === 'west-track' ? 0x4a9f : 0x17c3;
  const authoredEncounterRng = mulberry32(huntStreamSeed(seed, 0xa11c0a ^ dropSalt));
  const authoredBirdRng = mulberry32(huntStreamSeed(seed, 0xb17d7d ^ dropSalt));
  const challengeOptions = {
    stockingMult: tuning.stocking, encounterNerveMult: tuning.nerve, mixedCoveys: true,
    ...(!isQuail ? {
      // Quail keeps its seeded calibration below. Other 3D properties use
      // their authored route network to place cover encounters; 2D callers
      // never pass this option and retain the original scatter behavior.
      birdRng: authoredBirdRng,
      // The old acreage formula can yield fewer birds than one Chukar or
      // Hun covey. A full 3D property needs more than one opportunity even
      // after an opening covey escapes. Weights are shares of birds, so the
      // harmonic mean matches spawnBirds' covey-weight conversion.
      birdCount: Math.max(areaBirdCount(resolvedArea), Math.round(FIELD_COVEY_TARGET *
        resolvedArea.speciesMix.reduce((sum, entry) => sum + entry.weight, 0) /
        resolvedArea.speciesMix.reduce((sum, entry) => {
          const species = getSpecies(entry.speciesId);
          return sum + entry.weight / ((species.coveyMin + species.coveyMax) / 2);
        }, 0))),
      coveyAnchors: authoredEncounterAnchors(resolvedArea, dropPointId, authoredEncounterRng, tuning.spacing),
    } : {
      birdCount: QUAIL_FIELD_BIRD_COUNT,
      birdRng: mulberry32(huntStreamSeed(seed!, 0xb17d)),
      coveyAnchors: quailEncounterAnchors(resolvedArea, dropPointId, mulberry32(huntStreamSeed(seed!, 0xc07e)), tuning.spacing),
    }),
  };

  if (launch?.kind === 'quick') {
    const quick = profile.quick ?? loadQuickConfig(storage);
    const area = resolveThreeHuntArea(search, storage);
    const hunt = createHunt(area, environmentRng, {
      ...challengeOptions,
      wind: quick.wind === 'random' ? undefined : quick.wind,
      gunId: quick.gunId,
      condition: quick.weather === 'random' ? undefined : quick.weather,
      dropPointId,
    });
    hunt.quick = quick;
    hunt.huntingMethod = quick.huntingMethod === 'goshawk' ? 'goshawk' : 'shotgun';
    if (isFalconryPractice(search)) stageFalconryPractice(hunt, seed!);
    return { ...profile, launch, area, hunt, challenge, seed, breed: getBreed(profile.breedId) };
  }

  if (launch?.kind === 'career') {
    const career = loadCareer(storage);
    const area = resolveThreeHuntArea(search, storage);
    const hunt = createHunt(area, environmentRng, {
      ...challengeOptions,
      gunId: career.hunter.shotgunId,
      conditionBias: seasonalBias(career.date.week, area.conditionBias),
      mix: openMix(area, career.date.week),
      youngShare: youngShare(career.date.week),
      educatedMult: educatedNerveMult(career.date.week),
      dropPointId,
    });
    return { ...profile, launch, area, hunt, challenge, seed, breed: getBreed(profile.breedId) };
  }

  // Standalone visits use a consistent climate while the seed varies the hunt.
  const area = resolveThreeHuntArea(search, storage);
  const hunt = createHunt(area, environmentRng, { ...challengeOptions, wind: 'breezy', condition: 'frost', dropPointId,
    gunId: getGun(new URLSearchParams(search).get('gun') ?? '').id });
  return { ...profile, launch, area, hunt, challenge, seed, breed: getBreed(profile.breedId) };
}
