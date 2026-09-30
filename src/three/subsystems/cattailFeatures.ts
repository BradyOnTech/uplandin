import * as THREE from 'three';
import type { PlainsTreeSpecies } from '../assets/plainsTree';
import type { LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import {
  pheasantBaleRows, pheasantBaleSpacing, pheasantDuckBlind, pheasantOldFarmstead, pheasantRockPiles, pheasantSheetWater,
} from '../../game/pheasantFeatures';
import type { Ctx } from '../engine';

/**
 * Cattail Coverts' working-farm details (see game/pheasantFeatures.ts):
 * field rock piles, stored bale rows, the old farmstead foundation, a duck
 * blind on the Slough and sheet water in the east corn. Each is one or two
 * vertex-coloured draws. Solid pieces add collision circles and shot solids
 * to the owning scenery system.
 */
export interface CattailFeatureHost {
  landscape: LandscapeModel;
  castShadow: boolean;
  obstacles: { x: number; z: number; radius: number }[];
  shotSolids: THREE.Object3D[];
  waterMaterial: THREE.Material;
  keep(object: THREE.Object3D): void;
  own(resource: THREE.BufferGeometry | THREE.Material): void;
  tree(species: PlainsTreeSpecies, seed: number, height: number): THREE.Object3D;
}

/** Flat-shaded, vertex-coloured triangle soup built from primitive pieces. */
class Kit {
  private positions: number[] = [];
  private colors: number[] = [];
  private color = new THREE.Color();
  private v = new THREE.Vector3();
  add(geometry: THREE.BufferGeometry, color: number | THREE.Color, matrix?: THREE.Matrix4, jitter = 0, rng?: () => number): this {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = flat.getAttribute('position');
    const tint = typeof color === 'number' ? this.color.setHex(color) : this.color.copy(color);
    // Per-face tint noise keeps big planes from reading as one flat colour.
    let shade = 1;
    for (let i = 0; i < position.count; i++) {
      this.v.fromBufferAttribute(position, i);
      if (matrix) this.v.applyMatrix4(matrix);
      this.positions.push(this.v.x, this.v.y, this.v.z);
      if (i % 3 === 0) shade = jitter && rng ? 1 + (rng() - .5) * jitter : 1;
      this.colors.push(tint.r * shade, tint.g * shade, tint.b * shade);
    }
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
    return this;
  }
  get empty(): boolean { return !this.positions.length; }
  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
const place = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  m4.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz, 'YXZ')), s.set(sx, sy, sz));

/** A fieldstone: a dodecahedron knocked out of round. */
function stone(rng: () => number): THREE.BufferGeometry {
  const geometry = rng() < .5 ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0);
  const position = geometry.getAttribute('position');
  const seen = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) { k = .78 + rng() * .36; seen.set(key, k); }
    position.setXYZ(i, position.getX(i) * k, position.getY(i) * k, position.getZ(i) * k);
  }
  return geometry;
}

const GRANITE = [0xa6a298, 0xb09385, 0x87847e, 0xbab3a2, 0x9d9281, 0x75716a];

export function buildCattailFeatures(ctx: Ctx, host: CattailFeatureHost): void {
  buildRockPiles(ctx, host);
  buildBaleRows(ctx, host);
  buildOldFarmstead(ctx, host);
  buildDuckBlind(ctx, host);
  buildSheetWater(ctx, host);
}

function solidMesh(host: CattailFeatureHost, kit: Kit, name: string, material: THREE.Material, shots: boolean): THREE.Mesh | undefined {
  if (kit.empty) return undefined;
  const mesh = new THREE.Mesh(kit.build(), material);
  mesh.name = name; mesh.castShadow = host.castShadow; mesh.receiveShadow = true;
  host.own(mesh.geometry); host.keep(mesh);
  if (shots) host.shotSolids.push(mesh);
  return mesh;
}

