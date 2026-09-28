import { HUNT_CHALLENGES, type HuntChallenge } from './huntChallenge';
import { PROPERTY_PX_TO_M } from './worldUnits';

/** These wary covey birds keep their own runner, wind and slope behavior. */
export function usesOpenCountryWalkIn(speciesId: string): boolean {
  return speciesId === 'sharptail' || speciesId === 'chukar';
}

/** A quietly approached prairie point can hold inside the wild-rise radius.
 * Ridge birds retain their smaller existing walk-in radius. Property units
 * are yards; challenge applies here just as it does for quail and pheasant. */
export function openCountryPointRadius(speciesId: string, radius: number, challenge: HuntChallenge, running: boolean): number {
  const quietScale = speciesId === 'sharptail' && !running ? .8 : 1;
  return radius * quietScale * HUNT_CHALLENGES[challenge].approach;
}

/** Give one finite world-scale walk-in, not a fresh nerve roll. The ordinary
 * field walk is 2.2 m/s. Balanced preserves a modest urgency; Wild grants
 * much less time. Even a handler who stays distant exhausts this allowance. */
export function pointWalkInAllowanceMs(distanceM: number, quietRadius: number, challenge: HuntChallenge): number {
  if (!Number.isFinite(distanceM)) return 0;
  const gapM = Math.max(0, distanceM - quietRadius * PROPERTY_PX_TO_M);
  const share = challenge === 'relaxed' ? 1 : challenge === 'wild' ? .25 : .9;
  return Math.min(18000, gapM / 2.2 * 1000 * share);
}
