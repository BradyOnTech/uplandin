import { mulberry32 } from '../game/math';
import type { LandscapeModel } from '../game/landscape';
import { PROPERTY_PX_TO_M } from '../game/worldUnits';

/**
 * Region-true horizons for the four core grounds: the silhouettes the sky
 * system draws as camera-following rings beyond the property (sky.ts).
 *
 * Nothing here is placed against today's coordinates. Each region has a
 * profile (what its far country is made of, how high and how wide), and a
 * generator turns it into silhouettes with the ground's own terrain seed and
 * two facts read from the landform: where the property's edge runs lowest
 * (drainages leave there, so creek timber and the canyon's opening follow
 * them) and how much relief the edge carries. A bigger or reshaped ground
 * dresses its own horizon.
 *
 *   Sharptail: layered mixed-grass swells fading blue-grey, a windmill and
 *     one far shelterbelt.
 *   Quail: low rolling breaks with gullies and mesquite, creek timber where
 *     the drainages run out, caprock breaks beyond.
 *   Cattail: flat section country, shelterbelt rectangles round farmsteads,
 *     a pole line along a section road and a far grain elevator.
 *   Chukar: canyon rims in flat-topped steps with side-canyon notches,
 *     opening toward the river below the property; each wall cooler.
 *
 * No plains horizon rises above a few degrees: there are no mountains on
 * the plains.
 *
 * The rings follow the camera across the ground (no parallax yet), but not
 * up and down: each layer's datum is the property's mean edge height, set
 * so the silhouettes stand on the far terrain's horizon line from any
 * height. A crest looks down on the far swells; a draw looks up at them.
 */

/** The terrain runs this far past the property's edge (propertyTerrain.ts
 * builds a 1,000-yard apron), so the far horizon line lies at its edge. */
export const TERRAIN_APRON_M = 1000 * PROPERTY_PX_TO_M;

/** The landform facts a horizon is derived from. */
export interface HorizonLand {
  seed: number;
  /** World azimuths in degrees (0 = +z, toward +x) where the property's
   * edge runs lowest, deepest first. */
  lowAzimuths: number[];
  /** Height range along the property's edge, metres. */
  relief: number;
  /** Mean height of the property's edge: the far country's datum. */
  datum: number;
  /** From the property's centre to the far edge of its terrain, metres. */
  reach: number;
}

export interface HorizonLayer {
  radius: number;
  /** Colour recipe, as the sky's other ridge layers (sky.ts). */
  far: number;
  fogMix: number;
  hazeAmt: number;
  land?: boolean;
  treeHaze?: number;
  /** Typical height and relief, metres: they set how fast haze thins upward. */
  base: number;
  amp: number;
  segments: number;
}

export interface HorizonSample { ground: number; crown: number; crest: number }

export interface Horizon {
  layers: readonly HorizonLayer[];
  /** World height of a layer's ring for a camera at `cameraY`: its datum
   * sits where the far terrain's edge meets the sky. */
  ringHeight(layer: number, cameraY: number): number;
  sample(layer: number, theta: number): HorizonSample;
  /** Built silhouettes on a layer (poles, an elevator, a windmill): flat
   * camera-facing triangles, ring-local positions, nine floats each. */
  props(layer: number): Float32Array;
}

const EDGE_SAMPLES = 96;

