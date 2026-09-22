import * as THREE from 'three';

type Point = [number, number, number];

// Anatomy and plumage reference: Cornell Lab, Sharp-tailed Grouse ID.
// https://www.allaboutbirds.org/guide/Sharp-tailed_Grouse/id
// The pale belly/undertail and graduated central tail distinguish this bird
// from a bobwhite or a fan-tailed forest grouse at normal shooting distance.
const BACK = 0x9d8965, BUFF = 0xc4af83, DARK = 0x645743;
const BELLY = 0xe4dfca, UNDERWING = 0xc9c5ad, PRIMARY = 0x82755c;

class BirdMesh {
  private positions: number[] = [];
  private colors: number[] = [];
  private tint = new THREE.Color();

  face(points: Point[], color: number, outward: Point): void {
    const normal = new THREE.Vector3().subVectors(new THREE.Vector3(...points[1]), new THREE.Vector3(...points[0]))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...points[2]), new THREE.Vector3(...points[0])));
    const reverse = normal.dot(new THREE.Vector3(...outward)) < 0;
    this.tint.setHex(color);
    for (let i = 1; i < points.length - 1; i++) {
      for (const p of [points[0], points[reverse ? i + 1 : i], points[reverse ? i : i + 1]]) {
        this.positions.push(...p); this.colors.push(this.tint.r, this.tint.g, this.tint.b);
      }
    }
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  }
}

/** +Z is forward. Dimensions retain the existing Sharptail presentation
 * envelope; the finer anatomy does not enlarge a target or change its scale. */
export function buildSharptailBody(): THREE.BufferGeometry {
  const mesh = new BirdMesh();
  const sections = [
    { z: -.107, y: .009, w: .019, h: .019 },
    { z: -.071, y: .003, w: .040, h: .034 },
    { z: -.025, y: .000, w: .048, h: .042 },
    { z: .025, y: .004, w: .046, h: .044 },
    { z: .065, y: .018, w: .033, h: .033 },
    { z: .087, y: .032, w: .022, h: .022 },
    { z: .113, y: .035, w: .022, h: .023 },
    { z: .130, y: .031, w: .013, h: .014 },
  ];
  const rings = sections.map(section => Array.from({ length: 10 }, (_, index): Point => {
    const angle = Math.PI / 2 + index * Math.PI / 5;
    return [Math.cos(angle) * section.w, section.y + Math.sin(angle) * section.h, section.z];
  }));
  for (let row = 0; row < rings.length - 1; row++) for (let side = 0; side < 10; side++) {
    const next = (side + 1) % 10, angle = Math.PI / 2 + (side + .5) * Math.PI / 5;
    const lower = Math.sin(angle) < -.30;
    const head = row >= 5;
    // Broad feather groups rather than high-frequency speckling. The white
    // lower belly remains a coherent flash when the bird banks or climbs.
    const color = lower ? (head ? BUFF : BELLY)
      : head ? ((side === 2 || side === 7) ? DARK : BUFF)
        : (row + side) % 4 === 0 ? BUFF : (row * 2 + side) % 5 === 0 ? DARK : BACK;
    mesh.face([rings[row][side], rings[row][next], rings[row + 1][next], rings[row + 1][side]], color,
      [Math.cos(angle), Math.sin(angle), 0]);
  }
  for (let side = 0; side < 10; side++) {
    const next = (side + 1) % 10;
    mesh.face([[0, .01, -.116], rings[0][side], rings[0][next]], BACK, [0, 0, -1]);
    mesh.face([rings.at(-1)![side], rings.at(-1)![next], [0, .026, .144]], 0x575344, [0, 0, 1]);
  }
  // Small eyes are geometry in the same body batch, with no emissive/gloss.
  for (const side of [-1, 1]) {
    mesh.face([[side * .0219, .036, .115], [side * .0225, .041, .111], [side * .0225, .045, .115], [side * .0219, .040, .120]],
      0x262d28, [side, 0, 0]);
    // Tucked legs trail behind the belly instead of hanging below the wings.
    mesh.face([[side * .013, -.029, -.042], [side * .021, -.028, -.043], [side * .023, -.030, -.092], [side * .016, -.032, -.093]],
      DARK, [0, -1, 0]);
  }

  // Graduated tail: pale outer feathers stop short, the two central dark
  // feathers make one narrow point. It is neither a broad grouse fan nor a
  // pheasant streamer. Upper and lower faces have distinct plumage values.
  for (let feather = -3; feather <= 3; feather++) {
    const outer = Math.abs(feather), rootX = feather * .0061;
    const tipX = feather * .0095;
    const tipZ = -.176 + outer * .0134;
    const width = outer === 0 ? .006 : .0075;
    const points: Point[] = [[rootX - width, .010, -.090], [rootX + width, .010, -.090],
      [tipX + width * .63, .000, tipZ + .007], [tipX, -.002, tipZ], [tipX - width * .63, .000, tipZ + .007]];
    mesh.face(points, outer >= 2 ? 0xd8d5be : BACK, [0, 1, 0]);
    mesh.face(points.map(([x, y, z]) => [x, y - .0015, z] as Point), outer >= 1 ? BELLY : BUFF, [0, -1, 0]);
  }
  const geometry = mesh.build(); geometry.userData.species = 'sharptail';
  return geometry;
}

