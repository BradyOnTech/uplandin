/** One clock for the rendered wing stroke and its launch sound. This is
 * cosmetic only: flight displacement and hit detection keep their own clocks. */
export function pheasantWingPhase(seconds: number, hz: number, phaseOffset = 0): number {
  const t = Math.max(0, seconds);
  return (t * hz + 1.1 * (1 - Math.exp(-t / .55))) * Math.PI * 2 + phaseOffset;
}

/** Times of maximum downward drive, found once when a sound is created. */
export function pheasantPowerStrokes(hz: number, phaseOffset = 0, duration = 1.45): number[] {
  const result: number[] = [];
  const start = pheasantWingPhase(0, hz, phaseOffset);
  const finish = pheasantWingPhase(duration, hz, phaseOffset);
  for (let turn = Math.ceil((start - Math.PI) / (Math.PI * 2)); ; turn++) {
    const target = Math.PI + turn * Math.PI * 2;
    if (target >= finish) break;
    let lo = 0, hi = duration;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) * .5;
      if (pheasantWingPhase(mid, hz, phaseOffset) < target) lo = mid;
      else hi = mid;
    }
    result.push((lo + hi) * .5);
  }
  return result;
}
