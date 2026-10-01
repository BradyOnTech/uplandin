import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import {
  QUAIL_BURN, QUAIL_CREEK, QUAIL_CREEK_BED, QUAIL_FIREBREAK, QUAIL_OLD_FENCE, QUAIL_RAKE, quailBurnAt, quailCreekAt,
} from '../../game/quailFeatures';
import type { Vec2 } from '../../game/types';
import { Kit, place, stone } from '../lowPolyKit';
import { applyQuailTrackGroundLod, groundQuailTrackGeometry, sampleQuailGroundHeights } from './quailGroundGeometry';

/**
 * Quail Fields' history (see game/quailFeatures.ts): the old line fence in
 * its plums, a horse-drawn dump rake rusting beside it, the dry sand creek
 * down the draw and this spring's prescribed burn with its disked firebreak.
 */
export interface QuailHistoryHost {
  landscape: LandscapeModel;
  quality: 'high' | 'lite';
  castShadow: boolean;
  obstacles: { x: number; z: number; radius: number }[];
  addSolid(mesh: THREE.Mesh): void;
  keep(object: THREE.Object3D): void;
  own(resource: THREE.BufferGeometry | THREE.Material): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const scratch = { x: 0, y: 0 };
/** The rendered near ground, which props must sit on, not the analytic surface. */
function groundOf(landscape: LandscapeModel): (x: number, z: number) => number {
  return (x, z) => { landscape.worldToProperty(x, z, scratch); return sampleQuailGroundHeights(landscape, scratch.x, scratch.y).nearY; };
}

/** A pipe or stick between two world points. */
function rod(kit: Kit, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number, sides = 5): void {
  const direction = b.clone().sub(a), length = direction.length();
  if (length < .001) return;
  kit.add(new THREE.CylinderGeometry(radius, radius, length, sides, 1), color, new THREE.Matrix4().compose(
    a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
    new THREE.Vector3(1, 1, 1)));
}

export function buildQuailHistory(host: QuailHistoryHost): void {
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const decal = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  applyQuailTrackGroundLod(decal, host.quality);
  host.own(solid); host.own(decal);
  buildOldFence(host, solid);
  buildRake(host, solid);
  buildCreek(host, solid, decal);
  buildBurn(host, solid, decal);
}

function keepMesh(host: QuailHistoryHost, kit: Kit, name: string, material: THREE.Material, options: { solid?: boolean; shadow?: boolean } = {}): void {
  if (kit.empty) return;
  const mesh = new THREE.Mesh(kit.build(), material);
  mesh.name = name; mesh.castShadow = (options.shadow ?? true) && host.castShadow; mesh.receiveShadow = true;
  host.own(mesh.geometry); host.keep(mesh);
  if (options.solid) host.addSolid(mesh);
}

/** Cedar posts gone grey and leaning, a few down, with three strands of
 * rusted wire sagging between them or snapped and lying in the grass. */
function buildOldFence(host: QuailHistoryHost, material: THREE.Material): void {
  const { landscape } = host, groundAt = groundOf(landscape), kit = new Kit(), rng = mulberry32(81011);
  const world = (p: Vec2) => landscape.propertyToWorld(p.x, p.y, { x: 0, z: 0 });
  let previous: { top: THREE.Vector3[] } | undefined;
  for (let s = 1; s < QUAIL_OLD_FENCE.length; s++) {
    const a = world(QUAIL_OLD_FENCE[s - 1]), b = world(QUAIL_OLD_FENCE[s]);
    const length = Math.hypot(b.x - a.x, b.z - a.z), count = Math.ceil(length / 4.6);
    for (let i = s === 1 ? 0 : 1; i <= count; i++) {
      const t = i / count, x = a.x + (b.x - a.x) * t + (rng() - .5) * .3, z = a.z + (b.z - a.z) * t + (rng() - .5) * .3;
      const ground = groundAt(x, z), roll = rng();
      if (roll < .12) { previous = undefined; continue; }
      if (roll < .22) {
        // Rotted off at the ground and lying where it fell.
        const yaw = rng() * Math.PI * 2;
        rod(kit, V(x, ground + .08, z), V(x + Math.cos(yaw) * 1.25, groundAt(x + Math.cos(yaw) * 1.25, z + Math.sin(yaw) * 1.25) + .08, z + Math.sin(yaw) * 1.25), .075, 0x6f685c);
        previous = undefined; continue;
      }
      const lean = (rng() - .5) * .45, leanAt = rng() * Math.PI * 2, height = 1.1 + rng() * .25;
      const top = V(x + Math.cos(leanAt) * Math.sin(lean) * height, ground + Math.cos(lean) * height, z + Math.sin(leanAt) * Math.sin(lean) * height);
      rod(kit, V(x, ground - .2, z), top, .075, rng() < .5 ? 0x7f786a : 0x8c8474);
      const heights = [.45, .75, 1.02].map(h => V(x, ground - .2, z).lerp(top, (h + .2) / (height + .2)));
      if (previous) for (let k = 0; k < 3; k++) {
        const from = previous.top[k], to = heights[k];
        if (rng() < .18) {
          // A snapped strand: each end hangs down into the grass.
          for (const [end, other] of [[from, to], [to, from]] as const) {
            const droop = end.clone().lerp(other, .3);
            droop.y = groundAt(droop.x, droop.z) + .05;
            rod(kit, end, droop, .009, 0x6b5444, 3);
          }
          continue;
        }
        const mid = from.clone().add(to).multiplyScalar(.5);
        mid.y -= .12 + rng() * .18;
        rod(kit, from, mid, .008, 0x6b5444, 3); rod(kit, mid, to, .008, 0x6b5444, 3);
      }
      previous = { top: heights };
      host.obstacles.push({ x, z, radius: .14 });
    }
  }
  keepMesh(host, kit, 'Quail old line fence', material, { shadow: false });
}

/** A horse-drawn dump rake: two tall spoked steel wheels, a row of curved
 * tines, the seat on its spring stalk and the shafts down in the plums. */
function buildRake(host: QuailHistoryHost, material: THREE.Material): void {
  const { landscape } = host, groundAt = groundOf(landscape), kit = new Kit(), rng = mulberry32(3301);
  const centre = landscape.propertyToWorld(QUAIL_RAKE.x, QUAIL_RAKE.y, { x: 0, z: 0 });
  const cos = Math.cos(QUAIL_RAKE.angle), sin = Math.sin(QUAIL_RAKE.angle);
  // Local u: along the axle; v: forward toward the shafts.
  const at = (u: number, v: number, y: number) => V(centre.x + u * cos - v * sin, y, centre.z + u * sin + v * cos);
  const ground = (u: number, v: number) => { const p = at(u, v, 0); return groundAt(p.x, p.z); };
  const rust = [0x6e3f26, 0x7d4a2c, 0x5b3a28, 0x80523a];
  const R = .7, track = 1.45, sink = .08;
  for (const side of [-1, 1]) {
    const hubY = ground(side * track, 0) + R - sink - (side > 0 ? .06 : 0);
    const hub = at(side * track, 0, hubY);
    const wheel = new THREE.Matrix4().compose(hub, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -QUAIL_RAKE.angle + Math.PI / 2, side > 0 ? .07 : 0, 'YXZ')), V(1, 1, 1));
    kit.add(new THREE.TorusGeometry(R, .035, 4, 20), rust[0], wheel);
    kit.add(new THREE.CylinderGeometry(.09, .09, .22, 8).rotateX(Math.PI / 2), rust[2], wheel);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const tip = V(Math.cos(a) * R, Math.sin(a) * R, 0).applyMatrix4(wheel);
      rod(kit, hub, tip, .014, rust[1], 4);
    }
    host.obstacles.push({ x: hub.x, z: hub.z, radius: .55 });
  }
  const axleY = ground(0, 0) + R - sink - .03;
  rod(kit, at(-track, 0, axleY), at(track, 0, axleY), .035, rust[2]);
  // Rake head and the tines hanging from it, curling forward to the ground.
  const headY = axleY - .05;
  rod(kit, at(-track + .15, -.35, headY), at(track - .15, -.35, headY), .04, rust[3]);
  for (let i = 0; i < 22; i++) {
    const u = -track + .25 + i * (track * 2 - .5) / 21;
    if (rng() < .08) continue;
    const g = ground(u, -.3), bend = (rng() - .5) * .1;
    const p0 = at(u, -.35, headY), p1 = at(u + bend, -.75, headY - .3), p2 = at(u + bend, -.82, g + .2), p3 = at(u + bend * 1.4, -.55, g + .04);
    rod(kit, p0, p1, .012, rust[i % 4], 3); rod(kit, p1, p2, .012, rust[i % 4], 3); rod(kit, p2, p3, .012, rust[i % 4], 3);
  }
  // Seat on a curved spring stalk above the axle.
  const stalk = [at(0, -.1, axleY), at(0, .15, axleY + .45), at(0, .05, axleY + .85)];
  rod(kit, stalk[0], stalk[1], .03, rust[2]); rod(kit, stalk[1], stalk[2], .03, rust[2]);
  kit.add(new THREE.CylinderGeometry(.24, .2, .07, 10), 0x4f4034, place(stalk[2].x, stalk[2].y + .04, stalk[2].z, .12, -QUAIL_RAKE.angle, 0));
  // Shafts run forward and rest on the ground.
  for (const side of [-1, 1]) {
    const from = at(side * .45, .1, axleY), to = at(side * .55, 2.7, ground(side * .55, 2.7) + .05);
    rod(kit, from, to, .035, 0x5a4a3a);
  }
  rod(kit, at(-.45, .8, axleY - .18), at(.45, .8, axleY - .18), .025, rust[2]);
  // The dump trip lever, still upright.
  rod(kit, at(.7, -.1, axleY), at(.8, -.2, axleY + .75), .018, rust[0], 4);
  host.obstacles.push({ x: centre.x, z: centre.z, radius: .7 });
  keepMesh(host, kit, 'Quail dump rake', material, { solid: true });
}

