import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { quailCoverAt, quailDrainageAt, quailSwardAt } from '../../game/quailLandscape';
import type { Ctx } from '../engine';
import { quailTrackDistanceAt } from './quailTracks';
import { quailGrassMassAt, quailGrassStockingAt, quailSouthRouteAt } from './quailVegetation';
import { QUAIL_GROUND_DIVISIONS, quailGroundNearDistance, quailGroundTiles, quailGroundUsesNear } from './quailGroundGeometry';

export { QUAIL_TERRAIN_TILE } from './quailGroundGeometry';
const PAINT = {
  straw: new THREE.Color(0xac976d),
  pale: new THREE.Color(0xc4a66e),
  cover: new THREE.Color(0xb7a174),
  drain: new THREE.Color(0x526c60),
  road: new THREE.Color(0xd1b48a),
  litter: new THREE.Color(0x786448),
  sward: new THREE.Color(0x858461),
  openSoil: new THREE.Color(0xab9273),
  edgeLitter: new THREE.Color(0x83744d),
};
const routeSurface = { dry: 0, edge: 0 };

function sweep(x: number, y: number): number {
  return (Math.sin(x * 0.018 + Math.sin(y * 0.012) * 1.2) + Math.cos(y * 0.014 - x * 0.005)) * 0.25 + 0.5;
}

/** A single color recipe continues underneath the close vegetation and into the distance. */
export function paintQuailGround(landscape: LandscapeModel, x: number, y: number, out: THREE.Color): THREE.Color {
  const cover = quailCoverAt(landscape.area, x, y);
  const mass = quailGrassMassAt(landscape.area, x, y);
  const draw = quailDrainageAt(x, y);
  const variation = sweep(x, y);
  const stocking = quailGrassStockingAt(x, y);
  out.copy(PAINT.sward).lerp(PAINT.straw, 0.28 + variation * 0.32);
  out.lerp(PAINT.cover, cover * .22 + mass * .46);
  // Stocked clumps sit in a darker litter bed; gaps reveal warmer dry soil.
  out.lerp(PAINT.litter, mass * (.14 + stocking * .25));
  out.lerp(PAINT.pale, (1 - stocking) * (1 - draw) * .17);
  out.lerp(PAINT.drain, draw * 0.68);
  const sward = quailSwardAt(x, y);
  out.lerp(PAINT.litter, Math.max(0, (0.48 - sward) * 1.7) * (1 - cover * 0.55));
  out.lerp(PAINT.sward, Math.max(0, (sward - 0.52) * 1.5));
  if (landscape.area.id === 'quail-fields') {
    quailSouthRouteAt(x, y, routeSurface);
    out.lerp(PAINT.openSoil, routeSurface.dry * (.45 + (1 - stocking) * .25));
    out.lerp(PAINT.edgeLitter, routeSurface.edge * cover * .40);
  }
  const road = quailTrackDistanceAt(landscape.area, x, y, 16) * PROPERTY_PX_TO_M;
  out.lerp(PAINT.road, Math.max(0, 1 - road / 1.8) * 0.25);
  return out.multiplyScalar(0.94 + variation * 0.1);
}

