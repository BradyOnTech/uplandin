/**
 * Looking closer: the hunter stops and studies the dog. At the distances a
 * dog points (30-40 yards) a whole dog is a dozen pixels on a screen, where
 * a hunter's eyes would read its head, tail and stance. Holding the look
 * narrows the view so that body language carries again. It never applies to
 * a mounted gun: the sight picture owns the view while shooting.
 */
export const LOOK_CLOSER_FOV = 30;
/** Exponential approach rates (per second) in and out of the closer look. */
const LOOK_IN_RATE = 9;
const LOOK_OUT_RATE = 12;
/** How far (m) the carried gun drops below the camera while looking closer. */
const LOOK_GUN_DROP_M = 0.40;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (k: number) => k * k * (3 - 2 * k);

/** Advance the closer look toward held (1) or released (0), frame-rate independent. */
export function stepLookCloser(current: number, held: boolean, dt: number): number {
  const target = held ? 1 : 0;
  const next = target + (current - target) * Math.exp(-(held ? LOOK_IN_RATE : LOOK_OUT_RATE) * Math.max(0, dt));
  return Math.abs(next - target) < 1e-3 ? target : next;
}

/** The view's field of view: the sight picture, narrowed by the closer look while the gun is down. */
export function lookCloserFov(sightFov: number, look: number, mount: number): number {
  const k = smooth(clamp01(look) * (1 - clamp01(mount)));
  return sightFov + (LOOK_CLOSER_FOV - sightFov) * k;
}

/** The carried gun lowers out of the narrowed view; a mounted gun stays on the shoulder. */
export function lookCloserGunDrop(look: number, mount: number): number {
  return LOOK_GUN_DROP_M * smooth(clamp01(look) * (1 - clamp01(mount)));
}
