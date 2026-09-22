import * as THREE from 'three';
import { describe,expect,it } from 'vitest';
import { getArea } from '../src/game/areas';
import { chukarGrassGeometry,chukarSageGeometry } from '../src/three/assets/chukarPlants';
import { chukarPlantGroupAt,chukarTrackSectionAt } from '../src/three/subsystems/chukarSurface';

describe('Chukar rooted vegetation finish',()=>{
  it.each([false,true])('retains a visible curved basal body in the %s grass tier',lite=>{
    const geometry=chukarGrassGeometry(lite),p=geometry.getAttribute('position');
    const basal:number[]=[];
    for(let i=0;i<p.count;i++){
      expect(p.getY(i)).toBeGreaterThanOrEqual(0);
      if(p.getY(i)<.12)basal.push(Math.hypot(p.getX(i),p.getZ(i)));
    }
    // Low foliage reaches beyond the woody core and returns to the floor.
    expect(basal.filter(radius=>radius>.35).length).toBeGreaterThan(6);
    expect(Math.max(...basal)).toBeGreaterThan(.55);
    expect(p.count/3).toBeLessThanOrEqual(lite?72:196);
    geometry.dispose();
  });

  it.each([false,true])('keeps the %s sage canopy volumetric within its previous budget',lite=>{
    const geometry=chukarSageGeometry(lite),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
    let shoulderVertices=0,rootVertices=0;
    for(let i=0;i<p.count;i++){
      expect(Number.isFinite(p.getY(i))).toBe(true);
      expect(p.getY(i)).toBeGreaterThanOrEqual(0);
      if(p.getY(i)<.04)rootVertices++;
      if(p.getY(i)>.3&&Math.abs(n.getY(i))<.65)shoulderVertices++;
    }
    expect(rootVertices).toBeGreaterThan(8);
    expect(shoulderVertices).toBeGreaterThan(p.count*.18);
    expect(p.count/3).toBeLessThanOrEqual(lite?110:470);
    geometry.computeBoundingBox();const size=geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(.8);expect(size.x).toBeGreaterThan(.95);
    geometry.dispose();
  });
});

describe('Chukar shared surface rhythm',()=>{
  it('keeps irregular tread edges inside the existing walking clearance along every route',()=>{
    const area=getArea('chukar-ridge'),out={left:0,right:0,center:0,wear:0};
    let narrow=Infinity,wide=0;
    for(const trail of area.trails)for(let i=1;i<trail.points.length;i++){
      const a=trail.points[i-1],b=trail.points[i],length=Math.hypot(b.x-a.x,b.y-a.y);
      for(let d=0;d<=length;d+=1){
        const t=d/length,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
        chukarTrackSectionAt(x,y,out);
        expect(Math.abs(out.center)+Math.max(out.left,out.right)).toBeLessThan(.90);
        expect(out.wear).toBeGreaterThan(.25);expect(out.wear).toBeLessThan(.60);
        narrow=Math.min(narrow,out.left+out.right);wide=Math.max(wide,out.left+out.right);
        const before=out.center;chukarTrackSectionAt(x+.001,y,out);
        expect(Math.abs(out.center-before)).toBeLessThan(.001);
        const tone=chukarPlantGroupAt(x,y);
        expect(tone).toBeGreaterThanOrEqual(0);expect(tone).toBeLessThanOrEqual(1);
        expect(Math.abs(tone-chukarPlantGroupAt(x+.1,y))).toBeLessThan(.01);
      }
    }
    expect(wide-narrow).toBeGreaterThan(.2);
  });
});
