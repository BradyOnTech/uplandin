import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { LandscapeModel } from '../../game/landscape';
import type { AreaConfig } from '../../game/areas';
import { quailCoverAt } from '../../game/quailLandscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { quailTrackDistanceAt } from './quailTracks';
import { sampleQuailGroundHeights } from './quailGroundGeometry';
import { applyQuailFoliageLight, QuailFoliageInstances } from './quailFoliage';

/** Small authored thickets inside existing habitat, leaving the track and crossing open. */
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
  const placements: { x: number; y: number; angle: number; scale: number; habit: string }[] = [];
  for (const [x,y,count] of centers) for (let i=0;i<count;i++) {
    const angle=i*2.39996, radius=Math.sqrt(i)*1.45;
    const px=x+Math.cos(angle)*radius,py=y+Math.sin(angle)*radius;
    const scale=.78+rng()*.28;
    if (quailCoverAt(area,px,py)<.9 || quailTrackDistanceAt(area,px,py,16)<4) continue;
    placements.push({x:px,y:py,angle:rng()*Math.PI*2,scale,habit:i===0?'tall':i%3===0?'open':'low'});
  }
  return placements;
}
const placementCache = new WeakMap<AreaConfig, ReturnType<typeof quailKitPlacements>>();
export function quailKitOccupies(area: AreaConfig,x: number,y: number): boolean {
  let placements=placementCache.get(area);if(!placements){placements=quailKitPlacements(area);placementCache.set(area,placements);}
  return placements.some(p=>(p.x-x)**2+(p.y-y)**2<2.5**2);
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
          selected.forEach((p,i)=>{this.landscape.propertyToWorld(p.x,p.y,world);transform.position.set(world.x,sampleQuailGroundHeights(this.landscape,p.x,p.y).nearY,world.z);transform.rotation.y=p.angle;transform.scale.setScalar(p.scale);transform.updateMatrix();batch.setMatrixAt(i,transform.matrix);});
          batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();batch.castShadow=true;batch.receiveShadow=true;this.group.add(batch);this.batches.push(batch);
          this.foliageInstances.push(new QuailFoliageInstances(batch));
        });
      }
      this.group.name='South Gate sand-plum thickets';ctx.scene.add(this.group);
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