/** All edge vertices share exact property coordinates; skirts close differences between LODs. */
export function buildQuailTerrainGeometry(
  landscape: LandscapeModel, px: number, py: number, width: number, depth: number, divisions: number,
  paint: typeof paintQuailGround = paintQuailGround,
): THREE.BufferGeometry {
  const positions: number[] = []; const colors: number[] = []; const indices: number[] = [];
  const world = { x: 0, z: 0 }; const color = new THREE.Color();
  const add = (x: number, y: number, sink = 0) => {
    landscape.propertyToWorld(x, y, world);
    positions.push(world.x, landscape.heightAtProperty(x, y) - sink, world.z);
    paint(landscape, x, y, color); colors.push(color.r, color.g, color.b);
  };
  for (let z = 0; z <= divisions; z++) {
    for (let x = 0; x <= divisions; x++) add(px + x / divisions * width, py + z / divisions * depth);
  }
  for (let z = 0; z < divisions; z++) {
    for (let x = 0; x < divisions; x++) {
      const a = z * (divisions + 1) + x; const b = a + divisions + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // Vertical edges sit below the walking surface, including at property corners.
  for (let edge = 0; edge < 4; edge++) {
    let prevTop = -1; let prevBottom = -1;
    for (let n = 0; n <= divisions; n++) {
      const t = n / divisions;
      const x = px + (edge === 0 ? t : edge === 1 ? 1 : edge === 2 ? 1 - t : 0) * width;
      const y = py + (edge === 0 ? 0 : edge === 1 ? t : edge === 2 ? 1 : 1 - t) * depth;
      const top = positions.length / 3; add(x, y); const bottom = positions.length / 3; add(x, y, 0.85);
      if (n > 0) indices.push(prevTop, top, bottom, prevTop, bottom, prevBottom);
      prevTop = top; prevBottom = bottom;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

/** Quiet matte soil detail, shared by ground and trail in property coordinates. */
export function applyQuailSurfaceDetail(material: THREE.MeshLambertMaterial, landscape: LandscapeModel, fieldGround = false,
  painted?: { texture: {value:THREE.Texture|null}; strength:{value:number} }): void {
    material.customProgramCacheKey=()=>`field-surface-v3-${fieldGround?'field':'track'}-${painted?'painted':'procedural'}`;
    const origin = landscape.worldToProperty(0, 0, { x: 0, y: 0 });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uFieldGround = { value: fieldGround ? 1 : 0 };
      shader.uniforms.uPropertyOrigin = { value: new THREE.Vector2(origin.x, origin.y) };
      if(painted){shader.uniforms.uPaintedSoil=painted.texture;shader.uniforms.uPaintedSoilK=painted.strength;}
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vQuailGround;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvQuailGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vQuailGround;
        uniform vec2 uPropertyOrigin;
        uniform float uFieldGround;
        ${painted ? 'uniform sampler2D uPaintedSoil; uniform float uPaintedSoilK;' : ''}
        float quailHash(vec2 p) {
          // Small multipliers retain float precision even far from the origin.
          vec3 h = fract(vec3(p.xyx) * 0.1031);
          h += dot(h, h.yzx + 33.33); return fract((h.x + h.y) * h.z);
        }
        float quailNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(quailHash(i), quailHash(i + vec2(1.0, 0.0)), f.x), mix(quailHash(i + vec2(0.0, 1.0)), quailHash(i + vec2(1.0, 1.0)), f.x), f.y); }
      `).replace('#include <color_fragment>', `#include <color_fragment>
        vec2 p = vQuailGround / 0.9144 + uPropertyOrigin;
        // Equal-axis samples avoid the repeated horizontal ripples of the
        // previous stretched noise. Rotation breaks alignment with tile edges.
        vec2 grainSpace = mat2(0.8, -0.6, 0.6, 0.8) * p;
        float drift = quailNoise(grainSpace * 0.095 + vec2(131.0, 23.0));
        float soil = quailNoise(grainSpace * 0.53 + vec2(39.0, 91.0));
        vec2 gritSpace = grainSpace * 7.5;
        float grit = quailNoise(gritSpace);
        vec2 footprint = fwidth(gritSpace);
        float resolved = 1.0 - smoothstep(0.35, 1.5, max(footprint.x, footprint.y));
        float fineRange = 1.0 - smoothstep(25.0, 65.0, length(vQuailGround - cameraPosition.xz));
        // Broad habitat paint supplies the composition; grain should not look
        // like shiny ridges or compete with the dog's silhouette in the field.
        diffuseColor.rgb *= 0.98 + (drift - 0.5) * 0.12 + (soil - 0.5) * 0.13
          + (grit - 0.5) * 0.085 * fineRange * resolved;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.96, 0.98, 0.91), smoothstep(0.48, 0.80, drift) * 0.38);
        // Broken soil/low-growth islands carry the surface between individual
        // grass tufts. The route material retains its own worn-rut palette.
        float patchNoise = quailNoise(grainSpace * 1.25 + vec2(17.0, 67.0));
        float patchField = soil * 0.57 + drift * 0.28 + patchNoise * 0.15;
        float patchAA = max(fwidth(patchField), 0.025);
        float drySoil = smoothstep(0.46 - patchAA, 0.56 + patchAA, patchField);
        float lowGrowth = 1.0 - smoothstep(0.35 - patchAA, 0.45 + patchAA, patchField);
        vec3 surfaceTint = mix(vec3(1.0), vec3(1.19, 1.03, 0.81), drySoil * 0.78);
        surfaceTint = mix(surfaceTint, vec3(0.70, 0.81, 0.75), lowGrowth * 0.74);
        diffuseColor.rgb *= mix(vec3(1.0), surfaceTint, uFieldGround);
        // Sparse flattened stems bind the exposed soil to the standing grass.
        // World-aligned cells and derivative filtering keep tile/LOD seams and
        // unresolved subpixel strokes out of this close-range material layer.
        vec2 litterSpace = p * 1.65;
        vec2 litterCell = floor(litterSpace);
        float litterSeed = quailHash(litterCell + vec2(73.0, 19.0));
        float litterAngle = litterSeed * 6.2831853;
        vec2 litterLocal = fract(litterSpace) - vec2(0.5);
        vec2 litterAxis = mat2(cos(litterAngle), -sin(litterAngle), sin(litterAngle), cos(litterAngle)) * litterLocal;
        float litterAA = max(fwidth(litterAxis.x), fwidth(litterAxis.y));
        float stem = (1.0 - smoothstep(0.012, 0.012 + litterAA, abs(litterAxis.x)))
          * (1.0 - smoothstep(0.15, 0.15 + litterAA, abs(litterAxis.y)));
        float litterVisibility = (1.0 - smoothstep(0.025, 0.12, litterAA))
          * (1.0 - smoothstep(9.0, 24.0, length(vQuailGround - cameraPosition.xz)));
        float litterAmount = stem * litterVisibility * smoothstep(0.40, 0.72, litterSeed) * 0.46;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16, 1.09, 0.91), litterAmount);
        // Small broken stone faces sit among the fallen stems. Derivatives
        // remove them before they become noisy pixels in distant soil; all
        // coordinates remain continuous across terrain tiles and detail tiers.
        vec2 stoneSpace = p * 3.1;
        vec2 stoneCell = floor(stoneSpace);
        float stoneSeed = quailHash(stoneCell + vec2(127.0, 53.0));
        vec2 stoneLocal = fract(stoneSpace) - vec2(.32 + stoneSeed * .32, .5);
        float stoneAngle = stoneSeed * 6.2831853;
        stoneLocal = mat2(cos(stoneAngle), -sin(stoneAngle), sin(stoneAngle), cos(stoneAngle)) * stoneLocal;
        float stoneShape = max(abs(stoneLocal.x) * .78 + abs(stoneLocal.y), abs(stoneLocal.x) * 1.15);
        float stoneAA = max(fwidth(stoneShape), .001);
        float stone = (1.0 - smoothstep(.045, .045 + stoneAA, stoneShape))
          * smoothstep(.76, .89, stoneSeed) * (1.0 - smoothstep(.025, .09, stoneAA))
          * (1.0 - smoothstep(5.0, 16.0, length(vQuailGround - cameraPosition.xz)));
        vec3 stoneTint = mix(vec3(.63, .64, .61), vec3(1.24, 1.18, 1.06), smoothstep(-stoneAA, stoneAA, stoneLocal.x + stoneLocal.y * .4));
        diffuseColor.rgb *= mix(vec3(1.0), stoneTint, stone * .72);
        ${painted ? `
        // Painted detail is a neutral modulation of the habitat colors, not a
        // replacement for their drainage/cover recipe. Two unrelated scales
        // soften the repeat; mipmaps and distance fade keep the horizon quiet.
        vec3 paintedA = texture2D(uPaintedSoil, p / 3.6).rgb;
        vec3 paintedB = texture2D(uPaintedSoil, mat2(.8,-.6,.6,.8) * p / 6.7 + vec2(.31,.67)).rgb;
        vec3 paintedColor = mix(paintedA, paintedB, .26);
        vec3 paintedVariation = clamp(paintedColor / vec3(.40,.32,.19), vec3(.60), vec3(1.38));
        float paintedRange = 1.0 - smoothstep(22.0, 85.0, length(vQuailGround - cameraPosition.xz));
        diffuseColor.rgb *= mix(vec3(1.0), paintedVariation, paintedRange * uPaintedSoilK);
        ` : ''}
      `);
    };
}

interface Tile { near: THREE.Mesh; far: THREE.Mesh; x: number; z: number }
export class QuailTerrain {
  private tiles: Tile[] = [];
  private horizon: THREE.Mesh[] = [];
  private material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private nearDistance = quailGroundNearDistance('high');
  private painted={texture:{value:null as THREE.Texture|null},strength:{value:0}};

  constructor(private readonly landscape: LandscapeModel) {
    applyQuailSurfaceDetail(this.material, landscape, true, this.painted);
  }

  async init(ctx: Ctx): Promise<void> {
    this.painted.texture.value=await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}textures/terrain/prairie-painted.webp`);
    const texture=this.painted.texture.value;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=ctx.quality==='high'?4:2;texture.needsUpdate=true;this.painted.strength.value=.72;
    this.nearDistance = quailGroundNearDistance(ctx.quality);
    const bounds = this.landscape.area.world;
    for (const tile of quailGroundTiles(this.landscape)) {
        const { x: px, y: py, width: w, depth: h } = tile;
        const near = new THREE.Mesh(buildQuailTerrainGeometry(this.landscape, px, py, w, h, QUAIL_GROUND_DIVISIONS.near), this.material);
        const far = new THREE.Mesh(buildQuailTerrainGeometry(this.landscape, px, py, w, h, QUAIL_GROUND_DIVISIONS.far), this.material);
        near.name = `Quail terrain ${px},${py} near`; far.name = `Quail terrain ${px},${py} far`;
        near.receiveShadow = true; far.receiveShadow = true;
        this.tiles.push({ near, far, x: tile.centerX, z: tile.centerZ }); ctx.scene.add(near, far);
    }
    // Genuine continued heightfield outside the fence: no circular plate and no visible void from either drop.
    const margin = 1100;
    for (const [x, y, w, h] of [
      [-margin, -margin, bounds.w + margin * 2, margin],
      [-margin, bounds.h, bounds.w + margin * 2, margin],
      [-margin, 0, margin, bounds.h], [bounds.w, 0, margin, bounds.h],
    ]) {
      const mesh = new THREE.Mesh(buildQuailTerrainGeometry(this.landscape, x, y, w, h, 96), this.material);
      mesh.name = 'Quail distant prairie'; mesh.receiveShadow = true; this.horizon.push(mesh); ctx.scene.add(mesh);
    }
    this.update(ctx);
  }

  update(ctx: Ctx): void {
    const x = ctx.camera.position.x; const z = ctx.camera.position.z;
    for (const tile of this.tiles) {
      const near = quailGroundUsesNear(tile.x, tile.z, x, z, this.nearDistance);
      tile.near.visible = near; tile.far.visible = !near;
    }
  }

  dispose(ctx: Ctx): void {
    for (const tile of this.tiles) {
      ctx.scene.remove(tile.near, tile.far); tile.near.geometry.dispose(); tile.far.geometry.dispose();
    }
    for (const mesh of this.horizon) { ctx.scene.remove(mesh); mesh.geometry.dispose(); }
    this.material.dispose(); this.tiles.length = 0; this.horizon.length = 0;
    this.painted.texture.value?.dispose();
  }
}
