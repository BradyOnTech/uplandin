import * as THREE from 'three';
import type { TerrainKind } from '../../game/areas';
import type { LandscapeModel } from '../../game/landscape';
import type { Ctx, Quality } from '../engine';
import { buildQuailTerrainGeometry } from './quailTerrain';
import { quailGroundNearDistance, quailGroundTiles, quailGroundUsesNear } from './quailGroundGeometry';
import { fieldTimeOfDay, type TimeOfDay } from '../palette';

type Paint = (landscape: LandscapeModel, x: number, y: number, out: THREE.Color) => THREE.Color;

const PALETTE = {
  prairie: { dark: new THREE.Color(0x6e5d3b), mid: new THREE.Color(0xa78e5d), light: new THREE.Color(0xcdbb83), wet: new THREE.Color(0x697052) },
  wetland: { dark: new THREE.Color(0x5d5637), mid: new THREE.Color(0x9f8752), light: new THREE.Color(0xcab278), wet: new THREE.Color(0x596b58) },
  woods: { dark: new THREE.Color(0x39442d), mid: new THREE.Color(0x68704a), light: new THREE.Color(0x9b9662), wet: new THREE.Color(0x425b4d) },
  rimrock: { dark: new THREE.Color(0x5e5144), mid: new THREE.Color(0x95816b), light: new THREE.Color(0xb9a887), wet: new THREE.Color(0x697261) },
  desert: { dark: new THREE.Color(0x71543b), mid: new THREE.Color(0xa57d51), light: new THREE.Color(0xd0a873), wet: new THREE.Color(0x6d7050) },
  canyon: { dark: new THREE.Color(0x5d3f34), mid: new THREE.Color(0x95624a), light: new THREE.Color(0xc28a61), wet: new THREE.Color(0x62584b) },
  alpine: { dark: new THREE.Color(0x4c514d), mid: new THREE.Color(0x7d8578), light: new THREE.Color(0xb5ae93), wet: new THREE.Color(0x61746a) },
  'oak-savanna': { dark: new THREE.Color(0x5f5030), mid: new THREE.Color(0x9d834a), light: new THREE.Color(0xc3a66a), wet: new THREE.Color(0x5b6945) },
} as const;

/**
 * Terrain kind is the broad geological family; the property still gets the
 * final art direction.  Keeping these small overrides here prevents two
 * maps with the same landform (Hun/Chukar rimrock and pheasant/woodcock
 * wetland) from opening on the same ground color before their bespoke cover
 * systems have had a chance to establish the scene.
 */
const AREA_PALETTE_OVERRIDES: Record<string, Partial<Record<'dark' | 'mid' | 'light' | 'wet', number>>> = {
  'pheasant-coverts': { dark: 0x4c4b33, mid: 0x8f7b48, light: 0xbfa36b, wet: 0x4f6658 },
  'woodcock-bottoms': { dark: 0x3f5140, mid: 0x6f7d5a, light: 0x9ca16f, wet: 0x3f5c57 },
  'grouse-woods': { dark: 0x334331, mid: 0x5d6a46, light: 0x89905e, wet: 0x3e5d4a },
  'sharptail-prairie': { dark: 0x756444, mid: 0xa68f59, light: 0xc8b77e, wet: 0x6c7154 },
  'hun-benches': { dark: 0x625640, mid: 0x9e8b66, light: 0xc8b98f, wet: 0x72745d },
  'chukar-ridge': { dark: 0x514b43, mid: 0x81786b, light: 0xa99c83, wet: 0x626b61 },
  'mearns-canyons': { dark: 0x5c3a2e, mid: 0x8e5943, light: 0xc1875e, wet: 0x5a5545 },
};

/** The generic property ground has its own restrained surface response. It
 * shares the Firewatch-style sun drench with the tuned fields, but does not
 * inherit Quail's litter, stone, and sward assumptions. */
const PROPERTY_SURFACE_DECLS = /* glsl */ `
uniform vec2 uSunXZ;
uniform vec3 uSunTint;
uniform float uSunK;
uniform float uSunEmit;
uniform vec2 uSunRange;
uniform vec3 uCoolTint;
uniform float uCoolK;
uniform float uCloudShK;
uniform float uCloudT;
varying vec3 vPropertyWorld;

float propertyHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float propertyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(propertyHash(i), propertyHash(i + vec2(1.0, 0.0)), f.x),
             mix(propertyHash(i + vec2(0.0, 1.0)), propertyHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const PROPERTY_SURFACE_FRAG = /* glsl */ `
