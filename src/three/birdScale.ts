import * as THREE from 'three';

/**
 * How flying birds are sized, chosen by `?birds=` in a field link (under
 * evaluation, October 2026). Hits are scored against the bird's centre and
 * the shot pattern either way; only the drawn size changes.
 *
 * - `readable`: today's enlargement at every range (`RISE_SCALE`).
 * - `true`: the bird's real size at every range. Honest, but a 70° view on a
 *   screen shows the world at roughly a third of the size the eye would, so
 *   a true-size rooster at 30 m is a speck of a few pixels.
 * - `life`: true size up close, where the near model is seen next to the dog
 *   and the cover, easing to the readable enlargement by shotgun range.
 */
export type BirdSizeMode = 'readable' | 'true' | 'life';

/** A field link's `birds` value; anything unknown keeps today's sizes. */
export function resolveBirdSize(value: string | null | undefined): BirdSizeMode {
  return value === 'life' || value === 'true' ? value : 'readable';
}

/** Metres from the camera over which `life` eases from true to readable size. */
export const LIFE_SIZE_NEAR_M = 5;
export const LIFE_SIZE_FAR_M = 40;

/**
 * A flying bird's model scale for a size mode. The `life` easing is gentle
 * enough that a bird flying away still shrinks on screen at every distance.
 */
export function flyingBirdScale(mode: BirdSizeMode, trueScale: number, readableScale: number, distanceM: number): number {
  if (mode === 'readable') return readableScale;
  if (mode === 'true') return trueScale;
  return THREE.MathUtils.lerp(trueScale, readableScale,
    THREE.MathUtils.smoothstep(distanceM, LIFE_SIZE_NEAR_M, LIFE_SIZE_FAR_M));
}
