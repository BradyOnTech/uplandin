import { developDog, developmentFromHunt, readDevelopment, type DogDevelopment } from './dogDevelopment';
import { getBreed } from './breeds';
import {
  advanceCareerWeeks,
  awardDogXp,
  awardHunterXp,
  inLastSeason,
  recordDogHunt,
  recordHunt,
  type Career,
  type KennelDog,
} from './career';
import { unlocksAtLevel } from './progression';
import { dogPoints, dogReport } from './dogReport';
import { regionOfArea } from './regions';
import { HOME_HUNT_WEEKS, seasonOver, TRIP_HUNT_WEEKS } from './season';
import type { HuntState } from './state';
import { HUNT_JOURNAL_LIMIT, readHuntJournal, type CareerJournalEntry, type DogMilestone } from './huntJournal';
import { limitsFilled } from './bagLimits';

export const HEN_FINE_XP = 4;
/** A downed bird left in the field costs the hunter; so does an unsafe shot. */
export const LOST_BIRD_FINE_XP = 2;
export const LOW_SHOT_FINE_XP = 2;
export const DOG_IN_LINE_FINE_XP = 5;
/** Each bird past the day's limit. */
export const OVER_LIMIT_FINE_XP = 5;

export interface DogHuntAward {
  dogId: string;
  name: string;
  gained: number;
  skillGains?: DogDevelopment;
  newLevel: number;
  levelsGained: number;
  /** The dog's first point came on this hunt. */
  firstPoint?: boolean;
  /** The last hunt of the season its handler named as its last. */
  lastHunt?: boolean;
}

export interface CareerHuntResult {
  career: Career;
  dogAwards: DogHuntAward[];
  hunterGained: number;
  hunterLevel: number;
  hunterLevelsGained: number;
  unlocks: string[];
  henFine: number;
  /** Lost birds and unsafe shots, in hunter XP. */
  lostFine: number;
  safetyFine: number;
  /** Birds past the daily limit, in hunter XP. */
  limitFine: number;
  weeks: number;
  seasonEnded: boolean;
}

function milestoneOf(award: DogHuntAward | undefined): { milestone?: DogMilestone } {
  return award?.lastHunt ? { milestone: 'last-hunt' } : award?.firstPoint ? { milestone: 'first-point' } : {};
}

/** Pure shared career settlement used after either renderer finishes a hunt. */
export function settleCareerHunt(
  career: Career,
  hunt: HuntState,
  dogs: readonly (KennelDog | null)[],
): CareerHuntResult {
  const henFine = HEN_FINE_XP * hunt.henDowns;
  const lostFine = LOST_BIRD_FINE_XP * (hunt.lostBirds ?? 0);
  const safetyFine = LOW_SHOT_FINE_XP * (hunt.safety?.lowShots ?? 0) + DOG_IN_LINE_FINE_XP * (hunt.safety?.dogInLine ?? 0);
  const limitFine = OVER_LIMIT_FINE_XP * (hunt.overLimit ?? 0);
  const hunterGained = Math.max(0, hunt.downed + hunt.doubles + 2 - henFine - lostFine - safetyFine - limitFine);
  let next = recordHunt(career, hunt.areaId, hunt.downed, hunt.escaped);
  const dogAwards: DogHuntAward[] = [];
  const home = regionOfArea(hunt.areaId).id === career.homeRegionId;
  const weeks = home ? HOME_HUNT_WEEKS : TRIP_HUNT_WEEKS;
  // This hunt closes the season: an old dog's named last season ends with it.
  const closesSeason = seasonOver({ season: career.date.season, week: career.date.week + weeks });

  dogs.forEach((dog, slot) => {
    if (!dog) return;
    const work = hunt.dogWork[slot];
    if (!work) return;
    // Finding an unmarked fall and relocating a runner are skilled work too.
    const gained = Math.round(
      (2 * work.pointFlushes + work.retrieves + 3 * work.downedOverPoint + (work.deadFinds ?? 0) + (work.relocations ?? 0))
        * getBreed(dog.breedId).xpRate,
    );
    // The record reads the dog as it came to this hunt, before its award.
    const record = recordDogHunt(next, dog.id, { points: dogPoints(work), retrieves: work.retrieves },
      { huntNumber: next.hunts, areaId: hunt.areaId, season: career.date.season });
    const practice = developDog(readDevelopment(dog.development, dog.level), developmentFromHunt(work), getBreed(dog.breedId).xpRate);
    const developed = { ...record.career, kennel: record.career.kennel.map(candidate => candidate.id === dog.id ? { ...candidate, development: practice.development } : candidate) };
    const award = awardDogXp(developed, dog.id, gained);
    next = award.career;
    dogAwards.push({
      dogId: dog.id,
      name: dog.name,
      gained,
      skillGains: practice.gained,
      newLevel: award.newLevel,
      levelsGained: award.levelsGained,
      ...(record.firstPoint ? { firstPoint: true } : {}),
      ...(closesSeason && inLastSeason(career, dog) ? { lastHunt: true } : {}),
    });
  });

  const hunterBefore = next.hunter.level;
  const hunterAward = awardHunterXp(next, hunterGained);
  next = hunterAward.career;
  const unlocks: string[] = [];
  for (let level = hunterBefore + 1; level <= hunterAward.newLevel; level++) {
    unlocks.push(...unlocksAtLevel(level));
  }

  const entry: CareerJournalEntry = {
    huntNumber: next.hunts,
    areaId: hunt.areaId,
    date: { ...career.date },
    retrieved: hunt.birds.filter((bird) => bird.state === 'retrieved').length,
    downed: hunt.downed,
    escaped: hunt.escaped,
    pointFlushes: dogs.reduce((sum, dog, slot) => sum + (dog ? hunt.dogWork[slot]?.pointFlushes ?? 0 : 0), 0),
    doubles: hunt.doubles,
    henDowns: hunt.henDowns,
    hunterXp: hunterGained,
    dogs: dogs.flatMap((dog, slot) => dog ? [{ name: dog.name, breedId: dog.breedId,
      ...(hunt.dogWork[slot] ? { note: dogReport(dog.name, hunt.dogWork[slot]).notes[0] } : {}),
      ...milestoneOf(dogAwards.find((award) => award.dogId === dog.id)) }] : []),
    ...((hunt.lostBirds ?? 0) > 0 ? { lost: hunt.lostBirds } : {}),
    ...((hunt.safety?.lowShots ?? 0) + (hunt.safety?.dogInLine ?? 0) > 0 ? { unsafe: hunt.safety!.lowShots + hunt.safety!.dogInLine } : {}),
    ...((hunt.overLimit ?? 0) > 0 ? { overLimit: hunt.overLimit } : {}),
    ...(limitsFilled(hunt).length ? { limits: limitsFilled(hunt) } : {}),
  };
  // The existing renderer save writes progression, calendar and this snapshot
  // together. There is no second key or reconstructed pre-journal history.
  next = { ...next, recentHunts: [entry, ...readHuntJournal(career)].slice(0, HUNT_JOURNAL_LIMIT) };
  next = advanceCareerWeeks(next, weeks);

  return {
    career: next,
    dogAwards,
    hunterGained,
    hunterLevel: hunterAward.newLevel,
    hunterLevelsGained: hunterAward.levelsGained,
    unlocks,
    henFine,
    lostFine,
    safetyFine,
    limitFine,
    weeks,
    seasonEnded: seasonOver(next.date),
  };
}
