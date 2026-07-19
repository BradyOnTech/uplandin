import { describe, expect, it } from 'vitest';
import { getSpecies, rollSpecies, SPECIES } from '../src/game/species';

describe('species', () => {
  it('have unique ids and sane configs', () => {
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    for (const s of SPECIES) {
      expect(s.coveyMin).toBeGreaterThanOrEqual(1);
      expect(s.coveyMax).toBeGreaterThanOrEqual(s.coveyMin);
      expect(s.runnerChance).toBeGreaterThanOrEqual(0);
      expect(s.runnerChance).toBeLessThanOrEqual(1);
      expect(s.nerveMinMs).toBeLessThanOrEqual(s.nerveMaxMs);
      expect(s.flight.speedMin).toBeLessThanOrEqual(s.flight.speedMax);
      expect(s.flight.climb).toBeGreaterThan(0);
      expect(s.flight.climb).toBeLessThanOrEqual(1);
    }
  });

  it('archetypes hold: holders sit, wild-flushers do not', () => {
    // Woodcock famously confiding; sharptail and Huns flush wild early.
    expect(getSpecies('woodcock').nerveMinMs).toBeGreaterThan(getSpecies('sharptail').nerveMaxMs);
    expect(getSpecies('bobwhite').nerveMinMs).toBeGreaterThan(getSpecies('hun').nerveMaxMs);
    // Ringneck is the runner.
    expect(getSpecies('ringneck').runnerChance).toBeGreaterThan(0.5);
    // Only the ringneck carries the hen rule.
    expect(SPECIES.filter((s) => s.henRule).map((s) => s.id)).toEqual(['ringneck']);
  });

  it('getSpecies falls back to the first species', () => {
    expect(getSpecies('nope')).toBe(SPECIES[0]);
  });

  it('rollSpecies respects weights', () => {
    const mix = [
      { speciesId: 'ruffed-grouse', weight: 0.75 },
      { speciesId: 'woodcock', weight: 0.25 },
    ];
    expect(rollSpecies(mix, 0.1).id).toBe('ruffed-grouse');
    expect(rollSpecies(mix, 0.74).id).toBe('ruffed-grouse');
    expect(rollSpecies(mix, 0.76).id).toBe('woodcock');
    expect(rollSpecies(mix, 0.999).id).toBe('woodcock');
  });
});
