/**
 * Building blocks for feature-authored landforms: a ground is described as
 * data (drainage polylines with cross-sections, crests, a wall profile with
 * its rim bands and benches) and evaluated here into one deterministic
 * heightfield. Everything is pure and synchronous so the simulation, tests,
 * renderer and survey map all read the same land.
 */
import type { Vec2 } from './types';

export const clamp01 = (n: number) => n < 0 ? 0 : n > 1 ? 1 : n;
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic 2D value noise in [0, 1]. */
export function valueNoise(seed: number): (x: number, y: number) => number {
  const hash = (x: number, y: number) => {
    let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/**
 * A polyline with a value carried along it (a floor level, a width, a crest
 * height). Distance queries return the nearest point's along-line value by
 * linear interpolation, so data authored per vertex reads continuously.
 */
export interface LineVertex { x: number; y: number }
export interface LineHit { distance: number; t: number; segment: number; /** Signed side: + left of travel. */ side: number }

export class FeatureLine<V extends LineVertex> {
  readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number;
  private readonly segments: { ax: number; ay: number; dx: number; dy: number; len2: number }[];
  constructor(readonly vertices: readonly V[], readonly reach: number) {
    this.segments = vertices.slice(1).map((b, i) => {
      const a = vertices[i];
      return { ax: a.x, ay: a.y, dx: b.x - a.x, dy: b.y - a.y, len2: (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1e-9 };
    });
    this.minX = Math.min(...vertices.map(v => v.x)) - reach; this.maxX = Math.max(...vertices.map(v => v.x)) + reach;
    this.minY = Math.min(...vertices.map(v => v.y)) - reach; this.maxY = Math.max(...vertices.map(v => v.y)) + reach;
  }
  /** Nearest point on the line, or null beyond the bounding reach. Writes into out. */
  nearest(x: number, y: number, out: LineHit): LineHit | null {
    if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY) return null;
    let best = Infinity;
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i];
      const t = clamp01(((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.len2);
      const px = s.ax + s.dx * t - x, py = s.ay + s.dy * t - y, d2 = px * px + py * py;
      if (d2 < best) { best = d2; out.t = t; out.segment = i; out.side = s.dx * (y - s.ay) - s.dy * (x - s.ax); }
    }
    out.distance = Math.sqrt(best);
    return out;
  }
  /** The authored value `key` at a hit, interpolated between vertices. */
  value(hit: LineHit, key: keyof V & string): number {
    const a = this.vertices[hit.segment] as unknown as Record<string, number>, b = this.vertices[hit.segment + 1] as unknown as Record<string, number>;
    return lerp(a[key], b[key], hit.t);
  }
  /** Points every `step` along the line, with their interpolated vertex values. */
  sample(step: number): (V & { along: number })[] {
    const out: (V & { along: number })[] = [];
    let along = 0;
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i], len = Math.sqrt(s.len2), count = Math.max(1, Math.ceil(len / step));
      for (let n = i === 0 ? 0 : 1; n <= count; n++) {
        const t = n / count, a = this.vertices[i] as unknown as Record<string, number>, b = this.vertices[i + 1] as unknown as Record<string, number>;
        const v = { ...a } as unknown as V & { along: number };
        for (const key of Object.keys(a)) (v as unknown as Record<string, number>)[key] = lerp(a[key], b[key], t);
        v.along = along + len * t;
        out.push(v);
      }
      along += len;
    }
    return out;
  }
}

/**
 * A monotone wall profile: horizontal "wall yards" in, metres out. Authored
 * as segments (a talus apron, a rim face, a bench, a slope) and smoothed into
 * a lookup table. A second, heavily smoothed table turns every rim face into
 * a steep walkable chute where a break in the rim lets a route through.
 */
export interface WallSegment {
  kind: 'floor' | 'slope' | 'talus' | 'rim' | 'bench' | 'flat';
  id?: string;
  /** Horizontal width of the segment in wall yards. */
  width: number;
  /** Metres climbed across the segment. */
  rise: number;
}
export interface WallBand { id: string; kind: WallSegment['kind']; from: number; to: number; base: number; top: number }

