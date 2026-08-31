import { clamp } from './math';

/**
 * Bird dog breeds. Stats are 1–5 ratings mapped to multipliers on the Dog
 * behavior constants — breeds differ by standout traits, not full spreads.
 * Level growth is capped so breeds keep their identity.
 */

export interface BreedStats {
  nose: number;
  speed: number;
  range: number;
  steadiness: number;
  stamina: number;
}

/**
 * Presentation character for a breed's movement. Ground speed remains a
 * gameplay stat; these values describe how that speed is carried so two
 * equally quick dogs do not animate like the same animal with a new coat.
 */
export interface BreedMotion {
  /** Gallop stride length relative to the shared adult bird-dog rig. */
  runStride: number;
  /** Fractional live pace variation while actively quartering. */
  huntSurge: number;
  /** Slow acceleration/deceleration cycles per second. */
  surgeHz: number;
  /** Flexible search carriage: 0 deliberate/rigid, 1 loose/snappy. */
  searchLooseness: number;
  /** Head freedom while casting, relative to the body bend. */
  headFreedom: number;
  /** Tail counterbalance while casting. */
  tailAction: number;
  /** Vertical body/loin action relative to the shared gait (1 = baseline). */
  verticalMotion: number;
}

export interface BreedConfig {
  id: string;
  name: string;
  blurb: string;
  stats: BreedStats;
  motion: BreedMotion;
  /** XP gain multiplier — some breeds mature fast, some slow. */
  xpRate: number;
}

export const LEVEL_CAP = 10;

export const BREEDS: BreedConfig[] = [
  {
    id: 'gsp',
    name: 'German Shorthaired Pointer',
    blurb: 'the all-rounder',
    stats: { nose: 4, speed: 4, range: 3, steadiness: 4, stamina: 4 },
    motion: { runStride: 1.02, huntSurge: 0.09, surgeHz: 0.42, searchLooseness: 0.68, headFreedom: 0.7, tailAction: 0.65, verticalMotion: 0.74 },
    xpRate: 1,
  },
  {
    id: 'english-pointer',
    name: 'English Pointer',
    blurb: 'the Ferrari — big, fast, stylish',
    stats: { nose: 4, speed: 5, range: 5, steadiness: 4, stamina: 3 },
    motion: { runStride: 1.08, huntSurge: 0.16, surgeHz: 0.48, searchLooseness: 0.86, headFreedom: 0.75, tailAction: 0.72, verticalMotion: 0.9 },
    xpRate: 1,
  },
  {
    id: 'english-setter',
    name: 'English Setter',
    blurb: 'methodical and rock-steady',
    stats: { nose: 4, speed: 3, range: 5, steadiness: 5, stamina: 3 },
    motion: { runStride: 1, huntSurge: 0.08, surgeHz: 0.34, searchLooseness: 0.7, headFreedom: 0.82, tailAction: 0.86, verticalMotion: 1 },
    xpRate: 1,
  },
  {
    id: 'gwp',
    name: 'German Wirehaired Pointer',
    blurb: 'rugged coat, great nose',
    stats: { nose: 5, speed: 3, range: 3, steadiness: 4, stamina: 5 },
    motion: { runStride: 0.98, huntSurge: 0.06, surgeHz: 0.32, searchLooseness: 0.52, headFreedom: 0.66, tailAction: 0.52, verticalMotion: 0.78 },
    xpRate: 0.9,
  },
  {
    id: 'vizsla',
    name: 'Vizsla',
    blurb: 'close-working, quick to learn',
    stats: { nose: 3, speed: 4, range: 2, steadiness: 3, stamina: 3 },
    motion: { runStride: 1.01, huntSurge: 0.13, surgeHz: 0.5, searchLooseness: 0.82, headFreedom: 0.78, tailAction: 0.75, verticalMotion: 0.88 },
    xpRate: 1.2,
  },
  {
    id: 'pudelpointer',
    name: 'Pudelpointer',
    blurb: 'nose and retrieve drive',
    stats: { nose: 5, speed: 3, range: 3, steadiness: 4, stamina: 4 },
    motion: { runStride: 0.99, huntSurge: 0.07, surgeHz: 0.35, searchLooseness: 0.55, headFreedom: 0.7, tailAction: 0.56, verticalMotion: 0.8 },
    xpRate: 1,
  },
  {
    id: 'american-brittany',
    name: 'American Brittany',
    blurb: 'snappy, works the middle distance',
    stats: { nose: 3, speed: 4, range: 3, steadiness: 3, stamina: 4 },
    motion: { runStride: 0.92, huntSurge: 0.15, surgeHz: 0.58, searchLooseness: 0.95, headFreedom: 0.88, tailAction: 0.9, verticalMotion: 0.96 },
    xpRate: 1.1,
  },
  {
    id: 'french-brittany',
    name: 'French Brittany',
    blurb: 'closer and steadier than its cousin',
    stats: { nose: 4, speed: 3, range: 2, steadiness: 4, stamina: 4 },
    motion: { runStride: 0.9, huntSurge: 0.1, surgeHz: 0.52, searchLooseness: 0.78, headFreedom: 0.82, tailAction: 0.82, verticalMotion: 0.9 },
    xpRate: 1,
  },
  {
    id: 'deutsch-drahthaar',
    name: 'Deutsch-Drahthaar',
    blurb: 'premium nose, stubborn student',
    stats: { nose: 5, speed: 3, range: 3, steadiness: 4, stamina: 4 },
    motion: { runStride: 0.99, huntSurge: 0.05, surgeHz: 0.3, searchLooseness: 0.48, headFreedom: 0.62, tailAction: 0.48, verticalMotion: 0.76 },
    xpRate: 0.8,
  },
  {
    id: 'griffon',
    name: 'Wirehaired Pointing Griffon',
    blurb: 'deliberate, glued to you, honest',
    stats: { nose: 5, speed: 2, range: 2, steadiness: 5, stamina: 4 },
    motion: { runStride: 0.95, huntSurge: 0.04, surgeHz: 0.28, searchLooseness: 0.38, headFreedom: 0.58, tailAction: 0.44, verticalMotion: 0.72 },
    xpRate: 0.9,
  },
  {
    id: 'irish-setter',
    name: 'Irish Setter',
    blurb: 'flashy and fast, peaks early',
    stats: { nose: 4, speed: 5, range: 4, steadiness: 2, stamina: 2 },
    motion: { runStride: 1.05, huntSurge: 0.18, surgeHz: 0.54, searchLooseness: 1, headFreedom: 0.9, tailAction: 1, verticalMotion: 1.08 },
    xpRate: 1.2,
  },
];

