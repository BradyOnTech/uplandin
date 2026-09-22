import * as THREE from 'three';

export type SharptailGrassKind = 'short' | 'medium' | 'stalk' | 'cover';
export type SharptailGrassDetail = 'field' | 'mobile' | 'distant';

/** Northern prairie bunches: interleaved bowed leaves grow through low old
 * grass, with flowering panicles confined to separate taller silhouettes.
 * Field geometry spends its triangles on the curved leaf profile; distant
 * cover keeps the same roots and height envelope with simple folded ribbons.
 * Roots stay at uv.y=0, tips at 1; dry basal litter barely moves in the wind. */
export function sharptailGrassGeometry(
  kind: SharptailGrassKind, detail: SharptailGrassDetail = 'field',
): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  const near = detail !== 'distant';
  type Point = readonly [number, number, number];
  const vertex = (p: Point, id: number, stage: number, dry: boolean, facet: number) => {
    positions.push(...p);
    const shade = (.40 + stage * .56) * facet;
    if (dry) colors.push(.62 * facet, .55 * facet, .37 * facet);
    else colors.push(shade, shade * 1.015, shade * (.89 + stage * .06));
    uvs.push((id * .6180339) % 1, stage);
  };
  const triangle = (a: Point, b: Point, c: Point, id: number, stages: readonly number[], dry = false, facet = 1) => {
    vertex(a, id, stages[0], dry, facet); vertex(b, id, stages[1], dry, facet); vertex(c, id, stages[2], dry, facet);
  };
  const leaf = (x: number, z: number, angle: number, height: number, reach: number, width: number, id: number) => {
    const dx = Math.sin(angle), dz = Math.cos(angle);
    const section = (distance: number, y: number, half: number, twist: number): [Point, Point] => {
      const wx = Math.cos(angle + twist) * half, wz = -Math.sin(angle + twist) * half;
      const cx = x + dx * distance + y * .17, cz = z + dz * distance;
      return [[cx - wx, y, cz - wz], [cx + wx, y, cz + wz]];
    };
    const base: Point = [x, 0, z];
    const knee = .69 + (id % 3) * .07;
    const [upperL, upperR] = section(reach * .58, height * knee, width * .64, .32);
    // Alternating leaves droop after the shoulder rather than ending in
    // upward daggers. The rare near-upright blade interrupts that canopy.
    const droop = id % 4 === 0 ? .94 : id % 4 === 1 ? .46 : .60;
    const tip: Point = [x + dx * reach + height * .22, height * droop, z + dz * reach];
    if (near) {
      const [lowerL, lowerR] = section(reach * .18, height * .33, width, -.16);
      triangle(base, lowerR, lowerL, id, [0, .28, .28], false, .94);
      triangle(lowerL, lowerR, upperL, id, [.28, .28, .72], false, .96);
      triangle(lowerR, upperR, upperL, id, [.28, .72, .72], false, 1.04);
      triangle(upperL, upperR, tip, id, [.72, .72, 1], false, 1.02);
    } else {
      // Wider retained ribbons keep the far stand solid without alpha cards.
      triangle(base, upperR, upperL, id, [0, .72, .72], false, .97);
      triangle(upperL, upperR, tip, id, [.72, .72, 1], false, 1.03);
    }
  };
  const litter = (x: number, z: number, angle: number, length: number, id: number) => {
    const dx = Math.sin(angle), dz = Math.cos(angle), wx = dz * .045, wz = -dx * .045;
    const root: Point = [x, 0, z];
    const left: Point = [x + dx * length * .45 - wx, .045, z + dz * length * .45 - wz];
    const right: Point = [x + dx * length * .45 + wx, .057, z + dz * length * .45 + wz];
    const tip: Point = [x + dx * length, .018, z + dz * length];
    triangle(root, right, left, id, [0, .045, .045], true, .82);
    triangle(left, right, tip, id, [.045, .045, .08], true, .94);
  };
  const culm = (x: number, z: number, angle: number, height: number, id: number) => {
    const dx = Math.sin(angle), dz = Math.cos(angle), wx = dz * .006, wz = -dx * .006;
    const reach = .14 + (id % 3) * .04;
    const a: Point = [x + dx * reach * .42 - wx, height * .63, z + dz * reach * .42 - wz];
    const b: Point = [x + dx * reach * .42 + wx, height * .63, z + dz * reach * .42 + wz];
    const tip: Point = [x + dx * reach, height, z + dz * reach];
    triangle([x, 0, z], a, b, id, [0, .63, .63]);
    triangle(a, tip, b, id, [.63, 1, .63]);
    const spikes = near ? 5 : 3;
    for (let spike = 0; spike < spikes; spike++) {
      const turn = angle + (spike % 2 ? -.9 : 1.2), length = .052 + (spike % 3) * .018;
      const cx = tip[0] - dx * .035, cz = tip[2] - dz * .035, sy = height * (.77 + spike * .04);
      const end: Point = [cx + Math.sin(turn) * length, sy + .045, cz + Math.cos(turn) * length];
      triangle([cx - wx, sy, cz - wz], [cx + wx, sy, cz + wz], end, id, [.8, .8, 1], true);
    }
  };
  const bunch = (x: number, z: number, height: number, count: number, id: number, spread: number) => {
    const retained = near ? count : Math.min(3, count);
    for (let blade = 0; blade < retained; blade++) {
      const index = near ? blade : Math.floor(blade * count / retained);
      // These interior leaves add overlap, not silhouette. Lite retains
      // every basal bunch, all low litter, and the exact field bounds while
      // returning four/eight triangles from medium/cover foreground mats.
      if (detail === 'mobile' && ((kind === 'medium' && id === 1 && index === 2) ||
        (kind === 'cover' && (id === 0 || id === 2) && index === 3))) continue;
      const turn = index * 2.399 + id * .67;
      const length = index === 0 ? 1 : .60 + ((index * 3 + id) % 5) * .095;
      leaf(x + Math.sin(turn) * .055, z + Math.cos(turn) * .055, turn,
        height * length, spread * (.82 + (index % 3) * .15),
        (.027 + (index % 3) * .006) * (detail === 'distant' ? 1.45 : 1), id * 8 + index);
    }
    const deadLeaves = near ? 2 : 1;
    for (let i = 0; i < deadLeaves; i++) litter(x, z, .52 + id * 1.31 + i * 2.4, spread * 1.26, 100 + id * 3 + i);
  };

  if (kind === 'cover') {
    const roots = [[-.39, -.27, .59], [.20, -.31, .78], [-.19, .26, .45], [.37, .22, .66]];
    for (const [id, [x, z, height]] of roots.entries()) bunch(x, z, height, id % 2 ? 4 : 5, id, .39);
    culm(.20, -.31, .72, .98, 30); culm(-.39, -.27, 1.03, .81, 31);
  } else if (kind === 'stalk') {
    bunch(-.05, .01, .42, 5, 2, .32);
    culm(-.09, .015, .8, 1.04, 7); culm(.035, -.03, 1.05, .84, 8); culm(.09, .065, .53, .93, 9);
  } else if (kind === 'medium') {
    // Three interleaved roots form a broad coherent mat rather than one
    // upright plant per lattice site. Tall seed heads live in other batches.
    bunch(-.18, -.09, .69, 4, 1, .38);
    bunch(.17, .08, .49, 3, 4, .36);
    bunch(-.02, .22, .38, 3, 7, .40);
  } else {
    bunch(-.10, -.035, .43, 4, 0, .32);
    bunch(.12, .09, .28, 3, 3, .34);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius *= 1.2;
  geometry.userData = { kind: `sharptail-native-${kind}`, detail, triangles: positions.length / 9 };
  return geometry;
}
