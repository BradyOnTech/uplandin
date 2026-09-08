import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { QUAIL_GATE } from './quailEntrances';

/** Farm assets render in a few material batches, including the independently rotating wheel. */
function consolidate(root: THREE.Group): THREE.Group {
  const rotor = root.getObjectByName('Quail wind rotor');
  if (rotor instanceof THREE.Group && rotor !== root) {
    root.remove(rotor); consolidate(rotor);
  }
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(); const matrix = new THREE.Matrix4();
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>(); const originals = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const mat = object.material as THREE.Material; const geometry = object.geometry.clone();
    geometry.applyMatrix4(matrix.multiplyMatrices(inverse, object.matrixWorld));
    if (!groups.has(mat)) groups.set(mat, []); groups.get(mat)!.push(geometry); originals.add(object.geometry);
  });
  root.clear();
  for (const [mat, geometries] of groups) {
    const geometry = mergeGeometries(geometries); const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    for (const part of geometries) part.dispose();
  }
  for (const geometry of originals) geometry.dispose();
  if (rotor && rotor !== root) root.add(rotor);
  return root;
}

function material(color: number, metalness = 0, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
}
function box(root: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
}
function rod(root: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material, endRadius = radius): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(endRadius, radius, a.distanceTo(b), 6), mat);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.castShadow = true; root.add(mesh); return mesh;
}

