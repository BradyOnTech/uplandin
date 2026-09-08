/** Stable individual temperament, in property yards. These are play tuning,
 * not population statistics. Never reroll a bird as the hunter approaches. */
export function pheasantApproach(birdId: number, distance: number, running: boolean, individualRoll?: number) {
  const roll = individualRoll ?? (Math.imul(birdId + 1, 1597334677) >>> 0) / 0xffffffff;
  const kind = roll < .4 ? 'tight' : roll < .8 ? 'ordinary' : 'wary';
  const flushRadius = kind === 'tight' ? 2.5 + roll / .4 * 3
    : kind === 'ordinary' ? 8 + (roll - .4) / .4 * 6
      : 18 + (roll - .8) / .2 * 8;
  return {
    kind,
    flushRadius,
    // A distant steady point gives the hunter time to walk up. Crowding,
    // sprinting, and the bird's finite nerve still break that hold.
    nerveScale: running ? 1 : kind === 'tight' ? distance > 12 ? .08 : .35
      : kind === 'ordinary' ? .3 : .95,
  };
}
