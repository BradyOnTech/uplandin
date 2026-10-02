import * as THREE from 'three';

/**
 * Legs for the gamebirds that fly with them tucked out of sight. A bird
 * drops its legs when it is hit in the body (the tower and the sail), lets
 * them trail as it falls and stands on them to run as a cripple; they hang
 * on the jump and tuck within the first strokes. The ringneck has its own
 * (assets/pheasant.ts); every other species draws these.
 *
 * Model space as the bodies: +Z forward, +Y up, metres before the species'
 * scale. The geometry hangs straight down from the hips at the origin; the
 * presentation swings it aft about X to tuck it.
 */
export interface BirdLegSpec {
  /** Hip to foot. */
  length: number;
  /** Shank radius at the hip. */
  thickness: number;
  /** Front toe length. */
  toe: number;
  /** Hip spacing either side of the keel. */
  spread: number;
  /** Bare shank and toes. */
  color: number;
  /** Grouse wear feathers to the toes: the shank's colour and its thicker sleeve. */
  feathered?: number;
}

const QUAIL: BirdLegSpec = { length: .032, thickness: .0019, toe: .013, spread: .008, color: 0x8f877e };
const GROUSE: BirdLegSpec = { length: .04, thickness: .0026, toe: .015, spread: .012, color: 0x7f7666, feathered: 0xb9ab92 };

/** Per species: Bobwhite pinkish-grey, Chukar coral red, Hun grey, grouse feathered. */
export const BIRD_LEGS: Readonly<Record<string, BirdLegSpec>> = {
  bobwhite: { ...QUAIL, color: 0x9d8a7f },
  'california-quail': QUAIL,
  'gambels-quail': QUAIL,
  'scaled-quail': QUAIL,
  'mearns-quail': { ...QUAIL, color: 0x9a9089 },
  'mountain-quail': { ...QUAIL, length: .035 },
  chukar: { length: .038, thickness: .0024, toe: .016, spread: .011, color: 0xa55040 },
  hun: { length: .036, thickness: .0022, toe: .015, spread: .011, color: 0x8f8274 },
  sharptail: GROUSE,
  'prairie-chicken': { ...GROUSE, feathered: 0xc8a677 },
  'ruffed-grouse': { ...GROUSE, feathered: 0x8d7457 },
  'blue-grouse': { ...GROUSE, length: .044, feathered: 0x6f6a62 },
  woodcock: { length: .03, thickness: .0018, toe: .014, spread: .008, color: 0xa79486 },
};

/** The legs a species draws; unknown species take the quail's. */
export function birdLegSpec(speciesId: string): BirdLegSpec {
  return BIRD_LEGS[speciesId] ?? QUAIL;
}

function paint(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  const color = new THREE.Color(hex), colors = new Float32Array(flat.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flat.deleteAttribute('uv');
  return flat;
}

/** Both legs: shank, three forward toes and a hind toe, in one geometry. */
export function buildBirdLegs(speciesId: string): THREE.BufferGeometry {
  const spec = birdLegSpec(speciesId), parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * spec.spread;
    if (spec.feathered !== undefined) {
      // A feathered sleeve to the toes over a slimmer bare shank.
      parts.push(paint(new THREE.CylinderGeometry(spec.thickness * 1.5, spec.thickness * 1.15, spec.length * .82, 5)
        .translate(x, -spec.length * .41, 0), spec.feathered));
    }
    parts.push(paint(new THREE.CylinderGeometry(spec.thickness, spec.thickness * .8, spec.length, 5)
      .translate(x, -spec.length / 2, 0), spec.color));
    for (const yaw of [-.45, 0, .45]) {
      // Cylinder top becomes the tip once laid forward: taper it.
      parts.push(paint(new THREE.CylinderGeometry(spec.thickness * .4, spec.thickness * .55, spec.toe, 4)
        .rotateX(Math.PI / 2).translate(0, 0, spec.toe / 2).rotateY(yaw).translate(x, -spec.length, 0), spec.color));
    }
    parts.push(paint(new THREE.CylinderGeometry(spec.thickness * .45, spec.thickness * .35, spec.toe * .4, 4)
      .rotateX(Math.PI / 2).translate(x, -spec.length, -spec.toe * .2), spec.color));
  }
  const merged = new THREE.BufferGeometry();
  const count = parts.reduce((sum, part) => sum + part.getAttribute('position').count, 0);
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), color = new Float32Array(count * 3);
  let offset = 0;
  for (const part of parts) {
    const n = part.getAttribute('position').count;
    position.set(part.getAttribute('position').array as Float32Array, offset * 3);
    normal.set(part.getAttribute('normal').array as Float32Array, offset * 3);
    color.set(part.getAttribute('color').array as Float32Array, offset * 3);
    offset += n; part.dispose();
  }
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  merged.userData.species = speciesId;
  return merged;
}
