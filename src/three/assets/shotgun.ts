import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Sporting shotgun viewmodel for the Quail Fields production slice.
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

export function createSportingShotgun(action: 'pump' | 'semi-auto'): SportingShotgun {
  const root = new THREE.Group(); root.name = action === 'pump' ? 'Sporting pump' : 'Sporting semiautomatic';
  const materials = {
    steel: new THREE.MeshStandardMaterial({ color: 0x354047, metalness: .22, roughness: .72, flatShading: true }),
    edge: new THREE.MeshStandardMaterial({ color: 0x51585a, metalness: .30, roughness: .65, flatShading: true }),
    black: new THREE.MeshStandardMaterial({ color: 0x131919, metalness: .12, roughness: .82 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x70503a, roughness: .86, flatShading: true }),
    grain: new THREE.MeshStandardMaterial({ color: 0x49382b, roughness: .9 }),
    glove: new THREE.MeshStandardMaterial({ color: 0xa28f69, roughness: .96 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x766747, roughness: .94 }),
    cuff: new THREE.MeshStandardMaterial({ color: 0x414b3d, roughness: 1, flatShading: true }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb89c55, metalness: .48, roughness: .4 }),
    shell: new THREE.MeshStandardMaterial({ color: 0x9e382b, roughness: .61 }),
  };
  const b = new Batch();
  // Single round barrel and narrow ventilated rib; the sky remains visible
  // between rib supports, rather than turning the sight plane into a plank.
  b.cylinder(.0118, .65, [0, .007, -.448], materials.steel, 14);
  b.cylinder(.0086, .0015, [0, .007, -.774], materials.black, 14);
  b.cylinder(.0123, .009, [0, .007, -.769], materials.edge, 14);
  b.cylinder(.010, .27, [0, -.022, -.275], materials.steel);
  b.cylinder(.013, .011, [0, -.022, -.413], materials.black);
  b.box([.0045, .0028, .635], [0, .026, -.455], materials.steel);
  for (let i = 0; i < 7; i++) b.box([.004, .007, .008], [0, .021, -.17 - i * .088], materials.steel);
  const bead = new THREE.Vector3(0, .030, -.766);
  b.sphere([.0025, .0025, .0025], [bead.x, bead.y, bead.z], materials.brass);
  // Rounded receiver shoulder, top chamfers, and one long ejection port.
  b.add(loft([
    { z: .075, y: -.001, width: .020, height: .021 },
    { z: .045, y: .002, width: .023, height: .026 },
    { z: -.100, y: .002, width: .024, height: .026 },
    { z: -.130, y: .003, width: .019, height: .020 },
  ], 12, true), materials.steel);
  b.box([.002, .019, .078], [.0245, .006, -.037], materials.black);
  b.box([.028, .0015, .061], [0, -.0255, -.015], materials.black);
  b.box([.018, .001, .048], [0, -.0266, -.014], materials.edge);
  // Walnut joins the action with a slim wrist and a dropped comb.
  b.add(loft([
    { z: .052, y: -.004, width: .019, height: .020 },
    { z: .085, y: -.014, width: .017, height: .023 },
    { z: .125, y: -.033, width: .019, height: .026 },
    { z: .165, y: -.034, width: .023, height: .030 },
    { z: .26, y: -.041, width: .025, height: .041 },
    { z: .42, y: -.065, width: .025, height: .062 },
    { z: .447, y: -.066, width: .025, height: .061 },
  ], 12), materials.wood);
  b.add(loft([{ z: .446, y: -.066, width: .026, height: .063 }, { z: .459, y: -.066, width: .026, height: .062 }], 12), materials.black);
  const foreBatch = new Batch();
  foreBatch.add(loft([
    { z: -.133, y: -.026, width: .023, height: .023 },
    { z: -.157, y: -.027, width: .027, height: .027 },
    { z: -.25, y: -.025, width: .026, height: .025 },
    { z: -.367, y: -.021, width: .021, height: .021 },
    { z: -.39, y: -.021, width: .016, height: .016 },
  ], 12), materials.wood);
  // Three restrained inlaid grain lines and shallow grip grooves add scale
  // without a noisy or photorealistic texture in the painted landscape.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      b.add(tube([[side * .025, -.03 - i * .008, .19], [side * .0259, -.035 - i * .011, .28], [side * .0245, -.046 - i * .011, .411]], [.00055, .00065, .0004], 4), materials.grain);
      foreBatch.add(tube([[side * .023, -.016 - i * .008, -.165], [side * .0265, -.014 - i * .008, -.24], [side * .0225, -.012 - i * .006, -.34]], [.0005, .00065, .0004], 4), materials.grain);
    }
  }
  b.add(tube([[0, -.025, .017], [0, -.047, .018], [0, -.059, .032], [0, -.062, .072], [0, -.044, .096]], [.004, .0035, .003, .0032, .004], 8), materials.black);
  b.add(tube([[0, -.028, .04], [0, -.044, .038], [0, -.052, .047]], [.002, .002, .002], 6), materials.edge);
  root.add(b.build('Walnut stock, vented rib, blued steel'));
  if (action === 'pump') {
    for (let i = 0; i < 6; i++) foreBatch.add(new THREE.TorusGeometry(.026, .0007, 4, 14).scale(1, .94, 1), materials.grain, [0, -.025, -.18 - i * .021]);
  }
  const forend = foreBatch.build('Walnut forend'); root.add(forend);

  const boltBatch = new Batch();
  boltBatch.box([.0015, .015, .048], [.0255, .006, -.052], materials.edge);
  boltBatch.add(new THREE.CylinderGeometry(.0038, .005, .016, 8), materials.black, [.034, .005, -.065], [0, 0, Math.PI / 2]);
  const bolt = boltBatch.build('Bolt and handle'); root.add(bolt);

  function supportHand(): THREE.Group {
    const h = new Batch();
    h.add(loft([{ z: -.195, y: -.054, width: .026, height: .016 }, { z: -.216, y: -.054, width: .034, height: .019 }, { z: -.278, y: -.05, width: .030, height: .018 }, { z: -.291, y: -.046, width: .021, height: .013 }], 10), materials.glove);
    for (let i = 0; i < 4; i++) {
      const z = -.279 + i * .021;
      h.add(tube([[.015, -.059, z], [.037, -.045, z], [.041, -.020, z], [.031, -.002, z], [.017, .003, z]], [.009, .0085, .008, .0075, .006], 8), materials.glove);
      h.add(tube([[.038, -.034, z-.003], [.043, -.022, z-.003], [.039, -.010, z-.003]], [.0009, .001, .0008], 4), materials.seam);
    }
    h.add(tube([[-.016, -.055, -.205], [-.035, -.043, -.217], [-.04, -.02, -.240], [-.025, -.002, -.253]], [.012, .0105, .009, .007], 8), materials.glove);
    h.add(loft([{ z: -.19, y: -.063, width: .028, height: .021 }, { z: -.166, y: -.075, width: .031, height: .025 }], 10), materials.seam);
    h.add(loft([{ z: -.168, y: -.075, width: .034, height: .026 }, { z: -.08, y: -.119, width: .041, height: .035 }, { z: .035, y: -.177, width: .047, height: .042, x: -.018 }], 10), materials.cuff);
    return h.build('Left glove and canvas cuff');
  }
  const left = supportHand(); root.add(left);
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
  root.add(h.build('Right glove and canvas cuff'));

  // A separate pinching grip holds a horizontal shell beneath the loading
  // port. Reusing the broad forend grip here made the shell float in an open claw.
  const loading = new THREE.Group(); loading.name = 'Loading grip'; root.add(loading);
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
  lh.add(loft([{ z: .053, y: -.035, x: -.035, width: .031, height: .027 },
    { z: .19, y: -.097, x: -.065, width: .041, height: .035 }], 10), materials.cuff);
  loading.add(lh.build('Shell-loading left glove'));
  const shellBatch = new Batch();
  shellBatch.cylinder(.0084, .046, [0, 0, 0], materials.shell);
  shellBatch.cylinder(.0088, .009, [0, 0, .027], materials.brass);
  const shell = shellBatch.build('Visible loading shell'); loading.add(shell);
  loading.visible = false;
  let pumpAge = 10;
  const smooth = (n: number) => { const t = THREE.MathUtils.clamp(n, 0, 1); return t * t * (3 - 2 * t); };
  return {
    root, bead,
    fire() { pumpAge = 0; },
    update(elapsed, duration, missing, recoil, dt) {
      pumpAge += dt;
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
      left.visible = !loadingShell || returning;
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
    },
    dispose() {
      root.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      Object.values(materials).forEach((material) => material.dispose());
    },
  };
}
