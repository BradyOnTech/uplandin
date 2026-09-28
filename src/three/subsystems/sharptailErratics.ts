import * as THREE from 'three';
import { mulberry32 } from '../../game/math';

export interface SharptailErraticSize {
  /** Full dimensions in metres; height is measured from the center ground. */
  width: number;
  height: number;
  depth: number;
  seed: number;
}

type Point = { x: number; y: number; z: number; height: number };

/**
 * A glacial erratic: broad worn shoulders and an off-center crown, with no
 * repeated cliff strata. One static, flat-shaded vertex-color mesh (224 faces).
 *
 * groundAt receives local x/z and returns ground elevation in a consistent
 * frame. Its center elevation is subtracted here. Place the returned root at
 * that center ground elevation, and include any root yaw in the sampler.
 * The caller owns the supplied vertexColors material; the root owns geometry.
 */
export function createSharptailErratic(
  material: THREE.Material,
  groundAt: (x: number, z: number) => number,
  size: SharptailErraticSize,
): THREE.Group {
  if (![size.width, size.height, size.depth].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Sharptail erratic dimensions must be positive finite metres.');
  }
  const random = mulberry32(size.seed);
  const sides = 16;
  const phase = random() * Math.PI * 2;
  const leanX = (random() - .5) * .42;
  const leanZ = (random() - .5) * .36;
  const ground = groundAt(0, 0);
  const burial = Math.min(.34, Math.max(.14, size.height * .15));
  const rings: Point[][] = Array.from({ length: 7 }, () => []);
  const blend = (a: Point, b: Point, t: number): Point => ({
    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t, height: a.height + (b.height - a.height) * t,
  });
  const crownHeight = (x: number, z: number) => {
    const u = x * Math.cos(phase) + z * Math.sin(phase);
    const v = -x * Math.sin(phase) + z * Math.cos(phase);
    // Two broad, shallow fracture planes meet off center. A large tilted cap
    // replaces the little rounded peak that made every stone read as a dome.
    return Math.min(1 + .13 * u - .055 * v, 1.01 - .085 * u + .035 * v);
  };
  const top: Point = { x: leanX, y: crownHeight(leanX, leanZ), z: leanZ, height: 1 };
  // The widest contour is buried, not floating above a narrow foot. Squared,
  // worn corners and a coherent unequal planform distinguish a carried slab
  // of granite from a flattened sphere without using boxes or jagged noise.
  const angles = Array.from({ length: sides }, (_, i) => i / sides * Math.PI * 2 + (random() - .5) * .13);
  for (const a of angles) {
    const lobe = 1 + Math.sin(a * 3 + phase) * .095 + Math.cos(a * 2 - phase * .7) * .065;
    const cos = Math.cos(a), sin = Math.sin(a);
    const x = Math.sign(cos) * Math.abs(cos) ** .78 * lobe;
    const z = Math.sign(sin) * Math.abs(sin) ** .78 * lobe;
    const base: Point = { x: x + z * .12, y: 0, z, height: 0 };
    const shoulderHeight = .52 + Math.sin(a + phase) * .16 + Math.cos(a * 2 - phase) * .045;
    const shoulder: Point = {
      x: base.x * .92 + leanX * .34,
      y: shoulderHeight,
      z: base.z * .91 + leanZ * .34,
      height: shoulderHeight,
    };
    const crown: Point = {
      x: base.x * .60 + leanX, y: 0, z: base.z * .63 + leanZ, height: .94,
    };
    crown.y = crownHeight(crown.x, crown.z);
    rings[0].push(base);
    rings[1].push(blend(base, shoulder, .45));
    rings[2].push(shoulder);
    rings[3].push(blend(shoulder, crown, .5));
    rings[4].push(crown);
    for (const [level, t] of [[5, .40], [6, .78]]) {
      const point = blend(crown, top, t);
      point.y = crownHeight(point.x, point.z);
      rings[level].push(point);
    }
  }
  // Center and normalize the whole envelope once, so authored width/depth
  // remain full extents rather than approximate radius multipliers.
  const points = [...rings.flat(), top];
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  const topY = Math.max(...points.map(p => p.y));
  for (const p of points) {
    p.x = ((p.x - minX) / (maxX - minX) - .5) * size.width;
    p.z = ((p.z - minZ) / (maxZ - minZ) - .5) * size.depth;
    p.height = p.y / topY;
    p.y = p.height * size.height;
  }
  const footprint = rings[0].map((p, i) => {
    const terrainY = groundAt(p.x, p.z) - ground;
    // On an uphill shoulder, bury the base farther instead of folding its
    // bottom edge above the next ring. Upper planes keep their solid shape.
    p.y = Math.min(terrainY - burial, rings[1][i].y - burial);
    // The intermediate row subdivides the same broad basal planes. It must
    // follow their buried foot, not introduce a separate horizontal bevel.
    rings[1][i] = blend(p, rings[2][i], .45);
    return { x: p.x, z: p.z, groundY: terrainY, bottomY: p.y };
  });
  const bottom: Point = {
    x: 0,
    y: Math.min(...footprint.map(p => p.bottomY)) - burial,
    z: 0,
    height: 0,
  };
  const positions: number[] = [], colors: number[] = [];
  const granite = new THREE.Color(0x858582);
  const feldspar = new THREE.Color(0x9c8e85);
  const lichen = new THREE.Color(0x9a9a76);
  const shadow = new THREE.Color(0x68645c);
  const color = new THREE.Color();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  const triangle = (a: Point, b: Point, c: Point) => {
    ab.set(b.x - a.x, b.y - a.y, b.z - a.z);
    ac.set(c.x - a.x, c.y - a.y, c.z - a.z);
    normal.crossVectors(ab, ac).normalize();
    const x = (a.x + b.x + c.x) / (3 * size.width);
    const z = (a.z + b.z + c.z) / (3 * size.depth);
    const h = (a.height + b.height + c.height) / 3;
    // Large mineral domains span neighboring faces; mild face values describe
    // worn planes without making every triangle an unrelated painted patch.
    const mineral = Math.sin(x * 6 + z * 3 + phase) * .5 + .5;
    color.copy(granite).lerp(feldspar, mineral * .44);
    const lichenField = Math.sin(x * 10 - z * 7 + phase * .6) * .5 + .5;
    const lichenAmount = THREE.MathUtils.smoothstep(lichenField, .53, .85)
      * THREE.MathUtils.smoothstep(h, .30, .67) * Math.max(0, normal.y) * .58;
    color.lerp(lichen, lichenAmount);
    color.lerp(shadow, (1 - THREE.MathUtils.smoothstep(h, .01, .18)) * .36);
    color.multiplyScalar(.96 + Math.sin(x * 8 + z * 9 + phase) * .035);
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(color.r, color.g, color.b);
    }
  };
  for (let level = 0; level < rings.length - 1; level++) {
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      const a = rings[level][i], b = rings[level + 1][i];
      const c = rings[level + 1][next], d = rings[level][next];
      // Alternate the seam, avoiding long visible diagonal bands around the
      // entire rock. Every face has outward winding for front-side materials.
      if ((i + level) % 2) { triangle(a, b, d); triangle(b, c, d); }
      else { triangle(a, b, c); triangle(a, c, d); }
    }
  }
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    triangle(rings.at(-1)![i], top, rings.at(-1)![next]);
    triangle(rings[0][next], bottom, rings[0][i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { kind: 'sharptail-glacial-erratic', triangles: positions.length / 9 };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Weathered granite erratic';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.shotSolid = true;
  const root = new THREE.Group();
  root.name = 'Sharptail glacial erratic';
  root.userData = {
    kind: 'sharptail-glacial-erratic', seed: size.seed, dimensions: { ...size },
    contactFootprint: footprint,
    footprintRadius: Math.max(...points.map(p => Math.hypot(p.x, p.z))),
  };
  root.add(mesh);
  return root;
}
