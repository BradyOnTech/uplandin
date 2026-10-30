/**
 * THE COVER MAP: what grows where, one cell every two yards, for the shared
 * ground kit. Every band of vegetation (near garnish, middle masses, the far
 * colour mosaic in the terrain) reads this one map, so a coulee head that is
 * dark buckbrush from the crest is the same buckbrush underfoot.
 *
 * Nothing here is placed by hand. The map is derived from:
 *  - the landform, through height queries alone: local and broad position
 *    (crown or hollow), slope, exposure and a flow-accumulation wetness;
 *  - the ground's habitat (the sim's cover patches) and its working layout
 *    (routes, landmarks, entries);
 *  - each ground's recipe, which turns those into its own plant classes.
 * When the Landform lane rebuilds a ground bigger, or exposes cover classes
 * read from the land, the same recipe dresses it with no coordinates to move.
 *
 * Pure data: no three.js, no allocation per query. Property yards in.
 */

/** Cover classes every ground's kit understands; a ground's palette says
 * which plants each one is (copper little bluestem, sand plum, cattail...). */
export const Cover = {
  /** Worn ground: ruts, yards, exposed till. */
  bare: 0,
  /** Short grazed sward on open shoulders and flats. */
  short: 1,
  /** Dry crowns and exposed brows. */
  crown: 2,
  /** Moist swales and draw bottoms: the tall grass. */
  swale: 3,
  /** Rank native stands: the sim's bird cover. */
  stand: 4,
  /** Low woody clumps and thickets. */
  shrub: 5,
  /** Tree belts and timber. */
  tree: 6,
  /** Open water. */
  water: 7,
} as const;
export type CoverClass = (typeof Cover)[keyof typeof Cover];
export const COVER_CLASS_COUNT = 8;

/** Yards per cover cell (about 1.8 m). */
export const COVER_CELL_YARDS = 2;
/** Yards per landform analysis sample. Broad shapes need no finer grid. */
export const COVER_LAND_STEP_YARDS = 4;
/** The map continues past the fence so the far mosaic has no edge. */
export const COVER_MARGIN_YARDS = 120;
/** Radii (yards) of the local and broad landform position. */
const LOCAL_RADIUS_YARDS = 24;
const BROAD_RADIUS_YARDS = 84;
/** Upslope area (in land cells) where wetness starts and saturates. */
const WET_START_CELLS = 18;
const WET_FULL_CELLS = 900;
/** Dips shallower than this spill on down the draw (water routing only). */
const PIT_FILL_METRES = .3;
/** Wetness at which gathered water makes a draw bottom. */
const CHANNEL_WETNESS = .6;
/** Wetness of a channel proper: the creek and the big draws feeding it. */
const CHANNEL_CORE_WETNESS = .82;
/** Channel distance is measured out to this reach (yards). */
const CHANNEL_REACH_YARDS = 64;
/** Rise over run below which a channel top is a basin floor, not a head. */
const HEAD_MIN_SLOPE = .018;
/** Draw heads closer than this are one head. */
const HEAD_SPACING_YARDS = 36;
/** Head distance is stamped out to this reach; beyond it reads as "none". */
const HEAD_REACH_YARDS = 48;

export interface CoverRect { x: number; y: number; w: number; h: number }
export interface CoverPoint { x: number; y: number }

/** What the land says at a point. */
export interface LandSample {
  /** Metres. */
  height: number;
  /** Rise over run. */
  slope: number;
  /** Height above the local mean (m): + crown, - hollow, ~24 yd radius. */
  tpi: number;
  /** Height above the broad mean (m), ~84 yd radius: swell or basin. */
  relief: number;
  /** 0 dry upland .. 1 where water gathers (flow accumulation). */
  wetness: number;
  /** Downslope facing, -1..1: + south (property +y), + west (-x). */
  south: number;
  west: number;
  /** Contour convergence, 0..1: where slopes fold in toward a draw. */
  convergence: number;
  /** Yards to the nearest channel (the creek and its big draws), capped
   * at 64: the creek's own corridor, wider than the flow line itself. */
  channel: number;
}

