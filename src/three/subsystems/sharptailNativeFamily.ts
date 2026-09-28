import * as THREE from 'three';
import { NATIVE_LEAF_DATA as DATA } from './sharptailNativeLeafData';

export type CommonGrassForm = 'windlaid' | 'bunch';
export type CommonGrassPart = 'base' | 'middle' | 'near';
const SCALE = { windlaid: [1.45941, 1.40273, 1.30053], bunch: [1.80837, 1.96445, 1.92431] } as const;
const GAIN = { windlaid: 1.410600904966941, bunch: 1.4195522438026273 };
export const COMMON_GRASS_LIMITS = {
  high: { middle: 1800, near: 256, middleRadius: 18, nearRadius: 6 },
  lite: { middle: 640, near: 96, middleRadius: 12, nearRadius: 4.5 },
} as const;
const GUARD = .85;
const REFRESH = .35;

/** Disjoint subsets of the SAME authored leaf surfaces:112+162+266 triangles.
 * Source coordinates are metres/Y-up. Fitting retains the previous common
 * plant envelopes; only the neutral albedo is calibrated to the field band. */
export function nativeFamilyGeometry(form: CommonGrassForm, part: CommonGrassPart): THREE.BufferGeometry {
  const whole = new THREE.BufferGeometry();
  whole.setAttribute('position', new THREE.Float32BufferAttribute(DATA.positions, 3));
  whole.setIndex(DATA.indices); whole.computeVertexNormals();
  const normals = whole.getAttribute('normal'), scale = SCALE[form];
  const far = new Set(DATA.coarseLeafIds), mid = new Set(DATA.middleLeafIds);
  const p: number[] = [], n: number[] = [], c: number[] = [], uv: number[] = [];
  const roots: number[] = [], tiers: number[] = [], bend: number[] = [], ids: number[] = [];
  const normal = new THREE.Vector3(); let face = 0;
  for (let leaf = 0; leaf < 216; leaf++) {
    const tier = far.has(leaf) ? 0 : mid.has(leaf) ? 1 : 2;
    const count = leaf % 2 === 0 ? 9 : 6;
    if (tier === (part === 'base' ? 0 : part === 'middle' ? 1 : 2)) {
      for (let j = face; j < face + count; j++) {
        const i = DATA.indices[j], at = i * 3;
        p.push(DATA.positions[at] * scale[0], DATA.positions[at + 1] * scale[1], DATA.positions[at + 2] * scale[2]);
        normal.fromBufferAttribute(normals, i); normal.y = Math.abs(normal.y);
        normal.multiplyScalar(.2).add(new THREE.Vector3(0, .8, 0)).normalize();
        normal.set(normal.x / scale[0], normal.y / scale[1], normal.z / scale[2]).normalize(); n.push(normal.x, normal.y, normal.z);
        const gain = GAIN[form], peak = Math.max(DATA.colors[at], DATA.colors[at + 1], DATA.colors[at + 2]) * gain;
        const soft = peak > .9 ? .9 + .08 * (1 - Math.exp(-(peak - .9) / .08)) : peak;
        const k = peak > 0 ? soft / peak * gain : gain;
        c.push(DATA.colors[at] * k, DATA.colors[at + 1] * k, DATA.colors[at + 2] * k);
        uv.push(DATA.uv[i * 2], DATA.uv[i * 2 + 1]);
        roots.push(DATA.roots[leaf][0] * scale[0], DATA.roots[leaf][1] * scale[1], DATA.roots[leaf][2] * scale[2]);
        tiers.push(tier); bend.push(Math.max(0, DATA.positions[at + 1] / .37) ** 2); ids.push(leaf);
      }
    }
    face += count;
  }
  whole.dispose();
  const g = new THREE.BufferGeometry();
  for (const [name, values, size] of [['position', p, 3], ['normal', n, 3], ['color', c, 3], ['uv', uv, 2],
    ['familyRoot', roots, 3], ['familyTier', tiers, 1], ['nativeBend', bend, 1], ['familyLeaf', ids, 1]] as const) {
    g.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  }
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData = { kind: part === 'base' ? `sharptail-native-${form === 'windlaid' ? 'short' : 'medium'}` : 'sharptail-common-extra', form, part, detailed: false, triangles: p.length / 9 };
  return g;
}

/** Pre-compaction sites preserve the existing rank-detail selection law.
 * Only X/Z is needed; rank matrices and their placement remain untouched. */
