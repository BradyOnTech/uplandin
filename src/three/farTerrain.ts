import * as THREE from 'three';
import { mulberry32 } from '../game/math';
import type { LandscapeModel } from '../game/landscape';
import { FAR_COUNTRY_M, TERRAIN_APRON_M, type HorizonLand } from './horizon';

/**
 * The far country: real terrain, with real parallax, from the edge of the
 * property's terrain apron out to about five kilometres, for the four core
 * grounds. One merged mesh, one draw, fogged and graded like the rest.
 *
 * Nothing is placed against today's coordinates. The ring is laid out from
 * the area's world bounds and TERRAIN_APRON_M at load; at the apron's edge it
 * takes the landform's own height, then blends outward into its region's
 * far country, seeded by the ground's terrain seed and the drainages read
 * from its landform (horizon.ts `HorizonLand`):
 *   Sharptail: long swells cut by coulees, one shelterbelt and a windmill.
 *   Quail: rolling breaks, creek timber down the drainages, mesquite, and a
 *     caprock escarpment broken by the creeks.
 *   Cattail: flat section country on a mile grid of gravel roads: fields in
 *     quarter sections, farmsteads behind shelterbelts of crowned tree rows,
 *     a pole line down a section road and a grain elevator at a town.
 *   Chukar: canyon rims climbing in benches and risers, cut by the river's
 *     gorge where the land drains.
 * Vertex colours carry the region's land colours and a sky occlusion baked
 * from the ring's own heights. Power poles keep about a pixel and a half of
 * width at any distance (a small vertex hook), so they never vanish or
 * shimmer.
 */

/** Where the ring starts and ends, beyond the apron's edge, in metres. The
 * first offset tucks a skirt under the apron so its edge never shows a gap. */
const RING_OFFSETS = [-80, 0, 150, 380, 720, 1150, 1700, 2350, 3100, FAR_COUNTRY_M] as const;
/** Grid points round each ring, per tier. */
const PERIMETER = { high: 160, lite: 96 } as const;
/** How far beyond the apron the far country fully takes over. */
const BLEND = 700;
/** Pole width floor as a fraction of distance: about 1.5 px at 70 degrees on
 * an 810-pixel-tall frame. */
const POLE_WIDTH_PER_METRE = .0023;

type Quality = keyof typeof PERIMETER;
type Rgb = readonly [number, number, number];

interface Place {
  land: HorizonLand;
  /** The apron's rectangle in world metres. */
  apron: { minX: number; maxX: number; minZ: number; maxZ: number };
  centre: { x: number; z: number };
  rng: () => number;
}

/** Distance outside the apron rectangle (0 on or inside it). */
function beyond(p: Place, x: number, z: number): number {
  const a = p.apron;
  return Math.hypot(Math.max(a.minX - x, 0, x - a.maxX), Math.max(a.minZ - z, 0, z - a.maxZ));
}
const wrap = (deg: number) => ((deg + 180) % 360 + 360) % 360 - 180;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Two octaves, about 0 to 1. */
const fbm = (x: number, y: number, seed: number) => noise(x, y, seed) * .66 + noise(x * 2.1 + 17, y * 2.1 + 5, seed ^ 0x5bd1) * .34;

/** A drainage leaving the property: lateral distance from its winding line. */
interface Drain { azimuth: number; width: number; depth: number; wander: number; phase: number }
function drainOffset(p: Place, d: Drain, x: number, z: number): { lateral: number; along: number } {
  const dx = x - p.centre.x, dz = z - p.centre.z, r = Math.hypot(dx, dz);
  const a = d.azimuth * Math.PI / 180, ux = Math.sin(a), uz = Math.cos(a);
  const along = dx * ux + dz * uz, across = dx * uz - dz * ux;
  const wander = d.wander * Math.sin(along / 420 + d.phase) + d.wander * .4 * Math.sin(along / 170 + d.phase * 2.3);
  return { lateral: along > 0 ? Math.abs(across - wander) : r, along };
}
function drainsFor(p: Place, count: number, width: number, depth: number): Drain[] {
  const lows = p.land.lowAzimuths.length ? p.land.lowAzimuths : [p.rng() * 360 - 180];
  return lows.slice(0, count).map((azimuth, i) => ({ azimuth, width: width * (1 - i * .15), depth: depth * (1 - i * .2), wander: 70 + p.rng() * 60, phase: p.rng() * 6.28 }));
}
function valley(p: Place, drains: readonly Drain[], x: number, z: number, e: number): number {
  let cut = 0;
  for (const d of drains) {
    const { lateral } = drainOffset(p, d, x, z);
    cut = Math.max(cut, d.depth * Math.exp(-((lateral / d.width) ** 2)) * smooth(0, 300, e));
  }
  return cut;
}