/** Ground features the landform carries at a finer grain than the land
 * analysis sees: a creek's bed, a burn, a disked firebreak. 0..1 each. */
export interface CoverFeatures {
  /** 1 across a creek's bed, falling to 0 over its cut bank. */
  bed: number;
  /** 1 in the black of a burn. */
  burn: number;
  /** How bare the ground is for any reason (bed, burn, firebreak...). */
  bare: number;
}

/** Everything a recipe sees at one cover cell. */
export interface CoverSample extends LandSample, CoverFeatures {
  /** Yards to the nearest habitat patch (capped at its reach); negative inside one. */
  habitat: number;
  /** Yards to the nearest route centreline. */
  route: number;
  /** 0..1 inside a working clearing (yard, entry, landmark). */
  clearing: number;
  /** Yards to the nearest draw head (the land's own woody-cover sites). */
  head: number;
}

export interface CoverCell {
  cls: CoverClass;
  /** 0..1: how completely the class covers its ground. */
  density: number;
  /** Crown height of the cover, metres. */
  height: number;
  /** 0..1 colony variation inside the class (palette lerp). */
  tone: number;
  /** Which plant community of the class grows here (palette swatch,
   * woody species group): needle-and-thread or wheatgrass, thicket or
   * buckbrush. 0..COVER_VARIANTS-1. */
  variant: number;
}

/** Communities a class can hold. */
export const COVER_VARIANTS = 4;

/** A woody plant that stands on its own rather than in a thicket: a
 * mesquite in the pasture, a cottonwood on the creek, a sand sage on the
 * sandhill. `group` keys the ground's woody groups for sites. */
export interface CoverSite { x: number; y: number; group: number }

/**
 * Sites on a jittered lattice of `step` yards: each lattice point is offered
 * to `place` with its own random draw `r` in [0, 1), and becomes a site of
 * the returned group (or nothing for -1). Sites of an earlier lattice keep
 * `clearance` yards of room from later ones (a sage never grows inside a
 * mesquite's crown).
 */
export interface CoverSiteLattice {
  step: number;
  salt: number;
  clearance?: number;
  place(x: number, y: number, sample: CoverSample, cell: CoverCell, r: number): number;
}

/** A ground's rules: land, habitat and layout in, cover out. */
export interface CoverRecipe {
  classify(x: number, y: number, sample: CoverSample, out: CoverCell): void;
  /** Lone woody plants, read from the same land after classification. */
  sites?: readonly CoverSiteLattice[];
}

/** A clearing kept open round a working place, in yards. */
export interface CoverClearing extends CoverPoint { radius: number }

export interface CoverMapSource {
  /** The hunt property, yards. */
  bounds: CoverRect;
  /** Landform height (m) at a property position. */
  heightAt(x: number, y: number): number;
  habitat: readonly CoverRect[];
  routes: readonly (readonly CoverPoint[])[];
  clearings: readonly CoverClearing[];
  recipe: CoverRecipe;
  /** The ground's fine features (creek bed, burn...), when it has any. */
  features?(x: number, y: number, out: CoverFeatures): void;
  margin?: number;
  /** Cell and landform sample size, yards (a coarse far map uses larger). */
  cell?: number;
  landStep?: number;
}

/**
 * Landform metrics on a coarse grid, sampled bilinearly. Built from height
 * queries only, so any landform the Landform lane authors works unchanged.
 */
export class LandAnalysis {
  readonly x0: number;
  readonly y0: number;
  readonly cols: number;
  readonly rows: number;
  private readonly fields: Float32Array[];

