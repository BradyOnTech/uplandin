/** Ordinary shot opportunities end at range/time. An active raptor chase
 * owns its own time limit; distance from the hunter must not delete quarry
 * out from under a pursuing hawk. Landing in cover still ends the flight. */
export function birdFlightExpired(
  distanceSquared: number,
  airMs: number,
  hasCoverDestination: boolean,
  activelyPursued: boolean,
): boolean {
  if (activelyPursued) return false;
  return (!hasCoverDestination && distanceSquared > 80 * 80) || airMs > 15000;
}
