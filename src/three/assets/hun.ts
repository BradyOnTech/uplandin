import * as THREE from 'three';
import { BirdMesh, birdPatcher, birdRings, facetAngle, type BirdPoint, type BirdSection } from './birdLoft';

// Gray Partridge reference: Cornell Lab, https://www.allaboutbirds.org/guide/Gray_Partridge/id
// A rusty orange face over a fine grey breast, broad chestnut flank bars, a
// dark chestnut horseshoe on the pale belly and a brown, buff-streaked back.
// In the air the short tail flashes rufous at both corners: the read that
// tells a Hun from a chukar or a sharptail at shooting distance.
const FACE = 0xbf6a35, CROWN = 0x7d6c58, BREAST = 0x9c9d96, FLANK = 0xa9a79c, BELLY = 0xd8d0ba;
const HORSESHOE = 0x5f2f1e, BAR = 0x8c4a2b, BACK = 0x7b6750, RUMP = 0x84705a;
const PRIMARY = 0x6b5d4c, PRIMARY_BAR = 0xb8a17a, UNDERWING = 0xd6d2c6, TAIL = 0xa04a26, BILL = 0x8a8b85;
const SCAPULAR = 0x8e7759, SECONDARY = 0x6f5c46;

const SIDES = 12;
/** +Z is forward; the origin stays the shared carry grip. Rounder and a
 * little more compact than the chukar, with a short-billed round head. */
const SECTIONS: readonly BirdSection[] = [
  { z: -.092, y: .008, w: .014, h: .015 },
  { z: -.066, y: .005, w: .034, h: .030 },
  { z: -.034, y: .002, w: .046, h: .041 },
  { z: .000, y: .002, w: .049, h: .046 },
  { z: .030, y: .010, w: .043, h: .040 },
  { z: .052, y: .025, w: .030, h: .031 },
  { z: .070, y: .036, w: .023, h: .025 },
  { z: .088, y: .040, w: .023, h: .024 },
  { z: .105, y: .038, w: .017, h: .019 },
  { z: .115, y: .034, w: .007, h: .010 },
];

function facetColor(row: number, side: number, z: number): number {
  const angle = facetAngle(side, SIDES), up = Math.sin(angle);
  if (z > .07) return up > .55 ? CROWN : FACE;
  if (z > .045) return up > .45 ? CROWN : up < -.7 ? FACE : BREAST;
  // Buff-streaked scapulars either side of a plain brown mantle; a greyer rump.
  if (up > .42) return z < -.05 ? RUMP : up < .9 ? SCAPULAR : BACK;
  if (up < -.62) {
    // The horseshoe: a dark chestnut patch low on the breast and belly.
    return z > -.026 && z < .03 && Math.abs(Math.cos(angle)) < .45 ? HORSESHOE : BELLY;
  }
  return z > .015 ? BREAST : FLANK;
}

export function buildHunBody(): THREE.BufferGeometry {
  const mesh = new BirdMesh(), rings = birdRings(SECTIONS, SIDES);
  for (let row = 0; row < rings.length - 1; row++) for (let side = 0; side < SIDES; side++) {
    const next = (side + 1) % SIDES, angle = facetAngle(side, SIDES);
    const z = (SECTIONS[row].z + SECTIONS[row + 1].z) / 2;
    mesh.face([rings[row][side], rings[row][next], rings[row + 1][next], rings[row + 1][side]], facetColor(row, side, z),
      [Math.cos(angle), Math.sin(angle), 0]);
  }
  for (let side = 0; side < SIDES; side++) {
    const next = (side + 1) % SIDES;
    mesh.face([[0, .008, -.100], rings[0][side], rings[0][next]], RUMP, [0, 0, -1]);
    mesh.face([rings.at(-1)![side], rings.at(-1)![next], [0, .034, .121]], FACE, [0, 0, 1]);
  }

  const patch = birdPatcher(mesh);
  for (const side of [-1, 1]) {
    // Five broad chestnut flank bars, curving forward as they run down.
    for (let feather = 0; feather < 5; feather++) {
      const z = .006 - feather * .015;
      const rows = [
        { y: .024 - feather * .0014, z: z - .005, half: .0028 },
        { y: .008, z, half: .0036 },
        { y: -.009, z: z + .004, half: .0031 },
        { y: -.022 + feather * .0014, z: z + .006, half: .0011 },
      ];
      for (let row = 0; row < rows.length - 1; row++) {
        const a = rows[row], b = rows[row + 1];
        patch(side, [[a.y, a.z - a.half], [a.y, a.z + a.half], [b.y, b.z + b.half], [b.y, b.z - b.half]], BAR);
      }
    }
    // Small dark eye in the orange face.
    patch(side, Array.from({ length: 8 }, (_, i): [number, number] => {
      const a = i * Math.PI / 4;
      return [.044 + Math.sin(a) * .0022, .099 + Math.cos(a) * .0022];
    }), 0x262422, .0005);
    // Tucked legs trail under the belly.
    mesh.face([[side * .010, -.031, -.030], [side * .017, -.030, -.031], [side * .019, -.032, -.068], [side * .013, -.034, -.070]],
      0x8f8274, [0, -1, 0]);
  }

  // A short grey bill on the round head.
  const billRoot: BirdPoint[] = [[-.005, .040, .113], [.005, .040, .113], [.006, .032, .114], [0, .029, .114], [-.006, .032, .114]];
  for (let i = 0; i < billRoot.length; i++) mesh.face([billRoot[i], billRoot[(i + 1) % billRoot.length], [0, .033, .128]],
    BILL, [billRoot[i][0], billRoot[i][1] - .034, .006]);

  // Short, slightly rounded tail: brown centre, rufous corners.
  for (let feather = -3; feather <= 3; feather++) {
    const outer = Math.abs(feather), rootX = feather * .0046, tipX = feather * .0076;
    const tipZ = -.128 + outer * .0022, width = .0054;
    const points: BirdPoint[] = [[rootX - width, .010, -.082], [rootX + width, .010, -.082],
      [tipX + width * .8, .001, tipZ + .003], [tipX, 0, tipZ], [tipX - width * .8, .001, tipZ + .003]];
    mesh.face(points, outer >= 1 ? TAIL : RUMP, [0, 1, 0]);
    mesh.face(points.map(([x, y, z]) => [x, y - .0015, z] as BirdPoint), outer >= 1 ? TAIL : BELLY, [0, -1, 0]);
  }
  return mesh.build('hun');
}

