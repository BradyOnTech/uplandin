import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import { CHUKAR_GUZZLER, CHUKAR_SPRING_SEAM, chukarSeamAt } from '../../game/chukarHabitat';
import { CHUKAR_PLACES } from '../../game/chukarRidge';
import { Kit, place, stone } from '../lowPolyKit';
import { CHUKAR_GROUND_DETAIL } from './chukarTerrain';
import { applyQuailTrackGroundLod, groundQuailTrackGeometry, sampleQuailGroundHeights } from './quailGroundGeometry';

/**
 * Chukar Ridge's remembered places, each the landmark of a hunt area (see
 * game/chukarRidge.ts): the sheepherder's cairn on the High Bench, a juniper
 * snag above Sage Draw, the guzzler on the West Bench, the spring and its
 * seam of willow and rose in Spring Creek, the line camp corral on the Rim
 * Flat, a homesteader's cabin chimney in the River Breaks and Split Rock
 * under the North Face. The seam's green grass is planted by the environment.
 */
const CHUKAR_SHEEP_CAIRN = CHUKAR_PLACES.cairn, CHUKAR_JUNIPER_SNAG = CHUKAR_PLACES.snag;

/** Solid or bare footprints (metres) that plants keep out of. */
export function chukarHistoryOccupies(x: number, y: number, radius: number): boolean {
  const near = (p: { x: number; y: number }, r: number) => Math.hypot(x - p.x, y - p.y) * .9144 < r + radius;
  return near(CHUKAR_SHEEP_CAIRN, 1.6) || near(CHUKAR_JUNIPER_SNAG, .9) || near(CHUKAR_GUZZLER, 6.2)
    || near(CHUKAR_PLACES.corral, 9) || near(CHUKAR_PLACES.chimney, 3.4) || near(CHUKAR_PLACES.splitRock, 3.6) || near(CHUKAR_SPRING_SEAM[0], 1.4);
}
export interface ChukarHistoryHost {
  landscape: LandscapeModel;
  quality: 'high' | 'lite';
  castShadow: boolean;
  obstacles: { x: number; z: number; radius: number }[];
  addSolid(mesh: THREE.Mesh): void;
  keep(object: THREE.Object3D): void;
  own(resource: THREE.BufferGeometry | THREE.Material): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function rod(kit: Kit, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number, sides = 5, tip = radius): void {
  const direction = b.clone().sub(a), length = direction.length();
  if (length < .001) return;
  kit.add(new THREE.CylinderGeometry(tip, radius, length, sides, 1), color, new THREE.Matrix4().compose(
    a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
    new THREE.Vector3(1, 1, 1)));
}

export function buildChukarHistory(host: ChukarHistoryHost): void {
  const detail = CHUKAR_GROUND_DETAIL[host.quality], scratch = { x: 0, y: 0 };
  // Sit on the rendered near ground, which is what the hunter sees.
  const groundAt = (x: number, z: number) => {
    host.landscape.worldToProperty(x, z, scratch);
    return sampleQuailGroundHeights(host.landscape, scratch.x, scratch.y, undefined, detail).nearY;
  };
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const leaves = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  host.own(solid); host.own(leaves);
  const keep = (kit: Kit, name: string, material: THREE.Material, shots: boolean, shadow = true) => {
    if (kit.empty) return;
    const mesh = new THREE.Mesh(kit.build(), material);
    mesh.name = name; mesh.castShadow = shadow && host.castShadow; mesh.receiveShadow = true;
    host.own(mesh.geometry); host.keep(mesh);
    if (shots) host.addSolid(mesh);
  };
  keep(buildCairn(host, groundAt), 'Chukar sheepherder cairn', solid, true);
  keep(buildSnag(host, groundAt), 'Chukar juniper snag', solid, true);
  keep(buildGuzzler(host, groundAt), 'Chukar wildlife guzzler', solid, true);
  const [willows, wet] = buildSeep(host, groundAt, detail);
  keep(willows, 'Chukar seep willows', leaves, false);
  if (wet) host.keep(wet);
  keep(buildCorral(host, groundAt), 'Chukar line camp corral', solid, true);
  keep(buildChimney(host, groundAt), 'Chukar cabin chimney', solid, true);
  keep(buildSplitRock(host, groundAt), 'Chukar split rock', solid, true);
}

/** A sheepherder's stone johnny: dry-laid slabs in courses, lichened, a
 * flat cap, built to be seen from the next ridge. */
function buildCairn(host: ChukarHistoryHost, groundAt: (x: number, z: number) => number): Kit {
  const kit = new Kit(), rng = mulberry32(7019), tint = new THREE.Color();
  const c = host.landscape.propertyToWorld(CHUKAR_SHEEP_CAIRN.x, CHUKAR_SHEEP_CAIRN.y, { x: 0, z: 0 });
  const ground = Math.min(groundAt(c.x - .6, c.z), groundAt(c.x + .6, c.z), groundAt(c.x, c.z - .6), groundAt(c.x, c.z + .6));
  const rock = [0x8a8478, 0x9a9283, 0xa89d8a, 0x7b766d], orange = new THREE.Color(0xc58c3a), sage = new THREE.Color(0x9aa58a);
  let y = ground - .08;
  for (let course = 0; course < 14; course++) {
    const radius = .72 - course * .033, height = .13 + rng() * .06, count = Math.max(5, Math.round(Math.PI * 2 * radius / .36));
    const twist = rng() * Math.PI;
    for (let i = 0; i < count; i++) {
      const a = twist + i / count * Math.PI * 2, r = radius - .12;
      tint.setHex(rock[Math.floor(rng() * rock.length)]).lerp(rng() < .5 ? orange : sage, rng() < .4 ? rng() * .4 : 0);
      kit.add(new THREE.BoxGeometry(.42 + rng() * .14, height, .26 + rng() * .08), tint,
        place(c.x + Math.cos(a) * r, y + height / 2, c.z + Math.sin(a) * r, (rng() - .5) * .08, -a + Math.PI / 2, (rng() - .5) * .1), .12, rng);
    }
    // Hearting fills the middle of each course.
    kit.add(new THREE.BoxGeometry(radius * 1.05, height, radius * 1.05), 0x8a8478, place(c.x, y + height / 2, c.z, 0, twist, 0));
    y += height * .96;
  }
  kit.add(new THREE.BoxGeometry(.7, .1, .55), 0x7a7468, place(c.x, y + .05, c.z, .06, .4, -.05), .1, rng);
  // Fallen stones at the foot.
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, r = .9 + rng() * .8, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, size = .12 + rng() * .14;
    kit.add(stone(rng), rock[i % rock.length], place(x, groundAt(x, z) + size * .2, z, rng() * 3, rng() * 6, rng() * 3, size * 1.6, size * .6, size), .1, rng);
  }
  host.obstacles.push({ x: c.x, z: c.z, radius: .85 });
  return kit;
}

