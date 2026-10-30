/**
 * Chukar Ridge as authored data: a Snake River / Owyhee canyon wall you climb.
 *
 * The land is one wall profile (the stratigraphy: river, inner gorge, the
 * breaks, three basalt rim bands each with a talus apron below and a bench
 * above, the rim flat) laid across the ground by a "wall coordinate": yards
 * up-wall from the river's edge. Drainages lower that coordinate along their
 * thalwegs and crests raise it, so every rim band wraps around a draw head or
 * a spur nose at the same elevation, the way horizontal basalt flows do.
 * Where a draw floor or an authored break crosses a rim, the rim face softens
 * into a steep walkable chute: the easy routes up.
 *
 * Coordinates are property yards (x east, y south); heights are metres.
 * World: 2,200 x 1,400 yd. The river runs east-west below the south fence.
 */
import { FeatureLine, type LineHit, TiledHeightCache, WallProfile, isoLines, smoothstep, valueNoise } from './featureLandform';
import type { Vec2 } from './types';

export const CHUKAR_WORLD = { x: 0, y: 0, w: 2200, h: 1400 } as const;

/** River centreline (off-property, south), yards. */
export function chukarRiverY(x: number): number {
  return 1650 + 34 * Math.sin(x * .0021 + .6) + 18 * Math.sin(x * .0057 + 2.1);
}
export const CHUKAR_RIVER_HALF_WIDTH = 34;
/** Water surface, metres: just over the gravel floor. */
export const CHUKAR_RIVER_LEVEL = -69.3;

/** The wall, from the river's edge up. Widths are wall yards. */
export const CHUKAR_WALL = new WallProfile({ s: 0, h: -70 }, [
  { kind: 'floor', id: 'river-floor', width: 40, rise: 2 },
  { kind: 'slope', id: 'inner-gorge', width: 65, rise: 28 },
  { kind: 'talus', id: 'gorge-talus', width: 13, rise: 5 },
  { kind: 'rim', id: 'gorge-rim', width: 3, rise: 11 },
  { kind: 'bench', id: 'road-bench', width: 79, rise: 9 },
  { kind: 'slope', id: 'river-breaks', width: 440, rise: 56 },
  { kind: 'talus', id: 'lower-talus', width: 22, rise: 8 },
  { kind: 'rim', id: 'lower-rim', width: 3, rise: 10 },
  { kind: 'bench', id: 'lower-bench', width: 100, rise: 4 },
  { kind: 'slope', id: 'lower-cheat', width: 175, rise: 60 },
  { kind: 'talus', id: 'middle-talus', width: 26, rise: 10 },
  { kind: 'rim', id: 'middle-rim', width: 3.5, rise: 14 },
  { kind: 'bench', id: 'high-bench', width: 190, rise: 7 },
  { kind: 'slope', id: 'upper-cheat', width: 135, rise: 42 },
  { kind: 'talus', id: 'upper-talus', width: 22, rise: 7 },
  { kind: 'rim', id: 'upper-rim', width: 3, rise: 12 },
  { kind: 'flat', id: 'rim-flat', width: 500, rise: 8 },
], { step: .25, sharpBlur: 1.1, softBlur: 16, tail: 3000 });

/** The rim bands that carry basalt modules, bottom to top. */
export const CHUKAR_RIM_IDS = ['lower-rim', 'middle-rim', 'upper-rim'] as const;
export type ChukarRimId = typeof CHUKAR_RIM_IDS[number];

interface DrawVertex { x: number; y: number; /** Incision below the local wall, wall yards. */ depth: number; half: number }
interface Draw { id: string; line: FeatureLine<DrawVertex>; /** Rim faces soften within this many yards of the thalweg. */ breakReach: number }
const draw = (id: string, vertices: [number, number, number, number][], breakReach = 26): Draw => {
  const v = vertices.map(([x, y, depth, half]) => ({ x, y, depth, half }));
  return { id, breakReach, line: new FeatureLine(v, Math.max(...v.map(p => p.half)) + 4) };
};

/**
 * Drainages, as thalwegs with an incision depth (wall yards below the
 * surrounding wall) and a half-width. A rim band reaches up a draw about as
 * far as the draw is deep there, the way contour V's point upstream. Spring
 * Creek is the big side canyon; Sage and Juniper draws cut the west wall;
 * the gullies furrow the breaks and cheat slopes.
 */