/** A strip on the ground along a polyline, coloured across its width; the
 * same grounding and distance LOD as the farm tracks. */
function drape(host: QuailHistoryHost, line: readonly Vec2[], halfWidth: (s: number) => number, color: (across: number, s: number) => [THREE.Color, number]): THREE.BufferGeometry {
  const { landscape } = host, positions: number[] = [], colors: number[] = [], index: number[] = [];
  const points = line.map(p => landscape.propertyToWorld(p.x, p.y, { x: 0, z: 0 }));
  const lanes = [-1, -.6, -.2, .2, .6, 1];
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    if (i) s += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    const dx = next.x - prev.x, dz = next.z - prev.z, length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length, nz = dx / length, w = halfWidth(s);
    for (const across of lanes) {
      const [c, a] = color(across, s);
      positions.push(points[i].x + nx * across * w, 0, points[i].z + nz * across * w); colors.push(c.r, c.g, c.b, a);
    }
    if (i) for (let k = 1; k < lanes.length; k++) {
      const row = i * lanes.length, prior = row - lanes.length;
      index.push(prior + k - 1, row + k - 1, row + k, prior + k - 1, row + k, prior + k);
    }
  }
  return grounded(host, positions, colors, index);
}

function grounded(host: QuailHistoryHost, positions: number[], colors: number[], index: number[]): THREE.BufferGeometry {
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  source.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  source.setIndex(index);
  const geometry = groundQuailTrackGeometry(host.landscape, source);
  source.dispose();
  return geometry;
}

