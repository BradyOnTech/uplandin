import * as THREE from 'three';
import { sharptailGroundZones } from '../../game/sharptailLandscape';
import { sharptailAccentGroundAt } from './sharptailAccents';
import { sharptailStoneClearance } from '../../game/sharptailFeatures';
import { sampleSharptailVegetationBands } from '../../game/sharptailVegetationBands';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';
import type { Ctx } from '../engine';
import { sharptailGrassOpening, sharptailMeadowAt } from './sharptailMeadow';
import { VegetationWind, VEGETATION_GUST_GLSL, VEGETATION_INSTANCE_WIND_GLSL } from './vegetationWind';
import type { PrairieCanopySurface } from './propertyTerrain';
import { sampleSharptailHorizonSurface } from './sharptailHorizonGeometry';
import { sampleQuailGroundHeights } from './quailGroundGeometry';

/** Spatial chunks share one twelve-triangle opaque bunch. The whole stored
 * property is larger than the old sheet budget, but only nearby chunks enter
 * the renderer. No roots, matrices or geometry are rebuilt during movement. */
export const SHARPTAIL_MID_SWARD_BUDGET = {
  rootStepYards: 4, chunkYards: 100, trianglesPerBunch: 12,
  highTriangles: 800000, liteTriangles: 480000,
} as const;

