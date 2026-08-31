/** Allocation-free sagittal-plane IK for the procedural dog rig. */

export interface TwoBoneSolution {
  /** First segment angle from vertical-down; positive reaches forward. */
  upper: number;
  /** Relative fold used by the existing dog group convention. */
  lower: number;
  /** Absolute second-segment angle from vertical-down. */
  lowerAbsolute: number;
  clamped: boolean;
}
export function createTwoBoneSolution(): TwoBoneSolution {
  return { upper: 0, lower: 0, lowerAbsolute: 0, clamped: false };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Solves a target expressed relative to the proximal joint. `targetY` is
 * normally negative because the paw is below the shoulder/hip. A positive
 * bend places the first segment forward and folds the second segment back.
 */
export function solveTwoBone(
  targetY: number,
  targetZ: number,
  upperLength: number,
  lowerLength: number,
  bend: 1 | -1,
  out: TwoBoneSolution,
): TwoBoneSolution {
  const rawDistance = Math.hypot(targetY, targetZ);
  const minDistance = Math.abs(upperLength - lowerLength) + 1e-5;
  const maxDistance = upperLength + lowerLength - 1e-5;
  const distance = clamp(rawDistance, minDistance, maxDistance);
  const theta = Math.atan2(targetZ, -targetY);
  const gamma = Math.acos(clamp(
    (upperLength * upperLength + distance * distance - lowerLength * lowerLength) /
      (2 * upperLength * distance),
    -1,
    1,
  ));
  const upper = theta + bend * gamma;
  const elbowY = -Math.cos(upper) * upperLength;
  const elbowZ = Math.sin(upper) * upperLength;
  const lowerAbsolute = Math.atan2(targetZ - elbowZ, -(targetY - elbowY));

  out.upper = upper;
  out.lowerAbsolute = lowerAbsolute;
  out.lower = upper - lowerAbsolute;
  out.clamped = Math.abs(rawDistance - distance) > 1e-6;
  return out;
}
