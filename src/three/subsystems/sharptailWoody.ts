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

/** A low, open prairie shrub with separate angular leaf masses on visible
 * forks. The broad leaf fans survive an ordinary walking distance, while
 * the empty base and unequal heights keep it distinct from Quail plum. */
export function sharptailShrubGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const root = new THREE.Vector3(0, 0, 0), fork = new THREE.Vector3(.025, .26, -.025);
  const tips = [new THREE.Vector3(.30, .53, -.04), new THREE.Vector3(-.20, .63, .08),
    new THREE.Vector3(-.30, .43, -.21), new THREE.Vector3(.08, .45, .29)];
  for (const [a, b, radius, tip] of [
    [root, fork, .018, .013], [fork, tips[0], .013, .006], [fork, tips[1], .011, .005],
    [root, tips[2], .015, .005], [fork, tips[3], .01, .004],
    [fork, new THREE.Vector3(.15, .76, .19), .006, .002],
  ] as const) {
    const stem = branch(a, b, radius, tip);
    stem.setAttribute('color', new THREE.Float32BufferAttribute(
      Array.from({ length: stem.attributes.position.count }, () => [.62, .54, .39]).flat(), 3));
    parts.push(stem);
  }
  // Flattened, offset hexagonal fans, not closed spherical shrub domes.
  // Unequal rim heights keep the silhouette broken from every viewing angle.
  const fans = [
    [.30, .52, -.04, .29, .18, -.15], [-.20, .62, .08, .28, .17, .55],
    [-.30, .43, -.21, .26, .17, -.4], [.08, .44, .29, .25, .19, .75],
    [-.035, .36, -.065, .22, .15, -.1],
  ];
  for (const [index, [x, y, z, sx, sz, yaw]] of fans.entries()) {
    const positions: number[] = [], colors: number[] = [];
    const rim = Array.from({ length: 6 }, (_, i) => {
      const angle = i * Math.PI / 3;
      const reach = 1 + Math.sin(i * 2.7 + index) * .16;
      const u = Math.cos(angle) * sx * reach, v = Math.sin(angle) * sz * reach;
      return [x + u * Math.cos(yaw) - v * Math.sin(yaw), y + Math.sin(i * 1.9 + index) * .025,
        z + u * Math.sin(yaw) + v * Math.cos(yaw)];
    });
    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6;
      for (const [top, shade] of [[true, .87 + (i % 3) * .055], [false, .76 + (i % 2) * .05]] as const) {
        const peak = [x - sx * .13, y + (top ? .105 : -.065), z + sz * .08];
        for (const point of top ? [rim[i], peak, rim[next]] : [rim[next], peak, rim[i]]) {
          positions.push(...point); colors.push(shade * .94, shade, shade * .86);
        }
      }
    }
    const fan = new THREE.BufferGeometry();
    fan.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    fan.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    fan.computeVertexNormals(); parts.push(fan);
  }
  const geometry = merge(parts);
  geometry.userData = { kind: 'sharptail-open-sage', triangles: geometry.attributes.position.count / 3 };
  return geometry;
}

/** Dry yarrow/forb heads in little uneven sprays, below the hunter's view.
 * Three stems share one geometry; the seed heads use solid triangular facets
 * rather than alpha cards, so the sparse pockets need no texture or sorting. */
export function sharptailForbGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const angle = i * 2.399, x = Math.sin(angle) * .18, z = Math.cos(angle) * .18;
    const h = .46 + i * .105, top = new THREE.Vector3(x * 1.4, h, z * 1.4);
    const stem = branch(new THREE.Vector3(x * .25, 0, z * .25), top, .006, .003);
    stem.setAttribute('color', new THREE.Float32BufferAttribute(
      Array.from({ length: stem.attributes.position.count }, () => [.70, .61, .42]).flat(), 3));
    parts.push(stem);
    const head = new THREE.IcosahedronGeometry(1, 0); head.deleteAttribute('uv');
    head.scale(.10 + i * .015, .025, .09 + i * .012); head.translate(top.x, h, top.z);
    head.setAttribute('color', new THREE.Float32BufferAttribute(
      Array.from({ length: head.attributes.position.count }, (_, n) => {
        const shade = .78 + Math.floor(n / 3) % 3 * .08; return [shade, shade * .88, shade * .61];
      }).flat(), 3));
    parts.push(head);
  }
  const geometry = merge(parts);
  geometry.userData = { kind: 'sharptail-dry-forb', triangles: geometry.attributes.position.count / 3 };
  return geometry;
}

/** Two weathered fieldstones, already sunk into the soil at unit scale.
 * Their tallest visible face stays below a boot step; these decorative
 * clusters do not pretend to be collision-bearing boulders. */
export function sharptailStoneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [index, [x, z, sx, sy, sz]] of [
    [0, 0, .52, .16, .36], [.48, -.20, .22, .105, .19],
  ].entries()) {
    const stone = new THREE.IcosahedronGeometry(1, 0); stone.deleteAttribute('uv');
    const p = stone.getAttribute('position'), colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const chip = 1 + Math.sin(vx * 4.6 + vz * 3.9 + index * 2.1) * .12;
      p.setXYZ(i, x + vx * sx * chip, vy * sy + .025, z + vz * sz * chip);
      const shade = .72 + (vy + 1) * .10;
      colors.push(shade, shade * .99, shade * .93);
    }
    stone.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    stone.computeVertexNormals(); parts.push(stone);
  }
  const geometry = merge(parts);
  geometry.userData = { kind: 'sharptail-low-fieldstone', triangles: geometry.attributes.position.count / 3 };
  return geometry;
}
