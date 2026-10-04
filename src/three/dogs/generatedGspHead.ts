import * as THREE from 'three';
import { germanShorthairedPointerAppearance, type GspCoatId } from './germanShorthairedPointer';
import { englishSetterAppearance, type EnglishSetterCoatId } from './englishSetter';
import { griffonAppearance, griffonHash, griffonMarkerTone, type GriffonCoatId } from './griffon';
import { GSP_HEAD_HIGH, GSP_HEAD_LITE, type GspHeadVertex } from './generatedGspHeadData';

/** Marker colour: the body coat shader replaces surfaces this light with coat. */
export const GENERATED_COAT_MARKER = 0xd1cdc1;

/**
 * English Setter conformation derived from the authored GSP head surface.
 * The setter skull is longer and more oval with a pronounced stop, the
 * muzzle is longer and squarer with deeper flews, and the ears are set at
 * eye level and hang lower with a broader, feathered leather. The transform
 * depends only on head-local position, except for the ear leather itself,
 * so coincident lip vertices of the head and jaw remain closed.
 */
export function setterHeadVertex(v: GspHeadVertex): GspHeadVertex {
  let [x, y, z] = v;
  const owner = v[3];
  if (owner === 2 || owner === 3) {
    const side = owner === 2 ? -1 : 1;
    const drop = Math.max(0, .03 - y);
    const t = THREE.MathUtils.clamp(drop / .12, 0, 1);
    y = .022 - drop * 1.16;
    z = -.016 + (z + .012) * (1.04 + .16 * t);
    x += side * (.003 + .006 * t * t);
    return [x, y, z, v[3], v[4], v[5]];
  }
  if (z > .07) z = .07 + (z - .07) * 1.16;
  else if (z < 0) z *= 1.12;
  // Raise the frontal bone above and behind the eyes into a defined stop.
  const dome = THREE.MathUtils.smoothstep(y, .015, .045) * Math.exp(-(((z - .025) / .045) ** 2));
  y += .009 * dome;
  // Parallel planes: the muzzle top sits a touch lower than the skull.
  if (z > .085 && y > 0) y -= .004 * THREE.MathUtils.smoothstep(z, .085, .12);
  // Deeper, squarer upper lip (flews) toward the front of the muzzle.
  if (z > .09 && y < -.018) y -= .007 * THREE.MathUtils.smoothstep(z, .09, .14);
  return [x, y, z, v[3], v[4], v[5]];
}

/**
 * Wirehaired Pointing Griffon conformation from the same authored surface.
 * The head is long, with a muzzle as long as the skull and square at the
 * front rather than tapering, and a moderate stop. The ears are set high and
 * lie flat, a little shorter than the GSP's. The beard, moustache and
 * eyebrows are separate furnishings (generatedGsp.ts) over this surface. As
 * with the setter, only the ear leather depends on more than position, so
 * coincident lip vertices of the head and jaw stay closed.
 */
export function griffonHeadVertex(v: GspHeadVertex): GspHeadVertex {
  let [x, y, z] = v;
  const owner = v[3];
  if (owner === 2 || owner === 3) {
    // Flat, high-set leather: the same set, a shorter hang held to the skull.
    const drop = Math.max(0, .03 - y);
    y += drop * .14;
    x *= 1 - .05 * THREE.MathUtils.clamp(drop / .12, 0, 1);
    return [x, y, z, v[3], v[4], v[5]];
  }
  if (z > .07) z = .07 + (z - .07) * 1.06;
  // A square muzzle: the front keeps its width instead of narrowing to the nose.
  x *= 1 + .11 * THREE.MathUtils.smoothstep(z, .1, .17);
  return [x, y, z, v[3], v[4], v[5]];
}

type HeadBreed = { breed: 'gsp'; coatId: GspCoatId } | { breed: 'english-setter'; coatId: EnglishSetterCoatId }
  | { breed: 'griffon'; coatId: GriffonCoatId };