export class WallProfile {
  readonly bands: WallBand[] = [];
  private readonly sharp: Float32Array;
  private readonly soft: Float32Array;
  private readonly lo: number;
  private readonly step: number;
  constructor(start: { s: number; h: number }, segments: readonly WallSegment[], options: { step?: number; sharpBlur?: number; softBlur?: number; tail?: number } = {}) {
    const step = this.step = options.step ?? .25;
    let s = start.s, h = start.h;
    const knots: [number, number][] = [[s - 400, h], [s, h]];
    for (const segment of segments) {
      this.bands.push({ id: segment.id ?? segment.kind, kind: segment.kind, from: s, to: s + segment.width, base: h, top: h + segment.rise });
      s += segment.width; h += segment.rise; knots.push([s, h]);
    }
    const last = segments.at(-1)!, tailSlope = last.rise / Math.max(1, last.width);
    knots.push([s + (options.tail ?? 4000), h + tailSlope * (options.tail ?? 4000)]);
    this.lo = knots[0][0];
    const n = Math.ceil((knots.at(-1)![0] - this.lo) / step) + 1;
    const raw = new Float32Array(n);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const x = this.lo + i * step;
      while (k < knots.length - 2 && x > knots[k + 1][0]) k++;
      const [x0, y0] = knots[k], [x1, y1] = knots[k + 1];
      raw[i] = y0 + (y1 - y0) * clamp01((x - x0) / (x1 - x0 || 1));
    }
    this.sharp = boxBlur(raw, Math.round((options.sharpBlur ?? 1.2) / step));
    this.soft = boxBlur(boxBlur(raw, Math.round((options.softBlur ?? 22) / step)), Math.round((options.softBlur ?? 22) / step));
  }
  private read(table: Float32Array, s: number): number {
    const f = (s - this.lo) / this.step;
    if (f <= 0) return table[0];
    const i = Math.floor(f);
    if (i >= table.length - 1) return table[table.length - 1];
    const t = f - i;
    return table[i] + (table[i + 1] - table[i]) * t;
  }
  /** Height at a wall coordinate; `broken` 0..1 softens rim faces into chutes. */
  height(s: number, broken = 0): number {
    const sharp = this.read(this.sharp, s);
    return broken <= 0 ? sharp : sharp + (this.read(this.soft, s) - sharp) * Math.min(1, broken);
  }
  band(id: string): WallBand {
    const band = this.bands.find(b => b.id === id);
    if (!band) throw new Error(`no wall band ${id}`);
    return band;
  }
}

function boxBlur(source: Float32Array, radius: number): Float32Array {
  if (radius < 1) return source.slice();
  const out = new Float32Array(source.length), n = source.length;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) sum += source[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n; i++) {
    out[i] = sum / (radius * 2 + 1);
    sum += source[Math.min(n - 1, i + radius + 1)] - source[Math.max(0, i - radius)];
  }
  return out;
}

/**
 * A lazily filled height grid over a rectangle of property yards. Each tile
 * is evaluated on first touch, so a test that samples three points pays for
 * three tiles while the renderer, which samples everything, pays once.
 * Bilinear reads agree exactly with the analytic surface at grid nodes.
 */
