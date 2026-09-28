import type { HuntChallenge } from './huntChallenge';

/** Covey approach tuning, in property yards. This is a game-feel policy: a
 * quiet, steady point can hold tighter, but nerve still expires. Covey
 * disposition stays fixed while the player approaches. The name remains
 * stable for the existing Quail Fields adapter, while SpeciesConfig decides
 * which other covey birds use this same approach beat.
 */
export function quailPointApproach(coveyId: number, dogPressure: number, running: boolean) {
  const disposition = (Math.imul(coveyId + 1, 1597334677) >>> 0) / 0xffffffff;
  const steadiness = Math.max(0, Math.min(1, (1.45 - dogPressure) / .85));
  return {
    flushRadius: running ? 22 : 12 + disposition * 6 - steadiness * 4,
    nerveScale: running ? 1 : .65 + disposition * .2,
  };
}

/** A world-space bobwhite point can form a full walking approach away from
 * the hunter. Distant quiet pressure builds more slowly; close approaches
 * and running retain their normal urgency. Nerve always drains and is never
 * replenished when a dog re-points or a brace joins the work. */
export function bobwhiteApproachNerveScale(distanceM: number, running: boolean, challenge: HuntChallenge): number {
  if (running || !Number.isFinite(distanceM) || distanceM <= 16) return 1;
  const distance = Math.min(1, (distanceM - 16) / 14);
  const blend = distance * distance * (3 - 2 * distance);
  const distantPressure = challenge === 'relaxed' ? .30 : challenge === 'wild' ? .75 : .35;
  return 1 + (distantPressure - 1) * blend;
}
