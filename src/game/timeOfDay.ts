/**
 * Time of day as fieldcraft. The renderer owns the light; what the hour
 * means to the birds lives here. At first light and through the morning,
 * birds are still near the roost, wet with dew, and sit tight for a point.
 * By midday they are loafing and feeding and flush at their ordinary nerve.
 * The evening's cost is the low sun: the 3D layer draws glare from the
 * rendered sun, so a bird flushed toward it is hard to see. Birds break
 * away from the hunter, so walking in on a point with the sun at your back
 * sends them away from it (see src/three/sunGlare.ts).
 */
export type HuntTime = 'dawn' | 'morning' | 'noon' | 'evening' | 'lastlight';

export const HUNT_TIMES: readonly HuntTime[] = ['dawn', 'morning', 'noon', 'evening', 'lastlight'];

/** Spawn nerve by hour (higher = holds longer), on top of wind and weather. */
const NERVE: Record<HuntTime, number> = { dawn: 1.2, morning: 1.1, noon: 1, evening: 1, lastlight: 1 };

export function timeNerveMult(time: HuntTime): number {
  return NERVE[time];
}

/** The launch's light, or the renderer's default for a visit without one. */
export function parseHuntTime(value: string | null | undefined, areaId: string): HuntTime {
  return HUNT_TIMES.includes(value as HuntTime) ? value as HuntTime : areaId === 'quail-fields' ? 'morning' : 'dawn';
}