/** Rock the picker hauled off the fields, heaped at the headlands. */
function buildRockPiles(ctx: Ctx, host: CattailFeatureHost): void {
  const { landscape } = host, world = { x: 0, z: 0 };
  const kit = new Kit(), weeds = new Kit();
  const tint = new THREE.Color(), lichen = new THREE.Color(0xa8a27c);
  for (const pile of pheasantRockPiles(landscape.area.world)) {
    const rng = mulberry32(pile.seed);
    landscape.propertyToWorld(pile.x, pile.y, world);
    const peak = pile.radius * .34, count = Math.round(pile.radius * pile.radius * 7);
    for (let i = 0; i < count; i++) {
      // Big stones settle to the bottom and outside; small ones fill the crown.
      const r = pile.radius * Math.pow(rng(), .6) * .95, a = rng() * Math.PI * 2;
      const x = world.x + Math.cos(a) * r, z = world.z + Math.sin(a) * r * (.8 + rng() * .2);
      const t = r / pile.radius, size = (.24 + rng() * .26) * (.75 + t * .55);
      const ground = landscape.heightAtWorld(x, z);
      const y = ground + peak * (1 - t * t) + size * .25;
      tint.setHex(GRANITE[Math.floor(rng() * GRANITE.length)]).lerp(lichen, rng() < .25 ? .35 : 0);
      kit.add(stone(rng), tint, place(x, y, z, rng() * 3, rng() * 6.3, rng() * 3, size * (1 + rng() * .4), size * (.62 + rng() * .25), size), .12, rng);
    }
    // Kochia and dock gone to seed where the plow can't reach.
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2, r = pile.radius * (.8 + rng() * .35);
      const cx = world.x + Math.cos(a) * r, cz = world.z + Math.sin(a) * r, color = rng() < .5 ? 0x7a5a3c : 0x8f7d55;
      for (let stalk = 0; stalk < 4; stalk++) {
        const x = cx + (rng() - .5) * .5, z = cz + (rng() - .5) * .5, h = .5 + rng() * .55;
        weeds.add(new THREE.ConeGeometry(.05 + rng() * .04, h, 4), color,
          place(x, landscape.heightAtWorld(x, z) + h / 2 - .04, z, (rng() - .5) * .5, rng() * 6, (rng() - .5) * .5), .2, rng);
      }
    }
    host.obstacles.push({ x: world.x, z: world.z, radius: pile.radius * .72 });
    // A lone elm has grown out of the big pile on the hill.
    if (pile.radius > 2.6) {
      const tx = world.x + pile.radius * .45, tz = world.z - pile.radius * .2;
      const tree = host.tree('elm', pile.seed, 7.5);
      tree.position.set(tx, landscape.heightAtWorld(tx, tz) - .1, tz); tree.rotation.y = 1.2;
      host.keep(tree);
    }
  }
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true });
  const weedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  host.own(material); host.own(weedMaterial);
  solidMesh(host, kit, 'Field rock piles', material, true);
  const weedMesh = solidMesh(host, weeds, 'Rock pile weeds', weedMaterial, false);
  if (weedMesh) weedMesh.castShadow = false;
}

/** Round bales stored over winter: a stacked row and a single row along
 * the fence, and the last cutting still out in the field. */