/** The dry creek: a pale sand bed, darker cut banks, cobble bars and
 * bleached drift caught where the water left it. */
function buildCreek(host: QuailHistoryHost, material: THREE.Material, decal: THREE.Material): void {
  const { landscape } = host, groundAt = groundOf(landscape), rng = mulberry32(2707);
  const sand = new THREE.Color(0xcfbb92), damp = new THREE.Color(0xb39f78), bank = new THREE.Color(0x7f6a4c), c = new THREE.Color();
  const reach = QUAIL_CREEK_BED.halfWidth + QUAIL_CREEK_BED.bank * .8;
  const geometry = drape(host, QUAIL_CREEK, () => reach, (across, s) => {
    const r = Math.abs(across) * reach;
    if (r <= QUAIL_CREEK_BED.halfWidth) {
      // Ripples of finer and coarser sand down the bed.
      return [c.copy(sand).lerp(damp, (Math.sin(s * .7 + across * 3) * .5 + .5) * .35), .92];
    }
    return [c.copy(bank), .85 * (1 - (r - QUAIL_CREEK_BED.halfWidth) / (reach - QUAIL_CREEK_BED.halfWidth) * .6)];
  });
  const bed = new THREE.Mesh(geometry, decal);
  bed.name = 'Quail dry creek bed'; bed.receiveShadow = true; bed.renderOrder = -2;
  host.own(geometry); host.keep(bed);
  const kit = new Kit(), drift = new Kit();
  const points = QUAIL_CREEK.map(p => landscape.propertyToWorld(p.x, p.y, { x: 0, z: 0 }));
  const greys = [0x9d968a, 0x857f74, 0xb2a993, 0x7a7266, 0xa08f78];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    const nx = -dz / length, nz = dx / length;
    // Gravel bars at the inside of bends.
    const stones = rng() < .35 ? 6 + Math.floor(rng() * 8) : 1;
    for (let k = 0; k < stones; k++) {
      const t = rng(), across = (rng() - .5) * QUAIL_CREEK_BED.halfWidth * 1.7, size = .05 + rng() * rng() * .2;
      const x = a.x + dx * t + nx * across, z = a.z + dz * t + nz * across;
      kit.add(stone(rng), greys[Math.floor(rng() * greys.length)], place(x, groundAt(x, z) + size * .2, z, rng() * 3, rng() * 6, rng() * 3, size * 1.2, size * .6, size), .1, rng);
    }
    // Now and then a bleached limb left by the last flood.
    if (rng() < .045) {
      const yaw = Math.atan2(dz, dx) + (rng() - .5) * 1.4, half = .9 + rng() * 1.2;
      const x = a.x + nx * (rng() - .5) * 1.5, z = a.z + nz * (rng() - .5) * 1.5;
      const from = V(x - Math.cos(yaw) * half, 0, z - Math.sin(yaw) * half), to = V(x + Math.cos(yaw) * half, 0, z + Math.sin(yaw) * half);
      from.y = groundAt(from.x, from.z) + .1; to.y = groundAt(to.x, to.z) + .12;
      rod(drift, from, to, .08 + rng() * .08, 0xa59d8c, 6);
      const twig = from.clone().lerp(to, .6);
      rod(drift, twig, twig.clone().add(V(Math.cos(yaw + 1) * .7, .25, Math.sin(yaw + 1) * .7)), .03, 0x9a917f, 4);
      host.obstacles.push({ x, z, radius: .3 });
    }
  }
  keepMesh(host, kit, 'Quail creek cobbles', material, { shadow: false });
  keepMesh(host, drift, 'Quail creek drift', material, { shadow: true });
}

