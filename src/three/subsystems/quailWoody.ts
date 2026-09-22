import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../game/math';

type Mass = readonly [x: number, y: number, z: number, width: number, height: number, depth: number];
type Habit = 'spreading' | 'upright' | 'leaning';

// Unequal primary limbs carry unequal leaf masses. Their gaps show the fork;
// a tree reads as one growing structure rather than a pile of identical pads.
const CROWNS: Record<Habit, readonly Mass[]> = {
  spreading: [
    [-0.27, 0.48, 0.05, 0.34, 0.24, 0.26], [0.16, 0.62, -0.12, 0.34, 0.31, 0.29],
    [0.31, 0.43, 0.19, 0.25, 0.23, 0.23], [-0.06, 0.59, 0.21, 0.26, 0.26, 0.24],
    [-0.31, 0.64, -0.15, 0.23, 0.24, 0.19],
  ],
  upright: [
    [-0.02, 0.63, -0.02, 0.34, 0.40, 0.31], [-0.22, 0.43, 0.11, 0.27, 0.34, 0.25],
    [0.23, 0.51, 0.05, 0.25, 0.33, 0.28], [0.05, 0.61, 0.24, 0.26, 0.28, 0.22],
  ],
  leaning: [
    [0.01, 0.72, 0.14, 0.26, 0.30, 0.26], [-0.19, 0.46, 0.04, 0.26, 0.32, 0.24],
    [0.20, 0.59, 0.22, 0.24, 0.27, 0.22], [-0.06, 0.54, -0.15, 0.22, 0.23, 0.20],
  ],
};

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return geometry;
}

function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number, tip: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(tip, radius, a.distanceTo(b), 5, 1, true).toNonIndexed();
  geometry.deleteAttribute('uv');
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
}

/** A full, faceted leaf volume with two unequal, embedded edge clusters. Branch
 * placement uses the original masses; this changes only their leaf envelope.
 * Complete trees cost 720 triangles spreading / 580 upright or leaning,
 * compared with the former 550 / 444, still in the same two stand batches. */
function treeFoliage(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed), phase = rng() * Math.PI * 2;
  const lean = (rng() - .5) * .20;
  const main = new THREE.IcosahedronGeometry(1, 1); main.deleteAttribute('uv');
  const points = main.getAttribute('position');
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), y = points.getY(i), z = points.getZ(i), angle = Math.atan2(x, z);
    const radius = .90 + Math.sin(angle * 3 + phase) * .12 * (1 - y * y * .5) + Math.cos(y * 4 + x * 2 - phase) * .055;
    const height = .69 + y * .665;
    points.setXYZ(i, x * radius + lean * height, height + Math.sin(x * 3.4 + phase) * .045, z * radius * .96 + height * .075);
  }
  const parts = [main];
  for (let n = 0; n < 2; n++) {
    const cluster = new THREE.IcosahedronGeometry(1, 0); cluster.deleteAttribute('uv');
    const p = cluster.getAttribute('position');
    // Repeated vertices use the same deformation, keeping each lobe closed.
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const shape = 1 + Math.sin(x * 2.7 + z * 3.1 + phase + n) * .11 + Math.cos(y * 4.3 - phase) * .055;
      p.setXYZ(i, x * shape, y * shape, z * shape);
    }
    const angle = phase + n * 2.43, reach = .60 + rng() * .08;
    const width = .34 + rng() * .10, height = .24 + rng() * .10;
    const y = n === 0 ? .58 : 1.01;
    cluster.scale(width, height, width * (.80 + rng() * .22));
    cluster.rotateY(angle * .63); cluster.rotateZ((rng() - .5) * .24);
    cluster.translate(Math.sin(angle) * reach + lean * y, y, Math.cos(angle) * reach + y * .075);
    parts.push(cluster);
  }
  for (const part of parts) {
    // Recompute after splitting faces: carrying smoothed normals into the
    // non-indexed mesh made the old shallow crowns read as polished stones.
    part.computeVertexNormals();
    const p = part.getAttribute('position'), colors = new Float32Array(p.count * 3);
    for (let triangle = 0; triangle < p.count; triangle += 3) {
      const height = (p.getY(triangle) + p.getY(triangle + 1) + p.getY(triangle + 2)) / 3;
      const shade = .88 + Math.max(0, Math.min(1, height / 1.40)) * .15 + (rng() - .5) * .035;
      for (let n = 0; n < 9; n++) colors[triangle * 3 + n] = shade;
    }
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return merge(parts);
}

