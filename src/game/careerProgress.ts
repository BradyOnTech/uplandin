import { getBreed, LEVEL_CAP, noseMult, pointPressure, windCraftTier, xpForLevel } from './breeds';
import { dogAge, type Career, type KennelDog } from './career';
import { GUNS } from './guns';
import { GEAR_NAMES, gearTierFor, HUNTER_LEVEL_CAP, hunterXpForLevel, kennelSlots, truckUnlocked, twoDogUnlocked } from './progression';
import { ageLabel, ageMult } from './season';

export interface ExperienceProgress {
  earned: number;
  required: number;
  remaining: number;
  nextLevel: number;
}

function safeLevel(value: number, cap: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(cap, Math.floor(value))) : 1;
}
function threshold(level: number, cost: (level: number) => number): number {
  let total = 0;
  for (let n = 1; n < level; n++) total += cost(n);
  return total;
}
function experience(xp: number, level: number, cap: number, cost: (level: number) => number): ExperienceProgress | null {
  if (level >= cap) return null;
  const required = cost(level);
  // Old saves may have incomplete XP. Display the saved level without
  // silently rewriting it or showing negative/overflowing progress.
  const earned = Math.max(0, Math.min(required, (Number.isFinite(xp) ? xp : 0) - threshold(level, cost)));
  return { earned, required, remaining: required - earned, nextLevel: level + 1 };
}

/** Short labels derived from the same eligibility rules as preparation. */
function unlocks(level: number): string[] {
  const before = level - 1, labels: string[] = [];
  if (truckUnlocked(level) && !truckUnlocked(before)) labels.push('Truck · travel between regions');
  labels.push(...GUNS.filter(gun => gun.unlockLevel === level && level > 1).map(gun => gun.name));
  if (gearTierFor(level) > gearTierFor(before)) labels.push(GEAR_NAMES[gearTierFor(level)]);
  if (kennelSlots(level) > kennelSlots(before)) labels.push(`${kennelSlots(level)} kennel places`);
  if (twoDogUnlocked(level) && !twoDogUnlocked(before)) labels.push('Two-dog hunting');
  return labels;
}

/** Read-only outlook: no persistence, awards, calendar advance or launch. */
export function hunterCareerProgress(career: Career) {
  const level = safeLevel(career.hunter.level, HUNTER_LEVEL_CAP);
  const progress = experience(career.hunter.xp, level, HUNTER_LEVEL_CAP, hunterXpForLevel);
  let nextUnlock: { level: number; labels: string[] } | null = null;
  for (let next = level + 1; next <= HUNTER_LEVEL_CAP; next++) {
    const labels = unlocks(next);
    if (labels.length) { nextUnlock = { level: next, labels }; break; }
  }
  return { level, progress, nextUnlock };
}

export function dogCareerProgress(career: Career, dog: KennelDog) {
  const level = safeLevel(dog.level, LEVEL_CAP), breed = getBreed(dog.breedId);
  const recordedAge = dogAge(career, { ...dog, bornSeason: Number.isFinite(dog.bornSeason) ? dog.bornSeason : 1 });
  const age = Number.isFinite(recordedAge) ? recordedAge : 1, pace = ageMult(age);
  const progress = experience(dog.xp, level, LEVEL_CAP, xpForLevel);
  let nextBenefit: string | null = null;
  if (progress) {
    const next = progress.nextLevel;
    if (windCraftTier(next) > windCraftTier(level)) {
      nextBenefit = windCraftTier(next) === 1 ? 'More effective upwind scenting' : 'Less scent pressure on birds while searching';
    } else {
      const scent = noseMult(breed, next) > noseMult(breed, level);
      const steady = pointPressure(breed, next) < pointPressure(breed, level);
      nextBenefit = scent && steady ? 'Stronger scenting and steadier points'
        : scent ? 'Stronger scenting' : steady ? 'Steadier points' : 'More field experience';
    }
  }
  return {
    name: dog.name, level, progress, nextBenefit,
    ageLabel: ageLabel(age),
    ageEffect: pace < 1 ? age <= 1
      ? 'Still growing: slightly less speed and stamina.'
      : 'Age lowers speed and stamina; scenting is unchanged.' : null,
  };
}
