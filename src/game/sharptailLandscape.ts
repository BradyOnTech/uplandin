import type { Rect } from './field';
import type { Vec2 } from './types';
import { sharptailDetailHeight } from './sharptailFeatures';

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

interface Shoulder {
  x: number; y: number; rx: number; ry: number; yaw: number; height: number;
  /** Bend moves the crest across its long axis; face biases its two slopes.
   * Rise lifts one end, keeping adjacent shoulders from sharing a skyline. */
  bend: number; face: number; rise: number;
}
/** Three connected landform sequences: the south arrival brow, west wind
 * shoulder, and taller eastern return. Smaller attached spurs split the
 * eastern face; the northern brows overlap behind the Line Shack. Heights
 * are metres; centers and radii are property yards. Broad sections remain
 * resolved by the existing distant terrain grid, including on Lite. */
export const SHARPTAIL_SHOULDERS: readonly Shoulder[] = [
  { x: 700, y: 575, rx: 295, ry: 124, yaw: -.28, height: 20, bend: .35, face: .22, rise: .13 },
  { x: 330, y: 420, rx: 320, ry: 125, yaw: -.20, height: 22, bend: -.33, face: -.18, rise: .30 },
  { x: 1170, y: 510, rx: 288, ry: 150, yaw: .66, height: 29, bend: .42, face: -.28, rise: .16 },
  { x: 1010, y: 215, rx: 300, ry: 112, yaw: .06, height: 17, bend: -.18, face: .38, rise: -.30 },
  { x: 390, y: 140, rx: 330, ry: 115, yaw: .08, height: 16, bend: .26, face: .12, rise: -.15 },
  { x: 750, y: 345, rx: 200, ry: 88, yaw: -.42, height: 4.8, bend: -.15, face: -.10, rise: .22 },
  { x: 1040, y: 402, rx: 178, ry: 83, yaw: -.22, height: 8, bend: -.30, face: .20, rise: .24 },
  { x: 1075, y: 604, rx: 193, ry: 92, yaw: -.30, height: 7, bend: .32, face: -.12, rise: .15 },
];
const SADDLES = [
  { x: 919, y: 511, rx: 109, ry: 86, yaw: .15, height: 4.8 },
  { x: 529, y: 427, rx: 111, ry: 89, yaw: -.25, height: 3.3 },
  { x: 1190, y: 398, rx: 102, ry: 59, yaw: .52, height: 3.4 },
];
// Shared by ground paint and grass so low crowns follow the physical brows.
export function sharptailCrestOffset(u: number, bend: number): number {
  return bend * (u * u - .25) / (1 + .5 * u * u);
}
// Height sampling also runs for dogs and moving grass tiles; cache the
// constant rotations rather than evaluating trigonometry per sample.
const shoulderFrames = SHARPTAIL_SHOULDERS.map(shape => ({ ...shape, cos: Math.cos(shape.yaw), sin: Math.sin(shape.yaw) }));
const saddleFrames = SADDLES.map(shape => ({ ...shape, cos: Math.cos(shape.yaw), sin: Math.sin(shape.yaw) }));

// The working property is one part of a larger rolling prairie. Continue its
// long glacial shoulders beyond the boundary instead of letting every authored
// hill decay into a flat, sea-like horizon. Broad overlapping forms remain
// resolved by the existing horizon mesh; no new geometry or detail layer.
const horizonFrames = [
  { x: 1750, y: -100, rx: 710, ry: 205, yaw: .36, height: 43, bend: -.32, face: .22, rise: .28 },
  { x: 1580, y: 495, rx: 520, ry: 190, yaw: 1.06, height: 28, bend: .30, face: -.22, rise: -.26 },
  { x: 820, y: -290, rx: 880, ry: 240, yaw: -.12, height: 36, bend: .24, face: .28, rise: -.20 },
  { x: -480, y: 120, rx: 690, ry: 245, yaw: .93, height: 24, bend: -.27, face: -.18, rise: .22 },
  { x: 580, y: 1350, rx: 820, ry: 240, yaw: .15, height: 16, bend: .31, face: .20, rise: .25 },
].map(shape => ({ ...shape, cos: Math.cos(shape.yaw), sin: Math.sin(shape.yaw) }));

