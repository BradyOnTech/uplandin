import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GSP_COAT,
  GSP_COATS,
  GSP_COAT_IDS,
  germanShorthairedPointerAppearance,
  resolveGspCoat,
} from '../src/three/dogs/germanShorthairedPointer';

describe('German Shorthaired Pointer appearances', () => {
  it('exposes distinct legal working coat families', () => {
    expect(GSP_COATS.map((coat) => coat.id)).toEqual(GSP_COAT_IDS);
    expect(new Set(GSP_COAT_IDS).size).toBe(GSP_COAT_IDS.length);
    expect(GSP_COAT_IDS).toContain('liver-roan');
    expect(GSP_COAT_IDS).toContain('solid-liver');
    expect(GSP_COAT_IDS).toContain('black-roan');
  });

  it('uses liver roan as the recognizable default', () => {
    expect(DEFAULT_GSP_COAT).toBe('liver-roan');
    expect(resolveGspCoat(undefined)).toBe('liver-roan');
    expect(resolveGspCoat('not-a-coat')).toBe('liver-roan');
  });

  it('keeps solid and patterned coats structurally distinct', () => {
    expect(germanShorthairedPointerAppearance('solid-liver').pattern).toBe('solid');
    expect(germanShorthairedPointerAppearance('liver-roan').pattern).toBe('roan');
    expect(germanShorthairedPointerAppearance('liver-white').headBlaze).toBe(true);
  });
});
