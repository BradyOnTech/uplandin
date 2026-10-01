import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import {
  SHARPTAIL_BURROWS, SHARPTAIL_ENTRANCE_POSTS, SHARPTAIL_HOMESTEAD, SHARPTAIL_STOCK_POND, SHARPTAIL_TIPI_STONES, sharptailEntrances,
} from '../../game/sharptailFeatures';
import { Kit, place, stone } from '../lowPolyKit';
import { createPondedWater } from '../pondedWater';

/**
 * The pasture's history (see game/sharptailFeatures.ts): the cattle guard
 * and wire gate the two-tracks come in by, the stock dam's pond, a caved-in
 * claim shack in its lilacs, three tipi rings on the high east knob and a
 * badger-dug knoll. Vertex-coloured, one or two draws per piece.
 */
export interface SharptailHistoryHost {
  landscape: LandscapeModel;
  castShadow: boolean;
  obstacles: { x: number; z: number; radius: number }[];
  shotSolids: THREE.Object3D[];
  waterMaterial: THREE.Material;
  keep(object: THREE.Object3D): void;
  own(resource: THREE.BufferGeometry | THREE.Material): void;
}

const WEATHERED = [0x8f8a80, 0x7d776c, 0xa39d90, 0x6f6a61, 0x979084];

export function buildSharptailHistory(host: SharptailHistoryHost): void {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true });
  const leaves = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  host.own(material); host.own(leaves);
  buildEntrances(host, material);
  buildStockPond(host, material);
  buildHomestead(host, material, leaves);
  buildTipiRings(host, material);
  buildBadgerKnoll(host, material);
}

function mesh(host: SharptailHistoryHost, kit: Kit, name: string, material: THREE.Material, shots: boolean, shadow = true): THREE.Mesh | undefined {
  if (kit.empty) return undefined;
  const result = new THREE.Mesh(kit.build(), material);
  result.name = name; result.castShadow = shadow && host.castShadow; result.receiveShadow = true;
  host.own(result.geometry); host.keep(result);
  if (shots) host.shotSolids.push(result);
  return result;
}

/** A local frame at a property point: u along `angle`, v across it (metres). */
function frame(landscape: LandscapeModel, px: number, py: number, angle: number) {
  const centre = landscape.propertyToWorld(px, py, { x: 0, z: 0 });
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const at = (u: number, v: number) => ({ x: centre.x + u * cos - v * sin, z: centre.z + u * sin + v * cos });
  return { centre, at, yaw: -angle, ground: (u: number, v: number) => { const p = at(u, v); return landscape.heightAtWorld(p.x, p.z); } };
}

/** A pipe or board between two world points. */
function beam(kit: Kit, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number, sides = 5): void {
  const direction = b.clone().sub(a), length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, sides, 1);
  const matrix = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), new THREE.Vector3(1, 1, 1));
  kit.add(geometry, color, matrix);
}

/** The cattle guard on the south lane, the wire gate on the west track, the
 * H-braces either side and the two-track ruts running in to the truck. */
