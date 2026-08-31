import { describe, expect, it } from 'vitest';
import { getSpecies, SPECIES } from '../src/game/species';
import {
  BIRD_SHAPES,
  birdFamilyFor,
  birdVisualScale,
} from '../src/three/subsystems/birds';

describe('modular 3D bird families', () => {
  it('maps every species onto one of the four shared flight rigs', () => {
    expect(SPECIES.map((species) => birdFamilyFor(species.id))).toEqual([
      'quail', 'pheasant', 'grouse', 'woodcock', 'grouse', 'quail', 'quail',
      'grouse', 'grouse', 'quail', 'quail', 'quail', 'quail', 'quail',
    ]);
  });

  it('gives the anatomical outliers materially different silhouettes', () => {
    expect(BIRD_SHAPES.pheasant.tailLength).toBeGreaterThan(BIRD_SHAPES.quail.tailLength * 3);
    expect(BIRD_SHAPES.grouse.tailWidth).toBeGreaterThan(BIRD_SHAPES.quail.tailWidth * 1.5);
    expect(BIRD_SHAPES.woodcock.billLength).toBeGreaterThan(BIRD_SHAPES.quail.billLength * 3);
    expect(BIRD_SHAPES.grouse.wingChord).toBeGreaterThan(BIRD_SHAPES.quail.wingChord);
  });

  it('layers species target size over the family proportions', () => {
    expect(birdVisualScale(getSpecies('ringneck'))).toBeGreaterThan(birdVisualScale(getSpecies('bobwhite')));
    expect(birdVisualScale(getSpecies('california-quail'))).toBeCloseTo(birdVisualScale(getSpecies('bobwhite')), 1);
  });
});
