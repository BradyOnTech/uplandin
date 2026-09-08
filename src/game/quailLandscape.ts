import type { AreaConfig } from './areas';
import type { Vec2 } from './types';

/** Authored in shared property yards; every renderer samples the same covert. */
export const QUAIL_DRAINAGE: readonly Vec2[] = [
  { x: -80, y: 285 }, { x: 110, y: 325 }, { x: 325, y: 285 },
  { x: 515, y: 305 }, { x: 730, y: 270 }, { x: 945, y: 300 }, { x: 1290, y: 195 },
];

export interface QuailTreeStand { x: number; y: number; radius: number; count: number; height: number }
/** Shelter and shade frame cover edges; the open hunting lanes remain open. */
export const QUAIL_TREE_STANDS: readonly QuailTreeStand[] = [
  { x: 456, y: 590, radius: 17, count: 5, height: 8.5 },
  { x: 593, y: 515, radius: 26, count: 7, height: 7.8 },
  { x: 95, y: 440, radius: 22, count: 6, height: 7.6 },
  { x: 183, y: 357, radius: 24, count: 7, height: 8.4 },
  { x: 374, y: 276, radius: 28, count: 8, height: 8.8 },
  { x: 584, y: 320, radius: 23, count: 6, height: 7.5 },
  { x: 784, y: 278, radius: 25, count: 8, height: 8.5 },
  { x: 881, y: 242, radius: 23, count: 5, height: 7.4 },
  { x: 964, y: 357, radius: 31, count: 8, height: 9.1 },
  { x: 1040, y: 548, radius: 34, count: 8, height: 7.4 },
  { x: 213, y: 152, radius: 34, count: 7, height: 8.2 },
  { x: 670, y: 106, radius: 30, count: 7, height: 8.8 },
  { x: 1105, y: 116, radius: 38, count: 9, height: 8.7 },
];

export function distanceToLine(x: number, y: number, points: readonly Vec2[]): number {
  let nearest = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]; const b = points[i];
    const dx = b.x - a.x; const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    nearest = Math.min(nearest, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return nearest;
}

export function quailDrainageAt(x: number, y: number): number {
  const d = distanceToLine(x, y, QUAIL_DRAINAGE);
  return Math.exp(-Math.pow(d / 23, 2));
}

interface TrailSegment { x: number; y: number; dx: number; dy: number; lengthSquared: number }
interface TrailIndex { segments: TrailSegment[]; cells: Map<string, TrailSegment[]> }
const trailIndices = new WeakMap<AreaConfig, TrailIndex>();
const TRAIL_CELL = 64;
const TRAIL_MARGIN = 16;
function trailIndex(area: AreaConfig): TrailIndex {
  const saved = trailIndices.get(area); if (saved) return saved;
  const index: TrailIndex = { segments: [], cells: new Map() };
  for (const trail of area.trails) for (let n = 1; n < trail.points.length; n++) {
    const a = trail.points[n - 1]; const b = trail.points[n]; const dx = b.x - a.x; const dy = b.y - a.y;
    const segment = { x: a.x, y: a.y, dx, dy, lengthSquared: dx * dx + dy * dy };
    index.segments.push(segment);
    for (let y = Math.floor((Math.min(a.y, b.y) - TRAIL_MARGIN) / TRAIL_CELL); y <= Math.floor((Math.max(a.y, b.y) + TRAIL_MARGIN) / TRAIL_CELL); y++) {
      for (let x = Math.floor((Math.min(a.x, b.x) - TRAIL_MARGIN) / TRAIL_CELL); x <= Math.floor((Math.max(a.x, b.x) + TRAIL_MARGIN) / TRAIL_CELL); x++) {
        const key = `${x},${y}`; if (!index.cells.has(key)) index.cells.set(key, []); index.cells.get(key)!.push(segment);
      }
    }
  }
  trailIndices.set(area, index); return index;
}

/** Exact distance, or Infinity outside a requested local corridor. The local index keeps plant generation inexpensive. */
export function trailDistanceAt(area: AreaConfig, x: number, y: number, limit = Infinity): number {
  const index = trailIndex(area);
  const segments = limit <= TRAIL_MARGIN ? index.cells.get(`${Math.floor(x / TRAIL_CELL)},${Math.floor(y / TRAIL_CELL)}`) ?? [] : index.segments;
  let squared = Infinity;
  for (const segment of segments) {
    const t = Math.max(0, Math.min(1, ((x - segment.x) * segment.dx + (y - segment.y) * segment.dy) / (segment.lengthSquared || 1)));
    const dx = x - segment.x - segment.dx * t; const dy = y - segment.y - segment.dy * t;
    squared = Math.min(squared, dx * dx + dy * dy);
  }
  return squared <= limit * limit ? Math.sqrt(squared) : Infinity;
}

/** Rectangles remain authoritative bird habitat. The visual edge feathers outside them. */
export function quailCoverAt(area: AreaConfig, x: number, y: number): number {
  let cover = 0;
  for (const patch of area.patches) {
    const dx = Math.max(patch.x - x, 0, x - patch.x - patch.w);
    const dy = Math.max(patch.y - y, 0, y - patch.y - patch.h);
    const outside = Math.hypot(dx, dy);
    if (outside === 0) return 1;
    if (outside < 10) cover = Math.max(cover, 1 - outside / 10);
  }
  return cover;
}

/** Deterministic point seed: quality and selected drop cannot move scenery. */
export function quailSeed(x: number, y: number, salt = 0): number {
  return (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(salt + 1971, 83492791)) >>> 0;
}

/** Meter-scale drifts of living sward and exposed litter, shared by plant density and ground paint. */
export function quailSwardAt(x: number, y: number): number {
  return (Math.sin(x * 0.16 + Math.sin(y * 0.074) * 3.6)
    + Math.cos(y * 0.135 + Math.sin(x * 0.067) * 2.5)) * 0.25 + 0.5;
}
