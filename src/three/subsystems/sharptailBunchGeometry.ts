import * as THREE from 'three';

type Form = 'windlaid' | 'bunch';
type Part = 'base' | 'middle' | 'near';

/** Authored opaque prairie bunches, in metres before the existing field
 * transforms. Three unequal crowns overlap at the base. The leaves rise from
 * those crowns, then open gradually into curved, tapered blades. This is not
 * a projection of a whole clump or a set of straight crossed grass triangles.
 *
 * The tiers contain separate leaves of one plant: 120 + 168 + 216 triangles.
 * Surviving leaves never move between tiers. Extra leaves use the existing
 * root-collapse shader and the same local contact and wind as the base. */
const FORM = {
  windlaid: { height: .52, spread: .49, width: .030, rootScale: .76, comb: .34 },
  bunch: { height: .75, spread: .65, width: .039, rootScale: 1, comb: .16 },
} as const;
const CROWNS = [
  { x: -.19, z: .035, vigor: 1, bearing: .18 },
  { x: .115, z: .175, vigor: .88, bearing: 1.8 },
  { x: .16, z: -.15, vigor: .94, bearing: -.8 },
] as const;
const PART = { base: 0, middle: 1, near: 2 } as const;
function noise(seed: number): number {
  let n = Math.imul(seed + 7349, 374761393);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}

export function prairieBunchGeometry(form: Form, part: Part): THREE.BufferGeometry {
  const params = FORM[form], tier = PART[part], segments = 3 + tier;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], uv: number[] = [];
  const roots: number[] = [], tiers: number[] = [], bend: number[] = [], ids: number[] = [];
  const center = new THREE.Vector3(), tangent = new THREE.Vector3(), widthAxis = new THREE.Vector3();
  const normal = new THREE.Vector3(), left = new THREE.Vector3(), right = new THREE.Vector3();
  const leafVertices: THREE.Vector3[] = [], leafNormals: THREE.Vector3[] = [], leafProgress: number[] = [];
  const root = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), end = new THREE.Vector3();

  for (let crown = 0; crown < CROWNS.length; crown++) {
    const group = CROWNS[crown];
    for (let slot = tier; slot < 24; slot += 3) {
      const id = crown * 24 + slot;
      // Every tier samples the full crown circumference. Unequal bearings
      // and a shared windward bias avoid ornamental radial spider plants.
      const angle = slot / 24 * Math.PI * 2 + group.bearing + (noise(id * 11) - .5) * .48;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      const low = slot % 8 === 0 || slot % 8 === 3;
      const ascending = slot % 8 === 1 || slot % 8 === 5 || slot % 8 === 6;
      const height = params.height * group.vigor * (low ? .34 + noise(id * 17) * .17 : .69 + noise(id * 17) * .28);
      const reach = params.spread * (low ? .85 + noise(id * 19) * .23 : .50 + noise(id * 19) * .37);
      const width = params.width * (.76 + noise(id * 23) * .34) * (low ? .94 : 1);
      root.set((group.x + (noise(id * 29) - .5) * .055) * params.rootScale, 0,
        (group.z + (noise(id * 31) - .5) * .055) * params.rootScale);
      const sweepX = dx + params.comb, sweepZ = dz + params.comb * .42;
      const twist = (noise(id * 37) - .5) * .72;
      a.set(root.x + sweepX * reach * .055, height * .60, root.z + sweepZ * reach * .055);
      b.set(root.x + sweepX * reach * .42, height * (ascending ? .96 : 1.35), root.z + sweepZ * reach * .42);
      end.set(root.x + sweepX * reach, height * (ascending ? 1 : .58 + noise(id * 41) * .20), root.z + sweepZ * reach);
      const shade = .94 + noise(id * 43) * .15;
      leafVertices.length = 0; leafNormals.length = 0; leafProgress.length = 0;
      for (let station = 0; station <= segments; station++) {
        const t = station / segments, s = 1 - t;
        center.copy(root).multiplyScalar(s * s * s).addScaledVector(a, 3 * s * s * t)
          .addScaledVector(b, 3 * s * t * t).addScaledVector(end, t * t * t);
        tangent.copy(a).sub(root).multiplyScalar(3 * s * s)
          .addScaledVector(new THREE.Vector3().subVectors(b, a), 6 * s * t)
          .addScaledVector(new THREE.Vector3().subVectors(end, b), 3 * t * t).normalize();
        widthAxis.set(-sweepZ, 0, sweepX).normalize().applyAxisAngle(tangent, twist * t);
        normal.crossVectors(tangent, widthAxis);
        if (normal.y < 0) normal.negate();
        // Keep some sky fill while letting curved faces catch distinct light;
        // nearly vertical normals made the entire bunch one flat value.
        normal.normalize().multiplyScalar(.42).add(new THREE.Vector3(0, .58, 0)).normalize();
        // The shoulder carries the leaf's width; its last third draws to one
        // fine tip. Several centreline samples distribute curvature smoothly.
        const half = width * .5 * (1 - t) ** .72 * (1 + .22 * Math.sin(Math.PI * t));
        if (station === segments) {
          leafVertices.push(center.clone()); leafNormals.push(normal.clone()); leafProgress.push(t);
        } else {
          left.copy(center).addScaledVector(widthAxis, -half); right.copy(center).addScaledVector(widthAxis, half);
          leafVertices.push(left.clone(), right.clone()); leafNormals.push(normal.clone(), normal.clone()); leafProgress.push(t, t);
        }
      }
      const emit = (i: number) => {
        const p = leafVertices[i], n = leafNormals[i], t = leafProgress[i];
        positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z);
        // Neutral leaf values stay in the accepted native family band; field
        // instance colors remain authoritative for crown, shoulder and hollow.
        const light = shade * (.88 + .19 * t);
        colors.push(.69 * light, .69 * light, .607 * light);
        uv.push((noise(id * 47) * .7 + crown * .1) % 1, p.y / params.height);
        roots.push(root.x, root.y, root.z); tiers.push(tier);
        bend.push((p.y / params.height) ** 2); ids.push(id);
      };
      for (let station = 0; station < segments - 1; station++) {
        const index = station * 2;
        for (const i of [index, index + 1, index + 2, index + 1, index + 3, index + 2]) emit(i);
      }
      for (const i of [segments * 2 - 2, segments * 2 - 1, segments * 2]) emit(i);
    }
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, values, size] of [['position', positions, 3], ['normal', normals, 3], ['color', colors, 3], ['uv', uv, 2],
    ['familyRoot', roots, 3], ['familyTier', tiers, 1], ['nativeBend', bend, 1], ['familyLeaf', ids, 1]] as const) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { kind: part === 'base' ? `sharptail-native-${form === 'windlaid' ? 'short' : 'medium'}` : 'sharptail-common-extra',
    form, part, detailed: false, triangles: positions.length / 9, source: 'authored-curved-bunch-v2' };
  return geometry;
}