/** Weathered farm pickup: a readable cab, open bed, glass, wheel arches and working details. */
export function createQuailTruck(groundAt: (x: number, z: number) => number = () => 0): THREE.Group {
  const root = new THREE.Group(); root.name = 'Quail hunting pickup';
  const wheels = new Set<THREE.Object3D>(); const wheelHeights: number[] = [];
  const paint = material(0x59766c, 0.08, 0.86); const paintLight = material(0x91a092, 0.08, 0.84);
  const rubber = material(0x252b29); const trim = material(0x82877f, 0.25, 0.65);
  const glass = material(0x526873, 0.16, 0.38); const bed = material(0x3c4840); const light = material(0xd5c6a1, 0.15, 0.3); const tail = material(0xa45943, 0.15, 0.4);
  paint.name = 'Quail pickup body'; glass.name = 'Quail pickup glazing';
  type Point = [number, number, number];
  const face = (parent: THREE.Object3D, points: Point[], mat: THREE.Material, outward: Point) => {
    const normal = new THREE.Vector3().subVectors(new THREE.Vector3(...points[1]), new THREE.Vector3(...points[0]))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...points[2]), new THREE.Vector3(...points[0])));
    const reverse = normal.dot(new THREE.Vector3(...outward)) < 0, indices: number[] = [];
    for (let i = 1; i < points.length - 1; i++) indices.push(0, reverse ? i + 1 : i, reverse ? i : i + 1);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); parent.add(new THREE.Mesh(geometry, mat));
  };
  // Convex rings give the hood and roof broad chamfers, without beveling every
  // small part. Points wind clockwise when seen from above.
  const loft = (rings: Point[][], mat: THREE.Material, capTop = true) => {
    const count = rings[0].length, indices: number[] = [];
    for (let level = 1; level < rings.length; level++) for (let i = 0; i < count; i++) {
      const a = (level - 1) * count + i, b = (level - 1) * count + (i + 1) % count;
      indices.push(a, a + count, b, b, a + count, b + count);
    }
    const top = (rings.length - 1) * count;
    for (let i = 1; i < count - 1; i++) {
      indices.push(0, i, i + 1);
      if (capTop) indices.push(top, top + i + 1, top + i);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(rings.flat(2), 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); root.add(new THREE.Mesh(geometry, mat));
  };
  const outline = (width: number, front: number, back: number, height: number, bevel: number): Point[] => [
    [-width + bevel, height, front], [width - bevel, height, front], [width, height, front + bevel], [width, height, back - bevel],
    [width - bevel, height, back], [-width + bevel, height, back], [-width, height, back - bevel], [-width, height, front + bevel],
  ];
  // Front is local -Z. The narrow chassis stays behind genuine arch openings.
  box(root, 0, .74, 0, 1.64, .22, 4.5, bed);
  const hoodTop = outline(.97, -2.24, -1.09, 1.39, .09);
  for (const p of hoodTop) p[1] -= Math.max(0, (-p[2] - 1.09) / 1.15) * .105;
  loft([outline(.84, -2.22, -1.10, .81, .07), hoodTop], paint, false);
  face(root, hoodTop, paintLight, [0, 1, 0]);
  box(root, 0, 1.10, -.32, 1.68, .72, 1.55, paint);
  loft([outline(.89, -.88, .36, 2.005, .065), outline(.86, -.83, .31, 2.075, .065)], paintLight);

  // A tapered cab and glazing share the same rake: the windshield's top
  // moves rearward, unlike the old forward-leaning pane and square roof.
  face(root, [[-.84, 1.50, -1.105], [.84, 1.50, -1.105], [.79, 1.985, -.803], [-.79, 1.985, -.803]], glass, [0, 0, -1]);
  face(root, [[-.86, 1.52, .401], [.86, 1.52, .401], [.79, 1.985, .279], [-.79, 1.985, .279]], glass, [0, 0, 1]);
  for (const side of [-1, 1]) {
    face(root, [[side * .955, 1.51, -1.015], [side * .955, 1.51, .335], [side * .833, 1.985, .264], [side * .833, 1.985, -.764]], glass, [side, 0, 0]);
    rod(root, new THREE.Vector3(side * .90, 1.49, -1.10), new THREE.Vector3(side * .835, 2.015, -.79), .043, paintLight);
    rod(root, new THREE.Vector3(side * .928, 1.49, .402), new THREE.Vector3(side * .837, 2.015, .275), .043, paintLight);
    box(root, side * .963, 1.465, -.34, .025, .033, 1.39, paintLight);
    box(root, side * .982, 1.345, .16, .035, .035, .18, trim);
    box(root, side * .978, 1.09, .447, .012, .69, .018, bed);
    rod(root, new THREE.Vector3(side * .94, 1.54, -.94), new THREE.Vector3(side * 1.10, 1.61, -.95), .022, trim);
    box(root, side * 1.14, 1.64, -.96, .12, .15, .16, paint);

    // The lower side outline cuts around the tyres instead of drawing a
    // rectangular slab through them. Seven facets define each wheel arch.
    const archRadius = .535, archY = .50, lower = .70, firstAngle = Math.asin((lower - archY) / archRadius);
    const shape = new THREE.Shape(); shape.moveTo(-2.225, 1.285); shape.lineTo(-1.09, 1.39);
    shape.lineTo(-1.015, 1.47); shape.lineTo(.445, 1.47); shape.lineTo(.59, 1.37); shape.lineTo(2.265, 1.37); shape.lineTo(2.265, lower);
    for (const axle of [1.53, -1.42]) {
      for (let n = 0; n <= 7; n++) {
        const a = firstAngle + (Math.PI - 2 * firstAngle) * n / 7;
        shape.lineTo(axle + Math.cos(a) * archRadius, archY + Math.sin(a) * archRadius);
      }
    }
    shape.lineTo(-2.225, lower); shape.closePath();
    const panel = new THREE.ShapeGeometry(shape), p = panel.getAttribute('position'), index = panel.index!;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, side * .973, p.getY(i), p.getX(i));
    // ShapeGeometry's +Z face becomes -X under this coordinate mapping.
    if (side > 0) for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i); index.setX(i, index.getX(i + 1)); index.setX(i + 1, a);
    }
    panel.computeVertexNormals(); root.add(new THREE.Mesh(panel, paint));
    for (const axle of [-1.42, 1.53]) for (let n = 0; n < 7; n++) {
      const a = firstAngle + (Math.PI - 2 * firstAngle) * n / 7, b = firstAngle + (Math.PI - 2 * firstAngle) * (n + 1) / 7;
      const at = (angle: number, radius: number): Point => [side * .983, archY + Math.sin(angle) * radius, axle + Math.cos(angle) * radius];
      face(root, [at(a, archRadius), at(b, archRadius), at(b, archRadius + .033), at(a, archRadius + .033)], paintLight, [side, 0, 0]);
    }
    box(root, side * .922, 1.23, 1.41, .105, .28, 1.76, paint);
    box(root, side * .927, 1.40, 1.41, .12, .06, 1.80, paintLight);
    box(root, side * .875, 1.15, 2.295, .19, .26, .035, tail);
  }
  box(root, 0, .98, 1.4, 1.70, .055, 1.79, bed);
  box(root, 0, 1.18, 2.26, 1.86, .49, .13, paint);
  box(root, 0, 1.24, 2.34, .34, .04, .028, trim);
  box(root, 0, .71, -2.3, 2.05, .18, .16, trim); box(root, 0, .73, 2.34, 2.03, .14, .18, trim);
  box(root, 0, 1.045, -2.241, 1.10, .23, .03, rubber);
  for (let i = -2; i <= 2; i++) box(root, i * .205, 1.045, -2.265, .026, .22, .027, trim);
  for (const x of [-.74, .74]) box(root, x, 1.08, -2.255, .32, .22, .038, light);
  for (const x of [-.99, .99]) for (const z of [-1.42, 1.53]) {
    const wheelHeight = Math.max(groundAt(x - .135, z), groundAt(x + .135, z)) + .45 - .008; wheelHeights.push(wheelHeight);
    const wheel = new THREE.Group(); wheel.position.set(x, wheelHeight, z); root.add(wheel); wheels.add(wheel);
    const profile = [[-.135, .245], [-.135, .36], [-.075, .45], [.075, .45], [.135, .36], [.135, .245]];
    const positions: number[] = [], indices: number[] = [], segments = 12;
    for (const [offset, radius] of profile) for (let n = 0; n < segments; n++) {
      const angle = n * Math.PI * 2 / segments; positions.push(offset, Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    for (let ring = 0; ring < profile.length; ring++) for (let n = 0; n < segments; n++) {
      const a = ring * segments + n, b = ring * segments + (n + 1) % segments;
      const c = (ring + 1) % profile.length * segments + n, d = (ring + 1) % profile.length * segments + (n + 1) % segments;
      indices.push(a, b, c, b, d, c);
    }
    const tire = new THREE.BufferGeometry(); tire.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); tire.setIndex(indices); tire.computeVertexNormals();
    wheel.add(new THREE.Mesh(tire, rubber));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.232, .232, .25, 10), trim); hub.rotation.z = Math.PI / 2; wheel.add(hub);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, .276, 8), bed); cap.rotation.z = Math.PI / 2; wheel.add(cap);
    const side = Math.sign(x);
    for (let n = 0; n < 5; n++) {
      const angle = n * Math.PI * 2 / 5;
      const at = (a: number, r: number): Point => [side * .127, Math.cos(a) * r, Math.sin(a) * r];
      face(wheel, [at(angle - .12, .12), at(angle + .12, .12), at(angle + .12, .192), at(angle - .12, .192)], bed, [side, 0, 0]);
    }
  }
  // Keep the existing hunting gear restrained and below the bed rail.
  box(root, -.43, 1.16, 1.18, .55, .36, .65, material(0x9f9c77));
  box(root, -.43, 1.37, 1.18, .59, .055, .68, material(0xcdc5a7));
  box(root, .34, 1.07, 1.65, .70, .15, .56, material(0x876c4c));
  const bodyLift = wheelHeights.reduce((sum, height) => sum + height - .49, 0) / wheelHeights.length;
  for (const child of root.children) if (!wheels.has(child)) child.position.y += bodyLift;
  root.traverse(object => {
    if (object instanceof THREE.Mesh && !object.geometry.hasAttribute('uv')) {
      object.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(object.geometry.getAttribute('position').count * 2), 2));
    }
  });
  return consolidate(root);
}