export class TiledHeightCache {
  private readonly tiles = new Map<number, Float32Array>();
  private readonly columns: number;
  private readonly rows: number;
  constructor(
    private readonly bounds: { x: number; y: number; w: number; h: number },
    private readonly cell: number,
    private readonly evaluate: (x: number, y: number) => number,
    private readonly tileCells = 64,
  ) {
    this.columns = Math.ceil(bounds.w / cell); this.rows = Math.ceil(bounds.h / cell);
  }
  contains(x: number, y: number): boolean {
    return x >= this.bounds.x && y >= this.bounds.y && x <= this.bounds.x + this.columns * this.cell && y <= this.bounds.y + this.rows * this.cell;
  }
  private node(i: number, j: number): number {
    const tx = Math.floor(i / this.tileCells), ty = Math.floor(j / this.tileCells), key = ty * 4096 + tx;
    let tile = this.tiles.get(key);
    const stride = this.tileCells + 1;
    if (!tile) {
      tile = new Float32Array(stride * stride);
      for (let b = 0; b < stride; b++) for (let a = 0; a < stride; a++)
        tile[b * stride + a] = this.evaluate(this.bounds.x + (tx * this.tileCells + a) * this.cell, this.bounds.y + (ty * this.tileCells + b) * this.cell);
      this.tiles.set(key, tile);
    }
    return tile[(j - ty * this.tileCells) * stride + (i - tx * this.tileCells)];
  }
  height(x: number, y: number): number {
    const fx = (x - this.bounds.x) / this.cell, fy = (y - this.bounds.y) / this.cell;
    const i = Math.min(this.columns - 1, Math.max(0, Math.floor(fx))), j = Math.min(this.rows - 1, Math.max(0, Math.floor(fy)));
    const u = fx - i, v = fy - j;
    // Nodes on a tile's last row/column belong to the next tile's first one;
    // both tiles store them, so a read never straddles two arrays.
    const a = this.node(i, j), b = this.node(i + 1, j), c = this.node(i, j + 1), d = this.node(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
}

/** Marching-squares iso-lines of a sampled field, joined into polylines. */
export function isoLines(
  sample: (x: number, y: number) => number,
  bounds: { x: number; y: number; w: number; h: number },
  cell: number,
  level: number,
): Vec2[][] {
  const cols = Math.ceil(bounds.w / cell), rows = Math.ceil(bounds.h / cell), stride = cols + 1;
  const values = new Float32Array(stride * (rows + 1));
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) values[j * stride + i] = sample(bounds.x + i * cell, bounds.y + j * cell) - level;
  // Edge ids: horizontal edge (i,j)->(i+1,j) = 2*(j*stride+i), vertical = +1.
  const point = new Map<number, Vec2>();
  const edgePoint = (edge: number): Vec2 => {
    let p = point.get(edge);
    if (p) return p;
    const index = edge >> 1, i = index % stride, j = Math.floor(index / stride);
    const a = values[index], b = edge & 1 ? values[index + stride] : values[index + 1];
    const t = a / (a - b);
    p = edge & 1 ? { x: bounds.x + i * cell, y: bounds.y + (j + t) * cell } : { x: bounds.x + (i + t) * cell, y: bounds.y + j * cell };
    point.set(edge, p);
    return p;
  };
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * stride + i;
    const v0 = values[k], v1 = values[k + 1], v2 = values[k + stride + 1], v3 = values[k + stride];
    const top = 2 * k, right = 2 * (k + 1) + 1, bottom = 2 * (k + stride), left = 2 * k + 1;
    const edges: number[] = [];
    if ((v0 >= 0) !== (v1 >= 0)) edges.push(top);
    if ((v1 >= 0) !== (v2 >= 0)) edges.push(right);
    if ((v2 >= 0) !== (v3 >= 0)) edges.push(bottom);
    if ((v3 >= 0) !== (v0 >= 0)) edges.push(left);
    if (edges.length === 2) link(edges[0], edges[1]);
    else if (edges.length === 4) {
      const centre = (v0 + v1 + v2 + v3) / 4 >= 0;
      if (centre === (v0 >= 0)) { link(top, right); link(bottom, left); } else { link(top, left); link(right, bottom); }
    }
  }
  const lines: Vec2[][] = [];
  const used = new Set<number>();
  const walk = (start: number) => {
    const chain = [start]; used.add(start);
    let current = start;
    for (;;) {
      const next = (links.get(current) ?? []).find(e => !used.has(e));
      if (next === undefined) break;
      used.add(next); chain.push(next); current = next;
    }
    return chain;
  };
  // Open chains first (ends have one link), then closed loops.
  for (const [edge, neighbours] of links) if (neighbours.length === 1 && !used.has(edge)) lines.push(walk(edge).map(edgePoint));
  for (const edge of links.keys()) if (!used.has(edge)) { const chain = walk(edge); chain.push(chain[0]); lines.push(chain.map(edgePoint)); }
  return lines;
}