function buildEntrances(host: SharptailHistoryHost, material: THREE.Material): void {
  const { landscape } = host, area = landscape.area;
  const kit = new Kit(), rng = mulberry32(90211);
  const ruts: number[] = [], rutColors: number[] = [];
  const dirt = new THREE.Color(0x7d6d52);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const entrance of sharptailEntrances(area.world, area.dropPoints)) {
    const f = frame(landscape, entrance.x, entrance.y, entrance.along);
    const { gatepost, brace } = SHARPTAIL_ENTRANCE_POSTS;
    // Which side of the fence is the pasture: toward the truck.
    const truck = landscape.propertyToWorld(entrance.truck.x, entrance.truck.y, { x: 0, z: 0 });
    const inward = Math.sign((truck.x - f.centre.x) * -Math.sin(entrance.along) + (truck.z - f.centre.z) * Math.cos(entrance.along)) || 1;
    // H-braces: a horizontal rail between gatepost and brace post, and a
    // twisted diagonal wire from the top of one to the foot of the other.
    for (const side of [-1, 1]) {
      const g = f.at(side * gatepost, 0), b = f.at(side * brace, 0);
      const gy = landscape.heightAtWorld(g.x, g.z), by = landscape.heightAtWorld(b.x, b.z);
      beam(kit, V(g.x, gy + 1.2, g.z), V(b.x, by + 1.2, b.z), .07, 0x857c6c);
      beam(kit, V(g.x, gy + 1.3, g.z), V(b.x, by + .15, b.z), .012, 0x4d4f4b, 3);
      beam(kit, V(g.x, gy + .15, g.z), V(b.x, by + 1.3, b.z), .012, 0x4d4f4b, 3);
      host.obstacles.push({ x: g.x, z: g.z, radius: .2 });
    }
    if (entrance.kind === 'cattle-guard') {
      const ground = f.ground(0, 0);
      // The pit, its concrete sills, and the pipe deck across it.
      kit.add(new THREE.BoxGeometry(4.9, .5, 2.3), 0x1c1914, place(f.centre.x, ground - .4, f.centre.z, 0, f.yaw, 0));
      for (const v of [-1.22, 1.22]) {
        const p = f.at(0, v);
        kit.add(new THREE.BoxGeometry(5.3, .4, .3), 0xa19d91, place(p.x, landscape.heightAtWorld(p.x, p.z) - .13, p.z, 0, f.yaw, 0), .06, rng);
      }
      for (let i = 0; i < 11; i++) {
        const v = -1.05 + i * .21, a = f.at(-2.45, v), b = f.at(2.45, v);
        beam(kit, V(a.x, ground + .07, a.z), V(b.x, ground + .07, b.z), .045, i % 3 ? 0x5e4a3a : 0x6f5a45, 6);
      }
      for (const v of [-.9, 0, .9]) {
        const a = f.at(-2.45, v), b = f.at(2.45, v);
        beam(kit, V(a.x, ground - .02, a.z), V(b.x, ground - .02, b.z), .06, 0x4a3b2f, 4);
      }
      // Pipe wings flare from the deck ends to the gateposts.
      for (const side of [-1, 1]) for (const v of [-1, 1]) {
        const root = f.at(side * 2.5, v * 1.1), tip = f.at(side * gatepost, v * 1.7);
        const ry = landscape.heightAtWorld(root.x, root.z), ty = landscape.heightAtWorld(tip.x, tip.z);
        for (const h of [.3, .6, .9]) beam(kit, V(root.x, ry + h * .75, root.z), V(tip.x, ty + h, tip.z), .035, 0x7a7266, 5);
        beam(kit, V(root.x, ry - .1, root.z), V(root.x, ry + .72, root.z), .04, 0x7a7266, 5);
        beam(kit, V(tip.x, ty - .1, tip.z), V(tip.x, ty + .95, tip.z), .04, 0x7a7266, 5);
      }
    } else {
      // A barbed-wire gate thrown open and dragged back along the fence.
      const stays = 5;
      const points: THREE.Vector3[][] = [];
      for (let i = 0; i < stays; i++) {
        const u = -gatepost - .3 - i * .55 - rng() * .2, v = inward * (.4 + rng() * .5 + i * .12);
        const p = f.at(u, v), ground = landscape.heightAtWorld(p.x, p.z);
        const lean = rng() * .5;
        const foot = V(p.x, ground + .05, p.z), head = f.at(u - .3 - lean, v + inward * (1.1 + rng() * .2));
        const top = V(head.x, landscape.heightAtWorld(head.x, head.z) + .08 + lean * .4, head.z);
        beam(kit, foot, top, .03, 0x8a8170, 5);
        points.push([0, .25, .5, .75, 1].map(t => foot.clone().lerp(top, t)));
      }
      for (let i = 1; i < stays; i++) for (let k = 0; k < 4; k++) beam(kit, points[i - 1][k + 1], points[i][k + 1], .008, 0x4d4f4b, 3);
    }
    // Two-track ruts from the county road, through the opening, to the truck.
    const start = f.at(0, -inward * 26);
    const dx = truck.x - start.x, dz = truck.z - start.z, length = Math.hypot(dx, dz);
    const tx = dx / length, tz = dz / length, nx = -tz, nz = tx;
    const steps = Math.ceil((length + 4) / 1.2);
    for (const side of [-.93, .93]) for (let i = 0; i < steps; i++) {
      const row = (k: number) => {
        const d = Math.min(length + 4, k * 1.2);
        const cx = start.x + tx * d + nx * side, cz = start.z + tz * d + nz * side;
        return [-.42, 0, .42].map(w => {
          const x = cx + nx * w, z = cz + nz * w;
          return { x, y: landscape.heightAtWorld(x, z) + .03, z, a: w ? 0 : .9 };
        });
      };
      const r0 = row(i), r1 = row(i + 1);
      for (const [p, q2] of [[0, 1], [1, 2]]) for (const tri of [[r0[p], r1[p], r1[q2]], [r0[p], r1[q2], r0[q2]]]) for (const v of tri) {
        ruts.push(v.x, v.y, v.z); rutColors.push(dirt.r, dirt.g, dirt.b, v.a);
      }
    }
  }
  mesh(host, kit, 'Sharptail entrances', material, false);
  if (ruts.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(ruts, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(rutColors, 4));
    geometry.computeVertexNormals();
    const rutMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 1, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const result = new THREE.Mesh(geometry, rutMaterial);
    result.name = 'Sharptail two-track ruts'; result.receiveShadow = true; result.renderOrder = -2;
    host.own(geometry); host.own(rutMaterial); host.keep(result);
  }
}

