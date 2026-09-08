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
