import { SHARPTAIL_SHOULDERS } from '../../game/sharptailLandscape';

export interface SharptailMeadowSample { crown: number; hollow: number; cured: number }

/** The prairie reads in long vegetation masses, following the actual relief.
 * Exposed shoulder crowns carry low silvered grass; sheltered swales carry
 * taller sage-green growth. A broad cured edge joins the two, rather than
 * arbitrary patches of differently coloured grass. All coordinates are
 * property yards, independent of entry, detail tier and hunting seed. */
const shoulders = SHARPTAIL_SHOULDERS.map(shoulder => ({ ...shoulder,
  cos: Math.cos(shoulder.yaw), sin: Math.sin(shoulder.yaw),
}));

export const SHARPTAIL_MEADOW_COLORS = {
  crown: 0xc0b48a,
  hollow: 0x788b69,
  cured: 0xa89468,
} as const;

export function sharptailMeadowAt(x: number, y: number, swale: number, out: SharptailMeadowSample): SharptailMeadowSample {
  let crown = 0, cured = 0;
  for (const shoulder of shoulders) {
    const dx = x - shoulder.x, dy = y - shoulder.y;
    const u = (dx * shoulder.cos + dy * shoulder.sin) / shoulder.rx;
    const v = (-dx * shoulder.sin + dy * shoulder.cos) / shoulder.ry;
    // Broad unequal edges preserve a natural slope rather than a band of
    // crop rows. Both terrain paint and vegetation sample the same curves.
    const bend = Math.sin(u * 3.1 + shoulder.y * .015) * .11;
    crown = Math.max(crown, Math.exp(-(u * u * 1.8 + (v - bend) ** 2 * 5.5)));
    cured = Math.max(cured, Math.exp(-(u * u * 2.1 + (v + .62 - bend) ** 2 * 8)));
  }
  out.hollow = swale * swale;
  out.crown = crown * (1 - out.hollow * .85);
  out.cured = cured * (1 - out.hollow * .58) * (1 - out.crown * .55);
  return out;
}
