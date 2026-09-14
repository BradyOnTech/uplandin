import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Quality } from '../engine';

export const CHUKAR_KIT_NAMES=['basalt-brow','weathered-shelf','split-shoulder'] as const;

/** The saved Blender metres become a common unit box for authored formation
 * dimensions. Materials are replaced by the shared game lighting material. */
export async function loadChukarKit(quality:Quality):Promise<THREE.BufferGeometry[]> {
  const loader=new GLTFLoader();
  const results=await Promise.allSettled(CHUKAR_KIT_NAMES.map(name=>loader.loadAsync(`${import.meta.env.BASE_URL}models/chukar-kit/${name}-${quality}.glb`)));
  const geometries:THREE.BufferGeometry[]=[];
  try {
    const failed=results.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
    for(const result of results){
      if(result.status!=='fulfilled')continue;
      const root=result.value.scene;root.updateMatrixWorld(true);const parts:THREE.Mesh[]=[];
      root.traverse(object=>{if(object instanceof THREE.Mesh)parts.push(object);});
      if(parts.length!==1)throw Error('Chukar kit requires one painted mesh per rock');
      const mesh=parts[0],geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      geometries.push(geometry);geometry.computeBoundingBox();
      const box=geometry.boundingBox!,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      geometry.translate(-center.x,-box.min.y,-center.z);geometry.scale(1/size.x,1/size.y,1/size.z);
      geometry.deleteAttribute('uv');geometry.computeBoundingSphere();
      geometry.userData={kind:'chukar-authored-basalt',triangles:(geometry.index?.count??geometry.getAttribute('position').count)/3};
      if(!geometry.hasAttribute('color'))throw Error('Chukar rock is missing its painted colors');
    }
    return geometries;
  }catch(error){geometries.forEach(geometry=>geometry.dispose());throw error;}
  finally{
    for(const result of results)if(result.status==='fulfilled')result.value.scene.traverse(object=>{
      if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}
    });
  }
}
