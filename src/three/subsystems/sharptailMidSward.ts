import * as THREE from 'three';
import { sharptailGroundZones } from '../../game/sharptailLandscape';
import { sharptailAccentGroundAt } from './sharptailAccents';
import { sharptailStoneClearance } from '../../game/sharptailFeatures';
import type { LandscapeModel } from '../../game/landscape';
import type { Ctx } from '../engine';
import { SHARPTAIL_MEADOW_COLORS, sharptailGrassOpening, sharptailMeadowAt } from './sharptailMeadow';
import { VegetationWind, VEGETATION_GUST_GLSL } from './vegetationWind';
import type { PrairieCanopySurface } from './propertyTerrain';

/** A continuous low canopy represents unresolved native grass beyond the
 * individual leaves. It follows real landforms and habitat, with no floating
 * oversized leaves or scattered alpha cards. High/Lite share the same height
 * function; only grid resolution changes. Every vertex has a ground anchor. */
export const SHARPTAIL_MID_SWARD_BUDGET = { highStep: 4, liteStep: 6, highTriangles: 120000, liteTriangles: 54000 } as const;

export class SharptailMidSward {
  readonly meshes: THREE.Mesh[] = [];
  private readonly clock = { value: 0 };
  private readonly material: THREE.MeshLambertMaterial;