class Geometry {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly color: number[] = [];
  readonly widen: number[] = [];
  private readonly c = new THREE.Color();
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, rgb: THREE.Color, wx = 0, wy = 0, wz = 0): void {
    this.position.push(x, y, z); this.normal.push(nx, ny, nz); this.color.push(rgb.r, rgb.g, rgb.b); this.widen.push(wx, wy, wz);
  }
  /** A flat-shaded triangle. */
  tri(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, hex: number, shade = 1): void {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    if (ny < -.2) { nx = -nx; ny = -ny; nz = -nz; }
    this.c.setHex(hex).multiplyScalar(shade);
    for (const v of [a, b, c]) this.vertex(v.x, v.y, v.z, nx, ny, nz, this.c);
  }
  get count(): number { return this.position.length / 3; }
}

/** A rounded tree mass: a five-sided bipyramid with its crown off centre. */
function crown(g: Geometry, rng: () => number, x: number, ground: number, z: number, radius: number, height: number, hex: number): void {
  const top = { x: x + (rng() - .5) * radius * .5, y: ground + height, z: z + (rng() - .5) * radius * .5 };
  const foot = { x, y: ground - 1, z };
  const turn = rng() * Math.PI * 2, mid = ground + height * (.38 + rng() * .14);
  const ring = Array.from({ length: 5 }, (_, i) => {
    const a = turn + i / 5 * Math.PI * 2, r = radius * (.82 + rng() * .3);
    return { x: x + Math.cos(a) * r, y: mid, z: z + Math.sin(a) * r };
  });
  for (let i = 0; i < 5; i++) {
    const a = ring[i], b = ring[(i + 1) % 5];
    g.tri(a, b, top, hex, 1);
    g.tri(b, a, foot, hex, .8);
  }
}

/** A row of tree masses with a broken, crowned top: uneven heights and the
 * odd gap, like a farm shelterbelt or a creek's timber. */
function treeRow(g: Geometry, rng: () => number, ground: (x: number, z: number) => number,
  x0: number, z0: number, x1: number, z1: number, spacing: number, radius: number, height: number, palette: readonly number[], gap = .1): void {
  const length = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(length / spacing));
  for (let i = 0; i <= n; i++) {
    if (rng() < gap) continue;
    const t = i / n, x = x0 + (x1 - x0) * t + (rng() - .5) * spacing * .5, z = z0 + (z1 - z0) * t + (rng() - .5) * spacing * .5;
    const ends = .72 + .28 * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    crown(g, rng, x, ground(x, z), z, radius * (.8 + rng() * .4), height * ends * (.7 + rng() * .45), palette[Math.floor(rng() * palette.length)]);
  }
}

/** An axis-aligned box from the ground up (flat shaded). */
function box(g: Geometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number): void {
  const X = [x - sx / 2, x + sx / 2], Z = [z - sz / 2, z + sz / 2], Y = [y, y + sy];
  const v = (i: number, j: number, k: number) => ({ x: X[i], y: Y[j], z: Z[k] });
  const quad = (a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, d: THREE.Vector3Like, shade: number) => { g.tri(a, b, c, hex, shade); g.tri(a, c, d, hex, shade); };
  quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1), .95);
  quad(v(1, 0, 0), v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), .8);
  quad(v(1, 0, 1), v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), .9);
  quad(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0), .85);
  quad(v(0, 1, 1), v(1, 1, 1), v(1, 1, 0), v(0, 1, 0), 1.05);
}

/** A power pole: two crossed vertical quads and a crossarm, which the
 * vertex hook keeps at least a pixel and a half wide. */