function buildBaleRows(ctx: Ctx, host: CattailFeatureHost): void {
  const { landscape } = host, world = { x: 0, z: 0 };
  const rows = pheasantBaleRows(landscape.area.world);
  const bale = new THREE.CylinderGeometry(.78, .78, 1.45, 14, 1);
  bale.rotateZ(Math.PI / 2);
  const side = new THREE.MeshStandardMaterial({ color: 0xb6a371, roughness: 1, flatShading: true });
  const face = new THREE.MeshStandardMaterial({ color: 0x9d8b5e, roughness: 1, flatShading: true });
  host.own(bale); host.own(side); host.own(face);
  const matrices: THREE.Matrix4[] = [], colors: THREE.Color[] = [];
  for (const [index, row] of rows.entries()) {
    const rng = mulberry32(4409 + index * 71), step = pheasantBaleSpacing(row);
    const course = (count: number, offset: number, lift: number) => {
      for (let i = 0; i < count; i++) {
        const along = offset + i;
        const x = row.x + Math.cos(row.angle) * step * along, y = row.y + Math.sin(row.angle) * step * along;
        landscape.propertyToWorld(x, y, world);
        // End to end the axis follows the row; stacked, it lies across it.
        const yaw = -row.angle + (row.stacked ? Math.PI / 2 : 0) + (rng() - .5) * (row.stacked || row.weathered ? .06 : .6);
        const ground = landscape.heightAtWorld(world.x, world.z);
        matrices.push(new THREE.Matrix4().compose(p.set(world.x, ground + .72 + lift - (row.weathered ? .06 : 0), world.z),
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), s.set(1, row.weathered ? .95 : 1, 1)));
        const age = row.weathered ? .74 + rng() * .1 : .96 + rng() * .06;
        colors.push(new THREE.Color(age, age * (row.weathered ? .98 : 1), age * (row.weathered ? 1.02 : .98)));
        if (!lift) host.obstacles.push({ x: world.x, z: world.z, radius: .86 });
      }
    };
    course(row.count, 0, 0);
    // Nested in the saddles of the bottom course.
    if (row.stacked) course(row.count - 1, .5, Math.sqrt(1.6 ** 2 - .8 ** 2));
  }
  const mesh = new THREE.InstancedMesh(bale, [side, face, face], matrices.length);
  matrices.forEach((matrix, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, colors[i]); });
  mesh.name = 'Stored bale rows'; mesh.castShadow = host.castShadow; mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  host.keep(mesh); host.shotSolids.push(mesh);
}

/** The first house on the place: fieldstone foundation, a front step, the
 * cistern and chimney stub, lilacs gone wild and one old boxelder. */
