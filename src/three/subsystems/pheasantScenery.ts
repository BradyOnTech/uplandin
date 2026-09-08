import * as THREE from 'three';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';
import { pheasantPlantClear, pheasantPonds, pheasantShelterbelts } from './pheasantLandscape';

function seeded(seed: number, salt: number): number {
  let h = seed ^ Math.imul(salt, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

function irregularDisc(rx: number, rz: number, seed: number, y = 0): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const segments = 96;
  const phase = rng() * Math.PI * 2;
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2;
    // Broad shoreline bends, not independent spikes at every vertex.
    const wobble = .97 + Math.sin(angle * 3 + phase) * .025 + Math.sin(angle * 5 - phase) * .012;
    ring.push([Math.cos(angle) * rx * wobble, Math.sin(angle) * rz * wobble]);
  }
  const positions: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % segments];
    positions.push(0, y, 0, b[0], y, b[1], a[0], y, a[1]);
    const angleA = i / segments * Math.PI * 2, angleB = (i + 1) / segments * Math.PI * 2;
    uv.push(.5, .5, .5 + Math.cos(angleB) * .5, .5 + Math.sin(angleB) * .5,
      .5 + Math.cos(angleA) * .5, .5 + Math.sin(angleA) * .5);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
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
    // The shared key light already supplies the field's major shadow shapes.
    // Keep detailed cottonwood branches and fence wires out of the lite
    // shadow pass; they remain visible and receive light, while a phone avoids
    // re-rendering dozens of small casters into the shadow map every frame.
    const castShadow = ctx.quality === 'high';
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x7396a0,
      roughness: 0.28,
      metalness: 0.08,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    waterMaterial.customProgramCacheKey = () => 'pheasant-water-soft-margin-v1';
    waterMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPondUV;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPondUV = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPondUV;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float shore = length(vPondUV * 2.0 - 1.0);
          diffuseColor.a *= 1.0 - smoothstep(.965, 1.0, shore);
          diffuseColor.rgb *= 1.0 - smoothstep(.78, 1.0, shore) * .12;
        `);
    };
    const snowMaterial = new THREE.MeshStandardMaterial({
      color: 0xd9dcd4,
      roughness: 0.86,
      transparent: true,
      opacity: ctx.get<Hunt3DSystem>('hunt3d').condition() === 'snow' ? 0.82 : 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    snowMaterial.customProgramCacheKey = () => 'seasonal-ground-feather-v1';
    snowMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vSeasonUV;\nvarying vec2 vSeasonGround;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeasonUV = uv;\nvSeasonGround = position.xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec2 vSeasonUV;
          varying vec2 vSeasonGround;
          float frostNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            vec4 h = fract(sin(vec4(dot(i, vec2(127.1, 311.7)),
              dot(i + vec2(1., 0.), vec2(127.1, 311.7)),
              dot(i + vec2(0., 1.), vec2(127.1, 311.7)),
              dot(i + vec2(1., 1.), vec2(127.1, 311.7)))) * 43758.5453);
            return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
          }
        `)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float grain = frostNoise(vSeasonGround * 3.2);
          float fringe = frostNoise(vSeasonGround * 1.3);
          float edge = length(vSeasonUV * 2.0 - 1.0);
          diffuseColor.a *= (1.0 - smoothstep(.42, .94, edge + (fringe - .5) * .24))
            * mix(.22, 1.0, smoothstep(.18, .78, grain));
        `);
    };
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
      waterMaterial, snowMaterial, trunkMaterial, branchMaterial,
      ...foliageMaterials, fenceMaterial, wireMaterial,
    );

    // Use the same footprint and water level as rooted cattail placement.
    // All authored ponds remain present whichever gate starts the hunt;
    // ordinary frustum culling handles distant surfaces.
    const visiblePonds = pheasantPonds(this.landscape).map(pond => {
      const world = this.landscape.propertyToWorld(pond.x, pond.y, { x: 0, z: 0 });
      return { ...pond, x: world.x, z: world.z };
    });

    for (let i = 0; i < visiblePonds.length; i++) {
      const pond = visiblePonds[i];
      const major = pond.landmarkId !== 'area-feature';
      const rx = pond.rx;
      const rz = pond.ry;
      const waterGeo = irregularDisc(rx, rz, seeded(this.landscape.area.terrain.seed, i * 7 + 2));
      this.geometries.push(waterGeo);
      // The landform carves a full basin beneath the water. Fill it almost
      // to the surrounding grade so the slough remains visible from a
      // hunter's eye on the entry swell instead of hiding behind its rim.
      const waterY = pond.waterY;
      // Mud belongs on the sampled terrain (PropertyTerrain paints it).
      // A flat brown disc below the water floated through sloped banks.
      const water = new THREE.Mesh(waterGeo, waterMaterial);
      water.position.set(pond.x, waterY, pond.z);
      water.receiveShadow = true;
      ctx.scene.add(water);
      this.objects.push(water);

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
          castShadow,
        );
        tree.position.set(treeX, this.landscape.heightAtWorld(treeX, treeZ) - 0.1, treeZ);
        tree.rotation.y = i * 1.83 + 0.4;
        ctx.scene.add(tree);
        this.objects.push(tree);
      }
    }

    this.buildShelterbelts(ctx, trunkMaterial, foliageMaterials);
    this.buildSeasonalGround(ctx, snowMaterial);
    this.buildFence(ctx, fenceMaterial, wireMaterial, castShadow);
  }

  private buildShelterbelts(ctx: Ctx, trunkMaterial: THREE.Material, foliageMaterials: THREE.Material[]): void {
    const trunkGeo = new THREE.CylinderGeometry(.09, .23, 1, 5);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    // A tapered, uneven crown gives these windbreak trees a different
    // silhouette from the broad cottonwoods at the water.
    const vertices = crownGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      const taper = 1 - Math.max(0, y) * .38;
      const ripple = 1 + Math.sin(x * 7 + y * 3 + z * 5) * .12;
      vertices.setXYZ(i, x * taper * ripple, y, z * taper * ripple);
    }
    crownGeo.computeVertexNormals();
    crownGeo.computeBoundingSphere();
    this.geometries.push(trunkGeo, crownGeo);
    const stems: THREE.Matrix4[] = [];
    const crowns = foliageMaterials.map(() => [] as THREE.Matrix4[]);
    const position = new THREE.Vector3(), scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion(), matrix = new THREE.Matrix4();
    const rng = mulberry32(seeded(this.landscape.area.terrain.seed, 641));
    for (const belt of pheasantShelterbelts(this.landscape.area)) {
      const plantingCount = Math.ceil(belt.count * 1.65);
      for (let i = 0; i < plantingCount; i++) {
        const t = i / (plantingCount - 1);
        // Retain the farm windbreak line, but give it surviving groups,
        // replacement saplings and openings instead of identical spacing.
        const clustered = t + Math.sin(t * Math.PI * 6) * .035;
        const along = (clustered - .5) * belt.length + (rng() - .5) * 3;
        const across = Math.sin(t * Math.PI * 3) * 4 + (rng() - .5) * 5;
        const x = belt.x + Math.cos(belt.angle) * along - Math.sin(belt.angle) * across;
        const y = belt.y + Math.sin(belt.angle) * along + Math.cos(belt.angle) * across;
        if (!pheasantPlantClear(this.landscape.area, x, y, 2)) continue;
        const ground = this.landscape.surfaceAtProperty(x, y, this.surface);
        if (ground.moisture > .72 || ground.slope > .4) continue;
        this.landscape.propertyToWorld(x, y, this.world);
        const young = rng() < .28;
        const height = young ? 3.5 + rng() * 2.5 : 8 + rng() * 5;
        const breadth = young ? .78 : 1.16 + rng() * .32;
        rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
        position.set(this.world.x, ground.height + height * .36, this.world.z);
        scale.set(.8 + rng() * .4, height * .72, .8 + rng() * .4);
        stems.push(matrix.compose(position, rotation, scale).clone());
        for (let lobe = 0; lobe < 4; lobe++) {
          const angle = lobe * 2.4 + rng() * .5;
          const spread = lobe === 3 ? .15 : height * .13;
          position.set(this.world.x + Math.cos(angle) * spread,
            ground.height + height * (lobe === 3 ? .83 : .56 + rng() * .15),
            this.world.z + Math.sin(angle) * spread);
          scale.set(height * (.16 + rng() * .06) * breadth, height * (.20 + rng() * .08), height * (.14 + rng() * .06) * breadth);
          crowns[i % crowns.length].push(matrix.compose(position, rotation, scale).clone());
        }
      }
    }
    const addBatch = (geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], name: string) => {
      if (!matrices.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((transform, i) => mesh.setMatrixAt(i, transform));
      mesh.name = name;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      // Distant structural planting stays out of the shadow pass at both
      // tiers. Four shared batches retain the same landmarks on mobile.
      mesh.computeBoundingSphere();
      ctx.scene.add(mesh);
      this.objects.push(mesh);
    };
    addBatch(trunkGeo, trunkMaterial, stems, 'Pheasant shelterbelt trunks');
    crowns.forEach((transforms, i) => addBatch(crownGeo, foliageMaterials[i], transforms, 'Pheasant shelterbelt crowns'));
  }

  private buildCottonwood(
    seed: number,
    height: number,
    trunkMaterial: THREE.Material,
    branchMaterial: THREE.Material,
    foliageMaterials: THREE.Material[],
    castShadow: boolean,
  ): THREE.Group {
    const rng = mulberry32(seed);
    const root = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.36, 0.62, height * 0.72, 9, 4);
    this.breakCylinder(trunkGeo, 0.075, seed);
    this.geometries.push(trunkGeo);
    const trunk = new THREE.Mesh(trunkGeo, trunkMaterial);
    trunk.position.y = height * 0.36;
    trunk.castShadow = castShadow;
    trunk.receiveShadow = true;
    root.add(trunk);

    const branchGeo = new THREE.CylinderGeometry(0.11, 0.25, 1, 7, 2);
    const crownGeo = new THREE.IcosahedronGeometry(1, 2);
    this.geometries.push(branchGeo, crownGeo);
    const up = new THREE.Vector3(0, 1, 0);
    const branchMatrices: THREE.Matrix4[] = [];
    const canopyMatrices = foliageMaterials.map(() => [] as THREE.Matrix4[]);
    const branchPosition = new THREE.Vector3();
    const branchQuaternion = new THREE.Quaternion();
    const branchUnit = new THREE.Vector3();
    const branchScale = new THREE.Vector3();
    const canopyPosition = new THREE.Vector3();
    const canopyQuaternion = new THREE.Quaternion();
    const canopyEuler = new THREE.Euler();
    const canopyScale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
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
      branchPosition.copy(start).add(end).multiplyScalar(0.5);
      branchUnit.copy(direction).normalize();
      branchQuaternion.setFromUnitVectors(up, branchUnit);
      branchScale.set(0.72 + rng() * 0.42, direction.length(), 0.72 + rng() * 0.42);
      branchMatrices.push(matrix.compose(branchPosition, branchQuaternion, branchScale).clone());

      const lobes = 2 + (i % 3 === 0 ? 1 : 0);
      for (let lobe = 0; lobe < lobes; lobe++) {
        const materialIndex = (i + lobe) % foliageMaterials.length;
        canopyPosition.copy(end).add(new THREE.Vector3(
          (rng() - 0.5) * height * 0.12,
          (rng() - 0.35) * height * 0.1,
          (rng() - 0.5) * height * 0.12,
        ));
        canopyScale.set(
          height * (0.12 + rng() * 0.06),
          height * (0.09 + rng() * 0.055),
          height * (0.12 + rng() * 0.06),
        );
        canopyEuler.set(rng(), rng() * Math.PI, rng());
        canopyQuaternion.setFromEuler(canopyEuler);
        canopyMatrices[materialIndex].push(matrix.compose(canopyPosition, canopyQuaternion, canopyScale).clone());
      }
    }

    const branches = new THREE.InstancedMesh(branchGeo, branchMaterial, branchMatrices.length);
    branches.matrixAutoUpdate = false;
    for (let i = 0; i < branchMatrices.length; i++) branches.setMatrixAt(i, branchMatrices[i]);
    branches.instanceMatrix.needsUpdate = true;
    branches.castShadow = castShadow;
    branches.computeBoundingSphere();
    root.add(branches);

    for (let materialIndex = 0; materialIndex < canopyMatrices.length; materialIndex++) {
      const matrices = canopyMatrices[materialIndex];
      if (matrices.length === 0) continue;
      const canopies = new THREE.InstancedMesh(crownGeo, foliageMaterials[materialIndex], matrices.length);
      canopies.matrixAutoUpdate = false;
      for (let i = 0; i < matrices.length; i++) canopies.setMatrixAt(i, matrices[i]);
      canopies.instanceMatrix.needsUpdate = true;
      canopies.castShadow = castShadow;
      canopies.receiveShadow = true;
      canopies.computeBoundingSphere();
      root.add(canopies);
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
    const uvs: number[] = [];
    const ponds = pheasantPonds(this.landscape);
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
        // Seasonal litter/frost may settle on the bank, but never draw a
        // floating white plate through the water. Include the whole patch
        // extent when checking the pond's conservative footprint.
        if (ponds.some(pond => Math.hypot(
          (px - pond.x) * PROPERTY_PX_TO_M / (pond.rx * 1.05 + rx),
          (py - pond.y) * PROPERTY_PX_TO_M / (pond.ry * 1.05 + rz),
        ) < 1)) continue;
        const segments = 10;
        for (let i = 0; i < segments; i++) {
          const a = i / segments * Math.PI * 2;
          const b = (i + 1) / segments * Math.PI * 2;
          uvs.push(.5, .5, .5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5,
            .5 + Math.cos(b) * .5, .5 + Math.sin(b) * .5);
          positions.push(
            this.world.x, surface.height + 0.045, this.world.z,
            this.world.x + Math.cos(a) * rx,
            this.landscape.heightAtWorld(this.world.x + Math.cos(a) * rx, this.world.z + Math.sin(a) * rz) + .045,
            this.world.z + Math.sin(a) * rz,
            this.world.x + Math.cos(b) * rx,
            this.landscape.heightAtWorld(this.world.x + Math.cos(b) * rx, this.world.z + Math.sin(b) * rz) + .045,
            this.world.z + Math.sin(b) * rz,
          );
        }
      }
    }
    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    this.geometries.push(geometry);
    ctx.scene.add(mesh);
    this.objects.push(mesh);
  }

  private buildFence(ctx: Ctx, postMaterial: THREE.Material, wireMaterial: THREE.Material, castShadow: boolean): void {
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
    posts.castShadow = castShadow;
    wires.castShadow = castShadow;
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
