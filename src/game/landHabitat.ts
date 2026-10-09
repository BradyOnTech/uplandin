/**
 * Habitat made from the land, behind one query seam per ground.
 *
 * A ground with a land habitat model answers what cover grows at a point and
 * how well each bird use (roost, feed, loaf, escape, water) suits it. The
 * cover-map renderer, the survey map, bird placement and the derived cover
 * rectangles (the `patches` view dog.ts and birds.ts still read during the
 * migration) all come from the same grid. Grounds without a model answer
 * null and keep their authored rectangles.
 *
 * Bird placement reads the land, the hour, the month and (when known) the
 * weather, and is seeded per hunt: coveys sit in the hunt areas that suit
 * them today, never staged in front of the truck, with one always within a
 * fair walk of the chosen entry.
 */
import type { AreaConfig, DropPoint } from './areas';
import { CHUKAR_WORLD, chukarAnalyticHeight, chukarSolidAt } from './chukarCanyon';
import { CHUKAR_GUZZLER, CHUKAR_SPRING_SEAM, chukarGroundFrom, type ChukarGround } from './chukarHabitat';
import type { Condition } from './conditions';
import type { Rect } from './field';
import { smoothstep } from './featureLandform';
import { COVER_ROLES, huntAreaModel, type CoverRole } from './huntAreas';
import './chukarRidge'; // registers Chukar Ridge's hunt areas
import { monthOf, type Month } from './season';
import type { HuntTime } from './timeOfDay';
import type { RNG, Vec2 } from './types';

export interface LandHabitat {
  world: Rect;
  /** Grid cell, yards. */
  cell: number;
  cols: number;
  rows: number;
  covers: readonly string[];
  /** Index into `covers` per cell. */
  cover: Uint8Array;
  /** Land suitability, 0..1, per use and cell. */
  role: Record<CoverRole, Float32Array>;
  /** 1 where birds and dogs can stand (not inside rimrock). */
  open: Uint8Array;
  /** Height at each cell centre, metres. */
  height: Float32Array;
  /** Hunt area index per cell, -1 outside. */
  area: Int8Array;
  /** 0..1 how much a cell is where birds sit (the derived cover view). */
  cover01: Float32Array;
}

const models = new Map<string, LandHabitat | null>();

export function landHabitat(area: Pick<AreaConfig, 'id'>): LandHabitat | null {
  if (!models.has(area.id)) models.set(area.id, area.id === 'chukar-ridge' ? buildChukarHabitat(area) : null);
  return models.get(area.id)!;
}

function cellIndex(h: LandHabitat, x: number, y: number): number {
  const i = Math.floor((x - h.world.x) / h.cell), j = Math.floor((y - h.world.y) / h.cell);
  return i < 0 || j < 0 || i >= h.cols || j >= h.rows ? -1 : j * h.cols + i;
}

export function habitatClassAt(area: Pick<AreaConfig, 'id'>, x: number, y: number): string | null {
  const h = landHabitat(area);
  if (!h) return null;
  const k = cellIndex(h, x, y);
  return k < 0 ? null : h.covers[h.cover[k]];
}

/** Land suitability of one bird use at a point (0..1), or null without a model. */
export function habitatRoleAt(area: Pick<AreaConfig, 'id'>, role: CoverRole, x: number, y: number): number | null {
  const h = landHabitat(area);
  if (!h) return null;
  const k = cellIndex(h, x, y);
  return k < 0 ? 0 : h.role[role][k];
}

// ---------------------------------------------------------------- Chukar ---

/** Habitat grid resolution, yards. */
const CHUKAR_CELL = 8;
const CHUKAR_COVERS = ['rimrock', 'talus', 'sage', 'cheat', 'bunchgrass', 'seep', 'bare'] as const;

