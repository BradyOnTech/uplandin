import { describe, expect, it } from 'vitest';
import { devDogLevel } from '../src/game/dev';

describe('devDogLevel', () => {
  it('parses ?doglevel= from the query string', () => {
    expect(devDogLevel('?doglevel=8')).toBe(8);
    expect(devDogLevel('?foo=1&doglevel=5')).toBe(5);
  });

  it('clamps to the 1-10 level range', () => {
    expect(devDogLevel('?doglevel=99')).toBe(10);
    expect(devDogLevel('?doglevel=0')).toBe(1);
  });

  it('returns null when absent or malformed', () => {
    expect(devDogLevel('')).toBeNull();
    expect(devDogLevel('?other=2')).toBeNull();
    expect(devDogLevel('?doglevel=abc')).toBeNull();
  });
});
