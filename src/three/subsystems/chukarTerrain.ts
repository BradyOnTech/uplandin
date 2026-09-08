import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import type { Ctx } from '../engine';
import { buildQuailTerrainGeometry, applyQuailSurfaceDetail } from './quailTerrain';
import { quailGroundTiles, quailGroundUsesNear } from './quailGroundGeometry';

const earth = new THREE.Color(0x9d8a70), dust = new THREE.Color(0xbea886);
const stone = new THREE.Color(0x8d8980), shade = new THREE.Color(0x6d716b), sage = new THREE.Color(0x7e8771);
const sample = {height:0,slope:0,gradeX:0,gradeZ:0,rockiness:0,vegetation:0,moisture:0};

function paint(landscape:LandscapeModel,x:number,y:number,out:THREE.Color):THREE.Color {
  const surface=landscape.surfaceAtProperty(x,y,sample);
  const sweep=.5+.25*Math.sin(x*.019+Math.cos(y*.011)*1.5)+.25*Math.cos(y*.016-x*.007);
  const bedding=.5+.5*Math.sin(surface.height*.63+x*.003);
  out.copy(earth).lerp(dust,.22+sweep*.28);
  out.lerp(sage,surface.vegetation*(1-surface.rockiness)*.34);
  out.lerp(stone,surface.rockiness*(.55+bedding*.30));
  out.lerp(shade,Math.min(.34,surface.slope*.27));
  return out.multiplyScalar(.89+sweep*.14+bedding*.04);
}

/** The entire ridge uses the authoritative property heightfield. Near detail
 * follows the hunter instead of ending at the old drop-centered 480 m plate. */
export class ChukarTerrain {
  private tiles:{near:THREE.Mesh;far:THREE.Mesh;x:number;z:number}[]=[];
  private distant:THREE.Mesh[]=[];
  private material=new THREE.MeshLambertMaterial({vertexColors:true});
  private nearDistance=170;
  constructor(private landscape:LandscapeModel){applyQuailSurfaceDetail(this.material,landscape);}
  init(ctx:Ctx):void {
    this.nearDistance=ctx.quality==='high'?170:125;
    // Chukar used to keep the high-tier 64-cell near grid on mobile even
    // though the other property terrain paths lower their detail there. The
    // authored heightfield remains identical; only the sampling density
    // changes, which is safe because trails and gameplay sample the analytic
    // LandscapeModel rather than this render mesh. Keep enough resolution to
    // preserve the broken-bench silhouette while avoiding a redundant depth
    // and color pass over every near tile.
    const nearDivisions = ctx.quality === 'high' ? 64 : 36;
    const farDivisions = ctx.quality === 'high' ? 24 : 14;
    const horizonDivisions = ctx.quality === 'high' ? 96 : 48;
    for(const tile of quailGroundTiles(this.landscape)) {
      const near=new THREE.Mesh(buildQuailTerrainGeometry(this.landscape,tile.x,tile.y,tile.width,tile.depth,nearDivisions,paint),this.material);
      const far=new THREE.Mesh(buildQuailTerrainGeometry(this.landscape,tile.x,tile.y,tile.width,tile.depth,farDivisions,paint),this.material);
      near.name='Chukar near terrain';far.name='Chukar distant terrain';near.receiveShadow=far.receiveShadow=true;
      this.tiles.push({near,far,x:tile.centerX,z:tile.centerZ});ctx.scene.add(near,far);
    }
    const b=this.landscape.area.world,m=1000;
    for(const [x,y,w,h] of [[b.x-m,b.y-m,b.w+2*m,m],[b.x-m,b.y+b.h,b.w+2*m,m],
      [b.x-m,b.y,m,b.h],[b.x+b.w,b.y,m,b.h]]) {
      const mesh=new THREE.Mesh(buildQuailTerrainGeometry(this.landscape,x,y,w,h,horizonDivisions,paint),this.material);
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
    this.material.dispose();this.tiles.length=0;this.distant.length=0;
  }
}
