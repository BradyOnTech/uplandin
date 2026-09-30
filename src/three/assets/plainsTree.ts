import * as THREE from 'three';
import { mulberry32 } from '../../game/math';

/**
 * Faceted plains hardwoods for the pheasant farm. Each tree starts from its
 * crown: a few overlapping lobes set the species' silhouette, leaf clumps
 * fill them, and scaffold limbs grow from the trunk to carry every clump.
 * Late October thins the crowns, so limbs show through the gaps, which is
 * what separates a plains cottonwood from a lollipop or an acacia.
 *
 * Wood and foliage come back as separate geometries (unit height, base at
 * the origin) so they can be instanced with their own materials.
 */
export type PlainsTreeSpecies = 'cottonwood' | 'ash' | 'elm' | 'boxelder' | 'poplar';

interface SpeciesShape {
  /** Crown base and top as fractions of height. */
  base: number; top: number;
  /** Crown half-width as a fraction of height. */
  width: number;
  trunk: number; limbs: [number, number]; clumps: number; clump: number; drop: number;
  lean: number; bark: number; leaves: readonly number[];
}

const SPECIES: Record<PlainsTreeSpecies, SpeciesShape> = {
  // Massive, ragged and broad, with heavy limbs; gold in October.
  cottonwood: { base: .3, top: 1, width: .42, trunk: .034, limbs: [5, 6], clumps: 46, clump: .1, drop: .16, lean: .08,
    bark: 0x8a8173, leaves: [0xd7ac46, 0xc9973a, 0xe0c060, 0xa9a24e] },
  // Upright oval that drops early: thin crowns, bronze and yellow.
  ash: { base: .34, top: 1, width: .3, trunk: .026, limbs: [4, 5], clumps: 34, clump: .1, drop: .32, lean: .05,
    bark: 0x7c7466, leaves: [0xb88a4a, 0x9c7048, 0xc9a55a, 0x8f8a4c] },
  // Vase-shaped and arching, yellow-green.
  elm: { base: .36, top: 1, width: .38, trunk: .027, limbs: [4, 5], clumps: 38, clump: .1, drop: .2, lean: .06,
    bark: 0x746b5d, leaves: [0xb4a64e, 0x9aa052, 0xc8b45c, 0x87904a] },
  // Tall, narrow shelterbelt poplar: a columnar gold crown on a straight
  // leader, the northern prairie's landmark tree.
  poplar: { base: .22, top: 1, width: .17, trunk: .026, limbs: [4, 5], clumps: 30, clump: .075, drop: .2, lean: .04,
    bark: 0x8c877a, leaves: [0xcdb24e, 0xbca445, 0xa3a150, 0xdac56c] },
  // Short, crooked windbreak filler, still greenish and low-crowned.
  boxelder: { base: .3, top: 1, width: .44, trunk: .034, limbs: [3, 5], clumps: 30, clump: .13, drop: .12, lean: .14,
    bark: 0x7e7667, leaves: [0x8e9a4e, 0xa7a355, 0x7f8c48, 0xb59c4c] },
};

export interface PlainsTreeGeometry { wood: THREE.BufferGeometry; foliage: THREE.BufferGeometry; triangles: number }