  constructor(x0: number, y0: number, width: number, depth: number, heightAt: (x: number, y: number) => number,
    readonly step = COVER_LAND_STEP_YARDS) {
    this.x0 = x0; this.y0 = y0;
    this.cols = Math.ceil(width / step) + 1;
    this.rows = Math.ceil(depth / step) + 1;
    const { cols, rows } = this, n = cols * rows;
    const height = new Float32Array(n);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) height[r * cols + c] = heightAt(x0 + c * step, y0 + r * step);
    const metres = step * .9144;
    const slope = new Float32Array(n), south = new Float32Array(n), west = new Float32Array(n);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const gx = (height[r * cols + Math.min(cols - 1, c + 1)] - height[r * cols + Math.max(0, c - 1)]) / (metres * 2);
      const gy = (height[Math.min(rows - 1, r + 1) * cols + c] - height[Math.max(0, r - 1) * cols + c]) / (metres * 2);
      const s = Math.hypot(gx, gy);
      slope[i] = s;
      // Downslope is -gradient; facing strength grows with the slope.
      const facing = Math.min(1, s / .12);
      south[i] = s > 1e-5 ? -gy / s * facing : 0;
      west[i] = s > 1e-5 ? gx / s * facing : 0;
    }
    const tpi = this.positionIndex(height, LOCAL_RADIUS_YARDS);
    const relief = this.positionIndex(height, BROAD_RADIUS_YARDS);
    const wetness = this.wetness(height);
    // Hollows are places, not contour lines: blur the fold into blobs about
    // the size of a woody draw head before anything is classified on it.
    const convergence = this.blur(this.blur(this.convergence(height), 2), 2);
    this.fields = [height, slope, tpi, relief, wetness, south, west, convergence, this.channelDistance(wetness)];
    this.heads = this.drawHeads(height, wetness);
  }

  /** Yards from each cell to the nearest channel cell, by a two-pass
   * chamfer transform, capped at the reach. */
  private channelDistance(wetness: Float32Array): Float32Array {
    const { cols, rows, step } = this, out = new Float32Array(cols * rows);
    for (let i = 0; i < out.length; i++) out[i] = wetness[i] >= CHANNEL_CORE_WETNESS ? 0 : CHANNEL_REACH_YARDS;
    const d1 = step, d2 = step * Math.SQRT2;
    const relax = (i: number, j: number, d: number) => { if (out[j] + d < out[i]) out[i] = out[j] + d; };
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (x > 0) relax(i, i - 1, d1);
      if (y > 0) { relax(i, i - cols, d1); if (x > 0) relax(i, i - cols - 1, d2); if (x < cols - 1) relax(i, i - cols + 1, d2); }
    }
    for (let y = rows - 1; y >= 0; y--) for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      if (x < cols - 1) relax(i, i + 1, d1);
      if (y < rows - 1) { relax(i, i + cols, d1); if (x < cols - 1) relax(i, i + cols + 1, d2); if (x > 0) relax(i, i + cols - 1, d2); }
    }
    for (let i = 0; i < out.length; i++) out[i] = Math.min(CHANNEL_REACH_YARDS, out[i]);
    return out;
  }

  /** The top of every draw: a channel cell with no higher channel cell
   * beside it, where water first gathers enough to grow a draw. */
  readonly heads: CoverPoint[];

  private drawHeads(height: Float32Array, wetness: Float32Array): CoverPoint[] {
    const { cols, rows, step } = this, heads: CoverPoint[] = [], reach = 4;
    const metres = step * .9144;
    for (let y = reach; y < rows - reach; y++) for (let x = reach; x < cols - reach; x++) {
      const i = y * cols + x;
      // Only where water has just begun to gather: a bump in the middle of a
      // long swale is a local top, but it already carries the whole draw.
      if (wetness[i] < CHANNEL_WETNESS || wetness[i] > CHANNEL_WETNESS + .14) continue;
      // Heads are cut into a slope; a flat basin floor has none.
      const fall = Math.hypot(height[i + 1] - height[i - 1], height[i + cols] - height[i - cols]) / (2 * metres);
      if (fall < HEAD_MIN_SLOPE) continue;
      let top = true;
      for (let dy = -reach; dy <= reach && top; dy++) for (let dx = -reach; dx <= reach; dx++) {
        const j = (y + dy) * cols + x + dx;
        if (j !== i && wetness[j] >= CHANNEL_WETNESS && height[j] > height[i]) { top = false; break; }
      }
      if (!top) continue;
      const px = this.x0 + x * step, py = this.y0 + y * step;
      if (heads.some(h => Math.hypot(h.x - px, h.y - py) < HEAD_SPACING_YARDS)) continue;
      heads.push({ x: px, y: py });
    }
    return heads;
  }

  /** Box blur of radius r cells (two passes approximate a Gaussian). */
  private blur(field: Float32Array, r: number): Float32Array {
    const { cols, rows } = this, out = new Float32Array(cols * rows);
    const sat = new Float64Array((cols + 1) * (rows + 1));
    for (let y = 0; y < rows; y++) {
      let run = 0;
      for (let x = 0; x < cols; x++) { run += field[y * cols + x]; sat[(y + 1) * (cols + 1) + x + 1] = sat[y * (cols + 1) + x + 1] + run; }
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(cols, x + r + 1), ya = Math.max(0, y - r), yb = Math.min(rows, y + r + 1);
      out[y * cols + x] = (sat[yb * (cols + 1) + xb] - sat[ya * (cols + 1) + xb] - sat[yb * (cols + 1) + xa] + sat[ya * (cols + 1) + xa]) / ((xb - xa) * (yb - ya));
    }
    return out;
  }

  /** Plan (contour) curvature on a two-cell stencil, signed so hollows are
   * positive, weighted by slope (flat ground has no contour to fold). */
  private convergence(height: Float32Array): Float32Array {
    const { cols, rows } = this, out = new Float32Array(cols * rows);
    const h = (c: number, r: number) => height[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
    const d = this.step * .9144 * 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const z = h(c, r);
      const p = (h(c + 2, r) - h(c - 2, r)) / (2 * d), q = (h(c, r + 2) - h(c, r - 2)) / (2 * d);
      const rr = (h(c + 2, r) - 2 * z + h(c - 2, r)) / (d * d), tt = (h(c, r + 2) - 2 * z + h(c, r - 2)) / (d * d);
      const ss = (h(c + 2, r + 2) - h(c + 2, r - 2) - h(c - 2, r + 2) + h(c - 2, r - 2)) / (4 * d * d);
      const g2 = p * p + q * q;
      if (g2 < 1e-6) continue;
      // Contour curvature, positive where contours bend round a hollow.
      const plan = (q * q * rr - 2 * p * q * ss + p * p * tt) / Math.pow(g2, 1.5);
      out[r * cols + c] = Math.max(0, Math.min(1, plan * 18)) * Math.min(1, Math.sqrt(g2) / .05);
    }
    return out;
  }

  /** Height minus the box mean of radius r, through a summed-area table. */
  private positionIndex(height: Float32Array, radiusYards: number): Float32Array {
    const { cols, rows } = this, r = Math.max(1, Math.round(radiusYards / this.step));
    const sat = new Float64Array((cols + 1) * (rows + 1));
    for (let y = 0; y < rows; y++) {
      let run = 0;
      for (let x = 0; x < cols; x++) {
        run += height[y * cols + x];
        sat[(y + 1) * (cols + 1) + x + 1] = sat[y * (cols + 1) + x + 1] + run;
      }
    }
    const out = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(cols, x + r + 1), ya = Math.max(0, y - r), yb = Math.min(rows, y + r + 1);
      const sum = sat[yb * (cols + 1) + xb] - sat[ya * (cols + 1) + xb] - sat[yb * (cols + 1) + xa] + sat[ya * (cols + 1) + xa];
      out[y * cols + x] = height[y * cols + x] - sum / ((xb - xa) * (yb - ya));
    }
    return out;
  }

  /** Priority-flood pit filling: every hollow spills over its lowest rim, so
   * a dip in a swale bottom passes its water on instead of starting a new
   * draw below it. Water routing only; the land itself is unchanged. */
  private filled(height: Float32Array): Float32Array {
    const { cols, rows } = this, n = cols * rows, out = new Float32Array(height);
    const done = new Uint8Array(n), heap: number[] = [];
    const less = (a: number, b: number) => out[a] < out[b];
    const push = (i: number) => {
      heap.push(i);
      for (let k = heap.length - 1; k > 0;) {
        const p = (k - 1) >> 1;
        if (!less(heap[k], heap[p])) break;
        [heap[k], heap[p]] = [heap[p], heap[k]]; k = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let k = 0; ;) {
          const l = k * 2 + 1, r = l + 1;
          let m = k;
          if (l < heap.length && less(heap[l], heap[m])) m = l;
          if (r < heap.length && less(heap[r], heap[m])) m = r;
          if (m === k) break;
          [heap[k], heap[m]] = [heap[m], heap[k]]; k = m;
        }
      }
      return top;
    };
    for (let x = 0; x < cols; x++) for (const y of [0, rows - 1]) { const i = y * cols + x; if (!done[i]) { done[i] = 1; push(i); } }
    for (let y = 1; y < rows - 1; y++) for (const x of [0, cols - 1]) { const i = y * cols + x; done[i] = 1; push(i); }
    while (heap.length) {
      const i = pop(), x = i % cols, y = (i - x) / cols;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (done[j]) continue;
        done[j] = 1;
        // A tiny rise keeps every filled flat draining toward its outlet.
        out[j] = Math.max(out[j], out[i] + 1e-4);
        push(j);
      }
    }
    // Only shallow dips spill. A real pothole basin keeps its water, so its
    // bottom stays the wettest ground instead of becoming a routed flat.
    for (let i = 0; i < n; i++) out[i] = Math.min(out[i], height[i] + PIT_FILL_METRES);
    return out;
  }

  /** Multiple-flow-direction accumulation: each cell passes its water to
   * every lower neighbour by slope, highest first. Smooth draws, no D8 rays. */
  private wetness(raw: Float32Array): Float32Array {
    const { cols, rows } = this, n = cols * rows;
    const height = this.filled(raw);
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => height[b] - height[a]);
    const acc = new Float32Array(n).fill(1);
    const share = new Float32Array(8);
    const offsets = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
    for (let k = 0; k < n; k++) {
      const i = order[k], x = i % cols, y = (i - x) / cols;
      let total = 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + offsets[d][0], ny = y + offsets[d][1];
        share[d] = 0;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const drop = (height[i] - height[ny * cols + nx]) / (d === 0 || d === 2 || d === 5 || d === 7 ? 1.4142 : 1);
        if (drop > 0) { share[d] = Math.pow(drop, 1.1); total += share[d]; }
      }
      if (total <= 0) continue;
      for (let d = 0; d < 8; d++) {
        if (share[d] > 0) acc[(y + offsets[d][1]) * cols + x + offsets[d][0]] += acc[i] * share[d] / total;
      }
    }
    // Thresholds are upslope areas: a coarser grid needs fewer cells.
    const area = (COVER_LAND_STEP_YARDS / this.step) ** 2;
    const lo = Math.log(Math.max(1.5, WET_START_CELLS * area)), hi = Math.log(Math.max(3, WET_FULL_CELLS * area));
    for (let i = 0; i < n; i++) acc[i] = Math.min(1, Math.max(0, (Math.log(acc[i]) - lo) / (hi - lo)));
    return acc;
  }

  sample(x: number, y: number, out: LandSample): LandSample {
    const gx = Math.min(this.cols - 1.0001, Math.max(0, (x - this.x0) / this.step));
    const gy = Math.min(this.rows - 1.0001, Math.max(0, (y - this.y0) / this.step));
    const ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy;
    const i = iy * this.cols + ix, c = this.cols;
    const f = this.fields;
    const lerp = (a: Float32Array) => (a[i] + (a[i + 1] - a[i]) * tx) * (1 - ty) + (a[i + c] + (a[i + c + 1] - a[i + c]) * tx) * ty;
    out.height = lerp(f[0]); out.slope = lerp(f[1]); out.tpi = lerp(f[2]); out.relief = lerp(f[3]);
    out.wetness = lerp(f[4]); out.south = lerp(f[5]); out.west = lerp(f[6]); out.convergence = lerp(f[7]); out.channel = lerp(f[8]);
    return out;
  }
}

