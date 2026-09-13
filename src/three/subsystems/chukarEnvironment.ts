import * as THREE from 'three';
import type { AreaConfig } from '../../game/areas';
import { PROPERTY_PX_TO_M, type GroundSample, type LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { chukarLandmarkClearance } from './chukarLandmarks';
import { chukarBrows, chukarBrowBlockers, chukarGroundZones, chukarPlantStandAt } from '../../game/chukarLandscape';
import { applyChukarRockWeathering } from './chukarRockMaterial';
import { loadChukarKit } from '../assets/chukarKit';
import { chukarGrassGeometry, chukarSageGeometry } from '../assets/chukarPlants';
import { CHUKAR_GROUND_DETAIL } from './chukarTerrain';
import { groundQuailTrackGeometry, applyQuailTrackGroundLod } from './quailGroundGeometry';

const TILE = 80;
const TRACK_HALF_WIDTH_M = .8;
const STONE = [0x878073, 0x6e716b, 0x968a76, 0x75766d];
const SAGE = [0x788870, 0x89937a, 0x6d8272];
const STRAW = [0xc9a86a, 0xd9bc80, 0xb8a476, 0xc7b387];
const SAMPLE: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function seed(x: number, y: number, salt = 0): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(salt + 7701, 83492791)) >>> 0;
}

interface Plant { x: number; y: number; yaw: number; sx: number; sy: number; sz: number; color: number }
interface Batch { mesh: THREE.InstancedMesh; range: number; radius: number; center: THREE.Vector3; shadow: boolean; nearGeometry: THREE.BufferGeometry; farGeometry?: THREE.BufferGeometry; detailRange: number }

/** Property-space distance keeps the same paths open from either parking place. */
export function chukarTrackDistance(area: AreaConfig, x: number, y: number): number {
  let distance = Infinity;
  for (const trail of area.trails) for (let i = 1; i < trail.points.length; i++) {
    const a = trail.points[i - 1], b = trail.points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1));
    distance = Math.min(distance, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return distance * PROPERTY_PX_TO_M;
}

function coverAt(area: AreaConfig, x: number, y: number, margin = 0): boolean {
  return area.patches.some(p => x >= p.x - margin && x <= p.x + p.w + margin && y >= p.y - margin && y <= p.y + p.h + margin);
}

/** Loose fractures share the brows' oblique planes, without repeating the
 * old horizontal ring bands at smaller scales. Opaque, instanced geometry. */
export function chukarStoneGeometry(variant = 0, gravel = false): THREE.BufferGeometry {
  const geometry=new THREE.IcosahedronGeometry(1,gravel?0:1),positions=geometry.getAttribute('position');
  const colors:number[]=[];
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const warp=1+.11*Math.sin(x*5.3+variant)+.08*Math.sin(z*6.1+y*3.8);
    const h=Math.max(-.82+z*.08,Math.min(.83+x*.14-z*.11,y));
    positions.setXYZ(i,(x*warp+h*.18)*.51,(h+.90)/1.88,(z*warp-h*.11)*.52);
    const shade=.86+.05*Math.sin(x*3+z*4+variant)+Math.max(0,y)*.08;
    colors.push(shade,shade*.98,shade*.94);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  geometry.computeBoundingSphere();geometry.userData={kind:gravel?'chukar-talus':'chukar-fractured-stone',triangles:positions.count/3};
  return geometry;
}

/** Full-property Great Basin environment. Geometry is instanced in local cells
 * so the view does not submit every rock and plant across the whole property. */
export class ChukarEnvironmentSystem implements Subsystem {
  readonly id = 'chukar-environment';
  private root = new THREE.Group();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private batches: Batch[] = [];
  private wind = { value: 0 };
  private leafFill = { value: .22 };
  private sample = { ...SAMPLE };
  private world = { x: 0, z: 0 };
  private obstacles: { x: number; z: number; radius: number }[] = [];
  private landmarkClearance: { x: number; y: number; radius: number }[];
  constructor(private readonly landscape: LandscapeModel) { this.landmarkClearance = chukarLandmarkClearance(landscape.area); }

