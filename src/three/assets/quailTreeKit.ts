import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Quality } from '../engine';
export type QuailTreeHabit='upright'|'spreading'|'leaning';
export type QuailTreeKit=Record<QuailTreeHabit,{trunk:THREE.BufferGeometry;crown:THREE.BufferGeometry}>;
export function disposeQuailTreeKit(kit:QuailTreeKit){for(const entry of Object.values(kit)){entry.trunk.dispose();entry.crown.dispose();}}

/** Normalize the editable eight-metre kit to the stand's existing scale contract. */
export async function loadQuailTreeKit(quality:Quality):Promise<QuailTreeKit>{
  const loader=new GLTFLoader(),habits:QuailTreeHabit[]=['upright','spreading','leaning'];
  const results=await Promise.allSettled(habits.map(habit=>loader.loadAsync(`${import.meta.env.BASE_URL}models/quail-kit/field-tree-${habit}-${quality}.glb`)));
  const kit={} as QuailTreeKit,owned:THREE.BufferGeometry[]=[];
  try {
    const failed=results.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
    results.forEach((result,i)=>{
      if(result.status!=='fulfilled')return;
      const root=result.value.scene;root.updateMatrixWorld(true);const parts:Partial<QuailTreeKit[QuailTreeHabit]>={};
      root.traverse(node=>{
        if(!(node instanceof THREE.Mesh))return;
        const part=node.name.includes('trunk')?'trunk':node.name.includes('crown')?'crown':null;
        if(!part)throw Error(`Unexpected tree component: ${node.name}`);
        if(parts[part])throw Error(`Duplicate tree component: ${part}`);
        const transformed=node.geometry.clone().applyMatrix4(node.matrixWorld);transformed.scale(1/8,1/8,1/8);
        const geometry=transformed.index?transformed.toNonIndexed():transformed;
        if(geometry!==transformed)transformed.dispose();
        geometry.deleteAttribute('uv');owned.push(geometry);parts[part]=geometry;
      });
      if(!parts.trunk||!parts.crown)throw Error(`Incomplete tree: ${habits[i]}`);
      kit[habits[i]]={trunk:parts.trunk,crown:parts.crown};
    });
    return kit;
  }catch(error){owned.forEach(g=>g.dispose());throw error;}
  finally{for(const result of results)if(result.status==='fulfilled')result.value.scene.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();for(const m of Array.isArray(node.material)?node.material:[node.material])m.dispose();}});}
}
