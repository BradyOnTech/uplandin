import * as THREE from 'three';

/**
 * Faceted low-poly dog sculpt kit.
 *
 * The faceted style is built from continuous, deliberately planed forms:
 * eight-sided anatomical sections (a keeled chest, a crested neck, a sloping
 * croup, muscled upper limbs, tapering cannons, domed feet) whose flat faces
 * describe muscle planes, rather than stacked rectangular blocks. Coat
 * markings are painted onto whole facets from a body-space pattern, so
 * patches and belton ticking follow the planes of the sculpt instead of
 * floating as decals above them.
 */

export type V3 = readonly [number, number, number];

/** A cross-section across the z axis (torso, neck, head, tail). */
export interface SectionZ {
  x?: number; y: number; z: number;
  /** Half-width at the widest point. */
  w: number;
  /** Height above and depth below the section centre. */
  top: number; bottom: number;
  /** Where the widest point sits between centre (0) and top (1); default 0.1. */
  bulge?: number;
  /** Width of the upper shoulder planes relative to w; default 0.74. */
  shoulder?: number;
  /** Width of the lower planes relative to w; default 0.7. */
  belly?: number;
}

/** A cross-section across the y axis (limbs), measured in the limb's own frame. */
export interface SectionY {
  x?: number; y: number; z: number;
  /** Half-width across the limb. */
  w: number;
  /** Depth ahead of and behind the limb axis. */
  front: number; back: number;
}

export interface PaintResult {
  color: THREE.Color; marking: boolean;
  /** Optional flush fleck (belton or ticking) laid on this facet. */
  fleck?: THREE.Color;
}
/** Coat colour for a facet whose centroid lies at a dog-space point. */
export type CoatPainter = (dogSpace: THREE.Vector3, facetNormal: THREE.Vector3, facetHash: number) => PaintResult;

const EIGHT = 8;

function ringZ(s: SectionZ): THREE.Vector3[] {
  const x = s.x ?? 0, bulge = s.bulge ?? .1, sh = s.shoulder ?? .74, be = s.belly ?? .7;
  const mid = s.y + (s.top - s.bottom) * .5 * bulge;
  // Counter-clockwise viewed from +z: top, then round through -x.
  return [
    new THREE.Vector3(x, s.y + s.top, s.z),
    new THREE.Vector3(x - s.w * sh, s.y + s.top * .66, s.z),
    new THREE.Vector3(x - s.w, mid, s.z),
    new THREE.Vector3(x - s.w * be, s.y - s.bottom * .62, s.z),
    new THREE.Vector3(x, s.y - s.bottom, s.z),
    new THREE.Vector3(x + s.w * be, s.y - s.bottom * .62, s.z),
    new THREE.Vector3(x + s.w, mid, s.z),
    new THREE.Vector3(x + s.w * sh, s.y + s.top * .66, s.z),
  ];
}

function ringY(s: SectionY): THREE.Vector3[] {
  const x = s.x ?? 0;
  return [
    new THREE.Vector3(x, s.y, s.z + s.front),
    new THREE.Vector3(x - s.w * .72, s.y, s.z + s.front * .7),
    new THREE.Vector3(x - s.w, s.y, s.z + (s.front - s.back) * .15),
    new THREE.Vector3(x - s.w * .7, s.y, s.z - s.back * .66),
    new THREE.Vector3(x, s.y, s.z - s.back),
    new THREE.Vector3(x + s.w * .7, s.y, s.z - s.back * .66),
    new THREE.Vector3(x + s.w, s.y, s.z + (s.front - s.back) * .15),
    new THREE.Vector3(x + s.w * .72, s.y, s.z + s.front * .7),
  ];
}

/**
 * Insert smoothly interpolated sections between authored ones (Catmull-Rom
 * on every numeric field), so a few anatomical landmarks produce a finer,
 * evenly faceted surface without hand-authoring every ring.
 */
function refine<T extends object>(sections: readonly T[], subdivide: number): T[] {
  if (subdivide <= 0 || sections.length < 2) return [...sections];
  const out: T[] = [];
  const keys = Object.keys(sections[0]) as (keyof T)[];
  for (let i = 0; i < sections.length - 1; i++) {
    const p0 = sections[Math.max(0, i - 1)], p1 = sections[i], p2 = sections[i + 1], p3 = sections[Math.min(sections.length - 1, i + 2)];
    for (let k = 0; k <= subdivide; k++) {
      if (k === 0 && i > 0) continue;
      const t = k / (subdivide + 1);
      const value = {} as T;
      for (const key of new Set([...keys, ...Object.keys(p1), ...Object.keys(p2)] as (keyof T)[])) {
        const a0 = p0[key] as number | undefined, a1 = p1[key] as number | undefined, a2 = p2[key] as number | undefined, a3 = p3[key] as number | undefined;
        if (a1 === undefined || a2 === undefined) { (value as Record<keyof T, unknown>)[key] = a1 ?? a2; continue; }
        const b0 = a0 ?? a1, b3 = a3 ?? a2, t2 = t * t, t3 = t2 * t;
        (value as Record<keyof T, unknown>)[key] = .5 * (2 * a1 + (-b0 + a2) * t + (2 * b0 - 5 * a1 + 4 * a2 - b3) * t2 + (-b0 + 3 * a1 - 3 * a2 + b3) * t3);
      }
      out.push(value);
    }
  }
  out.push(sections[sections.length - 1]);
  return out;
}

