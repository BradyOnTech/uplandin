import * as THREE from 'three';
import { chukarCompositionAt } from '../../game/chukarComposition';
import type { AreaConfig } from '../../game/areas';
import { PROPERTY_PX_TO_M, type GroundSample, type LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { chukarLandmarkClearance } from './chukarLandmarks';
import { chukarBrows, chukarBrowBlockers, chukarGroundZones, chukarPlantStandAt } from '../../game/chukarLandscape';
import { applyChukarRockWeathering } from './chukarRockMaterial';
import { chukarPlantGroupAt, chukarTrackSectionAt } from './chukarSurface';
import { VegetationWind, VEGETATION_GUST_GLSL, VEGETATION_INSTANCE_WIND_GLSL } from './vegetationWind';
import { loadChukarKit } from '../assets/chukarKit';
import { chukarGrassGeometry, chukarSageGeometry } from '../assets/chukarPlants';
import { CHUKAR_GROUND_DETAIL } from './chukarTerrain';
import { groundQuailTrackGeometry, applyQuailTrackGroundLod, sampleQuailGroundHeights } from './quailGroundGeometry';
import { applyQuailGrassGroundLod, createQuailGrassGroundGeometry } from './quailGrassGround';
import { SolidShotGeometry } from '../solidShotGeometry';
import { CHUKAR_TALUS_FANS, chukarFanCoordinates, chukarFeatureOccupies, chukarSeepAt, chukarTalusFanAt } from '../../game/chukarFeatures';
import { buildChukarHistory } from './chukarHistory';

const TILE = 80;
const TRACK_HALF_WIDTH_M = .8;
const STONE = [0x878073, 0x6e716b, 0x968a76, 0x75766d];
const SAGE = [0x82957d, 0x94a28a, 0xa3ac92];
const STRAW = [0xa79a77, 0xbba273, 0xc7b084, 0xd1bd93];
const SEEP_GREEN = [0x6f8c4c, 0x7f9a55, 0x8ea65e];
const SAMPLE: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function seed(x: number, y: number, salt = 0): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(salt + 7701, 83492791)) >>> 0;
}

