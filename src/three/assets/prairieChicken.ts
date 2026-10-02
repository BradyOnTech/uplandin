import * as THREE from 'three';
import { BirdMesh, birdPatcher, birdRings, birdSectionAt, facetAngle, type BirdPoint, type BirdSection } from './birdLoft';

// Greater Prairie-Chicken reference: Cornell Lab,
// https://www.allaboutbirds.org/guide/Greater_Prairie-Chicken/id
// A stocky grouse barred brown and buff all over, underparts included, with
// a short, rounded, dark tail. That dark square end and the even barring
// separate it from the sharptail's pale belly and long pointed tail when the
// two get up together. Long dark pinnae lie along the neck; a small orange
// comb sits over the eye. The bars are fine: painted narrow over a buff
// ground, so close up they read as barring and at range they blend to the
// bird's warm brown instead of banding it like a bee.
const BACK = 0x7a5e40, BACK_DIM = 0x6a5037, BACK_LIGHT = 0x88704f, FLANK = 0xc4a676, BELLY = 0xd2bd93;
const BELLY_BAR = 0xb59a70, BAR = 0x5d4531, DARK = 0x3f3022, BUFF = 0xc8a677, PALE = 0xdcc8a0, CROWN = 0x4f3c2a;
const TAIL = 0x2f2924, PRIMARY = 0x6d5f4c, SPOT = 0xc2ad86, UNDERWING = 0xd9d3c2, COMB = 0xd48a2c, PINNAE = 0x33271c;

const SIDES = 10;
/** The sharptail's presentation envelope, sectioned finer through the
 * body so the painted bars follow a rounder flank. */
const SECTIONS: readonly BirdSection[] = [
  { z: -.107, y: .009, w: .019, h: .019 },
  { z: -.089, y: .006, w: .030, h: .027 },
  { z: -.071, y: .003, w: .040, h: .034 },
  { z: -.048, y: .001, w: .045, h: .039 },
  { z: -.025, y: .000, w: .048, h: .042 },
  { z: .000, y: .002, w: .048, h: .044 },
  { z: .025, y: .004, w: .046, h: .044 },
  { z: .045, y: .011, w: .040, h: .039 },
  { z: .065, y: .018, w: .033, h: .033 },
  { z: .087, y: .032, w: .022, h: .022 },
  { z: .100, y: .034, w: .022, h: .023 },
  { z: .113, y: .035, w: .022, h: .023 },
  { z: .130, y: .031, w: .013, h: .014 },
];

function facetColor(row: number, side: number, z: number): number {
  const angle = facetAngle(side, SIDES), up = Math.sin(angle);
  if (z > .085) {
    // Dark crown, buff face cut by a dark line through the eye, pale throat.
    if (up > .6) return CROWN;
    if (up > .05) return z > .095 && z < .12 ? DARK : BUFF;
    return PALE;
  }
  // A brown back, mottled only in tone; buff flanks for the painted bars;
  // the belly barred softly by rows where no side view reaches.
  if (up > .8) return row % 2 ? BACK : BACK_DIM;
  if (up > .45) return row % 2 ? BACK_LIGHT : BACK;
  if (up < -.75) return row % 2 ? BELLY_BAR : BELLY;
  return FLANK;
}

