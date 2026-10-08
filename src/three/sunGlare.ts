/**
 * Low-sun glare, in plain math so it is testable without a renderer. Glare
 * follows the sun the player actually sees (the palette's elevation and
 * azimuth, the same numbers SkySystem draws), not a compass rule: looking
 * toward a sun low on the horizon washes out the sky around it, so a bird
 * flushed that way is hard to pick up. A high sun never glares.
 */
export interface Dir3 { x: number; y: number; z: number }

/** Full glare at or below this sun elevation (degrees). */
export const GLARE_LOW_DEG = 4;
/** No glare at or above this elevation: morning and midday are clear. */
export const GLARE_HIGH_DEG = 20;
/** Within this angle of the sun the view is fully washed. */
export const GLARE_CORE_DEG = 6;
/** Past this angle from the sun the view is clear. */
export const GLARE_OUTER_DEG = 40;
/** A miss taken at or above this glare counts as a miss into the sun. */
export const GLARE_MISS_THRESHOLD = 0.35;

const DEG = Math.PI / 180;

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** World direction toward the sun; matches SkySystem's dome uniform. */
export function sunDirection(elevationDeg: number, azimuthDeg: number): Dir3 {
  const el = elevationDeg * DEG, az = azimuthDeg * DEG;
  return { x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: Math.cos(az) * Math.cos(el) };
}

/** How much a low sun washes out the sky around it, 0 (none) to 1. */
export function sunLowness(elevationDeg: number): number {
  if (elevationDeg < -1) return 0;
  return smooth(GLARE_HIGH_DEG, GLARE_LOW_DEG, elevationDeg);
}

/** 0–1 glare for a unit view direction against the sun. */
export function glareStrength(view: Dir3, sun: Dir3, elevationDeg: number): number {
  const low = sunLowness(elevationDeg);
  if (low <= 0) return 0;
  const sunLength = Math.hypot(sun.x, sun.y, sun.z) || 1;
  const cos = (view.x * sun.x + view.y * sun.y + view.z * sun.z) / sunLength;
  const angle = Math.acos(Math.min(1, Math.max(-1, cos))) / DEG;
  return low * smooth(GLARE_OUTER_DEG, GLARE_CORE_DEG, angle);
}
