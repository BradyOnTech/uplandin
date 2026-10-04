import { describe, expect, it } from 'vitest';
import { DEFAULT_DOG_STYLE, DOG_STYLES, resolveDogStyle } from '../src/three/dogs/dogStyle';

describe('dog art style choice', () => {
  it('offers exactly the smooth and faceted styles', () => {
    expect(DOG_STYLES).toEqual(['smooth', 'faceted']);
  });
  it('resolves only known styles and leaves the breed default otherwise', () => {
    expect(resolveDogStyle('smooth')).toBe('smooth');
    expect(resolveDogStyle('faceted')).toBe('faceted');
    expect(resolveDogStyle('rigged')).toBeNull();
    expect(resolveDogStyle(null)).toBeNull();
  });
  it('keeps each breed on its established style by default', () => {
    expect(DEFAULT_DOG_STYLE).toEqual({ gsp: 'smooth', 'english-setter': 'faceted', griffon: 'faceted' });
  });
});