/** Authored head surface in the generated head bone's local coordinates. */
export function createGeneratedGspHead(detail: 'high' | 'lite', coatId: GspCoatId, faceted = false): THREE.BufferGeometry {
  return createGeneratedHead(detail, { breed: 'gsp', coatId }, faceted);
}

export function createGeneratedSetterHead(detail: 'high' | 'lite', coatId: EnglishSetterCoatId, faceted = false): THREE.BufferGeometry {
  return createGeneratedHead(detail, { breed: 'english-setter', coatId }, faceted);
}

export function createGeneratedGriffonHead(detail: 'high' | 'lite', coatId: GriffonCoatId, faceted = false): THREE.BufferGeometry {
  return createGeneratedHead(detail, { breed: 'griffon', coatId }, faceted);
}


/** The faceted look keeps each triangle's own plane; the smooth look blends
 * most of the way to the shared vertex normal. */
function createGeneratedHead(detail: 'high' | 'lite', choice: HeadBreed, faceted = false): THREE.BufferGeometry {
  const soften = faceted ? .12 : .88;
  const source = detail === 'high' ? GSP_HEAD_HIGH : GSP_HEAD_LITE;
  const transform = choice.breed === 'english-setter' ? setterHeadVertex : choice.breed === 'griffon' ? griffonHeadVertex : null;
  const table = transform ? { ...source, vertices: source.vertices.map(transform) } : source;
  let coatAt: (vertex: GspHeadVertex) => THREE.Color;
  let nose: THREE.Color, eye: THREE.Color;
  if (choice.breed === 'gsp') {
    const appearance = germanShorthairedPointerAppearance(choice.coatId);
    const liver = new THREE.Color(choice.coatId === 'liver-white' ? 0x51382e : appearance.primary);
    coatAt = () => liver;
    nose = new THREE.Color(appearance.nose); eye = new THREE.Color(appearance.eye);
  } else if (choice.breed === 'griffon') {
    const a = griffonAppearance(choice.coatId);
    const brown = new THREE.Color(a.primary), deep = new THREE.Color(a.primaryDeep);
    nose = new THREE.Color(a.nose); eye = new THREE.Color(a.eye);
    coatAt = ([x, y, z, owner]) => {
      const hair = griffonHash(x, y, z), lock = griffonHash(z, x, y);
      // Brown leather, darkening a little toward the tips.
      if (owner === 2 || owner === 3) return brown.clone().lerp(deep, THREE.MathUtils.smoothstep(-y, .0, .07) * .4 + lock * .15);
      // Brown over the skull, brows and bridge; the chin and lips are
      // furnished with grizzled hair that runs into the beard. Marker facets
      // take the body's grizzle from the coat shader, each its own lock.
      const grizzle = () => new THREE.Color(griffonMarkerTone(GENERATED_COAT_MARKER, lock));
      if (owner === 1) return hair < .7 ? grizzle() : brown;
      if (z > .1 && y < -.006) return hair < .55 ? grizzle() : brown;
      return brown.clone().lerp(deep, lock * .35);
    };
  } else {
    const a = englishSetterAppearance(choice.coatId);
    const marker = new THREE.Color(GENERATED_COAT_MARKER), primary = new THREE.Color(a.primary);
    const deep = new THREE.Color(a.primaryDeep), tan = a.tanPoint === undefined ? null : new THREE.Color(a.tanPoint);
    nose = new THREE.Color(a.nose); eye = new THREE.Color(a.eye);
    coatAt = ([x, y, z, owner]) => {
      // Coloured ear leather, darkening a little toward the feathered fringe.
      if (owner === 2 || owner === 3) return primary.clone().lerp(deep, THREE.MathUtils.smoothstep(-y, .04, .13) * .45);
      const ax = Math.abs(x);
      // A classic belton hood: colour over the eyes and the sides of the
      // skull, a clean white blaze up the centre and a white ticked muzzle.
      const eyePatch = ((ax - .036) / .028) ** 2 + ((y - .02) / .032) ** 2 + ((z - .058) / .05) ** 2 < 1;
      const skullSide = z < .07 && y > -.012 && ax > .016 + Math.max(0, z) * .12;
      const blaze = ax < .012 + Math.max(0, .05 - z) * .08;
      if (tan && y < -.004 && z > .035 && z < .11 && ax > .022) return tan; // cheeks
      if (tan && ax > .02 && ax < .04 && y > .036 && y < .05 && z > .045 && z < .07) return tan; // brows
      if ((eyePatch || skullSide) && !blaze) return primary;
      return marker;
    };
  }
  const pupil = new THREE.Color(0x120e0d);
  const vertices = table.vertices.map(v => new THREE.Vector3(v[0], v[1], v[2]));
  const sums = vertices.map(() => new THREE.Vector3());
  const normals = table.faces.map(face => {
    const [a, b, c] = face;
    const normal = vertices[b].clone().sub(vertices[a]).cross(vertices[c].clone().sub(vertices[a])).normalize();
    for (let k = 0; k < 3; k++) {
      const i = face[k], u = vertices[face[(k + 1) % 3]].clone().sub(vertices[i]).normalize();
      const v = vertices[face[(k + 2) % 3]].clone().sub(vertices[i]).normalize();
      sums[i].addScaledVector(normal, Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1)));
    }
    return normal;
  });
  // Neutral upper/lower lips meet directly. Matching their outward normals
  // keeps the separately weighted oral roofs from drawing a dark zigzag.
  const coincident = new Map<string, number[]>();
  vertices.forEach((vertex, i) => {
    const key = vertex.toArray().map(v => v.toFixed(6)).join(':');
    const list = coincident.get(key) ?? []; list.push(i); coincident.set(key, list);
  });
  for (const list of coincident.values()) if (list.length > 1) {
    const normal = list.reduce((sum, i) => sum.add(sums[i]), new THREE.Vector3());
    for (const i of list) sums[i].copy(normal);
  }
  sums.forEach(normal => normal.normalize());
  const positions: number[] = [], normalsOut: number[] = [], colors: number[] = [];
  const owners: number[] = [], blends: number[] = [];
  for (const [faceIndex, face] of table.faces.entries()) {
    // Colour a whole triangle from its centroid so markings have crisp,
    // stable edges instead of smeared per-vertex gradients.
    const centroid = face.slice(0, 3).reduce<[number, number, number, number, number, number]>((sum, i) => {
      const v = table.vertices[i]; for (let k = 0; k < 3; k++) sum[k] += v[k] / 3;
      sum[3] = Math.max(sum[3], v[3]); return sum;
    }, [0, 0, 0, 0, 0, 0]);
    const faceCoat = coatAt(centroid);
    for (const i of face.slice(0, 3)) {
      const vertex = table.vertices[i];
      positions.push(...vertices[i].toArray());
      normalsOut.push(...normals[faceIndex].clone().lerp(sums[i], soften).normalize().toArray());
      const color = face[3] === 1 ? eye : face[3] === 2 ? pupil : faceCoat.clone().lerp(nose, vertex[5]);
      colors.push(color.r, color.g, color.b); owners.push(vertex[3]); blends.push(vertex[4]);
    }
  }
  if (choice.breed === 'griffon') appendGriffonBeard({ positions, normals: normalsOut, colors, owners, blends }, soften);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalsOut, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // These two authoring attributes are consumed by generatedGsp's single-skin
  // assembly and discarded with the temporary head geometry.
  geometry.setAttribute('headBone', new THREE.Uint8BufferAttribute(owners, 1));
  geometry.setAttribute('headWeight', new THREE.Float32BufferAttribute(blends, 1));
  return geometry;
}

