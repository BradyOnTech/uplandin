import { ShallowWater } from '../../game/shallowWater';
import { wetPondLayout, wetPondRadius } from '../../game/wetPonds';
import * as THREE from 'three';
import type { AreaTrail } from '../../game/areas';
import type { GroundSample, LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Vec2 } from '../../game/types';
import type { Ctx, Subsystem } from '../engine';

export type Pond = {
  px: number;
  py: number;
  rx: number;
  rz: number;
  angle: number;
  waterY: number;
  seed: number;
  hero?: boolean;
};

type TreePlacement = {
  x: number;
  z: number;
  y: number;
  height: number;
  crown: number;
  yaw: number;
  trunkColor: number;
  crownColor: number;
};

type SedgePlacement = {
  x: number;
  z: number;
  y: number;
  scale: number;
  yaw: number;
  color: number;
};

type LogPlacement = {
  x: number;
  z: number;
  y: number;
  length: number;
  diameter: number;
  yaw: number;
  color: number;
};

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

function seeded(seed: number, salt: number): number {
  let value = seed ^ Math.imul(salt, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  return (value ^ (value >>> 13)) >>> 0;
}

function trailLength(trail: AreaTrail): number {
  let length = 0;
  for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1];
    const b = trail.points[i];
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

function pointAlongTrail(trail: AreaTrail, distance: number): { point: Vec2; tangent: Vec2 } | null {
  let remaining = distance;
  for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1];
    const b = trail.points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.01) continue;
    if (remaining <= length || i === trail.points.length - 1) {
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

export function irregularPuddleGeometry(
  puddles: readonly Pond[],
  landscape: LandscapeModel,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const segments = 24;
  const world = { x: 0, z: 0 };
  let vertex = 0;

  for (const pond of puddles) {
    const rng = mulberry32(pond.seed ^ 0x84b3);
    const inner: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const wobble = 0.87 + rng() * 0.2 + Math.sin(angle * 2.7 + pond.seed) * 0.045;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const alongX = c * pond.rx * wobble;
      const alongY = s * pond.rz * wobble;
      const pondCos = Math.cos(pond.angle);
      const pondSin = Math.sin(pond.angle);
      const localX = pond.px + alongX * pondCos - alongY * pondSin;
      const localY = pond.py + alongX * pondSin + alongY * pondCos;
      landscape.propertyToWorld(localX, localY, world);
      inner.push({ x: world.x, y: pond.waterY, z: world.z });
    }

    // A fan with a small, deterministic color shift gives the water a low
    // polygon rhythm without adding a second surface or texture lookup.
    landscape.propertyToWorld(pond.px, pond.py, world);
    const centerY = pond.waterY;
    positions.push(world.x, centerY, world.z);
    const centerColor = new THREE.Color(0x507c79);
    colors.push(centerColor.r, centerColor.g, centerColor.b);
    for (const point of inner) {
      positions.push(point.x, centerY, point.z);
      const edgeColor = new THREE.Color(0x6b9892).lerp(new THREE.Color(0x456b6d), rng() * 0.48);
      colors.push(edgeColor.r, edgeColor.g, edgeColor.b);
    }
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(vertex, vertex + 1 + i, vertex + 1 + next);
    }
    vertex += 1 + segments;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function alderTrunkGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  // Several slender stems share a root stool and diverge toward the crown.
  // Bake them together so a whole thicket still needs one trunk draw.
  for (const [x, z, height, lean] of [[-.18, .05, .92, -.24], [.16, -.08, 1, .22], [.02, .17, .76, .12]]) {
    const stem = new THREE.CylinderGeometry(.055, .11, height, 5, 1).toNonIndexed();
    const position = stem.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i) + height / 2;
      position.setXYZ(i, position.getX(i) + x + lean * y * y,
        y, position.getZ(i) + z + .1 * y * y);
    }
    positions.push(...Array.from(position.array));
    stem.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function alderCrownGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  // Uneven vertical sprays leave spaces between the stems, with foliage
  // extending below the top instead of forming a single flat umbrella.
  for (const [x, y, z, size] of [
    [-.48, -.35, .08, .58], [.4, -.12, -.15, .66],
    [-.17, .45, .04, .51], [.2, -.8, .28, .43], [-.6, -.94, -.2, .36],
  ]) {
    const lobe = new THREE.IcosahedronGeometry(size, 0);
    lobe.scale(.82, 1.15, .85); lobe.translate(x, y, z);
    positions.push(...Array.from(lobe.getAttribute('position').array)); lobe.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function sedgeGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const rng = mulberry32(0x5e9d41);
  const base = new THREE.Color(0xffffff);
  const tip = new THREE.Color(0xc4ccb2);
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const height = 0.38 + rng() * 0.48;
    const width = 0.04 + rng() * 0.03;
    const root = 0.03 + rng() * 0.18;
    const lean = 0.3 + rng() * 0.5;
    const sx = Math.sin(angle);
    const sz = Math.cos(angle);
    const px = Math.cos(angle);
    const pz = -Math.sin(angle);
    const bx = sx * root;
    const bz = sz * root;
    const tx = bx + sx * lean;
    const tz = bz + sz * lean;
    const mx = bx + (tx - bx) * 0.53;
    const mz = bz + (tz - bz) * 0.53;
    positions.push(
      bx - px * width, 0, bz - pz * width,
      bx + px * width, 0, bz + pz * width,
      mx + px * width * 0.54, height * 0.57, mz + pz * width * 0.54,
      bx - px * width, 0, bz - pz * width,
      mx + px * width * 0.54, height * 0.57, mz + pz * width * 0.54,
      mx - px * width * 0.54, height * 0.57, mz - pz * width * 0.54,
      mx - px * width * 0.54, height * 0.57, mz - pz * width * 0.54,
      mx + px * width * 0.54, height * 0.57, mz + pz * width * 0.54,
      tx, height, tz,
    );
    const bladeColor = base.clone().lerp(tip, rng() * 0.58);
    for (let vertex = 0; vertex < 9; vertex++) {
      const amount = vertex >= 6 ? 0.76 : vertex >= 3 ? 0.35 : 0;
      const shaded = bladeColor.clone().lerp(tip, amount);
      colors.push(shaded.r, shaded.g, shaded.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function downedLogGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.16, 0.23, 1, 7, 2);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    position.setX(i, position.getX(i) + Math.sin(y * 4 + i) * 0.035);
    position.setZ(i, position.getZ(i) + Math.cos(y * 3.4 + i * 0.7) * 0.03);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function windMaterial(
  material: THREE.MeshLambertMaterial,
  wind: { value: number },
): THREE.MeshLambertMaterial {
  material.onBeforeCompile = shader => {
    shader.uniforms.uWetBottomWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWetBottomWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float wetPhase = instanceMatrix[3].x * .071 + instanceMatrix[3].z * .057;
        float wetSway = sin(uWetBottomWind * .76 + wetPhase) * .055 * (position.y + .1);
        transformed.x += wetSway;
        transformed.z += sin(uWetBottomWind * .52 + wetPhase * 1.31) * wetSway * .52;
        #endif`);
  };
  material.customProgramCacheKey = () => 'woodcock-wet-bottom-wind-v1';
  return material;
}

/**
 * Woodcock-bottoms visual adapter. The wet chain is a compact, authored
 * composition layered over the shared wetland heightfield: shallow irregular
 * pools, soft mud rims, alder corridors, and fallen timber. It deliberately
 * uses a few instanced meshes so the map keeps its identity on mobile.
 */
export class WetBottomsSystem implements Subsystem {
  readonly id = 'woodcock-wet-bottoms';
  private objects: THREE.Object3D[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private wind = { value: 0 };
  private sample: GroundSample = { ...SAMPLE };
  private world = { x: 0, z: 0 };
  private property = { x: 0, y: 0 };
  private matrix = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private yaw = new THREE.Quaternion();
  private normal = new THREE.Vector3();
  private tangent = new THREE.Vector3();

  private obstacles: { x: number; z: number; radius: number }[] = [];
  private shotTrunks: THREE.InstancedMesh[] = [];
  private shotRay = new THREE.Raycaster();
  private shotOrigin = new THREE.Vector3();
  private shotDirection = new THREE.Vector3();
  collisionCircles() { return this.obstacles; }
  blocksShot(origin: {x:number;y:number;z:number}, target: {x:number;y:number;z:number}): boolean {
    this.shotOrigin.set(origin.x,origin.y,origin.z);
    this.shotDirection.set(target.x-origin.x,target.y-origin.y,target.z-origin.z);
    const distance=this.shotDirection.length();
    if(distance<.001)return false;
    this.shotRay.set(this.shotOrigin,this.shotDirection.divideScalar(distance));
    this.shotRay.far=distance-.001;
    return this.shotRay.intersectObjects(this.shotTrunks,false).length>0;
  }
  private readonly water: ShallowWater;
  private readonly ripples = { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0)) };
  private rippleCursor = 0;
  private lastWalker?: { x: number; z: number };
  private rippleDistance = 0;
  constructor(private readonly landscape: LandscapeModel) { this.water = new ShallowWater(landscape); }

  init(ctx: Ctx): void {
    const high = ctx.quality === 'high';
    const area = this.landscape.area;
    const ponds = this.buildPonds(high);
    if (ponds.length > 0) {
      const waterGeometry = irregularPuddleGeometry(ponds, this.landscape);
      const waterMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.24,
        metalness: 0.06,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      waterMaterial.customProgramCacheKey = () => 'bottoms-wading-ripples-v1';
      waterMaterial.onBeforeCompile = shader => {
        shader.uniforms.uWadeRipples = this.ripples;
        shader.uniforms.uWadeTime = this.wind;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vWadeWorld;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWadeWorld = (modelMatrix * vec4(position, 1.0)).xz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec4 uWadeRipples[8]; uniform float uWadeTime; varying vec2 vWadeWorld;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            float wake = 0.0;
            for (int i = 0; i < 8; i++) {
              float age = uWadeTime - uWadeRipples[i].z;
              float radius = .12 + age * .65;
              float ring = 1.0 - smoothstep(.018, .055, abs(length(vWadeWorld - uWadeRipples[i].xy) - radius));
              float fade = max(0.0, 1.0 - age / 1.8);
              wake += ring * fade * uWadeRipples[i].w;
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.32, .40, .34), min(wake * .5, .35));
          `);
      };
      const water = new THREE.Mesh(waterGeometry, waterMaterial);
      water.name = 'Woodcock irregular pond chain';
      water.receiveShadow = true;
      // Mud is painted on the basin terrain. A separate ring bridges over
      // the heightfield and produces a hard, floating-looking border.
      ctx.scene.add(water);
      this.objects.push(water);
      this.geometries.push(waterGeometry);
      this.materials.push(waterMaterial);
    }

    const trees = this.buildAlders(high).filter(tree => {
      this.landscape.worldToProperty(tree.x, tree.z, this.property);
      return !ponds.some(pond => wetPondRadius(pond, this.property.x, this.property.y) < 1.12);
    });
    if (trees.length > 0) {
      this.obstacles = trees.map(tree => ({x:tree.x,z:tree.z,radius:.42}));
      const trunkGeometry = alderTrunkGeometry();
      const crownGeometry = alderCrownGeometry();
      const trunkMaterial = windMaterial(new THREE.MeshLambertMaterial({
        color: 0xffffff,
        flatShading: true,
      }), this.wind);
      const crownMaterial = windMaterial(new THREE.MeshLambertMaterial({
        color: 0xffffff,
        flatShading: true,
      }), this.wind);
      const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
      const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, trees.length);
      trunks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(trees.length * 3), 3);
      crowns.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(trees.length * 3), 3);
      trunks.matrixAutoUpdate = false;
      crowns.matrixAutoUpdate = false;
      const color = new THREE.Color();
      for (const [index, tree] of trees.entries()) {
        this.position.set(tree.x, tree.y, tree.z);
        const surface = this.sampleGrade(tree.x, tree.z);
        this.normal.set(-surface.gradeX * .12, 1, -surface.gradeZ * .12).normalize();
        this.rotation.setFromUnitVectors(UP, this.normal);
        this.yaw.setFromAxisAngle(UP, tree.yaw);
        this.rotation.multiply(this.yaw);
        this.scale.set(1.25, tree.height, 1.25);
        trunks.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
        trunks.setColorAt(index, color.setHex(tree.trunkColor));

        this.position.y = tree.y + tree.height * 0.78;
        this.scale.set(tree.crown, tree.crown * 1.05, tree.crown * 0.9);
        crowns.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
        crowns.setColorAt(index, color.setHex(tree.crownColor));
      }
      this.shotTrunks.push(trunks);
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      trunks.instanceColor.needsUpdate = true;
      crowns.instanceColor.needsUpdate = true;
      trunks.computeBoundingSphere();
      crowns.computeBoundingSphere();
      trunks.castShadow = high;
      crowns.castShadow = high;
      trunks.receiveShadow = true;
      crowns.receiveShadow = true;
      trunks.name = `${area.name} alder trunks`;
      crowns.name = `${area.name} alder crowns`;
      ctx.scene.add(trunks, crowns);
      this.objects.push(trunks, crowns);
      this.geometries.push(trunkGeometry, crownGeometry);
      this.materials.push(trunkMaterial, crownMaterial);
    }

    const sedges = this.buildSedges(ponds, high);
    if (sedges.length > 0) {
      const geometry = sedgeGeometry();
      const material = windMaterial(new THREE.MeshLambertMaterial({
        color: 0xffffff,
        vertexColors: true,
        side: THREE.DoubleSide,
      }), this.wind);
      const mesh = new THREE.InstancedMesh(geometry, material, sedges.length);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sedges.length * 3), 3);
      mesh.matrixAutoUpdate = false;
      const color = new THREE.Color();
      for (const [index, sedge] of sedges.entries()) {
        this.position.set(sedge.x, sedge.y, sedge.z);
        const surface = this.sampleGrade(sedge.x, sedge.z);
        this.normal.set(-surface.gradeX, 1, -surface.gradeZ).normalize();
        this.rotation.setFromUnitVectors(UP, this.normal);
        this.yaw.setFromAxisAngle(UP, sedge.yaw);
        this.rotation.multiply(this.yaw);
        this.scale.setScalar(sedge.scale);
        mesh.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
        mesh.setColorAt(index, color.setHex(sedge.color));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      mesh.castShadow = high;
      mesh.name = `${area.name} wet sedges`;
      ctx.scene.add(mesh);
      this.objects.push(mesh);
      this.geometries.push(geometry);
      this.materials.push(material);
    }

    const logs = this.buildLogs(high);
    if (logs.length > 0) {
      const geometry = downedLogGeometry();
      const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
      const mesh = new THREE.InstancedMesh(geometry, material, logs.length);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(logs.length * 3), 3);
      mesh.matrixAutoUpdate = false;
      const color = new THREE.Color();
      for (const [index, log] of logs.entries()) {
        this.position.set(log.x, log.y, log.z);
        const aheadX = log.x + Math.cos(log.yaw) * log.length * 0.5;
        const aheadZ = log.z + Math.sin(log.yaw) * log.length * 0.5;
        const behindX = log.x - Math.cos(log.yaw) * log.length * 0.5;
        const behindZ = log.z - Math.sin(log.yaw) * log.length * 0.5;
        const aheadY = this.landscape.heightAtWorld(aheadX, aheadZ);
        const behindY = this.landscape.heightAtWorld(behindX, behindZ);
        this.tangent.set(Math.cos(log.yaw), (aheadY - behindY) / Math.max(0.3, log.length), Math.sin(log.yaw)).normalize();
        this.rotation.setFromUnitVectors(UP, this.tangent);
        // CylinderGeometry is roughly 0.42 m across at its widest point.
        // Convert the authored diameter into a local radial scale before
        // applying the along-log length scale.
        const radialScale = log.diameter / 0.42;
        this.scale.set(radialScale, log.length, radialScale);
        mesh.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
        mesh.setColorAt(index, color.setHex(log.color));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = high;
      mesh.receiveShadow = true;
      mesh.name = `${area.name} downed alder timber`;
      ctx.scene.add(mesh);
      this.objects.push(mesh);
      this.geometries.push(geometry);
      this.materials.push(material);
    }
  }

  private buildPonds(_high: boolean): Pond[] {
    return wetPondLayout(this.landscape.area).map(pond => ({ ...pond,
      waterY: this.landscape.heightAtProperty(pond.px, pond.py) + .75,
    }));
  }

  private wetTrails(): AreaTrail[] {
    const area = this.landscape.area;
    const selected = area.trails.filter(trail => trail.id === 'pond-chain' || trail.id === 'alder-return' || trail.id.includes('bottom'));
    return selected.length > 0 ? selected : area.trails.slice(0, 2);
  }

  private buildAlders(_high: boolean): TreePlacement[] {
    const area = this.landscape.area;
    const placements: TreePlacement[] = [];
    const rng = mulberry32(seeded(area.terrain.seed, 0xa1de7));
    for (const [trailIndex, trail] of this.wetTrails().entries()) {
      const length = trailLength(trail);
      const count = Math.ceil(length / 1.3);
      for (let i = 1; i < count; i++) {
        const along = length * (i + (rng() - .5) * .8) / count;
        const located = pointAlongTrail(trail, along);
        if (!located) continue;
        const side = rng() < .5 ? -1 : 1;
        // Broad, asymmetric gaps separate alder stools. Their opposite
        // banks do not share a rhythm, avoiding a planted avenue effect.
        const mass = Math.sin(along * .053 + trailIndex * 1.7 + side * 2.1)
          * Math.sin(along * .019 + side * 1.3);
        if (mass < -.15 && rng() < .82) continue;
        const offset = 4.5 + Math.pow(rng(), 1.35) * 25 + (1 - mass) * 2;
        const px = located.point.x - located.tangent.y * offset * side;
        const py = located.point.y + located.tangent.x * offset * side;
        if (px < area.world.x + 12 || py < area.world.y + 12 || px > area.world.x + area.world.w - 12 || py > area.world.y + area.world.h - 12) continue;
        if (area.dropPoints.some(drop => Math.hypot(px - drop.position.x, py - drop.position.y) < 12)) continue;
        if (placements.some(tree => {
          this.landscape.worldToProperty(tree.x, tree.z, this.property);
          return Math.hypot(this.property.x - px, this.property.y - py) < 1.8;
        })) continue;
        this.landscape.surfaceAtProperty(px, py, this.sample);
        if (this.sample.slope > 0.72) continue;
        this.landscape.propertyToWorld(px, py, this.world);
        placements.push({
          x: this.world.x,
          z: this.world.z,
          y: this.sample.height + 0.02,
          height: 2.1 + rng() * 2.9 + Math.max(0, mass) * .6,
          crown: 1.1 + rng() * 1.15,
          yaw: rng() * Math.PI * 2,
          trunkColor: [0x8c8573, 0x766b59, 0x9a9279][Math.floor(rng() * 3)],
          crownColor: [0x657c58, 0x799166, 0x8b9968][Math.floor(rng() * 3)],
        });
      }
    }
    return placements;
  }

  private buildSedges(ponds: readonly Pond[], high: boolean): SedgePlacement[] {
    const area = this.landscape.area;
    const placements: SedgePlacement[] = [];
    const rng = mulberry32(seeded(area.terrain.seed, 0x5ed9e));
    const colors = [0x8d9869, 0xa3a774, 0x6d7b59, 0x7f8d60];
    for (const [pondIndex, pond] of ponds.entries()) {
      const count = high ? (pond.hero ? 34 : 18) : pond.hero ? 20 : 10;
      for (let i = 0; i < count; i++) {
        const angle = rng() * Math.PI * 2;
        const radiusX = pond.rx * (1.15 + rng() * 0.24);
        const radiusZ = pond.rz * (1.15 + rng() * 0.24);
        const x = Math.cos(angle) * radiusX, z = Math.sin(angle) * radiusZ;
        const px = pond.px + x * Math.cos(pond.angle) - z * Math.sin(pond.angle);
        const py = pond.py + x * Math.sin(pond.angle) + z * Math.cos(pond.angle);
        if (px < area.world.x + 2 || py < area.world.y + 2 || px > area.world.x + area.world.w - 2 || py > area.world.y + area.world.h - 2) continue;
        this.landscape.surfaceAtProperty(px, py, this.sample);
        this.landscape.propertyToWorld(px, py, this.world);
        placements.push({ x: this.world.x, z: this.world.z, y: this.sample.height + 0.012, scale: 0.72 + rng() * 0.46, yaw: rng() * Math.PI * 2, color: colors[(i + pondIndex) % colors.length] });
      }
    }
    // Wet ground continues between pools. Broken sedge shoulders connect
    // the pond rims to the approach without laying a prairie grass carpet.
    for (const trail of this.wetTrails()) {
      const length = trailLength(trail);
      for (let distance = 10; distance < length; distance += high ? 1.5 : 2.5) {
        const located = pointAlongTrail(trail, distance);
        if (!located) continue;
        for (const side of [-1, 1]) {
          const offset = 3 + rng() * 10;
          const px = located.point.x - located.tangent.y * offset * side;
          const py = located.point.y + located.tangent.x * offset * side;
          if (px < area.world.x || py < area.world.y || px > area.world.x + area.world.w || py > area.world.y + area.world.h) continue;
          if (area.dropPoints.some(drop => Math.hypot(px - drop.position.x, py - drop.position.y) < 9)) continue;
          this.landscape.surfaceAtProperty(px, py, this.sample);
          if (this.sample.slope > .5 || ponds.some(pond => wetPondRadius(pond, px, py) < 1.12)) continue;
          this.landscape.propertyToWorld(px, py, this.world);
          placements.push({ x: this.world.x, z: this.world.z, y: this.sample.height + .012,
            scale: .55 + rng() * .45, yaw: rng() * Math.PI * 2, color: colors[Math.floor(rng() * colors.length)] });
        }
      }
    }
    return placements;
  }

  private buildLogs(high: boolean): LogPlacement[] {
    const area = this.landscape.area;
    const placements: LogPlacement[] = [];
    const rng = mulberry32(seeded(area.terrain.seed, 0x10ad));
    for (const [trailIndex, trail] of this.wetTrails().entries()) {
      const length = trailLength(trail);
      const count = Math.min(high ? 8 : 4, Math.floor(length / 62));
      for (let i = 0; i < count; i++) {
        const located = pointAlongTrail(trail, length * (0.25 + (i + rng() * 0.45) / Math.max(1, count + 1)));
        if (!located) continue;
        const side = (i + trailIndex) % 2 === 0 ? 1 : -1;
        const offset = 7 + rng() * 13;
        const px = located.point.x - located.tangent.y * offset * side;
        const py = located.point.y + located.tangent.x * offset * side;
        if (area.dropPoints.some(drop => Math.hypot(px - drop.position.x, py - drop.position.y) < 25)) continue;
        this.landscape.surfaceAtProperty(px, py, this.sample);
        this.landscape.propertyToWorld(px, py, this.world);
        const yaw = Math.atan2(located.tangent.y, located.tangent.x) + (rng() - 0.5) * 1.15;
        const lengthMeters = 2.8 + rng() * 2.8;
        placements.push({
          x: this.world.x,
          z: this.world.z,
          y: this.sample.height + 0.18,
          length: lengthMeters,
          diameter: 0.22 + rng() * 0.16,
          yaw,
          color: [0x594637, 0x6a513d, 0x765943, 0x4d4136][(i + trailIndex) % 4],
        });
      }
    }
    return placements.slice(0, high ? 18 : 9);
  }

  private sampleGrade(x: number, z: number): GroundSample {
    return this.landscape.surfaceAtWorld(x, z, this.sample);
  }

  update(ctx: Ctx): void {
    this.wind.value = ctx.time;
    const x = ctx.camera.position.x, z = ctx.camera.position.z;
    if (this.lastWalker && !ctx.paused) {
      const moved = Math.hypot(x - this.lastWalker.x, z - this.lastWalker.z);
      const depth = this.water.depthAtWorld(x, z);
      if (moved < 3 && depth > .05) {
        this.rippleDistance += moved;
        if (this.rippleDistance > .38) {
          this.ripples.value[this.rippleCursor].set(x, z, ctx.time, Math.min(1, depth / .2));
          this.rippleCursor = (this.rippleCursor + 1) % this.ripples.value.length;
          this.rippleDistance = 0;
        }
      } else this.rippleDistance = 0;
    }
    this.lastWalker ??= { x, z };
    this.lastWalker.x = x; this.lastWalker.z = z;
  }

  dispose(ctx: Ctx): void {
    for (const object of this.objects) ctx.scene.remove(object);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.obstacles.length = 0; this.shotTrunks.length = 0;
    this.objects.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