export interface QuailGateOptions {
  closed?: boolean;
  /** Heights relative to this gate's origin, sampled in its unrotated local XZ. */
  groundAt?: (x: number, z: number) => number;
}

export function createQuailGate(west: boolean, options: QuailGateOptions = {}): THREE.Group {
  const { closed = false, groundAt = () => 0 } = options;
  const root = new THREE.Group(); root.name = closed ? 'Closed property service gate' : 'Open field gate'; if (west) root.rotation.y = Math.PI / 2;
  const wood = material(0x7c7058); const endgrain = material(0x9b8c6c); const steel = material(0x777d70, 0.25, 0.72);
  wood.name = 'Quail gate timber'; steel.name = 'Quail gate steel';
  const { wingHalfWidth, hingeHalfWidth, leafLength, openAngle } = QUAIL_GATE;
  for (const x of closed ? [-hingeHalfWidth, hingeHalfWidth] : [-wingHalfWidth, -hingeHalfWidth, hingeHalfWidth, wingHalfWidth]) {
    const base = groundAt(x, 0);
    box(root, x, base + 0.77, 0, 0.18, 1.68, 0.18, wood); box(root, x, base + 1.62, 0, 0.2, 0.06, 0.2, endgrain);
  }
  if (!closed) for (const side of [-1, 1]) for (const y of [0.59, 1.05, 1.42]) {
    const a = new THREE.Vector3(side * hingeHalfWidth, groundAt(side * hingeHalfWidth, 0) + y, 0);
    const b = new THREE.Vector3(side * wingHalfWidth, groundAt(side * wingHalfWidth, 0) + y, 0);
    const rail = box(root, (a.x + b.x) / 2, (a.y + b.y) / 2, 0, a.distanceTo(b), .085, .085, wood);
    rail.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
  }
  // Gates open toward the outside shoulders, preserving a genuinely passable four-meter entrance.
  const hingeHeight = (groundAt(-hingeHalfWidth, 0) + groundAt(hingeHalfWidth, 0)) / 2;
  for (const side of [-1, 1]) {
    const gate = new THREE.Group(); gate.position.set(side * hingeHalfWidth, hingeHeight, 0);
    gate.rotation.y = closed ? 0 : side * (west ? -1 : 1) * openAngle; root.add(gate);
    for (const height of [0.43, 0.75, 1.07, 1.38]) box(gate, -side * leafLength / 2, height, 0, leafLength, 0.045, 0.045, steel);
    for (const x of [0, -side * leafLength]) box(gate, x, 0.91, 0, 0.055, 1.0, 0.055, steel);
    rod(gate, new THREE.Vector3(0, 0.43, 0), new THREE.Vector3(-side * leafLength, 1.38, 0), 0.023, steel);
  }
  return consolidate(root);
}

