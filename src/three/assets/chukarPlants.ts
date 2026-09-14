import * as THREE from 'three';
import { mulberry32 } from '../../game/math';

type Point = [number, number, number];

/** Opaque painted geometry: fine silhouettes without alpha-card overdraw. */
class PlantSurface {
  private positions: number[] = [];
  private colors: number[] = [];
  triangle(a: Point, b: Point, c: Point, shade: number, tint:Point=[1,1,.98]): void {
    for (const p of [a,b,c]) { this.positions.push(...p); this.colors.push(shade*tint[0],shade*tint[1],shade*tint[2]); }
  }
  ribbon(a: Point, b: Point, width: number, angle: number, shade: number): void {
    const dx=Math.cos(angle)*width,dz=-Math.sin(angle)*width;
    const l:Point=[a[0]-dx,a[1],a[2]-dz],r:Point=[a[0]+dx,a[1],a[2]+dz];
    const tl:Point=[b[0]-dx*.6,b[1],b[2]-dz*.6],tr:Point=[b[0]+dx*.6,b[1],b[2]+dz*.6];
    this.triangle(l,r,tl,shade);this.triangle(r,tr,tl,shade*1.035);
  }
  branch(a:Point,b:Point,width:number,lite:boolean):void {
    if(lite){this.ribbon(a,b,width,1.1,.5);return;}
    const axis=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
    const u=new THREE.Vector3(0,0,1).cross(axis).normalize().multiplyScalar(width),v=axis.clone().cross(u);
    const ring=(p:Point,k:number):Point[]=>Array.from({length:3},(_,i)=>{
      const angle=i*Math.PI*2/3,offset=u.clone().multiplyScalar(Math.cos(angle)*k).addScaledVector(v,Math.sin(angle)*k);
      return [p[0]+offset.x,p[1]+offset.y,p[2]+offset.z];
    });
    const lo=ring(a,1),hi=ring(b,.52);
    for(let i=0;i<3;i++){const j=(i+1)%3;this.triangle(lo[i],lo[j],hi[j],.52,[1.22,.94,.66]);this.triangle(lo[i],hi[j],hi[i],.58,[1.22,.94,.66]);}
  }
  leaf(base:Point,angle:number,length:number,width:number,shade:number):void {
    const end:Point=[base[0]+Math.sin(angle)*length,base[1]+length*.28,base[2]+Math.cos(angle)*length];
    const mid:Point=[(base[0]+end[0])*.5,(base[1]+end[1])*.5+.018,(base[2]+end[2])*.5];
    this.triangle(base,[mid[0]+Math.cos(angle)*width,mid[1],mid[2]-Math.sin(angle)*width],end,shade);
    this.triangle(base,end,[mid[0]-Math.cos(angle)*width,mid[1]-.012,mid[2]+Math.sin(angle)*width],shade*.90);
  }
  crown(center:Point,radius:number,height:number,angle:number,lite:boolean,shade:number,sides=4):void {
    if(!lite){
      // A broken group of small foliage cups instead of one solid bulb.
      // The far envelope covers the same extent with fewer internal faces.
      for(let lobe=0;lobe<3;lobe++){
        const a=angle+lobe*2.399,offset=radius*.44;
        const p:Point=[center[0]+Math.sin(a)*offset,center[1]+(lobe===0?.22:-.08)*height,center[2]+Math.cos(a)*offset*.84];
        this.crown(p,radius*.59,height*.57,a,true,shade*(.90+lobe*.045),6);
      }
      return;
    }
    const middle:Point[]=Array.from({length:sides},(_,i)=>{
      const a=angle+i/sides*Math.PI*2,r=radius*(.92+Math.sin(i*2.3+angle)*.1);
      return [center[0]+Math.sin(a)*r,center[1],center[2]+Math.cos(a)*r*.84];
    });
    const top:Point=[center[0]+radius*.08,center[1]+height*.52,center[2]];
    const bottom:Point=[center[0],center[1]-height*.52,center[2]];
    for(let i=0;i<sides;i++){const next=(i+1)%sides;this.triangle(middle[i],middle[next],top,shade);this.triangle(middle[next],middle[i],bottom,shade*.76);}
  }

  geometry(kind:string):THREE.BufferGeometry {
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.colors,3));g.computeVertexNormals();g.computeBoundingSphere();
    g.userData={kind,triangles:this.positions.length/9};return g;
  }
}