/** A Utah juniper dead a century and still standing: twisted silver stems,
 * bark in strips, roots gripping the rim. */
function buildSnag(host: ChukarHistoryHost, groundAt: (x: number, z: number) => number): Kit {
  const kit = new Kit(), rng = mulberry32(4461);
  const c = host.landscape.propertyToWorld(CHUKAR_JUNIPER_SNAG.x, CHUKAR_JUNIPER_SNAG.y, { x: 0, z: 0 });
  const ground = groundAt(c.x, c.z);
  const silver = [0xb7b0a3, 0xa79f91, 0x958c7d, 0xc4bdb0];
  const grow = (from: THREE.Vector3, direction: THREE.Vector3, length: number, radius: number, depth: number) => {
    let at = from.clone(), dir = direction.clone().normalize(), r = radius;
    const segments = depth === 0 ? 4 : 3;
    for (let s = 0; s < segments; s++) {
      // Each joint turns: juniper grows in spirals against the wind.
      dir.add(V((rng() - .5) * .7, (rng() - .2) * .35, (rng() - .5) * .7)).normalize();
      const next = at.clone().addScaledVector(dir, length / segments), tip = r * .72;
      rod(kit, at, next, r, silver[Math.floor(rng() * silver.length)], 6, tip);
      if (depth < 2 && rng() < (depth === 0 ? .8 : .55)) {
        const side = V(-dir.z, .3 + rng() * .4, dir.x).multiplyScalar(rng() < .5 ? 1 : -1);
        grow(next, side.add(dir.clone().multiplyScalar(.4)), length * .55, tip * .8, depth + 1);
      }
      at = next; r = tip;
    }
    // A broken, splintered end.
    rod(kit, at, at.clone().addScaledVector(dir, .12).add(V((rng() - .5) * .06, 0, 0)), r * .8, 0xd0c9bc, 4, .005);
  };
  const base = V(c.x, ground - .1, c.z);
  grow(base, V(.25, 1, .1), 3.6, .27, 0);
  grow(base, V(-.45, 1, .2), 2.9, .2, 0);
  grow(base.clone().add(V(.08, 0, -.1)), V(.1, 1, -.5), 2.3, .15, 1);
  // Exposed roots over the rock.
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + rng() * .5, reach = .7 + rng() * .8;
    const end = V(c.x + Math.cos(a) * reach, 0, c.z + Math.sin(a) * reach);
    end.y = groundAt(end.x, end.z) + .02;
    rod(kit, V(c.x, ground + .08, c.z), end, .09, 0x8d8475, 5, .025);
  }
  host.obstacles.push({ x: c.x, z: c.z, radius: .45 });
  return kit;
}

