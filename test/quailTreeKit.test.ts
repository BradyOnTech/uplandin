import { afterEach,expect,it,vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadQuailTreeKit,disposeQuailTreeKit } from '../src/three/assets/quailTreeKit';
afterEach(()=>vi.restoreAllMocks());
for(const quality of ['high','lite'] as const)it(`imports only ${quality} tree assets at the existing stand scale`,async()=>{
  const urls:string[]=[];
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async(url)=>{
    urls.push(url);const file=await readFile(new URL('../public/'+url.replace(/^\//,''),import.meta.url));
    return new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
  });
  const kit=await loadQuailTreeKit(quality);
  expect(urls).toHaveLength(3);expect(urls.every(url=>url.endsWith(`-${quality}.glb`))).toBe(true);
  for(const tree of Object.values(kit)) {
    const triangles=tree.trunk.getAttribute('position').count/3+tree.crown.getAttribute('position').count/3;
    expect(triangles).toBe(quality==='high'?2028:1164);
    tree.crown.computeBoundingBox();tree.trunk.computeBoundingBox();
    expect(tree.crown.boundingBox!.max.y).toBeGreaterThan(.95);expect(tree.crown.boundingBox!.max.y).toBeLessThan(1.05);
    expect(tree.trunk.boundingBox!.min.y).toBeGreaterThan(-.02);expect(tree.trunk.boundingBox!.min.y).toBeLessThan(0);
    expect(tree.crown.index).toBeNull();expect(tree.crown.getAttribute('normal')).toBeDefined();
  }disposeQuailTreeKit(kit);
});
