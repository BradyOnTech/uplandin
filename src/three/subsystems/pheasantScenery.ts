import * as THREE from 'three';
import { buildPlainsTree, type PlainsTreeSpecies } from '../assets/plainsTree';
import { plainsFoliageMaterial, plainsWoodMaterial } from '../assets/plainsTreeMaterials';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { pheasantWestFence } from '../../game/pheasantHabitat';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';
import { pheasantPlantClear, pheasantPonds, pheasantShelterbelts, pheasantTrackDistance } from './pheasantLandscape';
import { pheasantFarmFenceLines, pheasantFarmFields } from '../../game/pheasantFarm';
import { createQuailWindmill } from './quailLandmarks';
import { createPrairieWater } from '../prairieWater';

function seeded(seed: number, salt: number): number {
  let h = seed ^ Math.imul(salt, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

/** A pond surface in concentric rings so it can carry faceted waves. The
 * shoreline keeps broad bends; uv stays radial for the soft margin. */
function irregularDisc(rx: number, rz: number, seed: number, y = 0): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const segments = 72, rings = 9;
  const phase = rng() * Math.PI * 2;
  const point = (ring: number, i: number): [number, number, number, number] => {
    const angle = i / segments * Math.PI * 2, t = ring / rings;
    // Broad shoreline bends, not independent spikes at every vertex.
    const wobble = .97 + Math.sin(angle * 3 + phase) * .025 + Math.sin(angle * 5 - phase) * .012;
    // Offset alternate rings so the facets form triangles, not a web.
    const skew = ring % 2 ? .5 / segments * Math.PI * 2 : 0;
    const a = angle + skew * (1 - t);
    return [Math.cos(a) * rx * wobble * t, Math.sin(a) * rz * wobble * t, .5 + Math.cos(a) * .5 * t, .5 + Math.sin(a) * .5 * t];
  };
  const positions: number[] = [], uv: number[] = [];
  const push = (...points: [number, number, number, number][]) => {
    for (const [x, z, u, v] of points) { positions.push(x, y, z); uv.push(u, v); }
  };
  for (let ring = 0; ring < rings; ring++) for (let i = 0; i < segments; i++) {
    const a = point(ring, i), b = point(ring, i + 1), c = point(ring + 1, i), d = point(ring + 1, i + 1);
    if (ring === 0) { push(a, d, c); continue; }
    push(a, d, c); push(a, b, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A muskrat lodge: a low, lumpy dome of heaped cattail stalks, faceted. */
function muskratLodgeGeometry(seed: number, radius: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const geometry = new THREE.SphereGeometry(radius, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors: number[] = [];
  const straw = new THREE.Color(0x6d5b3e), dark = new THREE.Color(0x3d3325), wet = new THREE.Color(0x2c281d), color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const px = position.getX(i), py = position.getY(i), pz = position.getZ(i);
    // Heaped stalks: ragged, with the odd tuft poking up out of the pile.
    const lump = .78 + rng() * .38, tuft = py > radius * .3 && rng() < .3 ? 1.35 : 1;
    position.setXYZ(i, px * lump, py * (.5 + rng() * .22) * tuft, pz * lump);
    const height = py / radius;
    color.copy(dark).lerp(straw, Math.min(1, height * 1.3 + rng() * .25)).lerp(wet, height < .18 ? .6 : 0);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const flat = geometry.toNonIndexed(); geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}

/** A drift of duckweed and floating leaves: a flat, ragged low-poly patch. */
function floatingMatGeometry(seed: number, radius: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const sides = 9, positions: number[] = [], colors: number[] = [];
  const green = new THREE.Color(0x6f7a3a), brown = new THREE.Color(0x7a6a3c), color = new THREE.Color();
  const rim: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const angle = i / sides * Math.PI * 2, r = radius * (.55 + rng() * .45);
    rim.push([Math.cos(angle) * r, Math.sin(angle) * r * (.6 + rng() * .3)]);
  }
  for (let i = 0; i < sides; i++) {
    const a = rim[i], b = rim[(i + 1) % sides];
    color.copy(green).lerp(brown, rng() * .7).multiplyScalar(.85 + rng() * .25);
    positions.push(0, 0, 0, b[0], 0, b[1], a[0], 0, a[1]);
    for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class PheasantScenerySystem implements Subsystem {
  readonly id = 'flora';
  private objects: THREE.Object3D[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private surface: GroundSample = {
    height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
  };
  private world = { x: 0, z: 0 };
  private obstacles: { x: number; z: number; radius: number }[] = [];
  private shotWood: THREE.Object3D[] = [];
  private shotRay = new THREE.Raycaster();
  private shotOrigin = new THREE.Vector3();
  private shotDirection = new THREE.Vector3();

  /** Trees and posts first, then the muskrat lodges out in the water. */
  collisionCircles(): readonly { x: number; z: number; radius: number }[] {
    if (this.lodgeObstacles.length && !this.lodgesMerged) { this.obstacles.push(...this.lodgeObstacles); this.lodgesMerged = true; }
    return this.obstacles;
  }
  private lodgeObstacles: { x: number; z: number; radius: number }[] = [];
  private lodgesMerged = false;

  blocksShot(origin: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }): boolean {
    this.shotOrigin.set(origin.x, origin.y, origin.z);
    this.shotDirection.set(target.x - origin.x, target.y - origin.y, target.z - origin.z);
    const distance = this.shotDirection.length();
    if (distance < .001) return false;
    this.shotRay.set(this.shotOrigin, this.shotDirection.divideScalar(distance));
    this.shotRay.far = distance - .001;
    for (const wood of this.shotWood) wood.updateWorldMatrix(true, false);
    return this.shotRay.intersectObjects(this.shotWood, false).length > 0;
  }

  private woodMaterial?: THREE.MeshStandardMaterial;
  private leafMaterial?: THREE.MeshStandardMaterial;

  constructor(private readonly landscape: LandscapeModel) {}

  private rotor?: THREE.Object3D;
  private water = createPrairieWater();

  update(ctx: Ctx): void {
    this.water.update(ctx);
    const time = this.leafMaterial?.userData.time as { value: number } | undefined;
    if (time) time.value = ctx.time;
    if (this.rotor) this.rotor.rotation.z = -ctx.time * .32;
  }

  /**
   * What a real prairie pothole holds in late season: a muskrat lodge or two
   * of heaped cattail out in the open water, and mats of duckweed and
   * floating leaves drifted against the reeds.
   */
  private addSloughLife(ctx: Ctx, x: number, y: number, z: number, rx: number, rz: number, major: boolean, seed: number): void {
    const rng = mulberry32(seed);
    if (!this.lodgeMaterial) {
      this.lodgeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
      this.matMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.materials.push(this.lodgeMaterial, this.matMaterial);
    }
    const lodges = major ? 1 + Math.floor(rng() * 2) : rng() < .6 ? 1 : 0;
    for (let i = 0; i < lodges; i++) {
      const angle = rng() * Math.PI * 2, r = .45 + rng() * .25;
      const lx = x + Math.cos(angle) * rx * r, lz = z + Math.sin(angle) * rz * r;
      const lodge = new THREE.Mesh(muskratLodgeGeometry(seed + i * 17, 1.1 + rng() * .5), this.lodgeMaterial);
      lodge.position.set(lx, y - .08, lz); lodge.rotation.y = rng() * Math.PI * 2;
      lodge.castShadow = ctx.quality === 'high'; lodge.receiveShadow = true;
      this.geometries.push(lodge.geometry); ctx.scene.add(lodge); this.objects.push(lodge);
      this.lodgeObstacles.push({ x: lx, z: lz, radius: 1.3 });
    }
    const mats = major ? 5 + Math.floor(rng() * 4) : 3;
    for (let i = 0; i < mats; i++) {
      const angle = rng() * Math.PI * 2, r = .74 + rng() * .17;
      const mat = new THREE.Mesh(floatingMatGeometry(seed + 91 + i * 13, 1.2 + rng() * 2.6), this.matMaterial);
      mat.position.set(x + Math.cos(angle) * rx * r, y + .025, z + Math.sin(angle) * rz * r);
      mat.rotation.y = rng() * Math.PI * 2; mat.receiveShadow = true;
      this.geometries.push(mat.geometry); ctx.scene.add(mat); this.objects.push(mat);
    }
  }
  private lodgeMaterial?: THREE.MeshStandardMaterial;
  private matMaterial?: THREE.MeshStandardMaterial;

  init(ctx: Ctx): void {
    // The shared key light already supplies the field's major shadow shapes.
    // Keep detailed cottonwood branches and fence wires out of the lite
    // shadow pass; they remain visible and receive light, while a phone avoids
    // re-rendering dozens of small casters into the shadow map every frame.
    const castShadow = ctx.quality === 'high';
    // Prairie slough water: see prairieWater.ts.
    const waterMaterial = this.water.material;
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
    this.woodMaterial = plainsWoodMaterial();
    this.leafMaterial = plainsFoliageMaterial();
    this.materials.push(this.woodMaterial, this.leafMaterial);
    const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0x776854, roughness: 1, flatShading: true });
    const wireMaterial = new THREE.MeshStandardMaterial({ color: 0x343836, roughness: 0.92 });
    this.materials.push(
      waterMaterial, snowMaterial, fenceMaterial, wireMaterial,
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
      water.renderOrder = -1;
      ctx.scene.add(water);
      this.objects.push(water);
      this.addSloughLife(ctx, pond.x, waterY, pond.z, rx, rz, major, seeded(this.landscape.area.terrain.seed, 300 + i));

      // Cottonwoods claim the drier shoulder beside each huntable slough.
      if (major) {
        const treeX = pond.x + (i % 2 === 0 ? rx + 13 : -rx - 11);
        const treeZ = pond.z - rz * 0.28;
        const tree = this.buildCottonwood(seeded(this.landscape.area.terrain.seed, 90 + i), 18 + i * 1.6, castShadow);
        tree.position.set(treeX, this.landscape.heightAtWorld(treeX, treeZ) - 0.1, treeZ);
        tree.rotation.y = i * 1.83 + 0.4;
        this.obstacles.push({ x: treeX, z: treeZ, radius: .70 });
        ctx.scene.add(tree);
        this.objects.push(tree);
      }
    }

    this.buildShelterbelts(ctx);
    // The Stock Pond is fed by an old windmill and tank on its dry west
    // shoulder: a turning landmark readable from anywhere on the farm.
    for (const pond of visiblePonds.filter(p => p.landmarkId === 'area-feature')) {
      const millX = pond.x - pond.rx - 9, millZ = pond.z + pond.ry * .35;
      const ground = this.landscape.heightAtWorld(millX, millZ);
      const mill = createQuailWindmill((x, z) => this.landscape.heightAtWorld(millX + x, millZ + z) - ground);
      mill.position.set(millX, ground, millZ);
      this.rotor = mill.getObjectByName('Quail wind rotor');
      mill.traverse(child => { if ((child as THREE.Mesh).isMesh) { child.castShadow = castShadow; child.receiveShadow = true; } });
      this.obstacles.push({ x: millX, z: millZ, radius: 1.3 }, { x: millX + 3.35, z: millZ + .35, radius: 1.3 });
      ctx.scene.add(mill);
      this.objects.push(mill);
    }
    this.buildSeasonalGround(ctx, snowMaterial);
    this.buildFence(ctx, fenceMaterial, wireMaterial, castShadow);
    this.buildFarmFences(ctx, fenceMaterial, wireMaterial);
    this.buildBales(ctx, castShadow);
  }

  /** Three-wire section fences along the farm's field lines. Openings are
   * left wherever a route or entry crosses, like a field gate left open. */
  private buildFarmFences(ctx: Ctx, postMaterial: THREE.Material, wireMaterial: THREE.Material): void {
    const area = this.landscape.area;
    const postGeo = new THREE.CylinderGeometry(.055, .07, 1.25, 5);
    const spanGeo = new THREE.BoxGeometry(1, .018, .018);
    this.geometries.push(postGeo, spanGeo);
    const posts: THREE.Matrix4[] = [], wires: THREE.Matrix4[] = [];
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1), xAxis = new THREE.Vector3(1, 0, 0), direction = new THREE.Vector3();
    const tilt = new THREE.Euler();
    const spacingYards = 4.6 / PROPERTY_PX_TO_M;
    for (const line of pheasantFarmFenceLines(area.world)) for (let s = 1; s < line.length; s++) {
      const a = line[s - 1], b = line[s], length = Math.hypot(b.x - a.x, b.y - a.y);
      const count = Math.max(2, Math.ceil(length / spacingYards) + 1);
      let previous: THREE.Vector3 | undefined;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1), x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        // Open where a route or truck entry passes, and inside pond margins.
        const open = pheasantTrackDistance(area, x, y, 8) < 7.5
          || area.dropPoints.some(d => Math.hypot(x - d.position.x, y - d.position.y) < 22)
          || pheasantPonds(this.landscape).some(p => Math.hypot((x - p.x) * PROPERTY_PX_TO_M / p.rx, (y - p.y) * PROPERTY_PX_TO_M / p.ry) < 1.35);
        if (open) { previous = undefined; continue; }
        this.landscape.propertyToWorld(x, y, this.world);
        const ground = this.landscape.heightAtWorld(this.world.x, this.world.z);
        const rng = seeded(area.terrain.seed, Math.round(x * 31 + y * 17)) / 0x100000000;
        tilt.set((rng - .5) * .08, rng * 6.28, (rng * 7 % 1 - .5) * .08);
        position.set(this.world.x, ground + .55, this.world.z);
        posts.push(matrix.compose(position, quaternion.setFromEuler(tilt), scale).clone());
        const top = new THREE.Vector3(this.world.x, ground, this.world.z);
        if (previous) for (const height of [.42, .74, 1.04]) {
          const from = previous.clone().setY(previous.y + height), to = top.clone().setY(top.y + height);
          direction.copy(to).sub(from);
          // A slight sag between posts reads as wire, not a rail.
          position.copy(from).add(to).multiplyScalar(.5).setY((from.y + to.y) / 2 - .035);
          quaternion.setFromUnitVectors(xAxis, direction.clone().normalize());
          wires.push(matrix.compose(position, quaternion, new THREE.Vector3(direction.length(), 1, 1)).clone());
        }
        previous = top;
      }
    }
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], name: string) => {
      if (!matrices.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = false;
      mesh.computeBoundingSphere();
      ctx.scene.add(mesh); this.objects.push(mesh);
    };
    add(postGeo, postMaterial, posts, 'Farm fence posts');
    add(spanGeo, wireMaterial, wires, 'Farm fence wires');
  }

  /** Round bales left along the edge of the cut hay, and a short row by
   * the farmstead. Solid: the hunter and dogs walk around them. */
  private buildBales(ctx: Ctx, castShadow: boolean): void {
    const hay = pheasantFarmFields(this.landscape.area.world).find(field => field.crop === 'hay');
    if (!hay) return;
    const bale = new THREE.CylinderGeometry(.78, .78, 1.45, 14, 1);
    bale.rotateZ(Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ color: 0xb6a371, roughness: 1, flatShading: true });
    const faceMaterial = new THREE.MeshStandardMaterial({ color: 0x9d8b5e, roughness: 1, flatShading: true });
    this.geometries.push(bale); this.materials.push(material, faceMaterial);
    const rng = mulberry32(seeded(this.landscape.area.terrain.seed, 977));
    const spots: { x: number; y: number; yaw: number }[] = [];
    // A broken line along the windrows near the south edge of the hay.
    for (let i = 0; i < 9; i++) spots.push({ x: hay.rect.x + 60 + i * 44 + (rng() - .5) * 18,
      y: hay.rect.y + hay.rect.h - 34 + (rng() - .5) * 10, yaw: (rng() - .5) * .5 });
    const mesh = new THREE.InstancedMesh(bale, [material, faceMaterial, faceMaterial], spots.length);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1);
    let n = 0;
    for (const spot of spots) {
      if (!pheasantPlantClear(this.landscape.area, spot.x, spot.y, 2)) continue;
      this.landscape.propertyToWorld(spot.x, spot.y, this.world);
      position.set(this.world.x, this.landscape.heightAtWorld(this.world.x, this.world.z) + .72, this.world.z);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw);
      mesh.setMatrixAt(n++, matrix.compose(position, rotation, scale));
      this.obstacles.push({ x: this.world.x, z: this.world.z, radius: .95 });
    }
    mesh.count = n;
    mesh.name = 'Hay bales';
    mesh.castShadow = castShadow; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    ctx.scene.add(mesh); this.objects.push(mesh);
  }

  private buildShelterbelts(ctx: Ctx): void {
    // A few grown trees per species, instanced with their own scale and
    // turn: windbreaks mix green ash, elm and boxelder with the odd
    // cottonwood, and neighbouring farms use cheaper distant crowns.
    const planted: { species: PlainsTreeSpecies; seed: number }[] = [
      { species: 'ash', seed: 11 }, { species: 'ash', seed: 12 }, { species: 'elm', seed: 21 }, { species: 'elm', seed: 22 },
      { species: 'boxelder', seed: 31 }, { species: 'boxelder', seed: 32 }, { species: 'cottonwood', seed: 41 },
    ];
    const variants = planted.map(({ species, seed }) => ({ species, tree: buildPlainsTree(species, seeded(this.landscape.area.terrain.seed, seed)), matrices: [] as THREE.Matrix4[] }));
    const distant = (['elm', 'ash', 'cottonwood'] as const).map((species, i) => ({ species,
      tree: buildPlainsTree(species, seeded(this.landscape.area.terrain.seed, 70 + i), 'distant'), matrices: [] as THREE.Matrix4[] }));
    for (const v of [...variants, ...distant]) this.geometries.push(v.tree.wood, v.tree.foliage);
    const position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion(), matrix = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    const rng = mulberry32(seeded(this.landscape.area.terrain.seed, 641));
    for (const belt of pheasantShelterbelts(this.landscape.area)) {
      const rng = mulberry32(seeded(this.landscape.area.terrain.seed, Math.round(belt.x * 73 + belt.y * 97)));
      const cohortPhase = seeded(this.landscape.area.terrain.seed, Math.round(belt.x * 31 + belt.y * 53)) / 0x100000000;
      const plantingCount = Math.ceil(belt.count * 1.65);
      for (let i = 0; i < plantingCount; i++) {
        const t = i / (plantingCount - 1);
        // Surviving groups, replacement saplings and openings instead of
        // identical spacing along the windbreak line.
        const clustered = t + Math.sin(t * Math.PI * 6) * .035;
        const along = (clustered - .5) * belt.length + (rng() - .5) * 3;
        const across = Math.sin(t * Math.PI * 3) * 4 + (rng() - .5) * 5;
        const x = belt.x + Math.cos(belt.angle) * along - Math.sin(belt.angle) * across;
        const y = belt.y + Math.sin(belt.angle) * along + Math.cos(belt.angle) * across;
        if (!pheasantPlantClear(this.landscape.area, x, y, 2)) continue;
        const ground = this.landscape.surfaceAtProperty(x, y, this.surface);
        if (ground.moisture > .72 || ground.slope > .4) continue;
        this.landscape.propertyToWorld(x, y, this.world);
        const young = rng() < .28, growth = rng();
        // Neighbouring trees share a planting cohort's species and stature.
        const maturity = .5 + .5 * Math.sin((t * 2.2 + cohortPhase) * Math.PI * 2);
        const cohort = Math.floor(t * 3.2 + cohortPhase * 3);
        // Saplings are straight-leadered ash and elm replacements; boxelder
        // and the odd volunteer cottonwood fill the mature rows.
        const pick = young ? (cohort % 2 ? 0 : 2) : rng() < .08 ? 6 : (cohort * 2 + (rng() < .5 ? 0 : 1)) % 6;
        const variant = variants[pick];
        const height = young ? 4 + growth * 2.5 : variant.species === 'cottonwood' ? 15 + growth * 4 : 8 + growth * 2.6 + maturity * 3;
        rotation.setFromAxisAngle(up, rng() * Math.PI * 2);
        position.set(this.world.x, ground.height - .05, this.world.z);
        const breadth = .88 + rng() * .28;
        scale.set(height * breadth, height, height * (.88 + rng() * .28));
        variant.matrices.push(matrix.compose(position, rotation, scale).clone());
        this.obstacles.push({ x: this.world.x, z: this.world.z, radius: Math.max(.2, height * .045) });
      }
    }
    // Plains windbreaks carry an evergreen row: dark eastern red cedars on
    // the field side of each belt give the farm its winter silhouette.
    const cedarGeo = new THREE.ConeGeometry(1, 1, 7, 2);
    cedarGeo.translate(0, .5, 0);
    const cedarMaterial = new THREE.MeshStandardMaterial({ color: 0x3f4d3c, roughness: 1, flatShading: true });
    this.geometries.push(cedarGeo); this.materials.push(cedarMaterial);
    const cedars: THREE.Matrix4[] = [];
    for (const belt of pheasantShelterbelts(this.landscape.area)) {
      const cedarRng = mulberry32(seeded(this.landscape.area.terrain.seed, Math.round(belt.x * 17 + belt.y * 29) ^ 0xcedd));
      const count = Math.max(3, Math.round(belt.length / 5.5));
      for (let i = 0; i < count; i++) {
        if (cedarRng() < .12) continue;
        const along = (i / (count - 1) - .5) * belt.length * .92 + (cedarRng() - .5) * 2;
        const across = 7 + (cedarRng() - .5) * 1.6;
        const x = belt.x + Math.cos(belt.angle) * along - Math.sin(belt.angle) * across;
        const y = belt.y + Math.sin(belt.angle) * along + Math.cos(belt.angle) * across;
        if (!pheasantPlantClear(this.landscape.area, x, y, 1.5)) continue;
        const ground = this.landscape.surfaceAtProperty(x, y, this.surface);
        if (ground.moisture > .72) continue;
        this.landscape.propertyToWorld(x, y, this.world);
        const height = 4.2 + cedarRng() * 3.2, radius = height * (.2 + cedarRng() * .06);
        for (const [lift, h, r] of [[0, 1, 1], [.34, .78, .72]] as const) {
          position.set(this.world.x + (cedarRng() - .5) * .3, ground.height - .15 + height * lift, this.world.z + (cedarRng() - .5) * .3);
          rotation.setFromAxisAngle(up, cedarRng() * Math.PI * 2);
          scale.set(radius * r, height * h, radius * r * (.85 + cedarRng() * .25));
          cedars.push(matrix.compose(position, rotation, scale).clone());
        }
        this.obstacles.push({ x: this.world.x, z: this.world.z, radius: radius * .7 });
      }
    }
    // Neighbouring farm windbreaks extend the landscape beyond the property
    // boundary in broken groups with open prairie between them.
    const bounds = this.landscape.area.world;
    for (let side = 0; side < 4; side++) for (let group = 0; group < 3; group++) {
      const center = .17 + group * .31 + (rng() - .5) * .06;
      const depth = 65 + rng() * 65;
      for (let i = 0; i < 13; i++) {
        if (rng() < .17) continue;
        const along = center + (i - 6) * .009;
        const outside = depth + Math.sin(i * .7) * 12 + rng() * 8;
        const x = side < 2 ? bounds.x + bounds.w * along
          : side === 2 ? bounds.x - outside : bounds.x + bounds.w + outside;
        const y = side >= 2 ? bounds.y + bounds.h * along
          : side === 0 ? bounds.y - outside : bounds.y + bounds.h + outside;
        this.landscape.propertyToWorld(x, y, this.world);
        const height = 10 + rng() * 10;
        rotation.setFromAxisAngle(up, rng() * Math.PI * 2);
        position.set(this.world.x, this.landscape.heightAtProperty(x, y) - .05, this.world.z);
        scale.set(height, height, height);
        distant[(group + side) % distant.length].matrices.push(matrix.compose(position, rotation, scale).clone());
      }
    }
    const addBatch = (geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], name: string, wood: boolean, castShadow: boolean) => {
      if (!matrices.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((transform, i) => mesh.setMatrixAt(i, transform));
      mesh.name = name;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      // Walkable farm windbreaks need contact and canopy shadows; the sun's
      // local frustum clips distant planting out of the shadow map anyway.
      mesh.castShadow = castShadow && ctx.quality === 'high';
      mesh.computeBoundingSphere();
      ctx.scene.add(mesh);
      this.objects.push(mesh);
      if (wood) this.shotWood.push(mesh);
    };
    for (const v of variants) {
      addBatch(v.tree.wood, this.woodMaterial!, v.matrices, `Pheasant shelterbelt ${v.species} wood`, true, true);
      addBatch(v.tree.foliage, this.leafMaterial!, v.matrices, `Pheasant shelterbelt ${v.species} crowns`, false, true);
    }
    for (const v of distant) {
      addBatch(v.tree.wood, this.woodMaterial!, v.matrices, 'Neighbouring windbreak wood', false, false);
      addBatch(v.tree.foliage, this.leafMaterial!, v.matrices, 'Neighbouring windbreak crowns', false, false);
    }
    addBatch(cedarGeo, cedarMaterial, cedars, 'Pheasant shelterbelt cedars', false, true);
  }

  /** A slough cottonwood: grown, gold and ragged, the tallest thing on the farm. */
  private buildCottonwood(seed: number, height: number, castShadow: boolean): THREE.Group {
    const root = new THREE.Group();
    const tree = buildPlainsTree('cottonwood', seed);
    this.geometries.push(tree.wood, tree.foliage);
    const wood = new THREE.Mesh(tree.wood, this.woodMaterial!), crown = new THREE.Mesh(tree.foliage, this.leafMaterial!);
    for (const mesh of [wood, crown]) {
      mesh.scale.setScalar(height);
      mesh.castShadow = castShadow; mesh.receiveShadow = true;
      root.add(mesh);
    }
    this.shotWood.push(wood);
    return root;
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
    const line = pheasantWestFence(this.landscape.area.landmarks);
    if (line.length < 2) return;
    const start = this.landscape.propertyToWorld(line[0].x, line[0].y, { x: 0, z: 0 });
    const end = this.landscape.propertyToWorld(line[1].x, line[1].y, { x: 0, z: 0 });
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    const postGeo = new THREE.BoxGeometry(0.16, 1.65, 0.16);
    const spanGeo = new THREE.BoxGeometry(1, 0.025, 0.025);
    this.geometries.push(postGeo, spanGeo);
    const count = Math.max(2, Math.ceil(length / 7.2) + 1);
    const posts = new THREE.InstancedMesh(postGeo, postMaterial, count);
    const wires = new THREE.InstancedMesh(spanGeo, wireMaterial, (count - 1) * 2);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const xAxis = new THREE.Vector3(1, 0, 0);
    const direction = new THREE.Vector3();
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x = start.x + (end.x - start.x) * t;
      const z = start.z + (end.z - start.z) * t;
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
    posts.name = 'West Pothole fence posts';
    wires.name = 'West Pothole fence wires';
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
      object.traverse(child => {
        if (child instanceof THREE.InstancedMesh) child.dispose();
        // The windmill brings its own geometry and materials.
        if (object.name === 'Old Windmill' && child instanceof THREE.Mesh) {
          child.geometry.dispose();
          for (const material of [child.material].flat()) material.dispose();
        }
      });
    }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.objects.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
    this.obstacles.length = 0; this.lodgeObstacles.length = 0; this.lodgesMerged = false;
    this.shotWood.length = 0;
    this.rotor = undefined;
  }
}
