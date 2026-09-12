import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Low-poly sporting shotgun viewmodels with one shared field sight line.
 * Metres, +Y up, muzzle down -Z. Cosmetic parts never own ammunition or input.
 */
export interface SportingShotgun {
  root: THREE.Group;
  /** Rig-local bead position, used to verify the camera's actual sight line. */
  bead: THREE.Vector3;
  /** Cosmetic action clock starts on the shot, independently of frame rate. */
  fire(): void;
  update(reloadElapsed: number, reloadDuration: number, missingShells: number, recoil: number, dt: number): void;
  dispose(): void;
}

type V3 = readonly [number, number, number];
type Ring = { z: number; y: number; width: number; height: number; x?: number };

/** Rounded section lofts retain deliberate broad planes with bevel-like edges. */
function loft(sections: readonly Ring[], sides = 12, square = false): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const section of sections) {
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const shape = square ? 0.44 : 1;
      positions.push((section.x ?? 0) + Math.sign(c) * Math.abs(c) ** shape * section.width,
        section.y + Math.sign(s) * Math.abs(s) ** shape * section.height, section.z);
    }
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + (j + 1) % sides;
      indices.push(a, b, b + sides, a, b + sides, a + sides);
    }
  }
  for (const end of [0, sections.length - 1]) {
    const section = sections[end];
    const center = positions.length / 3;
    positions.push(section.x ?? 0, section.y, section.z);
    for (let j = 0; j < sides; j++) {
      const a = end * sides + j, b = end * sides + (j + 1) % sides;
      indices.push(...(end === 0 ? [center, b, a] : [center, a, b]));
    }
  }
  if (sections.at(-1)!.z < sections[0].z) {
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Curved, tapered finger/guard paths, with one consistent orientation. */
function tube(points: readonly V3[], radii: readonly number[], sides = 8): THREE.BufferGeometry {
  const p = points.map((point) => new THREE.Vector3(...point));
  const vertices: number[] = [], indices: number[] = [];
  const tangent = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < p.length; i++) {
    tangent.subVectors(p[Math.min(i + 1, p.length - 1)], p[Math.max(0, i - 1)]).normalize();
    u.crossVectors(tangent, Math.abs(tangent.z) < .9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)).normalize();
    w.crossVectors(tangent, u).normalize();
    for (let j = 0; j < sides; j++) {
      const a = j / sides * Math.PI * 2;
      vertices.push(p[i].x + radii[i] * (u.x * Math.cos(a) + w.x * Math.sin(a)),
        p[i].y + radii[i] * (u.y * Math.cos(a) + w.y * Math.sin(a)),
        p[i].z + radii[i] * (u.z * Math.cos(a) + w.z * Math.sin(a)));
      if (i < p.length - 1) {
        const k = i * sides + j, next = i * sides + (j + 1) % sides;
        indices.push(k, next, next + sides, k, next + sides, k + sides);
      }
    }
  }
  for (const i of [0, p.length - 1]) {
    const center = vertices.length / 3; vertices.push(p[i].x, p[i].y, p[i].z);
    for (let j = 0; j < sides; j++) indices.push(center, i * sides + j, i * sides + (j + 1) % sides);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

class Batch {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geometry: THREE.BufferGeometry, material: THREE.Material, position?: V3, rotation?: V3): void {
    if (rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
    if (position) geometry.translate(...position);
    const list = this.groups.get(material) ?? [];
    list.push(geometry); this.groups.set(material, list);
  }
  box(size: V3, at: V3, material: THREE.Material): void { this.add(new THREE.BoxGeometry(...size), material, at); }
  cylinder(radius: number, length: number, at: V3, material: THREE.Material, sides = 12): void {
    this.add(new THREE.CylinderGeometry(radius, radius, length, sides, 1), material, at, [Math.PI / 2, 0, 0]);
  }
  sphere(scale: V3, at: V3, material: THREE.Material): void {
    this.add(new THREE.SphereGeometry(1, 10, 6).scale(...scale), material, at);
  }
  build(name: string): THREE.Group {
    const group = new THREE.Group(); group.name = name;
    for (const [material, geometries] of this.groups) {
      // Match attributes: these materials deliberately use no texture UVs.
      for (const geometry of geometries) geometry.deleteAttribute('uv');
      const geometry = mergeGeometries(geometries, false)!;
      geometries.forEach((source) => source.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
      group.add(mesh);
    }
    return group;
  }
}

export type SportingAction = 'pump' | 'semi-auto' | 'over-under' | 'side-by-side';

export function createSportingShotgun(action: SportingAction, options: { hands?: boolean } = {}): SportingShotgun {
  const double = action === 'over-under' || action === 'side-by-side';
  const sideBySide = action === 'side-by-side';
  const hands = options.hands !== false;
  const root = new THREE.Group(); root.name = {
    pump: 'Sporting pump', 'semi-auto': 'Sporting semiautomatic',
    'over-under': 'Sporting over/under', 'side-by-side': 'Sporting side-by-side',
  }[action];
  const materials = {
    steel: new THREE.MeshStandardMaterial({ color: 0x354047, metalness: .22, roughness: .72, flatShading: true }),
    edge: new THREE.MeshStandardMaterial({ color: 0x51585a, metalness: .30, roughness: .65, flatShading: true }),
    black: new THREE.MeshStandardMaterial({ color: 0x131919, metalness: .12, roughness: .82 }),
    wood: new THREE.MeshStandardMaterial({ name: 'Walnut', color: sideBySide ? 0x48342a : 0x70503a,
      roughness: sideBySide ? .67 : .86, flatShading: true }),
    grain: new THREE.MeshStandardMaterial({ name: 'Walnut grain', color: sideBySide ? 0x30251f : 0x49382b,
      roughness: sideBySide ? .76 : .9 }),
    glove: new THREE.MeshStandardMaterial({ color: 0xa28f69, roughness: .96 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x766747, roughness: .94 }),
    cuff: new THREE.MeshStandardMaterial({ color: 0x414b3d, roughness: 1, flatShading: true }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb89c55, metalness: .48, roughness: .4 }),
    shell: new THREE.MeshStandardMaterial({ color: 0x9e382b, roughness: .61 }),
    ...(double ? { receiver: new THREE.MeshStandardMaterial({
      color: sideBySide ? 0x969d98 : 0xb4bcb9, metalness: .48, roughness: .51, flatShading: true,
    }) } : {}),
  };
  const actionMetal = materials.receiver ?? materials.edge;
  const b = new Batch();
  const barrelBatch = double ? new Batch() : b;
  const bores = sideBySide ? [{ x: -.0124, y: .007 }, { x: .0124, y: .007 }]
    : double ? [{ x: 0, y: .007 }, { x: 0, y: -.0185 }] : [{ x: 0, y: .007 }];
  const muzzleBatch = new Batch();
  for (const bore of bores) {
    barrelBatch.cylinder(.0118, .65, [bore.x, bore.y, -.448], materials.steel, 14);
    (double ? muzzleBatch : b).cylinder(.0086, .0015, [bore.x, bore.y, -.774], materials.black, 14);
    barrelBatch.cylinder(.0123, .009, [bore.x, bore.y, -.769], materials.edge, 14);
    if (double) barrelBatch.cylinder(.0092, .0015, [bore.x, bore.y, -.12275], materials.black, 14);
  }
  if (!double) {
    b.cylinder(.010, .27, [0, -.022, -.275], materials.steel);
    b.cylinder(.013, .011, [0, -.022, -.413], materials.black);
  }
  // The paired barrels share a restrained rib; the bead remains on the
  // same local sight line for every action and the same gameplay camera.
  // The Venus carries a solid center rib between its parallel barrels;
  // the Silver Pigeon's ventilated rib remains above the stacked pair.
  barrelBatch.box([sideBySide ? .007 : .0045, sideBySide ? .021 : .0028, .635], [0, sideBySide ? .0169 : .026, -.455], materials.steel);
  if (!sideBySide) for (let i = 0; i < 7; i++) barrelBatch.box([.004, .007, .008], [0, .021, -.17 - i * .088], materials.steel);
  const bead = new THREE.Vector3(0, .030, -.766);
  barrelBatch.sphere([.0025, .0025, .0025], [bead.x, bead.y, bead.z], materials.brass);
  // The A5's flat elevated sight plane ends in a square rear step above
  // the wrist; it is a humpback profile, not a rounded autoloader shoulder.
  const receiverProfile: Ring[] = sideBySide ? [
    { z: .059, y: -.006, width: .016, height: .019 },
    { z: .018, y: -.005, width: .0265, height: .025 },
    { z: -.066, y: -.005, width: .027, height: .025 },
    { z: -.105, y: -.006, width: .0255, height: .023 },
    { z: -.132, y: -.009, width: .023, height: .020 },
  ] : double ? [
    { z: .059, y: -.004, width: .017, height: .022 },
    { z: .023, y: -.007, width: .021, height: .032 },
    { z: -.090, y: -.007, width: .021, height: .032 },
    { z: -.117, y: -.007, width: .020, height: .030 },
    { z: -.132, y: -.011, width: .018, height: .025 },
  ] : action === 'semi-auto' ? [
    { z: .073, y: -.004, width: .020, height: .023 },
    { z: .070, y: .010, width: .024, height: .040 },
    { z: -.088, y: .010, width: .024, height: .040 },
    { z: -.127, y: .0005, width: .023, height: .0305 },
    { z: -.154, y: .001, width: .019, height: .027 },
  ] : [
    { z: .075, y: -.001, width: .020, height: .021 },
    { z: .045, y: .002, width: .023, height: .026 },
    { z: -.100, y: .002, width: .024, height: .026 },
    { z: -.130, y: .003, width: .019, height: .020 },
  ];
  b.add(loft(receiverProfile, 12, !sideBySide), double ? actionMetal : materials.steel);
  if (!double) {
  b.box([.002, .019, .078], [.0245, .006, -.037], materials.black);
  b.box([.028, .0015, .061], [0, -.0255, -.015], materials.black);
  b.box([.018, .001, .048], [0, -.0266, -.014], materials.edge);
  } else {
    // Rounded action knuckles replace the old rectangular cheek blocks.
    // The shallow Venus is a round-body boxlock; the 686 has a narrow,
    // deeper silver action wrapped around the lower barrel's hinge.
    b.add(loft(sideBySide ? [
      { z: -.105, y: -.018, width: .023, height: .012 },
      { z: -.129, y: -.017, width: .023, height: .010 },
      { z: -.151, y: -.016, width: .021, height: .008 },
      { z: -.164, y: -.014, width: .018, height: .006 },
    ] : [
      { z: -.110, y: -.026, width: .017, height: .013 },
      { z: -.144, y: -.030, width: .019, height: .013 },
      { z: -.160, y: -.032, width: .015, height: .008 },
    ], 12), actionMetal);
    for (const side of [-1, 1]) {
      b.add(new THREE.CylinderGeometry(sideBySide ? .0048 : .007, sideBySide ? .0048 : .007, .0015, 10), materials.edge,
        [side * (sideBySide ? .0225 : .0185), sideBySide ? -.020 : -.029, sideBySide ? -.129 : -.143], [0, 0, Math.PI / 2]);
      // Restrained scroll-shaped cuts catch light at rack distance without
      // a photorealistic texture or a dark rectangular imitation sideplate.
      const onAction = (y: number, z: number): V3 => {
        const i = receiverProfile.findIndex((ring, index) => index > 0 && ring.z <= z);
        const a = receiverProfile[Math.max(0, i - 1)], c = receiverProfile[Math.max(1, i)];
        const t = THREE.MathUtils.clamp((z - a.z) / (c.z - a.z), 0, 1);
        const width = THREE.MathUtils.lerp(a.width, c.width, t);
        const height = THREE.MathUtils.lerp(a.height, c.height, t);
        const normalizedY = Math.abs((y - THREE.MathUtils.lerp(a.y, c.y, t)) / height);
        const power = sideBySide ? 1 : .44;
        // Follow the actual twelve-sided loft face rather than an ellipse
        // approximation, so the engraving cannot float over a rounded cheek.
        const ys = [0, .5 ** power, (Math.sqrt(3) / 2) ** power, 1];
        const xs = [1, (Math.sqrt(3) / 2) ** power, .5 ** power, 0];
        let face = 0;
        while (face < 2 && normalizedY > ys[face + 1]) face++;
        const x = width * THREE.MathUtils.lerp(xs[face], xs[face + 1],
          THREE.MathUtils.clamp((normalizedY - ys[face]) / (ys[face + 1] - ys[face]), 0, 1));
        return [side * (x + .00012), y, z];
      };
      for (const z of [-.019, -.066]) b.add(tube([
        onAction(-.003, z + .012), onAction(.000, z + .005), onAction(-.004, z - .006),
        onAction(-.012, z - .008), onAction(-.015, z), onAction(-.010, z + .004),
      ], [.00042, .00045, .00042, .00038, .00038, .0003], 4), materials.edge);
    }
  }
  // Walnut joins the action with a slim wrist and a dropped comb.
  const stockProfile: Ring[] = sideBySide ? [
    { z: .052, y: -.006, width: .0175, height: .019 },
    { z: .084, y: -.012, width: .0145, height: .017 },
    { z: .132, y: -.021, width: .016, height: .017 },
    { z: .171, y: -.027, width: .018, height: .020 },
    { z: .204, y: -.021, width: .022, height: .032 },
    { z: .228, y: -.026, width: .024, height: .039 },
    { z: .320, y: -.046, width: .026, height: .049 },
    { z: .408, y: -.063, width: .026, height: .060 },
    { z: .449, y: -.067, width: .0245, height: .058 },
  ] : [
    { z: .052, y: -.004, width: .019, height: .020 },
    { z: .085, y: -.014, width: .017, height: .023 },
    { z: .125, y: -.033, width: .019, height: .026 },
    { z: .165, y: -.034, width: .023, height: .030 },
    { z: .26, y: -.041, width: .025, height: .041 },
    { z: .42, y: -.065, width: .025, height: .062 },
    { z: .447, y: -.066, width: .025, height: .061 },
  ];
  b.add(loft(stockProfile, 12), materials.wood);
  if (action === 'over-under') {
    // The field 686's swept pistol grip drops behind the trigger hand;
    // the Venus keeps an uninterrupted English wrist instead.
    b.add(loft([
      { z: .123, y: -.043, width: .017, height: .012 },
      { z: .148, y: -.063, width: .021, height: .033 },
      { z: .169, y: -.065, width: .0215, height: .029 },
      { z: .190, y: -.047, width: .022, height: .018 },
    ], 12), materials.wood);
  }
  b.add(loft(sideBySide ? [
    { z: .448, y: -.067, width: .025, height: .059 },
    { z: .459, y: -.067, width: .025, height: .059 },
  ] : [{ z: .446, y: -.066, width: .026, height: .063 }, { z: .459, y: -.066, width: .026, height: .062 }], 12), materials.black);
  const foreBatch = new Batch();
  const foreSections: Ring[] = action === 'pump' ? [
    { z: -.180, y: -.025, width: .021, height: .021 },
    { z: -.192, y: -.025, width: .028, height: .027 },
    { z: -.309, y: -.023, width: .027, height: .025 },
    { z: -.334, y: -.022, width: .019, height: .019 },
  ] : sideBySide ? [
    { z: -.124, y: -.009, width: .024, height: .012 },
    { z: -.170, y: -.014, width: .025, height: .015 },
    { z: -.267, y: -.011, width: .0225, height: .013 },
    { z: -.330, y: -.003, width: .018, height: .009 },
    { z: -.352, y: .002, width: .008, height: .005 },
  ] : double ? [
    { z: -.124, y: -.032, width: .019, height: .017 },
    { z: -.170, y: -.038, width: .023, height: .022 },
    { z: -.275, y: -.035, width: .023, height: .020 },
    { z: -.324, y: -.022, width: .016, height: .013 },
    { z: -.344, y: -.025, width: .017, height: .014 },
    { z: -.354, y: -.015, width: .011, height: .008 },
  ] : [
    { z: -.133, y: -.026, width: .023, height: .023 },
    { z: -.157, y: -.027, width: .027, height: .027 },
    { z: -.25, y: -.025, width: .026, height: .025 },
    { z: -.367, y: -.021, width: .021, height: .021 },
    { z: -.39, y: -.021, width: .016, height: .016 },
  ];
  const foreOffset = action === 'pump' ? -.034 : 0;
  // Bed the broad upper shoulders into the supporting metal. Round oval
  // grips touched on their centerline but left daylight along their sides.
  const seated = foreSections.map(section => {
    const bottom = section.y - section.height;
    const top = action === 'over-under' ? -.007 : .007;
    return { ...section, z: section.z + foreOffset, y: (top + bottom) * .5, height: (top - bottom) * .5 };
  });
  foreBatch.add(loft(seated, 12, true), materials.wood);
  // Three restrained inlaid grain lines and shallow grip grooves add scale
  // without a noisy or photorealistic texture in the painted landscape.
  for (const side of sideBySide ? [] : [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      b.add(tube([[side * .025, -.03 - i * .008, .19], [side * .0259, -.035 - i * .011, .28], [side * .0245, -.046 - i * .011, .411]], [.00055, .00065, .0004], 4), materials.grain);
      if (!double) foreBatch.add(tube([[side * .023, -.016 - i * .008, (action === 'pump' ? -.198 : -.165) + foreOffset], [side * .0265, -.014 - i * .008, -.24 + foreOffset], [side * .0225, -.012 - i * .006, (action === 'pump' ? -.315 : -.34) + foreOffset]], [.0005, .00065, .0004], 4), materials.grain);
    }
  }
  if (sideBySide) {
    // Wide, tapered figure follows the stock and foreend surfaces. These
    // irregular ribbons read as walnut growth rather than three black cuts;
    // they share one existing material and require no texture or shader.
    const addWalnutFigure = (batch: Batch, rings: Ring[], from: number, to: number, count: number, squared: boolean) => {
      const positions: number[] = [], indices: number[] = [];
      const point = (z: number, ny: number, side: number): V3 => {
        let index = rings.findIndex((ring, i) => i > 0 && z >= Math.min(ring.z, rings[i - 1].z) && z <= Math.max(ring.z, rings[i - 1].z));
        if (index < 1) index = rings.length - 1;
        const a = rings[index - 1], c = rings[index];
        const t = THREE.MathUtils.clamp((z - a.z) / (c.z - a.z), 0, 1);
        const height = THREE.MathUtils.lerp(a.height, c.height, t);
        const power = squared ? .44 : 1;
        const ys = [0, .5 ** power, (Math.sqrt(3) / 2) ** power, 1];
        const xs = [1, (Math.sqrt(3) / 2) ** power, .5 ** power, 0];
        let face = 0;
        while (face < 2 && Math.abs(ny) > ys[face + 1]) face++;
        const x = THREE.MathUtils.lerp(a.width, c.width, t) * THREE.MathUtils.lerp(xs[face], xs[face + 1],
          (Math.abs(ny) - ys[face]) / (ys[face + 1] - ys[face]));
        return [side * (x + .00010), THREE.MathUtils.lerp(a.y, c.y, t) + height * ny, z];
      };
      for (const side of [-1, 1]) for (let stripe = 0; stripe < count; stripe++) {
        const start = from + (to - from) * (.012 + (stripe % 3) * .027);
        const end = to - (to - from) * (.014 + ((stripe + 1) % 3) * .012);
        const base = -.69 + stripe * 1.35 / (count - 1);
        const offset = positions.length / 3;
        // Include every stock profile break: a ribbon must turn with the
        // comb and wrist instead of bridging across them in open air.
        const samples = [...new Set([...Array.from({ length: 13 }, (_, i) => i / 12),
          ...rings.map(ring => (ring.z - start) / (end - start)).filter(t => t > 0 && t < 1)])].sort((a, c) => a - c);
        for (let segment = 0; segment < samples.length; segment++) {
          const t = samples[segment], z = THREE.MathUtils.lerp(start, end, t);
          const center = base + .105 * Math.sin(t * Math.PI + stripe * .64) + .04 * Math.sin(t * Math.PI * 2 + stripe);
          const half = (.014 + (stripe % 3) * .009) * Math.sin(t * Math.PI) * (.65 + .35 * Math.sin(t * Math.PI + stripe) ** 2);
          positions.push(...point(z, center - half, side), ...point(z, center + half, side));
          if (segment < samples.length - 1) {
            const a = offset + segment * 2;
            if (side * Math.sign(to - from) > 0) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
            else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      batch.add(geometry, materials.grain);
    };
    addWalnutFigure(b, stockProfile, .072, .445, 7, false);
    addWalnutFigure(foreBatch, seated, -.130, -.337, 5, true);
  }
  b.add(tube([[0, -.025, .017], [0, -.047, .018], [0, -.059, .032], [0, -.062, .072], [0, -.044, .096]], [.004, .0035, .003, .0032, .004], 8), materials.black);
  b.add(tube([[0, -.028, .04], [0, -.044, .038], [0, -.052, .047]], [.002, .002, .002], 6), action === 'over-under' ? materials.brass : materials.edge);
  if (sideBySide) b.add(tube([[0, -.028, .062], [0, -.044, .060], [0, -.052, .069]], [.002, .002, .002], 6), materials.edge);
  root.add(b.build('Walnut stock, vented rib, blued steel'));
  const hinge = new THREE.Group(); hinge.name = 'Break-action hinge';
  const barrelAssembly = new THREE.Group(); barrelAssembly.name = 'Break-action barrel assembly';
  const topLever = new THREE.Group(); topLever.name = 'Top lever';
  if (double) {
    hinge.position.set(0, -.030, -.154); root.add(hinge);
    barrelAssembly.position.copy(hinge.position).negate(); hinge.add(barrelAssembly);
    barrelAssembly.add(barrelBatch.build('Paired barrels and rib'), muzzleBatch.build('Muzzle faces'));
    const lever = new Batch();
    lever.add(tube([[0, 0, 0], [0, .002, .029], [0, 0, .047]], [.004, .0045, .006], 8), materials.steel);
    topLever.position.set(0, .025, -.028); topLever.add(lever.build('Opening lever')); root.add(topLever);
  }
  if (action === 'pump') {
    for (let i = 0; i < 6; i++) foreBatch.add(new THREE.TorusGeometry(.026, .0007, 4, 14).scale(1, .94, 1), materials.grain, [0, -.025, -.198 - i * .021 + foreOffset]);
  }
  const forend = foreBatch.build('Walnut forend'); (double ? barrelAssembly : root).add(forend);

  const boltBatch = new Batch();
  boltBatch.box([.0015, .015, .048], [.0255, .006, -.052], materials.edge);
  boltBatch.add(new THREE.CylinderGeometry(.0038, .005, .016, 8), materials.black, [.034, .005, -.065], [0, 0, Math.PI / 2]);
  const bolt = boltBatch.build('Bolt and handle'); root.add(bolt); bolt.visible = !double;

  function supportHand(): THREE.Group {
    const h = new Batch();
    const palmLift = sideBySide ? .010 : 0;
    h.add(loft([{ z: -.195, y: -.054 + palmLift, width: .026, height: .016 }, { z: -.216, y: -.054 + palmLift, width: .034, height: .019 }, { z: -.278, y: -.05 + palmLift, width: .030, height: .018 }, { z: -.291, y: -.046 + palmLift, width: .021, height: .013 }], 10), materials.glove);
    for (let i = 0; i < 4; i++) {
      const z = -.279 + i * .021;
      h.add(tube([[.015, -.059, z], [.037, -.045, z], [.041, -.020, z], [.031, -.002, z], [.017, .003, z]], [.009, .0085, .008, .0075, .006], 8), materials.glove);
      h.add(tube([[.038, -.034, z-.003], [.043, -.022, z-.003], [.039, -.010, z-.003]], [.0009, .001, .0008], 4), materials.seam);
    }
    h.add(tube([[-.016, -.055, -.205], [-.035, -.043, -.217], [-.04, -.02, -.240], [-.025, -.002, -.253]], [.012, .0105, .009, .007], 8), materials.glove);
    h.add(loft([{ z: -.19, y: -.063, width: .028, height: .021 }, { z: -.166, y: -.075, width: .031, height: .025 }], 10), materials.seam);
    return h.build('Left glove and canvas cuff');
  }
  const left = supportHand(); left.visible = hands; (double ? barrelAssembly : root).add(left);
  const h = new Batch();
  h.add(loft([
    { z: .081, y: -.037, x: .027, width: .014, height: .019 },
    { z: .104, y: -.043, x: .030, width: .020, height: .027 },
    { z: .137, y: -.051, x: .029, width: .018, height: .025 },
    { z: .154, y: -.056, x: .027, width: .015, height: .020 },
  ], 10), materials.glove);
  // Three curled grip fingers, with a distinct index alongside the guard.
  for (let i = 0; i < 3; i++) {
    const z = .096 + i * .018;
    h.add(tube([[.034, -.025, z], [.039, -.043, z], [.026, -.060, z], [.006, -.063, z]], [.009, .009, .008, .0065], 8), materials.glove);
  }
  h.add(tube([[.033, -.021, .096], [.031, -.027, .071], [.018, -.037, .048], [.008, -.043, .050]], [.009, .008, .007, .006], 8), materials.glove);
  h.add(tube([[.020, -.026, .134], [.005, -.015, .119], [-.015, -.018, .103], [-.019, -.025, .090]], [.010, .009, .008, .0065], 8), materials.glove);
  h.add(tube([[.046, -.039, .098], [.050, -.043, .117], [.044, -.054, .139]], [.0008, .0009, .0008], 4), materials.seam);
  h.add(loft([{ z: .15, y: -.053, width: .023, height: .023, x: .028 }, { z: .177, y: -.065, width: .029, height: .026, x: .028 }], 10), materials.seam);
  h.add(loft([{ z: .18, y: -.067, width: .032, height: .029, x: .028 }, { z: .28, y: -.108, width: .048, height: .039, x: .044 }], 10), materials.cuff);
  const right = h.build('Right glove and canvas cuff'); right.visible = hands; root.add(right);

  // A separate pinching grip holds a horizontal shell beneath the loading
  // port. Reusing the broad forend grip here made the shell float in an open claw.
  const loading = new THREE.Group(); loading.name = 'Loading grip'; (double ? barrelAssembly : root).add(loading);
  const lh = new Batch();
  lh.add(loft([{ z: .033, y: -.025, x: -.029, width: .019, height: .020 },
    { z: -.005, y: -.019, x: -.025, width: .023, height: .018 },
    { z: -.025, y: -.017, x: -.018, width: .017, height: .014 }], 10), materials.glove);
  for (let i = 0; i < 3; i++) {
    const z = -.019 + i * .014;
    lh.add(tube([[-.026, -.025, z], [-.004, -.028, z], [.012, -.015, z], [.011, -.001, z]],
      [.0075, .0075, .007, .006], 8), materials.glove);
  }
  lh.add(tube([[-.036, -.015, .022], [-.021, .007, .027], [-.001, .006, .032]], [.010, .009, .007], 8), materials.glove);
  lh.add(loft([{ z: .031, y: -.028, x: -.029, width: .023, height: .022 },
    { z: .052, y: -.035, x: -.035, width: .027, height: .025 }], 10), materials.seam);
  const loadingHand = lh.build('Shell-loading left glove'); loadingHand.visible = hands; loading.add(loadingHand);
  // The hand and shell follow the chamber, but the forearm returns toward
  // the hunter. Parenting a short capped sleeve to opening barrels aimed
  // its cut end at the camera and obscured the whole breech.
  const forearmGeometry = loft([{ z: 0, y: 0, width: .031, height: .027 },
    { z: 1, y: 0, width: .054, height: .046 }], 10);
  const loadingForearm = new THREE.Mesh(forearmGeometry, materials.cuff);
  loadingForearm.name = 'Loading forearm'; loadingForearm.frustumCulled = false;
  loadingForearm.visible = false; root.add(loadingForearm);
  const supportForearm = new THREE.Mesh(forearmGeometry, materials.cuff);
  supportForearm.name = 'Support forearm'; supportForearm.frustumCulled = false;
  supportForearm.visible = hands; root.add(supportForearm);
  const wrist = new THREE.Vector3(), forearmDirection = new THREE.Vector3();
  const loadingShoulder = new THREE.Vector3(double ? -.45 : .10, -.50, .70);
  const supportShoulder = new THREE.Vector3(double ? -.45 : -.22, -.50, .70);
  const forearmAxis = new THREE.Vector3(0, 0, 1);
  const placeForearm = (sleeve: THREE.Mesh, hand: THREE.Group, shoulder: THREE.Vector3, wx: number, wy: number, wz: number) => {
    sleeve.visible = hands && hand.visible;
    if (!sleeve.visible) return;
    hand.updateMatrix();
    wrist.set(wx, wy, wz).applyMatrix4(hand.matrix);
    if (double) {
      barrelAssembly.updateMatrix(); hinge.updateMatrix();
      wrist.applyMatrix4(barrelAssembly.matrix).applyMatrix4(hinge.matrix);
    }
    forearmDirection.subVectors(shoulder, wrist);
    sleeve.position.copy(wrist);
    sleeve.scale.set(1, 1, forearmDirection.length());
    sleeve.quaternion.setFromUnitVectors(forearmAxis, forearmDirection.normalize());
  };
  const updateForearms = () => {
    placeForearm(loadingForearm, loading, loadingShoulder, -.035, -.035, .053);
    placeForearm(supportForearm, left, supportShoulder, 0, -.075, -.168);
  };
  const shellBatch = new Batch();
  shellBatch.cylinder(.0084, .046, [0, 0, 0], materials.shell);
  shellBatch.cylinder(.0088, .009, [0, 0, .027], materials.brass);
  const shell = shellBatch.build('Visible loading shell'); loading.add(shell);
  const chamberRounds = double ? bores.map((bore, i) => {
    const round = shell.clone(true); round.name = `Chamber round ${i + 1}`;
    round.position.set(bore.x, bore.y, -.15); round.visible = false;
    barrelAssembly.add(round); return round;
  }) : [];
  loading.visible = false;
  updateForearms();
  let pumpAge = 10;
  const smooth = (n: number) => { const t = THREE.MathUtils.clamp(n, 0, 1); return t * t * (3 - 2 * t); };
  return {
    root, bead,
    fire() { pumpAge = 0; },
    update(elapsed, duration, missing, recoil, dt) {
      pumpAge += dt;
      if (double) {
        // The authoritative reload budget owns this complete sequence. A
        // partial reload ejects/replaces only its missing round; cosmetics
        // never refill ammunition or extend the gameplay clock.
        const count = Math.min(2, Math.max(0, Math.ceil(missing)));
        const reloading = duration > 0 && elapsed >= 0 && elapsed < duration && count > 0;
        const closeStart = Math.max(.4, duration - .24);
        const loadStart = .34;
        const perShell = Math.max(.01, (closeStart - loadStart) / Math.max(1, count));
        const closing = smooth((elapsed - closeStart) / Math.max(.01, duration - closeStart));
        const open = reloading ? smooth(elapsed / .30) * (1 - closing) : 0;
        hinge.rotation.x = -.78 * open;
        topLever.rotation.y = reloading ? -.42 * smooth(elapsed / .09) * (1 - smooth((elapsed - .23) / .14)) : 0;
        const shellTime = (elapsed - loadStart) / perShell;
        const index = Math.min(count - 1, Math.max(0, Math.floor(shellTime)));
        const phase = shellTime - Math.floor(shellTime);
        const loadingShell = reloading && elapsed >= loadStart && elapsed < closeStart;
        const insert = smooth(phase / .68), withdraw = smooth((phase - .80) / .20);
        const bore = bores[index] ?? bores[0];
        const lastShell = index === count - 1;
        loading.visible = loadingShell;
        // The last empty grip reaches forward to support the barrels before
        // they close. Earlier beats return toward the shell pocket instead.
        loading.position.set(bore.x - .045 * (1 - insert) + (lastShell ? .025 : -.045) * withdraw,
          bore.y - .018 * (1 - insert) + (lastShell ? -.035 - bore.y : -.018) * withdraw,
          -.075 - .075 * insert + (lastShell ? -.075 : .085) * withdraw);
        loading.rotation.set(0, 0, -.12 * (1 - insert));
        shell.position.set(0, 0, 0);
        shell.visible = loadingShell && phase < .80;
        left.visible = hands && !loadingShell;
        left.rotation.set(0, 0, 0);
        const reaching = reloading && elapsed < loadStart ? smooth(elapsed / loadStart) : 0;
        left.position.set(-.06 * reaching, .025 * reaching, .14 * reaching);
        forend.position.set(0, 0, 0);
        for (const [i, round] of chamberRounds.entries()) {
          const loaded = elapsed >= loadStart + (i + .80) * perShell;
          const eject = smooth((elapsed - .18) / .18);
          const ejecting = i < count && elapsed < .36;
          round.visible = open > .04 && (i >= count || ejecting || loaded);
          round.position.set(bores[i].x, bores[i].y, -.15);
          round.rotation.set(0, 0, 0);
          if (ejecting) {
            round.position.z += eject * .18;
            round.position.y += eject * .04;
            round.rotation.x = eject * .38;
          }
        }
        updateForearms();
        return;
      }
      const pump = action === 'pump' ? .078 * (smooth((pumpAge - .08) / .14) - smooth((pumpAge - .22) / .22)) : 0;
      forend.position.z = pump;
      const reloading = duration > 0;
      const progress = reloading ? Math.min(1, elapsed / duration) : 0;
      const lift = reloading ? Math.min(1, progress / .20, (1 - progress) / .15) : 0;
      const shellPhase = (elapsed - .55) / .38;
      const loadingShell = reloading && shellPhase >= 0 && shellPhase < missing;
      const phase = shellPhase - Math.floor(shellPhase);
      const insert = smooth(phase / .66);
      const withdraw = smooth((phase - .78) / .22);
      const returning = reloading && shellPhase >= missing - .22;
      const returnMix = smooth((shellPhase - missing + .22) / .22);
      left.visible = hands && (!loadingShell || returning);
      left.position.set(-.055 * lift, -.13 * lift, .15 * lift + (reloading ? 0 : pump));
      left.rotation.z = -.22 * lift;
      // After the final insertion the open support grip returns from the
      // port to the forend, finishing at the exact ready pose before the
      // gameplay reload clock clears. There is no last-frame hand teleport.
      if (returning) {
        left.position.set(-.025 * (1 - returnMix), 0, .23 * (1 - returnMix));
        left.rotation.z = 0;
      }
      loading.visible = loadingShell && !returning;
      loading.position.set(-.065 * (1 - insert + withdraw), -.14 + .106 * insert - .10 * withdraw,
        .09 - .10 * insert + .06 * withdraw);
      loading.rotation.set(.12 * (1 - insert), 0, -.18 * (1 - insert));
      shell.visible = phase < .78;
      shell.position.set(0, .008 * smooth((phase - .55) / .23), -.022 * smooth((phase - .55) / .23));
      bolt.position.z = reloading ? .03 * Math.max(0, 1 - elapsed / .4) : action === 'pump' ? pump * .65
        : .055 * (smooth(pumpAge / .035) - smooth((pumpAge - .035) / .065));
      updateForearms();
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      root.traverse((object) => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
      geometries.forEach(geometry => geometry.dispose());
      Object.values(materials).forEach((material) => material.dispose());
    },
  };
}
