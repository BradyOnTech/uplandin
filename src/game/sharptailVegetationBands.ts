/** Shared visual vegetation structure for the western prairie draw. Coordinates
 * and widths are property yards. This field does not change terrain, bird
 * habitat, collision, or route authority. Consumers still apply their existing
 * physical clearance rules when placing individual plants. */
export interface SharptailVegetationBands {
  scrub: number;
  grass: number;
  litter: number;
}

/** along-axis coordinate, cross-axis center, full cross-axis support width,
 * scrub strength, grass strength. Width includes the soft outer fringe. */
type Knot = readonly [number, number, number, number, number];

export interface SharptailVegetationBand {
  readonly id: string;
  readonly axis: 'x' | 'y';
  readonly lee: -1 | 1;
  readonly knots: readonly Knot[];
}

/** Unequal, branching ribbons follow the existing brush colonies. The main
 * channel stays grassy between colonies; zero scrub stations make real breaks
 * in the low woody growth rather than a continuous hedge. */
export const SHARPTAIL_VEGETATION_BAND_BOUNDS = { minX: -430, maxX: 170, minY: 430, maxY: 850 } as const;

export const SHARPTAIL_VEGETATION_BANDS: readonly SharptailVegetationBand[] = [
  {
    id: 'western-draw', axis: 'x', lee: 1,
    knots: [
      [-310, 739, 30, 0, .75], [-270, 724, 60, .25, .88],
      [-225, 704, 78, .46, .94], [-185, 682, 90, .88, .98],
      [-151, 672, 72, .12, .91], [-120, 647, 84, .85, .98],
      [-92, 615, 54, 0, .88], [-60, 590, 84, .90, .98],
      [-19, 582, 66, .12, .94], [26, 599, 90, .84, .98],
      [53, 584, 66, 0, .89], [86, 554, 84, .86, .97],
      [110, 540, 66, .50, .94], [145, 530, 30, 0, .75],
    ],
  },
  {
    id: 'northern-fork', axis: 'x', lee: -1,
    knots: [
      [-320, 533, 30, 0, .72], [-274, 543, 54, .12, .83],
      [-242, 555, 69, .28, .90], [-215, 574, 84, .88, .97],
      [-199, 599, 60, .08, .89], [-180, 620, 78, .88, .97],
      [-149, 637, 63, .18, .93], [-117, 646, 60, .45, .92],
      [-101, 642, 30, 0, .75],
    ],
  },
  {
    id: 'southern-lee', axis: 'y', lee: -1,
    knots: [
      [590, 27, 30, 0, .76], [609, 29, 60, .26, .91],
      [634, 44, 69, .38, .94], [658, 58, 54, 0, .86],
      [681, 87, 78, .85, .96], [707, 111, 54, .16, .85],
      [728, 112, 30, 0, .72],
    ],
  },
  {
    // A low approaching cape joins the boundary-side brush to the existing
    // draw mouth. Keep this tributary narrower than the main grassy hollow.
    id: 'boundary-apron', axis: 'x', lee: 1,
    knots: [
      [-84, 603, 30, 0, .75], [-60, 590, 48, .48, .95],
      [-42, 581, 42, .48, .94], [-25, 572, 48, .82, .98],
      [-9, 558, 42, .50, .96], [4, 549, 48, .84, .98],
      [23, 535, 30, 0, .75],
    ],
  },
];

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// A monotone Hermite centerline has one shared tangent at each station. Width
// and strength interpolate with zero endpoint derivatives, so both the joins
// and compact support are C1. Tangents are precomputed once, never per sample.
const bands = SHARPTAIL_VEGETATION_BANDS.map(band => ({
  ...band,
  scrubWidths: band.knots.map(knot => Math.max(8, knot[2] * .23)),
  litterWidths: band.knots.map(knot => Math.max(7, Math.min(14, knot[2] * .18))),
  tangents: band.knots.map((knot, i, knots) => {
    if (i === 0) return (knots[1][1] - knot[1]) / (knots[1][0] - knot[0]);
    if (i === knots.length - 1) return (knot[1] - knots[i - 1][1]) / (knot[0] - knots[i - 1][0]);
    const left = (knot[1] - knots[i - 1][1]) / (knot[0] - knots[i - 1][0]);
    const right = (knots[i + 1][1] - knot[1]) / (knots[i + 1][0] - knot[0]);
    if (left * right <= 0) return 0;
    return 2 * left * right / (left + right);
  }),
}));

