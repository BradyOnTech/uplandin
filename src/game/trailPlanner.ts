/**
 * Routes trails over a heightfield the way cattle and hunters find them:
 * along contours where they can, switchbacking up where they must, never
 * through solid rock. A deterministic A* on a coarse grid; the result is
 * simplified to a few authored-looking vertices. Used offline by tooling to
 * bake trail polylines into a ground's data, and by tests to prove routes.
 */
import type { Vec2 } from './types';

export interface TrailPlanOptions {
  /** Grid cell, yards. */
  cell?: number;
  /** Rise over run above which a step is refused. */
  maxGrade?: number;
  /** Cost growth with grade: distance * (1 + gradeCost * grade^2). */
  gradeCost?: number;
  /** Simplification tolerance, yards. */
  tolerance?: number;
  /** Search box margin around the waypoints, yards. */
  margin?: number;
}

const M_PER_YD = .9144;

/** Plan through waypoints in order; returns one polyline (property yards). */
export function planTrail(
  waypoints: readonly Vec2[],
  heightAt: (x: number, y: number) => number,
  blocked: (x: number, y: number) => boolean,
  bounds: { x: number; y: number; w: number; h: number },
  options: TrailPlanOptions = {},
): Vec2[] {
  // Simplify leg by leg so every waypoint survives exactly: trails that
  // share a waypoint meet at the same vertex.
  const out: Vec2[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const leg = simplify(planLeg(waypoints[i - 1], waypoints[i], heightAt, blocked, bounds, options), options.tolerance ?? 3, heightAt);
    leg[0] = { ...waypoints[i - 1] }; leg[leg.length - 1] = { ...waypoints[i] };
    out.push(...(i === 1 ? leg : leg.slice(1)));
  }
  return out;
}

function planLeg(a: Vec2, b: Vec2, heightAt: (x: number, y: number) => number, blocked: (x: number, y: number) => boolean,
  bounds: { x: number; y: number; w: number; h: number }, options: TrailPlanOptions): Vec2[] {
  const cell = options.cell ?? 3, maxGrade = options.maxGrade ?? .62, gradeCost = options.gradeCost ?? 28, margin = options.margin ?? 220;
  const x0 = Math.max(bounds.x + 2, Math.min(a.x, b.x) - margin), y0 = Math.max(bounds.y + 2, Math.min(a.y, b.y) - margin);
  const x1 = Math.min(bounds.x + bounds.w - 2, Math.max(a.x, b.x) + margin), y1 = Math.min(bounds.y + bounds.h - 2, Math.max(a.y, b.y) + margin);
  const cols = Math.ceil((x1 - x0) / cell) + 1, rows = Math.ceil((y1 - y0) / cell) + 1, n = cols * rows;
  const h = new Float32Array(n), solid = new Uint8Array(n);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = x0 + i * cell, y = y0 + j * cell, k = j * cols + i;
    h[k] = heightAt(x, y); solid[k] = blocked(x, y) ? 1 : 0;
  }
  const index = (p: Vec2) => Math.max(0, Math.min(rows - 1, Math.round((p.y - y0) / cell))) * cols + Math.max(0, Math.min(cols - 1, Math.round((p.x - x0) / cell)));
  const start = index(a), goal = index(b);
  solid[start] = 0; solid[goal] = 0;
  const g = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const heap: number[] = [], f = new Float32Array(n);
  const gx = goal % cols, gy = Math.floor(goal / cols);
  const estimate = (k: number) => Math.hypot(k % cols - gx, Math.floor(k / cols) - gy) * cell;
  const push = (k: number) => {
    heap.push(k); let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (f[heap[p]] <= f[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c;
      if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
      if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } }
    return top;
  };
  g[start] = 0; f[start] = estimate(start); push(start);
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [1, 2], [-2, 1], [-1, 2], [2, -1], [1, -2], [-2, -1], [-1, -2]];
  while (heap.length) {
    const k = pop();
    if (k === goal) break;
    if (closed[k]) continue;
    closed[k] = 1;
    const i = k % cols, j = Math.floor(k / cols);
    for (const [di, dj] of steps) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const nk = nj * cols + ni;
      if (closed[nk] || solid[nk]) continue;
      // A long step must not hop a thin rim: check its midpoint too.
      if ((Math.abs(di) === 2 || Math.abs(dj) === 2) && solid[Math.round(j + dj / 2) * cols + Math.round(i + di / 2)]) continue;
      const run = Math.hypot(di, dj) * cell, grade = Math.abs(h[nk] - h[k]) / (run * M_PER_YD);
      if (grade > maxGrade) continue;
      const cost = g[k] + run * (1 + gradeCost * grade * grade);
      if (cost < g[nk]) { g[nk] = cost; from[nk] = k; f[nk] = cost + estimate(nk); push(nk); }
    }
  }
  if (from[goal] < 0 && goal !== start) throw new Error(`no walkable trail from ${a.x},${a.y} to ${b.x},${b.y}`);
  const path: Vec2[] = [];
  for (let k = goal; k >= 0; k = from[k]) { path.push({ x: x0 + (k % cols) * cell, y: y0 + Math.floor(k / cols) * cell }); if (k === start) break; }
  path.reverse();
  path[0] = { ...a }; path[path.length - 1] = { ...b };
  return path;
}

/** Douglas-Peucker in plan, refusing to drop a vertex that holds the grade. */
function simplify(points: Vec2[], tolerance: number, heightAt: (x: number, y: number) => number): Vec2[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, worstD = tolerance;
    const ax = points[a].x, ay = points[a].y, dx = points[b].x - ax, dy = points[b].y - ay, len2 = dx * dx + dy * dy || 1;
    const ha = heightAt(ax, ay), hb = heightAt(points[b].x, points[b].y);
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((points[i].x - ax) * dx + (points[i].y - ay) * dy) / len2));
      const plan = Math.hypot(points[i].x - ax - dx * t, points[i].y - ay - dy * t);
      // Height off the straight chord, in yards-equivalent: keeps switchbacks.
      const vertical = Math.abs(heightAt(points[i].x, points[i].y) - (ha + (hb - ha) * t)) / M_PER_YD;
      const d = Math.max(plan, vertical * .8);
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return points.filter((_, i) => keep[i]).map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
}