  constructor(landscape: LandscapeModel, ctx: Ctx, wind = new VegetationWind(), surface?: PrairieCanopySurface) {
    const area = landscape.area.world, origin = { x: 0, z: 0 }, end = { x: 0, z: 0 };
    landscape.propertyToWorld(area.x, area.y, origin);
    landscape.propertyToWorld(area.x + area.w, area.y + area.h, end);
    const spacing = ctx.quality === 'lite' ? SHARPTAIL_MID_SWARD_BUDGET.liteStep : SHARPTAIL_MID_SWARD_BUDGET.highStep;
    const columns = Math.ceil((end.x - origin.x) / spacing), rows = Math.ceil((end.z - origin.z) / spacing);
    const perCell = Math.floor(160 / spacing);
    const zones = { swale: 0, stand: 0 }, meadow = { crown: 0, hollow: 0, cured: 0, exposed: 0 };
    const property = { x: 0, y: 0 }, color = new THREE.Color();
    const crown = new THREE.Color(SHARPTAIL_MEADOW_COLORS.crown), hollow = new THREE.Color(SHARPTAIL_MEADOW_COLORS.hollow);
    const cured = new THREE.Color(SHARPTAIL_MEADOW_COLORS.cured);
    const shack = landscape.area.landmarks.find(item => item.kind === 'barn');
    this.material = surface?.material ?? new THREE.MeshLambertMaterial({ vertexColors: true });
    const surfaceCompile = this.material.onBeforeCompile, surfaceKey = this.material.customProgramCacheKey();
    this.material.onBeforeCompile = (shader, renderer) => {
      surfaceCompile.call(this.material, shader, renderer);
      shader.uniforms.uPrairieTime = this.clock;
      shader.uniforms.uPrairieWind = wind.direction;
      shader.uniforms.uPrairieWindStrength = wind.strength;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute float prairieFloor;
attribute float prairieFlex;
uniform float uPrairieTime;
uniform vec2 uPrairieWind;
uniform float uPrairieWindStrength;
${VEGETATION_GUST_GLSL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float prairieDistance = distance(position.xz, cameraPosition.xz);
float prairieKeep = smoothstep(18.0, 34.0, prairieDistance) * (1.0 - smoothstep(200.0, 280.0, prairieDistance));
transformed.y = prairieFloor + (position.y - prairieFloor) * prairieKeep;
transformed.y += vegetationGust(uPrairieTime, position.xz, uPrairieWind) * .025 * uPrairieWindStrength * prairieFlex * prairieKeep;`);
    };
    this.material.customProgramCacheKey = () => `${surfaceKey}-sharptail-connected-middle-sward-v4`;
    for (let row = 0; row < rows; row += perCell) for (let column = 0; column < columns; column += perCell) {
      const width = Math.min(perCell, columns - column), depth = Math.min(perCell, rows - row);
      const positions: number[] = [], colors: number[] = [], floors: number[] = [], flex: number[] = [], indices: number[] = [];
      for (let iz = 0; iz <= depth; iz++) for (let ix = 0; ix <= width; ix++) {
        const gx = column + ix, gz = row + iz;
        const x = origin.x + (end.x - origin.x) * gx / columns;
        const z = origin.z + (end.z - origin.z) * gz / rows;
        landscape.worldToProperty(x, z, property);
        sharptailGroundZones(property.x, property.y, zones);
        sharptailMeadowAt(property.x, property.y, zones.swale, meadow);
        const rank = Math.max(zones.stand * .83, meadow.hollow);
        const opening = sharptailGrassOpening(meadow.exposed, zones.stand);
        // Unequal close-scale grass crests join over their shared roots.
        // The relief is below a metre; it cannot create new walking hills.
        const crest = .5 + .28 * Math.sin(property.x * .67 + property.y * .31)
          + .22 * Math.sin(property.x * .39 - property.y * .71);
        let cover = (1 - opening) ** 2 * sharptailStoneClearance(property.x, property.y)
          * (1 - sharptailAccentGroundAt(property.x, property.y) * .9);
        if (shack) cover *= THREE.MathUtils.smoothstep(Math.hypot(property.x - shack.position.x, property.y - shack.position.y), 7, 15);
        for (const trail of landscape.area.trails) for (let i = 1; i < trail.points.length; i++) {
          const a = trail.points[i - 1], b = trail.points[i], dx = b.x - a.x, dy = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((property.x - a.x) * dx + (property.y - a.y) * dy) / (dx * dx + dy * dy)));
          const distance = Math.hypot(property.x - a.x - t * dx, property.y - a.y - t * dy);
          cover *= THREE.MathUtils.smoothstep(distance, 1.4, 4.4);
        }
        // Common sward needs a visible body before Lite blades finish their
        // 40m fade. Millimetres of lift were being swallowed by the ground's
        // coarser triangles, exposing a smooth painted slope underneath.
        const canopy = (.22 + rank * .49) * (.65 + crest * .35) * cover;
        const floor = landscape.heightAtWorld(x, z) - .025;
        positions.push(x, floor + canopy, z); floors.push(floor); flex.push(canopy);
        if (surface) surface.paint(property.x, property.y, color);
        else color.setHex(0xb9ac79).lerp(crown, meadow.crown * .82).lerp(hollow, meadow.hollow * .97).lerp(cured, meadow.cured * .64);
        const shade = .93 + crest * .08;
        colors.push(Math.round(color.r * shade * 255), Math.round(color.g * shade * 255), Math.round(color.b * shade * 255));
      }
      for (let iz = 0; iz < depth; iz++) for (let ix = 0; ix < width; ix++) {
        const a = iz * (width + 1) + ix, b = a + 1, c = a + width + 1, d = c + 1;
        if ((ix + iz) % 2) indices.push(a, c, b, b, c, d); else indices.push(a, c, d, a, d, b);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Uint8BufferAttribute(colors, 3, true));
      geometry.setAttribute('prairieFloor', new THREE.Float32BufferAttribute(floors, 1));
      geometry.setAttribute('prairieFlex', new THREE.Float32BufferAttribute(flex, 1));
      geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
      geometry.userData = { kind: 'sharptail-middle-sward', detail: 'distant', triangles: indices.length / 3, spacing };
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.matrixAutoUpdate = false; mesh.castShadow = false; mesh.receiveShadow = false;
      ctx.scene.add(mesh); this.meshes.push(mesh);
    }
    this.update(ctx);
  }

  update(ctx: Ctx): void {
    this.clock.value = ctx.time;
    for (const mesh of this.meshes) {
      const bounds = mesh.geometry.boundingSphere!;
      mesh.visible = Math.hypot(ctx.camera.position.x - bounds.center.x, ctx.camera.position.z - bounds.center.z) < 280 + bounds.radius;
    }
  }

  dispose(ctx: Ctx): void {
    for (const mesh of this.meshes) { ctx.scene.remove(mesh); mesh.geometry.dispose(); }
    this.meshes.length = 0; this.material.dispose();
  }
}
