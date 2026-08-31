import { describe, expect, it } from 'vitest';
import {
  createGallopPose,
  gallopGroundOffset,
  writeGallopPose,
} from '../src/three/dogs/gallop';

const TAU = Math.PI * 2;

describe('dog gallop', () => {
  it('extends the forequarters and trails the hinds during long flight', () => {
    const pose = writeGallopPose(TAU * 0.39, createGallopPose());
    expect(Math.min(pose.upper[0], pose.upper[1])).toBeGreaterThan(0.8);
    expect(Math.max(pose.upper[2], pose.upper[3])).toBeLessThan(-0.7);
    expect(pose.stretch).toBeGreaterThan(1.015);
    expect(pose.shoulderZ - pose.hipZ).toBeGreaterThan(0.045);
    expect(pose.flight).toBeGreaterThan(0.95);
  });

  it('tucks all four paws and compresses the spine during gathered flight', () => {
    const pose = writeGallopPose(TAU * 0.86, createGallopPose());
    expect(Math.max(pose.upper[0], pose.upper[1])).toBeLessThan(-0.45);
    expect(Math.min(pose.upper[2], pose.upper[3])).toBeGreaterThan(0.55);
    expect(Math.min(...pose.lower)).toBeGreaterThan(1.05);
    expect(pose.stretch).toBeLessThan(0.98);
    expect(pose.hipZ - pose.shoulderZ).toBeGreaterThan(0.045);
    expect(pose.flight).toBeGreaterThan(0.95);
  });

  it('extends the correct pair for rear and fore contacts', () => {
    const rearContact = writeGallopPose(TAU * 0.125, createGallopPose());
    expect(Math.min(rearContact.lower[2], rearContact.lower[3])).toBeGreaterThan(0.7);
    expect(Math.max(rearContact.lower[2], rearContact.lower[3])).toBeLessThan(1.2);
    expect(rearContact.flight).toBeLessThan(0.1);

    const foreContact = writeGallopPose(TAU * 0.5, createGallopPose());
    expect(Math.max(foreContact.lower[0], foreContact.lower[1])).toBeLessThan(0.32);
    expect(foreContact.flight).toBeLessThan(0.1);
  });

  it('wraps without a pose discontinuity', () => {
    const start = writeGallopPose(0, createGallopPose());
    const wrapped = writeGallopPose(TAU, createGallopPose());
    expect(wrapped.upper).toEqual(start.upper);
    expect(wrapped.lower).toEqual(start.lower);
    expect(wrapped.stretch).toBe(start.stretch);
    expect(wrapped.flight).toBe(start.flight);
  });

  it('keeps the topline traveling forward instead of visibly bouncing', () => {
    const pose = createGallopPose();
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < 64; i++) {
      writeGallopPose((TAU * i) / 64, pose);
      low = Math.min(low, pose.bob);
      high = Math.max(high, pose.bob);
    }
    expect(high - low).toBeLessThanOrEqual(0.04);
  });

  it('recoils the shoulder and pelvis instead of scaling one rigid body block', () => {
    const pose = createGallopPose();
    let shoulderLow = Infinity;
    let shoulderHigh = -Infinity;
    let hipLow = Infinity;
    let hipHigh = -Infinity;
    for (let i = 0; i < 64; i++) {
      writeGallopPose((TAU * i) / 64, pose);
      shoulderLow = Math.min(shoulderLow, pose.shoulderZ);
      shoulderHigh = Math.max(shoulderHigh, pose.shoulderZ);
      hipLow = Math.min(hipLow, pose.hipZ);
      hipHigh = Math.max(hipHigh, pose.hipZ);
    }
    expect(shoulderHigh - shoulderLow).toBeGreaterThanOrEqual(0.035);
    expect(hipHigh - hipLow).toBeGreaterThanOrEqual(0.045);
  });

  it('does not lift and drop the whole dog to solve run contacts', () => {
    // Extremes measured from the real flat-ground cycle that reproduced the
    // user's bounce: one contact penetrated 9.5 cm before correction while
    // another floated 6.3 cm. Legs must absorb that disagreement.
    const offsets = [
      gallopGroundOffset(-0.095, 0),
      gallopGroundOffset(0.063, 0),
      gallopGroundOffset(0.2, 1),
    ];
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThanOrEqual(0.04);
    expect(offsets[2]).toBe(0);
  });
});
