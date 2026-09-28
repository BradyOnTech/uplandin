import * as THREE from 'three';
import { germanShorthairedPointerAppearance, type GspCoatId } from './germanShorthairedPointer';
import { GSP_HEAD_HIGH, GSP_HEAD_LITE } from './generatedGspHeadData';

/** Authored head surface in the generated head bone's local coordinates. */
export function createGeneratedGspHead(detail: 'high' | 'lite', coatId: GspCoatId): THREE.BufferGeometry {
  const table = detail === 'high' ? GSP_HEAD_HIGH : GSP_HEAD_LITE;
  const appearance = germanShorthairedPointerAppearance(coatId);
  const liver = new THREE.Color(coatId === 'liver-white' ? 0x51382e : appearance.primary);
  const nose = new THREE.Color(appearance.nose), eye = new THREE.Color(appearance.eye), pupil = new THREE.Color(0x120e0d);
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
  for (const [faceIndex, face] of table.faces.entries()) for (const i of face.slice(0, 3)) {
    const vertex = table.vertices[i];
    positions.push(...vertices[i].toArray());
    normalsOut.push(...normals[faceIndex].clone().lerp(sums[i], .88).normalize().toArray());
    const color = face[3] === 1 ? eye : face[3] === 2 ? pupil : liver.clone().lerp(nose, vertex[5]);
    colors.push(color.r, color.g, color.b); owners.push(vertex[3]); blends.push(vertex[4]);
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
