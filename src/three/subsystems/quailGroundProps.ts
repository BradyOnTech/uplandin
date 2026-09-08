import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LandscapeModel } from '../../game/landscape';
import type { Ctx, Subsystem } from '../engine';
import { sampleQuailGroundHeights } from './quailGroundGeometry';

/** Authored property coordinates, shared by rendering and hunter obstacles. */
export const QUAIL_GROUND_PROPS = [
  { habit: 'slab', x: 490, y: 620, angle: .4, scale: .8 },
  { habit: 'split-log', x: 487, y: 616, angle: 1.1, scale: 1 },
  { habit: 'fallen-limb', x: 488, y: 613, angle: -.2, scale: .85 },
  { habit: 'slab', x: 529, y: 505, angle: -.7, scale: 1.1 },
  { habit: 'slab', x: 531, y: 503, angle: .3, scale: .6 },
  { habit: 'split-log', x: 630, y: 340, angle: .8, scale: .9 },
  { habit: 'fallen-limb', x: 626, y: 342, angle: -1.2, scale: 1 },
  { habit: 'slab', x: 635, y: 338, angle: .5, scale: .85 },
] as const;

/** Small root clearance follows each prop rather than mowing a circular patch. */
export function quailGroundPropOccupies(x: number,y: number,margin = .4): boolean {
  return QUAIL_GROUND_PROPS.some(p=>{
    const dx=(x-p.x)*.9144,dz=(y-p.y)*.9144,c=Math.cos(p.angle),s=Math.sin(p.angle);
    const u=dx*c-dz*s,v=dx*s+dz*c;
    return Math.abs(u)<(p.habit==='slab'?.95:1.3)*p.scale+margin && Math.abs(v)<(p.habit==='fallen-limb'?.7:.5)*p.scale+margin;
  });
}

export function quailGroundPropObstacles(landscape: LandscapeModel) {
  if (landscape.area.id !== 'quail-fields') return [];
  return QUAIL_GROUND_PROPS.flatMap(p => {
    const world = landscape.propertyToWorld(p.x,p.y,{x:0,z:0});
    // Overlapping discs follow the solid trunk/slab. Small twig ends remain
    // passable rather than giving sparse limbs a large invisible boundary.
    const length = p.habit === 'slab' ? .55 : .9;
    const radius = (p.habit === 'slab' ? .42 : .18) * p.scale;
    return [-1,-.5,0,.5,1].map(t => ({x:world.x+Math.cos(p.angle)*t*length*p.scale,
      z:world.z-Math.sin(p.angle)*t*length*p.scale,radius}));
  });
}

/** A small authored prop group, baked once onto the actual near terrain. */
export class QuailGroundPropsSystem implements Subsystem {
  readonly id = 'quail-ground-props';
  private root = new THREE.Group();
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  constructor(private landscape: LandscapeModel) {}
  async init(ctx: Ctx) {
    const loader = new GLTFLoader();
    const habits = ['slab','split-log','fallen-limb'];
    const results = await Promise.allSettled(habits.map(h => loader.loadAsync(`${import.meta.env.BASE_URL}models/quail-kit/ground-prop-${h}-${ctx.quality}.glb`)));
    const batches = new Map<string,{material:THREE.MeshLambertMaterial;parts:THREE.BufferGeometry[]}>();
    try {
      const failure=results.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
      results.forEach((result,h) => {
        if(result.status!=='fulfilled')return;
        result.value.scene.updateMatrixWorld(true);
        result.value.scene.traverse(node => {
          if(!(node instanceof THREE.Mesh))return;
          const source=node.material as THREE.MeshStandardMaterial;
          let batch=batches.get(source.name);
          if(!batch){batch={material:new THREE.MeshLambertMaterial({color:source.color,flatShading:true}),parts:[]};batches.set(source.name,batch);this.materials.push(batch.material);}
          for(const p of QUAIL_GROUND_PROPS.filter(p=>p.habit===habits[h])) {
            const world=this.landscape.propertyToWorld(p.x,p.y,{x:0,z:0});
            const transform=new THREE.Matrix4().compose(new THREE.Vector3(world.x,0,world.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.angle),new THREE.Vector3().setScalar(p.scale));
            const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld).applyMatrix4(transform);
            const positions=geometry.getAttribute('position');
            for(let i=0;i<positions.count;i++) {
              const property=this.landscape.worldToProperty(positions.getX(i),positions.getZ(i),{x:0,y:0});
              positions.setY(i,positions.getY(i)+sampleQuailGroundHeights(this.landscape,property.x,property.y).nearY);
            }
            geometry.computeVertexNormals();batch.parts.push(geometry);
          }
        });
      });
      for(const batch of batches.values()) {
        const geometry=mergeGeometries(batch.parts);if(!geometry)throw new Error('Ground prop geometry merge failed');
        this.geometries.push(geometry);const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);
      }
      this.root.name='Quail edge and draw ground props';ctx.scene.add(this.root);
    } finally {
      batches.forEach(b=>b.parts.forEach(g=>g.dispose()));
      for(const r of results)if(r.status==='fulfilled')r.value.scene.traverse(n=>{if(n instanceof THREE.Mesh){n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material])m.dispose();}});
    }
  }
  dispose(){this.root.removeFromParent();this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.root.clear();this.geometries=[];this.materials=[];}
}
