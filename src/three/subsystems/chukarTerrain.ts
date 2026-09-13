import * as THREE from 'three';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';
import type { Ctx } from '../engine';

export const CHUKAR_GROUND_DETAIL = {
  high: {near:48,far:20,range:170,horizonSpacing:14},
  lite: {near:32,far:12,range:125,horizonSpacing:24},
} as const;
import { buildQuailTerrainGeometry } from './quailTerrain';
import { quailGroundTiles, quailGroundUsesNear } from './quailGroundGeometry';
import { chukarGroundZones, chukarPlantStandAt, chukarDistantRelief } from '../../game/chukarLandscape';

const earth = new THREE.Color(0xac9064), dust = new THREE.Color(0xcbb78e);
const stone = new THREE.Color(0x89857d), shade = new THREE.Color(0x7e806f), sage = new THREE.Color(0x8e987b);
const litter = new THREE.Color(0xb4a06d),stand={grass:0,sage:0};
const zones={talus:0,shelter:0};
const sample = {height:0,slope:0,gradeX:0,gradeZ:0,rockiness:0,vegetation:0,moisture:0};

/** World-anchored scree detail, filtered before individual chips become subpixel. */
function applyScreeDetail(material: THREE.MeshLambertMaterial, landscape: LandscapeModel,texture:THREE.Texture): void {
  const origin = landscape.worldToProperty(0, 0, { x: 0, y: 0 });
  material.customProgramCacheKey = () => 'chukar-eroded-scree-v4';
  material.onBeforeCompile = shader => {
    shader.uniforms.uScreeOrigin = { value: new THREE.Vector2(origin.x * PROPERTY_PX_TO_M, origin.y * PROPERTY_PX_TO_M) };
    shader.uniforms.uChukarEarth={value:texture};
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vScreeGround; varying float vRockFace; varying float vRockHeight;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec3 screeWorld=(modelMatrix * vec4(transformed, 1.)).xyz;vScreeGround=screeWorld.xz;vRockHeight=screeWorld.y;vRockFace=1.-smoothstep(.45,.86,normal.y);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vScreeGround;
        varying float vRockFace;
        varying float vRockHeight;
        uniform vec2 uScreeOrigin;
        uniform sampler2D uChukarEarth;
        float screeHash(vec2 p) {
          vec3 h = fract(vec3(p.xyx) * .1031);
          h += dot(h, h.yzx + 33.33);
          return fract((h.x + h.y) * h.z);
        }
        float screeNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(screeHash(i), screeHash(i+vec2(1.,0.)), f.x),
            mix(screeHash(i+vec2(0.,1.)), screeHash(i+vec2(1.,1.)),f.x),f.y);
        }
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 ground = vScreeGround + uScreeOrigin;
        float deposit = screeNoise(ground * .17);
        float soil = screeNoise(ground * 1.4);
        diffuseColor.rgb *= .94 + deposit * .08 + soil * .045;
        float paintRange=1.-smoothstep(22.,115.,length(vScreeGround-cameraPosition.xz));
        if(paintRange>0.){
          vec3 closePaint=texture2D(uChukarEarth,ground/5.5).rgb;
          vec3 broadPaint=texture2D(uChukarEarth,mat2(.8,-.6,.6,.8)*ground/13.+.37).rgb;
          float paintValue=dot(mix(closePaint,broadPaint,.23),vec3(.28,.55,.17));
          diffuseColor.rgb *= mix(1.,clamp(paintValue*1.85,.60,1.23),paintRange*.46);
        }
        // Broad mineral patches and descending erosion streaks remain
        // legible across the canyon, after close soil detail has faded out.
        float mineral=screeNoise(ground*.027+vec2(vRockHeight*.019,-vRockHeight*.011));
        float wash=screeNoise(vec2((ground.x*.73+ground.y*.68)*.20+mineral*2.,vRockHeight*.045));
        float joint=smoothstep(.34,.66,wash);
        vec3 weathered=mix(vec3(.67,.73,.77),vec3(1.12,1.05,.91),mineral);
        weathered*=.80+joint*.35;
        diffuseColor.rgb *= mix(vec3(1.),weathered,vRockFace*.9);
        vec2 cells = mat2(.8,-.6,.6,.8) * ground * 2.4;
        vec2 cell = floor(cells);
        float seed = screeHash(cell);
        float angle = seed * 6.2831853;
        vec2 local = fract(cells) - .5;
        local -= vec2(screeHash(cell+17.), screeHash(cell+39.)) * .22 - .11;
        local = mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*local;
        local.y *= 1.2 + seed * .9;
        float edge = max(max(abs(local.x), abs(local.y)), abs(local.x+local.y)*.72);
        float aa = max(fwidth(edge), .003);
        float radius = .14 + screeHash(cell+91.) * .20;
        float chip = 1.-smoothstep(radius-aa, radius+aa, edge);
        float range = 1.-smoothstep(18.,65.,length(vScreeGround-cameraPosition.xz));
        float resolved = 1.-smoothstep(.12,.35,max(fwidth(cells.x),fwidth(cells.y)));
        float exposed = smoothstep(.2,.6,deposit) * step(.19,seed);
        float facet = local.x + local.y * .55 > 0. ? 1.22 : .87;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.02,1.07,1.14) * facet,
          chip * exposed * range * resolved * .38);
      `);
  };
}

function paint(landscape:LandscapeModel,x:number,y:number,out:THREE.Color):THREE.Color {
  const surface=landscape.surfaceAtProperty(x,y,sample);
  const sweep=.5+.25*Math.sin(x*.019+Math.cos(y*.011)*1.5)+.25*Math.cos(y*.016-x*.007);
  const bedding=.5+.5*Math.sin(surface.height*.63+x*.003);
  chukarGroundZones(x,y,zones);
  out.copy(earth).lerp(dust,.25+sweep*.32);
  out.lerp(sage,surface.vegetation*(1-surface.rockiness)*.34);
  out.lerp(stone,surface.rockiness*(.55+bedding*.30));
  out.lerp(stone,zones.talus*.42);
  chukarPlantStandAt(x,y,zones.talus,zones.shelter,stand);
  out.lerp(litter,stand.grass*.44);
  out.lerp(sage,stand.sage*.49+zones.shelter*.13);
  out.lerp(shade,Math.min(.34,surface.slope*.27));
  return out.multiplyScalar(.89+sweep*.14+bedding*.04);
}

/** Rectangular sampling spends horizon vertices evenly in metres. A small
 * fixed jitter breaks grid diagonals; borders stay exact to meet the parcel.
 * Half-flat normals retain broad planes without turning every triangle into
 * a separate brightly colored facet. No added meshes or runtime textures. */
export function buildChukarHorizonGeometry(landscape:LandscapeModel,px:number,py:number,width:number,depth:number,spacing:number):THREE.BufferGeometry {
  const nx=Math.ceil(width/spacing),nz=Math.ceil(depth/spacing),positions:number[]=[],colors:number[]=[],indices:number[]=[];
  const color=new THREE.Color(),world={x:0,z:0};
  for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
    const x=px+ix/nx*width+(ix>0&&ix<nx?Math.sin(ix*127.1+iz*311.7)*spacing*.17:0);
    const y=py+iz/nz*depth+(iz>0&&iz<nz?Math.sin(ix*269.5+iz*183.3)*spacing*.17:0);
    const h=landscape.heightAtProperty(x,y);landscape.propertyToWorld(x,y,world);
    positions.push(world.x,h,world.z);paint(landscape,x,y,color);
    const relief=chukarDistantRelief(x,y),surface=landscape.surfaceAtProperty(x,y,sample);
    // Exposed slopes carry mineral colors, not the planted parcel's sage tint.
    if(relief>2){
      const rock=Math.min(1,surface.slope*1.7),wash=.5+.5*Math.sin(x*.025+y*.018+h*.07);
      color.copy(dust).lerp(stone,rock*.86).lerp(earth,(1-rock)*.28);
      color.multiplyScalar(.89+wash*.17);
    }
    colors.push(color.r,color.g,color.b);
  }
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
    const a=z*(nx+1)+x,b=a+nx+1;
    indices.push(a,b,a+1,a+1,b,b+1);
  }
  // Border skirts close tiny interpolation differences where an outside
  // strip meets another strip or the playable terrain's coarser edge.
  for(const border of [Array.from({length:nx+1},(_,i)=>i),Array.from({length:nz+1},(_,i)=>i*(nx+1)+nx),
    Array.from({length:nx+1},(_,i)=>nz*(nx+1)+nx-i),Array.from({length:nz+1},(_,i)=>(nz-i)*(nx+1))]){
    let previous=-1;
    for(let i=0;i<border.length;i++){
      const top=border[i],bottom=positions.length/3;
      positions.push(positions[top*3],positions[top*3+1]-3,positions[top*3+2]);colors.push(...colors.slice(top*3,top*3+3));
      if(i)indices.push(border[i-1],bottom,top,border[i-1],previous,bottom);
      previous=bottom;
    }
  }
  const indexed=new THREE.BufferGeometry();indexed.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  indexed.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));indexed.setIndex(indices);indexed.computeVertexNormals();
  const geometry=indexed.toNonIndexed(),smoothNormals=geometry.getAttribute('normal').clone();indexed.dispose();geometry.computeVertexNormals();
  const normal=geometry.getAttribute('normal'),n=new THREE.Vector3();
  for(let i=0;i<normal.count;i++){
    n.set(normal.getX(i)+smoothNormals.getX(i),normal.getY(i)+smoothNormals.getY(i),normal.getZ(i)+smoothNormals.getZ(i)).normalize();
    normal.setXYZ(i,n.x,n.y,n.z);
  }
  geometry.computeBoundingSphere();return geometry;
}

/** The entire ridge uses the authoritative property heightfield. Near detail
 * follows the hunter instead of ending at the old drop-centered 480 m plate. */
export class ChukarTerrain {
  private tiles:{near:THREE.Mesh;far:THREE.Mesh;x:number;z:number}[]=[];
  private distant:THREE.Mesh[]=[];
  private material=new THREE.MeshLambertMaterial({vertexColors:true});
  private nearDistance=170;
  private texture?:THREE.Texture;
  constructor(private landscape:LandscapeModel){}
  async init(ctx:Ctx):Promise<void> {
    this.texture=await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}textures/terrain/chukar-dry-ground.webp`);
    this.texture.wrapS=this.texture.wrapT=THREE.RepeatWrapping;this.texture.anisotropy=4;
    applyScreeDetail(this.material,this.landscape,this.texture);
    const detail=CHUKAR_GROUND_DETAIL[ctx.quality];
    this.nearDistance=detail.range;
    // Spend detail on nearby plant silhouettes. The smooth heightfield
    // keeps the same authored forms with a leaner grid; the footpath uses
    // these exact divisions and the same near-distance switch.
    const nearDivisions = detail.near;
    const farDivisions = detail.far;
    const horizonSpacing = detail.horizonSpacing;
    for(const tile of quailGroundTiles(this.landscape)) {
      const near=new THREE.Mesh(buildQuailTerrainGeometry(this.landscape,tile.x,tile.y,tile.width,tile.depth,nearDivisions,paint),this.material);
      const far=new THREE.Mesh(buildQuailTerrainGeometry(this.landscape,tile.x,tile.y,tile.width,tile.depth,farDivisions,paint),this.material);
      near.name='Chukar near terrain';far.name='Chukar distant terrain';near.receiveShadow=far.receiveShadow=true;
      this.tiles.push({near,far,x:tile.centerX,z:tile.centerZ});ctx.scene.add(near,far);
    }
    const b=this.landscape.area.world,m=1000;
    for(const [x,y,w,h] of [[b.x-m,b.y-m,b.w+2*m,m],[b.x-m,b.y+b.h,b.w+2*m,m],
      [b.x-m,b.y,m,b.h],[b.x+b.w,b.y,m,b.h]]) {
      const mesh=new THREE.Mesh(buildChukarHorizonGeometry(this.landscape,x,y,w,h,horizonSpacing),this.material);
      mesh.name='Chukar beyond property';this.distant.push(mesh);ctx.scene.add(mesh);
    }
    this.update(ctx);
  }
  update(ctx:Ctx):void {
    for(const tile of this.tiles){const near=quailGroundUsesNear(tile.x,tile.z,ctx.camera.position.x,ctx.camera.position.z,this.nearDistance);
      tile.near.visible=near;tile.far.visible=!near;}
  }
  dispose(ctx:Ctx):void {
    for(const tile of this.tiles)for(const mesh of [tile.near,tile.far]){ctx.scene.remove(mesh);mesh.geometry.dispose();}
    for(const mesh of this.distant){ctx.scene.remove(mesh);mesh.geometry.dispose();}
    this.texture?.dispose();this.material.dispose();this.tiles.length=0;this.distant.length=0;
  }
}
