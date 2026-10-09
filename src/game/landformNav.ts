/**
 * Getting round the rimrock. A dog steering straight at a fall or a bird on
 * the far side of a long rim slides along it and never arrives; this finds
 * the way through the nearest break instead. A coarse grid marks the rock
 * (grown by the dog's body), a windowed A* finds a route, and the dog is
 * given the farthest point along it it can see in a straight line. Routes
 * are cached per target and only replanned when the target moves or the
 * dog strays. Pure and deterministic; grounds without solid rock never
 * build one.
 */
import type { Vec2 } from './types';

/** Grid cell, property yards. */
const CELL = 2;
/** Clearance kept from a rock disc, yards: the dog's body and a little. */
const CLEARANCE = .9;
/** Search window margin around the dog and its target, yards. */
const WINDOW = 140;
/** Replan when the target has moved, or the dog strayed from the route, this far. */
const TARGET_SLIP = 3;
const STRAY = 8;
/** Yards at each end of a line, and around the dog and its target, that
 * never count as blocked: the clearance is generous, the rock is not. */
const END_GRACE = 2.5;
/** Look along the route no farther than this for the next visible point. */
const LOOKAHEAD = 30;

type Blockers = readonly { x: number; y: number; radius: number }[];
const key = (i: number, j: number) => (j + 4096) * 8192 + (i + 4096);
/** A dog's body against the rock itself, yards: never passable. */
const BODY = .35;
interface RockGrid { soft: Set<number>; hard: Set<number> }
/** One rock grid per blocker list, shared by every dog's navigator: the
 * soft margin routes keep to, and the hard rock no route ever crosses. */
const grids = new WeakMap<Blockers, RockGrid>();
function gridFor(blockers: Blockers): RockGrid {
  let grid = grids.get(blockers);
  if (grid) return grid;
  grid = { soft: new Set(), hard: new Set() };
  for (const b of blockers) {
    const r = b.radius + CLEARANCE;
    for (let j = Math.floor((b.y - r) / CELL); j <= Math.floor((b.y + r) / CELL); j++)
      for (let i = Math.floor((b.x - r) / CELL); i <= Math.floor((b.x + r) / CELL); i++) {
        const d = Math.hypot((i + .5) * CELL - b.x, (j + .5) * CELL - b.y);
        if (d <= r) grid.soft.add(key(i, j));
        if (d <= b.radius + BODY) grid.hard.add(key(i, j));
      }
  }
  grids.set(blockers, grid);
  return grid;
}

export class LandformNav {
  private readonly blocked: Set<number>;
  private readonly hard: Set<number>;
  private route: { to: Vec2; points: Vec2[] } | null = null;
  /** A target no route reaches, remembered so it is not replanned every step. */
  private failed: { to: Vec2; at: Vec2 } | null = null;

  constructor(blockers: Blockers) { const grid = gridFor(blockers); this.blocked = grid.soft; this.hard = grid.hard; }

  private key(i: number, j: number): number { return key(i, j); }
  private solid(x: number, y: number, set = this.blocked): boolean { return set.has(this.key(Math.floor(x / CELL), Math.floor(y / CELL))); }

