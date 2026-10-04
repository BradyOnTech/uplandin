import { noseMult, rangeMult, speedMult, staminaMs, type BreedConfig, type BreedStats } from './breeds';
import type { DogWork } from './state';

export const DOG_SKILLS = ['scent', 'steadiness', 'retrieving', 'handling', 'conditioning'] as const;
export type DogSkill = typeof DOG_SKILLS[number];
export type DogDevelopment = Record<DogSkill, number>;
export const SKILL_XP_CAP = 180;
export const SKILL_LABELS: Record<DogSkill, string> = {
  scent: 'Scent work', steadiness: 'Steadiness', retrieving: 'Retrieving', handling: 'Handling', conditioning: 'Conditioning',
};

/** Existing level curves define the mature breed ceiling. A proficiency selects
 * a place on that curve; general experience never fills an unrelated skill. */
export function developmentForLevel(level: number): DogDevelopment {
  const fraction = Math.max(0, Math.min(1, (level - 1) / 9));
  return Object.fromEntries(DOG_SKILLS.map(key => [key, SKILL_XP_CAP * fraction * fraction])) as DogDevelopment;
}

export function readDevelopment(value: unknown, legacyLevel = 1): DogDevelopment {
  const fallback = developmentForLevel(legacyLevel);
  if (!value || typeof value !== 'object') return fallback;
  const saved = value as Record<string, unknown>;
  return Object.fromEntries(DOG_SKILLS.map(key => [key,
    typeof saved[key] === 'number' && Number.isFinite(saved[key])
      ? Math.max(0, Math.min(SKILL_XP_CAP, saved[key] as number)) : fallback[key],
  ])) as DogDevelopment;
}

export function skillLevel(development: DogDevelopment | undefined, skill: DogSkill, legacyLevel: number): number {
  return development ? 1 + 9 * Math.sqrt(Math.max(0, Math.min(SKILL_XP_CAP, development[skill])) / SKILL_XP_CAP) : legacyLevel;
}

export function skillFraction(development: DogDevelopment, skill: DogSkill): number {
  return (skillLevel(development, skill, 1) - 1) / 9;
}

export function developDog(before: DogDevelopment, gains: Partial<DogDevelopment>, rate = 1): { development: DogDevelopment; gained: DogDevelopment } {
  const development = { ...before }, gained = developmentForLevel(1);
  for (const skill of DOG_SKILLS) {
    const amount = gains[skill] ?? 0;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    development[skill] = Math.min(SKILL_XP_CAP, before[skill] + amount * Math.max(0, rate));
    gained[skill] = development[skill] - before[skill];
  }
  return { development, gained };
}

/** Ratings show current ability against adult potential; age still affects
 * physical performance separately. Legacy mature dogs retain their tuning. */
export function developedStats(breed: BreedConfig, development: DogDevelopment): BreedStats {
  const level = (skill: DogSkill) => skillLevel(development, skill, 1);
  return {
    nose: breed.stats.nose * noseMult(breed, level('scent')) / noseMult(breed, 10),
    speed: breed.stats.speed * speedMult(breed, level('conditioning')) / speedMult(breed, 10),
    range: breed.stats.range * rangeMult(breed, level('handling')) / rangeMult(breed, 10),
    steadiness: breed.stats.steadiness * (.45 + .55 * skillFraction(development, 'steadiness')),
    stamina: breed.stats.stamina * staminaMs(breed, level('conditioning')) / staminaMs(breed, 10),
  };
}

/** Real work, not simply a level-up, develops the dog. Command credit is
 * bounded so tapping the whistle repeatedly cannot train a dog to its cap. */
export function developmentFromHunt(work: DogWork): Partial<DogDevelopment> {
  const points = Math.max(work.pointFlushes, work.points ?? 0);
  const clean = Math.max(0, work.pointFlushes - (work.creeps ?? 0) - (work.breaks ?? 0));
  const minutes = Math.min(30, (work.activeWorkMs ?? 0) / 60000);
  return {
    scent: points * 2 + (work.deadFinds ?? 0) * 2 + (work.relocations ?? 0) * 3,
    steadiness: clean * 3 + (work.backs ?? 0) * 3 + Math.min(2, work.whoas ?? 0) * .5,
    retrieving: work.retrieves * 4 + (work.deadFinds ?? 0),
    handling: Math.min(3, (work.commands ?? 0) * .25) + Math.min(2, minutes * .2),
    conditioning: minutes * .6,
  };
}

export function skillGainText(gained: Partial<DogDevelopment>): string[] {
  return DOG_SKILLS.filter(skill => (gained[skill] ?? 0) >= .05)
    .map(skill => `${SKILL_LABELS[skill]} +${(gained[skill] ?? 0).toFixed(1)}`);
}
