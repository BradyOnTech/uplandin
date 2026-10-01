import * as THREE from 'three';

/** Flat-shaded, vertex-coloured triangle soup built from primitive pieces. */
export class Kit {
  private positions: number[] = [];
  private colors: number[] = [];
  private color = new THREE.Color();
  private v = new THREE.Vector3();
  add(geometry: THREE.BufferGeometry, color: number | THREE.Color, matrix?: THREE.Matrix4, jitter = 0, rng?: () => number): this {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = flat.getAttribute('position');
    const tint = typeof color === 'number' ? this.color.setHex(color) : this.color.copy(color);
    // Per-face tint noise keeps big planes from reading as one flat colour.
    let shade = 1;
    for (let i = 0; i < position.count; i++) {
      this.v.fromBufferAttribute(position, i);
      if (matrix) this.v.applyMatrix4(matrix);
      this.positions.push(this.v.x, this.v.y, this.v.z);
      if (i % 3 === 0) shade = jitter && rng ? 1 + (rng() - .5) * jitter : 1;
      this.colors.push(tint.r * shade, tint.g * shade, tint.b * shade);
    }
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
    return this;
  }
  get empty(): boolean { return !this.positions.length; }
  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
export const place = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  m4.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz, 'YXZ')), s.set(sx, sy, sz));

/** A fieldstone: a dodecahedron knocked out of round. */
export function stone(rng: () => number): THREE.BufferGeometry {
  const geometry = rng() < .5 ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0);
  const position = geometry.getAttribute('position');
  const seen = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) { k = .78 + rng() * .36; seen.set(key, k); }
    position.setXYZ(i, position.getX(i) * k, position.getY(i) * k, position.getZ(i) * k);
  }
  return geometry;
}