export function quailTreeGeometry(seed: number, habit: Habit): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  const rng = mulberry32(seed); const lean = habit === 'leaning' ? 0.11 : 0.025;
  const root = new THREE.Vector3(0, -0.1, 0); const fork = new THREE.Vector3(0.016, 0.31, lean * 0.2);
  const spine = new THREE.Vector3(-0.025, 0.61, lean);
  const branches = [branch(root, fork, 0.035, 0.025), branch(fork, spine, 0.025, 0.012)];
  const masses: THREE.BufferGeometry[] = [];
  for (const [i, mass] of CROWNS[habit].entries()) {
    const [x, y, z, width, height, depth] = mass;
    const asymmetry = 0.9 + rng() * 0.19;
    const target = new THREE.Vector3(x, y + height * 0.30, z + lean * 0.3);
    const shoulder = fork.clone().lerp(target, 0.56); shoulder.y -= 0.04;
    branches.push(branch(fork, shoulder, i === 0 ? 0.021 : 0.016, 0.011), branch(shoulder, target, 0.011, 0.004));
    const crown = treeFoliage(seed + i * 1237);
    crown.scale(width * asymmetry, height, depth / asymmetry); crown.rotateY(rng() * 0.8);
    crown.translate(x, y, z + lean * 0.3); masses.push(crown);
  }
  return { trunk: merge(branches), crown: merge(masses) };
}

/** A branched plum refuge with broad, unequal leaf crowns. Solid faceted
 * foliage holds a readable silhouette beyond individual-leaf distance while
 * low windows expose the woody structure. Five stems and five crowns use
 * 320 triangles, below the former 392-triangle open-spray bush. */
export function quailShrubGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rng = mulberry32(824);
  const crowns: readonly Mass[] = [
    [-.28, .70, .12, .43, .25, .33],
    [.18, .89, -.10, .42, .29, .35],
    [.48, .54, .20, .35, .19, .28],
    [-.55, .52, -.14, .32, .23, .26],
    [-.08, .49, .42, .28, .17, .27],
  ];
  for (const [i, [x, y, z, width, height, depth]] of crowns.entries()) {
    const base = new THREE.Vector3(x * .09, -.035, z * .09);
    const elbow = new THREE.Vector3(x * .38, y * .47, z * .42);
    const tip = new THREE.Vector3(x, y, z);
    for (const [a, b, radius, taper] of [[base, elbow, .025, .015], [elbow, tip, .015, .004]] as const) {
      const stem = branch(a, b, radius, taper), color = new Float32Array(stem.attributes.position.count * 3);
      for (let n = 0; n < color.length; n += 3) { color[n] = .92; color[n + 1] = .77; color[n + 2] = .55; }
      stem.setAttribute('color', new THREE.BufferAttribute(color, 3)); parts.push(stem);
    }
    // The two main crowns carry richer facets; three smaller shoulders break
    // the outline. Matching duplicated vertices keep each envelope closed.
    const crown = new THREE.IcosahedronGeometry(1, i < 2 ? 1 : 0); crown.deleteAttribute('uv');
    const positions = crown.getAttribute('position'), color = new Float32Array(positions.count * 3);
    const phase = i * 2.399 + rng() * .4;
    for (let n = 0; n < positions.count; n++) {
      const px = positions.getX(n), py = positions.getY(n), pz = positions.getZ(n);
      const shoulder = 1 + Math.sin(px * 3.4 + pz * 2.1 + phase) * .13 + Math.cos(py * 4.2 - phase) * .06;
      positions.setXYZ(n, x + px * width * shoulder + py * .08,
        y + py * height * (1 + Math.sin(px * 3 + phase) * .10), z + pz * depth * shoulder);
      const shade = .80 + (py + 1) * .10 + Math.sin(px * 2.7 + pz * 3.4 + phase) * .035;
      color[n * 3] = shade; color[n * 3 + 1] = shade; color[n * 3 + 2] = shade * .94;
    }
    crown.setAttribute('color', new THREE.BufferAttribute(color, 3)); crown.computeVertexNormals(); parts.push(crown);
  }
  const geometry = merge(parts); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { kind: 'quail-plum-refuge', shoots: 5, triangles: geometry.attributes.position.count / 3 };
  return geometry;
}
