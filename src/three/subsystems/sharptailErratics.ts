import * as THREE from 'three';
import { mulberry32 } from '../../game/math';

export interface SharptailErraticSize {
  /** Full dimensions in metres; height is measured from the center ground. */
  width: number;
  height: number;
  depth: number;
  seed: number;
}

type Face = { points: THREE.Vector3[]; basal: boolean };
type Joint = { normal: THREE.Vector3; offset: number; width: number; depth: number; primary: boolean };
type SurfacePoint = THREE.Vector3 & { height: number; joint: number };
const EPSILON = 1e-7;
const key = (point: THREE.Vector3) => `${Math.round(point.x * 1e8)},${Math.round(point.y * 1e8)},${Math.round(point.z * 1e8)}`;
const snap = (point: THREE.Vector3) => point.set(Math.round(point.x * 1e8) / 1e8, Math.round(point.y * 1e8) / 1e8, Math.round(point.z * 1e8) / 1e8);

/** Clip a surface polygon; its original outward winding stays intact. */
function clip(points: THREE.Vector3[], normal: THREE.Vector3, offset: number, intersections?: THREE.Vector3[]): THREE.Vector3[] {
  const result: THREE.Vector3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = normal.dot(a) - offset, db = normal.dot(b) - offset;
    const insideA = da <= EPSILON, insideB = db <= EPSILON;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const point = snap(a.clone().lerp(b, da / (da - db)));
      result.push(point); intersections?.push(point);
    }
  }
  const cleaned = result.filter((point, i) => key(point) !== key(result[(i + result.length - 1) % result.length]));
  if (cleaned.length < 3) return [];
  const area = new THREE.Vector3();
  for (let i = 0; i < cleaned.length; i++) area.add(new THREE.Vector3().crossVectors(cleaned[i], cleaned[(i + 1) % cleaned.length]));
  return area.lengthSq() > 1e-14 ? cleaned : [];
}

