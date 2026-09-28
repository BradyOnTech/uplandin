import * as THREE from 'three';
import type { AreaConfig } from '../../game/areas';
import type { Vec2 } from '../../game/types';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';
import { distanceToLine, quailDrainageAt, trailDistanceAt } from '../../game/quailLandscape';
import { deriveQuailEntrances } from './quailEntrances';
import { groundQuailTrackGeometry } from './quailGroundGeometry';

interface TrackNode { point: Vec2; neighbors: Set<TrackNode> }
interface TrackNetwork { paths: Vec2[][]; branches: Vec2[] }
const networks = new WeakMap<AreaConfig, TrackNetwork>();
const entrances = new WeakMap<AreaConfig, ReturnType<typeof deriveQuailEntrances>>();
function approaches(area: AreaConfig) {
  let saved = entrances.get(area);
  if (!saved) { saved = deriveQuailEntrances(area); entrances.set(area, saved); }
  return saved;
}

/** Extra approach wear stays a render concern; shared hunt trails are untouched. */
export function quailTrackDistanceAt(area: AreaConfig, x: number, y: number, limit = Infinity): number {
  let distance = trailDistanceAt(area, x, y, limit);
  for (const entrance of approaches(area)) distance = Math.min(distance, distanceToLine(x, y, entrance.centerline));
  return distance <= limit ? distance : Infinity;
}

/** Join degree-two endpoints before making ribbons, so each road has a single
 * cross section through the truck apron and windmill service bend. */
export function quailTrackNetwork(area: AreaConfig): TrackNetwork {
  const saved = networks.get(area); if (saved) return saved;
  const nodes = new Map<string, TrackNode>();
  const node = (point: Vec2) => {
    const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
    let value = nodes.get(key);
    if (!value) { value = { point, neighbors: new Set() }; nodes.set(key, value); }
    return value;
  };
  for (const points of [...area.trails.map(t => t.points), ...approaches(area).map(e => e.centerline)]) {
    for (let i = 1; i < points.length; i++) {
      const a = node(points[i - 1]), b = node(points[i]);
      if (a === b) continue;
      a.neighbors.add(b); b.neighbors.add(a);
    }
  }
  const visited = new Map<TrackNode, Set<TrackNode>>();
  const seen = (a: TrackNode, b: TrackNode) => visited.get(a)?.has(b);
  const visit = (a: TrackNode, b: TrackNode) => {
    if (!visited.has(a)) visited.set(a, new Set());
    if (!visited.has(b)) visited.set(b, new Set());
    visited.get(a)!.add(b); visited.get(b)!.add(a);
  };
  const paths: Vec2[][] = [];
  const walk = (first: TrackNode, second: TrackNode) => {
    const points = [first.point]; let previous = first, current = second;
    while (!seen(previous, current)) {
      visit(previous, current); points.push(current.point);
      if (current.neighbors.size !== 2 || current === first) break;
      const next = [...current.neighbors].find(n => n !== previous)!;
      previous = current; current = next;
    }
    paths.push(points);
  };
  for (const n of nodes.values()) if (n.neighbors.size !== 2) for (const next of n.neighbors) if (!seen(n, next)) walk(n, next);
  for (const n of nodes.values()) for (const next of n.neighbors) if (!seen(n, next)) walk(n, next);
  const result = { paths, branches: [...nodes.values()].filter(n => n.neighbors.size > 2).map(n => n.point) };
  networks.set(area, result); return result;
}

const smooth = (low: number, high: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - low) / (high - low), 0, 1); return t * t * (3 - 2 * t);
};

/** Metres, not point indices: weathering continues through every joined bend
 * and stays identical from either property entrance. Unequal wheel samples
 * interrupt wear independently instead of repeating two painted stripes. */
function trackWeather(x: number, z: number, scale: number): number {
  const px = x / scale, pz = z / scale, ix = Math.floor(px), iz = Math.floor(pz);
  const fx = px - ix, fz = pz - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const hash = (a: number, b: number) => {
    let h = Math.imul(a ^ 0x2d57, 374761393) ^ Math.imul(b ^ 0x78a1, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967295;
  };
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u),
    THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}

/** Common worn ground replaces stacked ribbon ends at a branch. Its footprint
 * follows the roads, leaving irregular shoulders rather than a circular pad. */
export function quailJunctionWearAt(area: AreaConfig, x: number, y: number): number {
  let wear = 0;
  for (const branch of quailTrackNetwork(area).branches) {
    const radius = Math.hypot(x - branch.x, y - branch.y) * PROPERTY_PX_TO_M;
    if (radius >= 4.4) continue;
    const road = quailTrackDistanceAt(area, x, y, 8) * PROPERTY_PX_TO_M;
    // Keep one fully covered center, but confine the shoulders to the actual
    // track corridor. A six-metre-wide pale apron made each branch a crossbar.
    wear = Math.max(wear, (1 - smooth(1.25, 4.4, radius)) * (1 - smooth(1.05, 1.95, road)));
  }
  return wear;
}

/** One terrain-following mesh contains continuous ruts and their shared aprons.
 * Branch ribbons fade under a single worn surface instead of ending abruptly. */