export interface OriginalCommonSites { positions: Float32Array; count: number; active: boolean; centerX: number; centerZ: number; radius: number }
const originalSites = new WeakMap<THREE.InstancedMesh, OriginalCommonSites>();
export const commonOriginalSites = (mesh: THREE.InstancedMesh): OriginalCommonSites | undefined => originalSites.get(mesh);
export function deactivateCommonSites(mesh: THREE.InstancedMesh): void { const sites = originalSites.get(mesh); if (sites) sites.active = false; }
interface PairSite { form: number; index: number; x: number; z: number; pair: number; row: number }

/** Tile-owned pairs never consult visible/loaded neighboring tiles. The full
 * old fill consumes its RNG before this compaction; rank/seedheads therefore
 * retain their exact matrices and colors. Solitary occupied pairs are kept. */
export class CommonGrassPairing {
  private readonly records: PairSite[] = [];
  private readonly ordered: PairSite[] = [];
  private readonly keep: Uint8Array[];
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  constructor(openCapacity: number, bunchCapacity: number) {
    this.keep = [new Uint8Array(openCapacity), new Uint8Array(bunchCapacity)];
    for (let i = 0; i < openCapacity + bunchCapacity; i++) this.records.push({ form: 0, index: 0, x: 0, z: 0, pair: 0, row: 0 });
  }
  compact(meshes: readonly THREE.InstancedMesh[], counts: readonly number[], tx: number, tz: number, step: number): readonly number[] {
    this.ordered.length = 0; const cells = Math.floor(20 / step);
    for (let form = 0; form < 2; form++) {
      const mesh = meshes[form], count = counts[form]; this.keep[form].fill(0, 0, count);
      let sites = originalSites.get(mesh);
      if (!sites) { sites = { positions: new Float32Array(mesh.instanceMatrix.count * 2), count: 0, active: false, centerX: 0, centerZ: 0, radius: 0 }; originalSites.set(mesh, sites); }
      sites.count = count; sites.active = true; sites.centerX = tx * 20 + 10; sites.centerZ = tz * 20 + 10; sites.radius = 0;
      const a = mesh.instanceMatrix.array;
      for (let i = 0; i < count; i++) {
        const x = a[i * 16 + 12], z = a[i * 16 + 14]; sites.positions[i * 2] = x; sites.positions[i * 2 + 1] = z;
        sites.radius = Math.max(sites.radius, Math.hypot(x - sites.centerX, z - sites.centerZ));
        // Paired secondary growth can cross the owner's tile edge by30cm.
        // Clamp to that owner's end cell, rather than consulting its neighbor.
        const gx = Math.max(0, Math.min(cells - 1, Math.floor((x - tx * 20) / step)));
        const gz = Math.max(0, Math.min(cells - 1, Math.floor((z - tz * 20) / step)));
        const r = this.records[this.ordered.length]; r.form = form; r.index = i; r.x = x; r.z = z; r.row = gz; r.pair = Math.floor((gx + (gz & 1)) / 2); this.ordered.push(r);
      }
    }
    this.ordered.sort((a, b) => a.row - b.row || a.pair - b.pair || a.x - b.x || a.z - b.z);
    for (let start = 0; start < this.ordered.length;) {
      const first = this.ordered[start]; let end = start + 1;
      while (end < this.ordered.length && this.ordered[end].row === first.row && this.ordered[end].pair === first.pair) end++;
      const key = `${tx},${tz},${first.pair},${first.row}`; let hash = 2166136261;
      for (let j = 0; j < key.length; j++) hash = Math.imul(hash ^ key.charCodeAt(j), 16777619) >>> 0;
      const selected = this.ordered[start + hash % (end - start)]; this.keep[selected.form][selected.index] = 1; start = end;
    }
    const retained = [0, 0];
    for (let form = 0; form < 2; form++) {
      const mesh = meshes[form];
      for (let i = 0; i < counts[form]; i++) if (this.keep[form][i]) {
        mesh.getMatrixAt(i, this.matrix); mesh.getColorAt(i, this.color);
        mesh.setMatrixAt(retained[form], this.matrix); mesh.setColorAt(retained[form], this.color); retained[form]++;
      }
    }
    return retained;
  }
}

