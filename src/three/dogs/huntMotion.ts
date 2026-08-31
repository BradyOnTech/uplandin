import type { BreedMotion } from '../../game/breeds';
import type { DogGait, DogState } from '../../game/dog';
import type { LocomotionGait } from './locomotion';

const TAU = Math.PI * 2;

export interface HuntMotionPose {
  chestYaw: number;
  pelvisYaw: number;
  pelvisRoll: number;
  headYaw: number;
  tailYaw: number;
}

export function createHuntMotionPose(): HuntMotionPose {
  return { chestYaw: 0, pelvisYaw: 0, pelvisRoll: 0, headYaw: 0, tailYaw: 0 };
}

/** Smooth live acceleration/deceleration, bounded around the sim's pace. */
export function huntPaceMultiplier(motion: BreedMotion, phase: number, active: boolean): number {
  if (!active) return 1;
  const pulse = Math.sin(phase) * 0.72 + Math.sin(phase * 0.47 + 0.8) * 0.28;
  return 1 + motion.huntSurge * pulse;
}

/**
 * Larger gallop stride means fewer cycles per metre; trot receives only
 * half the breed distinction and a deliberate walk remains universal.
 */
export function breedStrideScale(motion: BreedMotion, gait: LocomotionGait): number {
  if (gait === 'gallop') return motion.runStride;
  if (gait === 'canter') return 1 + (motion.runStride - 1) * 0.8;
  if (gait === 'trot') return 1 + (motion.runStride - 1) * 0.5;
  return 1;
}

/**
 * Search carriage is driven by the actual turn plus a small footfall wave.
 * Chest and pelvis counter-rotate across the loin, while head and tail keep
 * working independently. Non-search states are intentionally rigid here.
 */
export function writeHuntMotionPose(
  motion: BreedMotion,
  state: DogState,
  gait: DogGait,
  cycle: number,
  yawRate: number,
  out: HuntMotionPose,
): HuntMotionPose {
  const active = state === 'quartering' && (gait === 'run' || gait === 'trot');
  if (!active) {
    out.chestYaw = 0;
    out.pelvisYaw = 0;
    out.pelvisRoll = 0;
    out.headYaw = 0;
    out.tailYaw = 0;
    return out;
  }

  const turn = Math.max(-1, Math.min(1, yawRate / 2.8));
  const footfall = Math.sin(cycle * TAU);
  const bend = motion.searchLooseness * Math.max(-1, Math.min(1, turn * 0.78 + footfall * 0.3));
  out.chestYaw = bend * 0.032;
  out.pelvisYaw = -bend * 0.085;
  out.pelvisRoll = bend * 0.024;
  out.headYaw = bend * 0.11 * motion.headFreedom;
  out.tailYaw = -bend * 0.14 * motion.tailAction;
  return out;
}
