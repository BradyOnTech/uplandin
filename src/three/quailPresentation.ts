/** The authored bobwhite body is roughly 25 cm long. Keep a single modest
 * scale in flight, on the ground and in the dog's mouth. */
export const QUAIL_WORLD_SCALE = 1.1;

/** Most of a covey rises inside 220 ms; an occasional last bird holds back.
 * Timing is authored for anticipation and surprise, not biological simulation.
 */
export function quailLaunchDelay(index: number, count: number, rng: () => number): number {
  if (index === 0) return 0;
  if (count >= 5 && index === count - 1 && rng() < .28) return 450 + rng() * 180;
  return index / Math.max(1, count - 1) * 180 + rng() * 40;
}