/** Water held behind the dam, bulrush at its shallow head, and deep water
 * the hunter and dogs walk around. */
function buildStockPond(host: SharptailHistoryHost, material: THREE.Material): void {
  const { landscape } = host, pond = SHARPTAIL_STOCK_POND;
  const centre = landscape.propertyToWorld(pond.x, pond.y, { x: 0, z: 0 });
  const cos = Math.cos(pond.angle), sin = Math.sin(pond.angle);
  const crest = landscape.heightAtProperty(pond.dam.x, pond.dam.y);
  const damWorld = landscape.propertyToWorld(pond.dam.x, pond.dam.y, { x: 0, z: 0 });
  const damAlong = (damWorld.x - centre.x) * cos + (damWorld.z - centre.z) * sin;
  const include = (x: number, z: number) => (x - centre.x) * cos + (z - centre.z) * sin > damAlong + 2.2;
  const water = createPondedWater(host.waterMaterial, {
    x: centre.x, z: centre.z, rx: pond.rx * PROPERTY_PX_TO_M, rz: pond.ry * PROPERTY_PX_TO_M, angle: pond.angle,
    heightAt: (x, z) => landscape.heightAtWorld(x, z), level: crest - pond.freeboard, include,
    shoreDepth: 1.1, openWater: .05, cell: 1, wetColor: 0x5a4d38, wetReach: .45, wetOpacity: .7,
  });
  if (!water) return;
  water.surface.name = 'Sharptail stock pond'; water.margin.name = 'Sharptail stock pond margin';
  for (const resource of water.resources) host.own(resource);
  host.keep(water.margin); host.keep(water.surface);
  // Deep water is a boundary; the shallows can be waded.
  const reach = Math.max(pond.rx, pond.ry) * PROPERTY_PX_TO_M;
  for (let x = centre.x - reach; x <= centre.x + reach; x += 4.5) for (let z = centre.z - reach; z <= centre.z + reach; z += 4.5)
    if (water.depthAt(x, z) > .55) host.obstacles.push({ x, z, radius: 3.3 });
  // Bulrush where the draw feeds in, and along the shallow north edge.
  const kit = new Kit(), rng = mulberry32(6607);
  const reeds = [0x8f8a55, 0xa39860, 0x7c7a4c, 0xb0a26a];
  let clumps = 0;
  for (let attempt = 0; attempt < 400 && clumps < 26; attempt++) {
    const a = rng() * Math.PI * 2, r = .3 + rng() * .8;
    const x = centre.x + Math.cos(a) * reach * r, z = centre.z + Math.sin(a) * reach * r * .9;
    const depth = water.depthAt(x, z);
    if (depth < .03 || depth > .4 || !include(x, z)) continue;
    clumps++;
    for (let i = 0; i < 10; i++) {
      const bx = x + (rng() - .5) * 1.4, bz = z + (rng() - .5) * 1.4, h = 1.1 + rng() * .8;
      kit.add(new THREE.BoxGeometry(.035, h, .02), reeds[Math.floor(rng() * reeds.length)],
        place(bx, water.level + h / 2 - .1, bz, (rng() - .5) * .3, rng() * 6, (rng() - .5) * .3), .15, rng);
      if (rng() < .3) kit.add(new THREE.CylinderGeometry(.04, .04, .22, 5), 0x5c3d26, place(bx, water.level + h - .05, bz));
    }
  }
  mesh(host, kit, 'Sharptail stock pond bulrush', material, false, false);
}