export function buildQuailTrackGeometry(landscape: LandscapeModel): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const world = { x: 0, z: 0 }, color = new THREE.Color();
  const dryWheel = new THREE.Color(0xb1986d), compacted = new THREE.Color(0x92794f);
  const wheelHighlight = new THREE.Color(0xb8a078);
  const dampEarth = new THREE.Color(0x766c4d), lowGrowth = new THREE.Color(0x85835a);
  const dryMedian = new THREE.Color(0xa5986b), verge = new THREE.Color(0x9c8c62);
  const network = quailTrackNetwork(landscape.area);
  const offsets = [-1.9, -1.3, -1.08, -.94, -.52, -.4, -.34, 0, .34, .4, .52, .94, 1.08, 1.3, 1.9];
  const opacity = [0, .10, .60, 1, .95, .7, .8, 1, .8, .7, .95, 1, .60, .10, 0];
  const vertex = (px: number, py: number, alpha: number) => {
    landscape.propertyToWorld(px, py, world);
    positions.push(world.x, 0, world.z);
    colors.push(color.r, color.g, color.b, alpha);
  };
  for (const points of network.paths) {
    for (let segment = 1; segment < points.length; segment++) {
      const a = points[segment - 1], b = points[segment];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      const previous = points[Math.max(0, segment - 2)], next = points[Math.min(points.length - 1, segment + 1)];
      const before = Math.hypot(a.x - previous.x, a.y - previous.y) || 1;
      const after = Math.hypot(next.x - b.x, next.y - b.y) || 1;
      const ax = dx / length + (a.x - previous.x) / before, ay = dy / length + (a.y - previous.y) / before;
      const bx = dx / length + (next.x - b.x) / after, by = dy / length + (next.y - b.y) / after;
      const al = Math.hypot(ax, ay), bl = Math.hypot(bx, by);
      const steps = Math.ceil(length / 1.1), start = positions.length / 3;
      for (let n = 0; n <= steps; n++) {
        const t = n / steps, cx = a.x + dx * t, cy = a.y + dy * t;
        const tx = ax / al * (1 - t) + bx / bl * t, ty = ay / al * (1 - t) + by / bl * t, tl = Math.hypot(tx, ty);
        const mx = cx * PROPERTY_PX_TO_M, mz = cy * PROPERTY_PX_TO_M;
        const draw = quailDrainageAt(cx, cy);
        const regrowth = trackWeather(mx + 47, mz - 29, 5.8);
        const weather = trackWeather(mx, mz, 13);
        const leftWear = smooth(.20, .78, trackWeather(mx - 19, mz + 37, 3.3));
        const rightWear = smooth(.20, .78, trackWeather(mx + 19, mz - 37, 3.3));
        for (let k = 0; k < offsets.length; k++) {
          const offset = offsets[k] * (1 + Math.sin((cx + cy) * .65) * .035) / PROPERTY_PX_TO_M;
          const px = cx - ty / tl * offset, py = cy + tx / tl * offset;
          const center = Math.abs(offsets[k]) <= .4;
          const wheel = Math.abs(offsets[k]) >= .52 && Math.abs(offsets[k]) <= 1.08;
          // Two independent 2–6m wear runs keep the wheel gauge legible while
          // revealing patches of soil/litter beneath each rut. The median is
          // mostly the real ground, with a subdued broken low-growth tint.
          const worn = offsets[k] < 0 ? leftWear : rightWear;
          let coverage: number;
          if (center) {
            color.copy(dryMedian).lerp(lowGrowth, .30 + regrowth * .55 + draw * .15);
            coverage = .18 + regrowth * .26;
          } else if (wheel) {
            color.copy(dryWheel).lerp(compacted, .20 + weather * .38 + (1 - worn) * .22);
            color.lerp(dampEarth, draw * (.22 + weather * .20));
            color.lerp(lowGrowth, (1 - worn) * regrowth * .28);
            color.lerp(wheelHighlight, .5);
            coverage = .46 + worn * .47;
          } else {
            color.copy(verge).lerp(lowGrowth, regrowth * .40).lerp(dampEarth, draw * .20);
            coverage = .35 + weather * .25;
          }
          vertex(px, py, opacity[k] * coverage * (1 - quailJunctionWearAt(landscape.area, px, py)));
          if (n < steps && k < offsets.length - 1) {
            const p = start + n * offsets.length + k;
            indices.push(p, p + 1, p + offsets.length, p + 1, p + offsets.length + 1, p + offsets.length);
          }
        }
      }
    }
  }
  // Appended after the faded ribbons so one material batch has deterministic
  // blending order at every junction. Vertices sample the same terrain.
  const radius = 5.5 / PROPERTY_PX_TO_M, divisions = 28;
  for (const branch of network.branches) {
    const start = positions.length / 3;
    for (let y = 0; y <= divisions; y++) for (let x = 0; x <= divisions; x++) {
      const px = branch.x - radius + 2 * radius * x / divisions;
      const py = branch.y - radius + 2 * radius * y / divisions;
      const wear = quailJunctionWearAt(landscape.area, px, py);
      const weather = trackWeather(px * PROPERTY_PX_TO_M + 19, py * PROPERTY_PX_TO_M - 37, 3.3);
      color.copy(dryWheel).lerp(compacted, .34 + weather * .34)
        .lerp(dampEarth, quailDrainageAt(px, py) * .32);
      vertex(px, py, wear);
    }
    for (let y = 0; y < divisions; y++) for (let x = 0; x < divisions; x++) {
      const p = start + y * (divisions + 1) + x;
      indices.push(p, p + divisions + 1, p + 1, p + 1, p + divisions + 1, p + divisions + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  const grounded = groundQuailTrackGeometry(landscape, geometry); geometry.dispose(); return grounded;
}
