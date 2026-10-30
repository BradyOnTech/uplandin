/**
 * Knowing the bird at 30–55 m on a phone (birds lane, milestone 4).
 *
 * Two presentation rules. Neither touches flight, sound or the shot: hits are
 * scored against the bird's centre and the pattern, whatever its drawn size,
 * and the whirr of the wings is still synthesised at each species' real rate.
 *
 * - **Wingbeats a screen can show.** A bobwhite beats about 18 times a
 *   second. At 30 frames a second that is fewer than two frames a beat, and
 *   the wings strobe: they flicker, freeze or seem to run backwards. Shown
 *   wingbeats keep each species' order, rooster slowest and bobwhite fastest,
 *   and its own phrasing of beats and glides, but never faster than
 *   MAX_SHOWN_WING_HZ: four frames a beat at 30 fps.
 * - **No live bird within range is a dot.** The `life` size mode eases a bird
 *   from true size at the gun to the readable enlargement by 40 m and then
 *   lets it shrink with distance. On a 390-pixel phone that leaves a bobwhite
 *   7 px across at 40 m and 5 px at 55 m: an anonymous dot. Every flying bird
 *   is therefore drawn large enough that the smallest core bird, a bobwhite
 *   at the same range, would span ID_SPAN_PX on this screen. It is one factor
 *   for all species, so a rooster stays bigger than a quail. The floor ramps
 *   in from 15 m, holds to 45 m, eases off past it so a bird flying away still
 *   shrinks, and is gone by 120 m, well past the shot. A desktop screen
 *   already shows birds that big, and rarely needs it.
 */

/** Shown wingbeats never run faster than this (Hz): four frames a beat at 30 fps. */
export const MAX_SHOWN_WING_HZ = 7.5;
/** Nor slower than this. */
const MIN_SHOWN_WING_HZ = 4;

/** The wingbeat a screen shows for a species' real flap rate (Hz). */
export function shownWingHz(flapRate: number): number {
  const real = Number.isFinite(flapRate) && flapRate > 0 ? flapRate : 14;
  return Math.min(MAX_SHOWN_WING_HZ, Math.max(MIN_SHOWN_WING_HZ, 3.2 + .24 * real));
}

/** The smallest core bird's span on screen, at least, within range (CSS px). */
export const ID_SPAN_PX = 12;
/** A bird seen on the ground before the flush (a rooster on a two-track,
 * chukar running above, sharptails on a crest) is drawn at least this big,
 * measured the same way on a bobwhite folded on the ground, out to the 170 m
 * a sighting is seen at, so a sighting is never a speck. */
export const SIGHT_FLOOR_PX = 8;
/** The floor ramps in between these ranges (m)... */
const FLOOR_FROM_M = 15, FLOOR_FULL_M = 28;
/** ...holds to this one, and eases off past it, as (hold / d) ^ FLOOR_FALL... */
const FLOOR_HOLD_M = 45, FLOOR_FALL = .6;
/** ...and is gone past the shot, between these (m): a leaving bird shrinks away. */
const FLOOR_FADE_FROM_M = 70, FLOOR_FADE_TO_M = 120;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** The least span (CSS px) the smallest core bird is drawn at, this far off. */
export function identityFloorPx(distanceM: number): number {
  if (!(distanceM > FLOOR_FROM_M)) return 0;
  const hold = distanceM > FLOOR_HOLD_M ? (FLOOR_HOLD_M / distanceM) ** FLOOR_FALL : 1;
  return ID_SPAN_PX * smoothstep(FLOOR_FROM_M, FLOOR_FULL_M, distanceM) * hold * (1 - smoothstep(FLOOR_FADE_FROM_M, FLOOR_FADE_TO_M, distanceM));
}

/**
 * How much larger than its size mode draws it a flying bird is drawn, so the
 * smallest core bird would reach the floor: `referenceSpanM` is that bird's
 * span (m) at the same range and size mode, on a screen `viewHeightPx` CSS
 * px tall with a vertical field of view of `fovDeg`. 1 when it already does.
 */
export function identityBoost(distanceM: number, referenceSpanM: number, viewHeightPx: number, fovDeg: number): number {
  const floor = identityFloorPx(distanceM);
  if (floor <= 0 || !(referenceSpanM > 0) || !(viewHeightPx > 0)) return 1;
  const shown = referenceSpanM * viewHeightPx / (2 * Math.tan(fovDeg * Math.PI / 360) * distanceM);
  return Math.max(1, floor / shown);
}
