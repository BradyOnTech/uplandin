import { quailOpeningAt, quailPlumAt } from '../../game/quailComposition';
import { quailGroundPropObstacles, quailGroundPropOccupies } from './quailGroundProps';
import { applyQuailFoliageLight } from './quailFoliage';
import * as THREE from 'three';
import { disposeQuailTreeKit, type QuailTreeKit } from '../assets/quailTreeKit';
import { quailKitOccupies } from './quailKit';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LandscapeModel } from '../../game/landscape';
import { PROPERTY_PX_TO_M } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import { QUAIL_TREE_STANDS, quailCoverAt, quailDrainageAt, quailSwardAt, quailSeed } from '../../game/quailLandscape';
import type { Ctx, Subsystem } from '../engine';
import { applyQuailSurfaceDetail } from './quailTerrain';
import { buildQuailTrackGeometry, quailTrackDistanceAt } from './quailTracks';
import { applyQuailTrackGroundLod, quailGroundNearDistance, sampleQuailGroundHeights } from './quailGroundGeometry';
import { buildQuailFenceGeometry } from './quailFences';
import { quailShrubGeometry, quailTreeGeometry } from './quailWoody';
import { quailGrassClumpGeometry, QUAIL_GRASS_VARIATION } from './quailGrass';
import { applyQuailGrassGroundLod, createQuailGrassGroundGeometry } from './quailGrassGround';
import { buildQuailDistantCover, quailGrassClearingAt, quailGrassMassAt, quailGrassStockingAt, quailSouthRouteAt } from './quailVegetation';

const TILE = 40; // yards; local batches remain independently culled.
const COLOR = { straw: 0xb6a574, dry: 0x919273, sage: 0x435f43, sageLight: 0x64794b, bark: 0x615343, leaf: 0x506c4e, leafLight: 0x748158 };
interface Instance { px: number; py: number; angle: number; sx: number; sy: number; sz: number; color: number }
interface Batch { mesh: THREE.Mesh; range: number; x: number; z: number; minRange: number; padding?: number; shadows?: boolean }
interface CircleObstacle { x: number; z: number; radius: number }
const EMPTY_SURFACE = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };

/** Fine branching sprays, kept open so sand sage does not read as broad paper leaves.
 * The wind material is already double-sided; duplicate reverse faces waste both
 * triangles and alpha-hash coverage. Each folded leaf is only two triangles. */
