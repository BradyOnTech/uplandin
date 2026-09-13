import * as THREE from 'three';
import { mulberry32 } from '../../game/math';

type Point = [number, number, number];

/** Opaque painted geometry: fine silhouettes without alpha-card overdraw. */
class PlantSurface {
  private positions: number[] = [];
  private colors: number[] = [];
  triangle(a: Point, b: Point, c: Point, shade: number): void {
    for (const p of [a,b,c]) { this.positions.push(...p); this.colors.push(shade,shade,shade*.98); }
  }
  ribbon(a: Point, b: Point, width: number, angle: number, shade: number): void {
    const dx=Math.cos(angle)*width,dz=-Math.sin(angle)*width;
    const l:Point=[a[0]-dx,a[1],a[2]-dz],r:Point=[a[0]+dx,a[1],a[2]+dz];
    const tl:Point=[b[0]-dx*.6,b[1],b[2]-dz*.6],tr:Point=[b[0]+dx*.6,b[1],b[2]+dz*.6];
    this.triangle(l,r,tl,shade);this.triangle(r,tr,tl,shade*1.035);
  }
  leaf(base:Point,angle:number,length:number,width:number,shade:number):void {
    const end:Point=[base[0]+Math.sin(angle)*length,base[1]+length*.28,base[2]+Math.cos(angle)*length];
    const mid:Point=[(base[0]+end[0])*.5,(base[1]+end[1])*.5+.018,(base[2]+end[2])*.5];
    this.triangle(base,[mid[0]+Math.cos(angle)*width,mid[1],mid[2]-Math.sin(angle)*width],end,shade);
    this.triangle(base,end,[mid[0]-Math.cos(angle)*width,mid[1]-.012,mid[2]+Math.sin(angle)*width],shade*.90);
  }
  crown(center:Point,radius:number,height:number,angle:number,lite:boolean,shade:number):void {
    const sides=lite?4:7;
    const ring=(scale:number,y:number):Point[]=>Array.from({length:sides},(_,i)=>{
      const a=angle+i/sides*Math.PI*2,r=radius*scale*(.92+Math.sin(i*2.3+angle)*.1);
      return [center[0]+Math.sin(a)*r,center[1]+y,center[2]+Math.cos(a)*r*.84];
    });
    const middle=ring(1,0),top:Point=[center[0]+radius*.08,center[1]+height*.52,center[2]];
    if(lite){
      const bottom:Point=[center[0],center[1]-height*.52,center[2]];
      for(let i=0;i<sides;i++){const next=(i+1)%sides;this.triangle(middle[i],middle[next],top,shade);this.triangle(middle[next],middle[i],bottom,shade*.76);}
    }else{
      const lower=ring(.68,-height*.48),upper=ring(.59,height*.38);
      for(let i=0;i<sides;i++){
        const next=(i+1)%sides;
        this.triangle(lower[i],middle[next],middle[i],shade*.73);this.triangle(lower[i],lower[next],middle[next],shade*.78);
        this.triangle(middle[i],upper[next],upper[i],shade*.94);this.triangle(middle[i],middle[next],upper[next],shade*.88);
        this.triangle(upper[i],upper[next],top,shade*(.97+(i%3)*.04));
      }
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
  // Overlapping irregular leaf lobes give sage a low, woody crown. Narrow
  // twig-only sprays read as ferns from the actual standing camera.
  for(let stem=0;stem<7;stem++){
    const rng=mulberry32(9961+stem*317),az=stem*2.399,height=.30+rng()*.23,reach=.21+rng()*.21;
    const fork:Point=[Math.sin(az)*reach*.45,height*.48,Math.cos(az)*reach*.45];
    const crown:Point=[Math.sin(az)*reach,height,Math.cos(az)*reach];
    if(lite)surface.ribbon([0,0,0],crown,.012,az,.48);
    else{surface.ribbon([0,0,0],fork,.012,az,.39);surface.ribbon(fork,crown,.009,az,.52);}
    surface.crown(crown,.19+rng()*.045,.24,az,lite,.91+rng()*.10);
    if(stem<3&&!lite)surface.crown([fork[0],fork[1]+.10,fork[2]],.18,.21,az+.5,lite,.86);
    if(!lite)surface.leaf(crown,az,.26,.02,.92);
  }
  return surface.geometry('chukar-silver-sage');
}
