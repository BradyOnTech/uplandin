import type { Rect } from './field';
import type { Vec2 } from './types';

/**
 * Chukar Ridge's remembered places, in property yards: a spring seep that
 * greens a tongue of the bench below the split shoulder, an old
 * sheepherder's cairn on the western mesa, talus fans spilling below the
 * big rims, a wildlife guzzler on the west bench and a juniper snag on the
 * split shoulder's crest. Shared by plants, cover, the renderer and tests.
 */
export const CHUKAR_SEEP: readonly Vec2[] = [
  { x: 898, y: 498 }, { x: 906, y: 512 }, { x: 914, y: 527 }, { x: 921, y: 541 }, { x: 929, y: 556 },
];
/** Half-width of the green tongue in metres, at its head and its toe. */
export const CHUKAR_SEEP_WIDTH = { head: 2.6, toe: 7.5 } as const;
/** Chukar come to the green: a small pocket of cover on the seep's lower half. */
export const CHUKAR_SEEP_COVER: Rect = { x: 900, y: 518, w: 34, h: 38 };

export const CHUKAR_SHEEP_CAIRN = { x: 420, y: 262 } as const;
export const CHUKAR_JUNIPER_SNAG = { x: 845, y: 466 } as const;
/** The guzzler's rain apron drains downhill (toward +y) into its drinker. */
export const CHUKAR_GUZZLER = { x: 230, y: 500, angle: Math.PI / 2 } as const;

export interface ChukarTalusFan { apex: Vec2; toe: Vec2; /** Half-width at the toe, yards. */ width: number }
export const CHUKAR_TALUS_FANS: readonly ChukarTalusFan[] = [
  { apex: { x: 380, y: 298 }, toe: { x: 378, y: 322 }, width: 9 },
  { apex: { x: 445, y: 292 }, toe: { x: 447, y: 311 }, width: 8 },
  { apex: { x: 665, y: 160 }, toe: { x: 660, y: 205 }, width: 13 },
  { apex: { x: 735, y: 168 }, toe: { x: 742, y: 212 }, width: 12 },
];

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Along-fan position (0 apex, 1 toe) and across fraction (0 centre, 1 edge). */
export function chukarFanCoordinates(fan: ChukarTalusFan, x: number, y: number): { along: number; across: number } {
  const dx = fan.toe.x - fan.apex.x, dy = fan.toe.y - fan.apex.y, length = Math.hypot(dx, dy);
  const along = ((x - fan.apex.x) * dx + (y - fan.apex.y) * dy) / (length * length);
  const side = Math.abs((x - fan.apex.x) * dy - (y - fan.apex.y) * dx) / length;
  // Narrow at the chute, spreading toward the toe.
  const half = fan.width * (.25 + .75 * Math.max(0, Math.min(1, along)));
  return { along, across: side / half };
}
/** How much loose scree covers the ground here. */
export function chukarTalusFanAt(x: number, y: number): number {
  let amount = 0;
  for (const fan of CHUKAR_TALUS_FANS) {
    if (Math.abs(x - (fan.apex.x + fan.toe.x) / 2) > 40 || Math.abs(y - (fan.apex.y + fan.toe.y) / 2) > 40) continue;
    const { along, across } = chukarFanCoordinates(fan, x, y);
    if (along < -.05 || along > 1.15) continue;
    amount = Math.max(amount, (1 - smooth(.7, 1.05, across)) * (1 - smooth(.9, 1.15, along)) * smooth(-.05, .08, along));
  }
  return amount;
}

/** Wet ground and green growth along the seep, zero to one. */
export function chukarSeepAt(x: number, y: number): number {
  if (x < 880 || x > 950 || y < 485 || y > 570) return 0;
  let best = 0;
  for (let i = 1; i < CHUKAR_SEEP.length; i++) {
    const a = CHUKAR_SEEP[i - 1], b = CHUKAR_SEEP[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    const d = Math.hypot(x - a.x - dx * t, y - a.y - dy * t) * .9144;
    const along = (i - 1 + t) / (CHUKAR_SEEP.length - 1);
    const half = CHUKAR_SEEP_WIDTH.head + (CHUKAR_SEEP_WIDTH.toe - CHUKAR_SEEP_WIDTH.head) * along;
    // Ragged edges where the water spreads across the bench.
    const ragged = half * (1 + Math.sin(x * .7 + y * .4) * .18);
    best = Math.max(best, 1 - smooth(ragged * .55, ragged, d));
  }
  return best;
}

/** Solid or bare footprints, metres: plants stay out of these. */
export function chukarFeatureOccupies(x: number, y: number, radius: number): boolean {
  const near = (p: { x: number; y: number }, r: number) => Math.hypot(x - p.x, y - p.y) * .9144 < r + radius;
  return near(CHUKAR_SHEEP_CAIRN, 1.6) || near(CHUKAR_JUNIPER_SNAG, .9) || near(CHUKAR_GUZZLER, 6.2);
}