function pole(g: Geometry, x: number, ground: number, z: number, hex: number): void {
  const c = new THREE.Color(hex), h = 11, half = .17;
  const quad = (ax: number, az: number, y0: number, y1: number, w: number) => {
    // Corners sit on the centre line; aWiden pushes them out sideways.
    const corners = [[-1, y0], [1, y0], [1, y1], [-1, y0], [1, y1], [-1, y1]] as const;
    for (const [side, y] of corners) g.vertex(x, y, z, az, 0, -ax, c, ax * side * w, 0, az * side * w);
  };
  quad(1, 0, ground - .5, ground + h, half);
  quad(0, 1, ground - .5, ground + h, half);
  quad(1, 0, ground + h - 1.4, ground + h - 1.05, 1.3);
}

/** A windmill: tapering tower, wheel and vane. */
function windmill(g: Geometry, x: number, ground: number, z: number, facing: number): void {
  const steel = 0x6d6a62, top = ground + 11;
  const base = 1.4, head = .3;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    const a = { x: x + ax * base, y: ground, z: z + az * base }, b = { x: x + bx * base, y: ground, z: z + bz * base };
    const c = { x: x + bx * head, y: top, z: z + bz * head }, d = { x: x + ax * head, y: top, z: z + az * head };
    g.tri(a, b, c, steel); g.tri(a, c, d, steel);
  }
  const fx = Math.sin(facing), fz = Math.cos(facing), sx = fz, sz = -fx, hub = { x: x + fx * .6, y: top + .4, z: z + fz * .6 };
  for (let i = 0; i < 12; i++) {
    const a0 = i / 12 * Math.PI * 2, a1 = (i + 1) / 12 * Math.PI * 2, r = 1.7;
    const p = (a: number) => ({ x: hub.x + sx * Math.cos(a) * r, y: hub.y + Math.sin(a) * r, z: hub.z + sz * Math.cos(a) * r });
    g.tri(hub, p(a0), p(a1), 0x58564f);
  }
  const t0 = { x: x - fx * .3, y: top + .2, z: z - fz * .3 }, t1 = { x: x - fx * 3, y: top + .5, z: z - fz * 3 };
  g.tri(t0, t1, { x: t1.x, y: t1.y + 1, z: t1.z }, steel);
}

/** A region's far country. */
interface Region {
  /** Height above the property's edge datum at a point `e` metres beyond the apron. */
  relief(x: number, z: number, e: number): number;
  /** Land colour at a point, from its height above datum, slope and place. */
  paint(x: number, z: number, h: number, slope: number, e: number, out: THREE.Color): THREE.Color;
  /** Built and grown things standing on the ground. */
  dress(g: Geometry, ground: (x: number, z: number) => number, quality: Quality): void;
}

const lerpHex = (out: THREE.Color, hex: number, t: number, tmp = new THREE.Color()) => out.lerp(tmp.setHex(hex), Math.min(1, Math.max(0, t)));

function mixedGrass(p: Place): Region {
  const seed = p.land.seed * 31 + 7, drains = drainsFor(p, 3, 150, 15);
  const beltAz = p.rng() * 360 - 180, beltE = 1700 + p.rng() * 900, millAz = wrap(beltAz + 100 + p.rng() * 160), millE = 450 + p.rng() * 400;
  return {
    relief(x, z, e) {
      // The Coteau's swells grow with distance: forty-odd metres of relief
      // a few kilometres out, so three or four bands show from a crest.
      const amp = 9 + 38 * smooth(0, 3200, e);
      return (fbm(x / 1150, z / 1150, seed) - .42) * 2 * amp - valley(p, drains, x, z, e);
    },
    paint(x, z, h, slope, e, out) {
      out.setHex(0xa59670);
      lerpHex(out, 0xa47a4c, smooth(4, 16, h) * .7);          // copper bluestem crowns
      lerpHex(out, 0x6c6347, smooth(-2, -12, h) * .8);        // maroon and sage swales
      lerpHex(out, 0x8a8a63, fbm(x / 300, z / 300, seed ^ 9) * .35);
      return out.multiplyScalar(1 - slope * .25);
    },
    dress(g, ground, quality) {
      const at = (az: number, e: number) => pointBeyond(p, az, e);
      const b = at(beltAz, beltE), m = at(millAz, millE);
      treeRow(g, p.rng, ground, b.x - 70, b.z, b.x + 70, b.z, quality === 'high' ? 9 : 13, 6, 10, [0x3f4a33, 0x4b4f34, 0x5d5235]);
      windmill(g, m.x, ground(m.x, m.z), m.z, p.rng() * Math.PI * 2);
    },
  };
}