/** Read a ground's horizon facts from its landform and world bounds. */
export function horizonLand(landscape: Pick<LandscapeModel, 'worldBounds' | 'heightAtWorld' | 'area'>): HorizonLand {
  const b = landscape.worldBounds(), cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const w = b.maxX - b.minX, d = b.maxZ - b.minZ, perimeter = 2 * (w + d);
  const edge: { az: number; h: number }[] = [];
  for (let i = 0; i < EDGE_SAMPLES; i++) {
    let s = (i + .5) / EDGE_SAMPLES * perimeter, x: number, z: number;
    if (s < w) { x = b.minX + s; z = b.minZ; } else if ((s -= w) < d) { x = b.maxX; z = b.minZ + s; }
    else if ((s -= d) < w) { x = b.maxX - s; z = b.maxZ; } else { s -= w; x = b.minX; z = b.maxZ - s; }
    edge.push({ az: Math.atan2(x - cx, z - cz) * 180 / Math.PI, h: landscape.heightAtWorld(x, z) });
  }
  // Smooth along the edge so one ripple is not a drainage.
  const smooth = edge.map((_, i) => {
    let sum = 0;
    for (let k = -3; k <= 3; k++) sum += edge[(i + k + EDGE_SAMPLES) % EDGE_SAMPLES].h;
    return sum / 7;
  });
  const mean = smooth.reduce((a, h) => a + h, 0) / EDGE_SAMPLES;
  const lows = smooth.map((h, i) => ({ h, az: edge[i].az, i }))
    .filter(({ h, i }) => h < mean && h <= smooth[(i + 1) % EDGE_SAMPLES] && h <= smooth[(i - 1 + EDGE_SAMPLES) % EDGE_SAMPLES])
    .sort((a, b) => a.h - b.h).map(low => low.az);
  const heights = edge.map(e => e.h);
  return {
    seed: landscape.area.terrain.seed, lowAzimuths: lows, relief: Math.max(...heights) - Math.min(...heights),
    datum: heights.reduce((a, h) => a + h, 0) / heights.length, reach: Math.hypot(w, d) / 2 + TERRAIN_APRON_M,
  };
}

/** A ring at radius r, scaled toward the camera from the far horizon at
 * `reach`: its datum then lies on the same sightline as the terrain's edge. */
function ringHeights(land: HorizonLand, layers: readonly HorizonLayer[]) {
  return (layer: number, cameraY: number) => land.datum + (cameraY - land.datum) * Math.max(0, 1 - layers[layer].radius / land.reach);
}

const wrap = (deg: number) => ((deg + 180) % 360 + 360) % 360 - 180;
const azimuthOf = (theta: number) => wrap(theta * 180 / Math.PI);
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Seamless rolling noise round the ring: integer harmonics with random
 * phases, larger waves stronger. About -1 to 1. */
function rolling(rng: () => number, kMin: number, kMax: number, falloff = 1.2): (az: number) => number {
  const waves = Array.from({ length: kMax - kMin + 1 }, (_, i) => {
    const k = kMin + i;
    return { k, a: (.55 + .45 * rng()) / Math.pow(k, falloff), phase: rng() * Math.PI * 2 };
  });
  const total = waves.reduce((sum, w) => sum + w.a, 0) * .62;
  return az => waves.reduce((sum, w) => sum + w.a * Math.sin(w.k * az * Math.PI / 180 + w.phase), 0) / total;
}

/** Shelterbelt or farmstead grove: a block of rounded crowns, near level
 * but uneven, with rounded ends. Width and tree spacing in degrees. */
interface Belt { center: number; width: number; height: number; tree: number }
function beltCrown(az: number, belt: Belt): number {
  const offset = wrap(az - belt.center), half = belt.width / 2;
  if (Math.abs(offset) > half) return 0;
  // One crown per tree spacing, each its own height, rounded on top.
  const u = (offset + half) / belt.tree, i = Math.floor(u), t = (u - i) * 2 - 1;
  const own = .78 + .22 * Math.abs(Math.sin(i * 12.9898 + belt.center * 78.233));
  const ends = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(offset) / half, 6)));
  return belt.height * own * (.72 + .28 * Math.sqrt(Math.max(0, 1 - t * t))) * ends;
}

/** Broadleaf crowns (creek timber, mesquite, hackberry): rounded lobes. */
interface Crown { center: number; half: number; height: number }
function crownHeight(az: number, crowns: readonly Crown[]): number {
  let best = 0;
  for (const c of crowns) {
    const t = wrap(az - c.center) / c.half;
    if (Math.abs(t) < 1) best = Math.max(best, c.height * Math.sqrt(1 - t * t));
  }
  return best;
}

/** A band of broadleaf crowns spread across `width` degrees round `center`. */
function grove(rng: () => number, center: number, width: number, count: number, height: number, spread = 1): Crown[] {
  const step = width / count;
  return Array.from({ length: count }, (_, i) => {
    const envelope = .55 + .45 * Math.sin(Math.PI * (i + .5) / count);
    return {
      center: center - width / 2 + step * (i + .5 + (rng() - .5) * .6),
      half: step * spread * (.6 + .5 * rng()),
      height: height * envelope * (.7 + .3 * rng()),
    };
  });
}