/** A cross-section of the beard at one point along the muzzle: [z, half-width of the muzzle there, top, bottom]. */
type BeardSection = readonly [z: number, half: number, top: number, bottom: number];
/**
 * The Griffon's moustache and beard, in the transformed head's frame (see
 * griffonHeadVertex). The sections run from the cheek to the front of the
 * muzzle: the hair stands off the muzzle's sides from about half its height,
 * hangs below the lips and the chin, and ends square under the nose.
 */
export const GRIFFON_BEARD: readonly BeardSection[] = [
  [.086, .018, -.012, -.046],
  [.104, .0285, -.002, -.066],
  [.125, .0292, -.002, -.073],
  [.145, .0285, -.004, -.075],
  [.162, .026, -.01, -.07],
  [.174, .02, -.017, -.058],
];

/** One section as a closed loop: down one side, across under the chin and up the other, closing inside the muzzle. */
function beardLoop([z, half, top, bottom]: BeardSection, index: number): THREE.Vector3[] {
  // Alternate sections hang a little longer: a ragged, not a trimmed, edge.
  const rag = index % 2 ? .007 : -.003, side = half + .008;
  return ([
    [-(half + .003), top], [-side, top - .02], [-(side - .002), bottom + .014], [-half * .55, bottom + rag * .6],
    [0, bottom - .006 + rag], [half * .55, bottom + rag * .4], [side - .002, bottom + .014], [side, top - .02], [half + .003, top],
    [0, top + .012],
  ] as const).map(([x, y]) => new THREE.Vector3(x, y, z));
}

