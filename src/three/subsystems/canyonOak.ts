import * as THREE from 'three';
import type { AreaTrail } from '../../game/areas';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { HUNT_WORLD_ANCHOR, PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { P } from '../palette';

interface RockPlacement {
  x: number;
  z: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  yaw: number;
  gradeX: number;
  gradeZ: number;
  color: number;
}

interface OakPlacement {
  x: number;
  z: number;
  y: number;
  height: number;
  crown: number;
  yaw: number;
  gradeX: number;
  gradeZ: number;
  trunkColor: number;
  crownColor: number;
  shadowX: number;
  shadowZ: number;
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

const UP = new THREE.Vector3(0, 1, 0);

const ROCK_PALETTE = [
  new THREE.Color(P.russetDeep).lerp(new THREE.Color(P.soilBrown), 0.3),
  new THREE.Color(P.russetDeep).lerp(new THREE.Color(P.rimrockDust), 0.24),
  new THREE.Color(P.russet).lerp(new THREE.Color(P.rimrockDust), 0.52),
  new THREE.Color(P.rimrockShade).lerp(new THREE.Color(P.russetDeep), 0.28),
];

// Geometry colors are deliberately near-white modulation values. The
// per-instance rock palette supplies the hue; keeping these as face shades
// avoids multiplying a red albedo by itself in the instanced shader.
const ROCK_FACE_SHADES = [
  new THREE.Color(0.91, 0.78, 0.7),
  new THREE.Color(0.82, 0.68, 0.6),
  new THREE.Color(1, 0.91, 0.8),
  new THREE.Color(0.63, 0.61, 0.6),
];

const OAK_TRUNKS = [P.warmGray, P.soilBrown, P.russetDeep];
const OAK_CROWNS = [P.oliveMid, P.canopyGreen, P.rimrockSage];

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
): { point: { x: number; y: number }; tangent: { x: number; y: number } } | null {
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

function pushFace(
  positions: number[],
  colors: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  color: THREE.Color,
): void {
  positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let index = 0; index < 6; index++) colors.push(color.r, color.g, color.b);
}

/** A three-step low-poly cut face. The horizontal color bands read as red-rock bedding. */
function strataGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const layers = [
    { y0: 0, y1: 0.42, half: 0.5, front: -0.5, back: 0.5 },
    { y0: 0.42, y1: 0.7, half: 0.46, front: -0.46, back: 0.46 },
    { y0: 0.7, y1: 1, half: 0.41, front: -0.39, back: 0.42 },
  ];
  const side = ROCK_FACE_SHADES[3];
  for (const [index, layer] of layers.entries()) {
    const face = ROCK_FACE_SHADES[index];
    const { y0, y1, half, front, back } = layer;
    pushFace(positions, colors,
      [-half, y0, front], [half, y0, front], [half, y1, front], [-half, y1, front], face);
    pushFace(positions, colors,
      [half, y0, front], [half, y0, back], [half, y1, back], [half, y1, front], side);
    pushFace(positions, colors,
      [-half, y0, back], [-half, y0, front], [-half, y1, front], [-half, y1, back], side);
    if (index === 0) {
      pushFace(positions, colors,
        [-half, y0, back], [half, y0, back], [half, y0, front], [-half, y0, front], side);
    }
    if (index < layers.length - 1) {
      const next = layers[index + 1];
      pushFace(positions, colors,
        [-half, y1, front], [half, y1, front], [next.half, y1, next.front], [-next.half, y1, next.front],
        ROCK_FACE_SHADES[2]);
    }
  }
  const top = layers[layers.length - 1];
  pushFace(positions, colors,
    [-top.half, top.y1, top.front], [top.half, top.y1, top.front],
    [top.half, top.y1, top.back], [-top.half, top.y1, top.back], ROCK_FACE_SHADES[2]);
  pushFace(positions, colors,
    [-top.half, top.y1, top.back], [top.half, top.y1, top.back],
    [top.half, layers[0].y0, top.back], [-top.half, layers[0].y0, top.back], side);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function oakTrunkGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.18, 0.31, 1, 7, 2);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index++) {
    const y = position.getY(index);
    const bend = Math.sin(y * 4.2 + index * 1.6) * 0.035 * Math.max(0, y + 0.4);
    position.setX(index, position.getX(index) + bend);
    position.setZ(index, position.getZ(index) + Math.cos(y * 3.1 + index) * 0.025 * Math.max(0, y + 0.4));
  }
  geometry.translate(0, 0.5, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function oakCrownGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  geometry.scale(1.16, 0.76, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A ground-plane ellipse used to keep the oak shade readable in flat light. */
function oakShadowGeometry(): THREE.BufferGeometry {
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

/**
 * Mearns Canyons' red-rock and oak-shadow language. This is deliberately a
 * static, authored layer: a few instanced meshes give the draw a distinct
 * vertical rhythm without introducing a texture or a per-frame scatter pass.
 */
export class CanyonOakSystem implements Subsystem {
  readonly id = 'canyon-oak';
  private objects: THREE.Object3D[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private sample: GroundSample = { ...SAMPLE };
  private world = { x: 0, z: 0 };
  private matrix = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private yaw = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    if (this.landscape.area.id !== 'mearns-canyons') return;
    const high = ctx.quality === 'high';
    const trails = this.canyonTrails();
    const rocks = this.buildRocks(trails, high);
    const oaks = this.buildOaks(trails, high);
    this.addRocks(ctx, rocks, high);
    this.addOaks(ctx, oaks, high);
  }

  private canyonTrails(): AreaTrail[] {
    const trails = this.landscape.area.trails.filter((trail) =>
      trail.id === 'oak-draw' || trail.id === 'canyon-rim-return' || trail.id.includes('draw'),
    );
    return trails.length > 0 ? trails : this.landscape.area.trails.slice(0, 2);
  }

  private insideProperty(x: number, y: number, margin = 8): boolean {
    const area = this.landscape.area;
    return x >= area.world.x + margin && x <= area.world.x + area.world.w - margin
      && y >= area.world.y + margin && y <= area.world.y + area.world.h - margin;
  }

  /** Preserve the gates, corral, and opening sightline as readable anchors. */
  private clearForProp(x: number, y: number, radius: number, nearDropMeters: number): boolean {
    if (!this.insideProperty(x, y)) return false;
    const area = this.landscape.area;
    if (area.dropPoints.some((drop) => Math.hypot(x - drop.position.x, y - drop.position.y) < 23 + radius)) return false;
    if (area.landmarks.some((landmark) => {
      const landmarkRadius = landmark.kind === 'fence' ? 18 : landmark.kind === 'gate' ? 10 : 12;
      return Math.hypot(x - landmark.position.x, y - landmark.position.y) < landmarkRadius + radius;
    })) return false;
    this.landscape.propertyToWorld(x, y, this.world);
    return Math.hypot(this.world.x - HUNT_WORLD_ANCHOR.x, this.world.z - HUNT_WORLD_ANCHOR.z) >= nearDropMeters;
  }

  private buildRocks(trails: readonly AreaTrail[], high: boolean): RockPlacement[] {
    const placements: RockPlacement[] = [];
    const seed = this.landscape.area.terrain.seed;
    const spacing = high ? 48 : 78;
    for (const [trailIndex, trail] of trails.entries()) {
      const length = trailLength(trail);
      const count = Math.min(high ? 13 : 7, Math.max(2, Math.floor(length / spacing)));
      for (let index = 0; index < count; index++) {
        const rng = mulberry32(seeded(seed, 0x4f414b + trailIndex * 173 + index * 31));
        const located = pointAlongTrail(trail, length * (0.13 + (index + 0.38) / count * 0.74));
        if (!located) continue;
        const side = (index + trailIndex) % 2 === 0 ? 1 : -1;
        const offset = 11 + rng() * 15;
        const px = located.point.x - located.tangent.y * offset * side;
        const py = located.point.y + located.tangent.x * offset * side;
        const radius = 4 + rng() * 5;
        if (!this.clearForProp(px, py, radius, 28)) continue;
        this.landscape.surfaceAtProperty(px, py, this.sample);
        if (this.sample.slope > 1.02) continue;
        this.landscape.propertyToWorld(px, py, this.world);
        const width = 5.2 + rng() * 7.8;
        const height = 0.34 + rng() * 0.62;
        placements.push({
          x: this.world.x,
          z: this.world.z,
          y: this.sample.height + height * 0.05,
          width,
          depth: 1.2 + rng() * 1.7,
          height,
          yaw: Math.atan2(located.tangent.y, located.tangent.x) + (rng() - 0.5) * 0.16,
          gradeX: this.sample.gradeX,
          gradeZ: this.sample.gradeZ,
          color: (trailIndex + index + Math.floor(rng() * ROCK_PALETTE.length)) % ROCK_PALETTE.length,
        });

        // Every third shelf becomes a slightly taller draw wall. It keeps the
        // vertical read sparse and leaves the hunting route open between fins.
        if ((index + trailIndex) % 3 === 1) {
          const wallSide = -side;
          const wallOffset = 16 + rng() * 11;
          const wallX = located.point.x - located.tangent.y * wallOffset * wallSide;
          const wallY = located.point.y + located.tangent.x * wallOffset * wallSide;
          if (this.clearForProp(wallX, wallY, 5, 34)) {
            this.landscape.surfaceAtProperty(wallX, wallY, this.sample);
            if (this.sample.slope <= 0.92) {
              this.landscape.propertyToWorld(wallX, wallY, this.world);
              const wallHeight = 1.05 + rng() * 1.55;
              placements.push({
                x: this.world.x,
                z: this.world.z,
                y: this.sample.height + wallHeight * 0.05,
                width: 4.5 + rng() * 6.8,
                depth: 0.9 + rng() * 1.15,
                height: wallHeight,
                yaw: Math.atan2(located.tangent.y, located.tangent.x) + (rng() - 0.5) * 0.22,
                gradeX: this.sample.gradeX,
                gradeZ: this.sample.gradeZ,
                color: (trailIndex + index + 1) % ROCK_PALETTE.length,
              });
            }
          }
        }
      }
    }
    return placements.slice(0, high ? 44 : 22);
  }

  private buildOaks(trails: readonly AreaTrail[], high: boolean): OakPlacement[] {
    const placements: OakPlacement[] = [];
    const seed = this.landscape.area.terrain.seed;
    const spacing = high ? 54 : 86;
    for (const [trailIndex, trail] of trails.entries()) {
      const length = trailLength(trail);
      const count = Math.min(high ? 10 : 5, Math.max(2, Math.floor(length / spacing)));
      for (let index = 0; index < count; index++) {
        const rng = mulberry32(seeded(seed, 0x4f414b + trailIndex * 997 + index * 67));
        const located = pointAlongTrail(trail, length * (0.18 + (index + 0.23) / count * 0.68));
        if (!located) continue;
        const side = (index + trailIndex) % 2 === 0 ? -1 : 1;
        const offset = 12 + rng() * 17;
        const px = located.point.x - located.tangent.y * offset * side;
        const py = located.point.y + located.tangent.x * offset * side;
        if (!this.clearForProp(px, py, 8, 27)) continue;
        this.landscape.surfaceAtProperty(px, py, this.sample);
        if (this.sample.slope > 0.86 || this.sample.vegetation < 0.18) continue;
        this.landscape.propertyToWorld(px, py, this.world);
        const height = 4.1 + rng() * 2.25;
        const crown = 2.2 + rng() * 1.45;
        if (placements.some((oak) => Math.hypot(oak.x - this.world.x, oak.z - this.world.z) < 17)) continue;
        placements.push({
          x: this.world.x,
          z: this.world.z,
          y: this.sample.height + 0.025,
          height,
          crown,
          yaw: rng() * Math.PI * 2,
          gradeX: this.sample.gradeX,
          gradeZ: this.sample.gradeZ,
          trunkColor: OAK_TRUNKS[Math.floor(rng() * OAK_TRUNKS.length)],
          crownColor: OAK_CROWNS[Math.floor(rng() * OAK_CROWNS.length)],
          shadowX: crown * (1.25 + rng() * 0.34),
          shadowZ: crown * (0.76 + rng() * 0.22),
        });
      }
    }
    return placements.slice(0, high ? 24 : 12);
  }

  private addRocks(ctx: Ctx, placements: readonly RockPlacement[], high: boolean): void {
    if (placements.length === 0) return;
    const geometry = strataGeometry();
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(placements.length * 3), 3);
    mesh.matrixAutoUpdate = false;
    for (const [index, placement] of placements.entries()) {
      this.position.set(placement.x, placement.y, placement.z);
      this.normal.set(-placement.gradeX, 1, -placement.gradeZ).normalize();
      this.rotation.setFromUnitVectors(UP, this.normal);
      this.yaw.setFromAxisAngle(UP, placement.yaw);
      this.rotation.multiply(this.yaw);
      this.scale.set(placement.width, placement.height, placement.depth);
      mesh.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
      this.color.copy(ROCK_PALETTE[placement.color]).multiplyScalar(0.86 + (index % 5) * 0.035);
      mesh.setColorAt(index, this.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = high;
    mesh.receiveShadow = true;
    mesh.name = 'Mearns red-rock draw shelves';
    mesh.computeBoundingSphere();
    ctx.scene.add(mesh);
    this.objects.push(mesh);
    this.geometries.push(geometry);
    this.materials.push(material);
  }

  private addOaks(ctx: Ctx, placements: readonly OakPlacement[], high: boolean): void {
    if (placements.length === 0) return;
    const trunkGeometry = oakTrunkGeometry();
    const crownGeometry = oakCrownGeometry();
    const shadowGeometry = oakShadowGeometry();
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
    const crownMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: P.oliveDeep,
      transparent: true,
      opacity: 0.19,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, placements.length);
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, placements.length);
    const shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, placements.length);
    trunks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(placements.length * 3), 3);
    crowns.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(placements.length * 3), 3);
    trunks.matrixAutoUpdate = false;
    crowns.matrixAutoUpdate = false;
    shadows.matrixAutoUpdate = false;

    for (const [index, placement] of placements.entries()) {
      this.position.set(placement.x, placement.y, placement.z);
      this.normal.set(-placement.gradeX, 1, -placement.gradeZ).normalize();
      this.rotation.setFromUnitVectors(UP, this.normal);
      this.yaw.setFromAxisAngle(UP, placement.yaw);
      this.rotation.multiply(this.yaw);
      // Trunk width grows only gently with height; scaling the radius by the
      // full tree height would turn the live oak into a cartoon pillar.
      const trunkRadius = 0.92 + placement.height * 0.04;
      this.scale.set(trunkRadius, placement.height, trunkRadius);
      trunks.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
      this.color.setHex(placement.trunkColor);
      trunks.setColorAt(index, this.color);

      this.position.set(placement.x, placement.y, placement.z).addScaledVector(this.normal, placement.height * 0.76);
      this.scale.set(placement.crown, placement.crown * 0.9, placement.crown * 0.96);
      crowns.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
      this.color.setHex(placement.crownColor);
      crowns.setColorAt(index, this.color);

      this.position.set(placement.x, placement.y + 0.035, placement.z);
      this.scale.set(placement.shadowX, 1, placement.shadowZ);
      shadows.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    shadows.instanceMatrix.needsUpdate = true;
    trunks.instanceColor.needsUpdate = true;
    crowns.instanceColor.needsUpdate = true;
    trunks.castShadow = high;
    crowns.castShadow = high;
    trunks.receiveShadow = true;
    crowns.receiveShadow = true;
    shadows.renderOrder = 2;
    trunks.name = 'Mearns live oak trunks';
    crowns.name = 'Mearns live oak crowns';
    shadows.name = 'Mearns oak shadow pools';
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    shadows.computeBoundingSphere();
    ctx.scene.add(trunks, crowns, shadows);
    this.objects.push(trunks, crowns, shadows);
    this.geometries.push(trunkGeometry, crownGeometry, shadowGeometry);
    this.materials.push(trunkMaterial, crownMaterial, shadowMaterial);
  }

  update(_ctx: Ctx): void { /* static authored set dressing */ }

  dispose(ctx: Ctx): void {
    for (const object of this.objects) ctx.scene.remove(object);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.objects.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