/** A BLM-style guzzler: a galvanized rain apron on short legs, its gutter
 * feeding a buried tank, the drinker with a wildlife escape ramp, and a
 * four-strand fence on steel posts to keep the cattle out. */
function buildGuzzler(host: ChukarHistoryHost, groundAt: (x: number, z: number) => number): Kit {
  const kit = new Kit(), rng = mulberry32(2203);
  const c = host.landscape.propertyToWorld(CHUKAR_GUZZLER.x, CHUKAR_GUZZLER.y, { x: 0, z: 0 });
  const cos = Math.cos(CHUKAR_GUZZLER.angle), sin = Math.sin(CHUKAR_GUZZLER.angle);
  // u runs downhill toward the drinker; v across.
  const at = (u: number, v: number) => ({ x: c.x + u * cos - v * sin, z: c.z + u * sin + v * cos });
  const g = (u: number, v: number) => { const p = at(u, v); return groundAt(p.x, p.z); };
  const P = (u: number, v: number, y: number) => { const p = at(u, v); return V(p.x, y, p.z); };
  const yaw = -CHUKAR_GUZZLER.angle;
  const L = 6.2, W = 4.4;
  const high = Math.max(g(-L / 2, -W / 2), g(-L / 2, W / 2)) + .85, low = Math.max(g(L / 2, -W / 2), g(L / 2, W / 2)) + .4;
  const pitch = Math.atan2(high - low, L);
  // Corrugated sheets: alternating ridge tones read as corrugation at range.
  for (let i = 0; i < 16; i++) {
    const v = -W / 2 + (i + .5) * W / 16, mid = P(0, v, (high + low) / 2 + (i % 2 ? .02 : 0));
    kit.add(new THREE.BoxGeometry(L, .025, W / 16 + .01), i % 2 ? 0xa4a8a3 : 0x8e938f, place(mid.x, mid.y, mid.z, 0, yaw, -pitch));
  }
  // Rust where the seams lap.
  for (const u of [-1.5, 1.6]) { const p = P(u, 0, (high + low) / 2 - u * Math.tan(pitch) + .03); kit.add(new THREE.BoxGeometry(.12, .012, W), 0x8a6f55, place(p.x, p.y, p.z, 0, yaw, -pitch)); }
  for (const u of [-L / 2 + .2, 0, L / 2 - .2]) for (const v of [-W / 2 + .2, 0, W / 2 - .2]) {
    const top = (high + low) / 2 - u * Math.tan(pitch) - .03;
    rod(kit, P(u, v, g(u, v) - .2), P(u, v, top), .04, 0x6c6f6a, 4);
  }
  // Gutter and the pipe down to the tank lid, the drinker and its ramp.
  const gutterY = low - .12;
  kit.add(new THREE.BoxGeometry(.22, .14, W + .2), 0x7e837f, (() => { const p = P(L / 2 + .08, 0, gutterY); return place(p.x, p.y, p.z, 0, yaw, 0); })());
  rod(kit, P(L / 2 + .1, 0, gutterY - .05), P(L / 2 + 1.1, 0, g(L / 2 + 1.1, 0) + .05), .05, 0x3e423f);
  { const p = P(L / 2 + 1.6, -.6, 0); kit.add(new THREE.CylinderGeometry(.55, .55, .08, 12), 0x6d7a5f, place(p.x, g(L / 2 + 1.6, -.6) + .03, p.z)); }
  const trough = P(L / 2 + 2.2, .9, g(L / 2 + 2.2, .9));
  kit.add(new THREE.BoxGeometry(1.3, .32, .7), 0x6f736d, place(trough.x, trough.y + .1, trough.z, 0, yaw, 0));
  kit.add(new THREE.BoxGeometry(1.18, .02, .58), 0x23313a, place(trough.x, trough.y + .2, trough.z, 0, yaw, 0));
  { const p = P(L / 2 + 2.2, .9, trough.y + .1); kit.add(new THREE.BoxGeometry(.9, .02, .22), 0x8f938c, place(p.x, p.y, p.z, 0, yaw, .38)); }
  // Fence on T-posts, around the whole installation.
  const fence: [number, number][] = [[-L / 2 - 1.4, -W / 2 - 1.4], [L / 2 + 3.4, -W / 2 - 1.4], [L / 2 + 3.4, W / 2 + 1.6], [-L / 2 - 1.4, W / 2 + 1.6]];
  for (let s = 0; s < 4; s++) {
    const [u0, v0] = fence[s], [u1, v1] = fence[(s + 1) % 4], length = Math.hypot(u1 - u0, v1 - v0), count = Math.ceil(length / 2.6);
    let previous: THREE.Vector3 | undefined;
    for (let i = 0; i <= count; i++) {
      const t = i / count, u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t, ground = g(u, v);
      const corner = i === 0 || i === count;
      const top = P(u + (rng() - .5) * .03, v, ground + 1.15);
      rod(kit, P(u, v, ground - .1), top, corner ? .07 : .028, corner ? 0x7d7462 : 0x4b5a3d, corner ? 6 : 4);
      if (previous) for (const h of [.35, .6, .85, 1.08]) {
        const a = previous.clone(), b = top.clone(); a.y += h - 1.15; b.y += h - 1.15;
        rod(kit, a, b, .007, 0x5b5d58, 3);
      }
      // The fence is a barrier: close circles along it.
      const p = at(u, v);
      host.obstacles.push({ x: p.x, z: p.z, radius: .4 });
      if (i < count) { const m = at(u + (u1 - u0) / count / 2, v + (v1 - v0) / count / 2); host.obstacles.push({ x: m.x, z: m.z, radius: .4 }); }
      previous = top;
    }
  }
  return kit;
}

