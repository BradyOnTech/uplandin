import { describe, expect, it } from 'vitest';
import {
  barrelTiltDeg,
  blendGunPose,
  flushHasVegBlock,
  GUN_MOUNT,
  GUN_REST,
  pickBackdropIndex,
  RECOIL_MS,
  recoilOffset,
  stepGunPose,
} from '../src/game/gunAim';

describe('gunAim (FPS weapon sprite)', () => {
  it('barrelTiltDeg leans toward aim X and stays modest', () => {
    expect(barrelTiltDeg(300, 100, 1)).toBeLessThan(0);
    expect(barrelTiltDeg(300, 400, 1)).toBeGreaterThan(0);
    expect(Math.abs(barrelTiltDeg(300, 800, 1))).toBeLessThanOrEqual(16);
  });

  it('blendGunPose at 0 is rest; at 1 sits higher and tracks aim X gently', () => {
    const rest = blendGunPose(0, 240, 100);
    expect(rest.mount).toBe(0);
    expect(rest.y).toBeCloseTo(GUN_REST.y, 5);
    const up = blendGunPose(1, 320, 60);
    expect(up.mount).toBe(1);
    expect(up.y).toBeCloseTo(GUN_MOUNT.y, 5);
    // Stays in lower-right / center-right — never a full-screen wedge.
    expect(up.y).toBeGreaterThan(230);
    expect(up.x).toBeGreaterThan(250);
  });

  it('stepGunPose rises toward full mount when wantMounted', () => {
    let pose = { ...GUN_REST };
    for (let i = 0; i < 40; i++) {
      pose = stepGunPose(pose, 200, 90, true, 1 / 60);
    }
    expect(pose.mount).toBeGreaterThan(0.9);
    expect(pose.y).toBeLessThan(GUN_REST.y);
  });

  it('recoil kicks hard at impact and settles to nothing', () => {
    const impact = recoilOffset(0);
    expect(impact.dy).toBeGreaterThan(0);
    expect(impact.dAngleDeg).toBeGreaterThan(0);
    const mid = recoilOffset(RECOIL_MS / 2);
    expect(mid.dy).toBeLessThan(impact.dy);
    expect(mid.dy).toBeGreaterThan(0);
    expect(recoilOffset(RECOIL_MS)).toEqual({ dy: 0, dAngleDeg: 0 });
    expect(recoilOffset(-5)).toEqual({ dy: 0, dAngleDeg: 0 }); // pre-shot: no kick
  });

  it('pickBackdropIndex cycles the pool deterministically', () => {
    expect(pickBackdropIndex(3, 0)).toBe(0);
    expect(pickBackdropIndex(3, 1)).toBe(1);
    expect(pickBackdropIndex(3, 2)).toBe(2);
    expect(pickBackdropIndex(3, 3)).toBe(0);
  });

  it('flushHasVegBlock is stable for a seed', () => {
    expect(flushHasVegBlock(10)).toBe(flushHasVegBlock(10));
  });
});