/** Exterior scenery only. A flat 24-yard collar and a zero-slope transition
 * preserve every huntable height/normal, route, root and drop-point transform.
 * Bounds match this authored property's 1400 by 800 yard layout. */
function horizonHeight(x: number, y: number): number {
  if (x >= 0 && x <= 1400 && y >= 0 && y <= 800) return 0;
  const outside = Math.hypot(Math.max(-x, 0, x - 1400), Math.max(-y, 0, y - 800));
  if (outside <= 24) return 0;
  const t = Math.min(1, (outside - 24) / 150);
  let height = 0;
  for (const ridge of horizonFrames) height += ridgeAt(x, y, ridge);
  return height * t * t * (3 - 2 * t);
}
/** Attached toes divide the long existing shoulders into overlapping faces.
 * These are broad glacial rolls, not independent hill objects. Their finite
 * support joins with zero slope, keeping the walking surface continuous. */
export const SHARPTAIL_RELIEF_TOES = [
  { x: 762, y: 598, rx: 116, ry: 48, yaw: -.50, height: 3.6, bend: .30 },
  { x: 925, y: 481, rx: 106, ry: 48, yaw: -.59, height: 3.5, bend: -.32 },
  { x: 428, y: 471, rx: 120, ry: 49, yaw: -.39, height: 3.8, bend: .24 },
  { x: 590, y: 381, rx: 94, ry: 44, yaw: .08, height: 3.2, bend: -.25 },
  { x: 951, y: 211, rx: 112, ry: 52, yaw: -.23, height: 4.3, bend: .32 },
  { x: 1100, y: 276, rx: 122, ry: 52, yaw: .34, height: 5.0, bend: -.28 },
  { x: 1064, y: 450, rx: 111, ry: 64, yaw: -.56, height: 2.4, bend: .30 },
] as const;
const toeFrames = SHARPTAIL_RELIEF_TOES.map(shape => ({ ...shape, cos: Math.cos(shape.yaw), sin: Math.sin(shape.yaw) }));
function toeCoordinates(x: number, y: number, toe: typeof toeFrames[number], out: { u: number; v: number }): void {
  const dx = x - toe.x, dy = y - toe.y;
  out.u = (dx * toe.cos + dy * toe.sin) / toe.rx;
  out.v = (-dx * toe.sin + dy * toe.cos) / toe.ry - toe.bend * (1 - out.u * out.u);
}
const toePosition = { u: 0, v: 0 };
function toeHeight(x: number, y: number): number {
  let height = 0;
  for (const toe of toeFrames) {
    if (Math.abs(x - toe.x) > toe.rx + toe.ry || Math.abs(y - toe.y) > toe.rx + toe.ry) continue;
    toeCoordinates(x, y, toe, toePosition);
    const { u, v } = toePosition;
    if (Math.abs(u) >= 1 || Math.abs(v) >= 1) continue;
    const along = 1 - u ** 4, across = 1 - v * v;
    height += toe.height * along * along * across * across * (1 + u * .22);
  }
  return height;
}

/** One visual stand field attaches dry brows and dark lee growth to those
 * same physical toes. It is sampled by terrain, middle canopy and near grass,
 * never used to relocate habitat or birds. */
