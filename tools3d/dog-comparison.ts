import './dog-comparison.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Dog } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { mulberry32 } from '../src/game/math';
import type { Ctx, Quality, Subsystem } from '../src/three/engine';
import { fieldTimeOfDay } from '../src/three/palette';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';
import { DogSystem } from '../src/three/subsystems/dog';
import { GSP_COATS, type GspCoatId } from '../src/three/dogs/germanShorthairedPointer';
import { ENGLISH_SETTER_COATS, type EnglishSetterCoatId } from '../src/three/dogs/englishSetter';

type Pose = 'stand' | 'point' | 'trot';
type View = 'quarter' | 'side' | 'front' | 'field';
const params = new URLSearchParams(location.search);
// Capture mode changes the legacy renderer's motion law. This comparison
// deliberately uses the normal runtime path on both sides.
if (params.has('capture')) { params.delete('capture'); history.replaceState(null, '', `${location.pathname}?${params}`); }
const choice = <T extends string>(key: string, values: readonly T[], fallback: T): T => values.includes(params.get(key) as T) ? params.get(key) as T : fallback;
let pose = choice('pose', ['stand', 'point', 'trot'], 'stand');
let quality = choice('quality', ['high', 'lite'], 'high');
let light = choice('tod', ['morning', 'noon', 'evening'], 'noon');
let view = choice('view', ['quarter', 'side', 'front', 'field'], 'quarter');
let gspCoat = choice('gsp', GSP_COATS.map(c => c.id), 'liver-white');
let setterCoat = choice('setter', ENGLISH_SETTER_COATS.map(c => c.id), 'orange-belton');
let playing = params.get('paused') !== '1', time = 0, travel = 0;
const stepSeconds = 1 / 60, trotSpeed = 2;
const canvas = document.querySelector<HTMLCanvasElement>('#comparison')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const camera = new THREE.PerspectiveCamera(38, 1, .03, 600);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false; controls.minDistance = 1.8; controls.maxDistance = 14;
controls.minPolarAngle = .15; controls.maxPolarAngle = Math.PI * .49;
const area = getArea('chukar-ridge');
const landscape = new LandscapeModel(area, 'south-gate');
interface Panel {
  element: HTMLElement; scene: THREE.Scene; camera: THREE.PerspectiveCamera; ctx: Ctx;
  system: GeneratedDogSystem | DogSystem; dog: Dog; nodes: THREE.Object3D[];
  sun: THREE.DirectionalLight; fill: THREE.DirectionalLight; hemi: THREE.HemisphereLight;
  floor: THREE.Mesh; grid: THREE.GridHelper;
}
let panels: Panel[] = [];