export function chukarGrassGeometry(lite:boolean):THREE.BufferGeometry {
  const surface=new PlantSurface(),rng=mulberry32(578);
  // Both tiers share the same blades. The far form drops curve segments,
  // keeping the outline and basal width when geometry changes with distance.
  for(let blade=0;blade<20;blade++){
    const az=blade*2.399,root=rng()*.15,height=.28+rng()*.43,reach=.20+rng()*.23,width=.012+rng()*.012;
    if(lite&&blade%2===0)continue;
    const x=Math.sin(az)*root,z=Math.cos(az)*root,segments=lite?2:3;
    let previous:Point=[x,0,z];
    for(let n=1;n<=segments;n++){
      const t=n/segments,point:Point=[x+Math.sin(az)*reach*t*t,height*(t-.14*t*t),z+Math.cos(az)*reach*t*t];
      if(n===segments){
        const w=width*(1-(n-1)/segments*.8),a:Point=[previous[0]+Math.cos(az)*w,previous[1],previous[2]-Math.sin(az)*w];
        const b:Point=[previous[0]-Math.cos(az)*w,previous[1],previous[2]+Math.sin(az)*w];
        surface.triangle(a,b,point,.91);
      }else surface.ribbon(previous,point,width*(1-t*.75),az,.58+t*.37);
      previous=point;
    }
  }
  // Low, bent leaves give each bunch a thatch skirt instead of a handful
  // of isolated upright stems. Its footprint remains open between plants.
  for(let blade=0;blade<12;blade++){
    const az=blade*2.399+.3,reach=.38+rng()*.17,height=.13+rng()*.12;
    if(lite&&blade%2===0)continue;
    const shoulder:Point=[Math.sin(az)*reach*.48,height,Math.cos(az)*reach*.48];
    const tip:Point=[Math.sin(az)*reach,height*.32,Math.cos(az)*reach];
    surface.ribbon([0,.015,0],shoulder,.024,az,.76);
    const dx=Math.cos(az)*.012,dz=-Math.sin(az)*.012;
    surface.triangle([shoulder[0]-dx,shoulder[1],shoulder[2]-dz],[shoulder[0]+dx,shoulder[1],shoulder[2]+dz],tip,.87);
  }
  // Narrow seed heads replace the triangular pennants on the former grass.
  for(let i=0;i<(lite?3:5);i++){
    const az=i*2.399+.6,h=.72+rng()*.27,x=Math.sin(az)*.12,z=Math.cos(az)*.12;
    const middle:Point=[x+.035,h*.68,z],tip:Point=[x+.09,h,z+.035];
    surface.ribbon([x,0,z],middle,.0055,az,.72);surface.ribbon(middle,tip,.004,az,.91);
    for(let n=0;n<(lite?2:4);n++){
      const t=.78+n*.05,base:Point=[x+.09*t,h*t,z+.035*t];
      surface.leaf(base,az+(n%2?1:-1),.065,.009,.96);
    }
  }
  return surface.geometry('chukar-dry-bunchgrass');
}

export function chukarSageGeometry(lite:boolean):THREE.BufferGeometry {
  const surface=new PlantSurface();
  // An upright woody framework with unequal compound crowns. Both detail
  // tiers retain every crown center; distant sage no longer flattens into
  // umbrella-shaped leaves or changes its overall height at a cell switch.
  for(let stem=0;stem<5;stem++){
    const rng=mulberry32(9961+stem*317),az=stem*2.399,height=.57+rng()*.31,reach=.28+rng()*.23;
    const fork:Point=[Math.sin(az)*reach*.38,height*.44,Math.cos(az)*reach*.38];
    const crown:Point=[Math.sin(az)*reach,height,Math.cos(az)*reach];
    const side:Point=[fork[0]+Math.sin(az+.92)*.26,height*.73,fork[2]+Math.cos(az+.92)*.26];
    surface.branch([0,.015,0],fork,.021,lite);surface.branch(fork,crown,.015,lite);surface.branch(fork,side,.010,lite);
    surface.crown(crown,.22+rng()*.035,.32,az,lite,.83+rng()*.09);
    surface.crown(side,.18,.27,az+.92,lite,.85);
    if(!lite){surface.leaf(crown,az,.25,.026,.92);surface.leaf(side,az+.92,.20,.023,.86);}
  }
  return surface.geometry('chukar-silver-sage');
}
