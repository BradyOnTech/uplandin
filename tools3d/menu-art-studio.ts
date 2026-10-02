/** Authoring-only UI: produces menu images from the actual runtime assets. */
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { getBreed } from '../src/game/breeds';
import { LandscapeModel } from '../src/game/landscape';
import { Dog } from '../src/game/dog';
import { mulberry32 } from '../src/game/math';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';
import { createGeneratedGsp } from '../src/three/dogs/generatedGsp';
import { createSportingShotgun } from '../src/three/assets/shotgun';
import type { Ctx } from '../src/three/engine';
const frame = document.querySelector<HTMLIFrameElement>('#world')!, canvas = document.querySelector<HTMLCanvasElement>('#model')!;
const status = document.querySelector('#status')!, preview = document.querySelector<HTMLImageElement>('#preview')!, save = document.querySelector<HTMLAnchorElement>('#save')!;
let id = '', api: any, scene: THREE.Scene | undefined, camera: THREE.PerspectiveCamera | undefined;
let dispose: (() => void) | undefined;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(900, 600, false); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const views: Record<string, { position: [number, number]; toward: [number, number]; pitch: number; light: string }> = {
  'quail-fields': { position: [882, 300], toward: [828, 217], pitch: -3, light: 'morning' },
  'pheasant-coverts': { position: [220, 480], toward: [555, 441], pitch: -2, light: 'morning' },
  'chukar-ridge': { position: [700, 620], toward: [820, 578], pitch: 5, light: 'morning' },
  'sharptail-prairie': { position: [604, 678], toward: [760, 435], pitch: -2, light: 'noon' },
};
function reset(next: string) { id = next; api = undefined; dispose?.(); dispose = undefined; preview.hidden = save.hidden = true; frame.hidden = true; canvas.hidden = true; status.textContent = 'Preparing ' + id; }
document.querySelectorAll<HTMLButtonElement>('[data-area]').forEach(button => button.onclick = () => {
  reset(button.dataset.area!); scene = undefined; frame.hidden = false;
  frame.src = `../index3d.html?area=${id}&quality=high&tod=${views[id].light}&capture=1&dog=generated&seed=7701`;
});
frame.onload = async () => {
  if (frame.hidden || frame.src === 'about:blank') return;
  const target = frame.contentWindow as any;
  for (let i = 0; i < 300 && !target.__ready3d; i++) await new Promise(resolve => setTimeout(resolve, 100));
  if (!target.__ready3d) { status.textContent = 'World did not become ready.'; return; }
  api = target.__api3d; api.pause(true); target.__gunAudit?.setVisible(false);
  const area = getArea(id), view = { ...views[id] }, landscape = new LandscapeModel(area);
  if (id === 'pheasant-coverts') { const slough = area.landmarks.find(l => l.id === 'south-slough')!.position; view.position = [slough.x - 35, slough.y + 43]; view.toward = [slough.x + 44, slough.y - 16]; view.pitch = -3; }
  const p = landscape.propertyToWorld(...view.position, { x: 0, z: 0 });
  api.setPose(p.x, p.z, -Math.atan2(view.toward[0] - view.position[0], -(view.toward[1] - view.position[1])) * 180 / Math.PI, view.pitch);
  api.renderOnce(); status.textContent = `${id} ready. Render artwork to export.`;
};
function studio(next: string) {
  reset(next); frame.src = 'about:blank'; canvas.hidden = false; renderer.setSize(900, 600, false); canvas.style.height = '600px'; scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe5ebec, 0x756e50, 2));
  const key = new THREE.DirectionalLight(0xffe3b5, 3); key.position.set(-3, 6, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xd6e8ed, 1.9); fill.position.set(4, 3, -3); scene.add(fill);
  camera = new THREE.PerspectiveCamera(32, 1.5, .02, 100);
}
function show() { renderer.render(scene!, camera!); status.textContent = `${id} ready. Render artwork to export.`; }
document.querySelectorAll<HTMLButtonElement>('[data-gun]').forEach(button => button.onclick = () => {
  studio('guns/' + button.dataset.gun!);
  const model = createSportingShotgun(button.dataset.gun === 'remington-870' ? 'pump' : button.dataset.gun as any, { hands: false });
  scene!.add(model.root); dispose = () => model.dispose();
  renderer.setSize(900, 300, false); canvas.style.height = '300px'; camera!.aspect = 3; camera!.fov = 16; camera!.updateProjectionMatrix();
  camera!.position.set(1.9, .28, .22); camera!.lookAt(0, -.03, -.12); show();
});
document.querySelectorAll<HTMLButtonElement>('[data-dog]').forEach(button => button.onclick = () => {
  studio('dogs/' + button.dataset.dog!);
  if (button.dataset.dog === 'gsp') {
    const dog = createGeneratedGsp('high', false, 'liver-white'); dog.setPose('point'); scene!.add(dog.root); dispose = () => dog.dispose();
  } else {
    const dog = new Dog({ x: 0, y: 0 }, { breed: getBreed('english-setter'), level: 8, ageMult: 1 }, mulberry32(18));
    dog.heading = Math.PI / 2; dog.state = 'pointing'; dog.gait = 'still'; dog.pointedBirdId = 1;
    const hunt = { areaConfig: () => getArea('quail-fields'), dog: () => dog, dogRenderWorld: (_: number, out: any) => Object.assign(out, {x:0,z:0}), dogWorld: (out:any) => Object.assign(out,{x:0,z:0}), dogRenderHeading: () => Math.PI/2, dogRenderTravelHeading: () => Math.PI/2, huntState: () => ({birds:[{id:1,speciesId:'bobwhite',pos:{x:0,y:3}}]}), simToWorld: (x:number,z:number,out:any) => Object.assign(out,{x,z}), coverPatches:()=>[] };
    const terrain = { heightAt: () => 0 }, birds = { markingTarget:()=>false,groundedTarget:()=>false };
    const ctx = { scene, camera, renderer, quality:'high',timeOfDay:'noon',time:0,fixedAlpha:1,paused:false,rng:mulberry32(31),events:new EventTarget(),get:(id:string)=> id==='hunt3d'?hunt:id==='terrain'?terrain:birds } as unknown as Ctx;
    // The field setter: faceted look on the skinned rig.
    const system = new GeneratedDogSystem('orange-belton', 0, 'faceted'); system.init(ctx);
    for (let i=0;i<60;i++) { ctx.time += 1/60; system.update(ctx,1/60); }
    dispose = () => system.dispose();
  }
  camera!.fov = 36; camera!.updateProjectionMatrix(); camera!.position.set(1.7, 1.05, 1.4); camera!.lookAt(0, .52, 0); show();
});
document.querySelector<HTMLButtonElement>('#export')!.onclick = () => {
  let source: HTMLCanvasElement;
  if (api) { api.renderOnce(); source = frame.contentDocument!.querySelector('canvas')!; }
  else if (scene && camera) { renderer.render(scene,camera); source = canvas; }
  else return;
  const url = source.toDataURL('image/webp', .88); preview.src = url; preview.hidden = false; save.href = url; save.download = id.replaceAll('/','-') + '.webp'; save.hidden = false;
  status.textContent = `Artwork rendered: ${source.width} × ${source.height}.`;
};
