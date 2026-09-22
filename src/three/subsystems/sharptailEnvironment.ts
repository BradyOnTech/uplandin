import * as THREE from 'three';

type Point = [number, number, number];
type GroundAt = (x: number, z: number) => number;

/** The existing barn collision circle is authoritative. Every part of the
 * shack and its stored equipment fits inside it; this adds no prairie obstacles. */
export const SHARPTAIL_SHACK_RADIUS = 7.8;

const PALETTE = {
  timber: [0xb1a48e, 0xa59e8b, 0xb8b09c, 0x999884, 0xc1b39a],
  shade: 0x71796b,
  trim: 0xcbc5ac,
  sill: 0x6f7867,
  roof: [0x69796f, 0x79867a, 0x617166, 0x859180],
  seam: 0xa2ad9c,
  rust: 0x88725d,
  glass: 0x425c60,
  stone: [0x969a8b, 0x83897f, 0xa9a897, 0x777f76],
} as const;

const YARD = { x: -.4, z: 3.50, rx: 6.15, rz: 2.72, radius: 7.45 } as const;
function yardEdge(angle: number): number {
  return 1 + .035 * Math.sin(angle * 3 + .8) + .025 * Math.sin(angle * 7 - .4);
}

/** Visual wear under the existing, inaccessible building footprint. Shared
 * with grass placement so a packed working yard is not filled with upright
 * stems. Local unrotated metres; never an extension of habitat or collision. */
export function sharptailShackYardAt(x: number, z: number): number {
  const dx = (x - YARD.x) / YARD.rx, dz = (z - YARD.z) / YARD.rz;
  const distance = Math.hypot(dx, dz) / yardEdge(Math.atan2(dz, dx));
  const radialFade = Math.min(1, Math.max(0, (YARD.radius - Math.hypot(x, z)) / .35));
  const t = Math.min(1, Math.max(0, (1 - distance) / .25));
  return t * t * (3 - 2 * t) * radialFade;
}

/**
 * Two static vertex-coloured batches on both tiers. Broad weathered planes,
 * a closed gable, asymmetric lean-to and stovepipe give the distant Line
 * Shack a prairie silhouette; small construction details reward the approach.
 *
 * groundAt returns heights relative to the landmark origin in unrotated local
 * metres. The host owns the supplied materials and disposes the returned
 * geometries. The optional ground material lets the apron use a ground grade
 * while the solid building receives its own softer shade-side lighting.
 */