/** The seep: dark wet ground and green spilling down the bench from a
 * spring head ringed by a few willows in their fall yellow. */
function buildSeep(host: ChukarHistoryHost, groundAt: (x: number, z: number) => number, detail: { near: number; far: number; range: number }): [Kit, THREE.Mesh | undefined] {
  const { landscape } = host, rng = mulberry32(9931), kit = new Kit();
  const head = CHUKAR_SPRING_SEAM[0];
  const yellow = [0xc4a03c, 0xb48a35, 0xa9963f, 0x8f8a3a];
  // Wild rose down the seam: low thorny clumps, hips gone dark red.
  for (let i = 1; i < CHUKAR_SPRING_SEAM.length; i++) for (let n = 0; n < 3; n++) {
    const a = CHUKAR_SPRING_SEAM[i - 1], b = CHUKAR_SPRING_SEAM[i], t = rng(), side = (rng() < .5 ? -1 : 1) * (3 + rng() * 6);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const px = a.x + dx * t - dy / len * side, py = a.y + dy * t + dx / len * side;
    const p = landscape.propertyToWorld(px, py, { x: 0, z: 0 }), base = groundAt(p.x, p.z), size = .6 + rng() * .5;
    for (let k = 0; k < 4; k++) kit.add(new THREE.IcosahedronGeometry(.32 + rng() * .18, 0), rng() < .3 ? 0x7a3b2c : [0x8a6a3c, 0x7d6338, 0x96743f][k % 3],
      place(p.x + (rng() - .5) * size, base + .25 + rng() * .3, p.z + (rng() - .5) * size, rng() * 3, rng() * 3, 0, 1.1, .7, 1.1), .2, rng);
  }
  for (let i = 0; i < 5; i++) {
    const a = i * 1.7 + rng() * .5, r = 2 + rng() * 2.5;
    const p = landscape.propertyToWorld(head.x + Math.cos(a) * r / .9144, head.y + Math.sin(a) * r / .9144 - 1, { x: 0, z: 0 });
    const base = groundAt(p.x, p.z), size = 1.6 + rng() * 1.2;
    for (let s = 0; s < 7; s++) {
      const lean = rng() * Math.PI * 2;
      rod(kit, V(p.x, base - .05, p.z), V(p.x + Math.cos(lean) * size * .3, base + size * (.75 + rng() * .3), p.z + Math.sin(lean) * size * .3), .025, 0x7a4a33, 4, .012);
    }
    for (let k = 0; k < 8; k++) {
      kit.add(new THREE.IcosahedronGeometry(.35 + rng() * .3, 0), yellow[Math.floor(rng() * yellow.length)],
        place(p.x + (rng() - .5) * size * .6, base + size * (.45 + rng() * .5), p.z + (rng() - .5) * size * .6, rng() * 3, rng() * 3, 0, .8, 1.15, .8), .2, rng);
    }
    host.obstacles.push({ x: p.x, z: p.z, radius: .7 });
  }
  // Wet ground, with the trickle down its middle a shade darker.
  const positions: number[] = [], colors: number[] = [], index: number[] = [];
  const wet = new THREE.Color(0x4c4a35), green = new THREE.Color(0x5f7240), c = new THREE.Color();
  const xs = CHUKAR_SPRING_SEAM.map(p => p.x), ys = CHUKAR_SPRING_SEAM.map(p => p.y);
  const step = 1.6, x0 = Math.min(...xs) - 20, y0 = Math.min(...ys) - 20;
  const columns = Math.ceil((Math.max(...xs) - x0 + 20) / step), rows = Math.ceil((Math.max(...ys) - y0 + 20) / step);
  const vertex = new Map<number, number>();
  const at = (i: number, j: number) => {
    const key = j * (columns + 1) + i, saved = vertex.get(key);
    if (saved !== undefined) return saved;
    const px = x0 + i * step, py = y0 + j * step, amount = chukarSeamAt(px, py), w = landscape.propertyToWorld(px, py, { x: 0, z: 0 });
    c.copy(green).lerp(wet, Math.pow(amount, 3));
    positions.push(w.x, 0, w.z); colors.push(c.r, c.g, c.b, amount * .78);
    vertex.set(key, positions.length / 3 - 1);
    return positions.length / 3 - 1;
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const px = x0 + i * step, py = y0 + j * step;
    if (Math.max(chukarSeamAt(px, py), chukarSeamAt(px + step, py), chukarSeamAt(px, py + step), chukarSeamAt(px + step, py + step)) === 0) continue;
    const a = at(i, j), b = at(i + 1, j), d = at(i + 1, j + 1), e = at(i, j + 1);
    index.push(a, b, d, a, d, e);
  }
  if (!index.length) return [kit, undefined];
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  source.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  source.setIndex(index);
  const geometry = groundQuailTrackGeometry(landscape, source, detail);
  source.dispose();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  applyQuailTrackGroundLod(material, host.quality, detail.range);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Chukar spring seep'; mesh.receiveShadow = true; mesh.renderOrder = -2;
  host.own(geometry); host.own(material);
  return [kit, mesh];
}

