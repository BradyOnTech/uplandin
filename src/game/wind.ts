import type { RNG } from './types';

/**
 * Per-hunt wind strength. Strong wind is a trade: it carries scent farther
 * (the dog smells more birds) but birds get jumpy — shorter nerve — and the
 * dog's own scent carries farther downwind too.
 */
export type WindStrength = 'calm' | 'breezy' | 'strong';

export interface WindMults {
  /** Multiplies the dog's scent reach. */
  scent: number;
  /** Multiplies bird nerve at spawn. */
  nerve: number;
  /** Multiplies the radius at which downwind birds scent the dog. */
  dogScent: number;
}

const MULTS: Record<WindStrength, WindMults> = {
  calm: { scent: 1, nerve: 1, dogScent: 1 },
  breezy: { scent: 1.1, nerve: 0.92, dogScent: 1.15 },
  strong: { scent: 1.25, nerve: 0.8, dogScent: 1.3 },
};

export function windMults(strength: WindStrength): WindMults {
  return MULTS[strength];
}

export function rollWindStrength(rng: RNG): WindStrength {
  const r = rng();
  return r < 0.35 ? 'calm' : r < 0.75 ? 'breezy' : 'strong';
}
