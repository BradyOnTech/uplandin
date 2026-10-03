import type { HuntChallenge } from './huntChallenge';

/** Covey approach tuning, in property yards. This is a game-feel policy: a
 * quiet, steady point can hold tighter, but nerve still expires. Covey
 * disposition stays fixed while the player approaches. The name remains
 * stable for the existing Quail Fields adapter, while SpeciesConfig decides
 * which other covey birds use this same approach beat.
 */
export function quailPointApproach(coveyId: number, dogPressure: number, running: boolean, challenge: HuntChallenge = 'balanced') {
  const disposition = (Math.imul(coveyId + 1, 1597334677) >>> 0) / 0xffffffff;
  const steadiness = Math.max(0, Math.min(1, (1.45 - dogPressure) / .85));
  return {
    // A quiet walk-in reaches the covey: most go up within a few strides of
    // the hunter, past the dog (October 2026; it was 8-18 yards).
    flushRadius: running ? 22 : 6 + disposition * 5 - steadiness * 2.5,
    // ...so it holds a little longer for the extra strides (was .65-.85),
    // except on Wild, whose coveys keep the old urgency.
    nerveScale: running ? 1 : (challenge === 'wild' ? .65 : .45) + disposition * .2,
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
