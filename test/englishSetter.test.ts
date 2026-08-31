import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGLISH_SETTER_COAT,
  ENGLISH_SETTER_COATS,
  englishSetterAppearance,
  resolveEnglishSetterCoat,
} from '../src/three/dogs/englishSetter';

describe('English Setter appearance', () => {
  it('offers every standard belton color exactly once', () => {
    expect(ENGLISH_SETTER_COATS.map((coat) => coat.id)).toEqual([
      'orange-belton',
      'blue-belton',
      'tricolor',
      'liver-belton',
      'lemon-belton',
    ]);
    expect(new Set(ENGLISH_SETTER_COATS.map((coat) => coat.id)).size).toBe(5);
  });

  it('defaults missing and unknown values to the supplied orange reference coat', () => {
    expect(resolveEnglishSetterCoat(null)).toBe(DEFAULT_ENGLISH_SETTER_COAT);
    expect(resolveEnglishSetterCoat('not-a-coat')).toBe(DEFAULT_ENGLISH_SETTER_COAT);
  });

  it('keeps tricolor tan points exclusive to the tricolor coat', () => {
    for (const choice of ENGLISH_SETTER_COATS) {
      const appearance = englishSetterAppearance(choice.id);
      expect(appearance.label).toBe(choice.label);
      expect(appearance.tanPoint !== undefined).toBe(choice.id === 'tricolor');
    }
  });
});