  /** Whether a straight walk between two points stays clear of the rock.
   * The ends are forgiven: a dog standing close by the rock, or a target
   * lying by it, is still reachable along an open line between them. */
  clear(a: Vec2, b: Vec2): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(d / (CELL * .5)));
    for (let s = 1; s < steps; s++) {
      const along = d * s / steps, end = along < END_GRACE || d - along < END_GRACE;
      if (this.solid(a.x + (b.x - a.x) * s / steps, a.y + (b.y - a.y) * s / steps, end ? this.hard : this.blocked)) return false;
    }
    return true;
  }

  /** Where to steer for now on the way from `from` to `to`: `to` itself
   * when the way is clear, otherwise a visible point along a route round
   * the rock. Falls back to `to` when no route exists in the window. */
  steer(from: Vec2, to: Vec2): Vec2 {
    if (this.clear(from, to)) { this.route = null; return to; }
    let route = this.route;
    if (!route || Math.hypot(route.to.x - to.x, route.to.y - to.y) > TARGET_SLIP || !this.near(route.points, from)) {
      const failed = this.failed;
      if (failed && Math.hypot(failed.to.x - to.x, failed.to.y - to.y) <= TARGET_SLIP && Math.hypot(failed.at.x - from.x, failed.at.y - from.y) < STRAY) return to;
      const points = this.plan(from, to);
      route = this.route = points ? { to: { ...to }, points } : null;
      this.failed = points ? null : { to: { ...to }, at: { ...from } };
    }
    if (!route) return to;
    // From where the dog is along the route, the farthest point in sight
    // within the lookahead; never a point it has already passed.
    const points = route.points;
    let at = 0, nearest = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.hypot(points[i].x - from.x, points[i].y - from.y);
      if (d < nearest) { nearest = d; at = i; }
    }
    let best = points[Math.min(points.length - 1, at + 1)];
    let along = 0;
    for (let i = at + 1; i < points.length && along < LOOKAHEAD; i++) {
      along += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      if (this.clear(from, points[i])) best = points[i];
    }
    return best;
  }

  private near(points: readonly Vec2[], p: Vec2): boolean {
    for (const q of points) if (Math.hypot(q.x - p.x, q.y - p.y) < STRAY) return true;
    return false;
  }

  private plan(from: Vec2, to: Vec2): Vec2[] | null {
    const x0 = Math.floor((Math.min(from.x, to.x) - WINDOW) / CELL), y0 = Math.floor((Math.min(from.y, to.y) - WINDOW) / CELL);
    const cols = Math.ceil((Math.max(from.x, to.x) + WINDOW) / CELL) - x0 + 1, rows = Math.ceil((Math.max(from.y, to.y) + WINDOW) / CELL) - y0 + 1;
    const n = cols * rows, index = (p: Vec2) => (Math.floor(p.y / CELL) - y0) * cols + (Math.floor(p.x / CELL) - x0);
    const start = index(from), goal = index(to);
    const g = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const heap: number[] = [], f = new Float32Array(n);
    const gi = goal % cols, gj = Math.floor(goal / cols);
    const h = (k: number) => Math.hypot(k % cols - gi, Math.floor(k / cols) - gj);
    const push = (k: number) => { heap.push(k); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (f[heap[p]] <= f[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c;
      if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    g[start] = 0; f[start] = h(start); push(start);
    let found = false;
    while (heap.length) {
      const k = pop();
      if (k === goal) { found = true; break; }
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % cols, j = Math.floor(k / cols);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const nk = nj * cols + ni;
        if (closed[nk]) continue;
        if (this.hard.has(this.key(ni + x0, nj + y0))) continue;
        if (this.blocked.has(this.key(ni + x0, nj + y0))) {
          // Grace round both ends lets a dog step off the rock's margin.
          const cx = (ni + x0 + .5) * CELL, cy = (nj + y0 + .5) * CELL;
          if (Math.hypot(cx - from.x, cy - from.y) > END_GRACE && Math.hypot(cx - to.x, cy - to.y) > END_GRACE) continue;
        }
        const cost = g[k] + (di && dj ? Math.SQRT2 : 1);
        if (cost < g[nk]) { g[nk] = cost; came[nk] = k; f[nk] = cost + h(nk); push(nk); }
      }
    }
    if (!found) return null;
    const points: Vec2[] = [];
    for (let k = goal; k >= 0; k = came[k]) { points.push({ x: (k % cols + x0 + .5) * CELL, y: (Math.floor(k / cols) + y0 + .5) * CELL }); if (k === start) break; }
    points.reverse();
    points[points.length - 1] = { ...to };
    return points;
  }
}
