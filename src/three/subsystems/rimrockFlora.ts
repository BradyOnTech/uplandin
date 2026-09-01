import * as THREE from 'three';
import type { DropPoint } from '../../game/areas';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { P } from '../palette';

function cellSeed(x: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x, 1597334677) ^ Math.imul(z, 3812015801);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}

/** A deliberately irregular slab: broad faces read as fractured rimrock, not a round boulder. */
function fracturedSlabGeometry(): THREE.BufferGeometry {
  const vertices = [
    [-0.54, -0.5, -0.42], [0.48, -0.44, -0.5], [0.42, 0.4, -0.38], [-0.32, 0.54, -0.47],
    [-0.47, -0.46, 0.48], [0.55, -0.4, 0.39], [0.37, 0.48, 0.5], [-0.49, 0.36, 0.42],
    [0.04, 0.02, -0.58], [0.02, 0.01, 0.55],
  ] as const;
  const faces = [
    [0, 3, 8], [3, 2, 8], [2, 1, 8], [1, 0, 8],
    [4, 5, 9], [5, 6, 9], [6, 7, 9], [7, 4, 9],
    [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2],
    [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5],
  ] as const;
  const positions: number[] = [];
  for (const face of faces) {
    for (const index of face) positions.push(...vertices[index]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Great Basin rocks, scree, fractured outcrops, and rare junipers. */
export class RimrockFloraSystem implements Subsystem {
  readonly id = 'flora';
  private objects: THREE.Object3D[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private surface: GroundSample = { height: 0, slope: 0, rockiness: 0, vegetation: 0 };
  private matrix = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();
  private world = { x: 0, z: 0 };

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const high = ctx.quality === 'high';
    const outcropGeometry = fracturedSlabGeometry();
    const rockGeometry = new THREE.DodecahedronGeometry(1, 1);
    const screeGeometry = new THREE.DodecahedronGeometry(1, 0);
    const juniperGeometry = new THREE.ConeGeometry(1, 2, 7, 2);
    const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6);
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.98,
      flatShading: true,
      emissive: P.rimrockStone,
      emissiveIntensity: 0.18,
    });
    const outcropMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      flatShading: true,
      vertexColors: true,
      side: THREE.DoubleSide,
      emissive: P.rimrockStone,
      emissiveIntensity: 0.16,
    });
    const juniperMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: P.warmGray, flatShading: true });
    this.geometries.push(outcropGeometry, rockGeometry, screeGeometry, juniperGeometry, trunkGeometry);
    this.materials.push(rockMaterial, outcropMaterial, juniperMaterial, trunkMaterial);

    const outcropCapacity = 100;
    const boulderCapacity = high ? 720 : 360;
    const screeCapacity = high ? 1800 : 850;
    const juniperCapacity = high ? 48 : 24;
    const outcrops = this.instanced(outcropGeometry, rockMaterial, outcropCapacity);
    const boulders = this.instanced(rockGeometry, rockMaterial, boulderCapacity);
    const scree = this.instanced(screeGeometry, rockMaterial, screeCapacity);
    const junipers = this.instanced(juniperGeometry, juniperMaterial, juniperCapacity);
    const trunks = this.instanced(trunkGeometry, trunkMaterial, juniperCapacity, false);

    const stone = new THREE.Color(P.rimrockStone);
    const stoneLight = new THREE.Color(P.rimrockStoneLight);
    const stoneShade = new THREE.Color(P.rimrockShade);
    const lichen = new THREE.Color(P.rimrockLichen);
    const juniper = new THREE.Color(P.oliveDeep).lerp(new THREE.Color(P.rimrockSage), 0.28);
    let outcropCount = 0;
    let boulderCount = 0;
    let screeCount = 0;
    let juniperCount = 0;

    for (let dropIndex = 0; dropIndex < this.landscape.area.dropPoints.length; dropIndex++) {
      const drop = this.landscape.area.dropPoints[dropIndex];
      const cliffGeometry = this.buildApproachOutcrop(drop, dropIndex, stone, stoneLight, stoneShade, lichen);
      const cliff = new THREE.Mesh(cliffGeometry, outcropMaterial);
      cliff.castShadow = true;
      cliff.receiveShadow = true;
      cliff.matrixAutoUpdate = false;
      cliff.updateMatrix();
      ctx.scene.add(cliff);
      this.objects.push(cliff);
      this.geometries.push(cliffGeometry);
      outcropCount = this.buildApproachApron(
        drop,
        dropIndex,
        outcrops,
        outcropCount,
        outcropCapacity,
        stone,
        stoneLight,
        lichen,
      );
    }

    const radius = 238;
    const stepM = high ? 5.4 : 7.4;
    const stepProperty = stepM / PROPERTY_PX_TO_M;
    const minProperty = this.landscape.worldToProperty(-radius, -radius, { x: 0, y: 0 });
    const maxProperty = this.landscape.worldToProperty(radius, radius, { x: 0, y: 0 });
    const minCellX = Math.floor(minProperty.x / stepProperty);
    const maxCellX = Math.ceil(maxProperty.x / stepProperty);
    const minCellY = Math.floor(minProperty.y / stepProperty);
    const maxCellY = Math.ceil(maxProperty.y / stepProperty);

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const rng = mulberry32(cellSeed(cellX, cellY, this.landscape.area.terrain.seed));
        const propertyX = (cellX + 0.08 + rng() * 0.84) * stepProperty;
        const propertyY = (cellY + 0.08 + rng() * 0.84) * stepProperty;
        if (
          propertyX < this.landscape.area.world.x
          || propertyY < this.landscape.area.world.y
          || propertyX > this.landscape.area.world.x + this.landscape.area.world.w
          || propertyY > this.landscape.area.world.y + this.landscape.area.world.h
        ) continue;
        this.landscape.propertyToWorld(propertyX, propertyY, this.world);
        const x = this.world.x;
        const z = this.world.z;
        if (Math.abs(x) > radius || Math.abs(z) > radius || Math.hypot(x, z - 40) < 10) continue;
        const surface = this.landscape.surfaceAtWorld(x, z, this.surface);

        const boulderChance = 0.025 + surface.rockiness * 0.42 + Math.max(0, surface.slope - 0.38) * 0.16;
        if (boulderCount < boulderCapacity && rng() < boulderChance) {
          const size = 0.34 + rng() * rng() * 1.85 + surface.rockiness * 0.45;
          this.position.set(x, surface.height + size * 0.22, z);
          this.euler.set(rng() * 0.65, rng() * Math.PI * 2, rng() * 0.65);
          this.rotation.setFromEuler(this.euler);
          this.scale.set(
            size * (0.72 + rng() * 0.7),
            size * (0.42 + rng() * 0.52),
            size * (0.7 + rng() * 0.65),
          );
          boulders.setMatrixAt(boulderCount, this.matrix.compose(this.position, this.rotation, this.scale));
          this.color.copy(stone).lerp(stoneLight, rng() * 0.46).lerp(stoneShade, surface.rockiness * 0.18);
          if (rng() < 0.09) this.color.lerp(lichen, 0.18 + rng() * 0.22);
          this.color.multiplyScalar(0.84 + rng() * 0.24);
          boulders.setColorAt(boulderCount, this.color);
          boulderCount++;
        }

        const screeChance = 0.08 + surface.rockiness * 0.7 + Math.max(0, surface.slope - 0.3) * 0.24;
        if (screeCount < screeCapacity && rng() < screeChance) {
          const cluster = 1 + Math.floor(rng() * (high ? 4 : 3));
          for (let i = 0; i < cluster && screeCount < screeCapacity; i++) {
            const sx = x + (rng() - 0.5) * 4.8;
            const sz = z + (rng() - 0.5) * 4.8;
            const sy = this.landscape.heightAtWorld(sx, sz);
            const size = 0.12 + rng() * 0.38;
            this.position.set(sx, sy + size * 0.11, sz);
            this.euler.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
            this.rotation.setFromEuler(this.euler);
            this.scale.set(size * (0.8 + rng()), size * (0.35 + rng() * 0.42), size * (0.7 + rng()));
            scree.setMatrixAt(screeCount, this.matrix.compose(this.position, this.rotation, this.scale));
            this.color.copy(stoneShade).lerp(stoneLight, 0.25 + rng() * 0.58).multiplyScalar(0.82 + rng() * 0.2);
            scree.setColorAt(screeCount, this.color);
            screeCount++;
          }
        }

        const juniperChance = surface.vegetation > 0.62 && surface.slope < 0.5
          ? (surface.vegetation - 0.62) * 0.055
          : 0;
        if (juniperCount < juniperCapacity && rng() < juniperChance) {
          const height = 2.3 + rng() * 3.8;
          this.position.set(x, surface.height + height * 0.52, z);
          this.euler.set(0, rng() * Math.PI * 2, 0);
          this.rotation.setFromEuler(this.euler);
          this.scale.set(height * (0.28 + rng() * 0.09), height * 0.5, height * (0.28 + rng() * 0.09));
          junipers.setMatrixAt(juniperCount, this.matrix.compose(this.position, this.rotation, this.scale));
          this.color.copy(juniper).multiplyScalar(0.82 + rng() * 0.22);
          junipers.setColorAt(juniperCount, this.color);
          this.position.set(x, surface.height + 0.8, z);
          this.scale.set(0.8 + rng() * 0.45, 1, 0.8 + rng() * 0.45);
          trunks.setMatrixAt(juniperCount, this.matrix.compose(this.position, this.rotation, this.scale));
          juniperCount++;
        }
      }
    }

    this.finish(outcrops, outcropCount);
    this.finish(boulders, boulderCount);
    this.finish(scree, screeCount);
    this.finish(junipers, juniperCount);
    this.finish(trunks, juniperCount);
    ctx.scene.add(outcrops, boulders, scree, junipers, trunks);
    this.objects.push(outcrops, boulders, scree, junipers, trunks);
  }

  private buildApproachOutcrop(
    drop: DropPoint,
    dropIndex: number,
    stone: THREE.Color,
    stoneLight: THREE.Color,
    stoneShade: THREE.Color,
    lichen: THREE.Color,
  ): THREE.BufferGeometry {
    const rng = mulberry32((this.landscape.area.terrain.seed + dropIndex * 0x9e3779b9) >>> 0);
    const forwardX = Math.cos(drop.heading);
    const forwardY = Math.sin(drop.heading);
    const rightX = -Math.sin(drop.heading);
    const rightY = Math.cos(drop.heading);
    const centerX = drop.position.x + forwardX * 86 + rightX * (dropIndex === 0 ? 35 : -34);
    const centerY = drop.position.y + forwardY * 86 + rightY * (dropIndex === 0 ? 35 : -34);
    const columns = 10;
    const rows = 4;
    const front: THREE.Vector3[][] = [];
    const back: THREE.Vector3[][] = [];
    for (let column = 0; column <= columns; column++) {
      const edge = Math.abs(column - columns / 2) / (columns / 2);
      const along = (column / columns - 0.5) * 52 + (column > 0 && column < columns ? (rng() - 0.5) * 1.2 : 0);
      const propertyX = centerX + rightX * along;
      const propertyY = centerY + rightY * along;
      this.landscape.propertyToWorld(propertyX, propertyY, this.world);
      const ground = this.landscape.heightAtWorld(this.world.x, this.world.z) - 0.6;
      const top = 9 + (1 - edge) * 8.5 + rng() * 3.6;
      const depth = 5.2 + rng() * 3.6;
      const frontColumn: THREE.Vector3[] = [];
      const backColumn: THREE.Vector3[] = [];
      for (let row = 0; row <= rows; row++) {
        const rise = row / rows;
        const fracture = row > 0 && row < rows ? (rng() - 0.5) * 0.75 : 0;
        const face = (rng() - 0.5) * 1.25;
        frontColumn.push(new THREE.Vector3(
          this.world.x - forwardX * face,
          ground + top * rise + fracture,
          this.world.z - forwardY * face,
        ));
        backColumn.push(new THREE.Vector3(
          this.world.x + forwardX * depth,
          ground + top * rise - depth * 0.08,
          this.world.z + forwardY * depth,
        ));
      }
      front.push(frontColumn);
      back.push(backColumn);
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const pushTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, shade = 0): void => {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      this.color.copy(stone).lerp(shade < 0 ? stoneShade : stoneLight, Math.abs(shade));
      if (rng() < 0.16) this.color.lerp(lichen, 0.34 + rng() * 0.34);
      this.color.multiplyScalar(0.86 + rng() * 0.24);
      for (let i = 0; i < 3; i++) colors.push(this.color.r, this.color.g, this.color.b);
    };
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const a = front[column][row];
        const b = front[column + 1][row];
        const c = front[column + 1][row + 1];
        const d = front[column][row + 1];
        if ((column + row) % 2 === 0) {
          pushTriangle(a, c, b, 0.08 + rng() * 0.28);
          pushTriangle(a, d, c, 0.04 + rng() * 0.24);
        } else {
          pushTriangle(a, d, b, 0.04 + rng() * 0.24);
          pushTriangle(b, d, c, 0.08 + rng() * 0.28);
        }
        pushTriangle(back[column][row], back[column + 1][row], back[column + 1][row + 1], -0.18);
        pushTriangle(back[column][row], back[column + 1][row + 1], back[column][row + 1], -0.22);
      }
      pushTriangle(front[column][rows], back[column + 1][rows], front[column + 1][rows], 0.22);
      pushTriangle(front[column][rows], back[column][rows], back[column + 1][rows], 0.16);
    }
    for (const column of [0, columns]) {
      for (let row = 0; row < rows; row++) {
        const next = row + 1;
        pushTriangle(front[column][row], back[column][row], back[column][next], -0.08);
        pushTriangle(front[column][row], back[column][next], front[column][next], -0.04);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private buildApproachApron(
    drop: DropPoint,
    dropIndex: number,
    mesh: THREE.InstancedMesh,
    start: number,
    capacity: number,
    stone: THREE.Color,
    stoneLight: THREE.Color,
    lichen: THREE.Color,
  ): number {
    const rng = mulberry32((this.landscape.area.terrain.seed + dropIndex * 0x9e3779b9 + 0x6d2b79f5) >>> 0);
    const forwardX = Math.cos(drop.heading);
    const forwardY = Math.sin(drop.heading);
    const rightX = -Math.sin(drop.heading);
    const rightY = Math.cos(drop.heading);
    const centerX = drop.position.x + forwardX * 86 + rightX * (dropIndex === 0 ? 35 : -34);
    const centerY = drop.position.y + forwardY * 86 + rightY * (dropIndex === 0 ? 35 : -34);
    let count = start;
    for (let i = 0; i < 16 && count < capacity; i++) {
      const along = (rng() - 0.5) * 50;
      const towardDrop = 2 + rng() * 10;
      const propertyX = centerX + rightX * along - forwardX * towardDrop;
      const propertyY = centerY + rightY * along - forwardY * towardDrop;
      this.landscape.propertyToWorld(propertyX, propertyY, this.world);
      const ground = this.landscape.heightAtWorld(this.world.x, this.world.z);
      const foregroundFace = i < 6;
      const width = foregroundFace ? 4.5 + rng() * 3.2 : 1.8 + rng() * 3.4;
      const height = foregroundFace ? 4.5 + rng() * 5.5 : 1.5 + rng() * 3.6;
      const depth = foregroundFace ? 4 + rng() * 3.5 : 1.8 + rng() * 3.5;
      this.position.set(this.world.x, ground + height * 0.34, this.world.z);
      this.euler.set(rng() * 0.5, -drop.heading + (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.45);
      this.rotation.setFromEuler(this.euler);
      this.scale.set(width, height, depth);
      mesh.setMatrixAt(count, this.matrix.compose(this.position, this.rotation, this.scale));
      this.color.copy(stone).lerp(stoneLight, rng() * 0.36);
      if (rng() < 0.24) this.color.lerp(lichen, 0.18 + rng() * 0.28);
      this.color.multiplyScalar(0.86 + rng() * 0.2);
      mesh.setColorAt(count, this.color);
      count++;
    }
    return count;
  }

  private instanced(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
    castShadow = true,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  private finish(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (count > 0) mesh.computeBoundingSphere();
  }

  dispose(ctx: Ctx): void {
    for (const object of this.objects) {
      ctx.scene.remove(object);
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.objects.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
