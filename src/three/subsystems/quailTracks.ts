import * as THREE from 'three';
import type { AreaConfig } from '../../game/areas';
import type { Vec2 } from '../../game/types';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';
import { distanceToLine, trailDistanceAt } from '../../game/quailLandscape';
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

/** Common worn ground replaces stacked ribbon ends at a branch. Its footprint
 * follows the roads, leaving irregular shoulders rather than a circular pad. */
export function quailJunctionWearAt(area: AreaConfig, x: number, y: number): number {
  let wear = 0;
  for (const branch of quailTrackNetwork(area).branches) {
    const radius = Math.hypot(x - branch.x, y - branch.y) * PROPERTY_PX_TO_M;
    if (radius >= 5.3) continue;
    const road = quailTrackDistanceAt(area, x, y, 8) * PROPERTY_PX_TO_M;
    wear = Math.max(wear, (1 - smooth(2.4, 5.3, radius)) * (1 - smooth(1.6, 3.1, road)));
  }
  return wear;
}

/** One terrain-following mesh contains continuous ruts and their shared aprons.
 * Branch ribbons fade under a single worn surface instead of ending abruptly. */
export function buildQuailTrackGeometry(landscape: LandscapeModel): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const world = { x: 0, z: 0 }, color = new THREE.Color();
  const wornLitter = new THREE.Color(0x9c8b6c), dryCenter = new THREE.Color(0xaaa07b);
  const network = quailTrackNetwork(landscape.area);
  const offsets = [-1.9, -1.3, -1.08, -.94, -.52, -.4, -.34, 0, .34, .4, .52, .94, 1.08, 1.3, 1.9];
  const opacity = [0, .18, .8, 1, 1, 1, 1, 1, 1, 1, 1, 1, .8, .18, 0];
  const palette = [0x929074, 0x989478, 0xa49a79, 0xbda681, 0xbda681, 0x9c9777, 0x9a9875, 0x929373, 0x9a9875, 0x9c9777, 0xbda681, 0xbda681, 0xa49a79, 0x989478, 0x929074];
  const vertex = (px: number, py: number, tint: number, alpha: number, weather = 0, center = false) => {
    landscape.propertyToWorld(px, py, world);
    positions.push(world.x, 0, world.z);
    color.setHex(tint);
    if (weather > 0) color.lerp(center ? dryCenter : wornLitter, weather);
    color.multiplyScalar(.98 + Math.sin(px * 1.4 + Math.sin(py * 1.1)) * .018);
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
        // Broad interrupted wear is baked into the existing ribbon. Let real
        // ground show through the straw center and regrown wheel sections;
        // preserve the exact road footprint, joins and terrain-LOD fitting.
        const wear = .5 + .26 * Math.sin(cx * .24 + cy * .17)
          + .24 * Math.sin(cx * .061 - cy * .099 + 2.4);
        const regrowth = .5 + .5 * Math.sin(cx * .17 - cy * .13 + Math.sin(cx * .041));
        for (let k = 0; k < offsets.length; k++) {
          const offset = offsets[k] * (1 + Math.sin((cx + cy) * .65) * .035) / PROPERTY_PX_TO_M;
          const px = cx - ty / tl * offset, py = cy + tx / tl * offset;
          const center = Math.abs(offsets[k]) <= .4;
          const wheel = Math.abs(offsets[k]) >= .52 && Math.abs(offsets[k]) <= 1.08;
          const coverage = center ? .28 + regrowth * .30 : wheel ? .62 + wear * .38 : .75 + regrowth * .25;
          vertex(px, py, palette[k], opacity[k] * coverage * (1 - quailJunctionWearAt(landscape.area, px, py)),
            center ? .22 + wear * .28 : .10 + (1 - wear) * .24, center);
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
      vertex(px, py, 0xc1a77e, quailJunctionWearAt(landscape.area, px, py));
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
