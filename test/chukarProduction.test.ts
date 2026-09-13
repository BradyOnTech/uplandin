import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { getArea } from '../src/game/areas';
import { chukarBrowBlockers,chukarBrows,chukarDistantRelief,chukarGroundZones,chukarPlantStandAt } from '../src/game/chukarLandscape';
import { CHUKAR_WASHES,chukarWashAt } from '../src/game/chukarComposition';
import { LandscapeModel,PROPERTY_PX_TO_M } from '../src/game/landscape';
import { groundQuailTrackGeometry,quailGroundTileAt } from '../src/three/subsystems/quailGroundGeometry';
import { buildQuailTerrainGeometry } from '../src/three/subsystems/quailTerrain';
import { CHUKAR_GROUND_DETAIL,buildChukarHorizonGeometry } from '../src/three/subsystems/chukarTerrain';
import { chukarGrassGeometry,chukarSageGeometry } from '../src/three/assets/chukarPlants';

const area=getArea('chukar-ridge'),landscape=new LandscapeModel(area);
const sample=()=>({height:0,slope:0,gradeX:0,gradeZ:0,rockiness:0,vegetation:0,moisture:0});

describe('Chukar authored route',()=>{
  it('climbs from a gentle entry to an elevated, huntable overlook',()=>{
    const entry=area.dropPoints[0].position,overlook=area.landmarks.find(l=>l.id==='rim-overlook')!.position;
    expect(landscape.surfaceAtProperty(entry.x,entry.y,sample()).slope).toBeLessThan(.2);
    expect(landscape.heightAtProperty(overlook.x,overlook.y)-landscape.heightAtProperty(entry.x,entry.y)).toBeGreaterThan(60);
    for(const name of ['lower-sage-bench','rim-overlook']){
      const p=area.landmarks.find(l=>l.id===name)!.position;
      expect(landscape.surfaceAtProperty(p.x,p.y,sample()).slope).toBeLessThan(.35);
    }
  });
  it('keeps a walking corridor clear of solid brows along every mapped route',()=>{
    const blockers=chukarBrowBlockers(area);
    for(const trail of area.trails)for(let i=1;i<trail.points.length;i++){
      const a=trail.points[i-1],b=trail.points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      for(const rock of blockers){
        const t=Math.max(0,Math.min(1,((rock.x-a.x)*dx+(rock.y-a.y)*dy)/(length*length)));
        const clearance=Math.hypot(a.x+dx*t-rock.x,a.y+dy*t-rock.y)*PROPERTY_PX_TO_M-rock.radius;
        expect(clearance,`${trail.id} at ${rock.x},${rock.y}`).toBeGreaterThan(1.2);
      }
      for(let along=0;along<=length;along+=4){
        const t=along/length;
        expect(landscape.surfaceAtProperty(a.x+dx*t,a.y+dy*t,sample()).slope,trail.id).toBeLessThan(.75);
      }
    }
  });
  it('stocks real bench cover while keeping solid rock feet out of habitat',()=>{
    for(const brow of chukarBrows(area))expect(area.patches.some(p=>brow.x>=p.x&&brow.x<=p.x+p.w&&brow.y>=p.y&&brow.y<=p.y+p.h),brow.id).toBe(false);
    for(const [x,y] of [[700,550],[900,397],[1000,240]])expect(area.patches.some(p=>x>=p.x&&x<=p.x+p.w&&y>=p.y&&y<=p.y+p.h)).toBe(true);
  });
  it('connects the overlook return to the climb and keeps the tank reachable',()=>{
    const climb=area.trails.find(t=>t.id==='south-switchback')!,loop=area.trails.find(t=>t.id==='rim-return')!;
    expect(climb.points).toContainEqual(loop.points.at(-1));
    expect(area.trails.find(t=>t.id==='tank-traverse')!.points.at(-1)).toEqual(area.landmarks.find(l=>l.id==='area-feature')!.position);
  });
});

describe('Chukar editable rock exports',()=>{
  it.each(['basalt-brow','weathered-shelf','split-shoulder'])('%s exports painted geometry with a cheaper lightweight form',name=>{
    const triangles:number[]=[];
    for(const detail of ['high','lite']){
      const bytes=readFileSync(`public/models/chukar-kit/${name}-${detail}.glb`);
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
      const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
      expect(gltf.meshes).toHaveLength(1);
      const primitives=gltf.meshes[0].primitives;expect(primitives).toHaveLength(1);
      expect(primitives[0].attributes.COLOR_0).toBeDefined();
      expect(primitives[0].attributes.NORMAL).toBeDefined();
      triangles.push(gltf.accessors[primitives[0].indices].count/3);
      expect(bytes.byteLength).toBeLessThan(110_000);
    }
    expect(triangles[0]).toBeLessThan(1500);expect(triangles[1]).toBeLessThan(triangles[0]*.65);
  });
});


