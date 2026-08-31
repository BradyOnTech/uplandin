import { getBreed } from './breeds';
import {
  advanceCareerWeeks,
  awardDogXp,
  awardHunterXp,
  recordHunt,
  type Career,
  type KennelDog,
} from './career';
import { unlocksAtLevel } from './progression';
import { regionOfArea } from './regions';
import { HOME_HUNT_WEEKS, seasonOver, TRIP_HUNT_WEEKS } from './season';
import type { HuntState } from './state';

export const HEN_FINE_XP = 4;

export interface DogHuntAward {
  dogId: string;
  name: string;
  gained: number;
  newLevel: number;
  levelsGained: number;
}

export interface CareerHuntResult {
  career: Career;
  dogAwards: DogHuntAward[];
  hunterGained: number;
  hunterLevel: number;
  hunterLevelsGained: number;
  unlocks: string[];
  henFine: number;
  weeks: number;
  seasonEnded: boolean;
}

/** Pure shared career settlement used after either renderer finishes a hunt. */
export function settleCareerHunt(
  career: Career,
  hunt: HuntState,
  dogs: readonly (KennelDog | null)[],
): CareerHuntResult {
  const henFine = HEN_FINE_XP * hunt.henDowns;
  const hunterGained = Math.max(0, hunt.downed + hunt.doubles + 2 - henFine);
  let next = recordHunt(career, hunt.areaId, hunt.downed, hunt.escaped);
  const dogAwards: DogHuntAward[] = [];

  dogs.forEach((dog, slot) => {
    if (!dog) return;
    const work = hunt.dogWork[slot];
    if (!work) return;
    const gained = Math.round(
      (2 * work.pointFlushes + work.retrieves + 3 * work.downedOverPoint) * getBreed(dog.breedId).xpRate,
    );
    const award = awardDogXp(next, dog.id, gained);
    next = award.career;
    dogAwards.push({
      dogId: dog.id,
      name: dog.name,
      gained,
      newLevel: award.newLevel,
      levelsGained: award.levelsGained,
    });
  });

  const hunterBefore = next.hunter.level;
  const hunterAward = awardHunterXp(next, hunterGained);
  next = hunterAward.career;
  const unlocks: string[] = [];
  for (let level = hunterBefore + 1; level <= hunterAward.newLevel; level++) {
    unlocks.push(...unlocksAtLevel(level));
  }

  const home = regionOfArea(hunt.areaId).id === next.homeRegionId;
  const weeks = home ? HOME_HUNT_WEEKS : TRIP_HUNT_WEEKS;
  next = advanceCareerWeeks(next, weeks);

  return {
    career: next,
    dogAwards,
    hunterGained,
    hunterLevel: hunterAward.newLevel,
    hunterLevelsGained: hunterAward.levelsGained,
    unlocks,
    henFine,
    weeks,
    seasonEnded: seasonOver(next.date),
  };
}
