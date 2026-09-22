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

/** Compact sage/snowberry with an uneven rising outline and visible forks.
 * Four small irregular leaf volumes replace the repeated flat umbrellas;
 * the basal gap and unequal branches keep the plant light and low. */
export function sharptailShrubGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const root = new THREE.Vector3(0, 0, 0), fork = new THREE.Vector3(.02, .23, -.025);
  for (const [a, b, radius, tip] of [
    [root, fork, .018, .012],
    [fork, new THREE.Vector3(.20, .49, -.08), .012, .005],
    [fork, new THREE.Vector3(-.17, .56, .12), .011, .004],
    [root, new THREE.Vector3(-.25, .35, -.17), .014, .004],
  ] as const) {
    const stem = branch(a, b, radius, tip);
    stem.setAttribute('color', new THREE.Float32BufferAttribute(
      Array.from({ length: stem.attributes.position.count }, () => [.62, .54, .39]).flat(), 3));
    parts.push(stem);
  }
  // Different proportions, lean and yaw avoid a stack of identical crowns.
  // The low middle lobe gathers the forks without sealing the open base.
  const lobes = [
    [.20, .49, -.08, .20, .18, .14, -.24],
    [-.17, .56, .12, .16, .23, .16, .63],
    [-.25, .35, -.17, .22, .17, .14, -.49],
    [.01, .32, -.005, .16, .15, .20, .31],
  ];
  for (const [index, [x, y, z, sx, sy, sz, yaw]] of lobes.entries()) {
    const lobe = new THREE.IcosahedronGeometry(1, 0); lobe.deleteAttribute('uv');
    const p = lobe.getAttribute('position'), colors: number[] = [];
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const irregular = 1 + Math.sin(vx * 3.9 + vy * 2.3 + vz * 5.1 + index * 1.7) * .11;
      const u = (vx + vy * .12 + vz * .06) * sx * irregular;
      const v = (vz - vy * .09) * sz * irregular;
      p.setXYZ(i, x + u * cos - v * sin, y + vy * sy * (1 + vx * .09), z + u * sin + v * cos);
      // Silvered leaf faces remain readable on their shaded sides without
      // making every lobe uniformly bright or borrowing Quail's dark green.
      const shade = .79 + (vy + 1) * .085 + Math.sin(Math.floor(i / 3) * 2.1 + index) * .025;
      colors.push(shade * .96, shade, shade * .91);
    }
    lobe.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    lobe.computeVertexNormals(); parts.push(lobe);
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
