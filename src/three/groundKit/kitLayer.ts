import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import type { Ctx } from '../engine';
import { OCCLUSION_WEIGHT, writeOcclusionWeight } from '../foliageMask';
import { VEGETATION_GUST_GLSL, VEGETATION_INSTANCE_WIND_GLSL, type VegetationWind } from '../subsystems/vegetationWind';
import { KIT_BAYER_GLSL, KIT_DITHER_DISCARD_GLSL, KIT_FADE_GLSL, KIT_SHEEN_GLSL } from './kitShader';

/** Instance data a layer's fill writes for one chunk. */
export class InstanceSink {
  readonly matrices: number[] = [];
  readonly colors: number[] = [];
  private readonly scratch = new Array<number>(16);

  push(matrix: THREE.Matrix4, color: THREE.Color): void {
    matrix.toArray(this.scratch);
    for (let i = 0; i < 16; i++) this.matrices.push(this.scratch[i]);
    this.colors.push(color.r, color.g, color.b);
  }

  get count(): number { return this.colors.length / 3; }
}

/**
 * Plants a merged layer's fill writes for one chunk: any mix of geometries,
 * flattened into one mesh, so several species cost one draw per chunk.
 * Each vertex keeps its plant's root and a bend weight for the wind.
 */
export class MergedSink {
  private readonly parts: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4; color: THREE.Color; height: number }[] = [];

  /** `geometry` is unit height; `height` is the plant's height in metres. */
  push(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color, height: number): void {
    this.parts.push({ geometry, matrix: matrix.clone(), color: color.clone(), height });
  }

  get count(): number { return this.parts.length; }

  build(): THREE.BufferGeometry | null {
    let vertices = 0;
    for (const part of this.parts) vertices += part.geometry.getAttribute('position').count;
    if (!vertices) return null;
    const position = new Float32Array(vertices * 3), normal = new Float32Array(vertices * 3), color = new Float32Array(vertices * 3);
    const root = new Float32Array(vertices * 3), bend = new Float32Array(vertices);
    const v = new THREE.Vector3(), n = new THREE.Vector3(), o = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
    let k = 0;
    for (const part of this.parts) {
      const p = part.geometry.getAttribute('position'), q = part.geometry.getAttribute('normal'), c = part.geometry.getAttribute('color');
      normalMatrix.getNormalMatrix(part.matrix);
      o.setFromMatrixPosition(part.matrix);
      for (let i = 0; i < p.count; i++, k++) {
        v.fromBufferAttribute(p, i);
        const y = v.y;
        v.applyMatrix4(part.matrix);
        n.fromBufferAttribute(q, i).applyMatrix3(normalMatrix).normalize();
        position[k * 3] = v.x; position[k * 3 + 1] = v.y; position[k * 3 + 2] = v.z;
        normal[k * 3] = n.x; normal[k * 3 + 1] = n.y; normal[k * 3 + 2] = n.z;
        color[k * 3] = c.getX(i) * part.color.r; color[k * 3 + 1] = c.getY(i) * part.color.g; color[k * 3 + 2] = c.getZ(i) * part.color.b;
        root[k * 3] = o.x; root[k * 3 + 1] = o.y; root[k * 3 + 2] = o.z;
        // Tips sway in metres: a tall crown moves more than a low patch.
        bend[k] = Math.max(0, y) * Math.max(0, y) * part.height;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('kitRoot', new THREE.BufferAttribute(root, 3));
    geometry.setAttribute('kitBend', new THREE.BufferAttribute(bend, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export interface KitBand {
  /** Metres from the camera: fade in over in[0]..in[1], out over out[0]..out[1]. */
  in: readonly [number, number];
  out: readonly [number, number];
}

export interface KitMaterialOptions {
  band: KitBand;
  wind: VegetationWind;
  clock: { value: number };
  /** Tip displacement at full wind, metres per metre of height. */
  sway: number;
  /** Sheen brightening at full wind. */
  sheen: number;
  /** Blades: shade like the ground they grow from, both faces lit. */
  upNormals?: boolean;
  /** Per-instance jitter of the band edges, metres. */
  jitter?: number;
  occlusion?: number;
  /** Geometry merged per chunk (MergedSink) instead of instanced. */
  merged?: boolean;
  /** Dither in at the near edge too: for a level-of-detail handover,
   * where growing out of the ground would read as plants popping up. */
  nearDither?: boolean;
}

/**
 * Lambert vegetation with the kit's shared behaviour: the hunt wind sways
 * the tops and rolls sheen bands through them, and the band edges dither.
 * Geometry is authored at unit height so position.y is the bend weight.
 */
export function kitVegetationMaterial(options: KitMaterialOptions): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: options.upNormals ? THREE.DoubleSide : THREE.FrontSide });
  // smoothstep needs edge0 < edge1 on every GPU: a band that starts at the
  // boots ([0, 0]) still gets a sliver of a fade.
  const band = new THREE.Vector4(options.band.in[0], Math.max(options.band.in[1], options.band.in[0] + .01),
    options.band.out[0], Math.max(options.band.out[1], options.band.out[0] + .01));
  material.onBeforeCompile = shader => {
    shader.uniforms.uKitBand = { value: band };
    shader.uniforms.uKitTime = options.clock;
    shader.uniforms.uKitWind = options.wind.direction;
    shader.uniforms.uKitWindStrength = options.wind.strength;
    shader.uniforms.uKitSway = { value: options.sway };
    shader.uniforms.uKitSheen = { value: options.sheen };
    shader.uniforms.uKitJitter = { value: options.jitter ?? 6 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec4 uKitBand;
uniform float uKitTime;
uniform vec2 uKitWind;
uniform float uKitWindStrength;
uniform float uKitSway;
uniform float uKitJitter;
varying float vKitFade;
varying float vKitSheen;
${options.merged ? 'attribute vec3 kitRoot;\nattribute float kitBend;' : ''}
${VEGETATION_GUST_GLSL}
${VEGETATION_INSTANCE_WIND_GLSL}
${KIT_FADE_GLSL}
${KIT_SHEEN_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${options.merged ? 'vec3 kitRootWorld = kitRoot;' : 'vec3 kitRootWorld = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;'}
// Full 3D distance: from a lifted overview the bands close in as they
// would at eye height, instead of showing plant tops from above.
float kitDistance = distance(kitRootWorld, cameraPosition);
// Each instance crosses its band edges at its own distance: the far edge
// by up to the jitter, the near edge within its own (narrow) fade.
float kitRand = kitHash(kitRootWorld.xz) - .5;
float kitFar = 1.0 - smoothstep(uKitBand.z, uKitBand.w, kitDistance + kitRand * uKitJitter);
float kitNear = smoothstep(uKitBand.x, uKitBand.y, kitDistance + kitRand * (uKitBand.y - uKitBand.x));
${options.nearDither ? `vKitFade = kitFar * kitNear;
float kitGrow = 1.0;` : `// Only the far edge dithers. Near the hunter a broad mass would show the
// dither as a screen; there it grows out of the garnish instead.
vKitFade = kitFar * step(.001, kitNear);
float kitGrow = kitNear;`}
// Past the far edge an instance also settles toward the ground, so the
// dither never leaves a dotted silhouette standing on a crest.
vec3 kitScale = vec3(mix(.55, 1.0, kitGrow), mix(.35, 1.0, kitFar) * mix(.2, 1.0, kitGrow), mix(.55, 1.0, kitGrow));
${options.merged ? `transformed = kitRootWorld + (transformed - kitRootWorld) * kitScale;
transformed.xz += uKitWind * vegetationGust(uKitTime, kitRootWorld.xz, uKitWind) * uKitWindStrength * uKitSway * kitBend;
vKitSheen = kitSheen(kitRootWorld.xz, uKitWind, uKitWindStrength, uKitTime) * min(1.0, kitBend);` : `transformed *= kitScale;
float kitBendWeight = clamp(position.y, 0.0, 1.2);
kitBendWeight *= kitBendWeight;
transformed += vegetationInstanceWind(uKitWind) * vegetationGust(uKitTime, kitRootWorld.xz, uKitWind)
  * uKitWindStrength * uKitSway * kitBendWeight;
vKitSheen = kitSheen(kitRootWorld.xz, uKitWind, uKitWindStrength, uKitTime) * kitBendWeight;`}`)
      // A fully faded instance collapses to its root: no fill cost for the
      // part of a chunk that lies beyond its band.
      .replace('#include <project_vertex>', `if (vKitFade <= 0.0) transformed = ${options.merged ? 'kitRootWorld' : 'vec3(0.0)'};
#include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uKitSheen;
varying float vKitFade;
varying float vKitSheen;
${KIT_BAYER_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
${KIT_DITHER_DISCARD_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 1.0 + vKitSheen * uKitSheen;`);
    if (options.upNormals) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    }
    writeOcclusionWeight(shader, options.occlusion ?? OCCLUSION_WEIGHT.grass);
  };
  material.customProgramCacheKey = () => `ground-kit-vegetation-v2-${options.upNormals ? 'up' : 'solid'}-${options.merged ? 'merged' : 'instanced'}-${options.nearDither ? 'dither' : 'grow'}`;
  return material;
}

export interface KitLayerSpec {
  name: string;
  /** Chunk edge, property yards. */
  chunkYards: number;
  /** Chunks nearer than this (metres) are built and drawn. */
  range: number;
  material: THREE.Material;
  /** Instanced: one geometry, filled per chunk; instances in world space. */
  geometry?: THREE.BufferGeometry;
  fill?(x0: number, y0: number, size: number, sink: InstanceSink): void;
  /** Merged: any mix of geometries per chunk, one draw (kitVegetationMaterial merged). */
  fillMerged?(x0: number, y0: number, size: number, sink: MergedSink): void;
  castShadow?: boolean;
}

interface Chunk { mesh: THREE.Mesh | null; triangles: number; minX: number; minZ: number; maxX: number; maxZ: number }

/**
 * One streamed band of instanced vegetation. Chunks are filled once when
 * the camera comes within range and dropped well past it; nothing is
 * rebuilt while walking inside the ring. One draw per visible chunk.
 */
export class KitLayer {
  private readonly chunks = new Map<number, Chunk>();
  private readonly property = { x: 0, y: 0 };
  private readonly world = { x: 0, z: 0 };

  constructor(private readonly landscape: LandscapeModel, private readonly spec: KitLayerSpec) {}

  update(ctx: Ctx): void {
    const { spec } = this, cam = ctx.camera.position;
    this.landscape.worldToProperty(cam.x, cam.z, this.property);
    const size = spec.chunkYards, reach = Math.ceil(spec.range / (size * .9144)) + 1;
    const cx = Math.floor(this.property.x / size), cy = Math.floor(this.property.y / size);
    let budget = ctx.paused ? 1e6 : 2;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const key = (cx + dx + 4096) * 8192 + cy + dy + 4096;
      if (this.chunks.has(key)) continue;
      const x0 = (cx + dx) * size, y0 = (cy + dy) * size;
      const a = this.landscape.propertyToWorld(x0, y0, { x: 0, z: 0 }), b = this.landscape.propertyToWorld(x0 + size, y0 + size, { x: 0, z: 0 });
      const chunk: Chunk = { mesh: null, triangles: 0, minX: Math.min(a.x, b.x), minZ: Math.min(a.z, b.z), maxX: Math.max(a.x, b.x), maxZ: Math.max(a.z, b.z) };
      if (boxDistance(cam.x, cam.z, chunk) > spec.range || budget-- <= 0) continue;
      chunk.mesh = this.build(ctx, x0, y0, size);
      if (chunk.mesh) chunk.triangles = triangleCount(chunk.mesh);
      this.chunks.set(key, chunk);
    }
    for (const [key, chunk] of this.chunks) {
      const distance = boxDistance(cam.x, cam.z, chunk);
      if (distance > spec.range + size * 1.5) {
        if (chunk.mesh) this.release(ctx, chunk.mesh);
        this.chunks.delete(key); continue;
      }
      if (chunk.mesh) chunk.mesh.visible = distance < spec.range;
    }
  }

  private build(ctx: Ctx, x0: number, y0: number, size: number): THREE.Mesh | null {
    let mesh: THREE.Mesh;
    if (this.spec.fillMerged) {
      const sink = new MergedSink();
      this.spec.fillMerged(x0, y0, size, sink);
      const geometry = sink.build();
      if (!geometry) return null;
      mesh = new THREE.Mesh(geometry, this.spec.material);
      mesh.userData.ownsGeometry = true;
    } else {
      const sink = new InstanceSink();
      this.spec.fill!(x0, y0, size, sink);
      if (!sink.count) return null;
      const instanced = new THREE.InstancedMesh(this.spec.geometry!, this.spec.material, sink.count);
      instanced.instanceMatrix.array.set(sink.matrices);
      instanced.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sink.colors), 3);
      instanced.computeBoundingSphere();
      mesh = instanced;
    }
    mesh.name = `${this.spec.name} ${x0},${y0}`;
    mesh.castShadow = !!this.spec.castShadow; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    // Wind sway stays inside the culling sphere.
    const sphere = mesh instanceof THREE.InstancedMesh ? mesh.boundingSphere! : mesh.geometry.boundingSphere!;
    sphere.radius += .5;
    ctx.scene.add(mesh);
    return mesh;
  }

  private release(ctx: Ctx, mesh: THREE.Mesh): void {
    ctx.scene.remove(mesh);
    if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
    else if (mesh.userData.ownsGeometry) mesh.geometry.dispose();
  }

  /** Instances and triangles currently drawn, for review numbers. */
  stats(): { chunks: number; instances: number; triangles: number } {
    let chunks = 0, instances = 0, triangles = 0;
    for (const chunk of this.chunks.values()) if (chunk.mesh?.visible) {
      chunks++; triangles += chunk.triangles;
      instances += chunk.mesh instanceof THREE.InstancedMesh ? chunk.mesh.count : 1;
    }
    return { chunks, instances, triangles };
  }

  dispose(ctx: Ctx): void {
    for (const chunk of this.chunks.values()) if (chunk.mesh) this.release(ctx, chunk.mesh);
    this.chunks.clear();
  }
}

function boxDistance(x: number, z: number, box: { minX: number; minZ: number; maxX: number; maxZ: number }): number {
  return Math.hypot(Math.max(box.minX - x, 0, x - box.maxX), Math.max(box.minZ - z, 0, z - box.maxZ));
}

function triangleCount(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry, per = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
  return mesh instanceof THREE.InstancedMesh ? per * mesh.count : per;
}
