import * as THREE from 'three';
import { QUAIL_COVERTS } from '../../game/quailComposition';
import type { AreaConfig } from '../../game/areas';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import { quailDrainageAt, quailSeed } from '../../game/quailLandscape';
import { quailTrackDistanceAt } from './quailTracks';
import { sampleQuailGroundHeights } from './quailGroundGeometry';
import { deriveQuailParkingPose } from './quailEntrances';

export interface QuailGrassDrift { x: number; y: number; rx: number; ry: number; angle: number; seed: number; core?: number }
interface DriftIndex { drifts: QuailGrassDrift[]; cells: Map<string, QuailGrassDrift[]> }
const layouts = new WeakMap<AreaConfig, DriftIndex>();
const CELL = 48;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Presentation of the shared South Gate route. Dry openings are outside the
 * main habitat; edge groups stay within its existing rectangles. The mask is
 * shared by surface paint and standing grass, including both distance layers. */
export const QUAIL_SOUTH_ROUTE = [
  { x: 481, y: 600, rx: 18, ry: 29, angle: -.08, kind: 'edge' },
  { x: 509, y: 553, rx: 16, ry: 19, angle: .45, kind: 'dry' },
  { x: 551, y: 572, rx: 25, ry: 14, angle: -.30, kind: 'edge' },
  { x: 550, y: 479, rx: 26, ry: 32, angle: .18, kind: 'dry' },
  { x: 612, y: 395, rx: 16, ry: 23, angle: -.55, kind: 'edge' },
  { x: 644, y: 350, rx: 18, ry: 30, angle: .28, kind: 'edge' },
] as const;
export interface QuailRouteSurface { dry: number; edge: number }
export function quailSouthRouteAt(x: number, y: number, out: QuailRouteSurface): QuailRouteSurface {
  out.dry = 0; out.edge = 0;
  if (x < 450 || x > 685 || y < 310 || y > 635) return out;
  for (const zone of QUAIL_SOUTH_ROUTE) {
    const dx = x - zone.x, dy = y - zone.y, c = Math.cos(zone.angle), s = Math.sin(zone.angle);
    const u = (dx * c + dy * s) / zone.rx, v = (-dx * s + dy * c) / zone.ry;
    const rim = 1 + Math.sin(x * .24 + y * .07) * .07 + Math.cos(y * .21) * .05;
    out[zone.kind] = Math.max(out[zone.kind], 1 - smooth((Math.hypot(u, v) / rim - .40) / .60));
  }
  return out;
}

/** Deliberate openings separate the entry's warm bunchgrass groups. Remaining
 * groups inherit the shared cover anchors; no hunting habitat is added here. */
export function quailGrassDrifts(area: AreaConfig): readonly QuailGrassDrift[] {
  return driftIndex(area).drifts;
}

