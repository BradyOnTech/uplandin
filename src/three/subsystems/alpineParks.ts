import * as THREE from 'three';
import type { Condition } from '../../game/conditions';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';

interface SnowPatch {
  x: number;
  y: number;
  z: number;
  radius: number;
  rotation: number;
  gradeX: number;
  gradeZ: number;
  color: number;
}

const SAMPLE: GroundSample = {
  height: 0,
  slope: 0,
  gradeX: 0,
  gradeZ: 0,
  rockiness: 0,
  vegetation: 0,
  moisture: 0,
};

function conditionSnow(condition: Condition): number {
  if (condition === 'snow') return 1;
  if (condition === 'frost') return .56;
  return 0;
}

function snowGeometry(): THREE.BufferGeometry {
  // A faceted, slightly lopsided disk keeps the patches readable from the
  // low camera without turning them into a texture decal.
  const geometry = new THREE.CircleGeometry(1, 7);
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(1, .72, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function frostCapGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  geometry.scale(.72, .18, .62);
  geometry.translate(0, .12, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

interface HuntConditionQuery {
  readonly id: string;
  condition(): Condition;
}

/**
 * Timberline's visual signature is the edge between spruce and open park.
 * This subsystem paints a sparse, deterministic snow/frost pattern onto
 * exposed high ground and park shoulders. It is intentionally independent of
 * the shared terrain material: the same heightfield remains authoritative,
 * while the white patches add seasonal read without another terrain pass.
 */
export class AlpineParksSystem implements Subsystem {
  readonly id = 'alpine-parks';
  private objects: THREE.Object3D[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private sample: GroundSample = { ...SAMPLE };
  private world = { x: 0, z: 0 };
  private matrix = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private yaw = new THREE.Quaternion();
  private normal = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private color = new THREE.Color();

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const condition = ctx.get<HuntConditionQuery>('hunt3d').condition();
    const snowAmount = conditionSnow(condition);
    if (snowAmount <= 0) return;
    const high = ctx.quality === 'high';
    const patches = this.buildPatches(snowAmount, high);
    if (patches.length === 0) return;

    const geometry = snowGeometry();
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: condition === 'frost' ? .62 : .78,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, patches.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(patches.length * 3), 3);
    mesh.matrixAutoUpdate = false;
    for (const [index, patch] of patches.entries()) {
      this.position.set(patch.x, patch.y + .028, patch.z);
      this.normal.set(-patch.gradeX, 1, -patch.gradeZ).normalize();
      this.rotation.setFromUnitVectors(this.up, this.normal);
      this.yaw.setFromAxisAngle(this.up, patch.rotation);
      this.rotation.multiply(this.yaw);
      this.scale.set(patch.radius, 1, patch.radius);
      mesh.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
      mesh.setColorAt(index, this.color.setHex(patch.color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.name = condition === 'frost' ? 'Timberline frost park patches' : 'Timberline snow park patches';
    mesh.computeBoundingSphere();
    ctx.scene.add(mesh);
    this.objects.push(mesh);
    this.geometries.push(geometry);
    this.materials.push(material);

    // A handful of small caps make the spruce edge feel cold at eye level.
    // They reuse the same deterministic placement stream and stay cheap on
    // the lite tier.
    const caps = this.buildCaps(patches, high);
    if (caps.length === 0) return;
    const capGeometry = frostCapGeometry();
    const capMaterial = new THREE.MeshLambertMaterial({
      color: condition === 'frost' ? 0xd6e0dc : 0xe1e8e4,
      flatShading: true,
      transparent: true,
      opacity: condition === 'frost' ? .68 : .86,
    });
    const capMesh = new THREE.InstancedMesh(capGeometry, capMaterial, caps.length);
    capMesh.matrixAutoUpdate = false;
    for (const [index, patch] of caps.entries()) {
      this.position.set(patch.x, patch.y + .14, patch.z);
      this.normal.set(-patch.gradeX, 1, -patch.gradeZ).normalize();
      this.rotation.setFromUnitVectors(this.up, this.normal);
      this.yaw.setFromAxisAngle(this.up, patch.rotation);
      this.rotation.multiply(this.yaw);
      this.scale.set(patch.radius * .72, patch.radius * .22, patch.radius * .62);
      capMesh.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
    }
    capMesh.instanceMatrix.needsUpdate = true;
    capMesh.castShadow = high;
    capMesh.receiveShadow = true;
    capMesh.name = 'Timberline frost on park stones';
    capMesh.computeBoundingSphere();
    ctx.scene.add(capMesh);
    this.objects.push(capMesh);
    this.geometries.push(capGeometry);
    this.materials.push(capMaterial);
  }

  private buildPatches(snowAmount: number, high: boolean): SnowPatch[] {
    const area = this.landscape.area;
    const patches: SnowPatch[] = [];
    const step = high ? 52 : 72;
    const max = high ? 130 : 66;
    const colors = [0xd9e3dd, 0xe2e8e2, 0xcbd8d2, 0xe9ece7];
    for (let x = area.world.x + 14; x < area.world.x + area.world.w - 14; x += step) {
      for (let y = area.world.y + 14; y < area.world.y + area.world.h - 14; y += step) {
        if (patches.length >= max) return patches;
        const ix = Math.floor((x - area.world.x) / step);
        const iy = Math.floor((y - area.world.y) / step);
        const rng = mulberry32((this.landscape.area.terrain.seed ^ ix * 0x9e3779b9 ^ iy * 0x85ebca6b) >>> 0);
        const px = x + rng() * step;
        const py = y + rng() * step;
        this.landscape.surfaceAtProperty(px, py, this.sample);
        // Snow hangs on the windward/high side of the park. Open grass and
        // rock shoulders take it; dense timber-floor vegetation stays darker.
        const edge = Math.max(0, this.sample.rockiness * .5 + this.sample.slope * .26 + (1 - this.sample.vegetation) * .18);
        if (rng() > snowAmount * (.2 + edge * .92)) continue;
        this.landscape.propertyToWorld(px, py, this.world);
        const radius = (2.1 + rng() * 3.6) * (.74 + snowAmount * .34);
        patches.push({
          x: this.world.x,
          y: this.sample.height,
          z: this.world.z,
          radius,
          rotation: rng() * Math.PI * 2,
          gradeX: this.sample.gradeX,
          gradeZ: this.sample.gradeZ,
          color: colors[Math.floor(rng() * colors.length)],
        });
      }
    }
    return patches;
  }

  private buildCaps(patches: readonly SnowPatch[], high: boolean): SnowPatch[] {
    const capCount = Math.min(high ? 20 : 9, Math.floor(patches.length * .22));
    return patches.filter((patch, index) => index % 5 === 1).slice(0, capCount);
  }

  update(_ctx: Ctx): void { /* seasonal placement is static for a hunt */ }

  dispose(ctx: Ctx): void {
    for (const object of this.objects) ctx.scene.remove(object);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.objects.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
