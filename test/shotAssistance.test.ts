import { describe, expect, it } from 'vitest';
import { resolveShotAssistance, shotAssistanceAllowance, type ShotAssistancePreference } from '../src/three/shotAssistance';

describe('touch shot assistance policy', () => {
  it('uses the active challenge by default, with independent explicit overrides', () => {
    expect(resolveShotAssistance('relaxed', 'difficulty', 'touch').level).toBe('generous');
    expect(resolveShotAssistance('balanced', 'difficulty', 'touch').level).toBe('light');
    expect(resolveShotAssistance('wild', 'difficulty', 'touch').level).toBe('off');
    expect(resolveShotAssistance('relaxed', 'off', 'touch').level).toBe('off');
    expect(resolveShotAssistance('wild', 'light', 'touch').level).toBe('light');
    expect(resolveShotAssistance('wild', 'generous', 'touch').level).toBe('generous');
  });

  it.each(['mouse', 'keyboard', 'other'] as const)('never grants assistance to %s triggers', source => {
    for (const preference of ['difficulty', 'off', 'light', 'generous'] as const) {
      const profile = resolveShotAssistance('relaxed', preference, source);
      expect(profile.level).toBe('off');
      expect(shotAssistanceAllowance(30, profile)).toBe(0);
    }
  });

  it('falls back to difficulty for invalid stored preferences and freezes resolved profiles', () => {
    const profile = resolveShotAssistance('relaxed', 'broken' as ShotAssistancePreference, 'touch');
    expect(profile.level).toBe('generous');
    expect(Object.isFrozen(profile)).toBe(true);
    resolveShotAssistance('wild', 'difficulty', 'touch');
    expect(profile.level).toBe('generous');
  });

  it('limits nearby allowance by angle and far allowance by world distance', () => {
    const light = resolveShotAssistance('balanced', 'difficulty', 'touch');
    const generous = resolveShotAssistance('relaxed', 'difficulty', 'touch');
    expect(shotAssistanceAllowance(12, light)).toBeCloseTo(.09425, 4);
    expect(shotAssistanceAllowance(12, generous)).toBeCloseTo(.16756, 4);
    expect(shotAssistanceAllowance(30, light)).toBeCloseTo(.23562, 4);
    expect(shotAssistanceAllowance(30, generous)).toBe(.4);
    expect(shotAssistanceAllowance(50, light)).toBe(.24);
    expect(shotAssistanceAllowance(50, generous)).toBe(.4);
    for (const distance of [0, -10, NaN, Infinity]) {
      expect(shotAssistanceAllowance(distance, generous)).toBe(0);
    }
  });
});
