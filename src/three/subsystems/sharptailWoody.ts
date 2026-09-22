import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number, tip: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(tip, radius, a.distanceTo(b), 5, 1, true).toNonIndexed();
  geometry.deleteAttribute('uv');
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Open, narrow deciduous crowns on a visible forked stem. Both meshes share
 * the same basal origin/transform, preserving every existing shelterbelt root.
 * The 170-triangle pair costs less than the former 580-triangle Quail tree. */
export function sharptailTreeGeometry(): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  const root = new THREE.Vector3(0, -.035, 0), fork = new THREE.Vector3(.008, .40, .014);
  const upper = new THREE.Vector3(.025, .92, .035);
  const branches = [branch(root, fork, .018, .011), branch(fork, upper, .011, .005)];
  const foliage: THREE.BufferGeometry[] = [];
  const masses = [
    [-.12, .69, .045, .17, .21, .13], [.10, .82, -.055, .16, .23, .14],
    [.015, 1.01, .025, .14, .19, .13], [-.06, .87, .105, .12, .18, .13],
    [.13, .62, .085, .12, .14, .12],
  ];
  for (const [index, [x, y, z, sx, sy, sz]] of masses.entries()) {
    const target = new THREE.Vector3(x, y, z);
    branches.push(branch(fork, target, .006, .002));
    const lobe = new THREE.IcosahedronGeometry(1, 0); lobe.deleteAttribute('uv');
    const p = lobe.getAttribute('position');
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const irregular = 1 + Math.sin(vx * 3.1 + vz * 2.7 + index * 1.8) * .10;
      p.setXYZ(i, x + vx * sx * irregular, y + vy * sy, z + vz * sz * irregular);
      const shade = .87 + (vy + 1) * .07;
      colors.set([shade, shade, shade], i * 3);
    }
    lobe.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    lobe.computeVertexNormals(); foliage.push(lobe);
  }
  const trunk = merge(branches), crown = merge(foliage);
  trunk.userData = { kind: 'sharptail-shelterbelt-trunk' };
  crown.userData = { kind: 'sharptail-shelterbelt-crown' };
  return { trunk, crown };
}

/** Low open silver-sage/snowberry growth: four fine branching shoots and
 * small opposite leaf pairs. 36 triangles replace the old solid shrub lump
 * at the same sites, with broad negative space beneath its leaf tips. */
export function sharptailShrubGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [];
  type P = readonly [number, number, number];
  const tri = (a: P, b: P, c: P, color: readonly number[]) => {
    for (const p of [a, b, c]) { positions.push(...p); colors.push(...color); }
  };
  for (let shoot = 0; shoot < 4; shoot++) {
    const angle = shoot * 2.399, dx = Math.sin(angle), dz = Math.cos(angle);
    const h = .31 + (shoot % 3) * .045, reach = .28 + (shoot % 2) * .07;
    const top: P = [dx * reach, h, dz * reach];
    const color = [.62, .59, .49];
    for (const turn of [angle, angle + Math.PI / 2]) {
      const wx = Math.cos(turn) * .009, wz = -Math.sin(turn) * .009;
      tri([-wx, 0, -wz], [wx, 0, wz], [top[0] - wx * .2, top[1], top[2] - wz * .2], color);
      tri([wx, 0, wz], [top[0] + wx * .2, top[1], top[2] + wz * .2], [top[0] - wx * .2, top[1], top[2] - wz * .2], color);
    }
    for (let leaf = 0; leaf < 2; leaf++) {
      const side = leaf === 0 ? -1 : 1, t = .65 + leaf * .18;
      const x = top[0] * t, y = h * t, z = top[2] * t;
      const leafAngle = angle + side * 1.05, lx = Math.sin(leafAngle), lz = Math.cos(leafAngle);
      const end: P = [x + lx * .19, y + .035, z + lz * .19];
      const left: P = [x + lx * .095 + lz * .037, y + .045, z + lz * .095 - lx * .037];
      const right: P = [x + lx * .095 - lz * .037, y + .025, z + lz * .095 + lx * .037];
      tri([x, y, z], left, end, [.90, .94, .88]);
      tri([x, y, z], end, right, [.81, .87, .81]);
    }
    const x = top[0], y = top[1], z = top[2], wx = dz * .025, wz = -dx * .025;
    tri([x - wx, y, z - wz], [x + wx, y, z + wz], [x + dx * .12, y + .075, z + dz * .12], [.93, .98, .91]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { kind: 'sharptail-open-sage', triangles: positions.length / 9 };
  return geometry;
}
