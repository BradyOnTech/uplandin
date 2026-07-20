import { describe, expect, it } from 'vitest';
import {
  blendGunPose,
  flushHasVegBlock,
  GUN_LEAN_MAX,
  GUN_MOUNT_Y,
  GUN_REST,
  GUN_SWAY_MAX,
  leanDeg,
  pickBackdropIndex,
  RECOIL_MS,
  recoilOffset,
  stepGunPose,
} from '../src/game/gunAim';

describe('gunAim (v3 — sway, never swing)', () => {
  it('a held gun leans only a few degrees, toward the aim', () => {
    expect(leanDeg(300, 60, 1)).toBeLessThan(0);
    expect(leanDeg(300, 460, 1)).toBeGreaterThan(0);
    // Even an aim at the far screen edge never breaks the hold illusion.
    expect(Math.abs(leanDeg(300, -500, 1))).toBeLessThanOrEqual(GUN_LEAN_MAX);
    expect(Math.abs(leanDeg(300, 900, 1))).toBeLessThanOrEqual(GUN_LEAN_MAX);
    // At rest (mount 0) there is no lean at all.
    expect(Math.abs(leanDeg(300, 60, 0))).toBe(0);
  });

  it('blendGunPose: rest sits low; mounting rises and sways with the aim', () => {
    const rest = blendGunPose(0, 240, 100);
    expect(rest.y).toBeCloseTo(GUN_REST.y, 5);
    expect(rest.x).toBeCloseTo(GUN_REST.x, 5); // no sway while lowered
    const left = blendGunPose(1, 60, 80);
    const right = blendGunPose(1, 420, 80);
    expect(left.y).toBeCloseTo(GUN_MOUNT_Y, 5);
    // The anchor translates with the aim — the FPS sway — but stays leashed.
    expect(left.x).toBeLessThan(right.x);
    expect(Math.abs(left.x - GUN_REST.x)).toBeLessThanOrEqual(GUN_SWAY_MAX);
    expect(Math.abs(right.x - GUN_REST.x)).toBeLessThanOrEqual(GUN_SWAY_MAX);
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
