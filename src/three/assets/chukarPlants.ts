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
  ribbon(a: Point, b: Point, width: number, angle: number, shade: number,tint:Point=[1,1,.98]): void {
    const dx=Math.cos(angle)*width,dz=-Math.sin(angle)*width;
    const l:Point=[a[0]-dx,a[1],a[2]-dz],r:Point=[a[0]+dx,a[1],a[2]+dz];
    const tl:Point=[b[0]-dx*.6,b[1],b[2]-dz*.6],tr:Point=[b[0]+dx*.6,b[1],b[2]+dz*.6];
    this.triangle(l,r,tl,shade,tint);this.triangle(r,tr,tl,shade*1.035,tint);
  }
  branch(a:Point,b:Point,width:number,lite:boolean):void {
    if(lite){this.ribbon(a,b,width,1.1,.54,[1.32,1,.70]);return;}
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
  crown(center:Point,radius:number,height:number,angle:number,lite:boolean,shade:number):void {
    if(!lite){
      // Overlapping irregular volumes make a compact woody shrub. The
      // distant form covers the same mass without interior intersections.
      for(let lobe=0;lobe<3;lobe++){
        const a=angle+lobe*2.399,offset=radius*.31;
        const p:Point=[center[0]+Math.sin(a)*offset,center[1]+(lobe===0?.17:-.07)*height,center[2]+Math.cos(a)*offset*.86];
        this.crown(p,radius*.72,height*.70,a,true,shade*(.94+lobe*.035));
      }
      return;
    }
    // Two unequal, slightly rotated rings produce a rounded shoulder rather
    // than the broad flat brim / pointed umbrella of a single diamond ring.
    const ring=(upper:boolean):Point[]=>Array.from({length:4},(_,i)=>{
      const a=angle+i*Math.PI*.5+(upper?.24:0),r=radius*(upper?.79:1)*(.95+Math.sin(i*2.3+angle)*.09);
      return [center[0]+Math.sin(a)*r,center[1]+height*(upper?.24:-.16)+(i%2?.035:-.035)*height,center[2]+Math.cos(a)*r*.86];
    });
    const lo=ring(false),hi=ring(true),top:Point=[center[0]+radius*.09,center[1]+height*.51,center[2]-radius*.08];
    const bottom:Point=[center[0]-radius*.10,center[1]-height*.50,center[2]];
    for(let i=0;i<4;i++){
      const n=(i+1)%4;
      this.triangle(lo[i],lo[n],hi[n],shade*.90);this.triangle(lo[i],hi[n],hi[i],shade*.94);
      this.triangle(hi[i],hi[n],top,shade*(1+(i%2)*.035));this.triangle(lo[n],lo[i],bottom,shade*.78);
    }
  }

  geometry(kind:string):THREE.BufferGeometry {
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.colors,3));g.computeVertexNormals();g.computeBoundingSphere();
    g.userData={kind,triangles:this.positions.length/9};return g;
  }
}

export function chukarGrassGeometry(lite:boolean):THREE.BufferGeometry {
  const surface=new PlantSurface(),rng=mulberry32(578);
  // The living center and curved outer leaves read as one rooted bunch.
  // Spend the Lite budget on a wider basal body rather than many seed stalks.
  // Every random draw is consumed in both tiers so their outline stays put.
  for(let blade=0;blade<20;blade++){
    const az=blade*2.399,root=rng()*.13,height=.28+rng()*.43,reach=.24+rng()*.27,width=.016+rng()*.015;
    if(lite&&blade%2===0)continue;
    const x=Math.sin(az)*root,z=Math.cos(az)*root,segments=lite?2:3;
    let previous:Point=[x,0,z];
    for(let n=1;n<=segments;n++){
      const t=n/segments,point:Point=[x+Math.sin(az)*reach*t*t+.055*t*t,height*(t-.26*t*t),z+Math.cos(az)*reach*t*t];
      if(n===segments){
        const w=width*(1-(n-1)/segments*.8),a:Point=[previous[0]+Math.cos(az)*w,previous[1],previous[2]-Math.sin(az)*w];
        const b:Point=[previous[0]-Math.cos(az)*w,previous[1],previous[2]+Math.sin(az)*w];
        surface.triangle(a,b,point,.91);
      }else surface.ribbon(previous,point,width*(1-t*.75),az,.58+t*.37);
      previous=point;
    }
  }
  // Folded cured leaves interlock around the living core. Their tips return
  // to the ground, so there is no hovering disk or identical upright fan.
  for(let blade=0;blade<16;blade++){
    const az=blade*2.399+.3,reach=.42+rng()*.22,height=.12+rng()*.13,width=.033+rng()*.014;
    if(lite&&blade%3===0)continue;
    const bend=az+.16*Math.sin(blade*1.7),root:Point=[Math.sin(az)*.075,.014,Math.cos(az)*.075];
    const shoulder:Point=[Math.sin(az)*reach*.46,height,Math.cos(az)*reach*.46];
    const tip:Point=[Math.sin(bend)*reach+.045,.025+(blade%3)*.015,Math.cos(bend)*reach];
    surface.ribbon(root,shoulder,width,az,.68+(blade%3)*.045);
    const dx=Math.cos(az)*width*.6,dz=-Math.sin(az)*width*.6;
    surface.triangle([shoulder[0]-dx,shoulder[1],shoulder[2]-dz],[shoulder[0]+dx,shoulder[1],shoulder[2]+dz],tip,.84);
  }
  // A few unequal seed stems establish the fine upper silhouette; the
  // two retained in Lite include the tallest stem, preserving LOD height.
  for(let i=0;i<4;i++){
    const az=i*2.399+.6,h=[.85,.98,.79,.91][i],x=Math.sin(az)*.12,z=Math.cos(az)*.12;
    if(lite&&i>1)continue;
    const middle:Point=[x+.04,h*.68,z],tip:Point=[x+.14,h,z+.045];
    surface.ribbon([x,0,z],middle,.0055,az,.72);surface.ribbon(middle,tip,.004,az,.91);
    for(let n=0;n<(lite?1:3);n++){
      const t=.88+n*.04,base:Point=[x+.14*t,h*t,z+.045*t];
      surface.leaf(base,az+(n%2?1:-1),.072,.011,.98);
    }
  }
  return surface.geometry('chukar-dry-bunchgrass');
}

export function chukarSageGeometry(lite:boolean):THREE.BufferGeometry {
  const surface=new PlantSurface();
  // Unequal compact foliage masses hang over a low, open woody framework.
  // Both tiers keep the same five centers. Lite spends 108 triangles total,
  // compared with 110 for the previous ten pointed foliage cups.
  for(let stem=0;stem<5;stem++){
    const rng=mulberry32(9961+stem*317),az=stem*2.399,height=.48+rng()*.27,reach=.27+rng()*.24;
    const fork:Point=[Math.sin(az)*reach*.38,height*.34,Math.cos(az)*reach*.38];
    const crown:Point=[Math.sin(az)*reach,height,Math.cos(az)*reach];
    surface.branch([0,.015,0],fork,.023,lite);surface.branch(fork,crown,.017,lite);
    surface.crown(crown,.29+rng()*.045,.43+rng()*.07,az,lite,.84+rng()*.09);
    if(!lite)surface.leaf(crown,az,.25,.026,.92);
  }
  // Broken basal litter gives the wood a root bed, not a floating foliage cap.
  for(let leaf=0;leaf<4;leaf++)surface.leaf([0,.02,0],leaf*2.399+.4,.33+leaf*.035,.04,.57);
  return surface.geometry('chukar-silver-sage');
}
