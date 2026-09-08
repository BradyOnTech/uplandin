import * as THREE from 'three';
import { mulberry32 } from '../../game/math';

/** Metres in the clump's basal plane; every detail level retains all six tufts. */
export const QUAIL_GRASS_TUFT_ROOTS: ReadonlyArray<readonly [number, number]> = [
  [-0.54, -0.30], [-0.10, -0.53], [0.43, -0.37],
  [-0.36, 0.29], [0.10, 0.12], [0.53, 0.43],
];

/**
 * An irregular patch of six full rooted bunches, with leaves that rise and bow
 * outwards. The tall near/mid/far budgets are 234/78/45 triangles; short grass is 216/60/36. Lower detail keeps
 * the same basal roots, blade seeds, crown heights and tips; wider paired leaves
 * retain the tuft's coverage without replacing it with an upright triangle fan.
 *
 * quailBlade = (basal X, basal Z, stable leaf ID, lengthwise stage). Basal vertices
 * are exactly Y=0 and are shared within each tuft, so both shader variation and
 * height-driven wind leave all six roots pinned. Placement must fit this wider
 * basal plane to the ground; instance translation alone does not follow a slope.
 */
export function quailGrassClumpGeometry(
  tall: boolean, detail: 'near' | 'mid' | 'far' = 'near',
): THREE.BufferGeometry {
  const positions: number[] = []; const colors: number[] = []; const blades: number[] = [];
  const heights = tall ? [0.88, 0.69, 0.94, 0.56, 0.84, 0.74] : [0.29, 0.23, 0.31, 0.18, 0.27, 0.22];
  const leafCounts = detail === 'near' ? [10, 8, 10, 9, 9, 8] : Array(6).fill(detail === 'mid' ? 5 : 3);
  // Three principal leaves span each tuft in all directions. Additional leaves
  // cross behind them at unequal heights, making a bunch rather than a fork.
  const turns = [0, 2.18, -2.24, 0.91, -1.12, 0.48, -0.58, 2.83, -2.78, 1.58];
  const length = [1, 0.90, 0.61, 0.74, 0.46, 0.37, 0.65, 0.51, 0.44, 0.59];
  const reach = [0.43, 0.39, 0.46, 0.31, 0.37, 0.40, 0.36, 0.45, 0.29, 0.43];
  const vertex = (point: readonly number[], root: readonly number[], id: number, stage: number) => {
    positions.push(...point); blades.push(root[0], root[1], id, stage);
    // The dark shared sheaths join the litter; exposed leaves catch the light.
    const dry = id % 7 === 3 ? 0.065 : 0;
    colors.push(0.35 + stage * 0.60 + dry, 0.40 + stage * 0.55 - dry * 0.3, 0.24 + stage * 0.53 - dry);
  };
  const triangle = (points: readonly number[][], root: readonly number[], id: number, stages: readonly number[]) => {
    points.forEach((point, i) => vertex(point, root, id, stages[i]));
  };

  QUAIL_GRASS_TUFT_ROOTS.forEach((root, tuft) => {
    const outward = Math.atan2(root[0], root[1]);
    for (let leaf = 0; leaf < leafCounts[tuft]; leaf++) {
      const id = tuft * 16 + leaf;
      const shape = 0.5 + Math.sin(tuft * 1.73 + leaf * 2.31) * 0.5;
      const azimuth = outward + turns[leaf] + Math.sin(tuft * 2.1 + leaf * 1.7) * 0.24;
      const dx = Math.sin(azimuth); const dz = Math.cos(azimuth);
      const peak = tuft === 2 && leaf === 0;
      const height = Math.max(tall ? 0.24 : 0.10, heights[tuft] * length[leaf] * (peak ? 1 : 0.74 + shape * 0.26));
      // Sparse flowering culms interrupt the leaf fans. Retaining leaf zero in
      // every LOD keeps these vertical accents in place across distance changes.
      const culm = tall && tuft % 2 === 0 && leaf === 0;
      const extent = reach[leaf] * (0.90 + (tuft % 3) * 0.045) * (culm ? 0.19 : tall ? 0.83 : 0.79);
      const halfWidth = (culm ? 0.006 : 0.018) * (0.82 + ((tuft + leaf * 2) % 4) * 0.11);
      const crownWidth = halfWidth * (detail === 'near' ? 0.46 : detail === 'mid' ? 1.10 : 1.50);
      const section = (distance: number, y: number, width: number, twist: number): number[][] => {
        const wx = Math.cos(azimuth + twist) * width; const wz = -Math.sin(azimuth + twist) * width;
        const x = root[0] + dx * distance; const z = root[1] + dz * distance;
        return [[x - wx, y, z - wz], [x + wx, y, z + wz]];
      };
      const base = [root[0], 0, root[1]];
      const bendStage = culm ? 0.87 : 0.72 + shape * 0.17;
      const [upperLeft, upperRight] = section(extent * (culm ? 0.82 : 0.51 + shape * 0.15), height * bendStage, culm ? crownWidth * 2.5 : crownWidth, 0.12 + shape * 0.32);
      // Different retained leaves have a shallow nod and a stronger droop. The
      // bend moves along each leaf instead of making every crown the same knee.
      const tipStage = peak || culm ? 1 : leaf % 5 === 2 ? 0.54 + shape * 0.09 : leaf % 5 === 3 ? 0.38 + shape * 0.12 : 0.83 + shape * 0.10;
      const tip = [root[0] + dx * extent, height * tipStage, root[1] + dz * extent];
      if (detail === 'near') {
        const [lowerLeft, lowerRight] = section(extent * (culm ? 0.68 : 0.13 + shape * 0.09), height * (culm ? 0.76 : 0.31 + shape * 0.14), halfWidth * (culm ? 0.38 : 0.77), -0.18 + shape * 0.21);
        triangle([base, lowerRight, lowerLeft], root, id, [0, 0.24, 0.24]);
        triangle([lowerLeft, lowerRight, upperLeft], root, id, [0.24, 0.24, 0.72]);
        triangle([lowerRight, upperRight, upperLeft], root, id, [0.24, 0.72, 0.72]);
      } else {
        triangle([base, upperRight, upperLeft], root, id, [0, 0.72, 0.72]);
      }
      triangle([upperLeft, upperRight, tip], root, id, [0.72, 0.72, 1]);
      if (culm) {
        // The three-fingered seed head makes upright culms read as mature
        // prairie grass. Its anchors and tips survive each detail switch.
        for (let finger = 0; finger < 3; finger++) {
          const angle = azimuth + (finger - 1) * .88;
          const length = .085 + finger * .019;
          const start = [tip[0], tip[1] - .025, tip[2]];
          const end = [tip[0] + Math.sin(angle) * length, tip[1] + .055 + finger * .018, tip[2] + Math.cos(angle) * length];
          const half = detail === 'far' ? .009 : .006;
          const left = [start[0] + Math.cos(angle) * half, start[1], start[2] - Math.sin(angle) * half];
          const right = [start[0] - Math.cos(angle) * half, start[1], start[2] + Math.sin(angle) * half];
          if (detail === 'far') triangle([left, right, end], root, id, [.94, .94, 1]);
          else {
            const shoulder = [(start[0] + end[0]) * .5 + Math.cos(angle) * half, (start[1] + end[1]) * .5, (start[2] + end[2]) * .5 - Math.sin(angle) * half];
            triangle([left, right, shoulder], root, id, [.94, .94, .98]);
            triangle([right, end, shoulder], root, id, [.94, 1, .98]);
          }
        }
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('quailBlade', new THREE.Float32BufferAttribute(blades, 4));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius *= 1.35;
  geometry.userData = { kind: 'quail-bunchgrass', detail, tall, tufts: 6, triangles: positions.length / 9 };
  return geometry;
}

/** Three loose basal fans, with low arching leaves between the upright blades. */
export function quailGrassGeometry(tall: boolean, simple = false): THREE.BufferGeometry {
  const positions: number[] = []; const colors: number[] = []; const blades: number[] = [];
  const rng = mulberry32(tall ? 619 : 192);
  const count = simple ? 3 : tall ? 11 : 9;
  const roots = [[-0.19, -0.07], [0.13, 0.09], [-0.02, 0.23]];
  const triangle = (a: number[], b: number[], c: number[], root: number[], id: number, stages: number[]) => {
    for (const [n, p] of [a, b, c].entries()) {
      positions.push(...p); const t = stages[n];
      // Muted leaf sheaths meet the litter; the exposed tips catch more light.
      colors.push(0.54 + t * 0.46, 0.62 + t * 0.38, 0.42 + t * 0.50);
      blades.push(root[0], root[1], id, t);
    }
  };
  for (let i = 0; i < count; i++) {
    const low = !simple && i % 3 === 0;
    const az = i * 2.399 + rng() * 0.9;
    const height = (tall ? 0.70 : 0.30) * (0.52 + rng() * 0.60) * (low ? 0.42 : 1);
    const width = (simple ? 0.027 : low ? 0.025 : tall ? 0.014 : 0.018) * (0.75 + rng() * 0.55);
    const reach = (low ? 0.33 : tall ? 0.13 : 0.20) * (0.65 + rng() * 0.60);
    const root = roots[i % roots.length]; const ox = root[0] + (rng() - 0.5) * 0.13; const oz = root[1] + (rng() - 0.5) * 0.13;
    const vx = Math.cos(az) * width; const vz = -Math.sin(az) * width;
    const mx = ox + Math.sin(az) * reach * 0.40; const mz = oz + Math.cos(az) * reach * 0.40;
    const top = [ox + Math.sin(az) * reach, height * (low ? 0.52 : 1), oz + Math.cos(az) * reach];
    const a = [ox - vx * 0.55, -0.045, oz - vz * 0.55]; const b = [ox + vx * 0.55, -0.045, oz + vz * 0.55];
    const c = [mx - vx, height * (low ? 1 : 0.55), mz - vz]; const d = [mx + vx, height * (low ? 1 : 0.55), mz + vz];
    const origin = [ox, oz];
    if (simple) triangle(a, b, top, origin, i, [0, 0, 1]);
    else {
      triangle(a, b, c, origin, i, [0, 0, 0.55]); triangle(b, d, c, origin, i, [0, 0.55, 0.55]);
      triangle(c, d, top, origin, i, [0.55, 0.55, 1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('quailBlade', new THREE.Float32BufferAttribute(blades, 4));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  // The shader changes reach/height and adds wind beyond the resting vertices.
  geometry.boundingSphere!.radius *= 1.35;
  return geometry;
}

/** Stable variation from the plant's rotation/scale, independent of the selected drop. */
export const QUAIL_GRASS_VARIATION = `
#ifdef USE_INSTANCING
  float plantSeed = dot(vec2(instanceMatrix[0][0], instanceMatrix[0][2]), vec2(127.1, 311.7));
  float bladeSeed = fract(sin(plantSeed + quailBlade.z * 74.7) * 43758.5453);
  float bladeTurn = (bladeSeed - 0.5) * 0.95;
  float bladeCos = cos(bladeTurn); float bladeSin = sin(bladeTurn);
  vec2 leaf = transformed.xz - quailBlade.xy;
  transformed.xz = quailBlade.xy + mat2(bladeCos, -bladeSin, bladeSin, bladeCos) * leaf * (0.80 + bladeSeed * 0.42);
  transformed.y *= 0.76 + bladeSeed * 0.44;
#endif`;