function buildChukarHabitat(area: Pick<AreaConfig, 'id'>): LandHabitat {
  const world = { ...CHUKAR_WORLD }, cell = CHUKAR_CELL;
  const cols = Math.ceil(world.w / cell), rows = Math.ceil(world.h / cell), n = cols * rows;
  // Heights at cell corners from the analytic surface: cheap, and it never
  // forces the renderer's fine height cache to fill just to stock birds.
  const nodes = new Float32Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) nodes[j * (cols + 1) + i] = chukarAnalyticHeight(world.x + i * cell, world.y + j * cell);
  const cover = new Uint8Array(n), open = new Uint8Array(n), height = new Float32Array(n);
  const ground: ChukarGround = { cover: 'cheat', sage: 0, cheat: 0, bunchgrass: 0, talus: 0, rimrock: 0, seep: 0, s: 0, band: '', draw: 0, crest: 0, southness: 0 };
  const role = Object.fromEntries(COVER_ROLES.map(r => [r, new Float32Array(n)])) as Record<CoverRole, Float32Array>;
  const rock = new Uint8Array(n), samples: { cheat: number; sage: number; bunch: number; talus: number; seep: number; level: number; flat: number; southness: number; heightT: number }[] = [];
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, a = nodes[j * (cols + 1) + i], b = nodes[j * (cols + 1) + i + 1], c = nodes[(j + 1) * (cols + 1) + i], d = nodes[(j + 1) * (cols + 1) + i + 1];
    const gx = (b + d - a - c) / (2 * cell * .9144), gy = (c + d - a - b) / (2 * cell * .9144), slope = Math.hypot(gx, gy);
    const x = world.x + (i + .5) * cell, y = world.y + (j + .5) * cell;
    chukarGroundFrom(x, y, slope, gx, gy, ground);
    height[k] = (a + b + c + d) / 4; lo = Math.min(lo, height[k]); hi = Math.max(hi, height[k]);
    cover[k] = CHUKAR_COVERS.indexOf(ground.cover);
    rock[k] = ground.rimrock > .5 || ground.talus > .45 ? 1 : 0;
    open[k] = ground.rimrock > .5 ? 0 : 1;
    samples.push({ cheat: ground.cheat, sage: ground.sage, bunch: ground.bunchgrass, talus: ground.talus, seep: ground.seep,
      level: 1 - smoothstep(.07, .3, slope), flat: ground.band === 'rim-flat' ? 1 : 0, southness: ground.southness, heightT: 0 });
  }
  // Escape cover is the rimrock and talus; distance to it (yards) by a chamfer pass.
  const escape = chamfer(rock, cols, rows, cell);
  const water = new Float32Array(n);
  const waterPoints: Vec2[] = [...CHUKAR_SPRING_SEAM, { x: CHUKAR_GUZZLER.x, y: CHUKAR_GUZZLER.y }];
  for (let k = 0; k < n; k++) {
    const x = world.x + (k % cols + .5) * cell, y = world.y + (Math.floor(k / cols) + .5) * cell;
    let best = Infinity;
    for (const p of waterPoints) best = Math.min(best, Math.hypot(x - p.x, y - p.y));
    water[k] = 1 - smoothstep(20, 220, best);
  }
  for (let k = 0; k < n; k++) {
    const s = samples[k], nearRock = 1 - smoothstep(6, 70, escape[k]), up = (height[k] - lo) / (hi - lo || 1);
    if (!open[k]) continue;
    // Roost: on the talus and bench lips right by the rimrock, higher is better.
    role.roost[k] = Math.min(1, nearRock * (.55 + .45 * up) * (.6 + s.talus * .4));
    // Feed: cheatgrass (green after rain), the seam's green, the flat's edge.
    role.feed[k] = Math.min(1, s.cheat * .85 + s.seep * .7 + s.bunch * .25 + s.flat * s.sage * .25);
    // Loaf: level ground within a run of escape cover, sage or rim shade.
    role.loaf[k] = Math.min(1, s.level * (.35 + nearRock * .5) + s.sage * .2 + Math.max(0, -s.southness) * .2);
    // Escape: in or right beside the rocks, or steep broken ground.
    role.escape[k] = Math.min(1, s.talus * .7 + nearRock * .5);
    role.water[k] = Math.min(1, water[k] + s.seep * .5);
  }
  // Where birds sit: roost and escape cover, water, loafing ground and the
  // feeding ground within a short run of the rocks; not every open slope.
  const cover01 = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (!open[k]) continue;
    const nearRock = 1 - smoothstep(30, 120, escape[k]);
    cover01[k] = Math.max(role.roost[k], role.escape[k], role.water[k], role.loaf[k] * .9, role.feed[k] * .8 * nearRock, samples[k].sage * .85);
  }
  return { world, cell, cols, rows, covers: CHUKAR_COVERS, cover, role, open, height, area: areaIndices(area, world, cell, cols, rows), cover01 };
}

function areaIndices(area: Pick<AreaConfig, 'id'>, world: Rect, cell: number, cols: number, rows: number): Int8Array {
  const model = huntAreaModel(area), out = new Int8Array(cols * rows).fill(-1);
  if (!model) return out;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) out[j * cols + i] = model.indexAt(world.x + (i + .5) * cell, world.y + (j + .5) * cell);
  return out;
}

