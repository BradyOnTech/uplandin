import { describe, expect, it } from 'vitest';
import {
  blendGunPose,
  flushHasVegBlock,
  GUN_LEAN_MAX,
  GUN_MOUNT,
  GUN_MUZZLE_OFFSET,
  GUN_REST,
  leanDeg,
  muzzlePoint,
  pickBackdropIndex,
  RECOIL_MS,
  recoilOffset,
  stepGunPose,
} from '../src/game/gunAim';

describe('gunAim (painted FPS gun — sway, never swing)', () => {
  it('blend(0) IS the declared rest pose — no first-frame snap', () => {
    const rest = blendGunPose(0, 240, 100);
    expect(rest.x).toBeCloseTo(GUN_REST.x, 5);
    expect(rest.y).toBeCloseTo(GUN_REST.y, 5);
    expect(rest.angleDeg).toBeCloseTo(GUN_REST.angleDeg, 5);
  });

  it('mounting RAISES the muzzle toward the aim line (rest droops it)', () => {
    // This art's muzzle sits up-left of the pivot: POSITIVE delta raises
    // the bead (verified via muzzlePoint below). Mounted > rest.
    const rest = blendGunPose(0, 240, 100);
    const up = blendGunPose(1, 240, 100);
    expect(up.angleDeg).toBeGreaterThan(rest.angleDeg);
    expect(up.y).toBeCloseTo(GUN_MOUNT.y, 5);
    // And the bead genuinely sits higher when mounted:
    const restBead = muzzlePoint(rest.x, rest.y, rest.angleDeg);
    const upBead = muzzlePoint(up.x, up.y, up.angleDeg);
    expect(upBead.y).toBeLessThan(restBead.y);
  });

  it('sway does the tracking; lean stays small', () => {
    const left = blendGunPose(1, 60, 80);
    const right = blendGunPose(1, 420, 80);
    // The anchor translates with the aim…
    expect(left.x).toBeLessThan(right.x);
    // …and the lean toward the aim never exceeds the sway cap.
    expect(Math.abs(leanDeg(300, -500, 1))).toBeLessThanOrEqual(GUN_LEAN_MAX);
    expect(Math.abs(leanDeg(300, 900, 1))).toBeLessThanOrEqual(GUN_LEAN_MAX);
    expect(Math.abs(leanDeg(300, 60, 0))).toBe(0); // no lean while lowered
    // Aiming left swings the bead left of aiming right.
    const lb = muzzlePoint(left.x, left.y, left.angleDeg);
    const rb = muzzlePoint(right.x, right.y, right.angleDeg);
    expect(lb.x).toBeLessThan(rb.x);
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

  it('muzzlePoint rotates the bead offset with the pose', () => {
    // Unrotated: the raw offset.
    const flat = muzzlePoint(100, 200, 0);
    expect(flat.x).toBeCloseTo(100 + GUN_MUZZLE_OFFSET.x, 5);
    expect(flat.y).toBeCloseTo(200 + GUN_MUZZLE_OFFSET.y, 5);
    // Raising the muzzle (positive delta for this art) lifts the bead.
    const raised = muzzlePoint(100, 200, 15);
    expect(raised.y).toBeLessThan(flat.y);
    // Rotation preserves the distance from anchor to bead.
    const d = Math.hypot(GUN_MUZZLE_OFFSET.x, GUN_MUZZLE_OFFSET.y);
    expect(Math.hypot(raised.x - 100, raised.y - 200)).toBeCloseTo(d, 5);
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
