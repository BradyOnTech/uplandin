import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import {
  CHUKAR_GUZZLER, CHUKAR_JUNIPER_SNAG, CHUKAR_SEEP, CHUKAR_SHEEP_CAIRN, chukarSeepAt,
} from '../../game/chukarFeatures';
import { Kit, place, stone } from '../lowPolyKit';
import { CHUKAR_GROUND_DETAIL } from './chukarTerrain';
import { applyQuailTrackGroundLod, groundQuailTrackGeometry, sampleQuailGroundHeights } from './quailGroundGeometry';

/**
 * Chukar Ridge's remembered places (see game/chukarFeatures.ts): the old
 * sheepherder's cairn on the western mesa, a juniper snag on the split
 * shoulder, the wildlife guzzler on the west bench and the spring seep
 * below the shoulder with willows at its head. The seep's green grass and
 * the talus fans are planted by the environment itself.
 */
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
  const head = CHUKAR_SEEP[0];
  const yellow = [0xc4a03c, 0xb48a35, 0xa9963f, 0x8f8a3a];
  for (let i = 0; i < 4; i++) {
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
  const step = 1.4, x0 = 878, y0 = 486, columns = Math.ceil(76 / step), rows = Math.ceil(84 / step);
  const vertex = new Map<number, number>();
  const at = (i: number, j: number) => {
    const key = j * (columns + 1) + i, saved = vertex.get(key);
    if (saved !== undefined) return saved;
    const px = x0 + i * step, py = y0 + j * step, amount = chukarSeepAt(px, py), w = landscape.propertyToWorld(px, py, { x: 0, z: 0 });
    c.copy(green).lerp(wet, Math.pow(amount, 3));
    positions.push(w.x, 0, w.z); colors.push(c.r, c.g, c.b, amount * .78);
    vertex.set(key, positions.length / 3 - 1);
    return positions.length / 3 - 1;
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const px = x0 + i * step, py = y0 + j * step;
    if (Math.max(chukarSeepAt(px, py), chukarSeepAt(px + step, py), chukarSeepAt(px, py + step), chukarSeepAt(px + step, py + step)) === 0) continue;
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
