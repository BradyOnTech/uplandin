import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HuntArrivalPoint } from '../huntArrival';

export interface HuntingTruckAsset {
  root: THREE.Group;
  crateDoor: THREE.Group;
  tailgate: THREE.Group;
  readonly localSite: Readonly<Record<'crateFloor' | 'boxThreshold' | 'tailgateEdge' | 'landing', Readonly<HuntArrivalPoint>>>;
  setRelease(state: { crateDoor: number; tailgate: number }): void;
}

function consolidateTruck(root: THREE.Group, body: THREE.Material, rubber: THREE.Material, glass: THREE.Material): void {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), transform = new THREE.Matrix4();
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>(), originals = new Set<THREE.BufferGeometry>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = object.material as THREE.MeshStandardMaterial;
    const finish = source === rubber || source === glass ? source : body;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(transform.multiplyMatrices(inverse, object.matrixWorld));
    const count = geometry.getAttribute('position').count;
    if (!geometry.hasAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    const color = finish === body ? source.color : new THREE.Color(0xffffff), colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const geometries = groups.get(finish) ?? []; geometries.push(geometry); groups.set(finish, geometries);
    originals.add(object.geometry);
  });
  root.clear();
  for (const [finish, geometries] of groups) {
    const geometry = mergeGeometries(geometries)!;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, finish); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = finish === rubber ? 'Hunting pickup tyres' : finish === glass ? 'Hunting pickup glazing' : 'Hunting pickup metalwork';
    root.add(mesh);
    for (const part of geometries) part.dispose();
  }
  for (const geometry of originals) geometry.dispose();
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

/** One grounded field pickup shared by the four primary hunting properties.
 * Static surfaces are material-batched; only the crate door and tailgate move. */
export function createHuntingTruck(groundAt: (x: number, z: number) => number = () => 0): HuntingTruckAsset {
  const root = new THREE.Group(); root.name = 'Hunting pickup';
  const wheels = new Set<THREE.Object3D>(); const wheelHeights: number[] = [];
  const paint = material(0x59766c, 0.08, 0.86); const paintLight = material(0x91a092, 0.08, 0.84);
  const rubber = material(0x252b29); const trim = material(0x82877f, 0.25, 0.65);
  const glass = material(0x526873, 0.16, 0.38); const bed = material(0x3c4840); const light = material(0xd5c6a1, 0.15, 0.3); const tail = material(0xa45943, 0.15, 0.4);
  paint.name = 'Hunting pickup body'; glass.name = 'Hunting pickup glazing';
  const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, metalness: .10, flatShading: true });
  bodyMaterial.name = 'Hunting pickup painted surfaces';
  const tailgate = new THREE.Group(); tailgate.name = 'Hunting pickup tailgate';
  tailgate.position.set(0, .955, 2.265); root.add(tailgate);
  const crateDoor = new THREE.Group(); crateDoor.name = 'Hunting dog-box door';
  crateDoor.position.set(-.74, 1.02, 2.165); root.add(crateDoor);
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
  box(tailgate, 0, .225, 0, 1.86, .45, .11, paint);
  box(tailgate, 0, .455, 0, 1.9, .055, .14, paintLight);
  box(tailgate, 0, .285, .071, .34, .04, .028, trim);
  // Pressed inner ribs and a darker mat read as a sturdy launch platform
  // once lowered, instead of the back of a featureless body block.
  box(tailgate, 0, .225, -.060, 1.70, .33, .018, bed);
  for (const x of [-.59, -.30, 0, .30, .59]) box(tailgate, x, .225, -.074, .025, .32, .014, trim);
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
  // A proper ventilated transport box leaves a dark, readable interior.
  // Solid sides protect the dog, while the open-bar rear lets an eager face
  // and body remain visible before release. Its floor meets the bed mat.
  box(root, 0, 1.014, 1.34, 1.56, .055, 1.70, bed);
  box(root, 0, 1.52, .54, 1.56, 1.02, .055, paintLight);
  box(root, 0, 2.045, 1.34, 1.62, .065, 1.76, paintLight);
  for (const side of [-1, 1]) {
    box(root, side * .77, 1.52, 1.34, .055, 1.02, 1.63, paintLight);
    box(root, side * .804, 1.11, 1.35, .018, .035, 1.48, trim);
    for (const z of [.74, .98, 1.22, 1.46, 1.70, 1.94]) {
      box(root, side * .800, 1.81, z, .012, .16, .125, bed);
      box(root, side * .808, 1.905, z, .016, .025, .16, trim);
    }
    box(root, side * .745, 1.52, 2.158, .055, 1.06, .060, trim);
    // Small tie-down straps and catches attach the box to the bed rails.
    box(root, side * .825, 1.41, .74, .060, .045, .090, bed);
    box(root, side * .825, 1.41, 1.94, .060, .045, .090, bed);
  }
  box(root, 0, 2.037, 2.158, 1.51, .055, .060, trim);
  box(root, 0, 1.028, 2.158, 1.51, .040, .065, trim);
  for (const x of [.025, 1.455]) box(crateDoor, x, .505, 0, .04, 1.02, .045, trim);
  for (const y of [.025, .985]) box(crateDoor, .74, y, 0, 1.46, .04, .045, trim);
  for (const x of [.20, .40, .60, .80, 1.0, 1.20]) box(crateDoor, x, .505, 0, .022, .94, .025, bed);
  box(crateDoor, .74, .505, 0, 1.43, .022, .025, bed);
  box(crateDoor, 1.36, .51, .041, .11, .115, .034, bed);
  box(crateDoor, 1.36, .51, .067, .055, .065, .024, trim);
  for (const y of [.22, .79]) box(root, -.776, 1.02 + y, 2.174, .060, .105, .085, trim);
  const bodyLift = wheelHeights.reduce((sum, height) => sum + height - .49, 0) / wheelHeights.length;
  for (const child of root.children) if (!wheels.has(child)) child.position.y += bodyLift;
  // Consolidation keeps just five draws: body, glazing, tyres, door, gate.
  // Temporary construction materials are discarded after vertex-color baking.
  const constructionMaterials = new Set<THREE.Material>();
  root.traverse(object => { if (object instanceof THREE.Mesh) constructionMaterials.add(object.material as THREE.Material); });
  root.remove(crateDoor, tailgate);
  consolidateTruck(root, bodyMaterial, rubber, glass);
  consolidateTruck(crateDoor, bodyMaterial, rubber, glass);
  consolidateTruck(tailgate, bodyMaterial, rubber, glass);
  root.add(crateDoor, tailgate);
  for (const mat of constructionMaterials) if (mat !== rubber && mat !== glass) mat.dispose();
  root.traverse(object => { if (object instanceof THREE.Mesh) object.userData.huntingTruck = true; });
  const floor = 1.044 + bodyLift;
  const localSite = Object.freeze({
    crateFloor: Object.freeze({ x: 0, y: floor, z: 1.25 }),
    boxThreshold: Object.freeze({ x: 0, y: floor, z: 2.15 }),
    tailgateEdge: Object.freeze({ x: 0, y: .955 + .074 + bodyLift, z: 2.63 }),
    landing: Object.freeze({ x: 0, y: groundAt(0, 3.95), z: 3.95 }),
  });
  return { root, crateDoor, tailgate, localSite, setRelease({ crateDoor: door, tailgate: gate }) {
    crateDoor.rotation.y = -Math.max(0, Math.min(1, door)) * 1.86;
    tailgate.rotation.x = Math.max(0, Math.min(1, gate)) * Math.PI / 2;
    root.updateMatrixWorld(true);
  } };
}