/** Ground samples are local offsets from the landmark's world-space origin. */
export function createQuailWindmill(groundAt: (x: number, z: number) => number = () => 0): THREE.Group {
  const root = new THREE.Group(); root.name = 'Old Windmill';
  const steel = material(0x8f9388, 0.45, 0.6); const dark = material(0x626b61, 0.3); const rust = material(0x947459, 0.2);
  const concrete = material(0x929286); concrete.name = 'Quail windmill footings';
  const gravel = material(0x938b70); gravel.name = 'Quail stock tank gravel';
  // Level tops support the equipment; lower vertices enter the unchanged
  // heightfield. A shallow skirt prevents daylight beneath the downhill edge.
  const footing = (cx: number, cz: number, outline: readonly [number, number][], top: number, mat: THREE.Material) => {
    const positions = [cx, top, cz, cx, groundAt(cx, cz) - 0.06, cz]; const indices: number[] = [];
    for (const [x, z] of outline) positions.push(cx + x, top, cz + z, cx + x, groundAt(cx + x, cz + z) - 0.06, cz + z);
    for (let i = 0; i < outline.length; i++) {
      const a = 2 + i * 2; const b = 2 + (i + 1) % outline.length * 2;
      indices.push(0, a, b, 1, b + 1, a + 1, a, a + 1, b, b, a + 1, b + 1);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); root.add(new THREE.Mesh(geometry, mat));
  };
  const square: readonly [number, number][] = [[-.22, -.22], [-.22, .22], [.22, .22], [.22, -.22]];
  const feet = [-1, 1].flatMap((x) => [-1, 1].map((z): [number, number] => [x * 1.15, z * 1.15]));
  const towerBase = Math.max(...feet.flatMap(([x, z]) => square.map(([dx, dz]) => groundAt(x + dx, z + dz)))) + 0.035;
  const heights = [0, 1.9, 3.8, 5.7, 7.6, 9];
  const width = (height: number) => 1.15 - height / 9 * 0.88;
  for (const x of [-1, 1]) for (const z of [-1, 1]) rod(root, new THREE.Vector3(x * width(0), 0, z * width(0)), new THREE.Vector3(x * width(9), 9, z * width(9)), 0.055, steel, 0.038);
  for (let level = 1; level < heights.length; level++) {
    const a = heights[level - 1]; const b = heights[level];
    for (const side of [-1, 1]) {
      rod(root, new THREE.Vector3(-width(a), a, side * width(a)), new THREE.Vector3(width(b), b, side * width(b)), 0.018, dark);
      rod(root, new THREE.Vector3(width(a), a, side * width(a)), new THREE.Vector3(-width(b), b, side * width(b)), 0.018, dark);
      rod(root, new THREE.Vector3(side * width(a), a, -width(a)), new THREE.Vector3(side * width(b), b, width(b)), 0.018, dark);
      rod(root, new THREE.Vector3(side * width(a), a, width(a)), new THREE.Vector3(side * width(b), b, -width(b)), 0.018, dark);
    }
  }
  for (let n = 0; n < 23; n++) box(root, 0, n * 0.37 + 0.3, -width(n * 0.37) - 0.025, 0.36, 0.025, 0.06, dark);
  for (const side of [-1, 1]) rod(root,
    new THREE.Vector3(side * .18, .16, -width(-.14) - .025),
    new THREE.Vector3(side * .18, 8.58, -width(8.28) - .025), .019, dark);
  box(root, 0, 9, 0, 0.46, 0.26, 0.74, dark);
  const rotor = new THREE.Group(); rotor.name = 'Quail wind rotor'; rotor.position.set(0, 9.25, -0.45); root.add(rotor);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 12), steel); hub.rotation.x = Math.PI / 2; rotor.add(hub);
  for (let i = 0; i < 16; i++) {
    const angle = i / 16 * Math.PI * 2; const arm = new THREE.Group(); arm.rotation.z = angle; rotor.add(arm);
    box(arm, 0, 0.96, 0, 0.025, 1.66, 0.025, dark);
    const blade = box(arm, 0.11, 1.48, 0, 0.4, 0.68, 0.026, i % 5 === 0 ? rust : steel); blade.rotation.y = 0.33;
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.82, 0.026, 4, 32), steel); rotor.add(rim);
  rod(root, new THREE.Vector3(0, 9.17, 0.1), new THREE.Vector3(0, 9.17, 2.75), 0.036, dark);
  box(root, 0, 9.4, 2.52, 0.048, 0.65, 1.18, steel);
  // Raise the complete upright assembly, including its separate rotor, onto
  // four supported feet. Their horizontal positions and the route stay fixed.
  for (const child of root.children) child.position.y += towerBase;
  for (const [x, z] of feet) footing(x, z, square, towerBase, concrete);
  // Seat the tank independently: using the tower's ground height left up to
  // seven centimetres of daylight beneath its downhill bottom ring.
  const ring: [number, number][] = Array.from({ length: 18 }, (_, i) => [Math.sin(i / 18 * Math.PI * 2) * 1.42, Math.cos(i / 18 * Math.PI * 2) * 1.42]);
  const tankBase = Math.max(groundAt(3.35, .35), ...ring.map(([x, z]) => groundAt(3.35 + x, .35 + z))) + 0.025;
  footing(3.35, .35, ring, tankBase, gravel);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.2, 0.62, 18, 1, true), steel); tank.position.set(3.35, tankBase + 0.31, 0.35); tank.castShadow = true; root.add(tank);
  const waterMaterial = material(0x607d7d, 0.12, 0.32); waterMaterial.name = 'Quail stock tank water';
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.22, 18), waterMaterial); water.rotation.x = -Math.PI / 2; water.position.set(3.35, tankBase + 0.52, 0.35); root.add(water);
  return consolidate(root);
}