function buildOldFarmstead(ctx: Ctx, host: CattailFeatureHost): void {
  const { landscape } = host, site = pheasantOldFarmstead(landscape.area.world);
  const centre = landscape.propertyToWorld(site.x, site.y, { x: 0, z: 0 });
  const rng = mulberry32(55127);
  const cos = Math.cos(site.angle), sin = Math.sin(site.angle);
  const local = (u: number, v: number) => ({ x: centre.x + u * cos - v * sin, z: centre.z + u * sin + v * cos });
  const yaw = -site.angle;
  const kit = new Kit(), bush = new Kit();
  const W = 8.6, D = 6.6;
  // Walls as courses of squared fieldstone, broken down unevenly.
  const walls: [number, number, number, number][] = [[-W / 2, -D / 2, W / 2, -D / 2], [W / 2, -D / 2, W / 2, D / 2], [W / 2, D / 2, -W / 2, D / 2], [-W / 2, D / 2, -W / 2, -D / 2]];
  const tint = new THREE.Color(), mortar = new THREE.Color(0xb3ad9c);
  for (const [wi, [u0, v0, u1, v1]] of walls.entries()) {
    const length = Math.hypot(u1 - u0, v1 - v0), du = (u1 - u0) / length, dv = (v1 - v0) / length;
    const wallYaw = yaw - Math.atan2(dv, du);
    let t = 0;
    while (t < length) {
      const block = .45 + rng() * .4, mid = Math.min(length, t + block / 2);
      // How much of the wall still stands here, in courses.
      const standing = Math.max(0, Math.round(2.4 + Math.sin(mid * .9 + wi * 2.1) * 1.4 + Math.sin(mid * 2.7 + wi) * .7 + (rng() - .5)));
      const at = local(u0 + du * mid, v0 + dv * mid);
      const ground = landscape.heightAtWorld(at.x, at.z);
      for (let c = 0; c < standing; c++) {
        tint.setHex(GRANITE[Math.floor(rng() * GRANITE.length)]).lerp(mortar, .25);
        const h = .22 + rng() * .06;
        kit.add(new THREE.BoxGeometry(block * .96, h, .42 + rng() * .08), tint,
          place(at.x + (rng() - .5) * .05, ground - .12 + c * .25 + h / 2, at.z + (rng() - .5) * .05, 0, wallYaw + (rng() - .5) * .06, (rng() - .5) * .04), .1, rng);
      }
      if (standing >= 3 && ((wi + Math.floor(mid)) % 2 === 0)) host.obstacles.push({ x: at.x, z: at.z, radius: .34 });
      t += block;
    }
  }
  // Fallen stones and rubble inside and about.
  for (let i = 0; i < 26; i++) {
    const u = (rng() - .5) * (W + 2.4), v = (rng() - .5) * (D + 2.4), at = local(u, v), size = .14 + rng() * .2;
    kit.add(stone(rng), GRANITE[Math.floor(rng() * GRANITE.length)], place(at.x, landscape.heightAtWorld(at.x, at.z) + size * .2, at.z, rng() * 3, rng() * 6, rng() * 3, size * 1.3, size * .7, size), .1, rng);
  }
  // Poured front step, heaved a little by frost.
  {
    const at = local(0, D / 2 + .55), ground = landscape.heightAtWorld(at.x, at.z);
    kit.add(new THREE.BoxGeometry(1.6, .3, .9), 0xaaa698, place(at.x, ground + .08, at.z, .05, yaw, -.03), .06, rng);
    const top = local(0, D / 2 + .35);
    kit.add(new THREE.BoxGeometry(1.6, .3, .5), 0xa39f90, place(top.x, ground + .36, top.z, .04, yaw, -.03), .06, rng);
  }
  // Brick chimney stub in the north-east corner.
  {
    const at = local(W / 2 - 1.2, -D / 2 + 1.1), ground = landscape.heightAtWorld(at.x, at.z);
    for (let c = 0; c < 9; c++) {
      const h = .16, width = c > 6 ? .5 - (c - 6) * .08 : .62;
      kit.add(new THREE.BoxGeometry(width, h, .62), c % 2 ? 0x8a4f3c : 0x7c4636, place(at.x, ground - .1 + c * h + h / 2, at.z, 0, yaw + (c > 6 ? .1 : 0), 0), .12, rng);
    }
    host.obstacles.push({ x: at.x, z: at.z, radius: .5 });
  }
  // Cistern: a concrete ring with a rotted plank lid.
  {
    const at = local(W / 2 + 3.2, 1.2), ground = landscape.heightAtWorld(at.x, at.z);
    kit.add(new THREE.CylinderGeometry(.95, 1, .5, 12, 1, true), 0x9e9a8b, place(at.x, ground + .12, at.z), .08, rng);
    kit.add(new THREE.TorusGeometry(.95, .1, 4, 12), 0xa8a495, place(at.x, ground + .37, at.z, Math.PI / 2), .08, rng);
    for (let i = -2; i <= 2; i++) {
      const plank = local(W / 2 + 3.2 + i * .34, 1.2);
      kit.add(new THREE.BoxGeometry(.3, .05, 1.9), rng() < .5 ? 0x5e5244 : 0x6d604e, place(plank.x, ground + .3 - Math.abs(i) * .02 - (i === 1 ? .12 : 0), plank.z, i === 1 ? .15 : 0, yaw + (rng() - .5) * .1, 0));
    }
    host.obstacles.push({ x: at.x, z: at.z, radius: 1.05 });
  }
  // Lilacs planted along the west side, now thickets gone bronze.
  const leaf = [0x5b5a36, 0x6b5a33, 0x4e5531, 0x7a6437];
  for (let clump = 0; clump < 5; clump++) {
    const v = -D / 2 - 1 + clump * 2.3, u = -W / 2 - 3.2 + (rng() - .5) * 1.2;
    const at = local(u, v), ground = landscape.heightAtWorld(at.x, at.z);
    for (let i = 0; i < 4; i++) bush.add(new THREE.CylinderGeometry(.035, .05, 1.6, 4), 0x4a3f33,
      place(at.x + (rng() - .5) * .8, ground + .7, at.z + (rng() - .5) * .8, (rng() - .5) * .4, 0, (rng() - .5) * .4));
    for (let i = 0; i < 7; i++) {
      const r = .5 + rng() * .45;
      bush.add(new THREE.IcosahedronGeometry(r, 0), leaf[Math.floor(rng() * leaf.length)],
        place(at.x + (rng() - .5) * 1.5, ground + .7 + rng() * 1.3, at.z + (rng() - .5) * 1.5, rng() * 3, rng() * 3, 0, 1, .8, 1), .18, rng);
    }
    host.obstacles.push({ x: at.x, z: at.z, radius: 1.05 });
  }
  const oak = local(W / 2 + 2, -D / 2 - 3.4);
  const tree = host.tree('boxelder', 88013, 8.5);
  tree.position.set(oak.x, landscape.heightAtWorld(oak.x, oak.z) - .1, oak.z); tree.rotation.y = 2.4;
  host.keep(tree); host.obstacles.push({ x: oak.x, z: oak.z, radius: .55 });
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true });
  const bushMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  host.own(material); host.own(bushMaterial);
  solidMesh(host, kit, 'Old farmstead foundation', material, true);
  solidMesh(host, bush, 'Old farmstead lilacs', bushMaterial, false);
}