function noise(x: number, y: number, salt: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ salt;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

/** Six narrow, upright leaves bend away from a common basal crown. Each
 * has a tapered shoulder and a fine tip. Short lateral reach keeps these
 * distant tufts in the same straw vocabulary as the close grass. */
export function sharptailMiddleBunchGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], roots: number[] = [], bends: number[] = [];
  const forms = [
    { yaw: -.62, height: .60, reach: .26, width: .025 },
    { yaw: .57, height: .47, reach: .32, width: .029 },
    { yaw: 2.34, height: .72, reach: .17, width: .023 },
    { yaw: 3.81, height: .53, reach: .28, width: .026 },
    { yaw: 1.47, height: .64, reach: .23, width: .024 },
    { yaw: 4.82, height: .41, reach: .34, width: .030 },
  ];
  for (const leaf of forms) {
    const dx = Math.cos(leaf.yaw), dz = Math.sin(leaf.yaw);
    const side = new THREE.Vector3(-dz, 0, dx);
    const center = new THREE.Vector3((dx + .18) * leaf.reach * .26, leaf.height * .61, (dz + .06) * leaf.reach * .26);
    const tip = new THREE.Vector3((dx + .18) * leaf.reach, leaf.height, (dz + .06) * leaf.reach);
    const vertices = [new THREE.Vector3(), center.clone().addScaledVector(side, -leaf.width),
      center.clone().addScaledVector(side, leaf.width), tip];
    const levels = [0, .61, .61, 1];
    for (const face of [[0, 2, 1], [1, 2, 3]]) {
      for (const index of face) {
        const p = vertices[index], t = levels[index];
        // Match close-grass lighting: a blade receives the sky like its
        // surrounding sward, regardless of which thin side faces the camera.
        positions.push(p.x, p.y, p.z); normals.push(0, 1, 0);
        const value = .88 + .12 * t;
        colors.push(value, value, value * .92); roots.push(0, 0, 0); bends.push(t * t);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('prairieRoot', new THREE.Float32BufferAttribute(roots, 3));
  geometry.setAttribute('prairieBend', new THREE.Float32BufferAttribute(bends, 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { kind: 'sharptail-rooted-middle-bunch', triangles: positions.length / 9 };
  return geometry;
}

export class SharptailMidSward {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly clock = { value: 0 };
  private readonly material: THREE.MeshLambertMaterial;
  private readonly geometry = sharptailMiddleBunchGeometry();
  private disposed = false;

  constructor(landscape: LandscapeModel, ctx: Ctx, wind = new VegetationWind(), surface?: PrairieCanopySurface) {
    const lite = ctx.quality === 'lite';
    // The supplied clone belongs to this layer; its ground-normal shader is
    // unsuitable for upright leaves. Disposing a material does not dispose
    // the textures/uniform values still owned by the terrain.
    surface?.material.dispose();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.material.onBeforeCompile = shader => {
      shader.uniforms.uPrairieTime = this.clock;
      shader.uniforms.uPrairieWind = wind.direction;
      shader.uniforms.uPrairieWindStrength = wind.strength;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute vec3 prairieRoot;
attribute float prairieBend;
uniform float uPrairieTime;
uniform vec2 uPrairieWind;
uniform float uPrairieWindStrength;
${VEGETATION_GUST_GLSL}
${VEGETATION_INSTANCE_WIND_GLSL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 prairieRootWorld = (modelMatrix * instanceMatrix * vec4(prairieRoot, 1.)).xyz;
float prairieDistance = distance(prairieRootWorld.xz, cameraPosition.xz);
float prairieKeep = smoothstep(${lite ? '20.0, 36.0' : '30.0, 50.0'}, prairieDistance)
  * (1.0 - smoothstep(PRAIRIE_FADE_START, PRAIRIE_FADE_END, prairieDistance));
transformed = prairieRoot + (position - prairieRoot) * prairieKeep;
transformed += vegetationInstanceWind(uPrairieWind) * vegetationGust(uPrairieTime, prairieRootWorld.xz, uPrairieWind)
  * uPrairieWindStrength * .045 * prairieBend * prairieKeep;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    };
    this.material.defines = { PRAIRIE_FADE_START: '220.0', PRAIRIE_FADE_END: '250.0' };
    this.material.customProgramCacheKey = () => `sharptail-upright-middle-grass-v2-${lite ? 'lite' : 'high'}`;

    const zones = { swale: 0, stand: 0 }, meadow = { crown: 0, hollow: 0, cured: 0, exposed: 0 };
    const bands = { scrub: 0, grass: 0, litter: 0 }, world = { x: 0, z: 0 };
    const renderedSurface = { height: 0, gradeX: 0, gradeZ: 0 };
    const position = new THREE.Vector3(), scale = new THREE.Vector3(), normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const rotation = new THREE.Quaternion(), yaw = new THREE.Quaternion(), matrix = new THREE.Matrix4(), color = new THREE.Color();
    const dry = new THREE.Color(0xc2ad76), sheltered = new THREE.Color(0xb1ab7b), cured = new THREE.Color(0xbda16b);
    const step = SHARPTAIL_MID_SWARD_BUDGET.rootStepYards, cells = SHARPTAIL_MID_SWARD_BUDGET.chunkYards / step;
    const shack = landscape.area.landmarks.find(item => item.kind === 'barn');
    const area = landscape.area.world;
    for (let tileY = 0; tileY < 9; tileY++) for (let tileX = -4; tileX < 14; tileX++) {
      const exterior = tileX < 0;
      if ((!exterior && tileY >= 8) || (exterior && tileY < 3)) continue;
      const matrices: THREE.Matrix4[] = [], colors: THREE.Color[] = [];
      for (let iz = 0; iz < cells; iz++) for (let ix = 0; ix < cells; ix++) {
        const gx = tileX * cells + ix, gy = tileY * cells + iz;
        // The sparse background remains one candidate per cell. Four lower
        // offsets fill only the connected grass bands, so the draw reads as
        // a swath instead of a row of isolated larger plants. Lite keeps
        // most of this fill and thins the open background as before.
        for (let slot = 0; slot < 5; slot++) {
          const salt = slot * 619;
          const px = area.x + (gx + (slot === 0 ? .12 + noise(gx, gy, 31) * .76
            : .30 + ((slot - 1) % 2) * .40 + (noise(gx, gy, salt + 31) - .5) * .30)) * step;
          const py = area.y + (gy + (slot === 0 ? .12 + noise(gx, gy, 71) * .76
            : .30 + Math.floor((slot - 1) / 2) * .40 + (noise(gx, gy, salt + 71) - .5) * .30)) * step;
          if (exterior && py < 350) continue;
          sampleSharptailVegetationBands(px, py, bands);
          if (slot > 0 && bands.grass <= .2) continue;
          sharptailGroundZones(px, py, zones); sharptailMeadowAt(px, py, zones.swale, meadow);
          let cover = (1 - sharptailGrassOpening(meadow.exposed, zones.stand) * .88)
            * sharptailStoneClearance(px, py) * (1 - sharptailAccentGroundAt(px, py) * .82);
          if (shack) cover *= THREE.MathUtils.smoothstep(Math.hypot(px - shack.position.x, py - shack.position.y), 9, 16);
          for (const trail of landscape.area.trails) for (let i = 1; i < trail.points.length; i++) {
            const a = trail.points[i - 1], b = trail.points[i], dx = b.x - a.x, dy = b.y - a.y;
            const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
            cover *= THREE.MathUtils.smoothstep(Math.hypot(px - a.x - t * dx, py - a.y - t * dy), 2.3, 5.2);
          }
          const rank = Math.max(zones.stand * .72, meadow.hollow, bands.grass);
          const density = (exterior ? .38 + bands.grass * .60 : .50 + rank * .40) * cover * (1 - bands.litter * .35);
          if (slot === 0) {
            if (noise(gx, gy, 131) > density || (lite && noise(gx, gy, 191) > .50)) continue;
          } else if (noise(gx, gy, salt + 131) > THREE.MathUtils.smoothstep(bands.grass, .2, .68) * cover * (1 - bands.litter * .20)
            || (lite && noise(gx, gy, salt + 191) > .60)) continue;
          landscape.propertyToWorld(px, py, world);
          let floor: number, gradeX: number, gradeZ: number;
          if (exterior && sampleSharptailHorizonSurface(landscape, px, py, renderedSurface)) {
            // Exterior scenery is a coarse triangle mesh, not the analytic
            // heightfield. Its visible plane is the root/contact authority.
            ({ height: floor, gradeX, gradeZ } = renderedSurface);
          } else {
            floor = landscape.heightAtProperty(px, py);
            const probe = .5 / PROPERTY_PX_TO_M;
            gradeX = (landscape.heightAtProperty(px + probe, py) - floor) / .5;
            gradeZ = (landscape.heightAtProperty(px, py + probe) - floor) / .5;
            const ground = sampleQuailGroundHeights(landscape, px, py, undefined, { near: lite ? 24 : 48, far: 14 });
            // A fixed basal crown must remain beneath either rendered LOD.
            // Analytic ground alone can sit visibly above a coarse triangle.
            floor = Math.min(floor, ground.nearY, ground.farY);
          }
          position.set(world.x, floor - .01, world.z);
          normal.set(-gradeX, 1, -gradeZ).normalize(); rotation.setFromUnitVectors(up, normal);
          yaw.setFromAxisAngle(up, noise(gx, gy, salt + 241) * Math.PI * 2); rotation.multiply(yaw);
          const vigor = slot === 0 ? .78 + rank * .36 + noise(gx, gy, 293) * .20
            : 1.16 + bands.grass * .28 + noise(gx, gy, salt + 293) * .12;
          scale.set(1.05 + rank * .25, vigor, 1.05 + rank * .25);
          matrices.push(matrix.compose(position, rotation, scale).clone());
          color.copy(dry).lerp(sheltered, Math.max(meadow.hollow, bands.grass * .55) * .42).lerp(cured, meadow.cured * .40)
            .multiplyScalar(.95 + noise(gx, gy, salt + 337) * .09);
          colors.push(color.clone());
        }
      }
      if (!matrices.length) continue;
      const material = exterior ? this.exteriorMaterial() : this.material;
      const mesh = new THREE.InstancedMesh(this.geometry, material, matrices.length);
      for (let i = 0; i < matrices.length; i++) { mesh.setMatrixAt(i, matrices[i]); mesh.setColorAt(i, colors[i]); }
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true;
      mesh.name = `Sharptail rooted sward ${tileX},${tileY}`;
      mesh.userData = { kind: 'sharptail-rooted-middle-sward', exterior, range: exterior ? 450 : 250,
        triangles: matrices.length * SHARPTAIL_MID_SWARD_BUDGET.trianglesPerBunch };
      mesh.matrixAutoUpdate = false; mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      // Keep all shader wind offsets inside Three's normal frustum culling.
      mesh.boundingSphere!.radius += .12;
      ctx.scene.add(mesh); this.meshes.push(mesh);
    }
    this.update(ctx);
  }

  private outerMaterial?: THREE.MeshLambertMaterial;
  private exteriorMaterial(): THREE.MeshLambertMaterial {
    if (!this.outerMaterial) {
      this.outerMaterial = this.material.clone();
      this.outerMaterial.onBeforeCompile = this.material.onBeforeCompile;
      this.outerMaterial.customProgramCacheKey = this.material.customProgramCacheKey;
      this.outerMaterial.defines = { PRAIRIE_FADE_START: '380.0', PRAIRIE_FADE_END: '450.0' };
    }
    return this.outerMaterial;
  }

  update(ctx: Ctx): void {
    this.clock.value = ctx.time;
    for (const mesh of this.meshes) {
      const bounds = mesh.boundingSphere!;
      mesh.visible = Math.hypot(ctx.camera.position.x - bounds.center.x, ctx.camera.position.z - bounds.center.z)
        < mesh.userData.range + bounds.radius;
    }
  }

  dispose(ctx: Ctx): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.meshes) { ctx.scene.remove(mesh); mesh.dispose(); }
    this.meshes.length = 0; this.geometry.dispose(); this.material.dispose(); this.outerMaterial?.dispose();
  }
}