/** Two-pass chamfer distance (yards) to the nearest source cell. */
function chamfer(source: Uint8Array, cols: number, rows: number, cell: number): Float32Array {
  const d = new Float32Array(cols * rows).fill(1e6), diag = cell * Math.SQRT2;
  for (let k = 0; k < d.length; k++) if (source[k]) d[k] = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i;
    if (i > 0) d[k] = Math.min(d[k], d[k - 1] + cell);
    if (j > 0) { d[k] = Math.min(d[k], d[k - cols] + cell); if (i > 0) d[k] = Math.min(d[k], d[k - cols - 1] + diag); if (i < cols - 1) d[k] = Math.min(d[k], d[k - cols + 1] + diag); }
  }
  for (let j = rows - 1; j >= 0; j--) for (let i = cols - 1; i >= 0; i--) {
    const k = j * cols + i;
    if (i < cols - 1) d[k] = Math.min(d[k], d[k + 1] + cell);
    if (j < rows - 1) { d[k] = Math.min(d[k], d[k + cols] + cell); if (i < cols - 1) d[k] = Math.min(d[k], d[k + cols + 1] + diag); if (i > 0) d[k] = Math.min(d[k], d[k + cols - 1] + diag); }
  }
  return d;
}

// --------------------------------------------------- derived rectangles ---

/** Share of open ground the derived cover view keeps: the best of it. Like
 * the other grounds' cover (a fifth to a quarter), and patchy, so a runner
 * meets the end of its cover instead of roading across the property. */
const COVER_SHARE = .26;
/** Derived rectangles are merged on cells this many habitat cells wide. */
const RECT_BLOCK = 4;

const rects = new Map<string, Rect[]>();
/**
 * The `patches` view of a land habitat: rectangles over the cells good for
 * any bird use, excluding rock. Lets dog.ts and birds.ts keep reading
 * rectangles while placement and the renderer read the habitat itself.
 */
export function derivedCoverRects(area: Pick<AreaConfig, 'id'>): Rect[] {
  const cached = rects.get(area.id);
  if (cached) return cached;
  const h = landHabitat(area);
  if (!h) return [];
  const bc = Math.ceil(h.cols / RECT_BLOCK), br = Math.ceil(h.rows / RECT_BLOCK), on = new Uint8Array(bc * br);
  const scores = Array.from(h.cover01).filter((_, k) => h.open[k]).sort((a, b) => a - b);
  const threshold = scores[Math.floor(scores.length * (1 - COVER_SHARE))] ?? 1;
  for (let j = 0; j < br; j++) for (let i = 0; i < bc; i++) {
    let good = 0, total = 0;
    for (let b = 0; b < RECT_BLOCK; b++) for (let a = 0; a < RECT_BLOCK; a++) {
      const ci = i * RECT_BLOCK + a, cj = j * RECT_BLOCK + b;
      if (ci >= h.cols || cj >= h.rows) continue;
      const k = cj * h.cols + ci; total++;
      if (h.open[k] && h.cover01[k] >= threshold) good++;
    }
    on[j * bc + i] = total > 0 && good * 2 > total ? 1 : 0;
  }
  // Greedy maximal rectangles: extend each run down while rows match.
  const used = new Uint8Array(bc * br), out: Rect[] = [], size = h.cell * RECT_BLOCK;
  for (let j = 0; j < br; j++) for (let i = 0; i < bc; i++) {
    if (!on[j * bc + i] || used[j * bc + i]) continue;
    let w = 0;
    while (i + w < bc && on[j * bc + i + w] && !used[j * bc + i + w] && w < 8) w++;
    let hgt = 1;
    grow: while (j + hgt < br && hgt < 8) {
      for (let a = 0; a < w; a++) if (!on[(j + hgt) * bc + i + a] || used[(j + hgt) * bc + i + a]) break grow;
      hgt++;
    }
    for (let b = 0; b < hgt; b++) for (let a = 0; a < w; a++) used[(j + b) * bc + i + a] = 1;
    out.push({ x: h.world.x + i * size, y: h.world.y + j * size, w: Math.min(w * size, h.world.x + h.world.w - (h.world.x + i * size)), h: Math.min(hgt * size, h.world.y + h.world.h - (h.world.y + j * size)) });
  }
  rects.set(area.id, out);
  return out;
}

// ---------------------------------------------------------- placement ---

