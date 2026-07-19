import type { RNG } from './types';

/**
 * Per-hunt weather conditions, rolled like wind strength. Each is a small
 * trade across scent, bird nerve, dog stamina, and finding the fall:
 * frost mornings are the good days; hot and dry punishes the dog; rain
 * knocks scent down but birds sit; fresh snow holds birds and makes
 * marking a downed bird easy.
 */
export type Condition = 'mild' | 'frost' | 'hot' | 'rain' | 'snow';

export const CONDITIONS: Condition[] = ['mild', 'frost', 'hot', 'rain', 'snow'];

export interface ConditionMults {
  /** Multiplies the dog's scent reach. */
  scent: number;
  /** Multiplies bird nerve at spawn (higher = holds longer). */
  nerve: number;
  /** Multiplies the dog's stamina drain while working. */
  stamina: number;
  /** Multiplies the unmarked-fall search time. */
  search: number;
}

const MULTS: Record<Condition, ConditionMults> = {
  mild: { scent: 1, nerve: 1, stamina: 1, search: 1 },
  frost: { scent: 1.15, nerve: 1.25, stamina: 1, search: 1 },
  hot: { scent: 0.75, nerve: 0.9, stamina: 1.5, search: 1.15 },
  rain: { scent: 0.6, nerve: 1.3, stamina: 1.1, search: 1.4 },
  snow: { scent: 0.9, nerve: 1.3, stamina: 1.2, search: 0.6 },
};

export function conditionMults(c: Condition): ConditionMults {
  return MULTS[c];
}

/** Roll the day. An area's climate bias (desert heat, high-country snow) hits ~45% of hunts. */
export function rollCondition(rng: RNG, bias?: Condition): Condition {
  if (bias && rng() < 0.45) return bias;
  const r = rng();
  if (r < 0.4) return 'mild';
  if (r < 0.62) return 'frost';
  if (r < 0.77) return 'hot';
  if (r < 0.92) return 'rain';
  return 'snow';
}