float pFine = propertyNoise(vPropertyWorld.xz * 0.62);
float pMeso = propertyNoise(vPropertyWorld.xz * 0.095 + vec2(19.0, 47.0));
float pMacro = propertyNoise(vPropertyWorld.xz * 0.021 + vec2(71.0, 11.0));
float pDetail = pFine * 0.42 + pMeso * 0.38 + pMacro * 0.20;
diffuseColor.rgb *= 0.93 + pDetail * 0.14;
diffuseColor.rgb *= 1.0 + (pMeso - 0.5) * 0.08;

vec2 pToSun = vPropertyWorld.xz - cameraPosition.xz;
float pDistance = length(pToSun);
float pAzimuth = clamp(dot(pToSun / max(pDistance, 1e-3), uSunXZ), 0.0, 1.0);
float pLobe = pAzimuth * pAzimuth * smoothstep(uSunRange.x, uSunRange.y, pDistance) * uSunK;
float pBloom = pAzimuth * pAzimuth * pAzimuth * pAzimuth * pLobe;
diffuseColor.rgb = mix(diffuseColor.rgb, uSunTint, min(pLobe * 0.52, 0.46));
float pCool = uCoolK * (1.0 - min(pLobe * 2.2, 1.0));
diffuseColor.rgb = mix(diffuseColor.rgb, uCoolTint, pCool * 0.72);

float pCloud = sin(vPropertyWorld.x * 0.081 + uCloudT)
  * sin(vPropertyWorld.z * 0.057 + 1.4 + uCloudT * 0.71);