/** Flat tops and steep risers: rimrock steps out of rolling noise. */
function terrace(n: number, steps: number): number {
  const s = (n * .5 + .5) * steps, base = Math.floor(s);
  return (base + smoothstep(.72, .98, s - base)) / steps;
}

/** A wedge cut into a rim: a side canyon, with a narrow floor. */
function notch(az: number, center: number, width: number): number {
  return smoothstep(width, width * .25, Math.abs(wrap(az - center)));
}

class PropBuilder {
  private readonly out: number[] = [];
  /** A flat quad facing the ring's centre at azimuth `az` (degrees),
   * radius `r`: u is sideways and y up, in metres. */
  quad(az: number, r: number, u0: number, u1: number, y0: number, y1: number, top0 = u0, top1 = u1): void {
    const a = az * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
    const p = (u: number, y: number) => [r * s + u * c, y, r * c - u * s];
    this.out.push(...p(u0, y0), ...p(u1, y0), ...p(top1, y1), ...p(u0, y0), ...p(top1, y1), ...p(top0, y1));
  }
  /** A filled disc (a windmill wheel) as a fan. */
  disc(az: number, r: number, u: number, y: number, radius: number, sides = 12): void {
    const a = az * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
    const p = (du: number, dy: number) => [r * s + (u + du) * c, y + dy, r * c - (u + du) * s];
    for (let i = 0; i < sides; i++) {
      const t0 = i / sides * Math.PI * 2, t1 = (i + 1) / sides * Math.PI * 2;
      this.out.push(...p(0, 0), ...p(Math.cos(t0) * radius, Math.sin(t0) * radius), ...p(Math.cos(t1) * radius, Math.sin(t1) * radius));
    }
  }
  build(): Float32Array { return new Float32Array(this.out); }
}

/** The thinnest a built silhouette may be at radius r: about a pixel and a
 * half on a 1440-wide frame, so poles neither vanish nor shimmer. */
const minWidth = (r: number) => r * .0018;

function mixedGrass(land: HorizonLand): Horizon {
  const rng = mulberry32(land.seed * 7919 + 11);
  const swell = [rolling(rng, 2, 7), rolling(rng, 2, 6), rolling(rng, 2, 5)];
  const belt: Belt = { center: rng() * 360 - 180, width: 4 + rng() * 3, height: 7, tree: .7 };
  const windmill = wrap(belt.center + 110 + rng() * 140);
  // Each band stands higher than the one before, so its crests show over it.
  const sharptailSwell = (layer: number, az: number) => [1.5 + 4 * swell[0](az), 6 + 6 * swell[1](az), 13 + 9 * swell[2](az)][layer];
  const layers: HorizonLayer[] = [
    { radius: 300, base: 0, amp: 6, far: 0, fogMix: .06, hazeAmt: .48, land: true, segments: 512 },
    { radius: 620, base: 3, amp: 12, far: .3, fogMix: .16, hazeAmt: .64, treeHaze: .34, segments: 448 },
    { radius: 960, base: 9, amp: 18, far: .7, fogMix: .25, hazeAmt: .86, treeHaze: .4, segments: 384 },
  ];
  return {
    layers, ringHeight: ringHeights(land, layers),
    sample(layer, theta) {
      const az = azimuthOf(theta);
      // Long swells, each layer taller and smoother: three or four layers
      // stepping back from the crest.
      const ground = sharptailSwell(layer, az);
      const crown = layer === 2 ? beltCrown(az, belt) : 0;
      return { ground, crown, crest: ground + crown };
    },
    props(layer) {
      const props = new PropBuilder();
      if (layer === 1) {
        // A windmill on a swell about 450 m off, drawn at the layer's radius.
        const r = layers[1].radius, k = r / 450, g = sharptailSwell(1, windmill) - 1.5;
        const top = g + 11 * k, w = Math.max(minWidth(r), .5 * k);
        props.quad(windmill, r, -1.4 * k, 1.4 * k, g, top, -w / 2, w / 2);
        props.disc(windmill, r, -.4 * k, top, 1.6 * k);
        props.quad(windmill, r, .3 * k, 2.6 * k, top - .5 * k, top + .3 * k);
      }
      return props.build();
    },
  };
}

