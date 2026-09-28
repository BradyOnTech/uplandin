import * as THREE from 'three';

type Point = [number, number, number];

// Cornell Lab: https://www.allaboutbirds.org/guide/Chukar/id
// Audubon: https://www.audubon.org/field-guide/bird/chukar
// The cream face inside a black necklace and barred flanks carry identity;
// red is confined to the bill, eye ring and tucked feet.
// Broad slate feather masses distinguish a flying chukar from the warm
// ground. Keep buff on the belly and face; tiny flank bars cannot carry the
// silhouette once the bird is only a handful of pixels across.
const BACK = 0x7c8994, BREAST = 0xbec6c5, BELLY = 0xc4af82;
const FACE = 0xe3dbc1, NECKLACE = 0x343936, BAR = 0x4c4538, FLANK = 0xded6ba;
const RED = 0xa55040, PRIMARY = 0x46515b, UNDERWING = 0xd6dbd3, TAIL = 0x997559;

class BirdMesh {
  readonly positions: number[] = [];
  private colors: number[] = [];
  private tint = new THREE.Color();

  face(points: Point[], color: number, outward: Point): void {
    const normal = new THREE.Vector3().subVectors(new THREE.Vector3(...points[1]), new THREE.Vector3(...points[0]))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...points[2]), new THREE.Vector3(...points[0])));
    const reverse = normal.dot(new THREE.Vector3(...outward)) < 0;
    this.tint.setHex(color);
    for (let i = 1; i < points.length - 1; i++) for (const p of [points[0], points[reverse ? i + 1 : i], points[reverse ? i : i + 1]]) {
      this.positions.push(...p); this.colors.push(this.tint.r, this.tint.g, this.tint.b);
    }
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.species = 'chukar';
    return geometry;
  }
}

/** +Z is forward; the origin remains the shared carry grip. The shoulder
 * stays at (+/- .0348, .01792, .02856), as in the existing flight envelope. */