diffuseColor.rgb *= 1.0 - 0.16 * smoothstep(0.28, 0.78, pCloud) * uCloudShK;
`;

function hash(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(Math.floor(x), 374761393) ^ Math.imul(Math.floor(y), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function paintFor(kind: TerrainKind, seed: number, areaId: string): Paint {
  const base = PALETTE[kind];
  const overrides = AREA_PALETTE_OVERRIDES[areaId];
  const palette = {
    dark: overrides?.dark === undefined ? base.dark : new THREE.Color(overrides.dark),
    mid: overrides?.mid === undefined ? base.mid : new THREE.Color(overrides.mid),
    light: overrides?.light === undefined ? base.light : new THREE.Color(overrides.light),
    wet: overrides?.wet === undefined ? base.wet : new THREE.Color(overrides.wet),
  };
  return (landscape, x, y, out) => {
    const surface = landscape.surfaceAtProperty(x, y, {
      height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
    });
    const broad = hash(x * 0.045 + 12, y * 0.045 + 41, seed);
    const meso = hash(x * 0.21 + 73, y * 0.21 + 19, seed ^ 0x2e15);
    const fine = hash(x * 0.9 + 7, y * 0.9 + 31, seed ^ 0xb0bde7);
    const slope = THREE.MathUtils.clamp(surface.slope * 1.15, 0, 1);
    const rock = THREE.MathUtils.clamp(surface.rockiness * 0.88 + slope * 0.16, 0, 1);
    const moisture = THREE.MathUtils.clamp(surface.moisture, 0, 1);
    const fertility = THREE.MathUtils.clamp(surface.vegetation, 0, 1);
    out.copy(palette.dark).lerp(palette.mid, 0.32 + broad * 0.46);
    out.lerp(palette.light, fertility * (0.12 + meso * 0.18));
    out.lerp(palette.wet, moisture * (0.22 + (1 - broad) * 0.28));
    out.lerp(palette.dark, rock * 0.28);
    out.multiplyScalar(0.91 + meso * 0.14 + fine * 0.055);
    return out;
  };
}

/** Full-property terrain for every non-specialized map. It replaces the old
 * drop-centered 480 m plate with the same tiled heightfield used by the tuned
 * fields, so the authored world remains continuous while the camera travels. */
export class PropertyTerrain {
  private tiles: { near: THREE.Mesh; far: THREE.Mesh; x: number; z: number }[] = [];
  private horizon: THREE.Mesh[] = [];
  private material: THREE.MeshLambertMaterial;
  private paint: Paint;
  private nearDistance: number;
  private abort = new AbortController();
  private light = {
    uSunXZ: { value: new THREE.Vector2(1, 0) },
    uSunTint: { value: new THREE.Color() },
    uSunK: { value: 0 },
    uSunEmit: { value: 0 },
    uSunRange: { value: new THREE.Vector2(20, 80) },
    uCoolTint: { value: new THREE.Color() },
    uCoolK: { value: 0 },
    uCloudShK: { value: 0 },
    uCloudT: { value: 0 },
  };

  constructor(private readonly landscape: LandscapeModel) {
    this.paint = paintFor(landscape.area.terrain.kind, landscape.area.terrain.seed, landscape.area.id);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const uniforms = this.light;
    this.material.customProgramCacheKey = () => `property-surface-v1-${landscape.area.terrain.kind}`;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPropertyWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvPropertyWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + PROPERTY_SURFACE_DECLS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + PROPERTY_SURFACE_FRAG)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uSunTint * ( pLobe * 0.34 + pBloom * 0.62 ) * uSunEmit;');
    };
    this.nearDistance = quailGroundNearDistance('high');
  }

  init(ctx: Ctx): void {
    this.nearDistance = quailGroundNearDistance(ctx.quality as Quality);
    this.applyTod(ctx.timeOfDay);
    ctx.events.addEventListener('tod', (event) => {
      const tod = (event as CustomEvent<TimeOfDay>).detail;
      this.applyTod(tod);
    }, { signal: this.abort.signal });
    for (const tile of quailGroundTiles(this.landscape)) {
      const near = new THREE.Mesh(buildQuailTerrainGeometry(this.landscape, tile.x, tile.y, tile.width, tile.depth, ctx.quality === 'high' ? 48 : 24, this.paint), this.material);
      const far = new THREE.Mesh(buildQuailTerrainGeometry(this.landscape, tile.x, tile.y, tile.width, tile.depth, 14, this.paint), this.material);
      near.name = `${this.landscape.area.name} near terrain`;
      far.name = `${this.landscape.area.name} distant terrain`;
      near.receiveShadow = far.receiveShadow = true;
      this.tiles.push({ near, far, x: tile.centerX, z: tile.centerZ });
      ctx.scene.add(near, far);
    }
    const bounds = this.landscape.area.world;
    const margin = 1000;
    const strips: [number, number, number, number][] = [
      [bounds.x - margin, bounds.y - margin, bounds.w + margin * 2, margin],
      [bounds.x - margin, bounds.y + bounds.h, bounds.w + margin * 2, margin],
      [bounds.x - margin, bounds.y, margin, bounds.h],
      [bounds.x + bounds.w, bounds.y, margin, bounds.h],
    ];
    for (const [x, y, width, depth] of strips) {
      const mesh = new THREE.Mesh(buildQuailTerrainGeometry(this.landscape, x, y, width, depth, 42, this.paint), this.material);
      mesh.name = `${this.landscape.area.name} horizon ground`;
      mesh.receiveShadow = true;
      this.horizon.push(mesh);
      ctx.scene.add(mesh);
    }
    this.update(ctx);
  }

  private applyTod(tod: TimeOfDay): void {
    const spec = fieldTimeOfDay(this.landscape.area.id, tod);
    const azimuth = THREE.MathUtils.degToRad(spec.sunAzimuth);
    this.light.uSunXZ.value.set(Math.sin(azimuth), Math.cos(azimuth));
    this.light.uSunTint.value.setHex(spec.groundSunTint);
    this.light.uSunK.value = spec.groundSunK;
    this.light.uSunEmit.value = spec.groundSunEmit;
    this.light.uSunRange.value.set(spec.groundSunNear, spec.groundSunFar);
    this.light.uCoolTint.value.setHex(spec.groundCoolTint);
    this.light.uCoolK.value = spec.groundCoolK;
    this.light.uCloudShK.value = spec.cloudAmount
      * THREE.MathUtils.clamp((spec.sunElevation - 15) / 20, 0, 1);
  }

  update(ctx: Ctx): void {
    this.light.uCloudT.value = ctx.time;
    for (const tile of this.tiles) {
      const near = quailGroundUsesNear(tile.x, tile.z, ctx.camera.position.x, ctx.camera.position.z, this.nearDistance);
      tile.near.visible = near;
      tile.far.visible = !near;
    }
  }

  dispose(ctx: Ctx): void {
    this.abort.abort();
    for (const tile of this.tiles) {
      ctx.scene.remove(tile.near, tile.far);
      tile.near.geometry.dispose();
      tile.far.geometry.dispose();
    }
    for (const mesh of this.horizon) {
      ctx.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.material.dispose();
    this.tiles.length = 0;
    this.horizon.length = 0;
  }
}