function redPlains(land: HorizonLand): Horizon {
  const rng = mulberry32(land.seed * 7919 + 23);
  const rise = [rolling(rng, 3, 9), rolling(rng, 2, 7), rolling(rng, 2, 6)];
  const gullies = Array.from({ length: 5 }, () => ({ center: rng() * 360 - 180, width: 2 + rng() * 3, depth: 1.5 + rng() * 2 }));
  const mesquite: Crown[] = Array.from({ length: 9 }, () => {
    const center = rng() * 360 - 180;
    return { center, half: 1.2 + rng() * 1.2, height: 2.4 + rng() * 1.6 };
  });
  // Creek timber where the land drains off the property; a hackberry motte
  // or two elsewhere. Fall back to seeded bearings on a level edge.
  const exits = land.lowAzimuths.length ? land.lowAzimuths.slice(0, 4) : [rng() * 360 - 180];
  const timber = [
    ...exits.flatMap((az, i) => grove(rng, az, (i < 2 ? 46 : 26) + rng() * 16, i < 2 ? 22 : 12, i < 2 ? 15 : 12, 1.2)),
    ...Array.from({ length: 4 }, () => grove(rng, rng() * 360 - 180, 5 + rng() * 6, 4, 10, 1)).flat(),
  ];
  const layers: HorizonLayer[] = [
    { radius: 340, base: 1, amp: 8, far: 0, fogMix: .06, hazeAmt: .4, land: true, treeHaze: .14, segments: 768 },
    { radius: 620, base: 4, amp: 16, far: .3, fogMix: .16, hazeAmt: .6, treeHaze: .25, segments: 640 },
    { radius: 950, base: 7, amp: 16, far: .72, fogMix: .28, hazeAmt: .84, segments: 384 },
  ];
  const ground = (layer: number, az: number) => {
    // Low rolling breaks standing just above the far terrain's edge.
    if (layer === 0) return 3 + 2.5 * rise[0](az) - gullies.reduce((cut, g) => Math.max(cut, g.depth * notch(az, g.center, g.width)), 0);
    if (layer === 1) return 5 + 4 * rise[1](az);
    // Caprock breaks: level tops and short steep faces.
    return 5 + 17 * terrace(rise[2](az), 2);
  };
  return {
    layers, ringHeight: ringHeights(land, layers),
    sample(layer, theta) {
      const az = azimuthOf(theta), g = ground(layer, az);
      const crown = layer === 0 ? crownHeight(az, mesquite) : layer === 1 ? crownHeight(az, timber) : 0;
      return { ground: g, crown, crest: g + crown };
    },
    props: () => new Float32Array(0),
  };
}