/** The line camp corral: juniper posts set in a rough ring, a few poles
 * still wired between them and the rest fallen in the sage. */
function buildCorral(host: ChukarHistoryHost, groundAt: (x: number, z: number) => number): Kit {
  const kit = new Kit(), rng = mulberry32(5521), c = host.landscape.propertyToWorld(CHUKAR_PLACES.corral.x, CHUKAR_PLACES.corral.y, { x: 0, z: 0 });
  const wood = [0x8f8576, 0x7f7668, 0x9c9282, 0x6f685e], count = 16, rx = 7.5, rz = 6;
  const posts: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2 + (rng() - .5) * .12, x = c.x + Math.cos(a) * rx * (.94 + rng() * .1), z = c.z + Math.sin(a) * rz * (.94 + rng() * .1);
    const ground = groundAt(x, z), h = 1.35 + rng() * .35, lean = (rng() - .5) * .18;
    const top = V(x + lean, ground + h, z + (rng() - .5) * .14);
    rod(kit, V(x, ground - .2, z), top, .09 + rng() * .03, wood[i % wood.length], 6, .07);
    posts.push(top);
    if (i % 2 === 0) host.obstacles.push({ x, z, radius: .35 });
  }
  for (let i = 0; i < count; i++) {
    if (i === 3 || i === 4 || rng() < .25) continue; // the gate gap and broken spans
    const a = posts[i], b = posts[(i + 1) % count];
    for (const drop of [.25, .75]) rod(kit, V(a.x, a.y - drop, a.z), V(b.x, b.y - drop - (rng() - .5) * .1, b.z), .045, wood[(i + 1) % wood.length], 5);
    // A rail in the gap between posts keeps the hunter out of the ring.
    const m = V((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    host.obstacles.push({ x: m.x, z: m.z, radius: .45 });
  }
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2, r = rx * (.4 + rng() * .9), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r * .8, yaw = rng() * Math.PI;
    const g = groundAt(x, z) + .05, l = 2 + rng() * 1.6;
    rod(kit, V(x - Math.cos(yaw) * l / 2, g, z - Math.sin(yaw) * l / 2), V(x + Math.cos(yaw) * l / 2, g + .04, z + Math.sin(yaw) * l / 2), .05, wood[i % wood.length], 5);
  }
  return kit;
}