/** Per-cell cover for a whole ground plus its margin. */
export class CoverMap {
  readonly x0: number;
  readonly y0: number;
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly bounds: CoverRect;
  readonly cls: Uint8Array;
  /** 0..255 = density 0..1. */
  readonly density: Uint8Array;
  /** Centimetres / 2: 0..255 = 0..5.1 m. */
  readonly height: Uint8Array;
  readonly tone: Uint8Array;
  readonly variant: Uint8Array;
  /** Lone woody plants (the recipe's site lattices), in placement order. */
  readonly sites: CoverSite[] = [];

  constructor(bounds: CoverRect, margin: number, cell = COVER_CELL_YARDS) {
    this.cell = cell;
    this.bounds = { ...bounds };
    this.x0 = bounds.x - margin; this.y0 = bounds.y - margin;
    this.cols = Math.ceil((bounds.w + margin * 2) / this.cell);
    this.rows = Math.ceil((bounds.h + margin * 2) / this.cell);
    const n = this.cols * this.rows;
    this.cls = new Uint8Array(n); this.density = new Uint8Array(n);
    this.height = new Uint8Array(n); this.tone = new Uint8Array(n); this.variant = new Uint8Array(n);
  }

  /** Cell index under a property position (clamped to the map). */
  index(x: number, y: number): number {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.x0) / this.cell)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.y0) / this.cell)));
    return r * this.cols + c;
  }

  sample(x: number, y: number, out: CoverCell): CoverCell {
    const i = this.index(x, y);
    out.cls = this.cls[i] as CoverClass;
    out.density = this.density[i] / 255;
    out.height = this.height[i] * .02;
    out.tone = this.tone[i] / 255;
    out.variant = this.variant[i];
    return out;
  }

  write(i: number, cell: CoverCell): void {
    this.cls[i] = cell.cls;
    this.density[i] = Math.round(Math.min(1, Math.max(0, cell.density)) * 255);
    this.height[i] = Math.round(Math.min(5.1, Math.max(0, cell.height)) / .02);
    this.tone[i] = Math.round(Math.min(1, Math.max(0, cell.tone)) * 255);
    this.variant[i] = Math.min(COVER_VARIANTS - 1, Math.max(0, Math.round(cell.variant)));
  }

  /** Share of in-property cells per class, for tests and review. */
  classShare(): number[] {
    const counts = new Array(COVER_CLASS_COUNT).fill(0);
    let total = 0;
    const { bounds } = this;
    for (let r = 0; r < this.rows; r++) {
      const y = this.y0 + (r + .5) * this.cell;
      if (y < bounds.y || y > bounds.y + bounds.h) continue;
      for (let c = 0; c < this.cols; c++) {
        const x = this.x0 + (c + .5) * this.cell;
        if (x < bounds.x || x > bounds.x + bounds.w) continue;
        counts[this.cls[r * this.cols + c]]++; total++;
      }
    }
    return counts.map(count => count / Math.max(1, total));
  }
}

