import * as THREE from 'three';
import type { Vec2 } from '../../game/types';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';
import { deriveQuailEntrances, type QuailEntranceSegment } from './quailEntrances';

/** Exact perimeter gaps are occupied by the closed service gates. Lane wings
 * connect their posts to the unchanged inset gates; no disconnected stubs. */
export function quailFenceSegments(landscape: LandscapeModel): { perimeter: QuailEntranceSegment[]; lanes: QuailEntranceSegment[] } {
  const { x, y, w, h } = landscape.area.world;
  const corners = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }];
  const entrances = deriveQuailEntrances(landscape.area), perimeter: QuailEntranceSegment[] = [];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1], b = corners[i];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    const t = (p: Vec2) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / (length * length);
    const onLine = (p: Vec2) => Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length < 1e-6;
    const cuts = entrances.filter(e => onLine(e.boundaryOpening.a) && onLine(e.boundaryOpening.b))
      .map(e => [t(e.boundaryOpening.a), t(e.boundaryOpening.b)].sort((u, v) => u - v))
      .sort((u, v) => u[0] - v[0]);
    const point = (value: number) => ({ x: a.x + dx * value, y: a.y + dy * value });
    let previous = 0;
    for (const [from, to] of cuts) { if (from > previous) perimeter.push({ a: point(previous), b: point(from) }); previous = to; }
    if (previous < 1) perimeter.push({ a: point(previous), b });
  }
  return { perimeter, lanes: entrances.flatMap(e => [...e.laneFences]) };
}

/** Follows terrain between posts, including short folds beneath the wire. */
export function buildQuailFenceGeometry(landscape: LandscapeModel): {
  posts: Vec2[]; wires: THREE.BufferGeometry; laneObstacles: { x: number; z: number; radius: number }[];
} {
  const segments = quailFenceSegments(landscape), posts: Vec2[] = [], wires: number[] = [], laneObstacles: { x: number; z: number; radius: number }[] = [];
  const anchors = deriveQuailEntrances(landscape.area).flatMap(e => [...e.insetWingPosts, ...e.boundaryGatePosts]);
  const postKeys = new Set<string>();
  const position = (p: Vec2) => { const world = landscape.propertyToWorld(p.x, p.y, { x: 0, z: 0 }); return { ...world, y: landscape.heightAtProperty(p.x, p.y) }; };
  for (const segment of [...segments.perimeter, ...segments.lanes]) {
    const { a, b } = segment, length = Math.hypot(b.x - a.x, b.y - a.y);
    const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const postCount = Math.ceil(length / 9), wireCount = Math.ceil(length / 2.5);
    for (let n = 0; n <= postCount; n++) {
      const p = at(n / postCount), key = `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
      if (postKeys.has(key) || anchors.some(v => Math.hypot(v.x - p.x, v.y - p.y) < .001)) continue;
      postKeys.add(key); posts.push(p);
    }
    for (let n = 1; n <= wireCount; n++) {
      const from = position(at((n - 1) / wireCount)), to = position(at(n / wireCount));
      for (const height of [.52, .93, 1.22]) wires.push(from.x, from.y + height, from.z, to.x, to.y + height, to.z);
    }
  }
  // The rectangular play bound handles the perimeter. Small overlapping
  // circles make the new inner lane wires solid to the hunter as well.
  for (const { a, b } of segments.lanes) {
    const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * PROPERTY_PX_TO_M / .65);
    for (let n = 0; n <= count; n++) {
      const p = landscape.propertyToWorld(a.x + (b.x - a.x) * n / count, a.y + (b.y - a.y) * n / count, { x: 0, z: 0 });
      laneObstacles.push({ ...p, radius: .06 });
    }
  }
  return { posts, wires: new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)), laneObstacles };
}
