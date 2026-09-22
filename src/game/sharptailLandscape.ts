import type { Rect } from './field';
import type { Vec2 } from './types';

/** Property yards, independent of parking place, render tier and hunt seed.
 * Native stands follow the lee of long shoulders; open gaps leave room for a
 * wide dog cast and an upwind return. These are concealed habitat, not flush
 * triggers. The encounter system still chooses the occupied ground. */
export const SHARPTAIL_COVER_PATCHES: readonly Rect[] = [
  // South approach: two long edges with open walking ground between them.
  { x: 388, y: 628, w: 174, h: 52 },
  { x: 618, y: 593, w: 194, h: 60 },
  { x: 847, y: 536, w: 161, h: 54 },
  { x: 738, y: 687, w: 183, h: 58 },
  // West approach: short-grass shoulders alternate with the lower swale.
  { x: 108, y: 429, w: 142, h: 57 },
  { x: 290, y: 350, w: 188, h: 66 },
  { x: 508, y: 396, w: 161, h: 58 },
  { x: 110, y: 597, w: 188, h: 56 },
  { x: 284, y: 536, w: 161, h: 60 },
  // Upper lee: broad parallel choices, not a narrow cover-to-cover tunnel.
  { x: 550, y: 234, w: 176, h: 65 },
  { x: 746, y: 310, w: 188, h: 60 },
  { x: 916, y: 192, w: 181, h: 66 },
  { x: 1070, y: 283, w: 189, h: 62 },
  { x: 1138, y: 421, w: 169, h: 72 },
  { x: 1040, y: 586, w: 195, h: 68 },
  // Outlying stands support a full cross-country hunt beyond the main loop.
  { x: 106, y: 215, w: 196, h: 68 },
  { x: 361, y: 169, w: 174, h: 61 },
  { x: 642, y: 82, w: 181, h: 68 },
  { x: 1147, y: 95, w: 169, h: 63 },
  { x: 38, y: 711, w: 195, h: 54 },
  { x: 1118, y: 706, w: 194, h: 57 },
];

interface Shoulder { x: number; y: number; rx: number; ry: number; height: number }
/** Gentle long ridges reveal and conceal the next stand while keeping a low
 * prairie skyline. Heights are metres; widths and centers are property yards. */
export const SHARPTAIL_SHOULDERS: readonly Shoulder[] = [
  { x: 532, y: 704, rx: 238, ry: 144, height: 6.5 },
  { x: 327, y: 461, rx: 292, ry: 150, height: 8.5 },
  { x: 790, y: 470, rx: 305, ry: 127, height: 11 },
  { x: 1134, y: 484, rx: 209, ry: 191, height: 7 },
  { x: 613, y: 128, rx: 345, ry: 157, height: 8 },
  { x: 1191, y: 111, rx: 251, ry: 133, height: 5.5 },
];

interface Swale { points: readonly Vec2[]; width: number; depth: number }
export const SHARPTAIL_SWALES: readonly Swale[] = [
  { points: [{ x: -50, y: 332 }, { x: 298, y: 276 }, { x: 572, y: 337 }, { x: 852, y: 272 }, { x: 1175, y: 231 }, { x: 1480, y: 254 }], width: 65, depth: 2.6 },
  { points: [{ x: 50, y: 716 }, { x: 321, y: 618 }, { x: 565, y: 566 }, { x: 819, y: 633 }, { x: 1133, y: 648 }, { x: 1440, y: 589 }], width: 76, depth: 2.2 },
];

/** Two distant shelterbelts frame the Line Shack and north boundary. Never
 * distribute lonely trees uniformly across a landscape defined by open grass. */
export const SHARPTAIL_SHELTERBELTS = [
  { a: { x: 848, y: 126 }, b: { x: 1138, y: 173 }, trees: 24, width: 15 },
  { a: { x: 160, y: 109 }, b: { x: 476, y: 125 }, trees: 25, width: 19 },
] as const;

function segmentDistance(x: number, y: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
}

function swaleAt(x: number, y: number, swale: Swale): number {
  let distance = Infinity;
  for (let i = 1; i < swale.points.length; i++) {
    distance = Math.min(distance, segmentDistance(x, y, swale.points[i - 1], swale.points[i]));
  }
  return Math.exp(-((distance / swale.width) ** 2));
}

export function sharptailAuthoredHeight(x: number, y: number): number {
  let height = 5;
  for (const shoulder of SHARPTAIL_SHOULDERS) {
    height += shoulder.height * Math.exp(-(((x - shoulder.x) / shoulder.rx) ** 2 + ((y - shoulder.y) / shoulder.ry) ** 2));
  }
  for (const swale of SHARPTAIL_SWALES) height -= swaleAt(x, y, swale) * swale.depth;
  // Subtle long undulations, not a field of small hemispherical hills.
  return height + Math.sin(x * .009 + y * .004) * .48 + Math.sin(y * .017 - x * .003) * .24;
}

export interface SharptailGroundZones { swale: number; stand: number }
export function sharptailGroundZones(x: number, y: number, out: SharptailGroundZones): SharptailGroundZones {
  out.swale = 0;
  for (const swale of SHARPTAIL_SWALES) out.swale = Math.max(out.swale, swaleAt(x, y, swale));
  out.stand = 0;
  for (const patch of SHARPTAIL_COVER_PATCHES) {
    const dx = Math.max(patch.x - x, 0, x - patch.x - patch.w);
    const dy = Math.max(patch.y - y, 0, y - patch.y - patch.h);
    // Wide fringes blend the sim rectangle into a native grass stand.
    const fringe = Math.max(0, 1 - Math.hypot(dx, dy) / 26);
    out.stand = Math.max(out.stand, fringe * fringe * (3 - 2 * fringe));
  }
  return out;
}