function section(land: HorizonLand): Horizon {
  const rng = mulberry32(land.seed * 7919 + 37);
  const lay = [rolling(rng, 2, 6), rolling(rng, 2, 6), rolling(rng, 2, 5)];
  const belts = (count: number, width: [number, number], height: [number, number], tree: number) =>
    Array.from({ length: count }, (_, i) => ({
      // Spread round the compass with some jitter, never two together.
      center: wrap(i * 360 / count + rng() * 360 / count * .6 + rng() * 360),
      width: width[0] + rng() * (width[1] - width[0]), height: height[0] + rng() * (height[1] - height[0]), tree,
    }));
  const groves = [belts(2, [4, 8], [12, 15], 1.1), belts(4, [2.5, 5], [9, 12], .7), belts(5, [1.2, 2.5], [6, 8], .45)];
  // Section roads run on the grid: the pole line follows one, off to a side.
  const road = Math.floor(rng() * 4) * 90, roadDistance = 360;
  const elevator = wrap(rng() * 360);
  const layers: HorizonLayer[] = [
    { radius: 420, base: 0, amp: 8, far: 0, fogMix: .02, hazeAmt: .3, land: true, treeHaze: .16, segments: 768 },
    { radius: 750, base: 0, amp: 12, far: .22, fogMix: .1, hazeAmt: .5, treeHaze: .22, segments: 640 },
    { radius: 1200, base: 0, amp: 14, far: .5, fogMix: .16, hazeAmt: .7, treeHaze: .26, segments: 512 },
  ];
  const ground = (layer: number, az: number) => [.6, 1, 1.4][layer] + [.8, 1, 1.2][layer] * lay[layer](az);
  return {
    layers, ringHeight: ringHeights(land, layers),
    sample(layer, theta) {
      const az = azimuthOf(theta), g = ground(layer, az);
      let crown = 0;
      for (const belt of groves[layer]) crown = Math.max(crown, beltCrown(az, belt));
      return { ground: g, crown, crest: g + crown };
    },
    props(layer) {
      const props = new PropBuilder(), r = layers[layer].radius;
      if (layer === 0) {
        // Poles every 60 m along a straight road 360 m off.
        for (let x = -1080; x <= 1080; x += 60) {
          const d = Math.hypot(roadDistance, x);
          const az = wrap(road + Math.atan2(x, roadDistance) * 180 / Math.PI), k = r / d, g = ground(0, az) - 2;
          const w = Math.max(minWidth(r), .35 * k), top = g + 2 + 11 * k;
          props.quad(az, r, -w / 2, w / 2, g, top);
          props.quad(az, r, -1.3 * k - w / 2, 1.3 * k + w / 2, top - 1.1 * k, top - 1.1 * k + Math.max(w * .8, .25 * k));
        }
      }
      if (layer === 2) {
        // A grain elevator about 1.9 km off: the tall house, its headhouse,
        // and a row of round bins with cone tops.
        const k = r / 1900, g = ground(2, elevator) - 2, u = (m: number) => m * k;
        props.quad(elevator, r, u(-8), u(8), g, g + u(38));
        props.quad(elevator, r, u(-3), u(4), g + u(38), g + u(47));
        for (const [offset, h] of [[14, 24], [24, 24], [-17, 18]] as const) {
          props.quad(elevator, r, u(offset - 4.5), u(offset + 4.5), g, g + u(h));
          props.quad(elevator, r, u(offset - 4.5), u(offset + 4.5), g + u(h), g + u(h + 3), u(offset), u(offset));
        }
      }
      return props.build();
    },
  };
}

function canyon(land: HorizonLand): Horizon {
  const rng = mulberry32(land.seed * 7919 + 53);
  const rim = [rolling(rng, 2, 7, 1), rolling(rng, 2, 6, 1), rolling(rng, 2, 5, 1)];
  // The river runs out where the property drains lowest; the walls open
  // there, so the far canyon shows through.
  const river = land.lowAzimuths[0] ?? rng() * 360 - 180;
  const sides = [0, 1, 2].map(() => Array.from({ length: 4 }, () => ({ center: rng() * 360 - 180, width: 3 + rng() * 5, depth: .35 + rng() * .3 })));
  const layers: HorizonLayer[] = [
    { radius: 970, base: -22, amp: 75, far: .12, fogMix: .08, hazeAmt: .5, segments: 896 },
    { radius: 1250, base: -5, amp: 140, far: .52, fogMix: .15, hazeAmt: .76, segments: 640 },
    { radius: 1480, base: 15, amp: 210, far: .72, fogMix: .22, hazeAmt: .94, segments: 512 },
  ];
  // Rim level and step height per wall, metres above the hunter's datum.
  const level = [[38, 52], [70, 95], [120, 110]];
  return {
    layers, ringHeight: ringHeights(land, layers),
    sample(layer, theta) {
      const az = azimuthOf(theta), [floor, rise] = level[layer];
      let h = floor + rise * terrace(rim[layer](az), 3);
      for (const side of sides[layer]) h -= rise * side.depth * notch(az, side.center, side.width);
      // Downstream the near walls fall away into the gorge.
      h -= (layer === 0 ? .85 : layer === 1 ? .55 : .2) * (floor + rise) * notch(az, river, layer === 0 ? 34 : 24);
      return { ground: h, crown: 0, crest: h };
    },
    props: () => new Float32Array(0),
  };
}

const KINDS: Readonly<Record<string, (land: HorizonLand) => Horizon>> = {
  'sharptail-prairie': mixedGrass,
  'quail-fields': redPlains,
  'pheasant-coverts': section,
  'chukar-ridge': canyon,
};

/** The horizon for a ground, or null where the sky keeps its generic ridges. */
export function buildHorizon(areaId: string, land: HorizonLand): Horizon | null {
  return KINDS[areaId]?.(land) ?? null;
}
