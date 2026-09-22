import * as THREE from 'three';

/** Northern mixed-grass blades keep their reach close to the culm, with a
 * few taller seed stems. These are deliberately narrower and more upright
 * than Quail's spreading warm-season leaf fans. All variants retain the
 * existing instance/material path and its UV-based wind/parting contract. */
export function sharptailGrassGeometry(kind: 'short' | 'stalk' | 'cover'): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  type Point = readonly [number, number, number];
  const vertex = (p: Point, id: number, stage: number, seed = false) => {
    positions.push(...p);
    const shade = .60 + stage * .36;
    colors.push(shade, shade * (seed ? .96 : 1), shade * (seed ? .83 : .95));
    uvs.push((id * .6180339) % 1, stage);
  };
  const triangle = (a: Point, b: Point, c: Point, id: number, stages: readonly number[], seed = false) => {
    vertex(a, id, stages[0], seed); vertex(b, id, stages[1], seed); vertex(c, id, stages[2], seed);
  };
  const leaf = (x: number, z: number, angle: number, height: number, reach: number, width: number, id: number, tipStage = .81 + (id % 3) * .065, bladeBody = true) => {
    // A broader sheath and lower waist keep the rooted leaf mass visible
    // on a phone. The same narrow tip and short reach preserve the upright
    // prairie silhouette; culms retain their slim near-vertical section.
    const bodyWidth = width * (bladeBody ? 1.65 : 1);
    const rootWidth = bladeBody ? .66 : .38;
    const waist = bladeBody ? .52 : .68;
    const dx = Math.sin(angle), dz = Math.cos(angle), wx = dz * bodyWidth, wz = -dx * bodyWidth;
    const a: Point = [x - wx * rootWidth, 0, z - wz * rootWidth];
    const b: Point = [x + wx * rootWidth, 0, z + wz * rootWidth];
    const c: Point = [x + dx * reach * .40 - wx, height * waist, z + dz * reach * .40 - wz];
    const d: Point = [x + dx * reach * .40 + wx, height * waist, z + dz * reach * .40 + wz];
    const tip: Point = [x + dx * reach, height * tipStage, z + dz * reach];
    triangle(a, b, c, id, [0, 0, waist]);
    triangle(b, d, c, id, [0, waist, waist]);
    triangle(c, d, tip, id, [waist, waist, 1]);
  };
  const culm = (x: number, z: number, angle: number, height: number, id: number, withSeed: boolean) => {
    // A narrow two-section stem stays vertical below a slight nod at the tip.
    const reach = .035 + (id % 3) * .012;
    leaf(x, z, angle, height, reach, .0045, id, 1, false);
    if (!withSeed) return;
    const dx = Math.sin(angle), dz = Math.cos(angle);
    const cx = x + dx * reach * .8, cz = z + dz * reach * .8;
    const baseY = height * .89, topY = height * 1.02;
    // Two angled seed spikelets remain tiny upright accents, not cattail
    // clubs or the large three-fingered heads of the Quail grass kit.
    for (let side = -1; side <= 1; side += 2) {
      const angle2 = angle + side * .7, wx = Math.cos(angle2) * .007, wz = -Math.sin(angle2) * .007;
      triangle([cx - wx, baseY, cz - wz], [cx + wx, baseY, cz + wz],
        [cx + Math.sin(angle2) * .025, topY, cz + Math.cos(angle2) * .025], id, [.89, .89, 1], true);
    }
  };

  if (kind === 'cover') {
    const roots = [[-.48, -.28], [-.09, -.45], [.41, -.30], [-.32, .28], [.08, .09], [.48, .38]];
    for (const [tuft, [x, z]] of roots.entries()) {
      const yaw = tuft * 2.399;
      for (let blade = 0; blade < 3; blade++) {
        leaf(x, z, yaw + blade * 2.08, .35 + ((tuft * 5 + blade * 3) % 7) * .045,
          .085 + blade * .025, .008 + (tuft % 2) * .002, tuft * 5 + blade);
      }
      culm(x + .015, z - .012, yaw + .5, .67 + (tuft % 3) * .09, tuft * 5 + 3, tuft % 2 === 0);
    }
  } else if (kind === 'stalk') {
    for (let stem = 0; stem < 5; stem++) {
      const angle = stem * 2.399, radius = .045 + (stem % 2) * .035;
      culm(Math.sin(angle) * radius, Math.cos(angle) * radius, angle,
        .61 + (stem % 3) * .11, stem, true);
    }
    for (let blade = 0; blade < 3; blade++) leaf(0, 0, blade * 2.2, .30 + blade * .04, .12, .01, blade + 7);
  } else {
    for (let blade = 0; blade < 6; blade++) {
      const angle = blade * 2.399, radius = .025 + (blade % 3) * .025;
      leaf(Math.sin(angle) * radius, Math.cos(angle) * radius, angle,
        .19 + (blade % 4) * .038, .075 + (blade % 3) * .025, .008 + (blade % 2) * .003, blade);
    }
    culm(-.025, .02, .45, .36, 8, true);
    culm(.03, -.015, 2.5, .30, 9, false);
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
