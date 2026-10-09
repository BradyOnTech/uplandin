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
${VEGETATION_GUST_GLSL}
${VEGETATION_INSTANCE_WIND_GLSL}
${KIT_FADE_GLSL}
${KIT_SHEEN_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 kitRoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
// Full 3D distance: from a lifted overview the bands close in as they
// would at eye height, instead of showing plant tops from above.
float kitDistance = distance(kitRoot, cameraPosition);
// Each instance crosses its band edges at its own distance: the far edge
// by up to the jitter, the near edge within its own (narrow) fade.
float kitRand = kitHash(kitRoot.xz) - .5;
float kitFar = 1.0 - smoothstep(uKitBand.z, uKitBand.w, kitDistance + kitRand * uKitJitter);
float kitNear = smoothstep(uKitBand.x, uKitBand.y, kitDistance + kitRand * (uKitBand.y - uKitBand.x));
// Only the far edge dithers. Near the hunter a broad mass would show the
// dither as a screen; there it grows out of the garnish instead.
vKitFade = kitFar * step(.001, kitNear);
transformed.xz *= mix(.55, 1.0, kitNear);
// Past the far edge an instance also settles toward the ground, so the
// dither never leaves a dotted silhouette standing on a crest.
transformed.y *= mix(.35, 1.0, kitFar) * mix(.2, 1.0, kitNear);
float kitBend = clamp(position.y, 0.0, 1.2);
kitBend *= kitBend;
transformed += vegetationInstanceWind(uKitWind) * vegetationGust(uKitTime, kitRoot.xz, uKitWind)
  * uKitWindStrength * uKitSway * kitBend;
vKitSheen = kitSheen(kitRoot.xz, uKitWind, uKitWindStrength, uKitTime) * kitBend;`)
      // A fully faded instance collapses to its root: no fill cost for the
      // part of a chunk that lies beyond its band.
      .replace('#include <project_vertex>', `if (vKitFade <= 0.0) transformed = vec3(0.0);
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
  material.customProgramCacheKey = () => `ground-kit-vegetation-v1-${options.upNormals ? 'up' : 'solid'}`;
  return material;
}

export interface KitLayerSpec {
  name: string;
  /** Chunk edge, property yards. */
  chunkYards: number;
  /** Chunks nearer than this (metres) are built and drawn. */
  range: number;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Fill one chunk; origin in property yards. Instances in world space. */
  fill(x0: number, y0: number, size: number, sink: InstanceSink): void;
  castShadow?: boolean;
}

interface Chunk { mesh: THREE.InstancedMesh | null; minX: number; minZ: number; maxX: number; maxZ: number }

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
      const chunk: Chunk = { mesh: null, minX: Math.min(a.x, b.x), minZ: Math.min(a.z, b.z), maxX: Math.max(a.x, b.x), maxZ: Math.max(a.z, b.z) };
      if (boxDistance(cam.x, cam.z, chunk) > spec.range || budget-- <= 0) continue;
      chunk.mesh = this.build(ctx, x0, y0, size);
      this.chunks.set(key, chunk);
    }
    for (const [key, chunk] of this.chunks) {
      const distance = boxDistance(cam.x, cam.z, chunk);
      if (distance > spec.range + size * 1.5) {
        if (chunk.mesh) { ctx.scene.remove(chunk.mesh); chunk.mesh.dispose(); }
        this.chunks.delete(key); continue;
      }
      if (chunk.mesh) chunk.mesh.visible = distance < spec.range;
    }
  }

  private build(ctx: Ctx, x0: number, y0: number, size: number): THREE.InstancedMesh | null {
    const sink = new InstanceSink();
    this.spec.fill(x0, y0, size, sink);
    if (!sink.count) return null;
    const mesh = new THREE.InstancedMesh(this.spec.geometry, this.spec.material, sink.count);
    mesh.instanceMatrix.array.set(sink.matrices);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sink.colors), 3);
    mesh.name = `${this.spec.name} ${x0},${y0}`;
    mesh.castShadow = !!this.spec.castShadow; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.computeBoundingSphere();
    // Wind sway stays inside the culling sphere.
    mesh.boundingSphere!.radius += .5;
    ctx.scene.add(mesh);
    return mesh;
  }

  /** Instances and triangles currently drawn, for review numbers. */
  stats(): { chunks: number; instances: number; triangles: number } {
    const geometry = this.spec.geometry;
    const perInstance = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
    let chunks = 0, instances = 0;
    for (const chunk of this.chunks.values()) if (chunk.mesh?.visible) { chunks++; instances += chunk.mesh.count; }
    return { chunks, instances, triangles: instances * perInstance };
  }

  dispose(ctx: Ctx): void {
    for (const chunk of this.chunks.values()) if (chunk.mesh) { ctx.scene.remove(chunk.mesh); chunk.mesh.dispose(); }
    this.chunks.clear();
  }
}

function boxDistance(x: number, z: number, box: { minX: number; minZ: number; maxX: number; maxZ: number }): number {
  return Math.hypot(Math.max(box.minX - x, 0, x - box.maxX), Math.max(box.minZ - z, 0, z - box.maxZ));
}

/** World position and surface normal of the ground at a property point. */
export function groundAt(landscape: LandscapeModel, x: number, y: number, outPosition: THREE.Vector3, outNormal?: THREE.Vector3): THREE.Vector3 {
  const world = landscape.propertyToWorld(x, y, { x: 0, z: 0 });
  const h = landscape.heightAtProperty(x, y);
  outPosition.set(world.x, h, world.z);
  if (outNormal) {
    const e = .6;
    const hx = landscape.heightAtProperty(x + e, y) - h, hy = landscape.heightAtProperty(x, y + e) - h;
    outNormal.set(-hx / (e * .9144), 1, -hy / (e * .9144)).normalize();
  }
  return outPosition;
}
