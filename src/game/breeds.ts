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

export interface BreedConfig {
  id: string;
  name: string;
  blurb: string;
  stats: BreedStats;
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
    xpRate: 1,
  },
  {
    id: 'english-pointer',
    name: 'English Pointer',
    blurb: 'the Ferrari — big, fast, stylish',
    stats: { nose: 4, speed: 5, range: 5, steadiness: 4, stamina: 3 },
    xpRate: 1,
  },
  {
    id: 'english-setter',
    name: 'English Setter',
    blurb: 'methodical and rock-steady',
    stats: { nose: 4, speed: 3, range: 5, steadiness: 5, stamina: 3 },
    xpRate: 1,
  },
  {
    id: 'gwp',
    name: 'German Wirehaired Pointer',
    blurb: 'rugged coat, great nose',
    stats: { nose: 5, speed: 3, range: 3, steadiness: 4, stamina: 5 },
    xpRate: 0.9,
  },
  {
    id: 'vizsla',
    name: 'Vizsla',
    blurb: 'close-working, quick to learn',
    stats: { nose: 3, speed: 4, range: 2, steadiness: 3, stamina: 3 },
    xpRate: 1.2,
  },
  {
    id: 'pudelpointer',
    name: 'Pudelpointer',
    blurb: 'nose and retrieve drive',
    stats: { nose: 5, speed: 3, range: 3, steadiness: 4, stamina: 4 },
    xpRate: 1,
  },
  {
    id: 'american-brittany',
    name: 'American Brittany',
    blurb: 'snappy, works the middle distance',
    stats: { nose: 3, speed: 4, range: 3, steadiness: 3, stamina: 4 },
    xpRate: 1.1,
  },
  {
    id: 'french-brittany',
    name: 'French Brittany',
    blurb: 'closer and steadier than its cousin',
    stats: { nose: 4, speed: 3, range: 2, steadiness: 4, stamina: 4 },
    xpRate: 1,
  },
  {
    id: 'deutsch-drahthaar',
    name: 'Deutsch-Drahthaar',
    blurb: 'premium nose, stubborn student',
    stats: { nose: 5, speed: 3, range: 3, steadiness: 4, stamina: 4 },
    xpRate: 0.8,
  },
  {
    id: 'griffon',
    name: 'Wirehaired Pointing Griffon',
    blurb: 'deliberate, glued to you, honest',
    stats: { nose: 5, speed: 2, range: 2, steadiness: 5, stamina: 4 },
    xpRate: 0.9,
  },
  {
    id: 'irish-setter',
    name: 'Irish Setter',
    blurb: 'flashy and fast, peaks early',
    stats: { nose: 4, speed: 5, range: 4, steadiness: 2, stamina: 2 },
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

/** Stamina pool in ms of active work. */
export function staminaMs(breed: BreedConfig, level: number): number {
  return 60_000 * statMult(breed.stats.stamina) * growthMult(breed, level, 'stamina');
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