export function getBreed(id: string): BreedConfig {
  return BREEDS.find((b) => b.id === id) ?? BREEDS[0];
}

export const DOG_NAMES = [
  'Belle', 'Boone', 'Sage', 'Remi', 'Gus', 'Millie', 'Duke', 'Pepper', 'Scout', 'Wren',
  'Ace', 'Ruby', 'Tucker', 'Willow', 'Dash', 'Hazel', 'Chief', 'Juniper', 'Ranger', 'Maple',
];

/** 1–5 stat rating → behavior multiplier (1→0.9, 3→1.1, 5→1.3). */
export function statMult(stat: number): number {
  return 0.8 + stat * 0.1;
}

function strongAxes(breed: BreedConfig): (keyof BreedStats)[] {
  const entries = Object.entries(breed.stats) as [keyof BreedStats, number][];
  const max = Math.max(...entries.map(([, v]) => v));
  return entries.filter(([, v]) => v === max).map(([k]) => k);
}

/** +5%/level on the breed's strongest axes, +3% elsewhere, capped at +40%. */
export function growthMult(breed: BreedConfig, level: number, axis: keyof BreedStats): number {
  const rate = strongAxes(breed).includes(axis) ? 0.05 : 0.03;
  return 1 + Math.min(0.4, (level - 1) * rate);
}

/** Effective nose multiplier: breed rating × growth × puppy maturity. */
export function noseMult(breed: BreedConfig, level: number): number {
  const maturity = Math.min(1, 0.7 + 0.03 * level);
  return statMult(breed.stats.nose) * growthMult(breed, level, 'nose') * maturity;
}

export function speedMult(breed: BreedConfig, level: number): number {
  return statMult(breed.stats.speed) * growthMult(breed, level, 'speed');
}

export function rangeMult(breed: BreedConfig, level: number): number {
  return statMult(breed.stats.range) * growthMult(breed, level, 'range');
}

/** Chance per point that the dog creeps and risks bumping the bird. */
export function creepChance(breed: BreedConfig, level: number): number {
  const fromSteady = (5 - breed.stats.steadiness) / 5;
  const fromLevel = Math.max(0.05, 1 - 0.11 * (level - 1));
  return 0.45 * fromSteady * fromLevel + 0.02 * fromLevel;
}

/** Bird nerve drain multiplier while this dog points. Puppy crowds; vet gives room. */
export function pointPressure(breed: BreedConfig, level: number): number {
  const steady = statMult(breed.stats.steadiness) * growthMult(breed, level, 'steadiness');
  return clamp(1.45 - 0.5 * (steady - 1) - 0.06 * (level - 1), 0.6, 1.45);
}

/** Chance the dog breaks chase when a covey rises instead of standing steady. */
export function breakChance(breed: BreedConfig, level: number): number {
  const fromSteady = (5 - breed.stats.steadiness) / 5;
  const fromLevel = Math.max(0.05, 1 - 0.11 * (level - 1));
  return 0.5 * fromSteady * fromLevel + 0.02 * fromLevel;
}

/**
 * 0: no upwind bonus, and birds within 30px downwind scent the dog and flush.
 * 1: full upwind bonus, dog-scent radius shrinks to 15px.
 * 2: veteran — birds effectively never scent a quartering dog.
 */
export function windCraftTier(level: number): 0 | 1 | 2 {
  return level >= 8 ? 2 : level >= 4 ? 1 : 0;
}

/** How close the dog can get before downwind birds catch its scent. */
export function dogScentRadius(level: number): number {
  const tier = windCraftTier(level);
  return tier === 2 ? 0 : tier === 1 ? 15 : 30;
}

/** Stamina pool in ms of active work — sized for the bigger T1.5 worlds. */
export function staminaMs(breed: BreedConfig, level: number): number {
  return 90_000 * statMult(breed.stats.stamina) * growthMult(breed, level, 'stamina');
}

/** XP required to advance FROM `level`. */
export function xpForLevel(level: number): number {
  return Math.round(20 * Math.pow(level, 1.5));
}

export function levelForXp(xp: number): number {
  let level = 1;
  let needed = 0;
  while (level < LEVEL_CAP) {
    needed += xpForLevel(level);
    if (xp < needed) break;
    level++;
  }
  return level;
}
