import * as THREE from 'three';
import type { AreaTrail } from '../../game/areas';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { HUNT_WORLD_ANCHOR } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Vec2 } from '../../game/types';
import type { Ctx, Subsystem } from '../engine';
import { P } from '../palette';

interface OakPlacement {
  x: number;
  y: number;
  z: number;
  height: number;
  trunkWidth: number;
  crown: number;
  yaw: number;
  gradeX: number;
  gradeZ: number;
  trunkColor: number;
  crownColor: number;
  shadeX: number;
  shadeZ: number;
  litterColor: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const SAMPLE: GroundSample = {
  height: 0,
  slope: 0,
  gradeX: 0,
  gradeZ: 0,
  rockiness: 0,
  vegetation: 0,
  moisture: 0,
};

const TRUNK_COLORS = [P.soilDark, P.soilBrown, P.warmGray];
const CROWN_COLORS = [P.canopyGreen, P.oliveMid, P.grassOlive];
const LITTER_COLORS = [P.soilBrown, P.khaki, P.oliveMid];

function seeded(seed: number, salt: number): number {
  let value = seed ^ Math.imul(salt, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  return (value ^ (value >>> 13)) >>> 0;
}

function trailLength(trail: AreaTrail): number {
  let length = 0;
  for (let index = 1; index < trail.points.length; index++) {
    const a = trail.points[index - 1];
    const b = trail.points[index];
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

function pointAlongTrail(
  trail: AreaTrail,
  distance: number,
): { point: Vec2; tangent: Vec2 } | null {
  let remaining = distance;
  for (let index = 1; index < trail.points.length; index++) {
    const a = trail.points[index - 1];
    const b = trail.points[index];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.01) continue;
    if (remaining <= length || index === trail.points.length - 1) {
      const t = Math.max(0, Math.min(1, remaining / length));
      return {
        point: { x: a.x + dx * t, y: a.y + dy * t },
        tangent: { x: dx / length, y: dy / length },
      };
    }
    remaining -= length;
  }
  return null;
}

function appendTransformed(
  target: number[],
  source: THREE.BufferGeometry,
  transform: THREE.Matrix4,
): void {
  const nonIndexed = source.toNonIndexed();
  nonIndexed.applyMatrix4(transform);
  const position = nonIndexed.getAttribute('position');
  for (let index = 0; index < position.count; index++) {
    target.push(position.getX(index), position.getY(index), position.getZ(index));
  }
  nonIndexed.dispose();
}

/** A flared trunk plus a few short forks keeps a mature live oak readable. */
function oakTrunkGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const trunk = new THREE.CylinderGeometry(.2, .48, 1, 7, 2);
  appendTransformed(positions, trunk, new THREE.Matrix4().makeTranslation(0, .5, 0));
  trunk.dispose();

  const branch = new THREE.CylinderGeometry(.065, .19, 1, 6, 1);
  const branches = [
    { start: new THREE.Vector3(-.02, .61, .01), direction: new THREE.Vector3(-.72, .42, .14), length: .98 },
    { start: new THREE.Vector3(.03, .76, -.02), direction: new THREE.Vector3(.76, .34, -.11), length: 1.08 },
    { start: new THREE.Vector3(-.03, .92, .02), direction: new THREE.Vector3(.12, .66, .06), length: .83 },
  ];
  const branchRotation = new THREE.Quaternion();
  const branchPosition = new THREE.Vector3();
  const branchScale = new THREE.Vector3(1, 1, 1);
  const branchMatrix = new THREE.Matrix4();
  for (const item of branches) {
    const direction = item.direction.clone().normalize();
    branchRotation.setFromUnitVectors(UP, direction);
    branchPosition.copy(item.start).addScaledVector(direction, item.length * .5);
    branchScale.set(1, item.length, 1);
    branchMatrix.compose(branchPosition, branchRotation, branchScale);
    appendTransformed(positions, branch, branchMatrix);
  }
  branch.dispose();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Broad, low-poly lobes make a live-oak umbrella instead of a round marker. */
function oakCrownGeometry(): THREE.BufferGeometry {
  const lobes = [
    { x: -.53, y: 0, z: .04, sx: .72, sy: .38, sz: .65, yaw: -.25 },
    { x: .02, y: .05, z: -.05, sx: .86, sy: .45, sz: .74, yaw: .08 },
    { x: .55, y: .01, z: .07, sx: .66, sy: .35, sz: .6, yaw: .34 },
    { x: -.08, y: .31, z: -.02, sx: .52, sy: .34, sz: .48, yaw: -.12 },
  ];
  const positions: number[] = [];
  for (const lobe of lobes) {
    const indexed = new THREE.IcosahedronGeometry(1, 0);
    const source = indexed.toNonIndexed();
    indexed.dispose();
    const position = source.getAttribute('position');
    const c = Math.cos(lobe.yaw), s = Math.sin(lobe.yaw);
    for (let index = 0; index < position.count; index++) {
      const localX = position.getX(index) * lobe.sx;
      const localZ = position.getZ(index) * lobe.sz;
      positions.push(
        lobe.x + localX * c - localZ * s,
        lobe.y + position.getY(index) * lobe.sy,
        lobe.z + localX * s + localZ * c,
      );
    }
    source.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function shadeGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const segments = 12;
  for (let index = 0; index < segments; index++) {
    const next = (index + 1) % segments;
    const a = index / segments * Math.PI * 2;
    const b = next / segments * Math.PI * 2;
    positions.push(
      0, 0, 0,
      Math.cos(a), 0, Math.sin(a),
      Math.cos(b), 0, Math.sin(b),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function litterRingGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 12;
  const inner = .73;
  for (let index = 0; index < segments; index++) {
    const next = (index + 1) % segments;
    const a = index / segments * Math.PI * 2;
    const b = next / segments * Math.PI * 2;
    positions.push(
      Math.cos(a) * inner, 0, Math.sin(a) * inner,
      Math.cos(a), 0, Math.sin(a),
      Math.cos(b) * inner, 0, Math.sin(b) * inner,
      Math.cos(b), 0, Math.sin(b),
    );
    const vertex = index * 4;
    indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Valley Oaks is open grassland organized by the shade of old live oaks.
 * This authored layer supplies a few route-adjacent shade islands, branching
 * trunks, and dry leaf collars. The generic habitat layer still fills the
 * distant savanna, while these anchors give the hunter a visible rhythm of
 * cool ground and oak skirts to work between.
 */
export class ValleyOakSystem implements Subsystem {
  readonly id = 'valley-oaks';
  private objects: THREE.Object3D[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private sample: GroundSample = { ...SAMPLE };
  private world = { x: 0, z: 0 };
  private position = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private yaw = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private matrix = new THREE.Matrix4();
  private color = new THREE.Color();

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    if (this.landscape.area.id !== 'valley-oaks') return;
    const high = ctx.quality === 'high';
    const placements = this.buildPlacements(high);
    if (placements.length === 0) return;

    this.addTrees(ctx, placements, high);
    this.addGroundCues(ctx, placements);
  }

  private buildPlacements(high: boolean): OakPlacement[] {
    const area = this.landscape.area;
    const routes = area.trails.filter((trail) =>
      trail.id.includes('shade') || trail.id === 'oak-lane' || trail.id === 'trunk-loop',
    );
    const candidates: OakPlacement[] = [];
    const perRoute = high ? 3 : 2;
    for (const [trailIndex, trail] of routes.entries()) {
      const length = trailLength(trail);
      if (length < 20) continue;
      for (let index = 0; index < perRoute; index++) {
        const rng = mulberry32(seeded(area.terrain.seed, trailIndex * 101 + index * 37 + 0x4f414b));
        const located = pointAlongTrail(trail, length * (.16 + (index + .42) / perRoute * .68));
        if (!located) continue;
        const side = (trailIndex + index) % 2 === 0 ? 1 : -1;
        const offset = 11 + rng() * 13;
        const px = located.point.x - located.tangent.y * offset * side;
        const py = located.point.y + located.tangent.x * offset * side;
        if (!this.clearForTree(px, py, 7)) continue;
        this.landscape.surfaceAtProperty(px, py, this.sample);
        if (this.sample.slope > .78 || this.sample.rockiness > .42) continue;
        this.landscape.propertyToWorld(px, py, this.world);
        if (candidates.some((oak) => Math.hypot(oak.x - this.world.x, oak.z - this.world.z) < 24)) continue;
        const height = 4.15 + rng() * 1.55;
        const crown = 3.2 + rng() * 1.55;
        candidates.push({
          x: this.world.x,
          y: this.sample.height + .03,
          z: this.world.z,
          height,
          trunkWidth: .82 + rng() * .22,
          crown,
          yaw: rng() * Math.PI * 2,
          gradeX: this.sample.gradeX,
          gradeZ: this.sample.gradeZ,
          trunkColor: TRUNK_COLORS[Math.floor(rng() * TRUNK_COLORS.length)],
          crownColor: CROWN_COLORS[Math.floor(rng() * CROWN_COLORS.length)],
          shadeX: crown * (1.32 + rng() * .2),
          shadeZ: crown * (.91 + rng() * .17),
          litterColor: LITTER_COLORS[Math.floor(rng() * LITTER_COLORS.length)],
        });
      }
    }
    return candidates.slice(0, high ? 12 : 6);
  }

  private clearForTree(propertyX: number, propertyY: number, radius: number): boolean {
    const area = this.landscape.area;
    if (propertyX < area.world.x + 12 || propertyX > area.world.x + area.world.w - 12
      || propertyY < area.world.y + 12 || propertyY > area.world.y + area.world.h - 12) return false;
    if (area.dropPoints.some((drop) => Math.hypot(propertyX - drop.position.x, propertyY - drop.position.y) < 28 + radius)) return false;
    if (area.landmarks.some((landmark) => {
      const landmarkRadius = landmark.kind === 'barn' ? 18 : landmark.kind === 'gate' ? 10 : 12;
      return Math.hypot(propertyX - landmark.position.x, propertyY - landmark.position.y) < landmarkRadius + radius;
    })) return false;
    this.landscape.propertyToWorld(propertyX, propertyY, this.world);
    return Math.hypot(this.world.x - HUNT_WORLD_ANCHOR.x, this.world.z - HUNT_WORLD_ANCHOR.z) > 25;
  }

  private setGroundRotation(placement: OakPlacement, yOffset: number): void {
    this.position.set(placement.x, placement.y + yOffset, placement.z);
    // The savanna is gently rolling. A restrained grade response keeps the
    // trunk upright while letting shade and litter settle into the landform.
    this.normal.set(-placement.gradeX * .2, 1, -placement.gradeZ * .2).normalize();
    this.rotation.setFromUnitVectors(UP, this.normal);
    this.yaw.setFromAxisAngle(UP, placement.yaw);
    this.rotation.multiply(this.yaw);
  }

  private addTrees(ctx: Ctx, placements: readonly OakPlacement[], high: boolean): void {
    const trunkGeometry = oakTrunkGeometry();
    const crownGeometry = oakCrownGeometry();
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
    const crownMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, placements.length);
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, placements.length);
    trunks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(placements.length * 3), 3);
    crowns.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(placements.length * 3), 3);
    trunks.matrixAutoUpdate = false;
    crowns.matrixAutoUpdate = false;
    for (const [index, placement] of placements.entries()) {
      this.setGroundRotation(placement, 0);
      this.scale.set(placement.trunkWidth, placement.height, placement.trunkWidth);
      trunks.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
      this.color.setHex(placement.trunkColor).multiplyScalar(.92 + (index % 3) * .04);
      trunks.setColorAt(index, this.color);

      this.position.set(placement.x, placement.y, placement.z).addScaledVector(this.normal, placement.height * .78);
      this.scale.set(placement.crown * 1.08, placement.crown * .92, placement.crown);
      crowns.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
      this.color.setHex(placement.crownColor).multiplyScalar(.92 + (index % 4) * .035);
      crowns.setColorAt(index, this.color);
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    trunks.instanceColor.needsUpdate = true;
    crowns.instanceColor.needsUpdate = true;
    trunks.castShadow = high;
    crowns.castShadow = high;
    trunks.receiveShadow = true;
    crowns.receiveShadow = true;
    trunks.name = 'Valley Oak mature trunks';
    crowns.name = 'Valley Oak live-oak crowns';
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    ctx.scene.add(trunks, crowns);
    this.objects.push(trunks, crowns);
    this.geometries.push(trunkGeometry, crownGeometry);
    this.materials.push(trunkMaterial, crownMaterial);
  }

  private addGroundCues(ctx: Ctx, placements: readonly OakPlacement[]): void {
    const shadeGeometryBuffer = shadeGeometry();
    const litterGeometryBuffer = litterRingGeometry();
    const shadeMaterial = new THREE.MeshBasicMaterial({
      color: P.oliveDeep,
      transparent: true,
      opacity: .2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const litterMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: .64,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shadows = new THREE.InstancedMesh(shadeGeometryBuffer, shadeMaterial, placements.length);
    const litter = new THREE.InstancedMesh(litterGeometryBuffer, litterMaterial, placements.length);
    litter.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(placements.length * 3), 3);
    shadows.matrixAutoUpdate = false;
    litter.matrixAutoUpdate = false;
    for (const [index, placement] of placements.entries()) {
      this.setGroundRotation(placement, .045);
      this.scale.set(placement.shadeX, 1, placement.shadeZ);
      shadows.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));

      this.setGroundRotation(placement, .06);
      this.scale.set(placement.shadeX, 1, placement.shadeZ);
      litter.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
      this.color.setHex(placement.litterColor).multiplyScalar(.82 + (index % 3) * .05);
      litter.setColorAt(index, this.color);
    }
    shadows.instanceMatrix.needsUpdate = true;
    litter.instanceMatrix.needsUpdate = true;
    litter.instanceColor.needsUpdate = true;
    shadows.renderOrder = 2;
    litter.renderOrder = 3;
    shadows.receiveShadow = true;
    litter.receiveShadow = true;
    shadows.name = 'Valley Oak shade islands';
    litter.name = 'Valley Oak dry leaf collars';
    shadows.computeBoundingSphere();
    litter.computeBoundingSphere();
    ctx.scene.add(shadows, litter);
    this.objects.push(shadows, litter);
    this.geometries.push(shadeGeometryBuffer, litterGeometryBuffer);
    this.materials.push(shadeMaterial, litterMaterial);
  }

  update(_ctx: Ctx): void { /* authored set dressing */ }

  dispose(ctx: Ctx): void {
    for (const object of this.objects) ctx.scene.remove(object);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.objects.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