/** Rounded partridge wing to the Hun's existing flight span (.15376 at the
 * shared pivot): streaked coverts and buff-barred brown primaries. */
export function buildHunWing(side: -1 | 1): THREE.BufferGeometry {
  const mesh = new BirdMesh();
  const span = .15376;
  const rows = [
    { x: 0, y: 0, front: .038, back: -.040 },
    { x: .277, y: .007, front: .041, back: -.056 },
    { x: .548, y: .006, front: .034, back: -.059 },
    { x: .769, y: .002, front: .024, back: -.047 },
    { x: .920, y: -.004, front: .011, back: -.030 },
    { x: 1, y: -.009, front: -.004, back: -.013 },
  ].map(r => ({ ...r, x: r.x * span }));
  for (let row = 0; row < rows.length - 1; row++) for (let band = 0; band < 4; band++) {
    const a = rows[row], b = rows[row + 1], low = band / 4, high = (band + 1) / 4;
    const at = (r: typeof a, t: number, under: boolean): BirdPoint => [side * r.x,
      r.y + Math.sin(t * Math.PI) * .004 - (under ? .002 : 0), r.front + (r.back - r.front) * t];
    // Tones change across the chord along the feather tracts, never in a
    // checker: streaked leading coverts, brown coverts, darker secondaries,
    // a plain brown hand. The barring lives on the separate feather tips.
    const color = row >= 3 ? (band === 0 ? BACK : PRIMARY) : band === 0 ? SCAPULAR : band === 3 ? SECONDARY : BACK;
    mesh.face([at(a, low, false), at(b, low, false), at(b, high, false), at(a, high, false)], color, [0, 1, 0]);
    mesh.face([at(a, low, true), at(b, low, true), at(b, high, true), at(a, high, true)], row >= 3 ? PRIMARY : UNDERWING, [0, -1, 0]);
  }
  for (let feather = 0; feather < 5; feather++) {
    const x = .044 * span / .15872 + feather * .021, z = -.055 + Math.max(0, feather - 1) * .006;
    const points: BirdPoint[] = [[side * (x - .009), -.001, z + .016], [side * (x + .010), -.001, z + .016],
      [side * (x + .009), -.004, z - .002], [side * (x + .002), -.006, z - .005], [side * (x - .006), -.004, z - .002]];
    mesh.face(points, feather % 2 ? PRIMARY_BAR : PRIMARY, [0, 1, 0]);
    mesh.face(points.map(([px, py, pz]) => [px, py - .0015, pz] as BirdPoint), UNDERWING, [0, -1, 0]);
  }
  return mesh.build('hun');
}

/** Sweep folded wings aft against the flanks. */
export function poseHunFoldedWings(left: THREE.Group, right: THREE.Group): void {
  left.rotation.set(.46, -1.40, .10, 'YXZ');
  right.rotation.set(.46, 1.40, -.10, 'YXZ');
}