function hashPoint(p: THREE.Vector3): number {
  let h = Math.sin(p.x * 127.1 + p.y * 311.7 + p.z * 74.7) * 43758.5453;
  h -= Math.floor(h);
  return h;
}

/**
 * Accumulates one group's facets into a coat geometry and a marking
 * geometry. Every triangle is oriented outward from the part's own axis, so
 * sections can be authored in any order without inside-out faces.
 */
export class FacetBuilder {
  private coat: number[] = [];
  private coatColors: number[] = [];
  private mark: number[] = [];
  private markColors: number[] = [];
  private readonly scratch = { a: new THREE.Vector3(), b: new THREE.Vector3(), n: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };

  /** `origin` places this group's local space in dog space for pattern lookups. */
  constructor(private readonly paint: CoatPainter, private readonly origin: V3 = [0, 0, 0], private readonly scale = 1) {}

  /** Emit a triangle whose outward side faces away from `inside`. */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, inside: THREE.Vector3 | null, color?: THREE.Color, marking = false, preset?: PaintResult): void {
    const { a: e1, b: e2, n, c: centroid, d } = this.scratch;
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-14) return;
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    let first = b, second = c;
    if (inside && n.dot(d.subVectors(centroid, inside)) < 0) { first = c; second = b; n.negate(); }
    n.normalize();
    let paint: PaintResult;
    if (preset) paint = preset;
    else if (color) paint = { color, marking };
    else {
      const dogSpace = d.copy(centroid).multiplyScalar(this.scale).add(new THREE.Vector3(...this.origin));
      paint = this.paint(dogSpace, n, hashPoint(dogSpace));
    }
    const pos = paint.marking ? this.mark : this.coat, col = paint.marking ? this.markColors : this.coatColors;
    for (const v of [a, first, second]) { pos.push(v.x, v.y, v.z); col.push(paint.color.r, paint.color.g, paint.color.b); }
    if (paint.fleck) this.fleck(a, first, second, n, paint.fleck);
  }

  /** A small diamond laid flush on a facet, inside its edges. */
  private fleck(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3, color: THREE.Color): void {
    const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() * .5;
    const size = Math.min(.0068, Math.sqrt(area) * .2) * (.7 + .5 * hashPoint(center)) / this.scale;
    if (size < .0015) return;
    const u = b.clone().sub(a).normalize(), v = n.clone().cross(u).normalize();
    center.addScaledVector(n, .0012 / this.scale);
    const p = [center.clone().addScaledVector(u, size), center.clone().addScaledVector(v, size * .62),
      center.clone().addScaledVector(u, -size), center.clone().addScaledVector(v, -size * .62)];
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]]) {
      // Keep the fleck's winding facing the same way as its facet.
      const e = p[j].clone().sub(p[i]).cross(p[k].clone().sub(p[i]));
      const [x, y, z] = e.dot(n) >= 0 ? [p[i], p[j], p[k]] : [p[i], p[k], p[j]];
      for (const q of [x, y, z]) { this.mark.push(q.x, q.y, q.z); this.markColors.push(color.r, color.g, color.b); }
    }
  }

  /** Both windings, for thin leather and feathering read from either side. */
  tri2(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color?: THREE.Color, marking = false): void {
    this.tri(a, b, c, null, color, marking);
    this.tri(a, c, b, null, color, marking);
  }

  private paintQuad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, inside: THREE.Vector3): PaintResult {
    const center = a.clone().add(b).add(c).add(d).multiplyScalar(.25);
    const n = c.clone().sub(a).cross(d.clone().sub(b));
    if (n.dot(center.clone().sub(inside)) < 0) n.negate();
    n.normalize();
    const dogSpace = center.multiplyScalar(this.scale).add(new THREE.Vector3(...this.origin));
    return this.paint(dogSpace, n, hashPoint(dogSpace));
  }

  private loft(rings: THREE.Vector3[][], color?: THREE.Color, marking = false, capStart = true, capEnd = true): void {
    const centers = rings.map(r => r.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / r.length));
    for (let k = 1; k < rings.length; k++) {
      const inside = centers[k - 1].clone().lerp(centers[k], .5);
      for (let j = 0; j < EIGHT; j++) {
        const j2 = (j + 1) % EIGHT;
        const a = rings[k - 1][j], b = rings[k - 1][j2], c = rings[k][j2], d = rings[k][j];
        // A whole quad takes one coat colour, so markings step along the
        // facet grid in clean blocks rather than splintering into slivers.
        const paint = color ? undefined : this.paintQuad(a, b, c, d, inside);
        const rest = paint ? { ...paint, fleck: undefined } : undefined;
        // Split each quad along its shorter diagonal: planes stay honest.
        if (a.distanceToSquared(c) <= b.distanceToSquared(d)) {
          this.tri(a, b, c, inside, color, marking, paint); this.tri(a, c, d, inside, color, marking, rest);
        } else {
          this.tri(a, b, d, inside, color, marking, paint); this.tri(b, c, d, inside, color, marking, rest);
        }
      }
    }
    const cap = (ring: THREE.Vector3[], center: THREE.Vector3, beyond: THREE.Vector3) => {
      const tip = center.clone().add(beyond);
      for (let j = 0; j < EIGHT; j++) this.tri(ring[j], ring[(j + 1) % EIGHT], tip, center.clone().sub(beyond), color, marking);
    };
    const last = rings.length - 1;
    if (capStart) cap(rings[0], centers[0], centers[0].clone().sub(centers[1]).multiplyScalar(.18));
    if (capEnd) cap(rings[last], centers[last], centers[last].clone().sub(centers[last - 1]).multiplyScalar(.18));
  }

  loftZ(sections: readonly SectionZ[], color?: THREE.Color, marking = false, capStart = true, capEnd = true, subdivide = 0): void {
    this.loft(refine(sections, subdivide).map(ringZ), color, marking, capStart, capEnd);
  }

  loftY(sections: readonly SectionY[], color?: THREE.Color, marking = false, capStart = true, capEnd = true): void {
    this.loft(sections.map(ringY), color, marking, capStart, capEnd);
  }

  /** A faceted joint knuckle: a squat bipyramid bridging rigid segments. */
  knuckle(c: V3, w: number, h: number, front: number, back: number, color?: THREE.Color): void {
    const [x, y, z] = c;
    const center = new THREE.Vector3(x, y, z);
    const top = new THREE.Vector3(x, y + h, z), bottom = new THREE.Vector3(x, y - h, z);
    const ring = [
      new THREE.Vector3(x, y, z + front), new THREE.Vector3(x - w, y, z + (front - back) * .2),
      new THREE.Vector3(x, y, z - back), new THREE.Vector3(x + w, y, z + (front - back) * .2),
    ];
    for (let k = 0; k < 4; k++) {
      const a = ring[k], b = ring[(k + 1) % 4];
      this.tri(a, b, top, center, color); this.tri(b, a, bottom, center, color);
    }
  }

  /**
   * A domed, faceted foot: a pad ring on the ground, a knuckle ring that
   * rises toward the pastern and a rounded toe line. `sole` is the lowest y.
   */
  foot(sole: number, length: number, width: number, height: number, heel: number, color?: THREE.Color, shift = 0): void {
    const back = -length * .38, front = length * .62;
    const base = [
      [0, front], [-width * .78, front * .72], [-width, front * .18], [-width * .82, back * .55],
      [0, back], [width * .82, back * .55], [width, front * .18], [width * .78, front * .72],
    ].map(([x, z]) => new THREE.Vector3(x, sole, z + shift));
    const knuckles = [
      [0, front * .78], [-width * .66, front * .6], [-width * .82, front * .12], [-width * .62, back * .5],
      [0, back * .8], [width * .62, back * .5], [width * .82, front * .12], [width * .66, front * .6],
    ].map(([x, z], i) => new THREE.Vector3(x, sole + height * (i === 4 ? heel : i === 0 ? .72 : .86), z + shift));
    const center = new THREE.Vector3(0, sole + height * .4, shift);
    const crown = new THREE.Vector3(0, sole + height * 1.1, back * .2 + shift);
    const soleCenter = new THREE.Vector3(0, sole, front * .1 + shift);
    for (let j = 0; j < EIGHT; j++) {
      const j2 = (j + 1) % EIGHT;
      this.tri(base[j], base[j2], knuckles[j2], center, color);
      this.tri(base[j], knuckles[j2], knuckles[j], center, color);
      this.tri(knuckles[j], knuckles[j2], crown, center, color);
      this.tri(base[j2], base[j], soleCenter, center, color);
    }
  }

  build(): { coat: THREE.BufferGeometry | null; marking: THREE.BufferGeometry | null } {
    const make = (pos: number[], col: number[]) => {
      if (!pos.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    };
    return { coat: make(this.coat, this.coatColors), marking: make(this.mark, this.markColors) };
  }
}

/** Elliptical region test with an irregular, asymmetric edge. */
export function patchWeight(p: THREE.Vector3, center: V3, radius: V3, wobble = .12): number {
  const dx = (p.x - center[0]) / radius[0], dy = (p.y - center[1]) / radius[1], dz = (p.z - center[2]) / radius[2];
  const edge = Math.sqrt(dx * dx + dy * dy + dz * dz)
    + wobble * Math.sin(p.z * 41 + p.y * 23) + wobble * .6 * Math.sin(p.x * 57 - p.z * 19);
  return edge < 1 ? 1 : 0;
}