interface Plant { x: number; y: number; yaw: number; sx: number; sy: number; sz: number; color: number }
interface Batch { mesh: THREE.InstancedMesh; range: number; radius: number; center: THREE.Vector3; shadow: boolean; nearGeometry: THREE.BufferGeometry; farGeometry?: THREE.BufferGeometry; detailRange: number; shadowRange:number }

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
  private huntWind = new VegetationWind();
  private leafFill = { value: .22 };
  private viewPosition = { value: new THREE.Vector3() };
  private groundDetail: {near:number;far:number;range:number} = CHUKAR_GROUND_DETAIL.high;
  private plantDepth?: THREE.MeshDepthMaterial;
  private sample = { ...SAMPLE };
  private world = { x: 0, z: 0 };
  private obstacles: { x: number; z: number; radius: number }[] = [];
  private shotSolids = new SolidShotGeometry();
  private landmarkClearance: { x: number; y: number; radius: number }[];
  constructor(private readonly landscape: LandscapeModel) { this.landmarkClearance = chukarLandmarkClearance(landscape.area); }

  collisionCircles(): readonly { x: number; z: number; radius: number }[] { return this.obstacles; }

  blocksShot(origin: THREE.Vector3Like, target: THREE.Vector3Like): boolean { return this.shotSolids.blocks(origin, target); }

  private clear(x: number, y: number, radius: number, keepHabitat = false): boolean {
    const area = this.landscape.area, margin = radius / PROPERTY_PX_TO_M;
    if (x < area.world.x + margin || y < area.world.y + margin || x > area.world.x + area.world.w - margin || y > area.world.y + area.world.h - margin) return false;
    if (chukarTrackDistance(area, x, y) < TRACK_HALF_WIDTH_M + .35 + radius) return false;
    if (area.dropPoints.some(d => Math.hypot(x - d.position.x, y - d.position.y) * PROPERTY_PX_TO_M < 10 + radius)) return false;
    if (area.landmarks.some(l => !['lower-sage-bench','split-shoulder','rim-overlook'].includes(l.id)&&Math.hypot(x - l.position.x, y - l.position.y) * PROPERTY_PX_TO_M < 14 + radius)) return false;
    if (this.landmarkClearance.some(l => Math.hypot(x - l.x, y - l.y) * PROPERTY_PX_TO_M < l.radius + radius)) return false;
    if (chukarFeatureOccupies(x, y, radius)) return false;
    return !keepHabitat || !coverAt(area, x, y, margin + 3);
  }

  private batch(geometry: THREE.BufferGeometry, material: THREE.Material, plants: Plant[], range: number, shadow: boolean, rock = false, farGeometry?: THREE.BufferGeometry, detailRange = 65, shadowRange = 110): void {
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
    const grounds = rock ? null : new Float32Array(plants.length * 3);
    if (grounds) {
      geometry = createQuailGrassGroundGeometry(geometry, grounds); this.geometries.add(geometry);
      if (farGeometry) { farGeometry = createQuailGrassGroundGeometry(farGeometry, grounds); this.geometries.add(farGeometry); }
    }
    const mesh = new THREE.InstancedMesh(geometry, material, plants.length), matrix = new THREE.Matrix4(), position = new THREE.Vector3();
    let maxGroundShift = 0;
    const rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), color = new THREE.Color(), normal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), yaw = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
    const talus = geometry.userData.kind === 'chukar-talus';
    for (const [i, p] of plants.entries()) {
      this.landscape.propertyToWorld(p.x, p.y, this.world); this.landscape.surfaceAtProperty(p.x, p.y, this.sample);
      let ground = this.sample.height;
      if (grounds) {
        const fitted = sampleQuailGroundHeights(this.landscape, p.x, p.y, undefined, this.groundDetail);
        ground = fitted.nearY;
        grounds.set([fitted.farY - fitted.nearY, fitted.tileCenterX, fitted.tileCenterZ], i * 3);
        maxGroundShift = Math.max(maxGroundShift, Math.abs(fitted.farY - fitted.nearY));
      }
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
    if (rock && !talus) this.shotSolids.add(mesh);
    mesh.boundingSphere!.radius += maxGroundShift + (grounds ? .15 : 0);
    if (grounds) mesh.customDepthMaterial = this.plantDepth;
    this.root.add(mesh); this.batches.push({ mesh, range, radius: mesh.boundingSphere!.radius, center: mesh.boundingSphere!.center.clone(), shadow, nearGeometry: geometry, farGeometry, detailRange, shadowRange });
  }

  private plantVertexShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
    shader.uniforms.uChukarWind = this.wind;
    shader.uniforms.uChukarWindDirection = this.huntWind.direction;
    shader.uniforms.uChukarWindStrength = this.huntWind.strength;
    shader.uniforms.uChukarViewPosition = this.viewPosition;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uChukarWind;\nuniform vec2 uChukarWindDirection;\nuniform float uChukarWindStrength;\nuniform vec3 uChukarViewPosition;'+VEGETATION_GUST_GLSL+VEGETATION_INSTANCE_WIND_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float gust=vegetationGust(uChukarWind,instanceMatrix[3].xz,uChukarWindDirection);
        transformed+=vegetationInstanceWind(uChukarWindDirection)*gust*uChukarWindStrength*position.y*position.y*.035;
        #endif`);
    applyQuailGrassGroundLod(shader, this.groundDetail.range);
    // Shadow depth uses the player's terrain tier, not the light camera's
    // position. Both passes also share exactly the same wind displacement.
    shader.vertexShader = shader.vertexShader.replace('quailInstanceGround.yz - cameraPosition.xz', 'quailInstanceGround.yz - uChukarViewPosition.xz');
  }

  async init(ctx: Ctx): Promise<void> {
    const lite = ctx.quality === 'lite', area = this.landscape.area;
    this.huntWind.connect(ctx);
    this.groundDetail = CHUKAR_GROUND_DETAIL[ctx.quality];
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
    this.plantDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    this.plantDepth.onBeforeCompile = shader => this.plantVertexShader(shader);
    this.plantDepth.customProgramCacheKey = () => 'chukar-hunt-wind-ground-depth-v2';
    this.materials.add(this.plantDepth);
    const plantMaterial=(tilt:number)=>{
      const material=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide});
      material.onBeforeCompile=shader=>{
        shader.uniforms.uChukarLeafFill=this.leafFill;
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uChukarLeafFill;')
          .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uChukarLeafFill;');
        shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
            objectNormal=normalize(mix(objectNormal,vec3(0.,1.,0.),${tilt.toFixed(2)}));`);
        this.plantVertexShader(shader);
      };
      material.customProgramCacheKey=()=>`chukar-hunt-wind-plant-ground-v5-${tilt}`;
      this.materials.add(material);return material;
    };
    const leafMat=plantMaterial(.55),sageMat=plantMaterial(.24);
    this.materials.add(rockMat);this.materials.add(browMat);

    for(const formation of chukarBrows(area)){
      this.batch(brows[formation.variant],browMat,[{x:formation.x,y:formation.y,sx:formation.length*PROPERTY_PX_TO_M,
        sy:formation.height,sz:formation.depth,yaw:-formation.angle,color:0xffffff}],1250,true,true);
      // A chain of small collision discs follows the face, leaving the
      // bench beside it open. One enormous disc would block the entire shelf.
    }
    for(const blocker of chukarBrowBlockers(area)){
      const p=this.landscape.propertyToWorld(blocker.x,blocker.y,{x:0,z:0});this.obstacles.push({...p,radius:blocker.radius});
    }
    // Three uneven rubble fans below each brow. Larger fragments stay
    // near the foot, becoming smaller and less frequent farther downslope.
    // Check each fragment separately: the former parent-foot clearance test
    // discarded whole aprons whenever one part touched habitat or a path.
    for(const formation of chukarBrows(area)){
      const rng=mulberry32(seed(Math.round(formation.x),Math.round(formation.y))),apron:Plant[]=[],fragments:Plant[]=[];
      for(let fan=0;fan<3;fan++){
        const u=(fan-1)*.28+(rng()-.5)*.12,x=formation.x+Math.cos(formation.angle)*u*formation.length;
        const y=formation.y+Math.sin(formation.angle)*u*formation.length;
        this.landscape.surfaceAtProperty(x,y,this.sample);
        const slopeLength=Math.hypot(this.sample.gradeX,this.sample.gradeZ)||1;
        const dx=-this.sample.gradeX/slopeLength,dy=-this.sample.gradeZ/slopeLength;
        for(let chip=0;chip<28;chip++){
          const reach=5+Math.pow(rng(),1.3)*24,spread=2+reach*.25;
          const across=(rng()-.5)*spread,px=x+dx*reach-dy*across,py=y+dy*reach+dx*across;
          const size=(.20+rng()*.85)*(1-reach/48),keep=rng();
          const yaw=rng()*Math.PI*2;
          if((!lite||keep>.22)&&this.clear(px,py,size*.65))apron.push({x:px,y:py,sx:size*1.7,sy:size*.46,sz:size,yaw,color:STONE[chip%STONE.length]});
        }
        for(let fragment=0;fragment<5;fragment++){
          const reach=8+rng()*12,px=x+dx*reach+(rng()-.5)*7,py=y+dy*reach+(rng()-.5)*7,size=.65+rng()*1.5;
          if(this.clear(px,py,size*1.05,true))fragments.push({x:px,y:py,sx:size*1.55,sy:size*.66,sz:size,yaw:rng()*Math.PI*2,color:STONE[fragment%STONE.length]});
        }
      }
      this.batch(gravel,rockMat,apron,lite?150:230,false,true);
      this.batch(stones[formation.variant],rockMat,fragments,420,!lite,true);
    }

    // Talus fans spilling from chutes in the big rims: blocks at the chute,
    // finer scree spreading toward the toe (see chukarFeatures).
    for(const [index,fan] of CHUKAR_TALUS_FANS.entries()){
      const rng=mulberry32(seed(Math.round(fan.apex.x),Math.round(fan.apex.y),31)),scree:Plant[]=[],blocks:Plant[]=[];
      const dx=fan.toe.x-fan.apex.x,dy=fan.toe.y-fan.apex.y,length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
      const count=Math.round(fan.width*length*(lite?1.1:1.8));
      for(let i=0;i<count;i++){
        const along=Math.pow(rng(),.8),half=fan.width*(.25+.75*along),across=(rng()+rng()-1)*half;
        const px=fan.apex.x+dx*along+nx*across,py=fan.apex.y+dy*along+ny*across;
        if(chukarFanCoordinates(fan,px,py).across>1)continue;
        const size=(.16+rng()*.38)*(1.25-along*.6);
        if(this.clear(px,py,size*.5))scree.push({x:px,y:py,sx:size*1.6,sy:size*.5,sz:size,yaw:rng()*Math.PI*2,color:STONE[i%STONE.length]});
      }
      for(let i=0;i<9;i++){
        // The biggest blocks rolled farthest and lie at the toe.
        const along=i<4?rng()*.3:.75+rng()*.35,px=fan.apex.x+dx*along+nx*(rng()-.5)*fan.width*1.2,py=fan.apex.y+dy*along+ny*(rng()-.5)*fan.width*1.2;
        const size=i<4?.6+rng()*.5:.8+rng()*1.1;
        if(this.clear(px,py,size*1.05))blocks.push({x:px,y:py,sx:size*1.45,sy:size*.7,sz:size,yaw:rng()*Math.PI*2,color:STONE[(i+index)%STONE.length]});
      }
      this.batch(gravel,rockMat,scree,lite?150:230,false,true);
      this.batch(stones[index%3],rockMat,blocks,420,!lite,true);
    }

    const spacing = 2.65;
    const zones={talus:0,shelter:0},stand={grass:0,sage:0},composition={sage:0,grass:0,open:0,wash:0};
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
        chukarCompositionAt(x,y,composition);
        const patch = coverAt(area, x, y), band=stand.grass,group=chukarPlantGroupAt(x,y);
        // Generate the same candidate in both tiers; thinning never changes
        // later random draws or shifts the remaining stands across the field.
        const qualityKeep=rng(),choice=rng(),sizeRoll=rng(),yaw=rng()*Math.PI*2,colorRoll=rng();
        // Nearby plants share a silver-sage / cured-straw value family with
        // small individual variation, instead of uniformly random confetti.
        const tone=group*.72+colorRoll*.28;
        const grassColor=STRAW[Math.min(STRAW.length-1,Math.floor(tone*STRAW.length))];
        const sageColor=SAGE[Math.min(SAGE.length-1,Math.floor(tone*SAGE.length))];
        const grassYaw=-.65+(yaw-Math.PI)*.22+Math.sin(x*.025+y*.015)*.28;
        // The seep greens a dense tongue of grass; scree carries almost none.
        const seep=chukarSeepAt(x,y),scree=chukarTalusFanAt(x,y);
        const sageChance=(.01+stand.sage*.75)*(1-rockiness*.48)*(1-seep*.85)*(1-scree*.9);
        const grassChance=((.035+stand.grass*.82+vegetation*.07)*(1-zones.talus*.7)*(1-Math.max(composition.open*.8,composition.wash*.95))*(1-scree*.88))
          +seep*.75;
        let planted=false;
        if(choice<sageChance&&slope<.9){
          const size=.58+sizeRoll*.58+composition.sage*.24;
          if((!lite||qualityKeep>.18)&&this.clear(x,y,size*.90)){bushes.push({x,y,sx:size*1.16,sy:size*.84,sz:size*1.08,yaw,color:sageColor});planted=true;}
        }else if(choice<sageChance+grassChance&&slope<1.05){
          const size=.72+sizeRoll*.69+stand.grass*.25+seep*.3;
          if(!lite||qualityKeep>.27){
            const color=seep>.25?SEEP_GREEN[Math.min(SEEP_GREEN.length-1,Math.floor(tone*SEEP_GREEN.length))]:grassColor;
            bunches.push({x,y,sx:size*1.12,sy:size*(patch?1.08:1),sz:size*1.12,yaw:grassYaw,color});planted=true;
            // Smaller neighboring bunches create a stand with a shared root
            // bed, without raising density on every exposed hillside.
            for(let companion=0;companion<2;companion++){
              if(composition.grass<.4+companion*.25||(lite&&(companion>0||qualityKeep<.55)))continue;
              const a=yaw+companion*2.4,r=.75+sizeRoll*.5,cx=x+Math.sin(a)*r,cy=y+Math.cos(a)*r,k=size*(.52+companion*.10);
              if(this.clear(cx,cy,k*.4))bunches.push({x:cx,y:cy,sx:k,sy:k*.84,sz:k,yaw:grassYaw+.3,color:grassColor});
            }
          }
        }
        // Low talus needs a continuous scattering, not the sparse density
        // reserved for large outcrops. Keep the trail clearance above.
        if (rng() < (.14 + rockiness * .35+zones.talus*.2+composition.wash*.82+scree*.7) * (1 - band * .32) * (1 - seep * .9)) {
          const size = .18 + rng() * .44;
          if ((!lite || qualityKeep > .40)&&!planted) chips.push({ x, y, sx: size * 1.5, sy: size * .43, sz: size, yaw: rng() * Math.PI * 2, color: STONE[Math.floor(rng() * STONE.length)] });
        }
        if (rng() < (.0015 + rockiness * .012) * rockDensityScale && !planted && this.clear(x, y, 2.8, true)) {
          const size = 1.4 + rng() * 2.3;
          outcrops.push({ x, y, sx: size * 1.7, sy: size * .75, sz: size, yaw: Math.atan2(this.sample.gradeX, this.sample.gradeZ) + Math.PI / 2, color: STONE[Math.floor(rng() * STONE.length)] });
        }
      }
      this.batch(grass, leafMat, bunches, lite ? 120 : 190, false, false, farGrass, 38);
      this.batch(sage, sageMat, bushes, lite ? 180 : 230, !lite, false, farSage, 40, 25);
      this.batch(gravel, rockMat, chips, lite ? 100 : 170, false, true);
      this.batch(stones[seed(tx, ty) % 3], rockMat, outcrops, 800, true, true);
    }
    this.buildTrack(ctx);
    buildChukarHistory({ landscape: this.landscape, quality: ctx.quality, castShadow: ctx.quality === 'high', obstacles: this.obstacles,
      addSolid: mesh => this.shotSolids.add(mesh), keep: object => this.root.add(object),
      own: resource => { if (resource instanceof THREE.BufferGeometry) this.geometries.add(resource); else this.materials.add(resource); } });
    this.update(ctx);
  }

  private buildTrack(ctx:Ctx): void {
    const positions: number[] = [], colors: number[] = [], dust = new THREE.Color(0xbfb08f), edge = new THREE.Color(0x92846a);
    const section={left:0,right:0,center:0,wear:0};
    for (const trail of this.landscape.area.trails) for (let n = 1; n < trail.points.length; n++) {
      const a = trail.points[n - 1], b = trail.points[n], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length < .01) continue;
      const count = Math.ceil(length / 2.5), rx = -dy / length, ry = dx / length;
      const row = (t: number) => {
        const cx=a.x+dx*t,cy=a.y+dy*t;chukarTrackSectionAt(cx,cy,section);
        return [-1,-.48,.48,1].map((across,i)=>{
          const offset=(section.center+across*(across<0?section.left:section.right))/PROPERTY_PX_TO_M;
          const x=cx+rx*offset,y=cy+ry*offset;
          this.landscape.propertyToWorld(x,y,this.world);
          return {p:[this.world.x,this.landscape.heightAtProperty(x,y)+.035,this.world.z],c:i===0||i===3?edge:dust,alpha:i===0||i===3?0:section.wear};
        });
      };
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
    material.customProgramCacheKey = () => 'chukar-footpath-worn-contour-v3';
    const origin=this.landscape.worldToProperty(0,0,{x:0,y:0});
    material.onBeforeCompile=shader=>{
      shader.uniforms.uChukarPathOrigin={value:new THREE.Vector2(origin.x*PROPERTY_PX_TO_M,origin.y*PROPERTY_PX_TO_M)};
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vPathGround; uniform vec2 uChukarPathOrigin;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvPathGround=position.xz+uChukarPathOrigin;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vPathGround;')
        .replace('#include <color_fragment>',`#include <color_fragment>
          float wear=.5+.5*sin(vPathGround.x*1.3+sin(vPathGround.y*.83)*2.)*sin(vPathGround.y*2.1);
          float worn=.5+.5*sin(vPathGround.x*.49-vPathGround.y*.37+sin(vPathGround.y*.16)*1.4);
          float detail=1.-smoothstep(.25,.75,max(fwidth(vPathGround.x),fwidth(vPathGround.y)));
          diffuseColor.a *= mix(.73,.46+wear*.42+worn*.22,detail);
          diffuseColor.rgb *= .90+worn*.14;`);
    };
    applyQuailTrackGroundLod(material,ctx.quality,detail.range);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Chukar dusty contour access tracks'; mesh.receiveShadow = true;
    this.geometries.add(geometry); this.materials.add(material); this.root.add(mesh);
  }

  update(ctx: Ctx): void {
    this.wind.value = ctx.time;
    this.huntWind.update();
    this.viewPosition.value.copy(ctx.camera.position);
    this.leafFill.value = ctx.timeOfDay==='morning'||ctx.timeOfDay==='noon'?.16:.035;
    for (const batch of this.batches) {
      const distance = Math.hypot(ctx.camera.position.x - batch.center.x, ctx.camera.position.z - batch.center.z);
      batch.mesh.visible = distance < batch.range + batch.radius;
      batch.mesh.castShadow = batch.shadow && distance < batch.shadowRange + batch.radius;
      if(batch.farGeometry)batch.mesh.geometry=distance>batch.detailRange+batch.radius*.5?batch.farGeometry:batch.nearGeometry;
    }
  }

  dispose(ctx: Ctx): void {
    this.shotSolids.dispose();
    ctx.scene.remove(this.root); for (const batch of this.batches) batch.mesh.dispose();
    for (const geometry of this.geometries) geometry.dispose(); for (const material of this.materials) material.dispose();
    this.root.clear(); this.batches.length = 0; this.obstacles.length = 0; this.geometries.clear(); this.materials.clear();
  }
}
