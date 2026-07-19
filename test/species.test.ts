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

  it('ships the full 14-species design list', () => {
    const ids = SPECIES.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        'ringneck', 'sharptail', 'prairie-chicken', 'woodcock', 'ruffed-grouse', 'blue-grouse',
        'hun', 'chukar', 'bobwhite', 'california-quail', 'gambels-quail', 'scaled-quail',
        'mearns-quail', 'mountain-quail',
      ].sort(),
    );
  });

  it('archetypes hold: holders sit, wild-flushers do not', () => {
    // Woodcock famously confiding; sharptail and Huns flush wild early.
    expect(getSpecies('woodcock').nerveMinMs).toBeGreaterThan(getSpecies('sharptail').nerveMaxMs);
    expect(getSpecies('bobwhite').nerveMinMs).toBeGreaterThan(getSpecies('hun').nerveMaxMs);
    // Montezuma quail sit tightest of all — and never run.
    expect(getSpecies('mearns-quail').nerveMaxMs).toBe(Math.max(...SPECIES.map((s) => s.nerveMaxMs)));
    expect(getSpecies('mearns-quail').runnerChance).toBe(0);
    // Ringneck, chukar, and scalies are the runners; the desert track stars get extra legs.
    expect(getSpecies('ringneck').runnerChance).toBeGreaterThan(0.5);
    expect(getSpecies('chukar').runnerChance).toBeGreaterThan(0.5);
    expect(getSpecies('chukar').runSpeedMult).toBeGreaterThan(1);
    expect(getSpecies('scaled-quail').runSpeedMult).toBeGreaterThan(1);
    // The chukar's downhill flush is the flattest, fastest arc in the game.
    expect(getSpecies('chukar').flight.climb).toBe(Math.min(...SPECIES.map((s) => s.flight.climb)));
    expect(getSpecies('chukar').flight.speedMax).toBe(Math.max(...SPECIES.map((s) => s.flight.speedMax)));
    // Only the ringneck carries the hen rule.
    expect(SPECIES.filter((s) => s.henRule).map((s) => s.id)).toEqual(['ringneck']);
  });

  it('target personality: quail are small buzzing gliders, roosters big slow-beating liars', () => {
    const quail = getSpecies('bobwhite');
    const rooster = getSpecies('ringneck');
    // Smaller and faster-winged than a pheasant — your realism tribute.
    expect(quail.size!).toBeLessThan(rooster.size!);
    expect(quail.flight.flapRate!).toBeGreaterThan(rooster.flight.flapRate!);
    // Quail burst then lock wings; the rooster levels off and accelerates.
    expect(quail.flight.glideAfterMs).toBeGreaterThan(0);
    expect(rooster.flight.levelAfterMs).toBeGreaterThan(0);
    expect(SPECIES.filter((s) => s.flight.levelAfterMs).map((s) => s.id)).toEqual(['ringneck']);
    // Every species carries a sane shot-view size.
    for (const s of SPECIES) {
      expect(s.size ?? 1).toBeGreaterThanOrEqual(0.5);
      expect(s.size ?? 1).toBeLessThanOrEqual(1.3);
    }
    // All the quail-family birds glide; the pheasant is the only one in its class.
    for (const id of ['california-quail', 'gambels-quail', 'scaled-quail', 'mountain-quail', 'hun', 'sharptail']) {
      expect(getSpecies(id).flight.glideAfterMs).toBeGreaterThan(0);
    }
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