function makePanel(kind: 'gsp' | 'english-setter'): Panel {
  const scene = new THREE.Scene(), panelCamera = camera.clone();
  const dog = new Dog({ x: 0, y: 0 }, { breed: getBreed(kind), level: 8, ageMult: 1 }, mulberry32(1881));
  dog.heading = Math.PI / 2;
  dog.state = 'heel'; dog.gait = 'still';
  const hunt = {
    areaConfig: () => area, dropPoint: () => landscape.dropPoint, dog: () => dog,
    dogRenderWorld: (_alpha: number, out: { x: number; z: number }) => Object.assign(out, { x: 0, z: travel }),
    dogWorld: (out: { x: number; z: number }) => Object.assign(out, { x: 0, z: travel }),
    dogRenderHeading: () => Math.PI / 2, dogRenderTravelHeading: () => Math.PI / 2,
    huntState: () => ({ areaId: area.id, birds: [{ id: 1, speciesId: 'chukar', pos: { x: 0, y: travel + 3 } }] }),
    simToWorld: (x: number, z: number, out: { x: number; z: number }) => Object.assign(out, { x, z }),
    coverPatches: () => [],
  };
  const terrain = { heightAt: () => 0 };
  const birds = { markingTarget: () => false, groundedTarget: () => false };
  const ctx = { scene, camera: panelCamera, renderer, quality, timeOfDay: light, time: 0, fixedAlpha: 1,
    paused: false, rng: mulberry32(31), events: new EventTarget(),
    get: (id: string) => {
      if (id === 'hunt3d') return hunt;
      if (id === 'terrain') return terrain;
      if (id === 'birds') return birds;
      throw new Error(`Comparison fixture has no subsystem: ${id}`);
    },
  } as unknown as Ctx;
  const sun = new THREE.DirectionalLight(); sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .1, far: 60 });
  sun.shadow.bias = -.00015; sun.shadow.normalBias = .015;
  const fill = new THREE.DirectionalLight(), hemi = new THREE.HemisphereLight();
  scene.add(sun, sun.target, fill, fill.target, hemi);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0x85856e }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(20, 40, 0x656d5b, 0x727861); grid.position.y = .002;
  const gridMaterial = grid.material as THREE.Material; gridMaterial.transparent = true; gridMaterial.opacity = .30; scene.add(grid);
  const before = new Set(scene.children);
  const system = kind === 'gsp' ? new GeneratedDogSystem(gspCoat) : new DogSystem('english-setter', setterCoat);
  system.init(ctx);
  const nodes = scene.children.filter(node => !before.has(node));
  return { element: document.querySelector(kind === 'gsp' ? '#gsp-panel' : '#setter-panel')!, scene, camera: panelCamera,
    ctx, system, dog, nodes, sun, fill, hemi, floor, grid };
}

