import type { Rect } from './field';
import type { Vec2 } from './types';

export interface QuailCovert {
  id: string;
  points: readonly Vec2[];
  /** Width of the feeding/nesting apron; woody refuge occupies only its core. */
  shoulder: number;
  plumWidth: number;
}

/** The route alternates a brushy edge with an open crossing. These are shared
 * hunting cover, not bird placements: a hunter can work either side and a dog
 * can cast across the apron without being funnelled through a hedge tunnel. */
export const QUAIL_COVERTS: readonly QuailCovert[] = [
  { id: 'south-plum-edge', shoulder: 23, plumWidth: 6.5, points: [
    { x: 479, y: 602 }, { x: 481, y: 581 }, { x: 547, y: 575 }, { x: 578, y: 558 },
  ] },
  { id: 'south-shoulder', shoulder: 24, plumWidth: 8, points: [
    { x: 580, y: 532 }, { x: 593, y: 491 }, { x: 588, y: 449 }, { x: 611, y: 410 }, { x: 635, y: 347 },
  ] },
  { id: 'west-plum-edge', shoulder: 24, plumWidth: 7, points: [
    { x: 111, y: 407 }, { x: 172, y: 430 }, { x: 238, y: 402 }, { x: 292, y: 359 },
  ] },
  { id: 'drainage-shoulder', shoulder: 26, plumWidth: 8.5, points: [
    { x: 303, y: 311 }, { x: 386, y: 329 }, { x: 470, y: 340 }, { x: 553, y: 330 }, { x: 632, y: 307 },
  ] },
  { id: 'windmill-plum', shoulder: 24, plumWidth: 7, points: [
    { x: 672, y: 309 }, { x: 735, y: 275 }, { x: 789, y: 257 }, { x: 852, y: 265 },
  ] },
  { id: 'east-return-edge', shoulder: 25, plumWidth: 8, points: [
    { x: 912, y: 318 }, { x: 939, y: 376 }, { x: 918, y: 424 }, { x: 903, y: 478 },
    { x: 848, y: 512 }, { x: 797, y: 536 }, { x: 727, y: 519 },
  ] },
  { id: 'north-field-plum', shoulder: 27, plumWidth: 8, points: [
    { x: 260, y: 179 }, { x: 354, y: 172 }, { x: 434, y: 190 }, { x: 541, y: 162 },
  ] },
];

/** The two established first coverts remain last for existing entry dressing. */
export function quailCoverPatches(): Rect[] {
  return [
    ...QUAIL_COVERTS.flatMap(covert => covert.points.slice(1).map((b, i) => {
      const a = covert.points[i], r = covert.shoulder;
      return { x: Math.min(a.x, b.x) - r, y: Math.min(a.y, b.y) - r,
        w: Math.abs(a.x - b.x) + r * 2, h: Math.abs(a.y - b.y) + r * 2 };
    })),
    { x: 469, y: 572, w: 70, h: 52 },
    { x: 76, y: 371, w: 58, h: 70 },
  ];
}

interface CovertSegment { a: Vec2; dx: number; dy: number; length2: number; width: number }
const CELL = 64;
const segments = new Map<string, CovertSegment[]>();
for (const covert of QUAIL_COVERTS) for (let i = 1; i < covert.points.length; i++) {
  const a = covert.points[i - 1], b = covert.points[i], dx = b.x - a.x, dy = b.y - a.y;
  const segment = { a, dx, dy, length2: dx * dx + dy * dy, width: covert.plumWidth };
  const margin = covert.plumWidth * 1.35;
  for (let y = Math.floor((Math.min(a.y, b.y) - margin) / CELL); y <= Math.floor((Math.max(a.y, b.y) + margin) / CELL); y++)
    for (let x = Math.floor((Math.min(a.x, b.x) - margin) / CELL); x <= Math.floor((Math.max(a.x, b.x) + margin) / CELL); x++) {
      const key = `${x},${y}`, cell = segments.get(key) ?? []; cell.push(segment); segments.set(key, cell);
    }
}

/** Irregular plum roots grow in connected runs with small breaks, not an even
 * row of equally spaced bushes. Sampled identically by all graphics tiers. */
export function quailPlumAt(x: number, y: number): number {
  let strength = 0;
  for (const segment of segments.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
    const t = Math.max(0, Math.min(1, ((x - segment.a.x) * segment.dx + (y - segment.a.y) * segment.dy) / segment.length2));
    const distance = Math.hypot(x - segment.a.x - segment.dx * t, y - segment.a.y - segment.dy * t);
    const width = segment.width * (1 + Math.sin(x * .18 + y * .13) * .16 + Math.cos(y * .23 - x * .09) * .09);
    const u = Math.max(0, Math.min(1, 1 - distance / width));
    strength = Math.max(strength, u * u * (3 - 2 * u));
  }
  return strength;
}

/** Wider bare/short grass seams provide alternate approaches around each run.
 * These clearings thin plants only; birds still use the authoritative cover. */
export const QUAIL_CASTING_OPENINGS = [
  { x: 530, y: 520, rx: 27, ry: 22 },
  { x: 557, y: 451, rx: 23, ry: 28 },
  { x: 322, y: 373, rx: 30, ry: 15 },
  { x: 661, y: 328, rx: 18, ry: 23 },
  { x: 840, y: 230, rx: 20, ry: 15 },
  { x: 894, y: 534, rx: 27, ry: 21 },
  { x: 695, y: 519, rx: 25, ry: 21 },
] as const;

export function quailOpeningAt(x: number, y: number): number {
  let strength = 0;
  for (const opening of QUAIL_CASTING_OPENINGS) {
    if (Math.abs(x - opening.x) > opening.rx || Math.abs(y - opening.y) > opening.ry) continue;
    const r = Math.hypot((x - opening.x) / opening.rx, (y - opening.y) / opening.ry);
    const t = Math.max(0, Math.min(1, (1 - r) / .55));
    strength = Math.max(strength, t * t * (3 - 2 * t));
  }
  return strength;
}