function driftIndex(area: AreaConfig): DriftIndex {
  const saved = layouts.get(area); if (saved) return saved;
  const drifts: QuailGrassDrift[] = [];
  const add = (x: number, y: number, rx: number, ry: number, angle: number, seed: number, core?: number) => drifts.push({ x, y, rx, ry, angle, seed, core });
  if (area.id === 'quail-fields') {
    for (const [x, y, rx, ry, angle] of [
      // Near verges frame the arrival before the first shared hunting patch.
      [494, 652, 8, 3.8, -.4], [517, 644, 10, 4, .3], [487, 639, 11, 5, -.35],
      [499, 630, 8, 3.5, .45], [524, 627, 13, 5, -.2], [483, 624, 9, 4, .15],
      [48, 416, 3.8, 8, -.4], [57, 393, 4, 10, .3], [65, 423, 5, 11, -.35],
      [76, 411, 3.5, 8, .45], [73, 386, 5, 13, -.2],
      [484, 615, 12, 5, -.25], [526, 607, 13, 5.5, .45], [484, 590, 15, 6, .2],
      [520, 583, 15, 5, -.35], [505, 601, 10, 4, .7],
      [87, 391, 13, 5, .3], [118, 386, 12, 5, -.2], [94, 425, 15, 5.5, -.35],
      [123, 418, 11, 5, .5], [110, 406, 9, 4, .2],
      // Broad shoulders link the small verge bunches into readable grass
      // stands. The road and crossing stay open between these planted banks.
      [481, 607, 16, 14, .2], [533, 616, 13, 20, -.15],
      [548, 586, 21, 14, .25], [484, 578, 19, 11, -.3],
      [91, 429, 18, 12, .1], [93, 381, 20, 12, .05],
      [632, 362, 22, 13, -.5], [667, 329, 19, 12, -.3],
      // The near cover edge, second covert and draw shoulder form a sequence
      // along the shared track. Short-grass crossings separate those groups.
      [475, 611, 10, 13, -.15], [479, 592, 11, 15, .10], [482, 579, 10, 10, -.3],
      [537, 581, 12, 10, -.30], [555, 574, 15, 10, -.25], [575, 563, 12, 11, .15],
      [609, 408, 11, 13, -.35], [615, 390, 12, 13, -.5],
      [636, 362, 12, 14, .3], [645, 343, 14, 15, .2],
      // Low irregular aprons tie the existing plum/wood kit into the route.
      // The open crossings stay open; these are small shoulder extensions,
      // not a property-wide density increase or new hunting-cover patches.
      [525, 566, 12, 5, -.35], [570, 549, 13, 6, -.5],
      // Overlapping shoulders lead into the draw instead of leaving a line
      // of detached planted islands. Existing casting gaps and road clearance
      // still cut through these visual aprons in the placement consumer.
      [613, 328, 20, 10, -.24], [691, 291, 21, 10, -.5],
      [720, 298, 17, 9, -.2], [663, 348, 20, 10, -.15],
      // The returning hunter sees one uneven apron attached to the windmill
      // plum end, with a lower opening to its east, rather than six small dots.
      [865, 287, 22, 12, .15], [848, 279, 22, 11, .15],
      [880, 263, 18, 11, .45], [813, 231, 18, 8, -.4],
      [891, 290, 17, 10, .45], [840, 248, 18, 8, .2],
    ]) add(x, y, rx, ry, angle, quailSeed(x, y, 61));
    for (const covert of QUAIL_COVERTS) for (let i = 1; i < covert.points.length; i++) {
      const a = covert.points[i - 1], b = covert.points[i];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
      const rng = mulberry32(quailSeed(a.x, a.y, 63));
      // Native grass makes an uneven apron around the plum spine. Following
      // the real edge removes the repeated axis-aligned rectangle islands.
      for (let n = 0; n < 6; n++) {
        const t = .14 + Math.floor(n / 2) * .34;
        const offset = (n % 2 ? -1 : 1) * (covert.plumWidth + 3 + rng() * 5);
        const x = a.x + dx * t - dy / length * offset;
        const y = a.y + dy * t + dx / length * offset;
        const connected = covert.id === 'drainage-shoulder' || covert.id === 'windmill-plum';
        const rx = Math.max(12, length * .25) * (.85 + rng() * .24) * (connected ? 1.30 : 1);
        const ry = (6 + rng() * 5) * (connected ? 1.20 : 1);
        // These two long edges need a substantial common shoulder. The old
        // narrow cores fell away between segment samples, so both near plants
        // and far underpaint became isolated ellipses around the refuge.
        add(x, y, rx, ry, angle + (rng() - .5) * .22, quailSeed(Math.round(x), Math.round(y), 67), connected ? .48 : undefined);
      }
    }
  }
  const cells = new Map<string, QuailGrassDrift[]>();
  for (const drift of drifts) {
    const r = Math.hypot(drift.rx, drift.ry) * 1.2;
    for (let y = Math.floor((drift.y - r) / CELL); y <= Math.floor((drift.y + r) / CELL); y++)
      for (let x = Math.floor((drift.x - r) / CELL); x <= Math.floor((drift.x + r) / CELL); x++) {
        const key = `${x},${y}`; const cell = cells.get(key) ?? []; cell.push(drift); cells.set(key, cell);
      }
  }
  const result = { drifts, cells }; layouts.set(area, result); return result;
}

function driftShape(drift: QuailGrassDrift, x: number, y: number): number {
  const dx = x - drift.x, dy = y - drift.y, c = Math.cos(drift.angle), s = Math.sin(drift.angle);
  const u = (dx * c + dy * s) / drift.rx, v = (-dx * s + dy * c) / drift.ry;
  const edge = 1 + .11 * Math.sin(u * 7 + drift.seed % 11) + .08 * Math.sin(v * 5 - u * 4);
  const core = drift.core ?? .35;
  return 1 - smooth((Math.hypot(u, v) / edge - core) / (1 - core));
}

