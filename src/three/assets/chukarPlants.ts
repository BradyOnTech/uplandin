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

  /** One leafy lobe: a dark closed core, and leaf cards spread over its
   * upper shell (Fibonacci directions), each tilted out from the surface so
   * its tip breaks the outline. The core shows between cards as the
   * crown's own depth and shade. */
  leafyLobe(center:Point,radii:Point,cards:number,size:number,rng:()=>number,lite:boolean):void {
    const [cx,cy,cz]=center,[rx,ry,rz]=radii,sides=lite?4:5,k=.62;
    const ring=(phi:number,turn:number):Point[]=>Array.from({length:sides},(_,i)=>{
      const a=i/sides*Math.PI*2+turn,w=Math.cos(phi)*(1+(rng()-.5)*.25);
      return [cx+Math.sin(a)*rx*k*w,cy+Math.sin(phi)*ry*k,cz+Math.cos(a)*rz*k*w];
    });
    const lo=ring(-.35,0),hi=ring(.45,.4),bottom:Point=[cx,cy-ry*k,cz],top:Point=[cx,cy+ry*k*.95,cz];
    for(let i=0;i<sides;i++){
      const n=(i+1)%sides;
      this.triangle(lo[n],lo[i],bottom,.5);
      this.triangle(lo[i],lo[n],hi[n],.6);this.triangle(lo[i],hi[n],hi[i],.62);
      this.triangle(hi[i],hi[n],top,.7);
    }
    const golden=Math.PI*(3-Math.sqrt(5));
    for(let c=0;c<cards;c++){
      // From the top down over four-fifths of the shell.
      const u=1-(c+.5)/cards*1.6,ring=Math.sqrt(Math.max(0,1-u*u)),t=c*golden+rng()*.7;
      const d=new THREE.Vector3(Math.sin(t)*ring,u,Math.cos(t)*ring);
      const reach=.88+rng()*.18,p=new THREE.Vector3(cx+d.x*rx*reach,cy+d.y*ry*reach,cz+d.z*rz*reach);
      const normal=new THREE.Vector3(d.x/rx,d.y/ry,d.z/rz).normalize();
      const ref=Math.abs(normal.y)<.95?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
      const s1=normal.clone().cross(ref).normalize(),s2=normal.clone().cross(s1).normalize(),spin=rng()*Math.PI*2;
      const lift=.4+rng()*.5,along=s1.multiplyScalar(Math.cos(spin)).addScaledVector(s2,Math.sin(spin)).multiplyScalar(Math.cos(lift)).addScaledVector(normal,Math.sin(lift)).normalize();
      const across=normal.clone().cross(along).normalize(),len=size*(.75+rng()*.5),shade=(.84+.26*(u+1)/2)*(.93+rng()*.14);
      const v=(a:THREE.Vector3):Point=>[a.x,a.y,a.z];
      const tail=p.clone().addScaledVector(along,-len*.35),tip=p.clone().addScaledVector(along,len);
      const left=p.clone().addScaledVector(across,len*.4),right=p.clone().addScaledVector(across,-len*.4);
      if(lite){this.triangle(v(left),v(right),v(tip),shade);continue;}
      this.triangle(v(tail),v(left),v(tip),shade);this.triangle(v(tail),v(tip),v(right),shade*.96);
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

/**
 * Big sagebrush: a few gnarled, shredding grey trunks lean out from one
 * root and fork into twigs; leaves cluster at the twig ends as small
 * silver lobes, each a dark core dressed with leaf cards tilted out from
 * it (the woody kit's leafy lobes), so the crown is a ragged, wider-than-
 * tall silver mass with depth, never a grey stone. The base stays open:
 * the trunks show beneath the lowest leaves. Vertex colour is light and
 * shade only; the instance colour carries the silver tone. Lite keeps the
 * same trunks and the biggest lobes, with single-triangle cards.
 */
export function chukarSageGeometry(lite:boolean):THREE.BufferGeometry {
  const surface=new PlantSurface(),rng=mulberry32(9961);
  const bark:Point=[1.06,1,.9];
  // Gnarled trunks: two kinked segments each, then two twigs up into the crown.
  // One twig of each trunk first: Lite keeps those, so it keeps the spread.
  const tips:Point[][]=[[],[]];
  for(let trunk=0;trunk<3;trunk++){
    const az=trunk*2.18+rng()*.5,lean=.1+rng()*.08,kink=rng()-.5;
    const root:Point=[Math.sin(az)*.03,.04,Math.cos(az)*.03];
    const knee:Point=[Math.sin(az+kink*.6)*lean,.2+rng()*.05,Math.cos(az+kink*.6)*lean];
    const crotch:Point=[Math.sin(az)*lean*1.9,.38+rng()*.07,Math.cos(az)*lean*1.9];
    if(lite){surface.ribbon(root,crotch,.03,az+1.57,.5,bark);}
    else{surface.branch(root,knee,.034,false);surface.branch(knee,crotch,.026,false);}
    for(let twig=0;twig<2;twig++){
      const a=az+(twig?.55:-.5)+(rng()-.5)*.3,reach=lean*1.9+.12+rng()*.14;
      const tip:Point=[Math.sin(a)*reach,.56+rng()*.2,Math.cos(a)*reach];
      // At a distance the lobes hide the twigs; Lite keeps only the trunks.
      if(!lite)surface.ribbon(crotch,tip,.014,a+1.57,.52,bark);
      tips[twig].push(tip);
    }
  }
  // Leaf lobes at the twig ends and one over the middle: the biggest
  // first, so Lite keeps the same outline in fewer pieces.
  const lobes=[{c:[0,.78,0] as Point,r:[.3,.17,.27] as Point},...tips.flat().map(t=>({c:[t[0]*1.08,t[1]+.04,t[2]*1.08] as Point,r:[.21+rng()*.06,.13+rng()*.04,.19+rng()*.05] as Point}))];
  lobes.forEach((lobe,i)=>{if(lite&&i>=4)return;surface.leafyLobe(lobe.c,lobe.r,lite?5:9,lite?.15:.11,rng,lite);});
  // Broken basal litter gives the wood a root bed, not a floating canopy.
  for(let leaf=0;leaf<(lite?2:4);leaf++)surface.leaf([0,.02,0],leaf*2.399+.4,.33+leaf*.035,.04,.57);
  return surface.geometry('chukar-silver-sage');
}