export const CHUKAR_DRAWS: readonly Draw[] = [
  draw('spring-creek', [
    [2010, -120, 40, 200], [1950, 140, 260, 260], [1860, 380, 420, 290], [1760, 600, 470, 280],
    [1620, 820, 430, 250], [1430, 990, 300, 210], [1270, 1140, 190, 170], [1200, 1330, 90, 130], [1175, 1660, 30, 100],
  ], 44),
  draw('sage-draw', [
    [760, 120, 10, 110], [735, 330, 110, 150], [700, 560, 165, 165], [665, 800, 170, 160],
    [630, 1040, 140, 140], [600, 1270, 80, 110], [585, 1480, 30, 80],
  ], 40),
  draw('juniper-draw', [
    [300, 200, 10, 90], [285, 420, 95, 120], [255, 650, 120, 120], [220, 900, 105, 105], [185, 1150, 60, 85], [165, 1420, 15, 60],
  ], 34),
  draw('cabin-gully', [[905, 600, 8, 34], [915, 790, 55, 40], [930, 1030, 50, 40], [950, 1270, 34, 34], [965, 1440, 6, 26]], 0),
  draw('hogback-gully', [[1300, 560, 8, 30], [1310, 760, 55, 36], [1318, 900, 30, 30]], 0),
  draw('west-gully', [[440, 760, 8, 30], [432, 980, 48, 36], [418, 1200, 40, 32], [405, 1420, 8, 26]], 0),
  draw('mesa-gully', [[1980, 1010, 8, 28], [2010, 1200, 46, 34], [2030, 1400, 26, 28]], 0),
];

interface CrestVertex { x: number; y: number; /** Lift, or a mesa's target wall coordinate. */ lift: number; half: number }
interface Crest { id: string; line: FeatureLine<CrestVertex>; /** A mesa holds one level; a spur adds lift. */ mesa: boolean }
const crest = (id: string, vertices: [number, number, number, number][], mesa = false): Crest => {
  const v = vertices.map(([x, y, lift, half]) => ({ x, y, lift, half }));
  return { id, mesa, line: new FeatureLine(v, Math.max(...v.map(p => p.half)) + 4) };
};

/** Spurs push the wall coordinate out along their crests, so rims wrap their
 * noses; a mesa raises its ground to one bench level with rims all round. */
export const CHUKAR_CRESTS: readonly Crest[] = [
  crest('hogback', [[1190, 330, 40, 160], [1165, 560, 120, 165], [1125, 820, 135, 150], [1070, 1070, 100, 135], [1030, 1330, 50, 115]]),
  // Promontories hold their bench out over the slope below, rims on three sides.
  crest('castle-point', [[1006, 690, 1000, 56], [996, 745, 1000, 62], [984, 790, 1000, 48]], true),
  crest('west-point', [[478, 380, 1335, 40], [470, 430, 1335, 46], [466, 470, 1335, 38]], true),
  // A basalt spur noses down the breaks to the river road, so from the truck
  // the canyon wall stands right over you: the lower rim wraps its nose a
  // short walk up, the cheat face and the higher rims stack behind it.
  crest('road-spur', [[515, 960, 120, 120], [505, 1120, 260, 125], [494, 1250, 340, 95]]),
  // East of Spring Creek the wall rises again as a long ridge; its flank
  // above the creek's lower reach is the shaded north face.
  crest('east-ridge', [[2400, 440, 140, 270], [2160, 730, 230, 290], [1960, 980, 260, 270], [1790, 1170, 210, 230], [1660, 1350, 110, 180]]),
];

/** Authored breaks in the rims beyond the draw floors: cattle-trail chutes. */
export const CHUKAR_BREAKS: readonly { x: number; y: number; radius: number }[] = [];

const warpNoise = valueNoise(7701), breaksNoise = valueNoise(7717), hummockNoise = valueNoise(7723), rimNoise = valueNoise(7731), rillNoise = valueNoise(7737);
/** Slope bands that carry rills: the long cheat slopes, the breaks and the talus. */
const RILL_BANDS = ['river-breaks', 'lower-talus', 'lower-cheat', 'middle-talus', 'upper-cheat', 'upper-talus'].map(id => CHUKAR_WALL.band(id));
const RILL_DEPTH = 1.5;
const hit: LineHit = { distance: 0, t: 0, segment: 0, side: 0 };

export interface ChukarWallSample {
  /** Wall coordinate after drainages and crests. */
  s: number;
  /** 0 intact rim, 1 fully broken into a walkable chute. */
  broken: number;
  /** 0..1 nearness to a drainage floor (a draw or the creek bottom). */
  draw: number;
  /** Which drainage, if any, contributed `draw`. */
  drawId: string | null;
  /** 0..1 on a crest, spur or mesa. */
  crest: number;
}

