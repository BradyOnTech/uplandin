import { QUAIL_DRAINAGE } from './quailLandscape';
import type { Vec2 } from './types';

/**
 * Quail Fields' history and management, in property yards: the old line
 * fence the plums have swallowed (its covert is in quailComposition), the
 * dry sand creek down the draw, a horse-drawn dump rake left in the brush
 * by that fence, and this spring's prescribed burn with its disked
 * firebreak. Shared by terrain, plant placement, the renderer and tests.
 */
export const QUAIL_OLD_FENCE: readonly Vec2[] = [
  { x: 1000, y: 236 }, { x: 1004, y: 330 }, { x: 1008, y: 430 }, { x: 1012, y: 520 },
];

/** The rake's tongue rests in the plums on the fence's west side. */
export const QUAIL_RAKE = { x: 993, y: 402, angle: 1.32 } as const;

export const QUAIL_BURN = { x: 790, y: 614, rx: 72, ry: 38, angle: -.12 } as const;

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const burnCos = Math.cos(QUAIL_BURN.angle), burnSin = Math.sin(QUAIL_BURN.angle);
/** Polar radius of the burn's ragged edge, as a fraction of the ellipse. */
function burnEdge(theta: number): number {
  return 1 + Math.sin(theta * 3 + .7) * .1 + Math.sin(theta * 7 + 2.1) * .06 + Math.sin(theta * 13) * .03;
}
/** Zero outside, one in the black. Fire creeps unevenly at the edge. */
export function quailBurnAt(x: number, y: number): number {
  const dx = x - QUAIL_BURN.x, dy = y - QUAIL_BURN.y;
  if (Math.abs(dx) > QUAIL_BURN.rx * 1.3 || Math.abs(dy) > QUAIL_BURN.rx * 1.3) return 0;
  const u = (dx * burnCos + dy * burnSin) / QUAIL_BURN.rx, v = (-dx * burnSin + dy * burnCos) / QUAIL_BURN.ry;
  const r = Math.hypot(u, v) / burnEdge(Math.atan2(v, u));
  return 1 - smooth(.9, 1.04, r);
}

/** The disked firebreak around the burn's north side, toward the trail. */
export const QUAIL_FIREBREAK: readonly Vec2[] = (() => {
  const out: Vec2[] = [];
  for (let i = 0; i <= 24; i++) {
    const theta = -Math.PI * .92 + i / 24 * Math.PI * .84;
    const r = burnEdge(theta) * 1.1;
    const u = Math.cos(theta) * r * QUAIL_BURN.rx, v = Math.sin(theta) * r * QUAIL_BURN.ry;
    out.push({ x: QUAIL_BURN.x + u * burnCos - v * burnSin, y: QUAIL_BURN.y + u * burnSin + v * burnCos });
  }
  return out;
})();

/** The dry creek meanders along the draw's floor between the west shoulder
 * and the windmill track. */
export const QUAIL_CREEK: readonly Vec2[] = (() => {
  const out: Vec2[] = [];
  let travelled = 0;
  for (let i = 1; i < QUAIL_DRAINAGE.length; i++) {
    const a = QUAIL_DRAINAGE[i - 1], b = QUAIL_DRAINAGE[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
    for (let d = 0; d < length; d += 4) {
      const x = a.x + (b.x - a.x) * d / length;
      if (x >= 205 && x <= 688) {
        const s = travelled + d, wander = Math.sin(s * .045) * 6 + Math.sin(s * .13 + 1) * 2.2;
        out.push({ x: x + nx * wander, y: a.y + (b.y - a.y) * d / length + ny * wander });
      }
    }
    travelled += length;
  }
  return out;
})();
/** Bed half-width and depth, metres. */
export const QUAIL_CREEK_BED = { halfWidth: 1.6, bank: 1.1, depth: .45 } as const;

const CELL = 24;
const creekCells = new Map<string, number[]>();
for (let i = 1; i < QUAIL_CREEK.length; i++) {
  const a = QUAIL_CREEK[i - 1], b = QUAIL_CREEK[i], margin = 6;
  for (let cy = Math.floor((Math.min(a.y, b.y) - margin) / CELL); cy <= Math.floor((Math.max(a.y, b.y) + margin) / CELL); cy++)
    for (let cx = Math.floor((Math.min(a.x, b.x) - margin) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + margin) / CELL); cx++) {
      const key = `${cx},${cy}`, list = creekCells.get(key) ?? []; list.push(i); creekCells.set(key, list);
    }
}
/** Distance from the creek's centre line in metres, or Infinity well away. */
export function quailCreekDistance(x: number, y: number): number {
  let best = Infinity;
  for (const i of creekCells.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
    const a = QUAIL_CREEK[i - 1], b = QUAIL_CREEK[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return best * .9144;
}
/** One across the sand bed, falling to zero over the cut bank. */
export function quailCreekAt(x: number, y: number): number {
  const d = quailCreekDistance(x, y);
  if (d === Infinity) return 0;
  return 1 - smooth(QUAIL_CREEK_BED.halfWidth, QUAIL_CREEK_BED.halfWidth + QUAIL_CREEK_BED.bank, d);
}

function segmentDistance(x: number, y: number, points: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return best;
}

/** How bare the ground is here for grass and brush (one: nothing grows). */
export function quailFeatureBare(x: number, y: number): number {
  let bare = quailBurnAt(x, y) * .92;
  if (bare < 1 && x > 600 && x < 980 && y > 520 && y < 700 && segmentDistance(x, y, QUAIL_FIREBREAK) * .9144 < 2.4) bare = 1;
  bare = Math.max(bare, quailCreekAt(x, y));
  if (Math.abs(x - QUAIL_RAKE.x) < 6 && Math.abs(y - QUAIL_RAKE.y) < 6 && Math.hypot(x - QUAIL_RAKE.x, y - QUAIL_RAKE.y) * .9144 < 2.2) bare = Math.max(bare, .4);
  return bare;
}