type RoleWeights = Record<CoverRole, number>;
const CHUKAR_HOURS: Record<HuntTime, RoleWeights> = {
  dawn: { roost: .45, feed: .35, water: .1, loaf: .05, escape: .05 },
  morning: { roost: .05, feed: .55, water: .15, loaf: .2, escape: .05 },
  noon: { roost: .05, feed: .1, water: .15, loaf: .5, escape: .2 },
  evening: { roost: .15, feed: .45, water: .25, loaf: .15, escape: 0 },
  lastlight: { roost: .5, feed: .25, water: .15, loaf: .1, escape: 0 },
};
const CHUKAR_MONTHS: Record<Month, Partial<RoleWeights>> = {
  September: { water: 2.2, feed: .9 },
  October: { water: 1.3 },
  November: { feed: 1.15, water: .8 },
  December: { water: .5, escape: 1.3, feed: 1.1 },
  January: { water: .5, escape: 1.3, feed: 1.1 },
};
const CHUKAR_WEATHER: Partial<Record<Condition, Partial<RoleWeights>>> = {
  hot: { water: 1.8, loaf: 1.3 },
  rain: { escape: 1.2 },
  snow: { escape: 1.3, feed: 1.2 },
};

export interface PlacementContext {
  timeOfDay?: HuntTime;
  /** Career week; quick hunts are timeless and read as mid-October. */
  week?: number;
  condition?: Condition;
}

/** Spacing between coveys' home cover, yards. */
const COVEY_SPACING = 64;
/** Nothing is staged closer than this to the chosen truck, yards. */
const TRUCK_CLEAR = 150;
/** The first covey sits within this walking reach of the entry, yards, out
 * ahead and near a route from it; the second within the wider reach. */
const ENTRY_REACH = 330;
const SECOND_REACH = 520;
/** Coveys favour ground a route passes within this many yards of. */
const ROUTE_REACH = 110;
/** Coveys keep this far (yards) inside the fence: a runner pressed against
 * a boundary slides along it for minutes instead of holding or flushing. */
const EDGE_CLEAR = 70;
/** A Loaded field's coveys thin out past this walking reach, yards. */
const LOADED_REACH = 380;
/** Yards of walking each metre of climb is worth. */
const CLIMB_YARDS = 2.5;
const MAX_ANCHORS = 28;

/**
 * Covey home sites for a hunt, from the land. Index 0 is the entry covey:
 * within a fair walk of the chosen drop but never right in front of the
 * truck. The rest are a weighted draw over the property: hour, month and
 * weather weigh each bird use, the hunt areas tilt it, and the hunt's seed
 * leans each area up or down so two hunts find birds in different places.
 */