export function createSharptailLineShack(material: THREE.Material, groundAt: GroundAt = () => 0, groundMaterial: THREE.Material = material): THREE.Group {
  const positions: number[] = [], colors: number[] = [];
  const tint = new THREE.Color();
  const append = (source: THREE.BufferGeometry, color: number) => {
    const geometry = source.index ? source.toNonIndexed() : source;
    const vertices = geometry.getAttribute('position'), vertexColors = geometry.getAttribute('color');
    tint.setHex(color);
    for (let i = 0; i < vertices.count; i++) {
      positions.push(vertices.getX(i), vertices.getY(i), vertices.getZ(i));
      if (vertexColors) colors.push(vertexColors.getX(i), vertexColors.getY(i), vertexColors.getZ(i));
      else colors.push(tint.r, tint.g, tint.b);
    }
    if (geometry !== source) geometry.dispose();
    source.dispose();
  };
  const face = (points: Point[], color: number, outward: Point, upperColor?: number) => {
    const normal = new THREE.Vector3().subVectors(new THREE.Vector3(...points[1]), new THREE.Vector3(...points[0]))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...points[2]), new THREE.Vector3(...points[0])));
    const reverse = normal.dot(new THREE.Vector3(...outward)) < 0;
    const indices: number[] = [];
    for (let i = 1; i < points.length - 1; i++) indices.push(0, reverse ? i + 1 : i, reverse ? i : i + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    if (upperColor !== undefined) {
      const lower = new THREE.Color(color), upper = new THREE.Color(upperColor);
      const low = Math.min(...points.map(point => point[1])), high = Math.max(...points.map(point => point[1]));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(points.flatMap(point =>
        lower.clone().lerp(upper, (point[1] - low) / Math.max(.001, high - low)).toArray()), 3));
    }
    geometry.setIndex(indices); append(geometry, color);
  };
  const box = (size: Point, at: Point, color: number, rotation: Point = [0, 0, 0]) => {
    const geometry = new THREE.BoxGeometry(...size);
    geometry.rotateX(rotation[0]); geometry.rotateY(rotation[1]); geometry.rotateZ(rotation[2]);
    geometry.translate(...at); append(geometry, color);
  };
  const beam = (a: Point, b: Point, width: number, depth: number, color: number) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const geometry = new THREE.BoxGeometry(width, direction.length(), depth);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    geometry.translate(...start.add(end).multiplyScalar(.5).toArray() as Point);
    append(geometry, color);
  };

  // Sample the occupied footprint, not just four corners: a convex shoulder
  // can be highest under the middle of a wall or the attached equipment shed.
  let highest = -Infinity;
  for (let x = -5.8; x <= 6.01; x += .4) for (let z = -2.8; z <= 2.81; z += .4)
    highest = Math.max(highest, groundAt(x, z));
  const floor = highest + .18;
  const y = (height: number) => floor + height;

  // A continuous stone plinth follows the terrain along every edge. The
  // bottom sits below ground; the top stays level with the timber sill.
  const foundation = (left: number, right: number, back: number, front: number) => {
    const corners: [number, number][] = [[left, back], [right, back], [right, front], [left, front]];
    for (let edge = 0; edge < corners.length; edge++) {
      const [ax, az] = corners[edge], [bx, bz] = corners[(edge + 1) % corners.length];
      const count = Math.ceil(Math.hypot(bx - ax, bz - az) / .45);
      const outward: Point = [bz - az, 0, ax - bx];
      for (let i = 0; i < count; i++) {
        const x0 = ax + (bx - ax) * i / count, z0 = az + (bz - az) * i / count;
        const x1 = ax + (bx - ax) * (i + 1) / count, z1 = az + (bz - az) * (i + 1) / count;
        face([[x0, groundAt(x0, z0) - .22, z0], [x1, groundAt(x1, z1) - .22, z1],
          [x1, floor + .16, z1], [x0, floor + .16, z0]], PALETTE.stone[(edge + i) % PALETTE.stone.length], outward);
      }
    }
    face([[left, floor + .16, back], [right, floor + .16, back], [right, floor + .16, front], [left, floor + .16, front]], PALETTE.stone[1], [0, 1, 0]);
  };
  foundation(-5.75, 3.15, -2.78, 2.78);
  foundation(3.12, 6.0, -2.34, 2.34);
  box([8.8, 3.2, 5.4], [-1.3, y(1.76), 0], PALETTE.shade);

  // Subtle broad boards remain legible at walking distance without noisy
  // painted grain or a mesh/draw call for every plank. Both approaches get
  // real elevations and construction, rather than a decorated front only.
  for (const side of [-1, 1]) {
    const z = side * 2.713;
    for (let i = 0; i < 23; i++) {
      const left = -5.7 + i * 8.8 / 23 + .012, right = left + 8.8 / 23 - .022;
      face([[left, y(.19), z], [right, y(.19), z], [right, y(3.35), z], [left, y(3.35), z]],
        PALETTE.timber[(i * 3 + (side + 1)) % 5], [0, 0, side], i % 4 === 0 ? 0xd2c4a8 : 0xbdb6a1);
    }
    box([8.94, .19, .14], [-1.3, y(.25), side * 2.76], PALETTE.sill);
    box([8.98, .17, .16], [-1.3, y(3.34), side * 2.77], PALETTE.trim);
    for (const x of [-5.63, 3.03]) box([.17, 3.23, .13], [x, y(1.77), side * 2.765], PALETTE.trim);
  }
  const eave = 3.36, ridge = 4.93;
  for (const side of [-1, 1]) {
    const x = side < 0 ? -5.712 : 3.112;
    face([[x, y(eave), -2.7], [x, y(ridge), 0], [x, y(eave), 2.7]], PALETTE.timber[1], [side, 0, 0]);
    for (let i = 0; i < 15; i++) {
      const back = -2.7 + i * .36 + .01, front = back + .338;
      const top = (z: number) => eave + (ridge - eave) * (1 - Math.abs(z) / 2.7);
      face([[x + side * .012, y(.2), back], [x + side * .012, y(.2), front],
        [x + side * .012, y(top(front) - .035), front], [x + side * .012, y(top(back) - .035), back]], PALETTE.timber[(i + 2) % 5], [side, 0, 0]);
    }
    for (const z of [-1, 1]) beam([x + side * .025, y(eave), z * 2.87], [x + side * .025, y(ridge + .015), 0], .14, .16, PALETTE.trim);
  }

  // Dull standing-seam metal has a few broad repairs, not regular corrugated
  // stripes. Roof ends and gables are closed, with a modest useful silhouette.
  const pitch = Math.atan2(ridge - eave, 2.7), roofLength = Math.hypot(2.98, (ridge - eave) * 2.98 / 2.7);
  const roofCenterY = ridge - (ridge - eave) * 1.49 / 2.7;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const x = -5.52 + i * 1.055;
      box([1.065, .105, roofLength], [x, y(roofCenterY + .055), side * 1.49], PALETTE.roof[(i + (side > 0 ? 1 : 0)) % 4], [side * pitch, 0, 0]);
      box([.036, .062, roofLength], [x - .517, y(roofCenterY + .133), side * 1.49], PALETTE.seam, [side * pitch, 0, 0]);
    }
  }
  box([9.63, .16, .25], [-1.3, y(ridge + .1), 0], PALETTE.seam);

  const window = (x: number, z: number, side: number) => {
    box([1.14, 1.18, .095], [x, y(2.15), z], PALETTE.trim);
    box([.91, .95, .10], [x, y(2.15), z + side * .035], PALETTE.glass);
    box([.065, .98, .13], [x, y(2.15), z + side * .075], PALETTE.trim);
    box([.94, .065, .13], [x, y(2.12), z + side * .075], PALETTE.trim);
    box([1.31, .11, .23], [x, y(1.51), z + side * .08], PALETTE.sill);
  };
  window(-4.12, 2.79, 1); window(1.08, 2.79, 1);
  window(-3.22, -2.79, -1); window(.48, -2.79, -1);
  // A single narrow door and a shallow awning distinguish a working line
  // shack from the large double-door agricultural barn used elsewhere.
  box([1.24, 2.25, .12], [-1.52, y(1.30), 2.80], 0x6d786d);
  for (const x of [-2.20, -.84]) box([.14, 2.41, .16], [x, y(1.35), 2.86], PALETTE.trim);
  box([1.55, .14, .17], [-1.52, y(2.55), 2.87], PALETTE.trim);
  for (const x of [-1.94, -1.66, -1.38, -1.10]) box([.02, 2.1, .025], [x, y(1.30), 2.87], PALETTE.shade);
  box([.08, .16, .12], [-1.04, y(1.32), 2.94], PALETTE.rust);
  box([3.05, .13, 1.22], [-1.52, y(2.76), 3.27], PALETTE.roof[2], [.12, 0, 0]);
  beam([-2.85, y(2.00), 2.87], [-2.85, y(2.62), 3.70], .085, .085, PALETTE.trim);
  beam([-.19, y(2.00), 2.87], [-.19, y(2.62), 3.70], .085, .085, PALETTE.trim);

  // The lower shed side breaks the symmetry while its walls, foundation
  // and roof stay wholly inside the inherited collision footprint.
  box([2.82, 1.96, 4.5], [4.52, y(1.12), 0], PALETTE.timber[3]);
  const shedPitch = Math.atan2(1.15, 3.02);
  box([3.26, .12, 5.02], [4.57, y(2.73), 0], PALETTE.roof[2], [0, 0, -shedPitch]);
  for (const z of [-2.27, 2.27]) {
    face([[3.11, y(2.10), z], [6, y(2.10), z], [6, y(2.21), z], [3.11, y(3.31), z]], PALETTE.timber[2], [0, 0, Math.sign(z)]);
    for (let i = 0; i < 8; i++) box([.045, 1.90, .045], [3.25 + i * .375, y(1.14), z + Math.sign(z) * .012], PALETTE.sill);
  }
  for (const z of [-2.18, 2.18]) box([.15, 2.06, .16], [5.94, y(1.16), z], PALETTE.trim);
  box([.13, .16, 4.58], [5.97, y(2.14), 0], PALETTE.trim);
  box([1.44, 1.77, .075], [4.46, y(1.10), 2.31], 0x818979);
  for (const x of [3.7, 5.22]) box([.11, 1.91, .1], [x, y(1.13), 2.36], PALETTE.trim);
  box([1.62, .12, .11], [4.46, y(2.10), 2.37], PALETTE.trim);
  beam([3.80, y(.35), 2.38], [5.12, y(1.91), 2.38], .10, .07, PALETTE.timber[2]);

  // Offset stove pipe, collar and rain cap read above the roof from the
  // long approach. No smoke particles or per-frame work are needed.
  box([.58, .12, .63], [.75, y(4.80), -.55], PALETTE.roof[2], [-pitch, 0, 0]);
  box([.31, 1.38, .31], [.75, y(5.24), -.55], 0x636e66);
  box([.51, .095, .51], [.75, y(5.97), -.55], PALETTE.seam);

  const stone = (x: number, z: number, sx: number, sy: number, sz: number, angle: number, index: number) => {
    const geometry = new THREE.IcosahedronGeometry(1, 0), vertices = geometry.getAttribute('position');
    // A low buried shoulder with a clipped underside, not a hovering sphere.
    for (let i = 0; i < vertices.count; i++) {
      const px = vertices.getX(i), py = vertices.getY(i), pz = vertices.getZ(i);
      const deform = 1 + Math.sin(px * 5.1 + pz * 3.7 + index) * .12;
      vertices.setXYZ(i, px * sx * deform, Math.max(-.22, py) * sy, pz * sz * deform);
    }
    geometry.rotateY(angle);
    geometry.translate(x, groundAt(x, z) + sy * .10, z);
    append(geometry, PALETTE.stone[index % 4]);
  };
  // Two small fieldstone accumulations are tied to the working yard and
  // foundation, not scattered across the dog casts or hunting cover.
  const stones: readonly [number, number, number, number, number, number][] = [
    [-5.94, 2.64, .57, .36, .44, .4], [-5.50, 3.00, .39, .28, .48, 1.7],
    [-5.91, 3.37, .44, .26, .35, -.4], [-5.12, 3.25, .36, .21, .29, .7],
    [5.78, 2.73, .43, .29, .37, .2], [5.80, 3.22, .31, .21, .34, 1.2],
  ];
  stones.forEach((s, i) => stone(...s, i));

  // A stored gate leans against the side wall. It is deliberately not a
  // functioning fence or a new solid barrier in the surrounding prairie.
  const gateX = -5.92, gateBase = Math.max(groundAt(-6.05, -.7), groundAt(-6.05, 1.65));
  for (const z of [-.7, 1.65]) beam([gateX - .15, gateBase - .10, z], [gateX + .04, gateBase + 1.32, z], .11, .11, PALETTE.sill);
  for (const height of [.30, .81, 1.23]) beam([gateX - .15 + height * .135, gateBase + height, -.74], [gateX - .15 + height * .135, gateBase + height, 1.69], .095, .095, PALETTE.timber[2]);
  beam([gateX - .105, gateBase + .32, -.65], [gateX + .015, gateBase + 1.21, 1.56], .07, .085, PALETTE.sill);

  // One useful ranch-yard object reads at approach distance: a dull oval
  // stock trough with a broad rim and shaded dry interior. Its rounded ends
  // are distinct from the shack's timber planes, without decorative clutter.
  const trough = { x: 4.10, z: 3.81, rx: 1.27, rz: .65 };
  const troughGround = Math.max(...[-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dz =>
    groundAt(trough.x + dx * trough.rx, trough.z + dz * trough.rz))));
  const troughBottom = troughGround + .15, troughTop = troughBottom + .76;
  const ringPoint = (angle: number, rx: number, rz: number, height: number): Point =>
    [trough.x + Math.cos(angle) * rx, height, trough.z + Math.sin(angle) * rz];
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8;
    const outward: Point = [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)];
    face([ringPoint(a, 1.16, .54, troughBottom), ringPoint(b, 1.16, .54, troughBottom),
      ringPoint(b, 1.27, .65, troughTop), ringPoint(a, 1.27, .65, troughTop)], i % 5 === 0 ? 0x8b998c : 0xa5afa0, outward);
    face([ringPoint(a, 1.27, .65, troughTop), ringPoint(b, 1.27, .65, troughTop),
      ringPoint(b, 1.15, .53, troughTop), ringPoint(a, 1.15, .53, troughTop)], 0xc0c5af, [0, 1, 0]);
    face([ringPoint(a, 1.15, .53, troughTop), ringPoint(b, 1.15, .53, troughTop),
      ringPoint(b, 1.07, .45, troughBottom + .10), ringPoint(a, 1.07, .45, troughBottom + .10)], 0x71877b, [-outward[0], 0, -outward[2]]);
    face([[trough.x, troughBottom + .10, trough.z], ringPoint(a, 1.07, .45, troughBottom + .10),
      ringPoint(b, 1.07, .45, troughBottom + .10)], 0x53675b, [0, 1, 0]);
  }
  for (const dx of [-.78, .78]) {
    const x = trough.x + dx;
    const base = Math.min(...[-.22, .22].flatMap(ox => [-.62, .62].map(oz => groundAt(x + ox, trough.z + oz)))) - .12;
    box([.44, troughBottom - base + .06, 1.24], [x, (troughBottom + base) / 2, trough.z], PALETTE.stone[1]);
  }

  // The two door steps have independent terrain-rooted foundations. Height
  // is clamped above local ground even if the building sits on a new shoulder.
  for (const [z, width, top] of [[3.00, 1.80, floor + .18], [3.52, 2.02, floor + .03]] as const) {
    const bottom = Math.min(groundAt(-1.52 - width / 2, z), groundAt(-1.52 + width / 2, z)) - .15;
    const stepTop = Math.max(top, groundAt(-1.52, z) + .07);
    box([width, stepTop - bottom, .55], [-1.52, (stepTop + bottom) / 2, z], PALETTE.stone[0]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Sharptail Line Shack'; mesh.castShadow = true; mesh.receiveShadow = true;
  const root = new THREE.Group(); root.name = 'Sharptail Line Shack and working yard'; root.add(mesh);

  // The irregular apron belongs to this working destination, not a new
  // gameplay route. Vertices follow ground rather than the level floor;
  // low-contrast edges and a little flattened straw tie it into the prairie.
  const yardPositions: number[] = [], yardColors: number[] = [];
  const yardNoise = (x: number, z: number) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const hash = (a: number, b: number) => {
      const h = Math.sin(a * 127.1 + b * 311.7 + 47.2) * 43758.5453;
      return h - Math.floor(h);
    };
    const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const verge = new THREE.Color(0x7f8963), earth = new THREE.Color(0x817352), dryLitter = new THREE.Color(0xb0a075);
  const yardVertex = (x: number, z: number, straw = false) => {
    yardPositions.push(x, groundAt(x, z) + (straw ? .041 : .026), z);
    const wear = sharptailShackYardAt(x, z);
    const broad = yardNoise(x * .62 + 9, z * .62 + 17), grit = yardNoise(x * 1.85, z * 1.85);
    // Packed soil and litter form soft patches rather than a uniform grey
    // slab. The last rings return to the green-straw floor, including its
    // subdued variation, so the apron loses its painted oval outline.
    const color = straw ? new THREE.Color(0xaba078)
      : verge.clone().lerp(earth.clone().lerp(dryLitter, broad), wear * (.64 + broad * .28));
    if (!straw) color.multiplyScalar(.91 + broad * .15 + (grit - .5) * .08 * wear);
    yardColors.push(color.r, color.g, color.b);
  };
  const yardPoint = (angle: number, ring: number): [number, number] => {
    const edge = yardEdge(angle) * ring;
    let x = YARD.x + Math.cos(angle) * YARD.rx * edge, z = YARD.z + Math.sin(angle) * YARD.rz * edge;
    const radius = Math.hypot(x, z);
    if (radius > YARD.radius) { x *= YARD.radius / radius; z *= YARD.radius / radius; }
    return [x, z];
  };
  const sectors = 32, rings = 6;
  for (let ring = 0; ring < rings; ring++) for (let i = 0; i < sectors; i++) {
    const a = i * Math.PI * 2 / sectors, b = (i + 1) * Math.PI * 2 / sectors;
    const innerA = yardPoint(a, ring / rings), innerB = yardPoint(b, ring / rings);
    const outerA = yardPoint(a, (ring + 1) / rings), outerB = yardPoint(b, (ring + 1) / rings);
    // Clockwise in XZ gives +Y. A single center fan avoids zero-area triangles.
    for (const p of [innerA, outerB, outerA]) yardVertex(...p);
    if (ring > 0) for (const p of [innerA, innerB, outerB]) yardVertex(...p);
  }
  for (let i = 0; i < 18; i++) {
    const angle = i * 2.39996, ring = .72 + (i % 3) * .075;
    const [x, z] = yardPoint(angle, ring), length = .20 + (i % 4) * .07;
    if (z < 2.85 || Math.hypot(x, z) > 7.1) continue;
    const dx = Math.cos(angle + .7) * length, dz = Math.sin(angle + .7) * length;
    for (const p of [[x - dx, z - dz], [x + dx, z + dz], [x + .045, z - .035]]) yardVertex(p[0], p[1], true);
    for (const p of [[x - dx, z - dz], [x + .045, z - .035], [x + dx, z + dz]]) yardVertex(p[0], p[1], true);
  }
  const yardGeometry = new THREE.BufferGeometry();
  yardGeometry.setAttribute('position', new THREE.Float32BufferAttribute(yardPositions, 3));
  yardGeometry.setAttribute('color', new THREE.Float32BufferAttribute(yardColors, 3));
  yardGeometry.computeVertexNormals(); yardGeometry.computeBoundingBox(); yardGeometry.computeBoundingSphere();
  const yard = new THREE.Mesh(yardGeometry, groundMaterial);
  yard.name = 'Sharptail Line Shack worn yard'; yard.receiveShadow = true;
  yard.userData.shotSolid = false; root.add(yard);
  return root;
}
