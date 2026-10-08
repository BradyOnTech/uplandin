import { describe, expect, it } from 'vitest';
import { LOOK_CLOSER_FOV, lookCloserFov, lookCloserGunDrop, stepLookCloser } from '../src/three/lookCloser';

describe('looking closer at the dog', () => {
  it('eases in while held and back out on release', () => {
    let look = 0;
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) seen.push(look = stepLookCloser(look, true, 1 / 60));
    expect(seen.every((value, i) => i === 0 || value >= seen[i - 1])).toBe(true);
    expect(look).toBeGreaterThan(.95);
    for (let i = 0; i < 60; i++) look = stepLookCloser(look, true, 1 / 60);
    expect(look).toBe(1);
    for (let i = 0; i < 60; i++) look = stepLookCloser(look, false, 1 / 60);
    expect(look).toBe(0);
  });

  it('settles the same at any frame rate', () => {
    let fast = 0, slow = 0;
    for (let i = 0; i < 12; i++) fast = stepLookCloser(fast, true, 1 / 120);
    for (let i = 0; i < 3; i++) slow = stepLookCloser(slow, true, 1 / 30);
    expect(fast).toBeCloseTo(slow, 6);
    expect(stepLookCloser(.4, true, 0)).toBe(.4);
  });

  it('narrows the carried view and hands a mounted gun its own sight picture', () => {
    expect(lookCloserFov(70, 0, 0)).toBe(70);
    expect(lookCloserFov(70, 1, 0)).toBe(LOOK_CLOSER_FOV);
    expect(lookCloserFov(58, 1, 1)).toBe(58);
    const halfMounted = lookCloserFov(64, 1, .5);
    expect(halfMounted).toBeGreaterThan(LOOK_CLOSER_FOV);
    expect(halfMounted).toBeLessThan(64);
  });

  it('lowers the gun out of the narrowed view', () => {
    expect(lookCloserGunDrop(0, 0)).toBe(0);
    expect(lookCloserGunDrop(1, 0)).toBeGreaterThan(.2);
    expect(lookCloserGunDrop(1, 1)).toBe(0);
  });
});