function redPlains(p: Place): Region {
  const seed = p.land.seed * 31 + 11, drains = drainsFor(p, 3, 95, 10);
  const scarp = (x: number, z: number) => 2700 + (noise(Math.atan2(x - p.centre.x, z - p.centre.z) * 3, 0, seed ^ 3) - .5) * 900;
  return {
    relief(x, z, e) {
      const amp = 6 + 18 * smooth(0, 2400, e);
      const rolling = (fbm(x / 700, z / 700, seed) - .45) * 2 * amp;
      // Caprock breaks: a level step up with a short, steep face.
      const step = 46 * smooth(scarp(x, z) - 140, scarp(x, z) + 140, e) * (.75 + .5 * noise(x / 500, z / 500, seed ^ 5));
      return rolling + step - valley(p, drains, x, z, e) * (1 + step / 46);
    },
    paint(x, z, h, slope, e, out) {
      out.setHex(0xa4855b);                                   // copper little bluestem
      lerpHex(out, 0x9b5a3a, smooth(.12, .35, slope) * .85);  // gullied red clay faces
      lerpHex(out, 0x7d7752, fbm(x / 280, z / 280, seed ^ 7) * .45); // sand sage and shinnery
      lerpHex(out, 0x5f6640, smooth(-3, -9, h) * .7);          // creek bottoms
      return out;
    },
    dress(g, ground, quality) {
      // Creek timber down each drainage: hackberry, elm, cottonwood turning.
      const spacing = quality === 'high' ? 46 : 74;
      for (const d of drains) {
        const a = d.azimuth * Math.PI / 180, ux = Math.sin(a), uz = Math.cos(a);
        for (let s = 0; s < 2400; s += spacing) {
          const e0 = pointBeyond(p, d.azimuth, s);
          // Walk the winding centre line found by drainOffset.
          const along = (e0.x - p.centre.x) * ux + (e0.z - p.centre.z) * uz;
          const wander = d.wander * Math.sin(along / 420 + d.phase) + d.wander * .4 * Math.sin(along / 170 + d.phase * 2.3);
          for (const side of [-1, 1]) {
            if (p.rng() < .35) continue;
            const off = wander + side * (8 + p.rng() * 14);
            const x = e0.x + uz * off, z = e0.z - ux * off;
            crown(g, p.rng, x, ground(x, z), z, 6 + p.rng() * 3, 10 + p.rng() * 6, [0x55603a, 0x6b6b3c, 0x8f7d3f][Math.floor(p.rng() * 3)]);
          }
        }
      }
      // Mesquite scattered on the near uplands.
      for (let i = 0; i < (quality === 'high' ? 24 : 12); i++) {
        const q = pointBeyond(p, p.rng() * 360 - 180, 150 + p.rng() * 1500);
        crown(g, p.rng, q.x, ground(q.x, q.z), q.z, 4, 4 + p.rng() * 1.5, 0x6c7356);
      }
    },
  };
}