describe('Chukar surface polish',()=>{
  it.each(['high','lite'] as const)('keeps the path on actual %s terrain triangles at both distances',quality=>{
    const source=new THREE.BufferGeometry(),positions:number[]=[];
    for(const [x,y] of [[656.3,572.7],[856.3,421.7],[1014.2,357.6]])for(const [dx,dy] of [[0,0],[.65,0],[0,.7]]){
      const p=landscape.propertyToWorld(x+dx,y+dy,{x:0,z:0});positions.push(p.x,0,p.z);
    }
    source.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    source.setAttribute('color',new THREE.Float32BufferAttribute(Array(positions.length/3*4).fill(1),4));
    source.setIndex(Array.from({length:positions.length/3},(_,i)=>i));
    const detail=CHUKAR_GROUND_DETAIL[quality],road=groundQuailTrackGeometry(landscape,source,detail);
    const p=road.getAttribute('position'),far=road.getAttribute('quailFarGround');
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),ray=new THREE.Raycaster();
    for(const level of ['near','far'] as const)for(let i=0;i<p.count;i++){
      const property=landscape.worldToProperty(p.getX(i),p.getZ(i),{x:0,y:0});
      const tile=quailGroundTileAt(landscape,property.x,property.y);
      const geometry=buildQuailTerrainGeometry(landscape,tile.x,tile.y,tile.width,tile.depth,detail[level]);
      const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld(true);
      ray.set(new THREE.Vector3(p.getX(i),1000,p.getZ(i)),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(mesh)[0];expect(hit).toBeDefined();
      expect((level==='near'?p.getY(i):far.getX(i))-hit.point.y).toBeCloseTo(.032,4);geometry.dispose();
    }
    source.dispose();road.dispose();material.dispose();
  });

  it.each([chukarGrassGeometry,chukarSageGeometry])('reduces distant plant geometry while retaining height and spread',make=>{
    const close=make(false),distant=make(true);close.computeBoundingBox();distant.computeBoundingBox();
    const a=close.boundingBox!.getSize(new THREE.Vector3()),b=distant.boundingBox!.getSize(new THREE.Vector3());
    expect(distant.getAttribute('position').count).toBeLessThan(close.getAttribute('position').count*.5);
    expect(close.getAttribute('position').count/3).toBeLessThan(500);
    expect(Math.abs(a.y-b.y)).toBeLessThan(.16);expect(Math.abs(a.x-b.x)).toBeLessThan(.3);expect(Math.abs(a.z-b.z)).toBeLessThan(.3);
    close.dispose();distant.dispose();
  });
});


describe('Chukar eroded horizon',()=>{
  it('keeps distant relief outside the parcel with a continuous join',()=>{
    for(let y=-1000;y<=1800;y+=40){
      expect(chukarDistantRelief(1400,y)).toBe(0);
      expect(chukarDistantRelief(1390,y)).toBe(0);
      expect(chukarDistantRelief(1400.01,y)).toBeLessThan(.001);
    }
    expect(chukarDistantRelief(1830,260)).toBeGreaterThan(70);
  });
  it('samples the same landforms in both tiers within a bounded horizon budget',()=>{
    const b=area.world,totals:number[]=[];
    for(const quality of ['high','lite'] as const){
      let triangles=0;
      for(const [x,y,w,h] of [[b.x-1000,b.y-1000,b.w+2000,1000],[b.x-1000,b.y+b.h,b.w+2000,1000],
        [b.x-1000,b.y,1000,b.h],[b.x+b.w,b.y,1000,b.h]]){
        const geometry=buildChukarHorizonGeometry(landscape,x,y,w,h,CHUKAR_GROUND_DETAIL[quality].horizonSpacing);
        const vertices=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
        for(let i=0;i<vertices.count;i+=37){
          expect(Number.isFinite(vertices.getY(i))).toBe(true);
          expect(Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i))).toBeCloseTo(1,4);
          const property=landscape.worldToProperty(vertices.getX(i),vertices.getZ(i),{x:0,y:0});
          const offset=landscape.heightAtProperty(property.x,property.y)-vertices.getY(i);
          // Either the authoritative surface or the 3 m boundary skirt.
          expect(Math.min(Math.abs(offset),Math.abs(offset-3))).toBeLessThan(.002);
        }
        triangles+=vertices.count/3;geometry.dispose();
      }
      totals.push(triangles);
    }
    expect(totals[0]).toBeLessThan(100_000);expect(totals[1]).toBeLessThan(totals[0]*.5);
  });
});


describe('Chukar route composition',()=>{
  it('gives sheltered benches substantially more sage than the exposed brow opening',()=>{
    const stand=(x:number,y:number)=>{
      const zones=chukarGroundZones(x,y,{talus:0,shelter:0});
      return chukarPlantStandAt(x,y,zones.talus,zones.shelter,{grass:0,sage:0});
    };
    expect(stand(658,556).sage).toBeGreaterThan(stand(762,617).sage+.5);
    expect(stand(959,385).sage).toBeGreaterThan(stand(1024,267).sage+.4);
  });
  it('keeps drainage continuous through bends and fades it at both ends',()=>{
    for(const wash of CHUKAR_WASHES){
      for(const p of [wash.points[0],wash.points.at(-1)!])expect(chukarWashAt(...p)).toBeLessThan(.001);
      for(const p of wash.points.slice(1,-1)){
        expect(chukarWashAt(...p)).toBeGreaterThan(.9);
        expect(Math.abs(chukarWashAt(p[0]-.01,p[1])-chukarWashAt(p[0]+.01,p[1]))).toBeLessThan(.01);
      }
    }
  });
});
