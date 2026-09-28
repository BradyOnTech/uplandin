import * as THREE from 'three';
import { commonOriginalSites } from './sharptailNativeFamily';
export type NativePlantForm = 'windlaid' | 'bunch' | 'rank';
type Point = readonly [number, number, number];
interface SurfaceVertex { point: Point; t: number; across: number }
interface Leaf { x: number; z: number; angle: number; height: number; reach: number; width: number; id: number; basal: boolean; dry: boolean }

/** A single authored surface definition supplies both representations. Every
 * detailed triangle stays a subdivision of one coarse triangle at morph=0.
 * Roots, tips, culms, colors and wind coordinates agree at that boundary. */
export function nativePlantGeometry(form: NativePlantForm, detailed: boolean): THREE.BufferGeometry {
  const positions: number[] = [], coarse: number[] = [], colors: number[] = [], uv: number[] = [];
  const coarseNormals: number[] = [], windBends: number[] = [], sourceFaces: number[] = [];
  let face = 0;
  const up: Point = [0, 1, 0];
  const lerp = (a: Point, b: Point, c: Point, weights: Point): Point => [
    a[0] * weights[0] + b[0] * weights[1] + c[0] * weights[2],
    a[1] * weights[0] + b[1] * weights[1] + c[1] * weights[2],
    a[2] * weights[0] + b[2] * weights[1] + c[2] * weights[2],
  ];
  const colorAt = (t: number, dry: boolean): Point => {
    const shade = .49 + t * .45;
    return dry ? [.62, .55, .37] : [shade, shade * 1.015, shade * (.89 + t * .06)];
  };
  const emit = (p: Point, base: Point, t: number, id: number, basal: boolean, color: Point, windBend: number) => {
    positions.push(...p); coarse.push(...base); coarseNormals.push(...up);
    colors.push(...color); windBends.push(windBend); sourceFaces.push(face);
    uv.push((id * .6180339) % 1, basal ? t * .10 : t);
  };
  const surface = (a: SurfaceVertex, b: SurfaceVertex, c: SurfaceVertex,
    id: number, basal: boolean, dry: boolean, evaluate?: (t: number, across: number) => Point) => {
    const divisions = detailed && evaluate ? 2 : 1;
    const point = (i: number, j: number) => {
      const weights: Point = [1 - (i + j) / divisions, i / divisions, j / divisions];
      const base = lerp(a.point, b.point, c.point, weights);
      const t = a.t * weights[0] + b.t * weights[1] + c.t * weights[2];
      const across = a.across * weights[0] + b.across * weights[1] + c.across * weights[2];
      const color = lerp(colorAt(a.t, dry), colorAt(b.t, dry), colorAt(c.t, dry), weights);
      const windBend = (a.t * a.t * weights[0] + b.t * b.t * weights[1] + c.t * c.t * weights[2]) * (basal ? .01 : 1);
      emit(detailed && evaluate ? evaluate(t, across) : base, base, t, id, basal, color, windBend);
    };
    for (let i = 0; i < divisions; i++) for (let j = 0; j < divisions - i; j++) {
      point(i, j); point(i + 1, j); point(i, j + 1);
      if (i + j < divisions - 1) { point(i + 1, j); point(i + 1, j + 1); point(i, j + 1); }
    }
    face++;
  };
  const leaf = (l: Leaf) => {
    const dx = Math.sin(l.angle), dz = Math.cos(l.angle), sx = dz, sz = -dx;
    const kneeT = l.basal ? .45 : .54;
    const rootWidth = l.basal ? 0 : l.width * .84;
    const kneeWidth = l.width * (l.basal ? .72 : .48);
    const curve = (t: number, across: number): Point => {
      const run = l.reach * (t * .88 + t * t * .36);
      const y = l.height * (Math.sin(t * Math.PI * .90) + t * .025);
      const curl = ((l.id % 5) - 2) * .011 * t * t;
      // A shallow fold contributes real transverse volume. It is zero at
      // every defining coarse corner and only opens inside the leaf face.
      const width = t <= kneeT ? rootWidth + (kneeWidth - rootWidth) * t / kneeT : kneeWidth * (1 - t) / (1 - kneeT);
      const fold = l.basal ? 0 : Math.max(0, width - Math.abs(across)) * .28 * Math.sin(t * Math.PI);
      return [l.x + dx * run + sx * (across + curl), y + fold, l.z + dz * run + sz * (across + curl)];
    };
    const vertex = (t: number, across: number): SurfaceVertex => ({ point: curve(t, across), t, across });
    const rootL = vertex(0, -rootWidth), rootR = vertex(0, rootWidth);
    const kneeL = vertex(kneeT, -kneeWidth), kneeR = vertex(kneeT, kneeWidth), tip = vertex(1, 0);
    if (l.basal) surface(rootL, kneeR, kneeL, l.id, true, l.dry, curve);
    else {
      surface(rootL, rootR, kneeL, l.id, false, l.dry, curve);
      surface(rootR, kneeR, kneeL, l.id, false, l.dry, curve);
    }
    surface(kneeL, kneeR, tip, l.id, l.basal, l.dry, curve);
  };
  if (form === 'bunch') {
    // The common sward is five unequal, interlocking basal crowns. Its
    // silhouette stays low and bowed; flowering height belongs to the
    // sparse rank/stalk roles, never every common grass site.
    const crowns: readonly Point[] = [[-.35, .61, -.22], [.29, .72, -.18],
      [-.18, .48, .28], [.31, .63, .30], [.015, .53, .025]];
    for (let r = 0; r < crowns.length; r++) {
      const [x, height, z] = crowns[r];
      for (let i = 0; i < 3; i++) leaf({ x, z,
        angle: .58 + r * .71 + i * 2.19,
        height: height * (.78 + ((i + r) % 3) * .105),
        reach: .40 + ((i * 2 + r) % 4) * .035,
        width: .018 + (i % 3) * .003, id: r * 11 + i, basal: false, dry: false });
      leaf({ x, z, angle: r * 1.33 + .4, height: .09 + (r % 3) * .034,
        reach: .29 + (r % 3) * .038, width: .023, id: 80 + r, basal: true, dry: r % 2 === 0 });
    }
    leaf({ x: -.03, z: .1, angle: 2.43, height: .13, reach: .39,
      width: .023, id: 90, basal: true, dry: true });
  } else {
    const roots: readonly Point[] = [[-.18, 0, -.1], [.16, 0, .08], [-.025, 0, .19]];
    const heights = form === 'windlaid' ? [.51, .34, .40] : [1.07, .82, .98];
    for (let r = 0; r < roots.length; r++) {
      const [x, , z] = roots[r];
      for (let i = 0; i < 4; i++) leaf({ x, z, angle: i * 2.399 + r * 1.21,
        height: heights[r] * (.73 + ((i * 3 + r) % 5) * .067),
        reach: (form === 'windlaid' ? .44 : .34) * (.81 + (i % 3) * .12),
        width: .012 + (i % 3) * .003, id: r * 11 + i, basal: false, dry: false });
      for (let i = 0; i < 3; i++) leaf({ x, z, angle: i * 2.17 + r * .83,
        height: .075 + (i % 3) * .037, reach: .20 + (i % 3) * .044,
        width: .018, id: 80 + r * 7 + i, basal: true, dry: i !== 1 });
    }
  }
  const culm = (x: number, z: number, height: number, angle: number, id: number) => {
    const dx = Math.sin(angle), dz = Math.cos(angle), half = .0035;
    const section = (t: number): [SurfaceVertex, SurfaceVertex] => {
      const cx = x + dx * t * t * .18, cz = z + dz * t * t * .18;
      return [{ point: [cx - dz * half, height * t, cz + dx * half], t, across: -half },
        { point: [cx + dz * half, height * t, cz - dx * half], t, across: half }];
    };
    for (let i = 0; i < 2; i++) {
      const a = section(i / 2), b = section((i + 1) / 2);
      surface(a[0], a[1], b[0], id, false, false);
      surface(a[1], b[1], b[0], id, false, false);
    }
    for (let i = 0; i < 2; i++) {
      const t = .82 + i * .08, side = i ? -1 : 1, a = section(t);
      const end: SurfaceVertex = { point: [a[0].point[0] + dz * .048 * side, height * t + .04, a[0].point[2] - dx * .048 * side], t: 1, across: 0 };
      surface(a[0], a[1], end, id, false, false);
    }
  };
  if (form === 'rank') culm(-.12, -.07, 1.42, .71, 150);
  if (form === 'rank') culm(.16, .09, 1.14, 1.8, 151);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('coarsePosition', new THREE.Float32BufferAttribute(coarse, 3));
  geometry.setAttribute('coarseNormal', new THREE.Float32BufferAttribute(coarseNormals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('nativeBend', new THREE.Float32BufferAttribute(windBends, 1));
  geometry.setAttribute('sourceFace', new THREE.Float32BufferAttribute(sourceFaces, 1));
  if (detailed) {
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute('normal'), sums = new Map<string, THREE.Vector3>();
    const key = (i: number) => `${positions[i * 3].toFixed(6)},${positions[i * 3 + 1].toFixed(6)},${positions[i * 3 + 2].toFixed(6)}`;
    for (let i = 0; i < normals.count; i++) {
      const k = key(i), sum = sums.get(k) ?? new THREE.Vector3();
      sum.add(new THREE.Vector3(normals.getX(i), normals.getY(i), normals.getZ(i))); sums.set(k, sum);
    }
    for (let i = 0; i < normals.count; i++) {
      const n = sums.get(key(i))!.clone().normalize(); if (n.y < 0) n.negate();
      n.multiplyScalar(.25).add(new THREE.Vector3(0, .75, 0)).normalize(); normals.setXYZ(i, n.x, n.y, n.z);
    }
  } else geometry.setAttribute('normal', new THREE.Float32BufferAttribute(coarseNormals, 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { kind: `sharptail-native-${form === 'windlaid' ? 'short' : form === 'rank' ? 'cover' : 'medium'}`, form, detailed, triangles: positions.length / 9 };
  return geometry;
}

export const SHARPTAIL_NATIVE_BUDGET = { high: 400, lite: 128 } as const;
const REFRESH_DISTANCE = .35;
const SUPPORT_GUARD = .85;
interface Root { source: THREE.InstancedMesh; index: number; distance: number }

/** Follow the authoritative ground without tilting the upright growth axis.
 * Called once at planting, so coarse and detail copy the exact same affine
 * transform. Neither selection nor changing LOD can move a root. */
export function conformNativePlantMatrix(matrix: THREE.Matrix4, slopeX: number, slopeZ: number): void {
  const e = matrix.elements;
  e[1] += slopeX * e[0] + slopeZ * e[2];
  e[9] += slopeX * e[8] + slopeZ * e[10];
}

/** Reused scratch grid for one 20 m planting tile. A 4 m lattice plus a
 * 4 m collar costs 256 authoritative height queries regardless of plant count.
 * Across the sampled prairie supports, its conservative 2 m leaf-base error
 * stays below 3.7 cm, within the existing 4 cm root embed; root Y is exact.
 * The arrays are X-major explicitly. Adjacent tiles share lattice positions. */
export class NativePlantGroundPatch {
  private static readonly STEP = 4;
  private static readonly SIDE = 8;
  private readonly dx = new Float64Array(NativePlantGroundPatch.SIDE ** 2);
  private readonly dz = new Float64Array(NativePlantGroundPatch.SIDE ** 2);
  private readonly slope = { x: 0, z: 0 };
  private originX = 0;
  private originZ = 0;

  prepare(tileMinX: number, tileMinZ: number, heightAt: (x: number, z: number) => number): void {
    this.originX = tileMinX - NativePlantGroundPatch.STEP;
    this.originZ = tileMinZ - NativePlantGroundPatch.STEP;
    for (let ix = 0; ix < NativePlantGroundPatch.SIDE; ix++) {
      for (let iz = 0; iz < NativePlantGroundPatch.SIDE; iz++) {
        const x = this.originX + ix * NativePlantGroundPatch.STEP;
        const z = this.originZ + iz * NativePlantGroundPatch.STEP;
        const index = ix * NativePlantGroundPatch.SIDE + iz;
        this.dx[index] = heightAt(x + .5, z) - heightAt(x - .5, z);
        this.dz[index] = heightAt(x, z + .5) - heightAt(x, z - .5);
      }
    }
  }

  sample(x: number, z: number, out: { x: number; z: number }): void {
    const fx = THREE.MathUtils.clamp((x - this.originX) / NativePlantGroundPatch.STEP, 0, NativePlantGroundPatch.SIDE - 1);
    const fz = THREE.MathUtils.clamp((z - this.originZ) / NativePlantGroundPatch.STEP, 0, NativePlantGroundPatch.SIDE - 1);
    const ix = Math.min(NativePlantGroundPatch.SIDE - 2, Math.floor(fx));
    const iz = Math.min(NativePlantGroundPatch.SIDE - 2, Math.floor(fz));
    const tx = fx - ix, tz = fz - iz, a = ix * NativePlantGroundPatch.SIDE + iz;
    const b = a + NativePlantGroundPatch.SIDE;
    out.x = (this.dx[a] * (1 - tx) + this.dx[b] * tx) * (1 - tz)
      + (this.dx[a + 1] * (1 - tx) + this.dx[b + 1] * tx) * tz;
    out.z = (this.dz[a] * (1 - tx) + this.dz[b] * tx) * (1 - tz)
      + (this.dz[a + 1] * (1 - tx) + this.dz[b + 1] * tx) * tz;
  }

  conform(matrix: THREE.Matrix4): void {
    this.sample(matrix.elements[12], matrix.elements[14], this.slope);
    conformNativePlantMatrix(matrix, this.slope.x, this.slope.z);
  }
}

/** The bounded near ring adds curvature to the same coarse leaf surfaces.
 * Its outer support band is already exactly coarse before slots change.
 * Both representations are opaque; there is no sample-mask crossfade or
 * dependency on antialiasing support. Existing sparse stalks own shadows. */
export class SharptailNativePlants {
  readonly baseMaterial: THREE.MeshLambertMaterial;
  readonly detailMaterial: THREE.MeshLambertMaterial;
  readonly batches: readonly THREE.InstancedMesh[];
  readonly range = { value: 0 };
  private readonly budget: number;
  private readonly radius: number;
  private readonly roots: Root[] = [];
  private readonly previous = new THREE.Vector2(Infinity, Infinity);
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private selected = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sourceMaterial: THREE.MeshLambertMaterial,
    private readonly sources: readonly THREE.InstancedMesh[],
    lite: boolean,
    private readonly commonReplacement = false,
  ) {
    this.budget = lite ? SHARPTAIL_NATIVE_BUDGET.lite : SHARPTAIL_NATIVE_BUDGET.high;
    this.radius = lite ? 6 : 8;
    this.baseMaterial = this.material(sourceMaterial, false);
    this.detailMaterial = this.material(sourceMaterial, true);
    this.batches = (['windlaid', 'bunch', 'rank'] as const).map(form => {
      const geometry = commonReplacement && form !== 'rank' ? new THREE.BufferGeometry() : nativePlantGeometry(form, true);
      const mesh = new THREE.InstancedMesh(geometry, this.detailMaterial, this.budget);
      mesh.name = `sharptail-close-${form}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.budget * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      return mesh;
    });
    for (const source of sources) if (!commonReplacement || source.geometry.userData.form === 'rank') source.material = this.baseMaterial;
  }

  private material(source: THREE.MeshLambertMaterial, detail: boolean): THREE.MeshLambertMaterial {
    const material = source.clone();
    material.customProgramCacheKey = () => `sharptail-paired-native-${detail ? 'detail' : 'coarse'}-v1`;
    material.onBeforeCompile = (shader, renderer) => {
      // Preserve the actual field wind, parting, time-of-day and light inputs.
      // They are shared uniform objects, not stale copies in the close ring.
      source.onBeforeCompile(shader, renderer);
      shader.uniforms.uNativeRange = this.range;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uNativeRange;
          varying float vNativeDistance;
          attribute vec3 coarsePosition;
          attribute vec3 coarseNormal;
          attribute float nativeBend;
        `)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          vNativeDistance = distance(instanceMatrix[3].xz, cameraPosition.xz);
          float nativeWeight = ${detail ? `(1.0 - smoothstep(max(0.0, uNativeRange - 4.0), max(.1, uNativeRange - ${SUPPORT_GUARD}), vNativeDistance))` : '0.0'};
          objectNormal = mix(coarseNormal, normal, nativeWeight);
        `)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed = mix(coarsePosition, position, nativeWeight);
        `)
        // Interpolated coarse bending preserves the same surface under wind;
        // recomputing t*t on subdivided vertices would change the silhouette.
        .replace('float gBend = gT * gT;', 'float gBend = nativeBend;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uNativeRange;
          varying float vNativeDistance;
        `)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (${detail ? 'vNativeDistance >= uNativeRange' : 'vNativeDistance < uNativeRange'}) discard;
        `);
    };
    return material;
  }

  /** The invisible support guard exceeds the distance between uploads. When
   * the cap binds, shrink the handoff radius before omitting any root; newly
   * selected/retired plants match the coarse shape before GPU slots change. */
  update(camera: THREE.Vector3, force = false): void {
    if (!force && Math.hypot(camera.x - this.previous.x, camera.z - this.previous.y) < REFRESH_DISTANCE) return;
    this.previous.set(camera.x, camera.z);
    this.roots.length = 0;
    const reach = this.radius + SUPPORT_GUARD;
    for (const source of this.sources) {
      const original = this.commonReplacement ? commonOriginalSites(source) : undefined;
      if (original) {
        if (!original.active || !original.count) continue;
        if (Math.hypot(camera.x - original.centerX, camera.z - original.centerZ) > reach + original.radius) continue;
        for (let index = 0; index < original.count; index++) {
          const distance = Math.hypot(original.positions[index * 2] - camera.x, original.positions[index * 2 + 1] - camera.z);
          if (distance <= reach) this.roots.push({ source, index, distance });
        }
      } else {
        if (!source.visible || source.count === 0) continue;
        const sphere = source.boundingSphere;
        if (sphere && Math.hypot(camera.x - sphere.center.x, camera.z - sphere.center.z) > reach + sphere.radius) continue;
        const matrices = source.instanceMatrix.array;
        for (let index = 0; index < source.count; index++) {
          const offset = index * 16;
          const distance = Math.hypot(matrices[offset + 12] - camera.x, matrices[offset + 14] - camera.z);
          if (distance <= reach) this.roots.push({ source, index, distance });
        }
      }
    }
    this.roots.sort((a, b) => a.distance - b.distance);
    this.selected = Math.min(this.budget, this.roots.length);
    const boundary = this.roots.length > this.budget ? this.roots[this.budget].distance : reach;
    this.range.value = Math.max(0, Math.min(this.radius, boundary - SUPPORT_GUARD));
    const counts = [0, 0, 0];
    for (let i = 0; i < this.selected; i++) {
      const { source, index } = this.roots[i];
      const form: NativePlantForm = source.geometry.userData.form;
      // Virtual pre-compaction common sites only preserve rank's old cutoff;
      // their new complementary geometry is owned by SharptailCommonPlants.
      if (this.commonReplacement && form !== 'rank') continue;
      const slot = form === 'windlaid' ? 0 : form === 'rank' ? 2 : 1;
      const mesh = this.batches[slot];
      source.getMatrixAt(index, this.matrix);
      source.getColorAt(index, this.color);
      mesh.setMatrixAt(counts[slot], this.matrix);
      mesh.setColorAt(counts[slot], this.color);
      counts[slot]++;
    }
    for (let i = 0; i < this.batches.length; i++) {
      const mesh = this.batches[i];
      mesh.count = counts[i];
      mesh.visible = counts[i] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      if (mesh.visible) mesh.computeBoundingSphere();
    }
  }

  stats(): { instances: number; capacity: number; handoffRadius: number } {
    return { instances: this.selected, capacity: this.budget, handoffRadius: this.range.value };
  }

  dispose(): void {
    for (const mesh of this.batches) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.dispose();
    }
    for (const source of this.sources) source.material = this.sourceMaterial;
    this.baseMaterial.dispose();
    this.detailMaterial.dispose();
    this.roots.length = 0;
  }
}