const MILE = 1609.34;
function section(p: Place): Region {
  const seed = p.land.seed * 31 + 13;
  // The grid's origin is seeded, its lines run north-south and east-west.
  const ox = p.rng() * MILE, oz = p.rng() * MILE;
  const road = (v: number, o: number) => { const m = ((v - o) % MILE + MILE) % MILE; return Math.min(m, MILE - m); };
  const crops = [0xbcaa86, 0x8b7b62, 0x4f4539, 0xa39470, 0x8c8f62, 0xc3b38a];
  return {
    relief(x, z) { return (fbm(x / 1500, z / 1500, seed) - .5) * 5; },
    paint(x, z, h, slope, e, out) {
      // Quarter sections, each its own crop or grass, with gravel roads.
      const qx = Math.floor((x - ox) / (MILE / 2)), qz = Math.floor((z - oz) / (MILE / 2));
      out.setHex(crops[Math.floor(hash2(qx, qz, seed) * crops.length)]);
      lerpHex(out, 0x958c74, 1 - smooth(6, 16, Math.min(road(x, ox), road(z, oz))));
      return out.multiplyScalar(.94 + noise(x / 220, z / 220, seed ^ 2) * .12);
    },
    dress(g, ground, quality) {
      const corners: { x: number; z: number; e: number }[] = [];
      const a = p.apron, reach = RING_OFFSETS[RING_OFFSETS.length - 1] - 400;
      for (let gx = Math.floor((a.minX - reach - ox) / MILE); gx <= Math.ceil((a.maxX + reach - ox) / MILE); gx++) {
        for (let gz = Math.floor((a.minZ - reach - oz) / MILE); gz <= Math.ceil((a.maxZ + reach - oz) / MILE); gz++) {
          const x = ox + gx * MILE, z = oz + gz * MILE, e = beyond(p, x, z);
          if (e > 250 && e < reach && hash2(gx, gz, seed ^ 11) < .55) corners.push({ x, z, e });
        }
      }
      corners.sort((u, v) => u.e - v.e);
      // Farmsteads behind L-shaped shelterbelts of crowned tree rows.
      const farms = corners.slice(0, quality === 'high' ? 7 : 5), spacing = quality === 'high' ? 13 : 18;
      const belt = [0x3e4934, 0x47502f, 0x5e5636, 0x384431];
      for (const [i, f] of farms.entries()) {
        const sx = hash2(i, 1, seed) < .5 ? 1 : -1, sz = hash2(i, 2, seed) < .5 ? 1 : -1;
        const x0 = f.x + sx * 40, z0 = f.z + sz * 40, len = 180 + hash2(i, 3, seed) * 120;
        treeRow(g, p.rng, ground, x0, z0, x0, z0 + sz * len, spacing, 7.5, 11, belt, .12);
        treeRow(g, p.rng, ground, x0, z0, x0 + sx * len, z0, spacing, 7.5, 11, belt, .12);
        box(g, x0 + sx * 70, ground(x0 + sx * 70, z0 + sz * 70), z0 + sz * 70, 18, 7, 12, 0x8a8577);
      }
      // A pole line down the nearest section road, a pole every 65 m.
      const near = corners[0];
      if (near) {
        const alongX = Math.abs(near.x - p.centre.x) < Math.abs(near.z - p.centre.z);
        for (let s = -3000; s <= 3000; s += 65) {
          const x = alongX ? near.x + s : near.x + 9, z = alongX ? near.z + 9 : near.z + s;
          if (beyond(p, x, z) > 60) pole(g, x, ground(x, z), z, 0x4e463c);
        }
      }
      // The grain elevator stands at a town on the farthest corner.
      const town = corners[corners.length - 1];
      if (town) {
        const gy = ground(town.x, town.z);
        box(g, town.x, gy, town.z, 16, 42, 16, 0xbdb6a6);
        box(g, town.x + 2, gy + 42, town.z, 7, 11, 7, 0xa8a193);
        box(g, town.x + 16, gy, town.z, 9, 26, 9, 0xa9a6a0);
        box(g, town.x + 27, gy, town.z, 9, 26, 9, 0xa9a6a0);
      }
    },
  };
}

function canyon(p: Place): Region {
  const seed = p.land.seed * 31 + 17;
  const river: Drain = { azimuth: p.land.lowAzimuths[0] ?? p.rng() * 360 - 180, width: 1, depth: 1, wander: 140, phase: p.rng() * 6.28 };
  const bench = (v: number, n: number) => { const s = v * n, b = Math.floor(s); return (b + smooth(.8, .97, s - b)) / n; };
  return {
    relief(x, z, e) {
      const az = Math.atan2(x - p.centre.x, z - p.centre.z);
      // Rims climb away from the property in benches and short risers.
      const climb = bench(Math.min(1, e / 3600) * (.85 + .3 * noise(az * 2.5, 0, seed)), 4) * 260;
      const { lateral, along } = drainOffset(p, river, x, z);
      // The gorge: the river's floor, walls stepping up away from it.
      const gorge = along > 0 ? -70 + bench(Math.min(1, lateral / (500 + e * .35)), 3) * (climb + 90) : climb;
      return Math.min(climb, gorge) + (fbm(x / 400, z / 400, seed) - .5) * 10;
    },
    paint(x, z, h, slope, e, out) {
      out.setHex(0xb2985f);                                    // cheat bleached gold
      lerpHex(out, 0x837b6b, smooth(.18, .35, slope));         // talus
      lerpHex(out, 0x564e46, smooth(.45, .8, slope));          // basalt rimrock faces
      lerpHex(out, 0x7a7e66, fbm(x / 240, z / 240, seed ^ 3) * .35); // sage
      lerpHex(out, 0x4d5446, smooth(-30, -65, h));             // the gorge floor
      return out;
    },
    dress() { /* The rims are the landmark. */ },
  };
}