  collisionCircles(): readonly { x: number; z: number; radius: number }[] { return this.obstacles; }

  private clear(x: number, y: number, radius: number, keepHabitat = false): boolean {
    const area = this.landscape.area, margin = radius / PROPERTY_PX_TO_M;
    if (x < area.world.x + margin || y < area.world.y + margin || x > area.world.x + area.world.w - margin || y > area.world.y + area.world.h - margin) return false;
    if (chukarTrackDistance(area, x, y) < TRACK_HALF_WIDTH_M + .35 + radius) return false;
    if (area.dropPoints.some(d => Math.hypot(x - d.position.x, y - d.position.y) * PROPERTY_PX_TO_M < 10 + radius)) return false;
    if (area.landmarks.some(l => !['lower-sage-bench','split-shoulder','rim-overlook'].includes(l.id)&&Math.hypot(x - l.position.x, y - l.position.y) * PROPERTY_PX_TO_M < 14 + radius)) return false;
    if (this.landmarkClearance.some(l => Math.hypot(x - l.x, y - l.y) * PROPERTY_PX_TO_M < l.radius + radius)) return false;
    return !keepHabitat || !coverAt(area, x, y, margin + 3);
  }

  private batch(geometry: THREE.BufferGeometry, material: THREE.Material, plants: Plant[], range: number, shadow: boolean, rock = false, farGeometry?: THREE.BufferGeometry, detailRange = 65): void {
    if (!plants.length) return;
    const authored=geometry.userData.kind==='chukar-authored-basalt';
    if(authored&&plants.length===1){
      // Fit only the foot to the sidehill; preserve the authored upper face.
      // Sinking the entire broad asset to its lowest corner erased most of
      // its height on a climbing slope.
      const p=plants[0],center=this.landscape.propertyToWorld(p.x,p.y,{x:0,z:0});
      const base=this.landscape.heightAtProperty(p.x,p.y),c=Math.cos(p.yaw),s=Math.sin(p.yaw);
      geometry=geometry.clone();const vertices=geometry.getAttribute('position');
      for(let i=0;i<vertices.count;i++){
        const x=vertices.getX(i)*p.sx,z=vertices.getZ(i)*p.sz,y=vertices.getY(i);
        const ground=this.landscape.heightAtWorld(center.x+x*c+z*s,center.z-x*s+z*c);
        vertices.setY(i,y+(ground-base)/p.sy*(1-y*.55));
      }
      vertices.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();this.geometries.add(geometry);
    }
    const mesh = new THREE.InstancedMesh(geometry, material, plants.length), matrix = new THREE.Matrix4(), position = new THREE.Vector3();
    const rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), color = new THREE.Color(), normal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), yaw = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
    const talus = geometry.userData.kind === 'chukar-talus';
    for (const [i, p] of plants.entries()) {
      this.landscape.propertyToWorld(p.x, p.y, this.world); this.landscape.surfaceAtProperty(p.x, p.y, this.sample);
      let ground = this.sample.height;
      if (rock && !talus) {
        // Bury the foot below its lowest corner on a sidehill; no floating
        // downhill corners or flat support disks beneath the geology.
        const radius = Math.max(p.sx, p.sz) * .42;
        if(!authored)for (const [dx, dz] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]])
          ground = Math.min(ground, this.landscape.heightAtWorld(this.world.x + dx, this.world.z + dz));
        rotation.setFromAxisAngle(axis, p.yaw);
      } else {
        normal.set(-this.sample.gradeX, 1, -this.sample.gradeZ).normalize(); rotation.setFromUnitVectors(up, normal);
        yaw.setFromAxisAngle(axis, p.yaw); rotation.multiply(yaw);
      }
      position.set(this.world.x, ground - (talus ? Math.min(.012, p.sy * .08) : authored ? Math.max(.3,p.sy*.18) : rock ? .10 : .018), this.world.z); scale.set(p.sx, p.sy, p.sz);
      mesh.setMatrixAt(i, matrix.compose(position, rotation, scale)); mesh.setColorAt(i, color.setHex(p.color));
      if (rock && ground + p.sy - this.sample.height > .75)
        this.obstacles.push({ x: this.world.x, z: this.world.z, radius: Math.min(p.sx, p.sz) * .37 });
    }
    mesh.name = `Chukar ${geometry.userData.kind ?? 'scenery'}`; mesh.receiveShadow = true; mesh.computeBoundingSphere();
    this.root.add(mesh); this.batches.push({ mesh, range, radius: mesh.boundingSphere!.radius, center: mesh.boundingSphere!.center.clone(), shadow, nearGeometry: geometry, farGeometry, detailRange });
  }

  async init(ctx: Ctx): Promise<void> {
    const lite = ctx.quality === 'lite', area = this.landscape.area;
    this.root.name = 'Chukar Ridge — sage benches and broken rimrock'; ctx.scene.add(this.root);
    const brows=await loadChukarKit(ctx.quality);
    const stones = [0, 1, 2].map(i => chukarStoneGeometry(i)), gravel = chukarStoneGeometry(3, true), grass = chukarGrassGeometry(lite), sage = chukarSageGeometry(lite);
    const farGrass=lite?grass:chukarGrassGeometry(true),farSage=lite?sage:chukarSageGeometry(true);
    for (const geometry of [...brows,...stones, gravel, grass, sage, farGrass, farSage]) this.geometries.add(geometry);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true,
      emissive: 0x555b54, emissiveIntensity: .08 });
    // A restrained cool floor keeps the shaded basalt planes readable when
    // the route looks across the unlit side of a brow.
    const browMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true,
      emissive: 0x5c6670, emissiveIntensity: .10 });
    applyChukarRockWeathering(browMat);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    this.materials.add(rockMat); this.materials.add(browMat); this.materials.add(leafMat);
    leafMat.onBeforeCompile = shader => {
      shader.uniforms.uChukarWind = this.wind;
      shader.uniforms.uChukarLeafFill=this.leafFill;
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uChukarLeafFill;')
        .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uChukarLeafFill;');
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uChukarWind;')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal=normalize(mix(objectNormal,vec3(0.,1.,0.),.55));')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float windPhase = instanceMatrix[3].x * .15 + instanceMatrix[3].z * .23;
          transformed.x += sin(uChukarWind * 1.4 + windPhase) * position.y * position.y * .045;
          #endif`);

    };
    leafMat.customProgramCacheKey = () => 'chukar-open-sage-wind-v2';

    for(const formation of chukarBrows(area)){
      this.batch(brows[formation.variant],browMat,[{x:formation.x,y:formation.y,sx:formation.length*PROPERTY_PX_TO_M,
        sy:formation.height,sz:formation.depth,yaw:-formation.angle,color:0xffffff}],1250,true,true);
      // A chain of small collision discs follows the face, leaving the
      // bench beside it open. One enormous disc would block the entire shelf.
    }
    for(const blocker of chukarBrowBlockers(area)){
      const p=this.landscape.propertyToWorld(blocker.x,blocker.y,{x:0,z:0});this.obstacles.push({...p,radius:blocker.radius});
    }
    // Loose stone spills downslope from each authored formation's foot.
    for (const formation of chukarBrows(area).map(b=>({...b,yaw:b.angle,seed:seed(Math.round(b.x),Math.round(b.y))}))) {
      const rng = mulberry32(formation.seed), apron: Plant[] = [];
      for (let n = 0; n < 7; n++) {
        if (n === 5 && rng() < .5) continue;
        const u = n / 6 - .5, x = formation.x + Math.cos(formation.yaw) * u * formation.length,
          y = formation.y + Math.sin(formation.yaw) * u * formation.length;
        const width = formation.length / 6 * (1.05 + rng() * .4), depth = 5 + rng() * 3;
        if (!this.clear(x, y, Math.max(width, depth) * .6, true)) continue;
        this.landscape.surfaceAtProperty(x, y, this.sample);
        const slopeLength = Math.hypot(this.sample.gradeX, this.sample.gradeZ) || 1;
        const dx = -this.sample.gradeX / slopeLength, dy = -this.sample.gradeZ / slopeLength;
        for (let chip = 0; chip < (lite ? 5 : 9); chip++) {
          const reach = 3 + rng() * 13, px = x + dx * reach + (rng() - .5) * 6, py = y + dy * reach + (rng() - .5) * 6;
          const size = .32 + rng() * .75;
          if (this.clear(px, py, size * .65)) apron.push({ x: px, y: py, sx: size * 1.5, sy: size * .45, sz: size, yaw: rng() * Math.PI, color: STONE[chip % STONE.length] });
        }
      }
      // The Blender kit owns each brow; loose chips connect its foot to the
      // shared talus ground. Do not stack a second procedural wall over it.
      this.batch(gravel, rockMat, apron, lite ? 150 : 230, false, true);
    }

    const spacing = 2.65;
    const zones={talus:0,shelter:0},stand={grass:0,sage:0};
    const rockDensityScale = (spacing / 5.4) ** 2;
    for (let ty = area.world.y; ty < area.world.y + area.world.h; ty += TILE) for (let tx = area.world.x; tx < area.world.x + area.world.w; tx += TILE) {
      const bunches: Plant[] = [], bushes: Plant[] = [], chips: Plant[] = [], outcrops: Plant[] = [];
      for (let row = 0; row < Math.ceil(TILE / spacing); row++) for (let column = 0; column < Math.ceil(TILE / spacing); column++) {
        const cellX = tx + column * spacing, cellY = ty + row * spacing, rng = mulberry32(seed(Math.round(cellX * 10), Math.round(cellY * 10), 19));
        const x = cellX + rng() * Math.min(spacing, tx + TILE - cellX), y = cellY + rng() * Math.min(spacing, ty + TILE - cellY);
        if (!this.clear(x, y, .5)) continue;
        this.landscape.surfaceAtProperty(x, y, this.sample);
        const { slope, rockiness, vegetation } = this.sample;
        chukarGroundZones(x,y,zones);
        chukarPlantStandAt(x,y,zones.talus,zones.shelter,stand);
        const patch = coverAt(area, x, y), band=stand.grass;
        // Generate the same candidate in both tiers; thinning never changes
        // later random draws or shifts the remaining stands across the field.
        const qualityKeep=rng(),choice=rng(),sizeRoll=rng(),yaw=rng()*Math.PI*2,colorRoll=rng();
        const sageChance=(.018+stand.sage*.55)*(1-rockiness*.48);
        const grassChance=(.06+stand.grass*.84+vegetation*.10)*(1-zones.talus*.7);
        let planted=false;
        if(choice<sageChance&&slope<.9){
          const size=.82+sizeRoll*.78+(zones.shelter*.15);
          if(!lite||qualityKeep>.18){bushes.push({x,y,sx:size*1.15,sy:size*.82,sz:size*1.08,yaw,color:SAGE[Math.floor(colorRoll*SAGE.length)]});planted=true;}
        }else if(choice<sageChance+grassChance&&slope<1.05){
          const size=.72+sizeRoll*.69+stand.grass*.25;
          if(!lite||qualityKeep>.27){bunches.push({x,y,sx:size*1.12,sy:size*(patch?1.08:1),sz:size*1.12,yaw,color:STRAW[Math.floor(colorRoll*STRAW.length)]});planted=true;}
        }
        // Low talus needs a continuous scattering, not the sparse density
        // reserved for large outcrops. Keep the trail clearance above.
        if (rng() < (.17 + rockiness * .35+zones.talus*.2) * (1 - band * .32)) {
          const size = .18 + rng() * .44;
          if ((!lite || qualityKeep > .40)&&!planted) chips.push({ x, y, sx: size * 1.5, sy: size * .43, sz: size, yaw: rng() * Math.PI * 2, color: STONE[Math.floor(rng() * STONE.length)] });
        }
        if (rng() < (.0015 + rockiness * .012) * rockDensityScale && !planted && this.clear(x, y, 2.8, true)) {
          const size = 1.4 + rng() * 2.3;
          outcrops.push({ x, y, sx: size * 1.7, sy: size * .75, sz: size, yaw: Math.atan2(this.sample.gradeX, this.sample.gradeZ) + Math.PI / 2, color: STONE[Math.floor(rng() * STONE.length)] });
        }
      }
      this.batch(grass, leafMat, bunches, lite ? 120 : 190, false, false, farGrass, 38);
      this.batch(sage, leafMat, bushes, lite ? 180 : 230, false, false, farSage, 40);
      this.batch(gravel, rockMat, chips, lite ? 100 : 170, false, true);
      this.batch(stones[seed(tx, ty) % 3], rockMat, outcrops, 800, true, true);
    }
    this.buildTrack(ctx); this.update(ctx);
  }

  private buildTrack(ctx:Ctx): void {
    const positions: number[] = [], colors: number[] = [], dust = new THREE.Color(0xc2b69a), edge = new THREE.Color(0x998b6b);
    for (const trail of this.landscape.area.trails) for (let n = 1; n < trail.points.length; n++) {
      const a = trail.points[n - 1], b = trail.points[n], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length < .01) continue;
      const count = Math.ceil(length / 2.5), rx = -dy / length, ry = dx / length;
      const row = (t: number) => [-1, -.55, .55, 1].map((across, i) => {
        const halfWidth = TRACK_HALF_WIDTH_M / PROPERTY_PX_TO_M;
        const x = a.x + dx * t + rx * across * halfWidth, y = a.y + dy * t + ry * across * halfWidth;
        this.landscape.propertyToWorld(x, y, this.world);
        return { p: [this.world.x, this.landscape.heightAtProperty(x, y) + .035, this.world.z], c: i === 0 || i === 3 ? edge : dust, alpha: i === 0 || i === 3 ? 0 : .55 };
      });
      for (let i = 0; i < count; i++) {
        const near = row(i / count), far = row((i + 1) / count);
        for (let across = 0; across < 3; across++) for (const v of [near[across], far[across], near[across + 1], near[across + 1], far[across], far[across + 1]]) {
          positions.push(...v.p); colors.push(v.c.r, v.c.g, v.c.b, v.alpha);
        }
      }
    }
    const source = new THREE.BufferGeometry();source.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    source.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    source.setIndex(Array.from({length:positions.length/3},(_,i)=>i));
    const detail=CHUKAR_GROUND_DETAIL[ctx.quality];
    // Clip at tile seams and follow the rendered triangles in both terrain
    // tiers. An analytic height plus an offset sank into the coarse mesh.
    const geometry=groundQuailTrackGeometry(this.landscape,source,detail);source.dispose();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide });
    material.customProgramCacheKey = () => 'chukar-footpath-soft-shoulder-v2';
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vPathGround;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvPathGround=position.xz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vPathGround;')
        .replace('#include <color_fragment>',`#include <color_fragment>
          float wear=.5+.5*sin(vPathGround.x*1.3+sin(vPathGround.y*.83)*2.)*sin(vPathGround.y*2.1);
          diffuseColor.a *= .66+wear*.34;
          diffuseColor.rgb *= .95+wear*.07;`);
    };
    applyQuailTrackGroundLod(material,ctx.quality,detail.range);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Chukar dusty contour access tracks'; mesh.receiveShadow = true;
    this.geometries.add(geometry); this.materials.add(material); this.root.add(mesh);
  }

  update(ctx: Ctx): void {
    this.wind.value = ctx.time;
    this.leafFill.value = ctx.timeOfDay==='morning'||ctx.timeOfDay==='noon'?.22:.08;
    for (const batch of this.batches) {
      const distance = Math.hypot(ctx.camera.position.x - batch.center.x, ctx.camera.position.z - batch.center.z);
      batch.mesh.visible = distance < batch.range + batch.radius;
      batch.mesh.castShadow = batch.shadow && distance < 110 + batch.radius;
      if(batch.farGeometry)batch.mesh.geometry=distance>batch.detailRange+batch.radius*.5?batch.farGeometry:batch.nearGeometry;
    }
  }

  dispose(ctx: Ctx): void {
    ctx.scene.remove(this.root); for (const batch of this.batches) batch.mesh.dispose();
    for (const geometry of this.geometries) geometry.dispose(); for (const material of this.materials) material.dispose();
    this.root.clear(); this.batches.length = 0; this.obstacles.length = 0; this.geometries.clear(); this.materials.clear();
  }
}