export function buildPlainsTree(species: PlainsTreeSpecies, seed: number, detail: 'full' | 'distant' = 'full'): PlainsTreeGeometry {
  const shape = SPECIES[species], rng = mulberry32(seed);
  const distant = detail === 'distant';
  const wood: number[] = [], woodColor: number[] = [], leaves: number[] = [], leafColor: number[] = [];
  const bark = new THREE.Color(shape.bark), tone = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);

  const tri = (out: number[], colors: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) => {
    out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };
  const limb = (from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, sides: number) => {
    const axis = to.clone().sub(from).normalize();
    const side = Math.abs(axis.y) > .95 ? new THREE.Vector3(1, 0, 0) : up;
    const u = side.clone().cross(axis).normalize(), v = axis.clone().cross(u).normalize(), twist = rng() * Math.PI;
    const ring = (c: THREE.Vector3, r: number) => Array.from({ length: sides }, (_, i) => {
      const a = i / sides * Math.PI * 2 + twist;
      return c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
    });
    const lo = ring(from, r0), hi = ring(to, r1);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      tone.copy(bark).multiplyScalar(.8 + (i % 2) * .12 + rng() * .08);
      tri(wood, woodColor, lo[i], lo[j], hi[j], tone);
      tri(wood, woodColor, lo[i], hi[j], hi[i], tone);
    }
  };
  // A bent limb: two segments with a kink, so no limb is a straight rod.
  const bentLimb = (from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, sides: number, sag: number) => {
    const mid = from.clone().lerp(to, .5);
    mid.y += from.distanceTo(to) * sag;
    mid.x += (rng() - .5) * from.distanceTo(to) * .12; mid.z += (rng() - .5) * from.distanceTo(to) * .12;
    limb(from, mid, r0, (r0 + r1) / 2, sides);
    limb(mid, to, (r0 + r1) / 2, r1, sides);
  };

  const ico = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  const icoPos = ico.getAttribute('position') as THREE.BufferAttribute;
  const clump = (center: THREE.Vector3, radius: number, crownCenter: THREE.Vector3) => {
    const base = new THREE.Color(shape.leaves[Math.floor(rng() * shape.leaves.length)]).multiplyScalar(.9 + rng() * .16);
    // Clumps deep in the crown or on its shaded underside are darker.
    const outward = center.clone().sub(crownCenter);
    const exposure = THREE.MathUtils.clamp(.55 + outward.y * 1.6 + outward.length() * 1.1, .55, 1.08);
    const jitter = new Map<string, THREE.Vector3>();
    const vertex = (i: number) => {
      const p = new THREE.Vector3().fromBufferAttribute(icoPos, i);
      const key = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
      let j = jitter.get(key);
      if (!j) { j = new THREE.Vector3((rng() - .5) * .36, (rng() - .5) * .3, (rng() - .5) * .36); jitter.set(key, j); }
      return p.add(j).multiply(new THREE.Vector3(radius, radius * .82, radius)).add(center);
    };
    for (let i = 0; i < icoPos.count; i += 3) {
      const a = vertex(i), b = vertex(i + 1), c = vertex(i + 2);
      const ny = ((a.y + b.y + c.y) / 3 - center.y) / radius;
      tone.copy(base).multiplyScalar(exposure * THREE.MathUtils.lerp(.7, 1.08, THREE.MathUtils.smoothstep(ny, -.8, .7)));
      tri(leaves, leafColor, a, b, c, tone);
    }
  };

  // Trunk and leader, with a slight lean the whole crown follows.
  const lean = new THREE.Vector3((rng() - .5) * shape.lean, 0, (rng() - .5) * shape.lean);
  const crownBase = shape.base * (.9 + rng() * .2), crownTop = shape.top;
  const crownMid = (crownBase + crownTop) / 2, crownHalf = (crownTop - crownBase) / 2;
  const center = new THREE.Vector3(lean.x * crownMid, crownMid, lean.z * crownMid);
  const trunkTop = new THREE.Vector3(lean.x * crownBase, crownBase, lean.z * crownBase);
  const leaderTop = new THREE.Vector3(lean.x * (crownTop - .2), crownTop - .2, lean.z * (crownTop - .2));
  limb(new THREE.Vector3(0, -.03, 0), trunkTop, shape.trunk * 1.25, shape.trunk, 7);
  if (species !== 'boxelder') bentLimb(trunkTop, leaderTop, shape.trunk, shape.trunk * .35, 6, .03);

  // Two to three overlapping lobes make each silhouette irregular.
  const lobes = Array.from({ length: 2 + Math.floor(rng() * 2) }, (_, i) => {
    const a = rng() * Math.PI * 2, off = shape.width * (.18 + rng() * .22) * (i ? 1 : .3);
    return { c: new THREE.Vector3(center.x + Math.cos(a) * off, center.y + (rng() - .45) * crownHalf * .35, center.z + Math.sin(a) * off),
      rx: shape.width * (.7 + rng() * .3), ry: crownHalf * (.78 + rng() * .25), rz: shape.width * (.7 + rng() * .3) };
  });

  // Scaffold limbs spread evenly around the trunk, rising at stagger.
  const [minLimbs, maxLimbs] = shape.limbs;
  const limbCount = distant ? Math.max(3, minLimbs - 1) : minLimbs + Math.floor(rng() * (maxLimbs - minLimbs + 1));
  const around = rng() * Math.PI * 2;
  const scaffolds = Array.from({ length: limbCount }, (_, i) => {
    const azimuth = around + i / limbCount * Math.PI * 2 + (rng() - .5) * .6;
    const start = trunkTop.clone().lerp(leaderTop, Math.min(.85, i / limbCount * .7 + rng() * .15));
    const reach = shape.width * (.62 + rng() * .25);
    const end = new THREE.Vector3(center.x + Math.cos(azimuth) * reach, start.y + crownHalf * (.35 + rng() * .45), center.z + Math.sin(azimuth) * reach);
    bentLimb(start, end, shape.trunk * .62, shape.trunk * .22, distant ? 4 : 5, .08);
    return { azimuth, start, end };
  });

  // Core masses fill each lobe so the crown reads as one body with a
  // broken edge, not a cluster of separate balls.
  for (const l of lobes) for (let k = 0; k < (distant ? 1 : 2); k++) {
    const p = new THREE.Vector3(l.c.x + (rng() - .5) * l.rx * .5, l.c.y + (rng() - .3) * l.ry * .4, l.c.z + (rng() - .5) * l.rz * .5);
    clump(p, Math.min(l.rx, l.ry) * (.55 + rng() * .15), center);
  }
  const inLobe = (p: THREE.Vector3) => lobes.some(l => ((p.x - l.c.x) / l.rx) ** 2 + ((p.y - l.c.y) / l.ry) ** 2 + ((p.z - l.c.z) / l.rz) ** 2 <= 1);
  const count = distant ? Math.round(shape.clumps * .35) : shape.clumps;
  const size = shape.clump * (distant ? 1.55 : 1.12);
  let placed = 0, tries = 0;
  while (placed < count && tries++ < count * 20) {
    const l = lobes[Math.floor(rng() * lobes.length)];
    // Bias clumps to the crown's shell; the interior is shade and limbs.
    const d = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    if (d.lengthSq() > 1 || d.lengthSq() < .01) continue;
    d.normalize().multiplyScalar(.62 + rng() * .38);
    const p = new THREE.Vector3(l.c.x + d.x * l.rx, l.c.y + d.y * l.ry, l.c.z + d.z * l.rz);
    if (p.y < crownBase + size * .4 || !inLobe(p)) continue;
    placed++;
    if (rng() < shape.drop) continue;
    clump(p, size * (.75 + rng() * .55), center);
    // A twig from the nearest scaffold carries the clump, when visible.
    if (!distant && rng() < .55) {
      const azimuth = Math.atan2(p.z - center.z, p.x - center.x);
      const owner = scaffolds.reduce((best, s) => Math.abs(Math.atan2(Math.sin(s.azimuth - azimuth), Math.cos(s.azimuth - azimuth)))
        < Math.abs(Math.atan2(Math.sin(best.azimuth - azimuth), Math.cos(best.azimuth - azimuth))) ? s : best);
      const from = owner.start.clone().lerp(owner.end, .45 + rng() * .5);
      limb(from, p, shape.trunk * .2, shape.trunk * .08, 4);
    }
  }
  ico.dispose();

  const top = Math.max(.01, ...leaves.filter((_, i) => i % 3 === 1), ...wood.filter((_, i) => i % 3 === 1));
  const build = (positions: number[], colors: number[]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.map(p => p / top), 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  };
  return { wood: build(wood, woodColor), foliage: build(leaves, leafColor), triangles: (wood.length + leaves.length) / 9 };
}
