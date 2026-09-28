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

/** Three-sided tapered wood is enough for these small, visible branchlets.
 * The separate tree kit retains its existing five-sided trunk geometry. */
function twig(a: THREE.Vector3, b: THREE.Vector3, radius: number, tip: number,
  dark: readonly number[], light: readonly number[]): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(tip, radius, a.distanceTo(b), 3, 1, true).toNonIndexed();
  geometry.deleteAttribute('uv');
  const positions = geometry.getAttribute('position'), colors: number[] = [];
  for (let i = 0; i < positions.count; i++) colors.push(...(positions.getY(i) > 0 ? light : dark));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
}

/** Four broad facets make a folded leaf spray, with a shaded centre and
 * silver edges. It has no closed polygonal shell pretending to be foliage. */
function sageLeaf(base: THREE.Vector3, direction: THREE.Vector3, length: number, width: number, variant: number): THREE.BufferGeometry {
  const axis = direction.clone().normalize();
  const side = new THREE.Vector3(-axis.z, 0, axis.x).normalize();
  const lift = new THREE.Vector3().crossVectors(side, axis).normalize();
  const middle = base.clone().addScaledVector(axis, length * .56);
  const points = [base,
    middle.clone().addScaledVector(side, -width).addScaledVector(lift, -.009),
    base.clone().addScaledVector(axis, length),
    middle.clone().addScaledVector(side, width * .86).addScaledVector(lift, -.012),
    middle.clone().addScaledVector(lift, .008)];
  const tint = .93 + Math.sin(variant * 2.17) * .07;
  const shades = [[.38, .43, .32], [.89, .94, .82], [.94, .98, .88], [.80, .86, .73], [.62, .71, .55]];
  const positions: number[] = [], colors: number[] = [];
  for (const i of [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]) {
    positions.push(points[i].x, points[i].y, points[i].z);
    colors.push(...shades[i].map(channel => channel * tint));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); return geometry;
}

/** Six unequal woody shoots carry overlapping small leaf sprays. Broad
 * silver-edged leaves preserve a distant colony's mass, while visible forks
 * and gaps through the crown distinguish sage from rounded Quail bushes. */
export function sharptailShrubGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const root = new THREE.Vector3(0, 0, 0), fork = new THREE.Vector3(.015, .19, -.02);
  const dark = [.30, .25, .17], wood = [.56, .49, .34];
  parts.push(twig(root, fork, .018, .011, dark, wood));
  const tips = [
    [-.27, .48, -.14], [.23, .59, -.15], [-.11, .65, .13],
    [.28, .39, .16], [-.24, .34, .20], [.03, .52, -.27],
  ];
  let ordinal = 0;
  for (const [index, coordinates] of tips.entries()) {
    const tip = new THREE.Vector3(...coordinates);
    const start = index % 2 ? fork : root.clone().lerp(fork, .45);
    const junction = start.clone().lerp(tip, .48);
    const tangent = new THREE.Vector3(-tip.z, 0, tip.x).normalize().multiplyScalar(index % 2 ? -.12 : .12);
    const outer = junction.clone().lerp(tip, .66).add(tangent).add(new THREE.Vector3(0, -.035, 0));
    parts.push(twig(start, tip, .010, .003, dark, wood), twig(junction, outer, .006, .0015, wood, [.64, .59, .43]));
    for (const [shoot, end] of [[start, tip], [junction, outer]]) {
      const outward = end.clone().setY(0).normalize();
      for (let leaf = 0; leaf < 3; leaf++) {
        const base = shoot.clone().lerp(end, .54 + leaf * .20);
        const yaw = (leaf % 2 ? -.58 : .47) + index * .09;
        const direction = outward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        direction.y = .65 + leaf * .38;
        parts.push(sageLeaf(base, direction, .13 + leaf * .018, .040 + (index % 3) * .006, ordinal++));
      }
    }
  }
  // A few low leaves connect the branch heart without closing its dark gaps.
  for (let i = 0; i < 4; i++) {
    const angle = .4 + i * 2.4;
    parts.push(sageLeaf(fork.clone().add(new THREE.Vector3(Math.sin(angle) * .04, i * .025, Math.cos(angle) * .04)),
      new THREE.Vector3(Math.sin(angle), .8, Math.cos(angle)), .14, .045, ordinal++));
  }
  const geometry = merge(parts);
  geometry.userData = { kind: 'sharptail-open-sage', triangles: geometry.attributes.position.count / 3 };
  return geometry;
}

/** A small closed seed husk reads from either side of the existing one-sided
 * forb material. Its pointed vertical shape cannot become a floating disc. */
function seedHusk(top: THREE.Vector3, yaw: number, scale: number): THREE.BufferGeometry {
  const points = [new THREE.Vector3(0, -.017, 0), new THREE.Vector3(-.027, .014, -.015),
    new THREE.Vector3(.024, .013, -.012), new THREE.Vector3(.003, .040, .016)];
  const positions: number[] = [], colors: number[] = [];
  for (const [face, indices] of [[0, 1, 2], [0, 3, 1], [1, 3, 2], [2, 3, 0]].entries()) {
    const tone = [[.58, .40, .23], [.79, .59, .31], [.93, .76, .44], [.67, .46, .25]][face];
    for (const i of indices) {
      const p = points[i].clone().multiplyScalar(scale).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(top);
      positions.push(p.x, p.y, p.z); colors.push(...tone);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); return geometry;
}

/** Dry upright stalks with sparse angled branchlets and pointed seed husks.
 * All 120 triangles share the existing opaque instanced forb batch. */
export function sharptailForbGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const angle = i * 2.399, x = Math.sin(angle) * .13, z = Math.cos(angle) * .13;
    const height = .46 + i * .085, top = new THREE.Vector3(x * 1.35, height, z * 1.35);
    const base = new THREE.Vector3(x * .25, 0, z * .25), bend = base.clone().lerp(top, .55).add(new THREE.Vector3(.018, 0, -.012));
    const dark = [.45, .32, .18], light = [.73, .60, .37];
    parts.push(twig(base, bend, .005, .0036, dark, light), twig(bend, top, .0036, .0018, dark, light), seedHusk(top, angle, 1));
    for (let side = 0; side < 2; side++) {
      const attach = bend.clone().lerp(top, .22 + side * .36);
      const direction = angle + (side ? -1.15 : .95);
      const end = attach.clone().add(new THREE.Vector3(Math.sin(direction) * .09, .052 + side * .017, Math.cos(direction) * .09));
      parts.push(twig(attach, end, .0028, .0012, dark, light), seedHusk(end, direction, .78 + side * .12));
      // A little dry folded leaf stays attached below the branch, rather
      // than using another broad seed-head plate to fill the silhouette.
      const tip = attach.clone().add(new THREE.Vector3(-Math.sin(direction) * .06, -.035, -Math.cos(direction) * .06));
      const edge = attach.clone().lerp(tip, .45).add(new THREE.Vector3(Math.cos(direction) * .012, .008, -Math.sin(direction) * .012));
      const leaf = new THREE.BufferGeometry();
      leaf.setAttribute('position', new THREE.Float32BufferAttribute([
        attach.x, attach.y, attach.z, edge.x, edge.y, edge.z, tip.x, tip.y, tip.z,
        tip.x, tip.y, tip.z, edge.x, edge.y, edge.z, attach.x, attach.y, attach.z,
      ], 3));
      leaf.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [.58, .45, .25]).flat(), 3));
      leaf.computeVertexNormals(); parts.push(leaf);
    }
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