/** The recipe's sites bucketed on a coarse grid, for chunk fills. */
export class CoverSiteIndex {
  private readonly buckets = new Map<number, CoverSite[]>();
  private static readonly SIZE = 64;

  constructor(sites: readonly CoverSite[]) {
    for (const site of sites) {
      const key = CoverSiteIndex.key(Math.floor(site.x / CoverSiteIndex.SIZE), Math.floor(site.y / CoverSiteIndex.SIZE));
      (this.buckets.get(key) ?? this.buckets.set(key, []).get(key)!).push(site);
    }
  }

  private static key(bx: number, by: number): number { return (bx + 4096) * 8192 + by + 4096; }

  /** Sites whose roots lie in [x0, x0 + size) x [y0, y0 + size). */
  *within(x0: number, y0: number, size: number): Generator<CoverSite> {
    const S = CoverSiteIndex.SIZE;
    for (let by = Math.floor(y0 / S); by <= Math.floor((y0 + size) / S); by++) for (let bx = Math.floor(x0 / S); bx <= Math.floor((x0 + size) / S); bx++) {
      for (const site of this.buckets.get(CoverSiteIndex.key(bx, by)) ?? []) {
        if (site.x >= x0 && site.x < x0 + size && site.y >= y0 && site.y < y0 + size) yield site;
      }
    }
  }
}

