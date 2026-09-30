import { resolveCoatFor } from './dogCoats';
import { AREAS, type AreaConfig } from './areas';
import { BREEDS, type BreedConfig } from './breeds';
import {
  activeDog, addDogToKennel, advanceCareerWeeks, braceDog, rollToNextSeason,
  setActiveDog, setBraceDog, setHomeRegion, type Career, type KennelDog,
} from './career';
import { build3DHuntHref, type HuntLaunch } from './gameplayMode';
import { GUNS, unlockedGuns, type GunConfig } from './guns';
import { gearTierFor, kennelSlots, TRUCK_LEVEL, truckUnlocked, TWO_DOG_LEVEL, twoDogUnlocked } from './progression';
import { normalizeQuickConfig, type QuickConfig } from './quick';
import { REGIONS, regionAreas, regionOfArea } from './regions';
import { areaOpenerWeek, HOME_HUNT_WEEKS, openMix, seasonOver, TRIP_HUNT_WEEKS, weekLabel } from './season';

export interface PreparationArea {
  area: AreaConfig;
  regionId: string;
  isHome: boolean;
  accessible: boolean;
  open: boolean;
  selectable: boolean;
  reason: string | null;
  opensWeek: number;
  weeks: number;
  openSpeciesIds: string[];
}

export type PreparationCalendarKind = 'opener' | 'rest' | 'next-season';
export interface PreparationCalendarAction { kind: PreparationCalendarKind; weeks: number; label: string }
export interface CareerPreparation {
  needsDog: boolean;
  needsHome: boolean;
  activeDog: KennelDog | null;
  braceDog: KennelDog | null;
  kennelCapacity: number;
  canAddDog: boolean;
  canBrace: boolean;
  gearTier: number;
  availableBreeds: readonly BreedConfig[];
  availableGuns: readonly GunConfig[];
  areas: PreparationArea[];
  calendarAction: PreparationCalendarAction | null;
}

export interface PreparationFailure { ok: false; code: string; message: string }
export type PreparationResult<T> = ({ ok: true } & T) | PreparationFailure;
const failure = (code: string, message: string): PreparationFailure => ({ ok: false, code, message });
const copyDog = (dog: KennelDog | null): KennelDog | null => dog ? { ...dog } : null;

/** Read-only UI model. No save, calendar advance, hunt creation or RNG use. */
export function careerPreparation(career: Career): CareerPreparation {
  const home = REGIONS.find((region) => region.id === career.homeRegionId && region.built);
  const needsDog = career.kennel.length === 0, needsHome = !home;
  const lead = activeDog(career), mate = twoDogUnlocked(career.hunter.level) ? braceDog(career) : null;
  const over = seasonOver(career.date), truck = truckUnlocked(career.hunter.level);
  const areas = AREAS.map((area): PreparationArea => {
    const region = regionOfArea(area.id), isHome = region.id === career.homeRegionId;
    const accessible = region.built && (isHome || truck);
    const opensWeek = areaOpenerWeek(area);
    const openSpeciesIds = over ? [] : openMix(area, career.date.week).map((share) => share.speciesId);
    const open = openSpeciesIds.length > 0;
    const reason = !region.built ? 'This region is not available yet.'
      : needsDog ? 'Choose your first dog.'
      : needsHome ? 'Choose your home ground.'
      : !lead ? 'Choose a dog from your kennel.'
      : over ? 'Start the next season to hunt again.'
      : !accessible ? `Travel unlocks with the truck at hunter level ${TRUCK_LEVEL}.`
      : !open ? `Season opens ${weekLabel(opensWeek)}.` : null;
    return { area, regionId: region.id, isHome, accessible, open, selectable: reason === null, reason,
      opensWeek, weeks: isHome ? HOME_HUNT_WEEKS : TRIP_HUNT_WEEKS, openSpeciesIds };
  });
  let calendarAction: PreparationCalendarAction | null = null;
  if (!needsDog && home) {
    const homeOpens = Math.min(...regionAreas(home).map(areaOpenerWeek));
    calendarAction = over
      ? { kind: 'next-season', weeks: 0, label: `Start season ${career.date.season + 1}` }
      : !truck && career.date.week < homeOpens
        ? { kind: 'opener', weeks: homeOpens - career.date.week, label: `Skip to the opener · ${weekLabel(homeOpens)}` }
        : { kind: 'rest', weeks: 1, label: 'Wait a week' };
  }
  return {
    needsDog, needsHome, activeDog: copyDog(lead), braceDog: copyDog(mate?.id === lead?.id ? null : mate),
    kennelCapacity: kennelSlots(career.hunter.level), canAddDog: career.kennel.length < kennelSlots(career.hunter.level),
    canBrace: twoDogUnlocked(career.hunter.level), gearTier: gearTierFor(career.hunter.level),
    // Breed choice has no level gate. Kennel capacity and brace hunting do.
    availableBreeds: BREEDS, availableGuns: unlockedGuns(career.hunter.level), areas, calendarAction,
  };
}