function center(a: number, b: number, ma: number, mb: number, span: number, t: number): number {
  const tt = t * t, ttt = tt * t;
  return (2 * ttt - 3 * tt + 1) * a + (ttt - 2 * tt + t) * ma * span
    + (-2 * ttt + 3 * tt) * b + (ttt - tt) * mb * span;
}

function compact(v: number): number {
  if (Math.abs(v) >= 1) return 0;
  const edge = 1 - v * v;
  return edge * edge;
}

/** Allocation-free, deterministic visual masks. Smooth union retains continuous
 * derivatives where the branch overlaps its parent; a max() union would leave
 * a visible crease. All masks are identically zero outside this local draw. */
export function sampleSharptailVegetationBands(x: number, y: number, out: SharptailVegetationBands): void {
  out.scrub = 0; out.grass = 0; out.litter = 0;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= SHARPTAIL_VEGETATION_BAND_BOUNDS.minX || x >= SHARPTAIL_VEGETATION_BAND_BOUNDS.maxX
    || y <= SHARPTAIL_VEGETATION_BAND_BOUNDS.minY || y >= SHARPTAIL_VEGETATION_BAND_BOUNDS.maxY) return;
  for (const band of bands) {
    const along = band.axis === 'x' ? x : y;
    const cross = band.axis === 'x' ? y : x;
    const knots = band.knots, first = knots[0][0], last = knots[knots.length - 1][0];
    if (along <= first || along >= last) continue;
    let i = 0;
    while (along > knots[i + 1][0]) i++;
    const a = knots[i], b = knots[i + 1], span = b[0] - a[0];
    const t = (along - a[0]) / span, s = smooth(t);
    const c = center(a[1], b[1], band.tangents[i], band.tangents[i + 1], span, t);
    const halfWidth = lerp(a[2], b[2], s) * .5;
    const v = (cross - c) / halfWidth;
    if (Math.abs(v) >= 1) continue;
    const end = smooth(Math.min(1, (along - first) / 16, (last - along) / 16));
    const grass = compact(v) * end * lerp(a[4], b[4], s);
    const scrubHalf = lerp(band.scrubWidths[i], band.scrubWidths[i + 1], s) * .5;
    const scrub = compact((cross - c) / scrubHalf) * end * lerp(a[3], b[3], s);
    // Spent stems lie along an unequal lee fringe, not a uniform ring around
    // every shrub. Its support remains inside the same grass footprint.
    const litterHalf = lerp(band.litterWidths[i], band.litterWidths[i + 1], s) * .5;
    const litter = compact((cross - c - band.lee * scrubHalf * .65) / litterHalf) * end * .62;
    out.grass += (1 - out.grass) * grass;
    out.scrub += (1 - out.scrub) * scrub;
    out.litter += (1 - out.litter) * litter;
  }
}

export interface SharptailVegetationBandAnchor {
  readonly band: string;
  readonly x: number;
  readonly y: number;
  /** Full support width along crossX/crossY, not a plant's physical size. */
  readonly width: number;
  readonly crossX: number;
  readonly crossY: number;
}

/** Stable authoring anchors every ~8 yards along each ribbon. These are guides
 * for distributed stand placement, not compulsory centered shrubs; consumers
 * sample the shared mask after lateral jitter and retain existing clearances. */
export const SHARPTAIL_VEGETATION_BAND_ANCHORS: readonly SharptailVegetationBandAnchor[] = bands.flatMap(band => {
  const anchors: SharptailVegetationBandAnchor[] = [];
  const knots = band.knots;
  let traveled = 8, previousAlong = knots[0][0], previousCross = knots[0][1];
  for (let along = knots[0][0] + 2; along < knots[knots.length - 1][0]; along += 2) {
    let i = 0;
    while (along > knots[i + 1][0]) i++;
    const a = knots[i], b = knots[i + 1], span = b[0] - a[0], t = (along - a[0]) / span;
    const cross = center(a[1], b[1], band.tangents[i], band.tangents[i + 1], span, t);
    traveled += Math.hypot(along - previousAlong, cross - previousCross);
    previousAlong = along; previousCross = cross;
    if (traveled < 8 || along - knots[0][0] < 16 || knots[knots.length - 1][0] - along < 16) continue;
    traveled = 0;
    anchors.push({
      band: band.id, x: band.axis === 'x' ? along : cross, y: band.axis === 'x' ? cross : along,
      width: lerp(a[2], b[2], smooth(t)),
      crossX: band.axis === 'x' ? 0 : 1, crossY: band.axis === 'x' ? 1 : 0,
    });
  }
  return anchors;
});