/** A claim shack gone grey and caved in, its lilac windbreak run wild, the
 * outhouse leaning and a line of yard-fence posts. */
function buildHomestead(host: SharptailHistoryHost, material: THREE.Material, leaves: THREE.Material): void {
  const { landscape } = host, site = SHARPTAIL_HOMESTEAD;
  const f = frame(landscape, site.x, site.y, site.angle);
  const rng = mulberry32(40413), kit = new Kit(), bush = new Kit();
  const floor = Math.max(f.ground(-2.6, -2), f.ground(2.6, -2), f.ground(-2.6, 2), f.ground(2.6, 2)) + .12;
  const W = 5.2, D = 4, H = 2.35, RIDGE = 1.05;
  const board = () => WEATHERED[Math.floor(rng() * WEATHERED.length)];
  const at3 = (u: number, v: number, y: number) => { const p = f.at(u, v); return new THREE.Vector3(p.x, y, p.z); };
  // Sill on fieldstone piers.
  for (const [u, v] of [[-2.5, -1.9], [2.5, -1.9], [-2.5, 1.9], [2.5, 1.9], [0, -1.9], [0, 1.9]]) {
    const p = f.at(u, v), g = landscape.heightAtWorld(p.x, p.z);
    kit.add(stone(rng), 0x8d887c, place(p.x, g + .02, p.z, 0, rng() * 6, 0, .32, (floor - g) + .15, .32));
  }
  kit.add(new THREE.BoxGeometry(W, .16, D), 0x6a6358, place(f.at(0, 0).x, floor - .08, f.at(0, 0).z, 0, f.yaw, 0), .1, rng);
  // Vertical board walls. Openings leave a door and windows; the east end
  // has fallen and lies in the grass.
  const wall = (u0: number, v0: number, u1: number, v1: number, height: (t: number) => number, open: (t: number) => [number, number] | null, facing: number) => {
    const length = Math.hypot(u1 - u0, v1 - v0), count = Math.round(length / .22);
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count, u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t, h = height(t);
      if (h <= .05) continue;
      const hole = open(t), color = board();
      const piece = (from: number, to: number) => {
        if (to - from < .05) return;
        const p = f.at(u, v);
        kit.add(new THREE.BoxGeometry(.21, to - from, .03), color, place(p.x, floor + (from + to) / 2, p.z, (rng() - .5) * .02, f.yaw + facing, (rng() - .5) * .02));
      };
      if (hole) { piece(0, hole[0]); piece(hole[1], h); } else piece(0, h);
    }
  };
  const ragged = (t: number, base: number, drop: number) => base - drop * Math.max(0, Math.sin(t * 9.1 + 2)) * rng();
  // Front (south) wall with a doorway and a window; back wall with one window.
  wall(-W / 2, -D / 2, W / 2, -D / 2, t => ragged(t, H, .25), t => (t > .22 && t < .38 ? [2.0, 2.0] : t > .62 && t < .8 ? [.95, 1.85] : null), 0);
  wall(-W / 2, D / 2, W / 2, D / 2, t => ragged(t, H, .2) - t * .35, t => (t > .35 && t < .52 ? [1, 1.8] : null), 0);
  // West gable end standing to its peak.
  wall(-W / 2, -D / 2, -W / 2, D / 2, t => H + RIDGE * (1 - Math.abs(t * 2 - 1)), t => (t > .4 && t < .6 ? [1.1, 1.7] : null), Math.PI / 2);
  // East end: a stub of wall and the rest lying where it fell.
  wall(W / 2, -D / 2, W / 2, D / 2, t => (t < .25 ? H * (1 - t * 2) : 0), () => null, Math.PI / 2);
  for (let i = 0; i < 16; i++) {
    const v = -D / 2 + (i + .5) * D / 16, lie = W / 2 + .4 + rng() * .6;
    const p = f.at(lie + 1.1, v), g = landscape.heightAtWorld(p.x, p.z);
    kit.add(new THREE.BoxGeometry(2.1 + rng() * .3, .03, .21), board(), place(p.x, g + .04 + rng() * .04, p.z, (rng() - .5) * .08, f.yaw + (rng() - .5) * .12, (rng() - .5) * .1));
  }
  // Ridge beam sagging to the fallen end; rafters on the open front slope.
  const ridgeWest = at3(-W / 2, 0, floor + H + RIDGE), ridgeEast = at3(W / 2 - .3, 0, floor + 1.2);
  beam(kit, ridgeWest, ridgeEast, .08, 0x6b6459, 4);
  for (let i = 0; i < 7; i++) {
    const t = i / 6, top = ridgeWest.clone().lerp(ridgeEast, t);
    const eave = at3(-W / 2 + t * (W - .3), -D / 2 - .2, floor + H - t * 1.5);
    if (i % 3 !== 1) beam(kit, top, eave, .05, 0x75705f, 4);
    // The back slope still carries boards, sagging with the ridge.
    const back = at3(-W / 2 + t * (W - .3), D / 2 + .25, floor + H - .1 - t * .9);
    for (let k = 0; k < 4; k++) {
      if (rng() < .12) continue;
      const a = top.clone().lerp(back, k / 4), b = top.clone().lerp(back, (k + 1) / 4);
      const mid = a.clone().add(b).multiplyScalar(.5), dir = b.clone().sub(a);
      const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
      m.setPosition(mid);
      kit.add(new THREE.BoxGeometry(W / 6.2, .03, dir.length() + .05), board(), m);
    }
  }
  // The front slope's boards slid into the room.
  for (let i = 0; i < 9; i++) {
    const u = -W / 2 + .4 + i * .52, top = at3(u, -.3, floor + 1.3 + (1 - i / 9) * 1.1), foot = at3(u + (rng() - .5) * .3, -1.6, floor + .1);
    const m = new THREE.Matrix4().lookAt(top, foot, new THREE.Vector3(0, 1, 0)); m.setPosition(top.clone().add(foot).multiplyScalar(.5));
    kit.add(new THREE.BoxGeometry(.5, .03, top.distanceTo(foot)), board(), m);
  }
  host.obstacles.push({ x: f.centre.x, z: f.centre.z, radius: 2.9 });
  // Outhouse, leaning, behind and east.
  {
    const p = f.at(4.6, 4.2), g = landscape.heightAtWorld(p.x, p.z);
    const lean = new THREE.Matrix4().compose(new THREE.Vector3(p.x, g, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(.16, f.yaw + .3, .08, 'YXZ')), new THREE.Vector3(1, 1, 1));
    const piece = (geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number) =>
      kit.add(geometry, color, lean.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)));
    piece(new THREE.BoxGeometry(1.2, 2.1, .04), board(), 0, 1.05, -.6);
    piece(new THREE.BoxGeometry(1.2, 2.25, .04), board(), 0, 1.12, .6);
    piece(new THREE.BoxGeometry(.04, 2.15, 1.2), board(), -.6, 1.08, 0);
    piece(new THREE.BoxGeometry(.04, 1.9, .7), board(), .6, .95, -.2);
    piece(new THREE.BoxGeometry(1.35, .04, 1.4), 0x5d584f, 0, 2.2, 0);
    host.obstacles.push({ x: p.x, z: p.z, radius: .85 });
  }
  // A rusted barrel on its side and the yard fence down to four posts.
  {
    const p = f.at(3.4, -3.2), g = landscape.heightAtWorld(p.x, p.z);
    kit.add(new THREE.CylinderGeometry(.29, .29, .88, 10), 0x5e4535, place(p.x, g + .26, p.z, 0, f.yaw + .7, Math.PI / 2), .15, rng);
    for (let i = 0; i < 5; i++) {
      if (i === 2) continue;
      const q2 = f.at(-7 + i * 3.4, -6.5), gy = landscape.heightAtWorld(q2.x, q2.z);
      kit.add(new THREE.CylinderGeometry(.06, .075, 1.2, 5), 0x7b746a, place(q2.x, gy + .5, q2.z, (rng() - .5) * .35, 0, (rng() - .5) * .35));
    }
  }
  // Lilacs: the windbreak row on the north side and a hedge down the west.
  const leaf = [0x55603a, 0x5f5a3c, 0x6a5540, 0x4c5636, 0x645a44];
  const lilac = (u: number, v: number, size: number) => {
    const p = f.at(u, v), g = landscape.heightAtWorld(p.x, p.z);
    for (let i = 0; i < 6; i++) beam(bush, new THREE.Vector3(p.x + (rng() - .5) * .8, g, p.z + (rng() - .5) * .8),
      new THREE.Vector3(p.x + (rng() - .5) * 1.6, g + size * .8, p.z + (rng() - .5) * 1.6), .04, 0x4a4238, 4);
    for (let i = 0; i < 9; i++) {
      const r = (.55 + rng() * .45) * size / 2.6;
      bush.add(new THREE.IcosahedronGeometry(r, 0), leaf[Math.floor(rng() * leaf.length)],
        place(p.x + (rng() - .5) * size * .7, g + size * (.35 + rng() * .55), p.z + (rng() - .5) * size * .7, rng() * 3, rng() * 3, 0, 1, .85, 1), .2, rng);
    }
    host.obstacles.push({ x: p.x, z: p.z, radius: size * .42 });
  };
  for (let i = 0; i < 7; i++) lilac(-7 + i * 2.3 + (rng() - .5) * .6, 6.2 + (rng() - .5) * .8, 2.4 + rng() * 1.1);
  for (let i = 0; i < 4; i++) lilac(-7.4 + (rng() - .5) * .6, 3.6 - i * 2.4, 2.2 + rng() * .9);
  mesh(host, kit, 'Sharptail homestead', material, true);
  mesh(host, bush, 'Sharptail homestead lilacs', leaves, false);
}

