import { describe, expect, it } from 'vitest';
import {
  barrelTiltDeg,
  blendGunPose,
  flushHasVegBlock,
  GUN_MOUNT_Y,
  GUN_REST,
  pickBackdropIndex,
  stepGunPose,
} from '../src/game/gunAim';

describe('gunAim (first-person barrel)', () => {
  it('barrelTiltDeg leans toward aim X and stays modest', () => {
    expect(barrelTiltDeg(240, 100, 1)).toBeLessThan(0);
    expect(barrelTiltDeg(240, 380, 1)).toBeGreaterThan(0);
    expect(Math.abs(barrelTiltDeg(240, 800, 1))).toBeLessThanOrEqual(18);
  });

  it('blendGunPose at 0 is rest; at 1 rises but the pivot stays in the corner', () => {
    const rest = blendGunPose(0, 240, 100);
    expect(rest.mount).toBe(0);
    expect(rest.y).toBeCloseTo(GUN_REST.y, 5);
    const up = blendGunPose(1, 320, 60);
    expect(up.mount).toBe(1);
    expect(up.y).toBeCloseTo(GUN_MOUNT_Y, 5);
    // The hunter's-eye gun is corner-anchored: the pivot never wanders
    // toward screen center — the swing toward the aim is all in the angle.
    expect(up.x).toBeGreaterThan(430);
    expect(up.x).toBeLessThanOrEqual(GUN_REST.x);
  });

  it('the barrels always run up-left out of the corner, never upright or flat', () => {
    for (const aimX of [20, 240, 460]) {
      const pose = blendGunPose(1, aimX, 80);
      expect(pose.angleDeg).toBeLessThanOrEqual(-10); // never a vertical monolith
      expect(pose.angleDeg).toBeGreaterThanOrEqual(-56); // never lays across the view
    }
    // Aiming left leans the muzzle further left than aiming right.
    expect(blendGunPose(1, 60, 80).angleDeg).toBeLessThan(blendGunPose(1, 420, 80).angleDeg);
  });

  it('stepGunPose rises toward full mount when wantMounted', () => {
    let pose = { ...GUN_REST };
    for (let i = 0; i < 40; i++) {
      pose = stepGunPose(pose, 200, 90, true, 1 / 60);
    }
    expect(pose.mount).toBeGreaterThan(0.9);
    expect(pose.y).toBeLessThan(GUN_REST.y);
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