/** Wall coordinate before features: yards up-wall from the river's edge,
 * meandered so the rims bay in and out across the property. */
function baseWall(x: number, y: number): number {
  const river = chukarRiverY(x);
  if (y > river) return (y - river - CHUKAR_RIVER_HALF_WIDTH) * 1.45; // the steeper far wall
  const s = river - y - CHUKAR_RIVER_HALF_WIDTH;
  // Near the river the walls follow its line; up-wall the contours wander.
  const freedom = smoothstep(160, 520, s);
  const meander = 40 * Math.sin(x * .0024 + 1.1) + 42 * (warpNoise(x * .0019 + 3.1, y * .0019 + 5.2) - .5) * 2
    + 14 * (warpNoise(x * .007 + 11, y * .007 + 17) - .5) * 2;
  return s + meander * freedom;
}

export function chukarWallAt(x: number, y: number, out: ChukarWallSample): ChukarWallSample {
  let s = baseWall(x, y);
  let lift = 0, crestAmount = 0, landmark = 0;
  for (const c of CHUKAR_CRESTS) {
    if (!c.line.nearest(x, y, hit)) continue;
    const half = c.line.value(hit, 'half'), r = hit.distance / half;
    if (c.mesa && r < 1.6) landmark = Math.max(landmark, 1 - smoothstep(1.1, 1.6, r));
    if (r >= 1) continue;
    if (c.mesa) {
      // A level top to about half the half-width, then flanks falling away.
      const hold = 1 - smoothstep(.5, 1, r);
      lift = Math.max(lift, (c.line.value(hit, 'lift') - s) * hold);
      crestAmount = Math.max(crestAmount, hold);
      // The named promontories keep their rims whole: no weathered gaps.
      landmark = Math.max(landmark, 1 - smoothstep(1.1, 1.6, r));
    } else {
      const shape = (1 - r * r) * (1 - r * r);
      lift = Math.max(lift, c.line.value(hit, 'lift') * shape);
      crestAmount = Math.max(crestAmount, shape);
    }
  }
  s += lift;
  // Drainages cut; the deepest incision wins.
  let incision = 0, drawAmount = 0, drawId: string | null = null, broken = 0;
  for (const d of CHUKAR_DRAWS) {
    if (!d.line.nearest(x, y, hit)) continue;
    const half = d.line.value(hit, 'half'), r = hit.distance / half;
    if (r >= 1) continue;
    // A narrow flat floor, then walls rising to the surrounding wall.
    const cut = d.line.value(hit, 'depth') * (1 - smoothstep(.06, 1, r));
    if (cut > incision) { incision = cut; drawId = d.id; }
    drawAmount = Math.max(drawAmount, 1 - smoothstep(.04, .45, r));
    if (d.breakReach > 0) broken = Math.max(broken, 1 - smoothstep(d.breakReach * .55, d.breakReach, hit.distance));
  }
  s -= incision;
  for (const b of CHUKAR_BREAKS) {
    const dx = x - b.x, dy = y - b.y;
    if (Math.abs(dx) > b.radius || Math.abs(dy) > b.radius) continue;
    broken = Math.max(broken, 1 - smoothstep(b.radius * .5, b.radius, Math.hypot(dx, dy)));
  }
  // Basalt weathers unevenly: stretches of every rim slump into rubble.
  const decay = smoothstep(.5, .6, rimNoise(x * .012 + 2, y * .012 + 9)) * (1 - landmark);
  out.s = s; out.broken = Math.max(broken, decay); out.draw = drawAmount; out.drawId = drawAmount > 0 ? drawId : null; out.crest = crestAmount;
  return out;
}

const wallSample: ChukarWallSample = { s: 0, broken: 0, draw: 0, drawId: null, crest: 0 };
const breaksBand = CHUKAR_WALL.band('river-breaks');

/** The analytic surface. Ordinary reads go through chukarHeight (cached). */
export function chukarAnalyticHeight(x: number, y: number): number {
  const w = chukarWallAt(x, y, wallSample);
  let h = CHUKAR_WALL.height(w.s, w.broken);
  // The breaks: knobs and swales between the gullies, strongest mid-slope.
  const relief = smoothstep(breaksBand.from - 10, breaksBand.from + 50, w.s) * (1 - smoothstep(breaksBand.to - 70, breaksBand.to - 15, w.s));
  if (relief > 0) h += relief * ((breaksNoise(x * .011, y * .011) - .5) * 9 + (breaksNoise(x * .029 + 40, y * .029 + 40) - .5) * 3.2);
  // Rills furrow the slopes down the fall line, so they never read as dunes.
  let rill = 0;
  for (const band of RILL_BANDS) rill = Math.max(rill, smoothstep(band.from - 8, band.from + 12, w.s) * (1 - smoothstep(band.to - 12, band.to - 1, w.s)));
  if (rill > 0) {
    const n = rillNoise(x * .05 + (y * .004), y * .009), ridge = 1 - Math.abs(n * 2 - 1);
    h -= rill * RILL_DEPTH * ridge * ridge * ridge;
  }
  // Low hummocks everywhere keep benches from reading as poured floors.
  h += (hummockNoise(x * .06, y * .06) - .5) * .45;
  return h;
}

