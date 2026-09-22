import * as THREE from 'three';

export type SharptailGrassKind = 'short' | 'medium' | 'stalk' | 'cover';

/** Mixed northern prairie: folded basal leaves carry the mass, with only a
 * few flowering culms above it. The asymmetric, wind-combed bunches retain
 * pinned uv.y=0 roots and uv.y=1 tips for the shared wind/parting shader.
 * All four silhouettes fit the existing instanced batches; no alpha cards. */
export function sharptailGrassGeometry(kind: SharptailGrassKind): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  type Point = readonly [number, number, number];
  const vertex = (p: Point, id: number, stage: number, facet: number, seed = false) => {
    positions.push(...p);
    const shade = (.48 + stage * .48) * facet;
    colors.push(shade, shade * (seed ? .96 : 1), shade * (seed ? .82 : .94));
    uvs.push((id * .6180339) % 1, stage);
  };
  const triangle = (a: Point, b: Point, c: Point, id: number, stages: readonly number[], facet = 1, seed = false) => {
    vertex(a, id, stages[0], facet, seed); vertex(b, id, stages[1], facet, seed); vertex(c, id, stages[2], facet, seed);
  };
  const leaf = (x: number, z: number, angle: number, height: number, reach: number, width: number, id: number) => {
    // A shallow folded ridge catches a broad light plane at low viewing
    // angles. Unequal knees and drooping tips avoid upright cereal spikes.
    const dx = Math.sin(angle), dz = Math.cos(angle), wx = dz * width, wz = -dx * width;
    const knee = .49 + (id % 3) * .055;
    const cx = x + dx * reach * .34 + height * .08, cz = z + dz * reach * .34;
    const root: Point = [x, 0, z];
    const left: Point = [cx - wx, height * knee, cz - wz];
    const right: Point = [cx + wx, height * knee, cz + wz];
    const fold: Point = [cx + dx * width * .35, height * (knee + .07), cz + dz * width * .35];
    const tip: Point = [x + dx * reach + height * .19, height * (.69 + (id % 4) * .10), z + dz * reach];
    triangle(root, left, fold, id, [0, knee, knee], .94);
    triangle(root, fold, right, id, [0, knee, knee], 1.04);
    triangle(left, tip, fold, id, [knee, 1, knee], .94);
    triangle(fold, tip, right, id, [knee, 1, knee], 1.04);
  };
  const culm = (x: number, z: number, angle: number, height: number, id: number) => {
    const dx = Math.sin(angle), dz = Math.cos(angle), wx = dz * .006, wz = -dx * .006;
    const reach = .085 + (id % 3) * .025;
    const left: Point = [x + dx * reach * .45 - wx, height * .62, z + dz * reach * .45 - wz];
    const right: Point = [x + dx * reach * .45 + wx, height * .62, z + dz * reach * .45 + wz];
    const tip: Point = [x + dx * reach, height, z + dz * reach];
    triangle([x, 0, z], left, right, id, [0, .62, .62]);
    triangle(left, tip, right, id, [.62, 1, .62]);
    // A loose nodding panicle: three small, unequal blades, never a club.
    for (let spike = 0; spike < 3; spike++) {
      const side = spike % 2 ? -1 : 1;
      const sy = height * (.89 + spike * .033);
      const cx = tip[0] - dx * .015, cz = tip[2] - dz * .015;
      triangle([cx - wx, sy, cz - wz], [cx + wx, sy, cz + wz],
        [cx + dz * side * (.025 + spike * .006), sy + .05, cz - dx * side * (.025 + spike * .006)],
        id, [.89, .89, 1], 1, true);
    }
  };
  const bunch = (x: number, z: number, height: number, count: number, id: number, spread: number) => {
    for (let blade = 0; blade < count; blade++) {
      const turn = blade * 2.399 + id * .67;
      const scale = .65 + ((blade * 3 + id) % 5) * .10;
      leaf(x + Math.sin(turn) * .045, z + Math.cos(turn) * .045, turn,
        height * scale, spread * (.73 + (blade % 3) * .16), .021 + (blade % 3) * .007, id * 7 + blade);
    }
  };

  if (kind === 'cover') {
    // Four overlapping rooted bunches replace six evenly tall thin sprays.
    const roots = [[-.34, -.22, .46], [.17, -.30, .65], [-.12, .25, .38], [.34, .19, .57]];
    for (const [id, [x, z, height]] of roots.entries()) bunch(x, z, height, 4, id, .23);
    culm(.17, -.30, .72, .89, 30);
    culm(-.34, -.22, 1.03, .69, 31);
  } else if (kind === 'stalk') {
    bunch(0, 0, .37, 4, 2, .18);
    culm(-.045, .015, .8, .92, 7);
    culm(.035, -.03, 1.05, .72, 8);
    culm(.06, .045, .53, .81, 9);
  } else if (kind === 'medium') {
    bunch(-.055, .025, .60, 4, 1, .24);
    bunch(.09, -.06, .40, 3, 4, .23);
    culm(-.055, .025, .8, .69, 20);
  } else {
    bunch(0, 0, .43, 6, 0, .19);
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
  geometry.userData = { kind: `sharptail-native-${kind}`, triangles: positions.length / 9 };
  return geometry;
}