export interface QuickPreparation {
  config: QuickConfig;
  areas: PreparationArea[];
  breeds: readonly BreedConfig[];
  availableGuns: readonly GunConfig[];
  fixedCompanions: boolean;
}

export function quickPreparation(config: Partial<QuickConfig>): QuickPreparation {
  const normalized = normalizeQuickConfig(config), fixed = normalized.huntingMethod === 'goshawk';
  return {
    config: normalized, breeds: BREEDS, availableGuns: GUNS, fixedCompanions: fixed,
    areas: AREAS.map((area) => {
      const selectable = !fixed || area.id === normalized.areaId;
      return { area, regionId: regionOfArea(area.id).id, isHome: false, accessible: selectable, open: true,
        selectable, reason: selectable ? null : 'Goshawk hunts use Cattail Coverts.',
        opensWeek: areaOpenerWeek(area), weeks: 0, openSpeciesIds: area.speciesMix.map((share) => share.speciesId) };
    }),
  };
}

export interface PreparationDog { breedId: string; name: string; coatId?: string }
export interface CareerLoadoutChoice { activeDogId?: string; braceDogId?: string | null; gunId?: string }
export interface CareerLaunchChoice extends CareerLoadoutChoice { areaId: string; dropPointId?: string }

function validDog(dog: PreparationDog): PreparationFailure | null {
  if (!BREEDS.some((breed) => breed.id === dog.breedId)) return failure('unknown-breed', 'Choose an available dog breed.');
  if (!dog.name.trim() || dog.name.length > 120) return failure('invalid-name', 'Give your dog a name between 1 and 120 characters.');
  return null;
}

/** Caller reads the latest career before this explicit action, then saves once. */
export function commitPreparationDog(career: Career, dog: PreparationDog): PreparationResult<{ career: Career; dog: KennelDog }> {
  const invalid = validDog(dog);
  if (invalid) return invalid;
  if (career.kennel.length >= kennelSlots(career.hunter.level)) return failure('kennel-full', 'Your dog box is full. More kennel space comes with hunter levels.');
  const added = addDogToKennel(career, dog.name.trim(), dog.breedId, dog.coatId ? resolveCoatFor(dog.breedId, dog.coatId) : undefined);
  return { ok: true, career: setActiveDog(added.career, added.dog.id), dog: added.dog };
}

/** First dog and home are one transaction. Backing out has nothing to undo. */
export function commitCareerSetup(career: Career, choice: {
  homeRegionId: string; dog?: PreparationDog;
}): PreparationResult<{ career: Career }> {
  const snapshot = careerPreparation(career);
  if (!snapshot.needsDog && !snapshot.needsHome) return failure('setup-complete', 'This career is already set up.');
  if (!REGIONS.some((region) => region.id === choice.homeRegionId && region.built)) return failure('unknown-home', 'Choose an available home region.');
  if (!snapshot.needsHome && career.homeRegionId !== choice.homeRegionId) return failure('home-changed', 'Keep this career’s existing home ground.');
  if (!snapshot.needsDog && choice.dog) return failure('dog-already-chosen', 'Your career already has a dog. Choose from the kennel.');
  if (snapshot.needsDog && !choice.dog) return failure('needs-dog', 'Choose your first dog.');
  let next = setHomeRegion(career, choice.homeRegionId);
  if (choice.dog) {
    const added = commitPreparationDog(next, choice.dog);
    if (!added.ok) return added;
    next = added.career;
  }
  return { ok: true, career: next };
}

