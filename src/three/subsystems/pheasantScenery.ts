import * as THREE from 'three';
import type { AreaLandmark } from '../../game/areas';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';

function seeded(seed: number, salt: number): number {
  let h = seed ^ Math.imul(salt, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

function irregularDisc(rx: number, rz: number, seed: number, y = 0): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const segments = 36;
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const wobble = 0.86 + rng() * 0.22 + Math.sin(angle * 3 + seed) * 0.045;
    ring.push([Math.cos(angle) * rx * wobble, Math.sin(angle) * rz * wobble]);
  }
  const positions: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % segments];
    positions.push(0, y, 0, a[0], y, a[1], b[0], y, b[1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Prairie-pothole water, seasonal remnants, cottonwoods, and long fence structure. */
export class PheasantScenerySystem implements Subsystem {
  readonly id = 'flora';
  private objects: THREE.Object3D[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private surface: GroundSample = {
    height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
  };
  private world = { x: 0, z: 0 };

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x7396a0,
      roughness: 0.28,
      metalness: 0.08,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
    });
    const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x4c432a, roughness: 1, side: THREE.DoubleSide });
    const snowMaterial = new THREE.MeshStandardMaterial({
      color: 0xd9dcd4,
      roughness: 0.86,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6a573f, roughness: 1, flatShading: true });
    const branchMaterial = new THREE.MeshStandardMaterial({ color: 0x514331, roughness: 1, flatShading: true });
    const foliageMaterials = [0xb18a34, 0xc29b3c, 0x8f7e38].map((color) => new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      flatShading: true,
      emissive: color,
      emissiveIntensity: 0.045,
    }));
    const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0x776854, roughness: 1, flatShading: true });
    const wireMaterial = new THREE.MeshStandardMaterial({ color: 0x343836, roughness: 0.92 });
    this.materials.push(
      waterMaterial, bankMaterial, snowMaterial, trunkMaterial, branchMaterial,
      ...foliageMaterials, fenceMaterial, wireMaterial,
    );

    const visiblePonds: Array<{ landmark: AreaLandmark; x: number; z: number }> = [];
    for (const landmark of this.landscape.area.landmarks) {
      if (landmark.kind !== 'pond') continue;
      this.landscape.propertyToWorld(landmark.position.x, landmark.position.y, this.world);
      if (Math.abs(this.world.x) > 320 || Math.abs(this.world.z) > 320) continue;
      visiblePonds.push({ landmark, x: this.world.x, z: this.world.z });
    }

    for (let i = 0; i < visiblePonds.length; i++) {
      const pond = visiblePonds[i];
      const major = pond.landmark.id !== 'area-feature';
      const rx = major ? 39 + (i % 2) * 5 : 31;
      const rz = major ? 25 + ((i + 1) % 2) * 4 : 21;
      const bankGeo = irregularDisc(rx + 3.4, rz + 3.1, seeded(this.landscape.area.terrain.seed, i * 7 + 1));
      const waterGeo = irregularDisc(rx, rz, seeded(this.landscape.area.terrain.seed, i * 7 + 2));
      this.geometries.push(bankGeo, waterGeo);
      // The landform carves a full basin beneath the water. Fill it almost
      // to the surrounding grade so the slough remains visible from a
      // hunter's eye on the entry swell instead of hiding behind its rim.
      const waterY = this.landscape.heightAtWorld(pond.x, pond.z) + 2.95;
      const bank = new THREE.Mesh(bankGeo, bankMaterial);
      bank.position.set(pond.x, waterY - 0.055, pond.z);
      bank.receiveShadow = true;
      const water = new THREE.Mesh(waterGeo, waterMaterial);
      water.position.set(pond.x, waterY, pond.z);
      water.receiveShadow = true;
      ctx.scene.add(bank, water);
      this.objects.push(bank, water);

      // Cottonwoods claim the drier shoulder beside each huntable slough.
      if (major) {
        const treeX = pond.x + (i % 2 === 0 ? rx + 13 : -rx - 11);
        const treeZ = pond.z - rz * 0.28;
        const tree = this.buildCottonwood(
          seeded(this.landscape.area.terrain.seed, 90 + i),
          15 + i * 1.8,
          trunkMaterial,
          branchMaterial,
          foliageMaterials,
        );
        tree.position.set(treeX, this.landscape.heightAtWorld(treeX, treeZ) - 0.1, treeZ);
        tree.rotation.y = i * 1.83 + 0.4;
        ctx.scene.add(tree);
        this.objects.push(tree);
      }
    }

    this.buildSeasonalGround(ctx, snowMaterial);
    this.buildFence(ctx, fenceMaterial, wireMaterial);
  }

  private buildCottonwood(
    seed: number,
    height: number,
    trunkMaterial: THREE.Material,
    branchMaterial: THREE.Material,
    foliageMaterials: THREE.Material[],
  ): THREE.Group {
    const rng = mulberry32(seed);
    const root = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.36, 0.62, height * 0.72, 9, 4);
    this.breakCylinder(trunkGeo, 0.075, seed);
    this.geometries.push(trunkGeo);
    const trunk = new THREE.Mesh(trunkGeo, trunkMaterial);
    trunk.position.y = height * 0.36;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    root.add(trunk);

    const branchGeo = new THREE.CylinderGeometry(0.11, 0.25, 1, 7, 2);
    const crownGeo = new THREE.IcosahedronGeometry(1, 2);
    this.geometries.push(branchGeo, crownGeo);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 7; i++) {
      const angle = i / 7 * Math.PI * 2 + rng() * 0.55;
      const start = new THREE.Vector3(0, height * (0.46 + rng() * 0.18), 0);
      const reach = height * (0.2 + rng() * 0.16);
      const end = new THREE.Vector3(
        Math.sin(angle) * reach,
        height * (0.63 + rng() * 0.25),
        Math.cos(angle) * reach,
      );
      const direction = end.clone().sub(start);
      const branch = new THREE.Mesh(branchGeo, branchMaterial);
      branch.position.copy(start).add(end).multiplyScalar(0.5);
      branch.quaternion.setFromUnitVectors(up, direction.clone().normalize());
      branch.scale.set(0.72 + rng() * 0.42, direction.length(), 0.72 + rng() * 0.42);
      branch.castShadow = true;
      root.add(branch);

      const lobes = 2 + (i % 3 === 0 ? 1 : 0);
      for (let lobe = 0; lobe < lobes; lobe++) {
        const canopy = new THREE.Mesh(crownGeo, foliageMaterials[(i + lobe) % foliageMaterials.length]);
        canopy.position.copy(end).add(new THREE.Vector3(
          (rng() - 0.5) * height * 0.12,
          (rng() - 0.35) * height * 0.1,
          (rng() - 0.5) * height * 0.12,
        ));
        canopy.scale.set(
          height * (0.12 + rng() * 0.06),
          height * (0.09 + rng() * 0.055),
          height * (0.12 + rng() * 0.06),
        );
        canopy.rotation.set(rng(), rng() * Math.PI, rng());
        canopy.castShadow = true;
        canopy.receiveShadow = true;
        root.add(canopy);
      }
    }
    return root;
  }

  private breakCylinder(geometry: THREE.BufferGeometry, amount: number, seed: number): void {
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const phase = Math.sin(y * 1.9 + seed * 0.01) * amount;
      position.setX(i, position.getX(i) + phase);
      position.setZ(i, position.getZ(i) + Math.cos(y * 1.6 + seed) * amount * 0.7);
    }
    geometry.computeVertexNormals();
  }

  private buildSeasonalGround(ctx: Ctx, material: THREE.Material): void {
    const condition = ctx.get<Hunt3DSystem>('hunt3d').condition();
    if (condition !== 'snow' && condition !== 'frost') return;
    const positions: number[] = [];
    const radius = 220;
    const stepM = condition === 'snow' ? 18 : 25;
    const stepProperty = stepM / PROPERTY_PX_TO_M;
    const min = this.landscape.worldToProperty(-radius, -radius, { x: 0, y: 0 });
    const max = this.landscape.worldToProperty(radius, radius, { x: 0, y: 0 });
    for (let cx = Math.floor(min.x / stepProperty); cx <= Math.ceil(max.x / stepProperty); cx++) {
      for (let cy = Math.floor(min.y / stepProperty); cy <= Math.ceil(max.y / stepProperty); cy++) {
        const rng = mulberry32(seeded(this.landscape.area.terrain.seed, cx * 4099 + cy));
        if (rng() > (condition === 'snow' ? 0.42 : 0.2)) continue;
        const px = (cx + 0.15 + rng() * 0.7) * stepProperty;
        const py = (cy + 0.15 + rng() * 0.7) * stepProperty;
        this.landscape.propertyToWorld(px, py, this.world);
        if (Math.abs(this.world.x) > radius || Math.abs(this.world.z) > radius) continue;
        const surface = this.landscape.surfaceAtWorld(this.world.x, this.world.z, this.surface);
        if (surface.moisture > 0.78 || surface.slope > 0.18) continue;
        const rx = (condition === 'snow' ? 2.2 : 1.25) + rng() * (condition === 'snow' ? 5.5 : 2.8);
        const rz = rx * (0.45 + rng() * 0.55);
        const segments = 10;
        for (let i = 0; i < segments; i++) {
          const a = i / segments * Math.PI * 2;
          const b = (i + 1) / segments * Math.PI * 2;
          positions.push(
            this.world.x, surface.height + 0.045, this.world.z,
            this.world.x + Math.cos(a) * rx, surface.height + 0.045, this.world.z + Math.sin(a) * rz,
            this.world.x + Math.cos(b) * rx, surface.height + 0.045, this.world.z + Math.sin(b) * rz,
          );
        }
      }
    }
    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    this.geometries.push(geometry);
    ctx.scene.add(mesh);
    this.objects.push(mesh);
  }

  private buildFence(ctx: Ctx, postMaterial: THREE.Material, wireMaterial: THREE.Material): void {
    const landmark = this.landscape.area.landmarks.find((candidate) => candidate.id === 'north-fence')
      ?? this.landscape.area.landmarks.find((candidate) => candidate.kind === 'barn');
    if (!landmark) return;
    this.landscape.propertyToWorld(landmark.position.x, landmark.position.y, this.world);
    if (Math.abs(this.world.x) > 330 || Math.abs(this.world.z) > 330) return;
    const postGeo = new THREE.BoxGeometry(0.16, 1.65, 0.16);
    const spanGeo = new THREE.BoxGeometry(1, 0.025, 0.025);
    this.geometries.push(postGeo, spanGeo);
    const count = 17;
    const posts = new THREE.InstancedMesh(postGeo, postMaterial, count);
    const wires = new THREE.InstancedMesh(spanGeo, wireMaterial, (count - 1) * 2);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const xAxis = new THREE.Vector3(1, 0, 0);
    const direction = new THREE.Vector3();
    const points: THREE.Vector3[] = [];
    const angle = 0.34;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * 7.2;
      const x = this.world.x + Math.cos(angle) * offset;
      const z = this.world.z + Math.sin(angle) * offset;
      const y = this.landscape.heightAtWorld(x, z);
      points.push(new THREE.Vector3(x, y, z));
      position.set(x, y + 0.79, z);
      quaternion.setFromEuler(new THREE.Euler(0, 0, Math.sin(i * 2.1) * 0.04));
      scale.set(1, 1, 1);
      posts.setMatrixAt(i, matrix.compose(position, quaternion, scale));
    }
    let wireIndex = 0;
    for (let i = 0; i < points.length - 1; i++) {
      for (const height of [0.62, 1.18]) {
        const a = points[i].clone().add(new THREE.Vector3(0, height, 0));
        const b = points[i + 1].clone().add(new THREE.Vector3(0, height - 0.06, 0));
        direction.copy(b).sub(a);
        quaternion.setFromUnitVectors(xAxis, direction.clone().normalize());
        position.copy(a).add(b).multiplyScalar(0.5);
        scale.set(direction.length(), 1, 1);
        wires.setMatrixAt(wireIndex++, matrix.compose(position, quaternion, scale));
      }
    }
    posts.castShadow = true;
    wires.castShadow = true;
    posts.matrixAutoUpdate = false;
    wires.matrixAutoUpdate = false;
    posts.computeBoundingSphere();
    wires.computeBoundingSphere();
    ctx.scene.add(posts, wires);
    this.objects.push(posts, wires);
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
