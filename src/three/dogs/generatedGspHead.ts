import * as THREE from 'three';
import { germanShorthairedPointerAppearance, type GspCoatId } from './germanShorthairedPointer';
import { englishSetterAppearance, type EnglishSetterCoatId } from './englishSetter';
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

type HeadBreed = { breed: 'gsp'; coatId: GspCoatId } | { breed: 'english-setter'; coatId: EnglishSetterCoatId };

/** Authored head surface in the generated head bone's local coordinates. */
export function createGeneratedGspHead(detail: 'high' | 'lite', coatId: GspCoatId, faceted = false): THREE.BufferGeometry {
  return createGeneratedHead(detail, { breed: 'gsp', coatId }, faceted);
}

export function createGeneratedSetterHead(detail: 'high' | 'lite', coatId: EnglishSetterCoatId, faceted = false): THREE.BufferGeometry {
  return createGeneratedHead(detail, { breed: 'english-setter', coatId }, faceted);
}

/** The faceted look keeps each triangle's own plane; the smooth look blends
 * most of the way to the shared vertex normal. */
function createGeneratedHead(detail: 'high' | 'lite', choice: HeadBreed, faceted = false): THREE.BufferGeometry {
  const soften = faceted ? .12 : .88;
  const source = detail === 'high' ? GSP_HEAD_HIGH : GSP_HEAD_LITE;
  const setter = choice.breed === 'english-setter';
  const table = setter ? { ...source, vertices: source.vertices.map(setterHeadVertex) } : source;
  let coatAt: (vertex: GspHeadVertex) => THREE.Color;
  let nose: THREE.Color, eye: THREE.Color;
  if (choice.breed === 'gsp') {
    const appearance = germanShorthairedPointerAppearance(choice.coatId);
    const liver = new THREE.Color(choice.coatId === 'liver-white' ? 0x51382e : appearance.primary);
    coatAt = () => liver;
    nose = new THREE.Color(appearance.nose); eye = new THREE.Color(appearance.eye);
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