export function landDrivenAnchors(area: AreaConfig, drop: DropPoint, rng: RNG, context: PlacementContext = {}, spacingScale = 1): Vec2[] {
  const h = landHabitat(area);
  if (!h) return [];
  const model = huntAreaModel(area);
  const hours = CHUKAR_HOURS[context.timeOfDay ?? 'morning'];
  const month = CHUKAR_MONTHS[monthOf(context.week ?? 6)];
  const weather = context.condition ? CHUKAR_WEATHER[context.condition] ?? {} : {};
  const weights = Object.fromEntries(COVER_ROLES.map(r => [r, hours[r] * (month[r] ?? 1) * (weather[r] ?? 1)])) as RoleWeights;
  // Each hunt leans every area a different way.
  const lean = (model?.areas ?? []).map(() => Math.exp(.75 * gaussian(rng)));
  const dropHeight = h.height[cellIndex(h, drop.position.x, drop.position.y)] ?? 0;
  const candidates: { x: number; y: number; weight: number; reach: number; route: number; ahead: number }[] = [];
  const headingX = Math.cos(drop.heading), headingY = Math.sin(drop.heading);
  const cells = placementCells(area, h);
  for (let n = 0; n < cells.k.length; n++) {
    const k = cells.k[n], x = cells.x[n], y = cells.y[n];
    const plan = Math.hypot(x - drop.position.x, y - drop.position.y);
    if (plan < TRUCK_CLEAR + h.cell * .5) continue;
    const index = h.area[k], areaSpec = index >= 0 ? model?.areas[index] : undefined;
    let weight = 0;
    for (const r of COVER_ROLES) weight += weights[r] * h.role[r][k] * (.35 + .65 * (areaSpec?.uses[r] ?? .3));
    // Birds don't keep to trails, but a share of them live where the
    // routes run, so walking the trails is a fair way to hunt.
    const route = cells.route[n];
    weight *= (index >= 0 ? lean[index] : 1) * (.7 + .6 * rng()) * (.25 + .75 * (1 - smoothstep(30, ROUTE_REACH, route)));
    const reach = plan + Math.abs(h.height[k] - dropHeight) * CLIMB_YARDS;
    // A packed (Loaded) field fills the good cover within a walk of the
    // truck, near the routes, rather than spreading over the whole ground.
    if (spacingScale < 1) weight *= Math.exp(-reach / LOADED_REACH) * (1 - smoothstep(20, 90, route) * .7);
    if (weight <= 0) continue;
    candidates.push({ x: x + (rng() - .5) * h.cell * .6, y: y + (rng() - .5) * h.cell * .6, weight, reach,
      route, ahead: ((x - drop.position.x) * headingX + (y - drop.position.y) * headingY) / (plan || 1) });
  }
  const spacing = COVEY_SPACING * spacingScale, chosen: Vec2[] = [];
  const pick = (pool: typeof candidates, bias: (c: typeof candidates[number]) => number) => {
    let total = 0;
    const live = pool.filter(c => chosen.every(p => Math.hypot(p.x - c.x, p.y - c.y) >= spacing));
    for (const c of live) total += c.weight * bias(c);
    let roll = rng() * total;
    for (const c of live) { roll -= c.weight * bias(c); if (roll <= 0) return c; }
    return live.at(-1);
  };
  // The entry covey: good cover a fair walk out, ahead and near a route,
  // so the first cast of the day can find it without it being staged at
  // the tailgate. Each step relaxes the conditions if the land has none.
  for (const [reach, ahead, route] of [[ENTRY_REACH, .75, 60], [ENTRY_REACH * 1.25, .5, 90], [ENTRY_REACH * 1.6, 0, Infinity], [Infinity, -1, Infinity]]) {
    const near = candidates.filter(c => c.reach <= reach && c.ahead >= ahead && c.route <= route);
    const entry = near.length ? pick(near, c => .4 + .6 * (1 - Math.min(1, c.reach / reach))) : undefined;
    if (entry) { chosen.push({ x: entry.x, y: entry.y }); break; }
  }
  // A second covey within a longer walk, any direction.
  const second = pick(candidates.filter(c => c.reach <= SECOND_REACH), () => 1);
  if (second) chosen.push({ x: second.x, y: second.y });
  const target = Math.round(MAX_ANCHORS / Math.min(1, spacingScale));
  while (chosen.length < target) {
    const next = pick(candidates, () => 1);
    if (!next) break;
    chosen.push({ x: next.x, y: next.y });
  }
  return chosen;
}

interface PlacementCells { k: Int32Array; x: Float32Array; y: Float32Array; route: Float32Array }
const placementCache = new Map<string, PlacementCells>();
/** The cells a covey may call home on a ground, with their distance to the
 * nearest route: open, in the derived cover, off the fence and outside every
 * entry's safety ring. The same for every hunt, so built once. */
function placementCells(area: AreaConfig, h: LandHabitat): PlacementCells {
  const cached = placementCache.get(area.id);
  if (cached) return cached;
  const rects = derivedCoverRects(area), segments = area.trails.flatMap(t => t.points.slice(1).map((b, i) => [t.points[i], b] as const));
  const inRect = (x: number, y: number) => rects.some(r => x >= r.x + 4 && x <= r.x + r.w - 4 && y >= r.y + 4 && y <= r.y + r.h - 4);
  const keep: number[] = [], route: number[] = [];
  for (let k = 0; k < h.cols * h.rows; k++) {
    if (!h.open[k]) continue;
    const x = h.world.x + (k % h.cols + .5) * h.cell, y = h.world.y + (Math.floor(k / h.cols) + .5) * h.cell;
    if (x < h.world.x + EDGE_CLEAR || y < h.world.y + EDGE_CLEAR || x > h.world.x + h.world.w - EDGE_CLEAR || y > h.world.y + h.world.h - EDGE_CLEAR) continue;
    if (area.dropPoints.some(d => Math.hypot(x - d.position.x, y - d.position.y) < d.safetyRadius + 16) || !inRect(x, y)) continue;
    // A covey's home is a dog's reach clear of the rimrock, jitter and all.
    if (area.id === 'chukar-ridge' && chukarSolidAt(x, y, 4.5)) continue;
    let best = Infinity;
    for (const [a, b] of segments) {
      const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
    }
    keep.push(k); route.push(best);
  }
  const cells = { k: Int32Array.from(keep), x: Float32Array.from(keep, k => h.world.x + (k % h.cols + .5) * h.cell),
    y: Float32Array.from(keep, k => h.world.y + (Math.floor(k / h.cols) + .5) * h.cell), route: Float32Array.from(route) };
  placementCache.set(area.id, cells);
  return cells;
}

function gaussian(rng: RNG): number {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