/** Cached property surface: a 2 yd grid over the parcel plus a margin. */
const CACHE_MARGIN = 96;
const cache = new TiledHeightCache({ x: CHUKAR_WORLD.x - CACHE_MARGIN, y: CHUKAR_WORLD.y - CACHE_MARGIN, w: CHUKAR_WORLD.w + CACHE_MARGIN * 2, h: CHUKAR_WORLD.h + CACHE_MARGIN * 2 }, 2, chukarAnalyticHeight);

export function chukarHeight(x: number, y: number): number {
  return cache.contains(x, y) ? cache.height(x, y) : chukarAnalyticHeight(x, y);
}

export interface ChukarRimModule {
  rim: ChukarRimId;
  /** Property yards, on the rim's cliff mid-line. */
  x: number; y: number;
  /** Unit direction out of the cliff (downhill), property axes. */
  nx: number; ny: number;
  /** Bench edge above and talus foot below, metres. */
  top: number; foot: number;
  /** 0..1 how weathered this stretch is: lower, more broken columns. */
  decay: number;
  /** Yards a buttress stands out from the cliff line over its talus. */
  jut: number;
  /** Stable per-module variation in [0, 1). */
  variant: number;
}

/** Yards between basalt modules along a rim. */
export const CHUKAR_RIM_STEP = 4.2;
const RIM_EXTENT_MARGIN = 140; // rims drawn this far beyond the fence
const RIM_BREAK_LIMIT = .35; // more broken than this is a chute, not rimrock
const RIM_JUT = 1.75; // yards a buttress can stand proud of the cliff line
const jutNoise = valueNoise(7743);

let rimCache: ChukarRimModule[] | null = null;
/**
 * The rimrock: modules along every rim band's mid-line wherever the rim is
 * intact, inside the property and a margin beyond its fence. Shared by the
 * renderer (basalt columns), collision (player and dog), shots and the map.
 */
export function chukarRimModules(): readonly ChukarRimModule[] {
  if (rimCache) return rimCache;
  const out: ChukarRimModule[] = [];
  const bounds = { x: CHUKAR_WORLD.x - RIM_EXTENT_MARGIN, y: CHUKAR_WORLD.y - RIM_EXTENT_MARGIN, w: CHUKAR_WORLD.w + RIM_EXTENT_MARGIN * 2, h: CHUKAR_WORLD.h + RIM_EXTENT_MARGIN * 2 };
  const sample: ChukarWallSample = { s: 0, broken: 0, draw: 0, drawId: null, crest: 0 };
  const wall = (x: number, y: number) => chukarWallAt(x, y, sample).s;
  for (const id of CHUKAR_RIM_IDS) {
    const band = CHUKAR_WALL.band(id);
    for (const line of isoLines(wall, bounds, 3, (band.from + band.to) / 2)) {
      let carry = 0;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i], len = Math.hypot(b.x - a.x, b.y - a.y);
        let t = carry;
        while (t < len) {
          const x = a.x + (b.x - a.x) * t / len, y = a.y + (b.y - a.y) * t / len;
          chukarWallAt(x, y, sample);
          if (sample.broken < RIM_BREAK_LIMIT) {
            const decay = sample.broken / RIM_BREAK_LIMIT;
            // Downhill is where the wall coordinate falls.
            const gx = wall(x + 1, y) - wall(x - 1, y), gy = wall(x, y + 1) - wall(x, y - 1), g = Math.hypot(gx, gy) || 1;
            const hash = Math.imul(Math.round(x * 7) ^ Math.imul(Math.round(y * 13), 0x9e3779b1), 0x85ebca6b) >>> 0;
            const jut = RIM_JUT * Math.max(0, jutNoise(x * .064 + 31, y * .064 + 17) - .45) / .55;
            out.push({ rim: id, x, y, nx: -gx / g, ny: -gy / g, top: band.top, foot: band.base, decay, jut, variant: (hash % 1000) / 1000 });
          }
          t += CHUKAR_RIM_STEP;
        }
        carry = t - len;
      }
    }
  }
  rimCache = out;
  return out;
}