function sageGeometry(): THREE.BufferGeometry {
  const positions: number[] = []; const colors: number[] = [];
  const rng = mulberry32(6724);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, shade: number) => {
    for (const p of [a, b, c]) { positions.push(p.x, p.y, p.z); colors.push(shade, shade, shade); }
  };
  for (let shoot = 0; shoot < 9; shoot++) {
    const az = shoot * 2.399; const height = 0.40 + rng() * 0.40; const reach = 0.16 + rng() * 0.25;
    const at = (t: number) => new THREE.Vector3(Math.sin(az) * reach * t * t, height * t, Math.cos(az) * reach * t * t);
    for (let node = 1; node <= 5; node++) {
      const t = node / 5, center = at(t), lower = at(t - .2);
      const span = new THREE.Vector3(Math.cos(az) * .004, 0, -Math.sin(az) * .004);
      tri(lower.clone().add(span), center, lower.clone().sub(span), .60);
      // Alternate short, narrow sprays. The central vein has a shallow fold;
      // the old wide diamonds had the silhouette of tropical broad leaves.
      for (const side of [-1, 1]) {
        const leafAz = az + side * (1.05 + node * .37);
        const length = (.08 + rng() * .10) * (1.25 - t * .45);
        const tip = center.clone().add(new THREE.Vector3(Math.sin(leafAz) * length, .045 + rng() * .035, Math.cos(leafAz) * length));
        const mid = center.clone().lerp(tip, .54); mid.y += .006;
        const half = new THREE.Vector3(Math.cos(leafAz) * .010, -.005, -Math.sin(leafAz) * .010);
        tri(center, mid.clone().add(half), tip, .88);
        tri(center, tip, mid.clone().sub(half), .97);
      }
      // One small terminal spray breaks up the staircase outline.
      if (node >= 4) {
        const tip = center.clone().add(new THREE.Vector3(Math.sin(az) * .045, .075, Math.cos(az) * .045));
        const mid = center.clone().lerp(tip, .5), half = span.clone().multiplyScalar(2);
        tri(center, mid.clone().add(half), tip, .94);
        tri(center, tip, mid.clone().sub(half), .90);
      }
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals(); return geo;
}

/** Property-wide vegetation, wind, tracks and fencing for the single Quail Fields art direction. */
export class QuailEnvironmentSystem implements Subsystem {
  readonly id = 'quail-environment';
  private root = new THREE.Group();
  private batches: Batch[] = [];
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private obstacles: CircleObstacle[] = [];
  private wind = { value: 0 };
  private groundNearDistance = quailGroundNearDistance('high');
  private matrix = new THREE.Matrix4(); private position = new THREE.Vector3(); private rotation = new THREE.Quaternion();
  private scale = new THREE.Vector3(); private color = new THREE.Color(); private euler = new THREE.Euler();
  private slopeRotation = new THREE.Quaternion(); private normal = new THREE.Vector3(); private up = new THREE.Vector3(0, 1, 0);
  private surface = { ...EMPTY_SURFACE }; private world = { x: 0, z: 0 };
  private treeKit?:QuailTreeKit;
  constructor(private readonly landscape: LandscapeModel,private readonly loadTrees?:(quality:Ctx['quality'])=>Promise<QuailTreeKit>) {}

  /** Tree trunks are solid, while the dog can work through the visual cover. */
  collisionCircles(): readonly CircleObstacle[] { return this.obstacles; }

  private material(color: number, wind = false, fade = [-1, 0, 1000, 1100], grass = false): THREE.MeshLambertMaterial {
    const mat = new THREE.MeshLambertMaterial({ color, side: wind ? THREE.DoubleSide : THREE.FrontSide, vertexColors: wind });
    if (wind) {
      const time = this.wind;
      mat.alphaHash = true;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uQuailWind = time;
        shader.uniforms.uQuailFade = { value: new THREE.Vector4(...fade as [number, number, number, number]) };
        // Grass is a thin, light-transmitting leaf; an upward normal bias avoids black backfaces.
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vQuailDistance;\nuniform vec4 uQuailFade;')
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= smoothstep(uQuailFade.x, uQuailFade.y, vQuailDistance) * (1.0 - smoothstep(uQuailFade.z, uQuailFade.w, vQuailDistance));')
          .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), 0.88));');
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uQuailWind;\nvarying float vQuailDistance;' + (grass ? '\nattribute vec4 quailBlade;' : ''))
          .replace('#include <begin_vertex>', `#include <begin_vertex>
          ${grass ? QUAIL_GRASS_VARIATION : ''}
          #ifdef USE_INSTANCING
          float phase = instanceMatrix[3].x * 0.24 + instanceMatrix[3].z * 0.17;
          float bend = sin(uQuailWind * 1.7 + phase) * 0.04 + sin(uQuailWind * 0.7 + phase * 0.3) * 0.035;
          transformed.x += bend * position.y * position.y;
          transformed.z += bend * position.y * 0.45;
          vQuailDistance = length((modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz - cameraPosition.xz);
          #else
          vQuailDistance = length((modelMatrix * vec4(transformed, 1.0)).xz - cameraPosition.xz);
          #endif`);
        if (grass) applyQuailGrassGroundLod(shader, this.groundNearDistance);
      };
    }
    if (wind) mat.customProgramCacheKey = () => grass ? 'quail-grass-clumps-ground-v4' : 'quail-sage-v2';
    this.materials.add(mat); return mat;
  }

  private batch(geometry: THREE.BufferGeometry, material: THREE.Material, instances: Instance[], range: number, minRange = 0, groundAligned = false): void {
    if (!instances.length) return;
    const grounds = groundAligned ? new Float32Array(instances.length * 3) : null;
    const fitted = grounds ? createQuailGrassGroundGeometry(geometry, grounds) : geometry;
    if (grounds) this.geometries.add(fitted);
    const mesh = new THREE.InstancedMesh(fitted, material, instances.length);
    let xTotal = 0; let zTotal = 0; let maxGroundShift = 0;
    for (let i = 0; i < instances.length; i++) {
      const v = instances[i]; this.landscape.propertyToWorld(v.px, v.py, this.world);
      this.position.set(this.world.x, this.landscape.heightAtProperty(v.px, v.py), this.world.z);
      this.euler.set(0, v.angle, 0); this.rotation.setFromEuler(this.euler); this.scale.set(v.sx, v.sy, v.sz);
      if (groundAligned) {
        this.landscape.surfaceAtProperty(v.px, v.py, this.surface);
        this.normal.set(-this.surface.gradeX, 1, -this.surface.gradeZ).normalize();
        this.slopeRotation.setFromUnitVectors(this.up, this.normal); this.rotation.premultiply(this.slopeRotation);
        const ground = sampleQuailGroundHeights(this.landscape, v.px, v.py);
        this.position.y = ground.nearY - .006;
        grounds!.set([ground.farY - ground.nearY, ground.tileCenterX, ground.tileCenterZ], i * 3);
        maxGroundShift = Math.max(maxGroundShift, Math.abs(ground.farY - ground.nearY));
      }
      mesh.setMatrixAt(i, this.matrix.compose(this.position, this.rotation, this.scale));
      this.color.setHex(v.color); mesh.setColorAt(i, this.color); xTotal += this.world.x; zTotal += this.world.z;
    }
    mesh.computeBoundingSphere(); mesh.boundingSphere!.radius += maxGroundShift; mesh.receiveShadow = true; mesh.castShadow = range > 200;
    this.root.add(mesh); this.batches.push({ mesh, range, minRange, x: xTotal / instances.length, z: zTotal / instances.length });
  }

  private treeStand(trees: Instance[], stand: { x: number; y: number }, bark: THREE.Material, canopy: THREE.Material, authored=false): void {
    const trunks: THREE.BufferGeometry[] = []; const crowns: THREE.BufferGeometry[] = [];
    for (const [i, tree] of trees.entries()) {
      // A taller interior, low spreading shoulders, and outward-leaning edge
      // trees give each fixed stand a group silhouette without moving its roots.
      const habit = i < trees.length * 0.34 ? 'upright' : i % 3 === 0 ? 'leaning' : 'spreading';
      const template=authored?this.treeKit?.[habit]:undefined;
      const geometry = template?{trunk:template.trunk.clone(),crown:template.crown.clone()}:quailTreeGeometry(quailSeed(Math.round(tree.px * 10), Math.round(tree.py * 10), 29), habit);
      this.landscape.propertyToWorld(tree.px, tree.py, this.world);
      this.position.set(this.world.x, this.landscape.heightAtProperty(tree.px, tree.py), this.world.z);
      this.euler.set(0, habit === 'leaning' ? Math.atan2(tree.px - stand.x, tree.py - stand.y) : tree.angle, 0);
      this.rotation.setFromEuler(this.euler); this.scale.set(tree.sx, tree.sy, tree.sz);
      this.matrix.compose(this.position, this.rotation, this.scale);
      for (const [part, color, target] of [[geometry.trunk, COLOR.bark, trunks], [geometry.crown, tree.color, crowns]] as const) {
        part.applyMatrix4(this.matrix);
        const shade = part.getAttribute('color'); const colors = new Float32Array(part.attributes.position.count * 3);
        this.color.setHex(color);
        for (let n = 0; n < part.attributes.position.count; n++) {
          const value = shade ? shade.getX(n) : 1;
          colors[n * 3] = this.color.r * value; colors[n * 3 + 1] = this.color.g * value; colors[n * 3 + 2] = this.color.b * value;
        }
        part.setAttribute('color', new THREE.BufferAttribute(colors, 3)); target.push(part);
      }
    }
    // Static stands retain two draw groups, even though each tree now has its
    // own geometry. Dense cover remains independently instanced by terrain tile.
    for (const [parts, material] of [[trunks, bark], [crowns, canopy]] as const) {
      if (!parts.length) continue;
      const geometry = mergeGeometries(parts)!; for (const part of parts) part.dispose();
      geometry.computeBoundingSphere(); this.geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true;
      const center = geometry.boundingSphere!.center;
      this.root.add(mesh); this.batches.push({ mesh, range: 780, minRange: 0, x: center.x, z: center.z });
    }
  }

  init(ctx: Ctx): void|Promise<void> {
    if(!this.loadTrees){this.build(ctx);return;}
    return this.loadTrees(ctx.quality).then(kit=>{
      this.treeKit=kit;
      try{this.build(ctx);}finally{disposeQuailTreeKit(kit);this.treeKit=undefined;}
    });
  }

  private build(ctx: Ctx): void {
    this.obstacles.push(...quailGroundPropObstacles(this.landscape));
    this.root.name = 'Quail Fields'; ctx.scene.add(this.root);
    this.groundNearDistance = quailGroundNearDistance(ctx.quality);
    const leafDetail = ctx.quality === 'high' ? 'near' : 'mid';
    const short = quailGrassClumpGeometry(false, leafDetail); const tall = quailGrassClumpGeometry(true, leafDetail);
    const midGrass = quailGrassClumpGeometry(true, ctx.quality === 'high' ? 'mid' : 'far'); const shrub = quailShrubGeometry(); const sage = sageGeometry();
    for (const g of [short, tall, midGrass, shrub, sage]) this.geometries.add(g);
    const nearRange = ctx.quality === 'high' ? 70 : 45;
    const farRange = ctx.quality === 'high' ? 180 : 135;
    const grassMat = this.material(0xffffff, true, [-1, 0, nearRange - 20, nearRange], true);
    const farGrassMat = this.material(0xffffff, true, [nearRange - 25, nearRange - 5, farRange - 25, farRange], true);
    const sageMat = this.material(0xffffff, true, [-1, 0, 270, 310]);
    const shrubMat = this.material(0xffffff); const barkMat = this.material(0xffffff); const canopyMat = this.material(0xffffff);
    shrubMat.vertexColors = true; barkMat.vertexColors = true; canopyMat.vertexColors = true;
    applyQuailFoliageLight(shrubMat);
    canopyMat.emissive.setHex(0x354f40); canopyMat.emissiveIntensity = .22;
    const bounds = this.landscape.area.world;
    const dryStem = new THREE.Color(0xa89571), dampLeaf = new THREE.Color(0x6d8976);
    const routeSurface = { dry: 0, edge: 0 };
    for (let ty = 0; ty < bounds.h; ty += TILE) {
      for (let tx = 0; tx < bounds.w; tx += TILE) {
        const shorts: Instance[] = []; const talls: Instance[] = []; const shrubs: Instance[] = []; const sages: Instance[] = []; const far: Instance[] = [];
        // The same deterministic candidates now collect around the shared
        // plum refuges. Open sward remains open for dog casts between coverts.
        for (let y = ty; y < Math.min(ty + TILE, bounds.h); y += 1.2) {
          for (let x = tx; x < Math.min(tx + TILE, bounds.w); x += 1.2) {
            const rng = mulberry32(quailSeed(Math.round(x * 10), Math.round(y * 10), 3));
            const px = x + rng() * 1.2; const py = y + rng() * 1.2;
            const road = quailTrackDistanceAt(this.landscape.area, px, py, 16) * PROPERTY_PX_TO_M;
            if (road < 1.55 || this.landscape.area.dropPoints.some((drop) => Math.hypot(px - drop.position.x, py - drop.position.y) < 9)) continue;
            const cover = quailCoverAt(this.landscape.area, px, py); const drain = quailDrainageAt(px, py);
            this.landscape.surfaceAtProperty(px, py, this.surface);
            const patch = quailSwardAt(px, py);
            const density = 0.14 + cover * 0.45 + patch * 0.56;
            if (rng() > density || this.surface.slope > 0.4) continue;
            const vigorous = cover > 0.25 && rng() < 0.74;
            const scale = 0.66 + rng() * 0.5 + patch * 0.35;
            const v: Instance = { px, py, angle: rng() * Math.PI * 2, sx: scale * (0.9 + rng() * 0.5), sy: scale * (vigorous ? 0.82 : 0.95), sz: scale, color: vigorous ? (rng() < 0.8 ? COLOR.straw : 0xb8af78) : COLOR.dry };
            const closeDetail = rng();
            void closeDetail;
            if (vigorous) rng();
            const plum = quailPlumAt(px, py) * cover, opening = quailOpeningAt(px, py);
            if (road > 5 && opening < .3 && !quailGroundPropOccupies(px,py,1.6) && !quailKitOccupies(this.landscape.area,px,py) && rng() < (0.0014 + plum * .115 + drain * .0015) * patch) {
              const s = 0.85 + rng() * 1.15 + plum * .30;
              if (plum < .15 && drain < 0.3 && rng() < 0.72) sages.push({ ...v, sy: s * 0.85, sx: s, sz: s, color: rng() < 0.5 ? 0x88967c : 0x969b7b });
              else shrubs.push({ ...v, sy: s * 0.88, sx: s * 1.4, sz: s * 1.15, color: rng() < 0.55 ? COLOR.sage : COLOR.sageLight });
            }
          }
        }
        // Tall, branching seed heads collect into stands; the ground between is
        // lower arching basal grass with deliberate empty space. The same
        // roots populate both distance layers so openings never fill at LOD.
        const spacing = 1.6, width = Math.min(TILE, bounds.w - tx), depth = Math.min(TILE, bounds.h - ty);
        // Integer cells avoid a floating-point extra row at the tile boundary.
        for (let row = 0; row < Math.ceil(depth / spacing); row++)
          for (let column = 0; column < Math.ceil(width / spacing); column++) {
            const x = tx + column * spacing, y = ty + row * spacing;
            const rng = mulberry32(quailSeed(Math.round(x * 10), Math.round(y * 10), 79));
            const px = x + rng() * Math.min(spacing, tx + width - x), py = y + rng() * Math.min(spacing, ty + depth - y);
            if (px < bounds.x + 1.5 || py < bounds.y + 1.5 || px > bounds.x + bounds.w - 1.5 || py > bounds.y + bounds.h - 1.5) continue;
            const road = quailTrackDistanceAt(this.landscape.area, px, py, 16) * PROPERTY_PX_TO_M;
            // Account for the full clump footprint at the verge and parking.
            if (road < 2.75 || quailGroundPropOccupies(px,py) || quailGrassClearingAt(this.landscape.area, px, py)) continue;
            const cover = quailCoverAt(this.landscape.area, px, py), mass = quailGrassMassAt(this.landscape.area, px, py);
            const sward = quailSwardAt(px, py), drain = quailDrainageAt(px, py);
            const stocking = quailGrassStockingAt(px, py);
            quailSouthRouteAt(px, py, routeSurface);
            const opening = quailOpeningAt(px, py), plum = quailPlumAt(px, py) * cover;
            const density = (.025 + sward * .12 + cover * .10 + mass * 1.15 + drain * .13)
              * (.22 + stocking * .80) * (1 - Math.max(routeSurface.dry, opening) * .72) * (1 - plum * .82);
            if (rng() > density) continue;
            const vigorous = rng() < mass * 1.15 + cover * .14;
            const scale = (.94 + rng() * .42 + mass * .08) * (.82 + stocking * .23) * (1 - Math.max(routeSurface.dry, opening) * .38) * (1 - plum * .22);
            this.color.setHex(vigorous ? COLOR.straw : COLOR.dry);
            if (vigorous) this.color.lerp(dryStem, rng() * .3);
            else this.color.lerp(dampLeaf, drain * .48);
            const spread = scale * (vigorous ? 1 + mass * .24 : 1.28);
            const v: Instance = { px, py, angle: rng() * Math.PI * 2, sx: spread, sy: scale * (.85 + rng() * .3), sz: spread * (.8 + rng() * .35), color: this.color.getHex() };
            const detail = rng();
            if (ctx.quality === 'high' || detail > .25) {
              (vigorous ? talls : shorts).push(v);
              far.push({ ...v, sy: v.sy * (vigorous ? 1 : .30) });
            }
          }
        this.batch(short, grassMat, shorts, nearRange, 0, true); this.batch(tall, grassMat, talls, nearRange, 0, true);
        this.batch(midGrass, farGrassMat, far, farRange, Math.max(0, nearRange - 55), true);
        this.batch(sage, sageMat, sages, ctx.quality === 'high' ? 310 : 245);
        this.batch(shrub, shrubMat, shrubs, ctx.quality === 'high' ? 330 : 250);
      }
    }
    const distantMat = this.material(0xffffff, true, [farRange - 45, farRange - 10, 560, 650]);
    for (const geometry of buildQuailDistantCover(this.landscape)) {
      const mesh = new THREE.Mesh(geometry, distantMat); mesh.name = 'Quail distant grass groups';
      const sphere = geometry.boundingSphere!;
      this.geometries.add(geometry); this.root.add(mesh);
      this.batches.push({ mesh, range: 650, minRange: 0, x: sphere.center.x, z: sphere.center.z, padding: sphere.radius, shadows: false });
    }
    for (let n = 0; n < QUAIL_TREE_STANDS.length; n++) {
      const stand = QUAIL_TREE_STANDS[n]; const rng = mulberry32(quailSeed(stand.x, stand.y, 9)); const trees: Instance[] = [];
      for (let i = 0; i < stand.count; i++) {
        const angle = i * 2.399 + rng() * 0.4; const radius = Math.sqrt((i + 0.4) / stand.count) * stand.radius;
        const px = stand.x + Math.sin(angle) * radius; const py = stand.y + Math.cos(angle) * radius;
        if (quailTrackDistanceAt(this.landscape.area, px, py, 16) < 8) continue;
        const size = stand.height * (0.75 + rng() * 0.45);
        trees.push({ px, py, angle: rng() * Math.PI * 2, sx: size * (0.92 + rng() * 0.24), sy: size, sz: size, color: rng() < 0.58 ? COLOR.leaf : COLOR.leafLight });
        this.landscape.propertyToWorld(px, py, this.world); this.obstacles.push({ x: this.world.x, z: this.world.z, radius: size * 0.036 });
      }
      this.treeStand(trees, stand, barkMat, canopyMat, n===0);
    }
    this.buildTracks(ctx); this.buildFence(); this.update(ctx);
  }

  private buildTracks(ctx: Ctx): void {
    const geometry = buildQuailTrackGeometry(this.landscape);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    applyQuailSurfaceDetail(mat, this.landscape);
    applyQuailTrackGroundLod(mat, ctx.quality);
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = 'Quail connected tracks and junctions'; mesh.receiveShadow = true;
    this.geometries.add(geometry); this.materials.add(mat); this.root.add(mesh);
  }

  private buildFence(): void {
    const wood = this.material(0x786e56); const postGeo = new THREE.CylinderGeometry(0.075, 0.09, 1.3, 5);
    postGeo.translate(0, 0.55, 0); this.geometries.add(postGeo);
    const fence = buildQuailFenceGeometry(this.landscape);
    this.batch(postGeo, wood, fence.posts.map(p => ({ px: p.x, py: p.y, angle: 0, sx: 1, sy: 1, sz: 1, color: 0xffffff })), 1800);
    this.obstacles.push(...fence.laneObstacles);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x736f60 }); this.geometries.add(fence.wires); this.materials.add(wireMat);
    this.root.add(new THREE.LineSegments(fence.wires, wireMat));
  }

  update(ctx: Ctx): void {
    this.wind.value = ctx.time;
    for (const batch of this.batches) {
      const distance = Math.hypot(ctx.camera.position.x - batch.x, ctx.camera.position.z - batch.z);
      batch.mesh.visible = distance < batch.range + (batch.padding ?? TILE * 0.75) && distance >= batch.minRange;
      batch.mesh.castShadow = batch.shadows !== false && batch.range > 200 && distance < 115;
    }
  }

  dispose(ctx: Ctx): void {
    ctx.scene.remove(this.root); for (const batch of this.batches) if (batch.mesh instanceof THREE.InstancedMesh) batch.mesh.dispose();
    for (const geometry of this.geometries) geometry.dispose(); for (const material of this.materials) material.dispose();
    this.root.clear(); this.batches.length = 0; this.obstacles.length = 0; this.geometries.clear(); this.materials.clear();
  }
}