/**
 * One block of harsh hair over the lower muzzle and under the chin, so the
 * head reads square and bearded. It is skinned from the head above the lips
 * to the jaw below them, so the beard drops with the jaw when the dog pants
 * or carries a bird while the moustache stays on the muzzle. Each facet is
 * its own lock of grizzled hair for the coat shader.
 */
function appendGriffonBeard(out: { positions: number[]; normals: number[]; colors: number[]; owners: number[]; blends: number[] }, soften: number): void {
  const loops = GRIFFON_BEARD.map(beardLoop);
  const triangles: THREE.Vector3[][] = [];
  for (let r = 1; r < loops.length; r++) for (let i = 0; i < loops[r].length; i++) {
    const j = (i + 1) % loops[r].length, a = loops[r - 1][i], b = loops[r - 1][j], c = loops[r][i], d = loops[r][j];
    triangles.push([a, c, b], [b, c, d]);
  }
  for (const [loop, front] of [[loops[0], false], [loops[loops.length - 1], true]] as const) {
    const center = loop.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / loop.length);
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      triangles.push(front ? [a, b, center] : [b, a, center]);
    }
  }
  // Shared normals for the smooth look; the faceted look keeps each plane.
  const key = (p: THREE.Vector3) => p.toArray().map(v => v.toFixed(6)).join(':');
  const faceNormal = (t: THREE.Vector3[]) => t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0])).normalize();
  const shared = new Map<string, THREE.Vector3>();
  for (const t of triangles) { const n = faceNormal(t); for (const p of t) shared.set(key(p), (shared.get(key(p)) ?? new THREE.Vector3()).add(n)); }
  for (const t of triangles) {
    const n = faceNormal(t), center = t.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / 3);
    const lock = new THREE.Color(griffonMarkerTone(GENERATED_COAT_MARKER, griffonHash(center.x, center.y, center.z)));
    for (const p of t) {
      out.positions.push(p.x, p.y, p.z);
      out.normals.push(...n.clone().lerp(shared.get(key(p))!.clone().normalize(), soften).normalize().toArray());
      out.colors.push(lock.r, lock.g, lock.b);
      // Head above the lip line, jaw below it, blended across the lips.
      out.owners.push(1); out.blends.push(THREE.MathUtils.smoothstep(-p.y, .012, .04));
    }
  }
}