interface RingRoot { source: THREE.InstancedMesh; index: number; distance: number }
export class SharptailCommonPlants {
  readonly material: THREE.MeshLambertMaterial;
  readonly middleRange = { value: 0 };
  readonly nearRange = { value: 0 };
  readonly batches: readonly THREE.InstancedMesh[];
  private readonly limits: typeof COMMON_GRASS_LIMITS['high'] | typeof COMMON_GRASS_LIMITS['lite'];
  private readonly previous = new THREE.Vector2(Infinity, Infinity);
  private readonly rootPool: RingRoot[] = [];
  private readonly roots: RingRoot[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  constructor(private readonly scene: THREE.Scene, private readonly sourceMaterial: THREE.MeshLambertMaterial,
    private readonly sources: readonly THREE.InstancedMesh[], lite: boolean) {
    this.limits = COMMON_GRASS_LIMITS[lite ? 'lite' : 'high'];
    this.material = sourceMaterial.clone(); this.material.customProgramCacheKey = () => 'sharptail-common-opaque-family-v1';
    this.material.onBeforeCompile = (shader, renderer) => {
      sourceMaterial.onBeforeCompile(shader, renderer);
      shader.uniforms.uFamilyNear = this.nearRange; shader.uniforms.uFamilyMiddle = this.middleRange;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uFamilyNear; uniform float uFamilyMiddle;
          attribute vec3 familyRoot; attribute float familyTier; attribute float nativeBend;
        `)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float familyDistance=distance(instanceMatrix[3].xz,cameraPosition.xz);
          float familyNear=1.-smoothstep(max(.1,uFamilyNear*.45),max(.2,uFamilyNear-${GUARD}),familyDistance);
          float familyMiddle=1.-smoothstep(max(.1,uFamilyMiddle-4.),max(.2,uFamilyMiddle-${GUARD}),familyDistance);
          float familyKeep=familyTier<.5?1.:familyTier<1.5?familyMiddle:familyNear;
          transformed=mix(familyRoot,position,familyKeep);
        `)
        .replace('float gT = uv.y;', 'float gT = uv.y * familyKeep;')
        .replace('float gBend = gT * gT;', 'float gBend = nativeBend * familyKeep * familyKeep;');
    };
    this.batches = (['middle', 'near'] as const).flatMap(part => (['windlaid', 'bunch'] as const).map(form => {
      const mesh = new THREE.InstancedMesh(nativeFamilyGeometry(form, part), this.material, this.limits[part]);
      mesh.name = `sharptail-common-${part}-${form}`; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.limits[part] * 3), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0; mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; scene.add(mesh); return mesh;
    }));
    for (const source of sources) source.material = this.material;
  }
  update(camera: THREE.Vector3, force = false): void {
    if (!force && Math.hypot(camera.x - this.previous.x, camera.z - this.previous.y) < REFRESH) return;
    this.previous.set(camera.x, camera.z); this.roots.length = 0;
    const reach = this.limits.middleRadius + GUARD;
    for (const source of this.sources) {
      if (!source.visible || !source.count) continue;
      const sphere = source.boundingSphere;
      if (sphere && Math.hypot(camera.x - sphere.center.x, camera.z - sphere.center.z) > reach + sphere.radius) continue;
      const a = source.instanceMatrix.array;
      for (let index = 0; index < source.count; index++) {
        const distance = Math.hypot(a[index * 16 + 12] - camera.x, a[index * 16 + 14] - camera.z);
        if (distance > reach) continue;
        const slot = this.roots.length;
        const root = this.rootPool[slot] ?? (this.rootPool[slot] = { source, index, distance });
        root.source = source; root.index = index; root.distance = distance; this.roots.push(root);
      }
    }
    this.roots.sort((a, b) => a.distance - b.distance);
    for (let tier = 0; tier < 2; tier++) {
      const part = tier === 0 ? 'middle' : 'near', radius = this.limits[`${part}Radius`], cap = this.limits[part];
      let eligible = 0; while (eligible < this.roots.length && this.roots[eligible].distance < radius + GUARD) eligible++;
      const count = Math.min(cap, eligible), boundary = eligible > cap ? this.roots[cap].distance : radius + GUARD;
      (tier === 0 ? this.middleRange : this.nearRange).value = Math.max(0, Math.min(radius, boundary - GUARD));
      let open = 0, bunch = 0;
      for (let i = 0; i < count; i++) {
        const r = this.roots[i], isOpen = r.source.geometry.userData.form === 'windlaid', mesh = this.batches[tier * 2 + (isOpen ? 0 : 1)];
        r.source.getMatrixAt(r.index, this.matrix); r.source.getColorAt(r.index, this.color);
        const slot = isOpen ? open++ : bunch++; mesh.setMatrixAt(slot, this.matrix); mesh.setColorAt(slot, this.color);
      }
      for (let form = 0; form < 2; form++) {
        const mesh = this.batches[tier * 2 + form]; mesh.count = form === 0 ? open : bunch; mesh.visible = mesh.count > 0;
        mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; if (mesh.visible) mesh.computeBoundingSphere();
      }
    }
  }
  dispose(): void {
    for (const mesh of this.batches) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
    for (const source of this.sources) source.material = this.sourceMaterial;
    this.material.dispose(); this.roots.length = 0; this.rootPool.length = 0;
  }
}