/** Explicit selections are idempotent; selecting the current brace does not toggle it off. */
export function commitCareerLoadout(career: Career, choice: CareerLoadoutChoice): PreparationResult<{ career: Career }> {
  if (choice.activeDogId !== undefined && !career.kennel.some((dog) => dog.id === choice.activeDogId)) return failure('unknown-dog', 'Choose a dog from your current kennel.');
  let next = choice.activeDogId !== undefined && choice.activeDogId !== career.activeDogId
    ? setActiveDog(career, choice.activeDogId) : career;
  if (choice.braceDogId !== undefined) {
    if (choice.braceDogId !== null) {
      if (!twoDogUnlocked(next.hunter.level)) return failure('brace-locked', `Brace hunting unlocks at hunter level ${TWO_DOG_LEVEL}.`);
      if (!next.kennel.some((dog) => dog.id === choice.braceDogId)) return failure('unknown-brace', 'Choose a bracemate from your current kennel.');
      if (choice.braceDogId === next.activeDogId) return failure('same-dog', 'Choose a different dog as the bracemate.');
    }
    if (choice.braceDogId !== next.braceDogId) next = setBraceDog(next, choice.braceDogId);
  }
  if (choice.gunId !== undefined) {
    if (!unlockedGuns(next.hunter.level).some((gun) => gun.id === choice.gunId)) return failure('gun-locked', 'Choose a shotgun unlocked by your current hunter level.');
    if (choice.gunId !== next.hunter.shotgunId) next = { ...next, hunter: { ...next.hunter, shotgunId: choice.gunId } };
  }
  return { ok: true, career: next };
}

/** Choose the coat a kennel dog is drawn with. Cosmetic: no XP or calendar effect. */
export function commitDogCoat(career: Career, dogId: string, coatId: string): PreparationResult<{ career: Career }> {
  const dog = career.kennel.find((candidate) => candidate.id === dogId);
  if (!dog) return failure('unknown-dog', 'Choose a dog from your current kennel.');
  const resolved = resolveCoatFor(dog.breedId, coatId);
  if (resolved !== coatId) return failure('unknown-coat', 'Choose a coat for this breed.');
  if (dog.coatId === coatId) return { ok: true, career };
  return { ok: true, career: { ...career, kennel: career.kennel.map((d) => d.id === dogId ? { ...d, coatId } : d) } };
}

export function commitPreparationCalendar(career: Career, kind: PreparationCalendarKind): PreparationResult<{ career: Career }> {
  const action = careerPreparation(career).calendarAction;
  if (!action || action.kind !== kind) return failure('calendar-changed', 'The season has changed. Review the current calendar before continuing.');
  return { ok: true, career: kind === 'next-season' ? rollToNextSeason(career) : advanceCareerWeeks(career, action.weeks) };
}

function resolveDrop(area: AreaConfig, id?: string): PreparationResult<{ dropPointId: string }> {
  const drop = id === undefined ? area.dropPoints[0] : area.dropPoints.find((candidate) => candidate.id === id);
  return drop ? { ok: true, dropPointId: drop.id } : failure('unknown-drop', 'Choose a truck entry on this property.');
}

/** A launch is not a hunt result: it neither awards XP nor charges calendar weeks. */
export function commitCareerLaunch(career: Career, choice: CareerLaunchChoice): PreparationResult<{
  career: Career; launch: HuntLaunch; href: string; dropPointId: string;
}> {
  const loadout = commitCareerLoadout(career, choice);
  if (!loadout.ok) return loadout;
  const snapshot = careerPreparation(loadout.career);
  const selected = snapshot.areas.find((row) => row.area.id === choice.areaId);
  if (!selected) return failure('unknown-area', 'Choose an available property.');
  if (!selected.selectable) return failure('area-unavailable', selected.reason!);
  if (!snapshot.availableGuns.some((gun) => gun.id === loadout.career.hunter.shotgunId)) return failure('gun-locked', 'Choose a shotgun unlocked by your current hunter level.');
  const drop = resolveDrop(selected.area, choice.dropPointId);
  if (!drop.ok) return drop;
  const launch: HuntLaunch = { kind: 'career', areaId: selected.area.id };
  return { ok: true, career: loadout.career, launch, href: build3DHuntHref(launch, drop.dropPointId), dropPointId: drop.dropPointId };
}

/** Quick setup has its own save; this command never accepts or returns a career. */
export function commitQuickLaunch(config: Partial<QuickConfig>, dropPointId?: string): PreparationResult<{
  config: QuickConfig; launch: HuntLaunch; href: string; dropPointId: string;
}> {
  const snapshot = quickPreparation(config);
  const area = snapshot.areas.find((row) => row.area.id === snapshot.config.areaId)!.area;
  const drop = resolveDrop(area, dropPointId);
  if (!drop.ok) return drop;
  const launch: HuntLaunch = { kind: 'quick', ...(snapshot.config.huntingMethod === 'goshawk' ? { method: 'goshawk' as const } : {}) };
  return { ok: true, config: snapshot.config, launch, href: build3DHuntHref(launch, drop.dropPointId), dropPointId: drop.dropPointId };
}
