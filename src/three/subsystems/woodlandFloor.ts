import * as THREE from 'three';
import { mulberry32 } from '../../game/math';
import { PROPERTY_PX_TO_M, type GroundSample, type LandscapeModel } from '../../game/landscape';
import type { Ctx, Subsystem } from '../engine';

/** Small solid leaves and arching fronds, without transparent texture cards. */
function floorGeometry(fern: boolean): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [];
  const rng = mulberry32(fern ? 871 : 991), color = new THREE.Color();
  const triangle = (a: number[], b: number[], c: number[], tint: number) => {
    positions.push(...a, ...b, ...c);
    color.setHex(tint); for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };
  if (fern) {
    for (let frond = 0; frond < 7; frond++) {
      const yaw = frond / 7 * Math.PI * 2 + rng() * .4, length = .4 + rng() * .35;
      const point = (t: number, side: number) => [
        Math.cos(yaw) * t * length - Math.sin(yaw) * side,
        Math.sin(t * Math.PI * .83) * length * .8 + .015,
        Math.sin(yaw) * t * length + Math.cos(yaw) * side,
      ];
      for (let n = 1; n <= 5; n++) {
        const t = n / 6, spread = Math.sin(t * Math.PI) * .16;
        for (const side of [-1, 1]) {
          triangle(point(t - .1, 0), point(t + .1, side * spread), point(t + .13, 0),
            frond % 3 === 0 ? 0x9a9158 : n % 2 ? 0x68794b : 0x7e8650);
        }
      }
    }
  } else {
    for (let leaf = 0; leaf < 22; leaf++) {
      const x = (rng() - .5) * 2, z = (rng() - .5) * 2, yaw = rng() * Math.PI * 2;
      const length = .06 + rng() * .1, width = length * .5;
      const p = (along: number, across: number, y: number) => [x + Math.cos(yaw) * along - Math.sin(yaw) * across, y, z + Math.sin(yaw) * along + Math.cos(yaw) * across];
      const tint = [0x987247, 0xb79a63, 0x796443, 0xc1a777][leaf % 4];
      triangle(p(-length, 0, .018), p(0, width, .025), p(length, 0, .018), tint);
      triangle(p(-length, 0, .018), p(length, 0, .018), p(0, -width, .008), tint);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); return geometry;
}

function routeDistance(landscape: LandscapeModel, x: number, y: number): number {
  let distance = Infinity;
  for (const trail of landscape.area.trails) for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1], b = trail.points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return distance * PROPERTY_PX_TO_M;
}

export class WoodlandFloorSystem implements Subsystem {
  readonly id = 'woodland-floor';
  private meshes: THREE.InstancedMesh[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private range = 60;
  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    this.range = ctx.quality === 'lite' ? 42 : 65;
    const { area } = this.landscape, rng = mulberry32(area.terrain.seed + 736);
    const batches = new Map<string, { fern: boolean; matrices: THREE.Matrix4[] }>();
    const point = { x: 0, z: 0 }, position = new THREE.Vector3(), scale = new THREE.Vector3();
    const surface: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
    const up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), rotation = new THREE.Quaternion(), yaw = new THREE.Quaternion();
    for (let x = area.world.x; x < area.world.x + area.world.w; x += 3.8) {
      for (let y = area.world.y; y < area.world.y + area.world.h; y += 3.8) {
        const px = x + rng() * 3.8, py = y + rng() * 3.8;
        const mass = Math.sin(px * .047 + Math.sin(py * .028) * 2) * Math.sin(py * .061);
        if (rng() > .53 + mass * .3) continue;
        if (area.dropPoints.some(drop => Math.hypot(px - drop.position.x, py - drop.position.y) < 7)) continue;
        const distance = routeDistance(this.landscape, px, py);
        if (distance < 1.3) continue;
        const fern = mass > -.15 && rng() < .43 && distance > 2.1;
        this.landscape.propertyToWorld(px, py, point);
        this.landscape.surfaceAtProperty(px, py, surface);
        if (surface.slope > .6) continue;
        const size = fern ? .7 + rng() * .8 : .7 + rng() * .6;
        position.set(point.x, surface.height + .035, point.z);
        normal.set(-surface.gradeX, 1, -surface.gradeZ).normalize();
        rotation.setFromUnitVectors(up, normal).multiply(yaw.setFromAxisAngle(up, rng() * Math.PI * 2));
        scale.setScalar(size);
        const key = `${fern}:${Math.floor(point.x / 48)}:${Math.floor(point.z / 48)}`;
        const batch = batches.get(key) ?? { fern, matrices: [] };
        batch.matrices.push(new THREE.Matrix4().compose(position, rotation, scale)); batches.set(key, batch);
      }
    }
    for (const fern of [false, true]) {
      const geometry = floorGeometry(fern);
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float floorDistance = length(instanceMatrix[3].xz - cameraPosition.xz);
          float floorReveal = 1.0 - smoothstep(${this.range - 12}.0, ${this.range}.0, floorDistance);
          transformed *= floorReveal;
          #endif`);
      };
      material.customProgramCacheKey = () => `woodland-floor-${this.range}`;
      this.geometries.push(geometry); this.materials.push(material);
      for (const batch of batches.values()) {
        if (batch.fern !== fern) continue;
        const mesh = new THREE.InstancedMesh(geometry, material, batch.matrices.length);
        batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
        mesh.name = fern ? 'Woodland fern drift' : 'Woodland leaf litter';
        mesh.receiveShadow = true; mesh.computeBoundingSphere();
        ctx.scene.add(mesh); this.meshes.push(mesh);
      }
    }
    this.update(ctx);
  }

  update(ctx: Ctx): void {
    for (const mesh of this.meshes) {
      const sphere = mesh.boundingSphere!;
      mesh.visible = Math.hypot(ctx.camera.position.x - sphere.center.x, ctx.camera.position.z - sphere.center.z) < this.range + sphere.radius;
    }
  }
  dispose(ctx: Ctx): void {
    for (const mesh of this.meshes) ctx.scene.remove(mesh);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.meshes.length = 0; this.geometries.length = 0; this.materials.length = 0;
  }
}