function setLighting(): void {
  const spec = fieldTimeOfDay(area.id, light);
  renderer.toneMappingExposure = spec.exposure;
  const az = THREE.MathUtils.degToRad(spec.sunAzimuth), el = THREE.MathUtils.degToRad(Math.max(4, spec.sunElevation));
  for (const p of panels) {
    p.ctx.timeOfDay = light;
    p.scene.background = new THREE.Color(spec.skyHorizon);
    p.scene.fog = new THREE.FogExp2(spec.fogColor, .01);
    p.sun.color.setHex(spec.sunColor); p.sun.intensity = spec.sunIntensity;
    p.sun.position.set(Math.sin(az) * Math.cos(el) * 20, Math.sin(el) * 20, travel + Math.cos(az) * Math.cos(el) * 20);
    p.sun.target.position.set(0, 0, travel);
    p.fill.color.setHex(spec.fillColor); p.fill.intensity = spec.fillIntensity;
    p.fill.position.set(-Math.sin(az) * .64 * 20, .77 * 20, travel - Math.cos(az) * .64 * 20);
    p.fill.target.position.set(0, 0, travel);
    p.hemi.color.setHex(spec.ambientSky); p.hemi.groundColor.setHex(spec.ambientGround); p.hemi.intensity = spec.ambientIntensity;
    p.ctx.events.dispatchEvent(new CustomEvent('tod', { detail: light }));
  }
}
function disposePanels(): void {
  for (const p of panels) {
    (p.system as Subsystem).dispose?.(p.ctx);
    p.sun.dispose(); p.fill.dispose(); p.hemi.dispose();
    p.floor.geometry.dispose(); (p.floor.material as THREE.Material).dispose();
    p.grid.geometry.dispose(); (p.grid.material as THREE.Material).dispose();
  }
}
function rebuild(): void {
  disposePanels(); travel = 0; time = 0;
  panels = [makePanel('gsp'), makePanel('english-setter')];
  setLighting(); setView(view);
  // Establish supported standing contact before starting either runtime.
  for (let i = 0; i < 60; i++) advance(stepSeconds, false);
  time = 0; for (const p of panels) p.ctx.time = 0;
  applyPose();
  settlePausedSelection();
  updateLinks(); updateControls();
}
function applyPose(): void {
  for (const p of panels) {
    p.dog.state = pose === 'point' ? 'pointing' : pose === 'trot' ? 'quartering' : 'heel';
    p.dog.gait = pose === 'trot' ? 'trot' : 'still';
    p.dog.pointedBirdId = pose === 'point' ? 1 : null;
    p.dog.scentStage = 'none'; p.dog.scentProgress = 0;
  }
}
function settlePausedSelection(): void {
  // Selecting a pose while paused must update the visible dogs as well as
  // the buttons. Advance both real controllers equally through the blend.
  if (!playing) for (let i = 0; i < 48; i++) advance(stepSeconds);
}
function advance(dt: number, move = true): void {
  const delta = move && pose === 'trot' ? trotSpeed * dt : 0;
  time += dt; travel += delta;
  camera.position.z += delta; controls.target.z += delta;
  for (const p of panels) {
    p.ctx.time = time; p.dog.pos.y = travel;
    p.system.update(p.ctx, dt);
    p.sun.position.z += delta; p.sun.target.position.z += delta;
    p.fill.position.z += delta; p.fill.target.position.z += delta;
    p.grid.position.z = Math.floor(travel / .5) * .5;
  }
}
function setView(value: View): void {
  view = value;
  const offsets: Record<View, [number, number, number]> = {
    quarter: [2.5, 1.05, 2.6], side: [3.3, .92, .02], front: [0, .93, 3.3], field: [4.6, 1.62, 6.55],
  };
  camera.position.set(...offsets[view]); camera.position.z += travel;
  camera.fov = view === 'field' ? 70 : 38; camera.updateProjectionMatrix();
  controls.target.set(0, .40, travel + .06); controls.update();
}
function syncURL(): void {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ pose, quality, tod: light, view, gsp: gspCoat, setter: setterCoat })) url.searchParams.set(key, value);
  if (playing) url.searchParams.delete('paused'); else url.searchParams.set('paused', '1');
  history.replaceState(null, '', url);
}
function updateLinks(): void {
  for (const [id, breed, coat] of [['play-gsp', 'gsp', gspCoat], ['play-setter', 'english-setter', setterCoat]]) {
    const url = new URL('../index3d.html', location.href);
    url.search = new URLSearchParams({ area: 'quail-fields', drop: 'south-gate', quality, tod: light, dog: 'generated', breed, coat,
      challenge: 'relaxed', seed: '1184004868' }).toString();
    document.querySelector<HTMLAnchorElement>(`#${id}`)!.href = url.href;
  }
}
function updateControls(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pose === pose)));
  document.querySelector<HTMLButtonElement>('#motion')!.textContent = playing ? 'Pause' : 'Play';
  document.querySelector<HTMLButtonElement>('#motion')!.setAttribute('aria-pressed', String(playing));
  document.querySelector('#status')!.textContent = `${pose === 'stand' ? 'Standing at heel' : pose === 'point' ? 'Steady point · target 3 m ahead' : 'Trot · shared 2 m/s travel'} · ${quality === 'lite' ? 'Lightweight' : 'High'} · ${light} light`;
  syncURL();
}
for (const [id, values, value] of [['gsp-coat', GSP_COATS, gspCoat], ['setter-coat', ENGLISH_SETTER_COATS, setterCoat]] as const) {
  const select = document.querySelector<HTMLSelectElement>(`#${id}`)!;
  for (const coat of values) select.add(new Option(coat.label, coat.id)); select.value = value;
}
for (const [id, value] of [['view', view], ['light', light], ['quality', quality]]) document.querySelector<HTMLSelectElement>(`#${id}`)!.value = value;
document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(button => button.addEventListener('click', () => { pose = button.dataset.pose as Pose; applyPose(); settlePausedSelection(); updateControls(); }));
document.querySelector('#motion')!.addEventListener('click', () => { playing = !playing; updateControls(); });
document.querySelector('#step')!.addEventListener('click', () => { playing = false; advance(stepSeconds); updateControls(); });
document.querySelector('#restart')!.addEventListener('click', rebuild);
document.querySelector<HTMLSelectElement>('#view')!.addEventListener('change', e => { setView((e.target as HTMLSelectElement).value as View); syncURL(); });
document.querySelector<HTMLSelectElement>('#light')!.addEventListener('change', e => { light = (e.target as HTMLSelectElement).value as typeof light; setLighting(); updateLinks(); updateControls(); });
document.querySelector<HTMLSelectElement>('#quality')!.addEventListener('change', e => { quality = (e.target as HTMLSelectElement).value as Quality; rebuild(); });
document.querySelector<HTMLSelectElement>('#gsp-coat')!.addEventListener('change', e => { gspCoat = (e.target as HTMLSelectElement).value as GspCoatId; rebuild(); });
document.querySelector<HTMLSelectElement>('#setter-coat')!.addEventListener('change', e => { setterCoat = (e.target as HTMLSelectElement).value as EnglishSetterCoatId; rebuild(); });
let previous = performance.now(), accumulator = 0, raf = 0;
function frame(now: number): void {
  const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now;
  if (playing && !document.hidden) { accumulator += dt; while (accumulator >= stepSeconds) { advance(stepSeconds); accumulator -= stepSeconds; } }
  else accumulator = 0;
  controls.update();
  const bounds = stage.getBoundingClientRect();
  const width = Math.round(bounds.width), height = Math.round(bounds.height);
  if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) renderer.setSize(width, height, false);
  renderer.setScissorTest(true);
  for (const p of panels) {
    const box = p.element.getBoundingClientRect(), w = Math.round(box.width), h = Math.round(box.height);
    p.camera.position.copy(camera.position); p.camera.quaternion.copy(camera.quaternion); p.camera.fov = camera.fov;
    p.camera.aspect = w / h; p.camera.updateProjectionMatrix();
    const left = Math.round(box.left - bounds.left), bottom = height - Math.round(box.bottom - bounds.top);
    renderer.setViewport(left, bottom, w, h); renderer.setScissor(left, bottom, w, h); renderer.render(p.scene, p.camera);
  }
  raf = requestAnimationFrame(frame);
}
rebuild(); raf = requestAnimationFrame(frame);
const review = {
  setPose(value: Pose) { pose = value; applyPose(); settlePausedSelection(); updateControls(); },
  advance(seconds: number) { playing = false; for (let i = 0; i < Math.round(seconds / stepSeconds); i++) advance(stepSeconds); updateControls(); },
  state() {
    const generated = (window as unknown as { __generatedDogAudit?: () => { feet: { i: number; groundGap: number }[] } }).__generatedDogAudit?.();
    return { pose, quality, light, playing, time, travel, speed: pose === 'trot' ? trotSpeed : 0,
      renderers: panels.map((p, i) => ({ breed: i === 0 ? 'gsp' : 'english-setter', source: p.system.constructor.name,
        scale: p.nodes.find(n => n.name === 'english-setter-root')?.scale.toArray() ?? [1, 1, 1],
        state: p.dog.state, gait: p.dog.gait, camera: p.camera.position.toArray(), fov: p.camera.fov,
        paws: i === 0 ? generated?.feet.map(foot => ({ i: foot.i, gap: foot.groundGap, supporting: pose === 'trot' ? null : pose !== 'point' || foot.i !== 0 }))
          : ['fore-paw-l', 'fore-paw-r', 'hind-paw-l', 'hind-paw-r'].map((id, foot) => {
            const sole = p.nodes.map(node => node.getObjectByName(`${id}__sole`)).find(Boolean);
            if (!sole) throw new Error(`Missing runtime sole marker: ${id}`);
            const world = sole.getWorldPosition(new THREE.Vector3());
            return { i: foot, gap: world.y, supporting: pose === 'trot' ? null : pose !== 'point' || foot !== 0 };
          }),
        meshes: p.nodes.reduce((count, node) => { node.traverse(n => { if ((n as THREE.Mesh).isMesh) count++; }); return count; }, 0) })) };
  },
};
Object.assign(window, { dogComparison: review, dogComparisonReady: true });
addEventListener('pagehide', event => {
  // A history-cache return resumes this same page and its live resources.
  if (event.persisted) return;
  cancelAnimationFrame(raf); controls.dispose(); disposePanels(); renderer.dispose();
});
addEventListener('pageshow', () => { previous = performance.now(); accumulator = 0; });