/** One presentation mask controls dense clump groups, underpaint and far cover. */
export function quailGrassMassAt(area: AreaConfig, x: number, y: number): number {
  let mass = 0;
  for (const drift of driftIndex(area).cells.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? [])
    mass = Math.max(mass, driftShape(drift, x, y));
  return mass;
}

/** Metre-scale gaps within the broad authored groups, stable across tiles and
 * graphics tiers. This changes visual stocking, never the shared habitat. */
export function quailGrassStockingAt(x: number, y: number): number {
  const gx = (x + Math.sin(y * .037) * 3.5) / 6.8, gy = (y + Math.sin(x * .031) * 2.8) / 6.8, ix = Math.floor(gx), iy = Math.floor(gy);
  const u = smooth(gx - ix), v = smooth(gy - iy);
  const value = (dx: number, dy: number) => mulberry32(quailSeed(ix + dx, iy + dy, 113))();
  const a = value(0, 0) * (1 - u) + value(1, 0) * u;
  const b = value(0, 1) * (1 - u) + value(1, 1) * u;
  return smooth((a * (1 - v) + b * v - .25) / .50);
}

/** Preserve a usable verge and the actual pickup bay, rather than mowing a
 * large circular hole through both shoulders around each drop. */
export function quailGrassClearingAt(area: AreaConfig, x: number, y: number): boolean {
  return area.dropPoints.some(drop => {
    if (Math.hypot(x - drop.position.x, y - drop.position.y) * PROPERTY_PX_TO_M < 2.7) return true;
    const parking = deriveQuailParkingPose(area, drop.id); if (!parking) return false;
    const dx = (x - parking.position.x) * PROPERTY_PX_TO_M, dz = (y - parking.position.y) * PROPERTY_PX_TO_M;
    const c = Math.cos(parking.yaw), s = Math.sin(parking.yaw);
    // Vehicle half extents plus the grass clump radius and walking room.
    return Math.abs(dx * c - dz * s) < 2.55 && Math.abs(dx * s + dz * c) < 3.8;
  });
}

/** Low, irregular cover volumes preserve the same groups beyond individual
 * leaf range. Each vertex follows the terrain; there is no flat support disc. */
export function buildQuailDistantCover(landscape: LandscapeModel): THREE.BufferGeometry[] {
  const groups = new Map<string, { position: number[]; color: number[]; index: number[] }>();
  const color = new THREE.Color(), straw = new THREE.Color(0xb4a274), fringe = new THREE.Color(0x89916c), damp = new THREE.Color(0x7e916d);
  for (const drift of quailGrassDrifts(landscape.area)) {
    const key = `${Math.floor(drift.x / 300)},${Math.floor(drift.y / 350)}`;
    const data = groups.get(key) ?? { position: [], color: [], index: [] }; groups.set(key, data);
    const start = data.position.length / 3, c = Math.cos(drift.angle), s = Math.sin(drift.angle);
    for (let along = 0; along <= 6; along++) for (let across = 0; across <= 2; across++) {
      const u = along / 3 - 1, v = across - 1;
      const width = Math.sqrt(Math.max(0, 1 - u * u)) * (1 + .12 * Math.sin(along * 2.1 + drift.seed % 7));
      const localX = u * drift.rx, localY = v * drift.ry * width;
      const px = drift.x + localX * c - localY * s, py = drift.y + localX * s + localY * c;
      const world = landscape.propertyToWorld(px, py, { x: 0, z: 0 });
      const mass = quailGrassMassAt(landscape.area, px, py), drain = quailDrainageAt(px, py);
      const road = quailTrackDistanceAt(landscape.area, px, py, 16) * PROPERTY_PX_TO_M;
      const clearance = smooth((road - 2.1) / 2.5);
      const ground = sampleQuailGroundHeights(landscape, px, py);
      const height = (.14 + mass * .46) * (1 - Math.abs(u) * .45) * clearance;
      data.position.push(world.x, Math.max(ground.nearY, ground.farY) + .018 + height, world.z);
      color.copy(fringe).lerp(straw, mass * .8).lerp(damp, drain * .48).multiplyScalar(.94 + Math.sin(along * 1.7 + drift.seed % 9) * .045);
      data.color.push(color.r, color.g, color.b, (across === 1 ? .96 : .06) * (1 - Math.abs(u) ** 4) * clearance);
    }
    for (let along = 0; along < 6; along++) for (let across = 0; across < 2; across++) {
      const a = start + along * 3 + across, b = a + 3;
      data.index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return [...groups.values()].map(data => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.color, 4));
    geometry.setIndex(data.index); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
  });
}