/** A plywood pit blind on the Slough's south-east shore, brushed in with
 * cattail and facing the open water. */
function buildDuckBlind(ctx: Ctx, host: CattailFeatureHost): void {
  const { landscape } = host, site = pheasantDuckBlind(landscape.area.landmarks);
  if (!site) return;
  const centre = landscape.propertyToWorld(site.x, site.y, { x: 0, z: 0 });
  const rng = mulberry32(31337);
  // Local u points out over the water, v along the shore.
  const cos = Math.cos(site.angle), sin = Math.sin(site.angle);
  const local = (u: number, v: number) => ({ x: centre.x + u * cos - v * sin, z: centre.z + u * sin + v * cos });
  const yaw = -site.angle, floor = landscape.heightAtWorld(centre.x, centre.z) - .15;
  const kit = new Kit();
  const ply = 0x6a6150, frame = 0x5a4e3e, thatch = [0xb59a62, 0x9c8452, 0x7d6c45, 0xa88f5a];
  const panel = (u: number, v: number, w: number, h: number, d: number, rotation: number, color: number) => {
    const at = local(u, v);
    kit.add(new THREE.BoxGeometry(w, h, d), color, place(at.x, floor + h / 2, at.z, 0, yaw + rotation, 0), .1, rng);
  };
  // Front wall (toward the water), two sides, a bench and corner posts.
  panel(.8, 0, .06, 1.3, 2.6, 0, ply);
  panel(0, -1.3, 1.6, 1.15, .06, 0, ply);
  panel(0, 1.3, 1.6, 1.15, .06, 0, ply);
  panel(-.15, 0, .35, .5, 2.3, 0, frame);
  for (const [u, v] of [[.8, -1.3], [.8, 1.3], [-.8, -1.3], [-.8, 1.3]]) panel(u, v, .09, 1.45, .09, 0, frame);
  // Pallet floor and a plank path back to dry ground.
  panel(0, 0, 1.5, .06, 2.4, 0, 0x7a6a52);
  for (let i = 0; i < 5; i++) panel(-1.4 - i * .9, (rng() - .5) * .2, .8, .05, .32, (rng() - .5) * .12, 0x6f624e);
  // Cattail brushed against the front and sides, leaning over the top.
  const blade = (u: number, v: number, lean: number, facing: number) => {
    const at = local(u, v), h = 1.2 + rng() * .6;
    const tilt = lean + (rng() - .5) * .35;
    kit.add(new THREE.BoxGeometry(.05, h, .02), thatch[Math.floor(rng() * thatch.length)],
      place(at.x, floor + h / 2 - .05, at.z, 0, yaw + facing + (rng() - .5) * .8, 0).multiply(new THREE.Matrix4().makeRotationZ(tilt)), .15, rng);
  };
  for (let i = 0; i < 70; i++) blade(.88 + rng() * .1, (rng() - .5) * 2.8, .15 + rng() * .2, 0);
  for (let i = 0; i < 34; i++) blade((rng() - .5) * 1.7, -1.37 - rng() * .08, (rng() - .5) * .4, Math.PI / 2);
  for (let i = 0; i < 34; i++) blade((rng() - .5) * 1.7, 1.37 + rng() * .08, (rng() - .5) * .4, Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true, side: THREE.DoubleSide });
  host.own(material);
  solidMesh(host, kit, 'Slough duck blind', material, true);
  const front = local(.4, 0);
  host.obstacles.push({ x: front.x, z: front.z, radius: 1.35 });
}

