import * as THREE from 'three';
import { quailGrassClumpGeometry, quailGrassGeometry } from './quailGrass';

/** Reuse the accepted rooted, tapering leaf kit for native prairie rather
 * than the generic renderer's cut cereal stalks. The existing grass material
 * reads UV.y for bend/parting and UV.x for each leaf's phase. No new shader,
 * material, texture or draw submission is required. */
export function sharptailGrassGeometry(kind: 'short' | 'stalk' | 'cover'): THREE.BufferGeometry {
  const geometry = kind === 'cover' ? quailGrassClumpGeometry(true, 'mid') : quailGrassGeometry(kind === 'stalk');
  const position = geometry.getAttribute('position');
  const blade = geometry.getAttribute('quailBlade');
  const colors = geometry.getAttribute('color');
  const normals = new Float32Array(position.count * 3);
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const stage = blade.getW(i);
    uv[i * 2] = (blade.getZ(i) * .6180339) % 1;
    uv[i * 2 + 1] = stage;
    normals[i * 3 + 1] = 1;
    // Let the map's silver/gold instance palette lead. A lighter sheath
    // avoids the dark, rigid silhouette of harvested cereal stubble.
    const shade = .56 + stage * .44;
    colors.setXYZ(i, shade, shade, shade * .95);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.deleteAttribute('quailBlade');
  geometry.userData = { kind: `sharptail-native-${kind}`, triangles: position.count / 3 };
  return geometry;
}
