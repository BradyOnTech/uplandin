import * as THREE from 'three';

/**
 * Water standing in a real hollow of the terrain: a flat surface clipped to
 * exactly where the ground lies below the water line (so it never floats
 * over a rise or hangs off a bank), and a wet margin draped on the ground
 * around it. Works with the prairie water shader's radial uv: shallow water
 * reads as the shore, depth as open water.
 */
export interface PondedWaterOptions {
  /** World centre and horizontal half-extents in metres. */
  x: number; z: number; rx: number; rz: number; angle: number;
  heightAt(x: number, z: number): number;
  /** A fixed water line, or the fraction of the hollow to flood. */
  level?: number; fill?: number;
  /** Excludes ground (a dam's downstream side, say). */
  include?(x: number, z: number): boolean;
  /** Metres of water over which the shore shading fades to open water. */
  shoreDepth?: number;
  /** How far toward the shore colour the deepest water stays (0 = open water). */
  openWater?: number;
  /** A ragged outline following low spots, for sheet water. */
  ragged?: boolean;
  cell?: number;
  wetColor?: number; wetReach?: number; wetOpacity?: number;
}

export interface PondedWater {
  surface: THREE.Mesh;
  margin: THREE.Mesh;
  level: number;
  resources: (THREE.BufferGeometry | THREE.Material)[];
  /** Depth of water at a world point, zero on dry ground. */
  depthAt(x: number, z: number): number;
}

export function createPondedWater(material: THREE.Material, options: PondedWaterOptions): PondedWater | undefined {
  const { x: cx, z: cz, rx, rz, heightAt } = options;
  const cos = Math.cos(options.angle), sin = Math.sin(options.angle);
  const cell = options.cell ?? .7, span = 1.25;
  const nu = Math.ceil(rx * 2 * span / cell), nv = Math.ceil(rz * 2 * span / cell);
  const grid: { x: number; z: number; ground: number; edge: number; inside: boolean }[] = [];
  const heights: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = (i / nu - .5) * rx * 2 * span, v = (j / nv - .5) * rz * 2 * span;
    const x = cx + u * cos - v * sin, z = cz + u * sin + v * cos;
    let edge = Math.hypot(u / rx, v / rz);
    if (options.ragged) {
      const a = Math.atan2(v / rz, u / rx);
      edge /= 1 + Math.sin(a * 3 + 1.1) * .12 + Math.sin(a * 7) * .06;
    }
    const inside = options.include?.(x, z) ?? true;
    const ground = heightAt(x, z);
    grid.push({ x, z, ground, edge, inside });
    if (edge < 1 && inside) heights.push(ground);
  }
  if (!heights.length) return undefined;
  heights.sort((a, b) => a - b);
  const level = options.level ?? heights[Math.floor(heights.length * (options.fill ?? .55))] + .02;
  const shoreDepth = options.shoreDepth ?? .1, open = options.openWater ?? .55;
  const index = (i: number, j: number) => j * (nu + 1) + i;
  const water: number[] = [], waterUv: number[] = [], mud: number[] = [], mudColor: number[] = [];
  const wet = new THREE.Color(options.wetColor ?? 0x4a4130), reach = options.wetReach ?? .3, opacity = options.wetOpacity ?? .62;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const quad = [index(i, j), index(i + 1, j), index(i + 1, j + 1), index(i, j + 1)];
    for (const tri of [[0, 2, 1], [0, 3, 2]]) {
      const points = tri.map(k => grid[quad[k]]);
      if (points.every(g => g.edge > span)) continue;
      if (points.some(g => g.inside && g.edge < 1.1 && g.ground < level + .01)) for (const g of points) {
        const shore = Math.max(1 - THREE.MathUtils.smoothstep(level - g.ground, 0, shoreDepth),
          THREE.MathUtils.smoothstep(g.edge, .8, 1.1), g.inside ? 0 : 1);
        water.push(g.x - cx, 0, g.z - cz);
        waterUv.push(.5 + .5 * (open + (1 - open) * shore), .5);
      }
      for (const g of points) {
        const damp = (1 - THREE.MathUtils.smoothstep(g.ground - level, -.02, reach)) * (1 - THREE.MathUtils.smoothstep(g.edge, .95, span))
          * (g.inside ? 1 : .35);
        mud.push(g.x - cx, g.ground + .025 - level, g.z - cz);
        mudColor.push(wet.r, wet.g, wet.b, damp * opacity);
      }
    }
  }
  if (!water.length) return undefined;
  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(water, 3));
  waterGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(waterUv, 2));
  waterGeometry.computeVertexNormals();
  const surface = new THREE.Mesh(waterGeometry, material);
  surface.position.set(cx, level, cz); surface.receiveShadow = true; surface.renderOrder = -1;
  const mudGeometry = new THREE.BufferGeometry();
  mudGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mud, 3));
  mudGeometry.setAttribute('color', new THREE.Float32BufferAttribute(mudColor, 4));
  mudGeometry.computeVertexNormals();
  const mudMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: .45,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const margin = new THREE.Mesh(mudGeometry, mudMaterial);
  margin.position.set(cx, level, cz); margin.receiveShadow = true; margin.renderOrder = -2;
  const include = options.include;
  return {
    surface, margin, level, resources: [waterGeometry, mudGeometry, mudMaterial],
    depthAt(x: number, z: number): number {
      const dx = x - cx, dz = z - cz, u = dx * cos + dz * sin, v = -dx * sin + dz * cos;
      if (Math.hypot(u / rx, v / rz) > 1.1 || (include && !include(x, z))) return 0;
      return Math.max(0, level - heightAt(x, z));
    },
  };
}