export function buildChukarBody(): THREE.BufferGeometry {
  const mesh = new BirdMesh();
  const sections = [
    { z: -.095, y: .008, w: .014, h: .015 },
    { z: -.069, y: .006, w: .033, h: .029 },
    { z: -.036, y: .002, w: .044, h: .040 },
    { z: .000, y: .001, w: .047, h: .045 },
    { z: .032, y: .009, w: .041, h: .039 },
    { z: .054, y: .025, w: .029, h: .030 },
    { z: .074, y: .038, w: .023, h: .026 },
    { z: .095, y: .042, w: .024, h: .026 },
    { z: .114, y: .040, w: .018, h: .021 },
    { z: .124, y: .036, w: .007, h: .011 },
  ];
  const rings = sections.map(s => Array.from({ length: 10 }, (_, i): Point => {
    const angle = Math.PI / 2 + i * Math.PI / 5;
    return [Math.cos(angle) * s.w, s.y + Math.sin(angle) * s.h, s.z];
  }));
  for (let row = 0; row < rings.length - 1; row++) for (let side = 0; side < 10; side++) {
    const next = (side + 1) % 10, angle = Math.PI / 2 + (side + .5) * Math.PI / 5;
    const lower = Math.sin(angle) < -.58, flank = Math.abs(Math.cos(angle)) > .7;
    const color = row >= 5 ? (Math.sin(angle) < .4 ? FACE : BREAST)
      : lower ? BELLY : row >= 3 ? BREAST : flank ? FLANK : BACK;
    mesh.face([rings[row][side], rings[row][next], rings[row + 1][next], rings[row + 1][side]], color,
      [Math.cos(angle), Math.sin(angle), 0]);
  }
  for (let side = 0; side < 10; side++) {
    const next = (side + 1) % 10;
    mesh.face([[0, .008, -.104], rings[0][side], rings[0][next]], BACK, [0, 0, -1]);
    mesh.face([rings.at(-1)![side], rings.at(-1)![next], [0, .035, .129]], BREAST, [0, 0, 1]);
  }

  // Project colored feather groups onto the actual triangulated loft, so
  // patches follow its facets rather than floating above an ideal ellipsoid.
  const shell = mesh.positions.slice();
  type SurfacePoint = [number, number]; // y, z
  const patch = (side: number, polygon: SurfacePoint[], color: number, lift = .00018) => {
    for (let i = 0; i < shell.length; i += 9) {
      if (Math.max(shell[i], shell[i + 3], shell[i + 6]) < 1e-8) continue;
      const triangle: SurfacePoint[] = [[shell[i + 1], shell[i + 2]], [shell[i + 4], shell[i + 5]], [shell[i + 7], shell[i + 8]]];
      const [a, b, c] = triangle;
      const determinant = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(determinant) < 1e-12) continue;
      let clipped = polygon;
      // Clip each marking to the shell triangles before projecting. A long
      // stripe joining only projected endpoints would cut through the breast.
      for (let edge = 0; edge < 3 && clipped.length; edge++) {
        const start = triangle[edge], end = triangle[(edge + 1) % 3];
        const distance = (p: SurfacePoint) => Math.sign(determinant)
          * ((end[0] - start[0]) * (p[1] - start[1]) - (end[1] - start[1]) * (p[0] - start[0]));
        const input = clipped; clipped = [];
        for (let j = 0; j < input.length; j++) {
          const p = input[j], q = input[(j + 1) % input.length], dp = distance(p), dq = distance(q);
          if (dp >= 0) clipped.push(p);
          if ((dp >= 0) !== (dq >= 0)) {
            const t = dp / (dp - dq);
            clipped.push([THREE.MathUtils.lerp(p[0], q[0], t), THREE.MathUtils.lerp(p[1], q[1], t)]);
          }
        }
      }
      if (clipped.length < 3) continue;
      const points = clipped.map(([y, z]): Point => {
        const u = ((b[1] - c[1]) * (y - c[0]) + (c[0] - b[0]) * (z - c[1])) / determinant;
        const v = ((c[1] - a[1]) * (y - c[0]) + (a[0] - c[0]) * (z - c[1])) / determinant;
        return [side * (u * shell[i] + v * shell[i + 3] + (1 - u - v) * shell[i + 6] + lift), y, z];
      });
      mesh.face(points, color, [side, 0, 0]);
    }
  };

  for (const side of [-1, 1]) {
    // Six curved, broad flank bars. Pale intervals remain quiet at distance;
    // the upper ends disappear naturally under the folded wing.
    for (let feather = 0; feather < 6; feather++) {
      const z = .018 - feather * .014;
      const rows = [
        { y: .024 - feather * .0012, z: z - .005, half: .0026 },
        { y: .007, z: z, half: .0034 },
        { y: -.010, z: z + .004, half: .0030 },
        { y: -.024 + feather * .0012, z: z + .005, half: .0009 },
      ];
      for (let row = 0; row < rows.length - 1; row++) {
        const a = rows[row], b = rows[row + 1];
        patch(side, [[a.y, a.z - a.half], [a.y, a.z + a.half],
          [b.y, b.z + b.half], [b.y, b.z - b.half]], BAR);
      }
    }

    // The necklace follows the eye line down behind the cheek and forward
    // under the throat, leaving a coherent cream face within it.
    const necklace = [
      { y: .046, z: .121 }, { y: .048, z: .104 }, { y: .048, z: .086 },
      { y: .040, z: .071 }, { y: .027, z: .063 }, { y: .017, z: .078 },
      { y: .020, z: .095 }, { y: .025, z: .112 },
    ];
    for (let i = 0; i < necklace.length - 1; i++) {
      const a = necklace[i], b = necklace[i + 1], dy = b.y - a.y, dz = b.z - a.z;
      const length = Math.hypot(dy, dz), width = .0022, ny = -dz / length * width, nz = dy / length * width;
      patch(side, [[a.y + ny, a.z + nz], [b.y + ny, b.z + nz],
        [b.y - ny, b.z - nz], [a.y - ny, a.z - nz]], NECKLACE);
    }
    // Small matte eye and a muted red ring; no oversized cartoon highlight.
    const eye = (radius: number, color: number, lift: number) => {
      const points = Array.from({ length: 8 }, (_, i): SurfacePoint => {
        const a = i * Math.PI / 4;
        return [.049 + Math.sin(a) * radius, .106 + Math.cos(a) * radius];
      });
      patch(side, points, color, lift);
    };
    eye(.0034, RED, .0004); eye(.0020, 0x262927, .00065);
    mesh.face([[side * .010, -.033, -.032], [side * .018, -.031, -.031],
      [side * .022, -.032, -.076], [side * .016, -.034, -.079]], RED, [0, -1, 0]);
  }

  // A short bill projects from the rounded face, rather than coloring the
  // whole head red. Top and lower planes meet at a shallow hooked tip.
  const billRoot: Point[] = [[-.006, .043, .122], [.006, .043, .122], [.007, .034, .123],
    [0, .030, .123], [-.007, .034, .123]];
  for (let i = 0; i < billRoot.length; i++) mesh.face([billRoot[i], billRoot[(i + 1) % billRoot.length], [0, .033, .143]],
    i < 2 ? RED : 0x874333, [billRoot[i][0], billRoot[i][1] - .036, .006]);

  // The square, chestnut-edged tail is short; central feathers do not make
  // the long sharp point that identifies the neighboring prairie grouse.
  for (let feather = -3; feather <= 3; feather++) {
    const outer = Math.abs(feather), rootX = feather * .0047, tipX = feather * .0074;
    const tipZ = -.141 + outer * .0013, width = .0052;
    const points: Point[] = [[rootX - width, .010, -.086], [rootX + width, .010, -.086],
      [tipX + width * .8, .001, tipZ + .003], [tipX, 0, tipZ], [tipX - width * .8, .001, tipZ + .003]];
    mesh.face(points, outer >= 2 ? TAIL : BACK, [0, 1, 0]);
    mesh.face(points.map(([x, y, z]) => [x, y - .0015, z] as Point), outer >= 2 ? TAIL : BELLY, [0, -1, 0]);
  }
  return mesh.build();
}