let rimIndex: Map<number, ChukarRimModule[]> | null = null;
const RIM_BUCKET = 24;
/** Rim modules within `radius` yards of a point, through a bucket index. */
export function chukarRimModulesNear(x: number, y: number, radius: number): ChukarRimModule[] {
  if (!rimIndex) {
    rimIndex = new Map();
    for (const m of chukarRimModules()) {
      const key = Math.floor(m.y / RIM_BUCKET) * 8192 + Math.floor(m.x / RIM_BUCKET);
      (rimIndex.get(key) ?? rimIndex.set(key, []).get(key)!).push(m);
    }
  }
  const out: ChukarRimModule[] = [];
  for (let by = Math.floor((y - radius) / RIM_BUCKET); by <= Math.floor((y + radius) / RIM_BUCKET); by++)
    for (let bx = Math.floor((x - radius) / RIM_BUCKET); bx <= Math.floor((x + radius) / RIM_BUCKET); bx++)
      for (const m of rimIndex.get(by * 8192 + bx) ?? []) if (Math.hypot(m.x - x, m.y - y) <= radius) out.push(m);
  return out;
}

/** Collision footprint of one rim module, yards: a disc set a little out from
 * the cliff mid-line so the bench edge above stays walkable to the lip. */
export const CHUKAR_RIM_BLOCK_RADIUS = 2.6;
const BLOCK_OFFSET = .4;
let blockerCache: { x: number; y: number; radius: number }[] | null = null;
export function chukarRimBlockers(): readonly { x: number; y: number; radius: number }[] {
  return blockerCache ??= chukarRimModules().map(m => ({ x: m.x + m.nx * (BLOCK_OFFSET + m.jut), y: m.y + m.ny * (BLOCK_OFFSET + m.jut), radius: CHUKAR_RIM_BLOCK_RADIUS }));
}

/** Solid basalt underfoot: inside a rim module's footprint, grown by an
 * optional margin (yards) for "somewhere a dog can stand beside". */
export function chukarSolidAt(x: number, y: number, margin = 0): boolean {
  if (!rimIndex) chukarRimModulesNear(0, 0, 0);
  const reach = CHUKAR_RIM_BLOCK_RADIUS + margin + 2.5, limit = CHUKAR_RIM_BLOCK_RADIUS + margin;
  // Walk the bucket index directly: called per runner step and per fall.
  for (let by = Math.floor((y - reach) / RIM_BUCKET); by <= Math.floor((y + reach) / RIM_BUCKET); by++)
    for (let bx = Math.floor((x - reach) / RIM_BUCKET); bx <= Math.floor((x + reach) / RIM_BUCKET); bx++) {
      const bucket = rimIndex!.get(by * 8192 + bx);
      if (!bucket) continue;
      for (const m of bucket) {
        const dx = x - (m.x + m.nx * (BLOCK_OFFSET + m.jut)), dy = y - (m.y + m.ny * (BLOCK_OFFSET + m.jut));
        if (dx * dx + dy * dy < limit * limit) return true;
      }
    }
  return false;
}

/** Talus apron beneath a rim: 1 at the cliff foot fading out at the toe. */
export function chukarTalusAt(s: number): number {
  let best = 0;
  for (const id of ['gorge-talus', 'lower-talus', 'middle-talus', 'upper-talus']) {
    const band = CHUKAR_WALL.band(id);
    if (s < band.from - 14 || s > band.to + 4) continue;
    best = Math.max(best, smoothstep(band.from - 14, band.to - 3, s) * (1 - smoothstep(band.to + 1.5, band.to + 4, s)));
  }
  return best;
}

/** The nearest spot on a named band of the wall, searching around a point. */
export function chukarPointOnBand(near: Vec2, band: string, search = 160): Vec2 {
  const target = CHUKAR_WALL.band(band), mid = (target.from + target.to) / 2;
  const sample: ChukarWallSample = { s: 0, broken: 0, draw: 0, drawId: null, crest: 0 };
  let best = near, bestScore = Infinity;
  for (let dy = -search; dy <= search; dy += 4) for (let dx = -search * .25; dx <= search * .25; dx += 4) {
    const s = chukarWallAt(near.x + dx, near.y + dy, sample).s;
    const score = Math.abs(s - mid) + Math.hypot(dx, dy) * .05;
    if (score < bestScore) { bestScore = score; best = { x: near.x + dx, y: near.y + dy }; }
  }
  return best;
}