/** Broad rounded arm with graduated primaries and a folding outer hand.
 * Wing length matches the previous species envelope at the shared pivot. */
export function buildSharptailWing(side: -1 | 1): THREE.BufferGeometry {
  const mesh = new BirdMesh();
  const rows = [
    { x: 0, y: 0, front: .044, back: -.044 },
    { x: .055, y: .007, front: .046, back: -.061 },
    { x: .106, y: .006, front: .037, back: -.063 },
    { x: .147, y: .001, front: .022, back: -.052 },
    { x: .174, y: -.005, front: .006, back: -.033 },
    { x: .186, y: -.011, front: -.008, back: -.014 },
  ];
  for (let row = 0; row < rows.length - 1; row++) for (let band = 0; band < 4; band++) {
    const a = rows[row], b = rows[row + 1], low = band / 4, high = (band + 1) / 4;
    const at = (r: typeof a, t: number, under: boolean): Point => [side * r.x,
      r.y + Math.sin(Math.PI * t) * .004 - (under ? .002 : 0), r.front + (r.back - r.front) * t];
    const upper = row >= 3 ? (band % 2 ? PRIMARY : BACK) : band === 0 ? BUFF : (row + band) % 3 ? BACK : DARK;
    mesh.face([at(a, low, false), at(b, low, false), at(b, high, false), at(a, high, false)], upper, [0, 1, 0]);
    mesh.face([at(a, low, true), at(b, low, true), at(b, high, true), at(a, high, true)], row >= 3 ? PRIMARY : UNDERWING, [0, -1, 0]);
  }
  // Few distinct feather tips give the trailing silhouette a soft scallop
  // at shooting distance without splitting the wing into additional meshes.
  for (let feather = 0; feather < 6; feather++) {
    const x = .055 + feather * .019, z = -.061 + Math.max(0, feather - 2) * .006;
    const points: Point[] = [[side * (x - .009), -.001, z + .018], [side * (x + .011), -.001, z + .018],
      [side * (x + .012), -.004, z - .006], [side * (x + .004), -.006, z - .011], [side * (x - .008), -.004, z - .005]];
    mesh.face(points, feather % 2 ? PRIMARY : BACK, [0, 1, 0]);
    mesh.face(points.map(([px, py, pz]) => [px, py - .0015, pz] as Point), UNDERWING, [0, -1, 0]);
  }
  const geometry = mesh.build(), recovery = geometry.clone(), position = recovery.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const span = side * position.getX(i), wrist = Math.max(0, span - .078);
    const fold = .88 * THREE.MathUtils.smoothstep(span, .078, .16);
    position.setX(i, side * (span - wrist * (1 - Math.cos(fold))));
    position.setZ(i, position.getZ(i) - wrist * Math.sin(fold));
    position.setY(i, position.getY(i) + wrist * .12);
  }
  recovery.computeVertexNormals();
  geometry.morphAttributes.position = [position.clone()];
  geometry.morphAttributes.normal = [recovery.getAttribute('normal').clone()];
  geometry.morphAttributes.position[0].name = 'sharptail-recovery';
  geometry.userData.species = 'sharptail'; recovery.dispose(); geometry.computeBoundingSphere();
  return geometry;
}

export function poseSharptailFoldedWings(left: THREE.Group, right: THREE.Group): void {
  left.rotation.set(.38, -1.40, .10, 'YXZ');
  right.rotation.set(.38, 1.40, -.10, 'YXZ');
}