/** Rain standing in the low swale of the east corn: a sheet of water only as
 * wide as the ground is low, stubble poking through, a dark wet margin. */
function buildSheetWater(ctx: Ctx, host: CattailFeatureHost): void {
  const { landscape } = host, sheet = pheasantSheetWater(landscape.area.world);
  const centre = landscape.propertyToWorld(sheet.x, sheet.y, { x: 0, z: 0 });
  const cos = Math.cos(sheet.angle), sin = Math.sin(sheet.angle);
  const cell = .7, nu = Math.ceil(sheet.rx * 2.5 / cell), nv = Math.ceil(sheet.ry * 2.5 / cell);
  const grid: { x: number; z: number; ground: number; edge: number }[] = [];
  const heights: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = (i / nu - .5) * sheet.rx * 2.5, v = (j / nv - .5) * sheet.ry * 2.5;
    const x = centre.x + u * cos - v * sin, z = centre.z + u * sin + v * cos;
    const angle = Math.atan2(v / sheet.ry, u / sheet.rx);
    // A ragged outline: water follows the rows and the low spots.
    const edge = Math.hypot(u / sheet.rx, v / sheet.ry) / (1 + Math.sin(angle * 3 + 1.1) * .12 + Math.sin(angle * 7) * .06);
    const ground = landscape.heightAtWorld(x, z);
    grid.push({ x, z, ground, edge });
    if (edge < 1) heights.push(ground);
  }
  heights.sort((a, b) => a - b);
  // Deep enough to cover about half the swale; never floating over a rise.
  const level = heights[Math.floor(heights.length * .55)] + .02;
  const index = (i: number, j: number) => j * (nu + 1) + i;
  const water: number[] = [], waterUv: number[] = [], mud: number[] = [], mudColor: number[] = [];
  const wet = new THREE.Color(0x4a4130);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const quad = [index(i, j), index(i + 1, j), index(i + 1, j + 1), index(i, j + 1)];
    for (const tri of [[0, 2, 1], [0, 3, 2]]) {
      const points = tri.map(k => grid[quad[k]]);
      if (points.every(g => g.edge > 1.25)) continue;
      if (points.some(g => g.edge < 1.1 && g.ground < level + .01)) for (const g of points) {
        const shore = Math.max(1 - THREE.MathUtils.smoothstep(level - g.ground, 0, .1), THREE.MathUtils.smoothstep(g.edge, .8, 1.1));
        water.push(g.x - centre.x, 0, g.z - centre.z);
        waterUv.push(.5 + .5 * (.55 + .45 * shore), .5);
      }
      for (const g of points) {
        const damp = (1 - THREE.MathUtils.smoothstep(g.ground - level, -.02, .3)) * (1 - THREE.MathUtils.smoothstep(g.edge, .95, 1.25));
        mud.push(g.x - centre.x, g.ground + .025 - level, g.z - centre.z);
        mudColor.push(wet.r, wet.g, wet.b, damp * .62);
      }
    }
  }
  if (!water.length) return;
  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(water, 3));
  waterGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(waterUv, 2));
  waterGeometry.computeVertexNormals();
  const surface = new THREE.Mesh(waterGeometry, host.waterMaterial);
  surface.name = 'East corn sheet water';
  surface.position.set(centre.x, level, centre.z); surface.receiveShadow = true; surface.renderOrder = -1;
  const mudGeometry = new THREE.BufferGeometry();
  mudGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mud, 3));
  mudGeometry.setAttribute('color', new THREE.Float32BufferAttribute(mudColor, 4));
  mudGeometry.computeVertexNormals();
  const mudMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: .45,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const margin = new THREE.Mesh(mudGeometry, mudMaterial);
  margin.name = 'East corn wet margin';
  margin.position.set(centre.x, level, centre.z); margin.receiveShadow = true; margin.renderOrder = -2;
  host.own(waterGeometry); host.own(mudGeometry); host.own(mudMaterial);
  host.keep(margin); host.keep(surface);
}