/** A homesteader's cabin is gone but its fieldstone chimney stands, with
 * the low outline of the cabin's footings in front of it. */
function buildChimney(host: ChukarHistoryHost, groundAt: (x: number, z: number) => number): Kit {
  const kit = new Kit(), rng = mulberry32(6133), c = host.landscape.propertyToWorld(CHUKAR_PLACES.chimney.x, CHUKAR_PLACES.chimney.y, { x: 0, z: 0 });
  const rock = [0x8c8274, 0x7b7366, 0x968b7a, 0x6e675d];
  const base = Math.min(groundAt(c.x - .8, c.z), groundAt(c.x + .8, c.z), groundAt(c.x, c.z - .8), groundAt(c.x, c.z + .8)) - .1;
  let y = base;
  for (let course = 0; course < 22; course++) {
    const w = course < 9 ? 1.7 : 1.05 - (course - 9) * .015, d = course < 9 ? 1.2 : .9, h = .2 + rng() * .05;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + (course % 2) * .2;
      kit.add(new THREE.BoxGeometry(w * (i % 2 ? .55 : 1), h, d * (i % 2 ? 1 : .3)), rock[(course + i) % rock.length],
        place(c.x + Math.cos(a) * (i % 2 ? w * .25 : 0), y + h / 2, c.z + Math.sin(a) * (i % 2 ? 0 : d * .35), 0, (rng() - .5) * .05, 0), .1, rng);
    }
    y += h * .97;
  }
  // Footings of the cabin, a course or two showing.
  for (const [dx, dz, l, yaw] of [[0, 2.6, 5.6, 0], [-2.8, 5.2, 5.2, Math.PI / 2], [2.8, 5.2, 5.2, Math.PI / 2], [0, 7.8, 5.6, 0]] as const) {
    for (let k = 0; k < 6; k++) {
      const t = (k / 5 - .5) * l, x = c.x + dx + Math.cos(yaw) * t, z = c.z + dz + Math.sin(yaw) * t;
      kit.add(stone(rng), rock[k % rock.length], place(x, groundAt(x, z) + .08, z, rng(), rng() * 6, rng(), .5 + rng() * .3, .25, .4), .1, rng);
    }
  }
  host.obstacles.push({ x: c.x, z: c.z, radius: 1.1 });
  return kit;
}

/** Split Rock: one house-sized basalt block cracked in two, under the face. */
function buildSplitRock(host: ChukarHistoryHost, groundAt: (x: number, z: number) => number): Kit {
  const kit = new Kit(), rng = mulberry32(7307), c = host.landscape.propertyToWorld(CHUKAR_PLACES.splitRock.x, CHUKAR_PLACES.splitRock.y, { x: 0, z: 0 });
  const ground = Math.min(groundAt(c.x - 2, c.z), groundAt(c.x + 2, c.z), groundAt(c.x, c.z - 2), groundAt(c.x, c.z + 2));
  for (const side of [-1, 1]) {
    const x = c.x + side * 1.35, z = c.z + side * .2;
    kit.add(new THREE.DodecahedronGeometry(1, 0), side < 0 ? 0x524c46 : 0x5d5650,
      place(x, ground + 1.15, z, (rng() - .5) * .3, rng() * 3, side * .12, 1.55, 1.7, 2.1), .06, rng);
    host.obstacles.push({ x, z, radius: 1.7 });
  }
  return kit;
}