/** Remove a fractured corner and close the newly exposed plane. */
function cutSolid(faces: Face[], normal: THREE.Vector3, offset: number): Face[] {
  const intersections: THREE.Vector3[] = [];
  const clipped = faces.map(face => ({ ...face, points: clip(face.points, normal, offset, intersections) })).filter(face => face.points.length);
  const cap = [...new Map(intersections.map(point => [key(point), point])).values()];
  if (cap.length >= 3) {
    const center = cap.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(cap.length);
    const n = normal.clone().normalize();
    const u = new THREE.Vector3().crossVectors(Math.abs(n.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    cap.sort((a, b) => Math.atan2(a.clone().sub(center).dot(v), a.clone().sub(center).dot(u))
      - Math.atan2(b.clone().sub(center).dot(v), b.clone().sub(center).dot(u)));
    clipped.push({ points: cap, basal: false });
  }
  return clipped;
}

/**
 * Sculpt a single fractured glacial block from unequal intersecting planes.
 * Side planes carry most of the mass; three shoulder cuts and narrow worn
 * bevels break the slab's outline. Continuous recessed joints cross the
 * actual surface instead of painting a crack onto a dome.
 *
 * groundAt accepts local x/z and a consistent elevation frame. Place the
 * root at groundAt(0,0), including root yaw in the sampler. The root owns its
 * single closed geometry; the supplied vertexColors material stays external.
 */
export function createSharptailErratic(
  material: THREE.Material,
  groundAt: (x: number, z: number) => number,
  size: SharptailErraticSize,
): THREE.Group {
  if (![size.width, size.height, size.depth].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Sharptail erratic dimensions must be positive finite metres.');
  }
  const random = mulberry32(size.seed), variant = Math.abs(size.seed | 0) % 3;
  const phase = random() * Math.PI * 2;
  const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Temporary enclosing half-spaces, all cut away except the buried floor.
  // The visible shape is built by the authored fracture planes below.
  let faces: Face[] = [
    { points: [p(-1.5, 0, -1.5), p(1.5, 0, -1.5), p(1.5, 0, 1.5), p(-1.5, 0, 1.5)], basal: true },
    { points: [p(-1.5, 1.6, 1.5), p(1.5, 1.6, 1.5), p(1.5, 1.6, -1.5), p(-1.5, 1.6, -1.5)], basal: false },
    { points: [p(-1.5, 0, 1.5), p(1.5, 0, 1.5), p(1.5, 1.6, 1.5), p(-1.5, 1.6, 1.5)], basal: false },
    { points: [p(1.5, 0, -1.5), p(-1.5, 0, -1.5), p(-1.5, 1.6, -1.5), p(1.5, 1.6, -1.5)], basal: false },
    { points: [p(1.5, 0, 1.5), p(1.5, 0, -1.5), p(1.5, 1.6, -1.5), p(1.5, 1.6, 1.5)], basal: false },
    { points: [p(-1.5, 0, -1.5), p(-1.5, 0, 1.5), p(-1.5, 1.6, 1.5), p(-1.5, 1.6, -1.5)], basal: false },
  ];
  const bearings = [-12, 34, 81, 130, 173, 223, 274, 318];
  const reaches = [.96, .88, 1.02, .90, 1.10, .83, 1.0, .95];
  const tapers = [.08, .18, .27, .12, .04, .15, .21, .10];
  const sides = bearings.map((angle, i) => {
    const a = angle * Math.PI / 180 + phase;
    return { normal: p(Math.cos(a), tapers[(i + variant * 2) % 8], Math.sin(a)), offset: reaches[i] + (random() - .5) * .10 };
  });
  for (const plane of sides) faces = cutSolid(faces, plane.normal, plane.offset);
  const roof = variant === 0
    ? [{ normal: p(.32, 1, .16), offset: 1.04 }, { normal: p(-.42, 1, -.07), offset: 1.19 }]
    : variant === 1
      ? [{ normal: p(-.39, 1, .23), offset: 1.02 }, { normal: p(.16, 1, -.30), offset: 1.18 }]
      : [{ normal: p(.15, 1, -.32), offset: 1.10 }, { normal: p(-.29, 1, .21), offset: 1.06 }];
  for (const plane of roof) faces = cutSolid(faces, plane.normal, plane.offset);
  // A dominant broken shoulder and two smaller unequal chips. They cut into
  // selected flanks rather than rounding every direction into one dome.
  for (const [ordinal, side] of [variant, (variant + 3) % 8, (variant + 5) % 8].entries()) {
    const direction = sides[side].normal;
    faces = cutSolid(faces, p(direction.x, .61 + ordinal * .10, direction.z), 1.24 + ordinal * .08);
  }
  // Narrow worn arrises give broad faces a credible transition. No random
  // vertex displacement: these are real small bevel planes on the solid.
  for (let i = 0; i < sides.length; i++) {
    const a = sides[i], b = sides[(i + 1) % sides.length];
    faces = cutSolid(faces, a.normal.clone().add(b.normal), a.offset + b.offset - (.035 + random() * .035));
  }
  for (const i of [1, 4, 6]) {
    faces = cutSolid(faces, sides[i].normal.clone().add(roof[0].normal), sides[i].offset + roof[0].offset - .045);
  }
  const joints: Joint[] = [
    { normal: p(.84, -.19, .38).normalize(), offset: (variant - 1) * .12 + .05, width: .052, depth: .12, primary: true },
    { normal: p(-.17, 1, .23).normalize(), offset: .39 + variant * .075, width: .024, depth: .038, primary: false },
  ];
  for (const joint of joints) for (const edge of [-joint.width, 0, joint.width]) {
    const offset = joint.offset + edge;
    const opposite = joint.normal.clone().negate();
    faces = faces.flatMap(face => [
      { ...face, points: clip(face.points, joint.normal, offset) },
      { ...face, points: clip(face.points, opposite, -offset) },
    ].filter(part => part.points.length));
  }
  // Canonical shared vertices keep the surface watertight after the cuts.
  const vertices = new Map<string, SurfacePoint>();
  for (const face of faces) face.points = face.points.map(point => {
    const id = key(point), existing = vertices.get(id);
    if (existing) return existing;
    const transformed = point.clone() as SurfacePoint;
    transformed.joint = 0;
    for (const joint of joints) {
      const distance = Math.abs(joint.normal.dot(point) - joint.offset);
      const groove = Math.max(0, 1 - distance / joint.width);
      const lift = THREE.MathUtils.smoothstep(point.y, .10, .34);
      const flank = joint.primary ? 1 : THREE.MathUtils.smoothstep(point.x + point.z, -.7, .25);
      const amount = groove * lift * flank;
      transformed.x -= point.x * amount * joint.depth;
      transformed.z -= point.z * amount * joint.depth;
      transformed.y -= amount * joint.depth * (joint.primary ? .72 : .12);
      transformed.joint = Math.max(transformed.joint, amount);
    }
    transformed.height = transformed.y;
    vertices.set(id, transformed); return transformed;
  });
  const points = [...vertices.values()];
  const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
  const minZ = Math.min(...points.map(point => point.z)), maxZ = Math.max(...points.map(point => point.z));
  const topY = Math.max(...points.map(point => point.y));
  const ground = groundAt(0, 0), burial = Math.min(.36, Math.max(.14, size.height * .15));
  const footprint: { x: number; z: number; groundY: number; bottomY: number }[] = [];
  for (const point of points) {
    point.x = ((point.x - minX) / (maxX - minX) - .5) * size.width;
    point.z = ((point.z - minZ) / (maxZ - minZ) - .5) * size.depth;
    point.height = point.y / topY; point.y = point.height * size.height;
    if (point.height < EPSILON) {
      const groundY = groundAt(point.x, point.z) - ground;
      point.y = Math.min(groundY - burial, -burial);
      footprint.push({ x: point.x, z: point.z, groundY, bottomY: point.y });
    }
  }
  const positions: number[] = [], colors: number[] = [];
  const granite = new THREE.Color(0x888988), feldspar = new THREE.Color(0x9a918a);
  const lichen = new THREE.Color(0x9d9f83), crevice = new THREE.Color(0x565a58), color = new THREE.Color();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  const triangle = (a: SurfacePoint, b: SurfacePoint, c: SurfacePoint) => {
    ab.subVectors(b, a); ac.subVectors(c, a); normal.crossVectors(ab, ac).normalize();
    const x = (a.x + b.x + c.x) / (3 * size.width), z = (a.z + b.z + c.z) / (3 * size.depth);
    const h = (a.height + b.height + c.height) / 3;
    const mineral = .5 + .5 * Math.sin(x * 5 + z * 3 + phase);
    color.copy(granite).lerp(feldspar, mineral * .30);
    const lichenAmount = THREE.MathUtils.smoothstep(.5 + .5 * Math.sin(x * 8 - z * 6 + phase), .55, .9)
      * THREE.MathUtils.smoothstep(h, .35, .75) * Math.max(0, normal.y) * .32;
    color.lerp(lichen, lichenAmount);
    color.lerp(crevice, ((a.joint + b.joint + c.joint) / 3) * .44);
    color.multiplyScalar(.98 + Math.sin(x * 5 + z * 7 + phase) * .02);
    for (const point of [a, b, c]) {
      positions.push(point.x, point.y, point.z); colors.push(color.r, color.g, color.b);
    }
  };
  for (const face of faces) {
    const polygon = face.points as SurfacePoint[];
    const center = polygon.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(polygon.length) as SurfacePoint;
    center.height = polygon.reduce((sum, point) => sum + point.height, 0) / polygon.length;
    center.joint = polygon.reduce((sum, point) => sum + point.joint, 0) / polygon.length;
    if (face.basal) center.y = Math.min(...polygon.map(point => point.y)) - burial;
    for (let i = 0; i < polygon.length; i++) triangle(polygon[i], polygon[(i + 1) % polygon.length], center);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { kind: 'sharptail-glacial-erratic', triangles: positions.length / 9, variant };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Fractured granite erratic'; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.shotSolid = true;
  const root = new THREE.Group(); root.name = 'Sharptail glacial erratic';
  root.userData = {
    kind: 'sharptail-glacial-erratic', seed: size.seed, dimensions: { ...size },
    contactFootprint: footprint, footprintRadius: Math.max(...points.map(point => Math.hypot(point.x, point.z))),
  };
  root.add(mesh); return root;
}