/** The prescribed burn: black ground with ash drifts and the first green,
 * charred sage skeletons, and the disked firebreak along its north side. */
function buildBurn(host: QuailHistoryHost, material: THREE.Material, decal: THREE.Material): void {
  const { landscape } = host, groundAt = groundOf(landscape), rng = mulberry32(6151);
  const char = new THREE.Color(0x2a2622), ash = new THREE.Color(0x7c776d), green = new THREE.Color(0x5d6b3c), c = new THREE.Color();
  const positions: number[] = [], colors: number[] = [], index: number[] = [];
  const reach = QUAIL_BURN.rx * 1.2, step = 2.2, columns = Math.ceil(reach * 2 / step) + 1;
  const used = new Map<number, number>();
  const vertex = (i: number, j: number) => {
    const key = j * columns + i, saved = used.get(key);
    if (saved !== undefined) return saved;
    const px = QUAIL_BURN.x - reach + i * step, py = QUAIL_BURN.y - reach + j * step;
    const w = landscape.propertyToWorld(px, py, { x: 0, z: 0 });
    const n = Math.sin(px * .21 + Math.sin(py * .17) * 2) * .5 + .5, m = Math.sin(py * .13 - px * .07 + 1.3) * .5 + .5;
    c.copy(char).lerp(ash, n * n * .55).lerp(green, m > .78 ? (m - .78) * 2.4 : 0);
    positions.push(w.x, 0, w.z); colors.push(c.r, c.g, c.b, quailBurnAt(px, py) * .9);
    used.set(key, positions.length / 3 - 1);
    return positions.length / 3 - 1;
  };
  for (let j = 0; j < columns - 1; j++) for (let i = 0; i < columns - 1; i++) {
    const px = QUAIL_BURN.x - reach + i * step, py = QUAIL_BURN.y - reach + j * step;
    if (Math.max(quailBurnAt(px, py), quailBurnAt(px + step, py), quailBurnAt(px, py + step), quailBurnAt(px + step, py + step)) === 0) continue;
    const a = vertex(i, j), b = vertex(i + 1, j), d = vertex(i + 1, j + 1), e = vertex(i, j + 1);
    index.push(a, b, d, a, d, e);
  }
  const geometry = grounded(host, positions, colors, index);
  const black = new THREE.Mesh(geometry, decal);
  black.name = 'Quail prescribed burn'; black.receiveShadow = true; black.renderOrder = -2;
  host.own(geometry); host.keep(black);
  // Disked firebreak: turned soil in stripes along the furrows.
  const soil = new THREE.Color(0x8a7458), turned = new THREE.Color(0x6c5a44);
  const breakGeometry = drape(host, QUAIL_FIREBREAK, () => 2.1, across => [c.copy(Math.round((across + 1) * 2.5) % 2 ? soil : turned), Math.abs(across) > .9 ? .55 : .95]);
  const firebreak = new THREE.Mesh(breakGeometry, decal);
  firebreak.name = 'Quail burn firebreak'; firebreak.receiveShadow = true; firebreak.renderOrder = -2;
  host.own(breakGeometry); host.keep(firebreak);
  // Sage and plum burned back to black skeletons.
  const kit = new Kit();
  let placed = 0;
  for (let attempt = 0; attempt < 400 && placed < 34; attempt++) {
    const px = QUAIL_BURN.x + (rng() - .5) * QUAIL_BURN.rx * 2, py = QUAIL_BURN.y + (rng() - .5) * QUAIL_BURN.ry * 2;
    if (quailBurnAt(px, py) < .9 || quailCreekAt(px, py) > 0) continue;
    placed++;
    const w = landscape.propertyToWorld(px, py, { x: 0, z: 0 }), g = groundAt(w.x, w.z);
    const base = V(w.x, g - .02, w.z), stems = 4 + Math.floor(rng() * 4), size = .45 + rng() * .5;
    for (let k = 0; k < stems; k++) {
      const a = rng() * Math.PI * 2, tip = base.clone().add(V(Math.cos(a) * size * .45, size * (.6 + rng() * .4), Math.sin(a) * size * .45));
      rod(kit, base, tip, .012, k % 2 ? 0x1f1c19 : 0x2d2924, 3);
      const fork = base.clone().lerp(tip, .55);
      rod(kit, fork, fork.clone().add(V(Math.cos(a + 1.2) * size * .25, size * .25, Math.sin(a + 1.2) * size * .25)), .008, 0x262320, 3);
    }
  }
  keepMesh(host, kit, 'Quail burned brush', material, { shadow: false });
}