/** Rounded flight wing retains the previous .15872 m shoulder-to-tip
 * span. No new wingbeat or scale controller is introduced by this asset. */
export function buildChukarWing(side: -1 | 1): THREE.BufferGeometry {
  const mesh = new BirdMesh();
  const rows = [
    { x: 0, y: 0, front: .038, back: -.040 },
    { x: .044, y: .007, front: .041, back: -.056 },
    { x: .087, y: .006, front: .034, back: -.059 },
    { x: .122, y: .002, front: .024, back: -.047 },
    { x: .146, y: -.004, front: .011, back: -.030 },
    { x: .15872, y: -.009, front: -.004, back: -.013 },
  ];
  for (let row = 0; row < rows.length - 1; row++) for (let band = 0; band < 4; band++) {
    const a = rows[row], b = rows[row + 1], low = band / 4, high = (band + 1) / 4;
    const at = (r: typeof a, t: number, under: boolean): Point => [side * r.x,
      r.y + Math.sin(t * Math.PI) * .004 - (under ? .002 : 0), r.front + (r.back - r.front) * t];
    // Joined primaries and secondaries form a dark trailing mass. A patchwork
    // of alternating pale tips dissolved into sage at normal hunting ranges.
    const flightFeathers = row >= 3 || (row >= 1 && band >= 2);
    const color = flightFeathers ? PRIMARY : band === 0 ? BREAST : BACK;
    mesh.face([at(a, low, false), at(b, low, false), at(b, high, false), at(a, high, false)], color, [0, 1, 0]);
    mesh.face([at(a, low, true), at(b, low, true), at(b, high, true), at(a, high, true)],
      row >= 3 ? PRIMARY : UNDERWING, [0, -1, 0]);
  }
  for (let feather = 0; feather < 5; feather++) {
    const x = .044 + feather * .022, z = -.055 + Math.max(0, feather - 1) * .006;
    const points: Point[] = [[side * (x - .009), -.001, z + .016], [side * (x + .010), -.001, z + .016],
      [side * (x + .009), -.004, z - .002], [side * (x + .002), -.006, z - .005], [side * (x - .006), -.004, z - .002]];
    mesh.face(points, PRIMARY, [0, 1, 0]);
    mesh.face(points.map(([px, py, pz]) => [px, py - .0015, pz] as Point), UNDERWING, [0, -1, 0]);
  }
  return mesh.build();
}

/** Sweep folded wings aft against the flanks instead of standing vertically. */
export function poseChukarFoldedWings(left: THREE.Group, right: THREE.Group): void {
  left.rotation.set(.46, -1.40, .10, 'YXZ');
  right.rotation.set(.46, 1.40, -.10, 'YXZ');
}