/** Lodge-cover stones, half sunk in the sod, lichened orange and green. */
function buildTipiRings(host: SharptailHistoryHost, material: THREE.Material): void {
  const { landscape } = host, kit = new Kit(), tint = new THREE.Color();
  const greys = [0x77736b, 0x8a8478, 0x69675f, 0x807a6d], orange = new THREE.Color(0xc0913f), green = new THREE.Color(0x9aa37a);
  for (const s of SHARPTAIL_TIPI_STONES) {
    const rng = mulberry32(s.seed);
    const p = landscape.propertyToWorld(s.x, s.y, { x: 0, z: 0 }), g = landscape.heightAtWorld(p.x, p.z);
    tint.setHex(greys[Math.floor(rng() * greys.length)]).lerp(rng() < .5 ? orange : green, rng() * .3);
    kit.add(stone(rng), tint, place(p.x, g - s.size * .12, p.z, (rng() - .5) * .4, rng() * 6, (rng() - .5) * .4, s.size * 1.25, s.size * .55, s.size), .1, rng);
  }
  mesh(host, kit, 'Sharptail tipi rings', material, false, false);
}

/** Badger diggings: fans of pale subsoil below dark holes, and the small
 * plugged mounds of pocket gophers. */
function buildBadgerKnoll(host: SharptailHistoryHost, material: THREE.Material): void {
  const { landscape } = host, kit = new Kit(), rng = mulberry32(5519);
  const dome = () => new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const b of SHARPTAIL_BURROWS) {
    const p = landscape.propertyToWorld(b.x, b.y, { x: 0, z: 0 });
    const dx = Math.cos(b.angle), dz = Math.sin(b.angle);
    if (b.badger) {
      const reach = b.size * 1.6;
      const fx = p.x + dx * reach * .45, fz = p.z + dz * reach * .45;
      const g = landscape.heightAtWorld(fx, fz);
      kit.add(dome(), rng() < .5 ? 0xb9a987 : 0xa99772, place(fx, g - .05, fz, 0, -b.angle, 0, reach * .75, b.size * .34, b.size * .65), .12, rng);
      const hg = landscape.heightAtWorld(p.x, p.z);
      kit.add(new THREE.CylinderGeometry(.24 * b.size, .28 * b.size, .08, 9), 0x1f1a14, place(p.x, hg + .09, p.z, 0, -b.angle, -.35, 1, 1, .75));
      for (let i = 0; i < 6; i++) {
        const cx = fx + (rng() - .5) * reach * 1.4, cz = fz + (rng() - .5) * reach * 1.2, size = .06 + rng() * .08;
        kit.add(stone(rng), 0xa89877, place(cx, landscape.heightAtWorld(cx, cz) + size * .3, cz, rng() * 3, rng() * 6, 0, size, size * .7, size));
      }
    } else {
      const g = landscape.heightAtWorld(p.x, p.z);
      kit.add(dome(), 0x8e7c5e, place(p.x, g - .04, p.z, 0, rng() * 6, 0, b.size, b.size * .32, b.size * .85), .12, rng);
    }
  }
  mesh(host, kit, 'Sharptail badger diggings', material, false, false);
}
