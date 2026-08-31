import { describe, expect, it } from 'vitest';
import { getBreed } from '../src/game/breeds';
import {
  breedStrideScale,
  createHuntMotionPose,
  huntPaceMultiplier,
  writeHuntMotionPose,
} from '../src/three/dogs/huntMotion';

describe('breed locomotion character', () => {
  const setter = getBreed('english-setter').motion;
  const pointer = getBreed('english-pointer').motion;

  it('gives a Pointer a longer running stride than a Setter', () => {
    expect(breedStrideScale(pointer, 'gallop')).toBeGreaterThan(breedStrideScale(setter, 'gallop'));
    expect(breedStrideScale(pointer, 'canter')).toBeGreaterThan(breedStrideScale(setter, 'canter'));
    expect(breedStrideScale(pointer, 'walk')).toBe(1);
  });

  it('varies active hunting pace but leaves non-search travel alone', () => {
    const slow = huntPaceMultiplier(pointer, Math.PI * 1.5, true);
    const fast = huntPaceMultiplier(pointer, Math.PI * 0.5, true);
    expect(fast).toBeGreaterThan(slow);
    expect(huntPaceMultiplier(pointer, Math.PI * 0.5, false)).toBe(1);
  });

  it('counter-rotates the chest, pelvis, head, and tail during a search turn', () => {
    const pose = writeHuntMotionPose(pointer, 'quartering', 'run', 0.25, 2, createHuntMotionPose());
    expect(pose.chestYaw).toBeGreaterThan(0);
    expect(pose.pelvisYaw).toBeLessThan(0);
    expect(pose.headYaw).toBeGreaterThan(0);
    expect(pose.tailYaw).toBeLessThan(0);
  });

  it('does not wiggle a point or heel pose', () => {
    const pose = createHuntMotionPose();
    writeHuntMotionPose(pointer, 'pointing', 'still', 0.25, 2, pose);
    expect(pose).toEqual(createHuntMotionPose());
  });
});
