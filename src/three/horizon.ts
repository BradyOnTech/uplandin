import { mulberry32 } from '../game/math';
import type { LandscapeModel } from '../game/landscape';
import { PROPERTY_PX_TO_M } from '../game/worldUnits';

/**
 * The farthest band of each core ground's horizon: a camera-following ring
 * the sky system draws behind everything (sky.ts), standing for the country
 * beyond the far terrain (farTerrain.ts), which carries the real relief,
 * timber, farmsteads and rims with parallax out to about five kilometres.
 *
 * Nothing here is placed against today's coordinates. Each region's band is
 * generated from the ground's terrain seed and facts read from its landform
 * (`horizonLand`): where the property's edge runs lowest (drainages leave
 * there, and the canyon opens there), how much relief it carries, its mean
 * height, and how far its terrain reaches.
 *
 *   Sharptail: the last swells, fading blue-grey.
 *   Quail: low caprock breaks, broken where the creeks run out.
 *   Cattail: flat section country to the edge of the world.
 *   Chukar: the farthest canyon rims, in flat-topped steps.
 *
 * No plains band rises above a few degrees, and none carries a block that
 * could read as a mesa: there are no mountains on the plains.
 *
 * The band follows the camera across the ground, but not up and down: its
 * datum is the property's mean edge height, set on the sightline to the far
 * terrain's outer edge, so it stands on the horizon from a draw or a crest.
 */

/** The terrain runs this far past the property's edge (propertyTerrain.ts
 * builds a 1,000-yard apron), so the far terrain starts at its edge. */
export const TERRAIN_APRON_M = 1000 * PROPERTY_PX_TO_M;
/** The far terrain reaches this far beyond the apron. */
export const FAR_COUNTRY_M = 3900;

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
  /** From the property's centre to the outer edge of its far terrain. */
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
   * sits where the far terrain's outer edge meets the sky. */
  ringHeight(layer: number, cameraY: number): number;
  sample(layer: number, theta: number): HorizonSample;
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
    datum: heights.reduce((a, h) => a + h, 0) / heights.length, reach: Math.hypot(w, d) / 2 + TERRAIN_APRON_M + FAR_COUNTRY_M,
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

/** Flat tops and steep risers: rimrock steps out of rolling noise. */
function terrace(n: number, steps: number): number {
  const s = (n * .5 + .5) * steps, base = Math.floor(s);
  return (base + smoothstep(.72, .98, s - base)) / steps;
}

/** A wedge cut into a rim: a side canyon, with a narrow floor. */
function notch(az: number, center: number, width: number): number {
  return smoothstep(width, width * .25, Math.abs(wrap(az - center)));
}


const band = (radius: number, base: number, amp: number, segments: number): HorizonLayer =>
  ({ radius, base, amp, far: .85, fogMix: .3, hazeAmt: .9, segments });

function mixedGrass(land: HorizonLand): Horizon {
  const rng = mulberry32(land.seed * 7919 + 11), swell = rolling(rng, 2, 6);
  const layers = [band(960, 12, 20, 384)];
  return {
    layers, ringHeight: ringHeights(land, layers),
    sample(_layer, theta) {
      const ground = 14 + 9 * swell(azimuthOf(theta));
      return { ground, crown: 0, crest: ground };
    },
  };
}

function redPlains(land: HorizonLand): Horizon {
  const rng = mulberry32(land.seed * 7919 + 23), rise = rolling(rng, 2, 6);
  const exits = land.lowAzimuths.slice(0, 3);
  const layers = [band(950, 8, 16, 384)];
  return {
    layers, ringHeight: ringHeights(land, layers),
    sample(_layer, theta) {
      const az = azimuthOf(theta);
      // Low caprock breaks, broken where the creeks run out.
      let ground = 6 + 14 * terrace(rise(az), 2);
      for (const exit of exits) ground -= 9 * notch(az, exit, 9);
      return { ground, crown: 0, crest: ground };
    },
  };
}

function section(land: HorizonLand): Horizon {
  const rng = mulberry32(land.seed * 7919 + 37), lay = rolling(rng, 2, 5);
  const layers = [band(1200, 1, 8, 256)];
  return {
    layers, ringHeight: ringHeights(land, layers),
    sample(_layer, theta) {
      // Flat section country to the edge of the world: no blocks to read as mesas.
      const ground = 2 + 1.5 * lay(azimuthOf(theta));
      return { ground, crown: 0, crest: ground };
    },
  };
}

function canyon(land: HorizonLand): Horizon {
  const rng = mulberry32(land.seed * 7919 + 53), rim = rolling(rng, 2, 5, 1);
  const river = land.lowAzimuths[0] ?? rng() * 360 - 180;
  const sides = Array.from({ length: 4 }, () => ({ center: rng() * 360 - 180, width: 3 + rng() * 5, depth: .35 + rng() * .3 }));
  const layers = [{ ...band(1480, 15, 210, 512), far: .72, fogMix: .22, hazeAmt: .94 }];
  return {
    layers, ringHeight: ringHeights(land, layers),
    sample(_layer, theta) {
      const az = azimuthOf(theta);
      let h = 150 + 120 * terrace(rim(az), 3);
      for (const side of sides) h -= 120 * side.depth * notch(az, side.center, side.width);
      h -= .3 * 270 * notch(az, river, 22);
      return { ground: h, crown: 0, crest: h };
    },
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