export function sharptailToeGrowth(x: number, y: number, out: { low: number; lee: number; face: number }): void {
  out.low = 0; out.lee = 0; out.face = 0;
  for (const toe of toeFrames) {
    if (Math.abs(x - toe.x) > toe.rx + toe.ry * 2 || Math.abs(y - toe.y) > toe.rx + toe.ry * 2) continue;
    toeCoordinates(x, y, toe, toePosition);
    const { u, v } = toePosition;
    const along = Math.max(0, 1 - u ** 4); const reach = along * along;
    out.low = Math.max(out.low, reach * Math.max(0, 1 - v * v * 1.5) ** 2);
    const lee = Math.max(0, 1 - ((v - .85) / .92) ** 2);
    out.lee = Math.max(out.lee, reach * lee * lee);
    const face = Math.max(0, 1 - ((v + .65) / .62) ** 2);
    out.face = Math.max(out.face, reach * face * face);
  }
}
function ridgeAt(x: number, y: number, ridge: typeof shoulderFrames[number]): number {
  const dx = x - ridge.x, dy = y - ridge.y;
  const u = (dx * ridge.cos + dy * ridge.sin) / ridge.rx;
  const v = (-dx * ridge.sin + dy * ridge.cos) / ridge.ry - sharptailCrestOffset(u, ridge.bend);
  // Unequal windward/lee faces join with a continuous derivative at the
  // crest. A long shoulder tapers at either end rather than forming a dome.
  const face = v * (1 + ridge.face * v / Math.sqrt(v * v + .36));
  const endRise = 1 + ridge.rise * u / Math.sqrt(1 + u * u);
  return ridge.height * endRise * Math.exp(-(.55 * u ** 4 + .32 * u * u + face * face));
}
function saddleAt(x: number, y: number, saddle: typeof saddleFrames[number]): number {
  const dx = x - saddle.x, dy = y - saddle.y;
  const u = (dx * saddle.cos + dy * saddle.sin) / saddle.rx;
  const v = (-dx * saddle.sin + dy * saddle.cos) / saddle.ry;
  return saddle.height * Math.exp(-(u * u + v * v));
}

interface Swale {
  points: readonly Vec2[]; width: number; depth: number;
  /** Deepen an existing connected drainage locally without changing its
   * footprint or semantic moisture/cover masks. */
  basinX: number; basinRadius: number; basinDepth: number;
}
export const SHARPTAIL_SWALES: readonly Swale[] = [
  { points: [{ x: -50, y: 255 }, { x: 270, y: 260 }, { x: 490, y: 307 }, { x: 712, y: 242 }, { x: 931, y: 304 }, { x: 1135, y: 334 }, { x: 1480, y: 267 }], width: 63, depth: 4.2, basinX: 1020, basinRadius: 110, basinDepth: 7 },
  { points: [{ x: -50, y: 642 }, { x: 240, y: 598 }, { x: 470, y: 506 }, { x: 664, y: 463 }, { x: 885, y: 417 }, { x: 1145, y: 362 }, { x: 1480, y: 392 }], width: 64, depth: 5.4, basinX: 810, basinRadius: 220, basinDepth: 4.5 },
];

/** Northern shelterbelts and a broken windbreak behind the Line Shack.
 * Reuse the property's 49 trees as unequal groups, retaining broad open
 * casts and a clear view of the building between the two nearer groups. */
export const SHARPTAIL_SHELTERBELTS = [
  { a: { x: 850, y: 127 }, b: { x: 910, y: 141 }, trees: 8, width: 25 },
  // Two existing eastern groups shelter the hollow's rear shoulder. Their
  // gap frames the Shack roof; both walking approaches remain south of them.
  { a: { x: 995, y: 260 }, b: { x: 1014, y: 263 }, trees: 9, width: 11 },
  { a: { x: 1055, y: 277 }, b: { x: 1070, y: 284 }, trees: 7, width: 15 },
  { a: { x: 160, y: 109 }, b: { x: 219, y: 114 }, trees: 10, width: 29 },
  { a: { x: 294, y: 112 }, b: { x: 343, y: 124 }, trees: 8, width: 24 },
  { a: { x: 427, y: 123 }, b: { x: 476, y: 125 }, trees: 7, width: 28 },
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
  let height = 6.5 + toeHeight(x, y) + sharptailDetailHeight(x, y);
  for (const ridge of shoulderFrames) height += ridgeAt(x, y, ridge);
  for (const saddle of saddleFrames) height -= saddleAt(x, y, saddle);
  for (const swale of SHARPTAIL_SWALES) {
    const along = (x - swale.basinX) / swale.basinRadius;
    height -= swaleAt(x, y, swale) * (swale.depth + swale.basinDepth * Math.exp(-along * along));
  }
  // Subtle long undulations, not a field of small hemispherical hills.
  return height + Math.sin(x * .009 + y * .004) * .48 + Math.sin(y * .017 - x * .003) * .24 + horizonHeight(x, y);
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