function pointBeyond(p: Place, azimuth: number, e: number): { x: number; z: number } {
  // March out from the centre along the bearing to the apron edge, then on.
  const a = azimuth * Math.PI / 180, ux = Math.sin(a), uz = Math.cos(a), ap = p.apron;
  const tx = ux > 0 ? (ap.maxX - p.centre.x) / ux : ux < 0 ? (ap.minX - p.centre.x) / ux : Infinity;
  const tz = uz > 0 ? (ap.maxZ - p.centre.z) / uz : uz < 0 ? (ap.minZ - p.centre.z) / uz : Infinity;
  const t = Math.min(tx, tz) + e;
  return { x: p.centre.x + ux * t, z: p.centre.z + uz * t };
}

const REGIONS: Readonly<Record<string, (p: Place) => Region>> = {
  'sharptail-prairie': mixedGrass,
  'quail-fields': redPlains,
  'pheasant-coverts': section,
  'chukar-ridge': canyon,
};

export interface FarTerrain {
  mesh: THREE.Mesh;
  triangles: number;
  dispose(): void;
}

/**
 * Build a core ground's far country, or null where it has none. `land` is
 * the ground's horizon facts (horizonLand); `apronMetres` lets a ground with
 * a wider apron say so.
 */
export function buildFarTerrain(landscape: Pick<LandscapeModel, 'worldBounds' | 'heightAtWorld' | 'area'>, land: HorizonLand,
  quality: Quality, apronMetres = TERRAIN_APRON_M): FarTerrain | null {
  const make = REGIONS[landscape.area.id];
  if (!make) return null;
  const b = landscape.worldBounds();
  const apron = { minX: b.minX - apronMetres, maxX: b.maxX + apronMetres, minZ: b.minZ - apronMetres, maxZ: b.maxZ + apronMetres };
  const place: Place = { land, apron, centre: { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 }, rng: mulberry32(land.seed * 977 + 41) };
  const region = make(place);
  const edgeHeight = (x: number, z: number) => landscape.heightAtWorld(Math.min(apron.maxX, Math.max(apron.minX, x)), Math.min(apron.maxZ, Math.max(apron.minZ, z)));
  const height = (x: number, z: number) => {
    const e = beyond(place, x, z), w = smooth(0, BLEND, e);
    return edgeHeight(x, z) * (1 - w) + (land.datum + region.relief(x, z, e)) * w;
  };

  // Rectangular rings round the apron, the same number of points on each,
  // shared side to side so the quads stay aligned as the rings grow.
  const perimeter = PERIMETER[quality], w = apron.maxX - apron.minX, d = apron.maxZ - apron.minZ;
  const nx = Math.max(4, Math.round(perimeter * w / (2 * (w + d)))), nz = Math.max(4, perimeter / 2 - nx);
  const ringPoint = (k: number, i: number) => {
    const o = RING_OFFSETS[k], minX = apron.minX - o, maxX = apron.maxX + o, minZ = apron.minZ - o, maxZ = apron.maxZ + o;
    const n = 2 * (nx + nz), s = ((i % n) + n) % n;
    if (s < nx) return { x: minX + (maxX - minX) * s / nx, z: minZ };
    if (s < nx + nz) return { x: maxX, z: minZ + (maxZ - minZ) * (s - nx) / nz };
    if (s < 2 * nx + nz) return { x: maxX - (maxX - minX) * (s - nx - nz) / nx, z: maxZ };
    return { x: minX, z: maxZ - (maxZ - minZ) * (s - 2 * nx - nz) / nz };
  };
  const count = 2 * (nx + nz), rings = RING_OFFSETS.length;
  const grid: { x: number; y: number; z: number }[][] = [];
  for (let k = 0; k < rings; k++) {
    const row = [];
    for (let i = 0; i < count; i++) {
      const q = ringPoint(k, i);
      // The skirt dips under the apron; the edge row sits just below it.
      const y = k === 0 ? edgeHeight(q.x, q.z) - 20 : k === 1 ? edgeHeight(q.x, q.z) - 1 : height(q.x, q.z);
      row.push({ x: q.x, y, z: q.z });
    }
    grid.push(row);
  }

  const g = new Geometry();
  const color = new THREE.Color(), a = new THREE.Vector3(), c = new THREE.Vector3();
  const vertexColor = (k: number, i: number, out: THREE.Color) => {
    const v = grid[k][i], e = Math.max(0, beyond(place, v.x, v.z));
    const l = grid[k][(i + count - 1) % count], r = grid[k][(i + 1) % count];
    const inner = grid[Math.max(0, k - 1)][i], outer = grid[Math.min(rings - 1, k + 1)][i];
    const across = Math.hypot(outer.x - inner.x, outer.z - inner.z) || 1, round = Math.hypot(r.x - l.x, r.z - l.z) || 1;
    const slope = Math.min(1, Math.hypot((outer.y - inner.y) / across, (r.y - l.y) / round) * 1.4);
    region.paint(v.x, v.z, v.y - land.datum, slope, e, out);
    // Baked sky occlusion from the ring's own heights: hollows darker,
    // crests a touch lighter.
    const around = (l.y + r.y + inner.y + outer.y) / 4;
    out.multiplyScalar(Math.min(1.06, Math.max(.78, 1 + (v.y - around) * .012)));
    return out;
  };
  // Smooth-shaded ground: per-vertex normals from the grid's neighbours.
  const normalAt = (k: number, i: number) => {
    const l = grid[k][(i + count - 1) % count], r = grid[k][(i + 1) % count];
    const inner = grid[Math.max(0, k - 1)][i], outer = grid[Math.min(rings - 1, k + 1)][i];
    a.set(r.x - l.x, r.y - l.y, r.z - l.z); c.set(outer.x - inner.x, outer.y - inner.y, outer.z - inner.z);
    const n = new THREE.Vector3().crossVectors(c, a).normalize();
    return n.y < 0 ? n.negate() : n;
  };
  const corner = (k: number, i: number) => {
    const v = grid[k][i % count], n = normalAt(k, i % count);
    g.vertex(v.x, v.y, v.z, n.x, n.y, n.z, vertexColor(k, i % count, color));
  };
  for (let k = 0; k < rings - 1; k++) {
    for (let i = 0; i < count; i++) {
      corner(k, i); corner(k + 1, i); corner(k + 1, i + 1);
      corner(k, i); corner(k + 1, i + 1); corner(k, i + 1);
    }
  }
  region.dress(g, height, quality);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(g.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(g.normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(g.color, 3));
  geometry.setAttribute('aWiden', new THREE.Float32BufferAttribute(g.widen, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.customProgramCacheKey = () => 'far-terrain-v1';
  material.onBeforeCompile = shader => {
    shader.uniforms.uWidenPerMetre = { value: POLE_WIDTH_PER_METRE };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aWiden;\nuniform float uWidenPerMetre;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	// Thin built things (poles) keep a floor on their on-screen width.
	float widenBase = length( aWiden );
	if ( widenBase > 0.0 ) {
		float widenDistance = distance( ( modelMatrix * vec4( transformed, 1.0 ) ).xyz, cameraPosition );
		transformed += aWiden / widenBase * max( widenBase, widenDistance * uWidenPerMetre * .5 );
	}`);
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${landscape.area.name} far country`;
  mesh.matrixAutoUpdate = false;
  return {
    mesh, triangles: g.count / 3,
    dispose: () => { geometry.dispose(); material.dispose(); },
  };
}