function segmentDistance(x: number, y: number, a: CoverPoint, b: CoverPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
}

/** Signed yards to a rect: negative inside, by the nearer edge. */
function rectDistance(x: number, y: number, r: CoverRect): number {
  const dx = Math.max(r.x - x, x - r.x - r.w), dy = Math.max(r.y - y, y - r.y - r.h);
  if (dx <= 0 && dy <= 0) return Math.max(dx, dy);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

const ROUTE_REACH_YARDS = 6;
const HABITAT_REACH_YARDS = 40;

/** Build a ground's cover map. Synchronous; ~0.1-0.3 s for a full section. */
export function buildCoverMap(source: CoverMapSource): CoverMap {
  const margin = source.margin ?? COVER_MARGIN_YARDS;
  const map = new CoverMap(source.bounds, margin, source.cell);
  const land = new LandAnalysis(map.x0, map.y0, map.cols * map.cell, map.rows * map.cell, source.heightAt, source.landStep);
  // Route distance is stamped only near each segment; everywhere else it
  // stays at the reach, which recipes read as "far from any track".
  const route = new Float32Array(map.cols * map.rows).fill(ROUTE_REACH_YARDS);
  for (const line of source.routes) for (let k = 1; k < line.length; k++) {
    const a = line[k - 1], b = line[k];
    const c0 = Math.floor((Math.min(a.x, b.x) - ROUTE_REACH_YARDS - map.x0) / map.cell), c1 = Math.ceil((Math.max(a.x, b.x) + ROUTE_REACH_YARDS - map.x0) / map.cell);
    const r0 = Math.floor((Math.min(a.y, b.y) - ROUTE_REACH_YARDS - map.y0) / map.cell), r1 = Math.ceil((Math.max(a.y, b.y) + ROUTE_REACH_YARDS - map.y0) / map.cell);
    for (let r = Math.max(0, r0); r <= Math.min(map.rows - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(map.cols - 1, c1); c++) {
      const d = segmentDistance(map.x0 + (c + .5) * map.cell, map.y0 + (r + .5) * map.cell, a, b);
      const i = r * map.cols + c;
      if (d < route[i]) route[i] = d;
    }
  }
  const head = new Float32Array(map.cols * map.rows).fill(HEAD_REACH_YARDS);
  for (const point of land.heads) {
    const c0 = Math.floor((point.x - HEAD_REACH_YARDS - map.x0) / map.cell), r0 = Math.floor((point.y - HEAD_REACH_YARDS - map.y0) / map.cell);
    const span = Math.ceil(HEAD_REACH_YARDS * 2 / map.cell);
    for (let r = Math.max(0, r0); r <= Math.min(map.rows - 1, r0 + span); r++) for (let c = Math.max(0, c0); c <= Math.min(map.cols - 1, c0 + span); c++) {
      const d = Math.hypot(map.x0 + (c + .5) * map.cell - point.x, map.y0 + (r + .5) * map.cell - point.y);
      const i = r * map.cols + c;
      if (d < head[i]) head[i] = d;
    }
  }
  // Habitat distance is stamped round each patch out to its reach, like the
  // routes; recipes read anything farther as open ground.
  const habitat = new Float32Array(map.cols * map.rows).fill(HABITAT_REACH_YARDS);
  for (const patch of source.habitat) {
    const c0 = Math.max(0, Math.floor((patch.x - HABITAT_REACH_YARDS - map.x0) / map.cell));
    const c1 = Math.min(map.cols - 1, Math.ceil((patch.x + patch.w + HABITAT_REACH_YARDS - map.x0) / map.cell));
    const r0 = Math.max(0, Math.floor((patch.y - HABITAT_REACH_YARDS - map.y0) / map.cell));
    const r1 = Math.min(map.rows - 1, Math.ceil((patch.y + patch.h + HABITAT_REACH_YARDS - map.y0) / map.cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * map.cols + c, d = rectDistance(map.x0 + (c + .5) * map.cell, map.y0 + (r + .5) * map.cell, patch);
      if (d < habitat[i]) habitat[i] = d;
    }
  }
  const sample: CoverSample = { height: 0, slope: 0, tpi: 0, relief: 0, wetness: 0, south: 0, west: 0, convergence: 0, channel: 0,
    habitat: 0, route: 0, clearing: 0, head: 0, bed: 0, burn: 0, bare: 0 };
  const cell: CoverCell = { cls: Cover.short, density: 0, height: 0, tone: 0, variant: 0 };
  // Everything a recipe sees at a point, from the stamped fields of the
  // cell it falls in and the land sampled at the point itself.
  const read = (x: number, y: number, i: number) => {
    land.sample(x, y, sample);
    sample.habitat = habitat[i];
    sample.route = route[i];
    let clearing = 0;
    for (const place of source.clearings) {
      const d = Math.hypot(x - place.x, y - place.y);
      if (d < place.radius) clearing = Math.max(clearing, 1 - Math.max(0, d - place.radius * .6) / (place.radius * .4));
    }
    sample.clearing = clearing;
    sample.head = head[i];
    sample.bed = 0; sample.burn = 0; sample.bare = 0;
    source.features?.(x, y, sample);
  };
  for (let r = 0; r < map.rows; r++) {
    const y = map.y0 + (r + .5) * map.cell;
    for (let c = 0; c < map.cols; c++) {
      const x = map.x0 + (c + .5) * map.cell, i = r * map.cols + c;
      read(x, y, i);
      cell.cls = Cover.short; cell.density = 0; cell.height = 0; cell.tone = 0; cell.variant = 0;
      source.recipe.classify(x, y, sample, cell);
      map.write(i, cell);
    }
  }
  // Lone woody plants, lattice by lattice, each offered the land and the
  // cover already classified where it would stand.
  const taken = new Map<number, CoverSite[]>(), bucket = 16, key = (x: number, y: number) => Math.floor(x / bucket) * 65536 + Math.floor(y / bucket);
  for (const lattice of source.recipe.sites ?? []) {
    const { step, salt } = lattice, clearance = lattice.clearance ?? 0;
    const placed: CoverSite[] = [];
    for (let iy = Math.ceil(map.y0 / step); iy * step < map.y0 + map.rows * map.cell; iy++) {
      for (let ix = Math.ceil(map.x0 / step); ix * step < map.x0 + map.cols * map.cell; ix++) {
        const x = (ix + .15 + coverHash(ix, iy, salt) * .7) * step, y = (iy + .15 + coverHash(ix, iy, salt + 1) * .7) * step;
        const i = map.index(x, y);
        read(x, y, i);
        map.sample(x, y, cell);
        const group = lattice.place(x, y, sample, cell, coverHash(ix, iy, salt + 2));
        if (group < 0) continue;
        if (clearance > 0) {
          let crowded = false;
          for (let by = Math.floor((y - clearance) / bucket); by <= Math.floor((y + clearance) / bucket) && !crowded; by++)
            for (let bx = Math.floor((x - clearance) / bucket); bx <= Math.floor((x + clearance) / bucket) && !crowded; bx++)
              crowded = (taken.get(bx * 65536 + by) ?? []).some(site => Math.hypot(site.x - x, site.y - y) < clearance);
          if (crowded) continue;
        }
        placed.push({ x, y, group });
      }
    }
    for (const site of placed) {
      map.sites.push(site);
      const k = key(site.x, site.y);
      (taken.get(k) ?? taken.set(k, []).get(k)!).push(site);
    }
  }
  return map;
}

/** Deterministic hash in [0, 1) for integer lattice points. */
export function coverHash(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). */
export function coverNoise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = coverHash(ix, iy, salt), b = coverHash(ix + 1, iy, salt);
  const c = coverHash(ix, iy + 1, salt), d = coverHash(ix + 1, iy + 1, salt);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function coverSmooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
