import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { LandscapeModel } from '../../game/landscape';
import type { AreaConfig } from '../../game/areas';
import { quailCoverAt } from '../../game/quailLandscape';
import { QUAIL_COVERTS, quailOpeningAt } from '../../game/quailComposition';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { quailTrackDistanceAt } from './quailTracks';
import { sampleQuailGroundHeights } from './quailGroundGeometry';
import { applyQuailFoliageLight, QuailFoliageInstances } from './quailFoliage';

/** Authored refuge clumps share the hunting cover from the entries to the
 * windmill and return. Three accepted assets retain six material batches. */
export function quailKitPlacements(area: AreaConfig) {
  if (area.id !== 'quail-fields') return [];
  const rng = mulberry32(95312);
  const centers = [
    [483,613,6],[478,600,6],[480,585,6],[523,583,6],
    // Unequal groups connect the first edge to the second covert and draw.
    // All candidates still pass the authoritative habitat and track checks.
    [541,580,4],[555,574,5],[579,563,3],
    [609,410,3],[615,389,5],[641,355,4],[650,338,3],
  ];
  // Four unequal bushes at each change in the outer covert's direction make
  // the working edge legible at eye height. Keep the detailed kit bounded;
  // lighter procedural shoots join these groups between the anchors.
  for (const covert of QUAIL_COVERTS) {
    if (covert.id === 'south-plum-edge') continue;
    // Give the main working loop the larger refuge masses. Two remote
    // northern groups fund the windmill end-cap within the same root budget.
    // The old fence line gets one small group; its plums are mostly procedural.
    if (covert.id === 'old-fence-plum') { centers.push([covert.points[1].x - 2, covert.points[1].y, 2]); continue; }
    const points = covert.id === 'north-field-plum' ? covert.points.slice(1, 2)
      : covert.id === 'windmill-plum' ? covert.points : covert.points.slice(0, -1);
    for (const [i, point] of points.entries()) {
      if (centers.some(([x, y]) => Math.hypot(x - point.x, y - point.y) < 14)) continue;
      const endCap = covert.id === 'windmill-plum' && (i === 0 || i === points.length - 1);
      centers.push([point.x, point.y, endCap ? 6 : 4, endCap ? 1.3 : 1.18]);
    }
  }
  const placements: { x: number; y: number; angle: number; scale: number; habit: string }[] = [];
  for (const [x,y,count,emphasis=1] of centers) for (let i=0;i<count;i++) {
    const angle=i*2.39996, radius=Math.sqrt(i)*1.45;
    const px=x+Math.cos(angle)*radius,py=y+Math.sin(angle)*radius;
    const scale=emphasis===1 ? .85+rng()*.36 : (.95+rng()*.22)*emphasis;
    if (quailCoverAt(area,px,py)<.9 || quailTrackDistanceAt(area,px,py,16)<5 || quailOpeningAt(px,py)>.3) continue;
    placements.push({x:px,y:py,angle:rng()*Math.PI*2,scale,habit:i===0?'tall':i%3===0?'open':'low'});
  }
  return placements;
}
type KitPlacement = ReturnType<typeof quailKitPlacements>[number];
const placementCache = new WeakMap<AreaConfig, Map<string, KitPlacement[]>>();
const KIT_CELL = 16;
export function quailKitOccupies(area: AreaConfig,x: number,y: number): boolean {
  let cells=placementCache.get(area);
  if(!cells){
    cells=new Map();
    for(const p of quailKitPlacements(area)){
      const radius=2.5*p.scale;
      for(let cy=Math.floor((p.y-radius)/KIT_CELL);cy<=Math.floor((p.y+radius)/KIT_CELL);cy++)
        for(let cx=Math.floor((p.x-radius)/KIT_CELL);cx<=Math.floor((p.x+radius)/KIT_CELL);cx++){
          const key=`${cx},${cy}`,cell=cells.get(key)??[];cell.push(p);cells.set(key,cell);
        }
    }
    placementCache.set(area,cells);
  }
  return (cells.get(`${Math.floor(x/KIT_CELL)},${Math.floor(y/KIT_CELL)}`)??[]).some(p=>(p.x-x)**2+(p.y-y)**2<(2.5*p.scale)**2);
}

export class QuailKitSystem implements Subsystem {
  readonly id='quail-kit';
  private group=new THREE.Group();
  private geometries: THREE.BufferGeometry[]=[];
  private materials=new Map<string,THREE.MeshLambertMaterial>();
  private batches: THREE.InstancedMesh[]=[];
  private foliageInstances: QuailFoliageInstances[]=[];
  private frustum=new THREE.Frustum();
  private projectionView=new THREE.Matrix4();
  constructor(private landscape: LandscapeModel) {}
  async init(ctx: Ctx) {
    const placements=quailKitPlacements(this.landscape.area);
    const loader=new GLTFLoader();
    const habits=['open','low','tall'];
    const results=await Promise.allSettled(habits.map(habit=>loader.loadAsync(`${import.meta.env.BASE_URL}models/quail-kit/sand-plum-${habit}-${ctx.quality}.glb`)));
    const release=(scene: THREE.Object3D)=>scene.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material]) material.dispose();}});
    try {
      const failure=results.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
      for(let h=0;h<habits.length;h++) {
        const result=results[h];if(result.status!=='fulfilled')continue;
        const source=result.value.scene;source.updateMatrixWorld(true);
        const selected=placements.filter(p=>p.habit===habits[h]);
        source.traverse(node=>{
          if(!(node instanceof THREE.Mesh)||!selected.length)return;
          const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld);this.geometries.push(geometry);
          const sourceMaterial=node.material as THREE.MeshStandardMaterial;
          let material=this.materials.get(sourceMaterial.name);
          if(!material){material=new THREE.MeshLambertMaterial({color:sourceMaterial.color,flatShading:true});if(sourceMaterial.name.includes('olive'))applyQuailFoliageLight(material);this.materials.set(sourceMaterial.name,material);}
          const batch=new THREE.InstancedMesh(geometry,material,selected.length),transform=new THREE.Object3D();
          const world={x:0,z:0};
          selected.forEach((p,i)=>{this.landscape.propertyToWorld(p.x,p.y,world);transform.position.set(world.x,sampleQuailGroundHeights(this.landscape,p.x,p.y).nearY,world.z);transform.rotation.y=p.angle;transform.scale.set(p.scale*1.25,p.scale,p.scale*1.18);transform.updateMatrix();batch.setMatrixAt(i,transform.matrix);});
          batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();batch.castShadow=true;batch.receiveShadow=true;this.group.add(batch);this.batches.push(batch);
          this.foliageInstances.push(new QuailFoliageInstances(batch));
        });
      }
      this.group.name='Quail connected sand-plum coverts';ctx.scene.add(this.group);
    } finally {for(const result of results)if(result.status==='fulfilled')release(result.value.scene);}
  }
  update(ctx: Ctx) {
    ctx.camera.updateMatrixWorld();
    this.projectionView.multiplyMatrices(ctx.camera.projectionMatrix,ctx.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionView);
    this.foliageInstances.forEach(batch=>batch.update(this.frustum));
  }
  dispose() {this.group.removeFromParent();this.batches.forEach(b=>b.dispose());this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.batches=[];this.foliageInstances=[];this.geometries=[];this.materials.clear();}
}