export function buildPrairieChickenBody(): THREE.BufferGeometry {
  const mesh = new BirdMesh(), rings = birdRings(SECTIONS, SIDES);
  for (let row = 0; row < rings.length - 1; row++) for (let side = 0; side < SIDES; side++) {
    const next = (side + 1) % SIDES, angle = facetAngle(side, SIDES);
    const z = (SECTIONS[row].z + SECTIONS[row + 1].z) / 2;
    mesh.face([rings[row][side], rings[row][next], rings[row + 1][next], rings[row + 1][side]], facetColor(row, side, z),
      [Math.cos(angle), Math.sin(angle), 0]);
  }
  for (let side = 0; side < SIDES; side++) {
    const next = (side + 1) % SIDES;
    mesh.face([[0, .01, -.116], rings[0][side], rings[0][next]], BACK, [0, 0, -1]);
    mesh.face([rings.at(-1)![side], rings.at(-1)![next], [0, .026, .144]], 0x575344, [0, 0, 1]);
  }

  const patch = birdPatcher(mesh);
  for (const side of [-1, 1]) {
    // Small dark eye with the orange comb over it.
    patch(side, Array.from({ length: 8 }, (_, i): [number, number] => {
      const a = i * Math.PI / 4;
      return [.040 + Math.sin(a) * .0024, .114 + Math.cos(a) * .0024];
    }), 0x262421, .0005);
    patch(side, [[.0445, .109], [.0465, .113], [.0458, .119], [.0440, .116]], COMB, .0004);
    // Pinnae: the long dark neck tufts, lying back along each side of the neck.
    patch(side, [[.033, .095], [.027, .097], [.017, .070], [.022, .066]], PINNAE, .0006);
    // Fine dark bars across the buff flanks, breast to vent, leaning forward
    // at the foot as the feather tracts do.
    // Lengths, lean and width wander a little so the flank reads as
    // feathers rather than a grille.
    for (let bar = 0; bar < 9; bar++) {
      const step = (bar * 5 + (side > 0 ? 2 : 0)) % 3, z = .056 - bar * .0145 + (step - 1) * .0012;
      const section = birdSectionAt(SECTIONS, z), half = .0018 + step * .0004;
      const top = section.y + section.h * (.38 + step * .07), foot = section.y - section.h * (.80 - ((bar * 2) % 3) * .08);
      const lean = .003 + ((bar + 1) % 3) * .0012;
      patch(side, [[top, z - half], [top, z + half], [foot, z + lean + half], [foot, z + lean - half]], BAR);
    }
    // Feathered legs tucked under the belly.
    mesh.face([[side * .013, -.029, -.042], [side * .021, -.028, -.043], [side * .023, -.030, -.088], [side * .016, -.032, -.090]],
      BUFF, [0, -1, 0]);
  }

  // Short, rounded, dark tail: barely past the coverts, square at the end.
  for (let feather = -3; feather <= 3; feather++) {
    const outer = Math.abs(feather), rootX = feather * .0058, tipX = feather * .0083;
    const tipZ = -.137 + outer * .0026, width = .0072;
    const points: BirdPoint[] = [[rootX - width, .010, -.090], [rootX + width, .010, -.090],
      [tipX + width * .8, .001, tipZ + .004], [tipX, 0, tipZ], [tipX - width * .8, .001, tipZ + .004]];
    mesh.face(points, TAIL, [0, 1, 0]);
    mesh.face(points.map(([x, y, z]) => [x, y - .0015, z] as BirdPoint), outer >= 2 ? BUFF : TAIL, [0, -1, 0]);
  }
  return mesh.build('prairie-chicken');
}

/** The sharptail's broad rounded wing and span (.186 at the shared pivot):
 * barred coverts, grey-brown primaries spotted pale, a pale underwing. */
export function buildPrairieChickenWing(side: -1 | 1): THREE.BufferGeometry {
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
    const at = (r: typeof a, t: number, under: boolean): BirdPoint => [side * r.x,
      r.y + Math.sin(Math.PI * t) * .004 - (under ? .002 : 0), r.front + (r.back - r.front) * t];
    // Feather tracts run along the wing, so tones change across the chord,
    // never in a checker: pale-edged coverts, brown secondaries, grey-brown hand.
    const upper = row >= 3 ? (band === 0 ? BACK : PRIMARY) : band === 0 ? BACK_LIGHT : band === 3 ? BACK_DIM : BACK;
    mesh.face([at(a, low, false), at(b, low, false), at(b, high, false), at(a, high, false)], upper, [0, 1, 0]);
    mesh.face([at(a, low, true), at(b, low, true), at(b, high, true), at(a, high, true)], row >= 3 ? PRIMARY : UNDERWING, [0, -1, 0]);
  }
  for (let feather = 0; feather < 6; feather++) {
    const x = .055 + feather * .019, z = -.061 + Math.max(0, feather - 2) * .006;
    const points: BirdPoint[] = [[side * (x - .009), -.001, z + .018], [side * (x + .011), -.001, z + .018],
      [side * (x + .012), -.004, z - .006], [side * (x + .004), -.006, z - .011], [side * (x - .008), -.004, z - .005]];
    mesh.face(points, feather % 2 ? PRIMARY : SPOT, [0, 1, 0]);
    mesh.face(points.map(([px, py, pz]) => [px, py - .0015, pz] as BirdPoint), UNDERWING, [0, -1, 0]);
  }
  return mesh.build('prairie-chicken');
}

export function posePrairieChickenFoldedWings(left: THREE.Group, right: THREE.Group): void {
  left.rotation.set(.38, -1.40, .10, 'YXZ');
  right.rotation.set(.38, 1.40, -.10, 'YXZ');
}
