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
import { GSP_COATS, type GspCoatId } from '../src/three/dogs/germanShorthairedPointer';
import { ENGLISH_SETTER_COATS, type EnglishSetterCoatId } from '../src/three/dogs/englishSetter';

const poses = ['stand', 'point', 'walk', 'trot', 'canter', 'run', 'paces'] as const;
type Pose = typeof poses[number];
const paceSpeeds = { walk: .8, trot: 2, canter: 3.6, run: 5.5 } as const;
const isTravel = (value: Pose): boolean => value !== 'stand' && value !== 'point';
// A repeating, staged speed ramp exercises normal runtime gait selection.
// These are travel inputs; the viewer never overrides rendered footfalls.
const paceKeys = [[0, 0], [1, 0], [3, .8], [6, .8], [8, 2], [11, 2], [13, 3.6], [16, 3.6], [18, 5.5], [21, 5.5], [24, .8], [27, .8], [29, 0], [31, 0]] as const;
function sequenceSpeed(seconds: number): number {
  const t = seconds % 31;
  for (let i = 1; i < paceKeys.length; i++) {
    const [end, b] = paceKeys[i], [start, a] = paceKeys[i - 1];
    if (t <= end) { const u = (t - start) / (end - start); return a + (b - a) * u * u * (3 - 2 * u); }
  }
  return 0;
}
type View = 'quarter' | 'side' | 'front' | 'rear' | 'rear-quarter' | 'field';
const params = new URLSearchParams(location.search);
// Capture mode pins the dog's motion to explicit hunt ticks. This comparison
// deliberately uses the normal runtime path for every panel.
if (params.has('capture')) { params.delete('capture'); history.replaceState(null, '', `${location.pathname}?${params}`); }
const choice = <T extends string>(key: string, values: readonly T[], fallback: T): T => values.includes(params.get(key) as T) ? params.get(key) as T : fallback;
let pose = choice('pose', poses, 'stand');
let quality = choice('quality', ['high', 'lite'], 'high');
let light = choice('tod', ['morning', 'noon', 'evening'], 'noon');
let view = choice('view', ['quarter', 'side', 'front', 'rear', 'rear-quarter', 'field'], 'quarter');
let gspCoat = choice('gsp', GSP_COATS.map(c => c.id), 'liver-white');
let setterCoat = choice('setter', ENGLISH_SETTER_COATS.map(c => c.id), 'orange-belton');
type Breed = 'gsp' | 'english-setter';
type Style = 'smooth' | 'faceted';
// Both looks for both breeds, all on the one skinned rig and its motion, so
// every breed/look pairing shares one ground and camera.
let layout = choice('layout', ['grid', 'smooth', 'faceted', 'gsp', 'english-setter', 'gsp-smooth', 'setter-smooth', 'gsp-faceted', 'setter-faceted'] as const, 'grid');
const PANEL_KINDS: readonly { breed: Breed; style: Style; id: string }[] = [
  { breed: 'gsp', style: 'smooth', id: 'gsp-smooth' }, { breed: 'english-setter', style: 'smooth', id: 'setter-smooth' },
  { breed: 'gsp', style: 'faceted', id: 'gsp-faceted' }, { breed: 'english-setter', style: 'faceted', id: 'setter-faceted' },
];
const panelVisible = (kind: { breed: Breed; style: Style; id: string }) => layout === 'grid' || layout === kind.style || layout === kind.breed || layout === kind.id;
let playing = params.get('paused') !== '1', time = 0, travel = 0, paceTime = 0, speed = 0;
const stepSeconds = 1 / 60;
const canvas = document.querySelector<HTMLCanvasElement>('#comparison')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const camera = new THREE.PerspectiveCamera(38, 1, .03, 600);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false; controls.minDistance = 1.0; controls.maxDistance = 14;
controls.minPolarAngle = .15; controls.maxPolarAngle = Math.PI * .49;
const area = getArea('chukar-ridge');
const landscape = new LandscapeModel(area, 'south-gate');
interface Panel {
  breed: Breed; style: Style;
  element: HTMLElement; scene: THREE.Scene; camera: THREE.PerspectiveCamera; ctx: Ctx;
  system: GeneratedDogSystem; dog: Dog; nodes: THREE.Object3D[];
  sun: THREE.DirectionalLight; fill: THREE.DirectionalLight; hemi: THREE.HemisphereLight;
  floor: THREE.Mesh; grid: THREE.GridHelper;
}
let panels: Panel[] = [];

function makePanel(kind: Breed, style: Style, elementId: string): Panel {
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
  const coat = kind === 'gsp' ? gspCoat : setterCoat;
  const system = new GeneratedDogSystem(coat, 0, style);
  system.init(ctx);
  const nodes = scene.children.filter(node => !before.has(node));
  return { breed: kind, style, element: document.querySelector(`#${elementId}`)!, scene, camera: panelCamera,
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
  disposePanels(); travel = 0; time = 0; paceTime = 0; speed = 0;
  for (const kind of PANEL_KINDS) document.querySelector<HTMLElement>(`#${kind.id}`)!.hidden = !panelVisible(kind);
  document.querySelector<HTMLElement>('#panels')!.dataset.layout = layout;
  panels = PANEL_KINDS.filter(panelVisible).map(kind => makePanel(kind.breed, kind.style, kind.id));
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
    p.dog.state = pose === 'point' ? 'pointing' : isTravel(pose) && speed > .03 ? 'quartering' : 'heel';
    p.dog.gait = !isTravel(pose) || speed <= .03 ? 'still' : speed < 1.4 ? 'track' : speed >= 4.8 ? 'run' : 'trot';
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
  if (move) paceTime += dt;
  speed = !move || !isTravel(pose) ? 0 : pose === 'paces' ? sequenceSpeed(paceTime) : paceSpeeds[pose as keyof typeof paceSpeeds];
  if (move) applyPose();
  const delta = speed * dt;
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
    quarter: [2.5, 1.05, 2.6], side: [3.3, .92, .02], front: [0, .93, 3.3], rear: [0, .98, -3.3], 'rear-quarter': [-2.4, 1.15, -2.5], field: [4.6, 1.62, 6.55],
  };
  // Optional review zoom: `zoom=2` halves the camera distance for close inspection.
  const zoom = THREE.MathUtils.clamp(Number(params.get('zoom')) || 1, .5, 5);
  // `focus=head` or `focus=feet` aims a close review at that part.
  const focus = params.get('focus') === 'head' ? new THREE.Vector3(0, .66, .34) : params.get('focus') === 'feet' ? new THREE.Vector3(0, .1, 0) : new THREE.Vector3(0, .4, .06);
  camera.position.set(...offsets[view]); camera.position.sub(new THREE.Vector3(0, .40, 0)).divideScalar(zoom).add(focus);
  camera.position.z += travel;
  camera.fov = view === 'field' ? 70 : 38; camera.updateProjectionMatrix();
  controls.target.copy(focus); controls.target.z += travel; controls.update();
}
function syncURL(): void {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ pose, quality, tod: light, view, layout, gsp: gspCoat, setter: setterCoat })) url.searchParams.set(key, value);
  if (playing) url.searchParams.delete('paused'); else url.searchParams.set('paused', '1');
  history.replaceState(null, '', url);
}
function updateLinks(): void {
  for (const kind of PANEL_KINDS) {
    const url = new URL('../index3d.html', location.href);
    url.search = new URLSearchParams({ area: 'quail-fields', drop: 'south-gate', quality, tod: light, breed: kind.breed,
      coat: kind.breed === 'gsp' ? gspCoat : setterCoat, dogstyle: kind.style, challenge: 'relaxed', seed: '1184004868' }).toString();
    document.querySelector<HTMLAnchorElement>(`#${kind.id} .play`)!.href = url.href;
  }
}
function updateStatus(): void {
  const labels: Record<Pose, string> = { stand: 'Standing at heel', point: 'Steady point · target 3 m ahead', walk: 'Walking pace', trot: 'Working trot', canter: 'Canter pace', run: 'Running pace', paces: 'Changes of pace' };
  const text = `${labels[pose]}${isTravel(pose) ? ` · shared ${speed.toFixed(1)} m/s travel` : ''} · ${quality === 'lite' ? 'Lightweight' : 'High'} · ${light} light`;
  const status = document.querySelector('#status')!;
  if (status.textContent !== text) status.textContent = text;
}
function selectPose(value: Pose): void {
  pose = value; paceTime = 0; applyPose(); settlePausedSelection(); updateControls();
}
function updateControls(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pose === pose)));
  document.querySelector<HTMLButtonElement>('#motion')!.textContent = playing ? 'Pause' : 'Play';
  document.querySelector<HTMLButtonElement>('#motion')!.setAttribute('aria-pressed', String(playing));
  updateStatus();
  syncURL();
}
for (const [id, values, value] of [['gsp-coat', GSP_COATS, gspCoat], ['setter-coat', ENGLISH_SETTER_COATS, setterCoat]] as const) {
  const select = document.querySelector<HTMLSelectElement>(`#${id}`)!;
  for (const coat of values) select.add(new Option(coat.label, coat.id)); select.value = value;
}
for (const [id, value] of [['view', view], ['light', light], ['quality', quality], ['layout', layout]]) document.querySelector<HTMLSelectElement>(`#${id}`)!.value = value;
document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(button => button.addEventListener('click', () => selectPose(button.dataset.pose as Pose)));
document.querySelector('#motion')!.addEventListener('click', () => { playing = !playing; updateControls(); });
document.querySelector('#step')!.addEventListener('click', () => { playing = false; advance(stepSeconds); updateControls(); });
document.querySelector('#restart')!.addEventListener('click', rebuild);
document.querySelector<HTMLSelectElement>('#view')!.addEventListener('change', e => { setView((e.target as HTMLSelectElement).value as View); syncURL(); });
document.querySelector<HTMLSelectElement>('#light')!.addEventListener('change', e => { light = (e.target as HTMLSelectElement).value as typeof light; setLighting(); updateLinks(); updateControls(); });
document.querySelector<HTMLSelectElement>('#quality')!.addEventListener('change', e => { quality = (e.target as HTMLSelectElement).value as Quality; rebuild(); });
document.querySelector<HTMLSelectElement>('#layout')!.addEventListener('change', e => { layout = (e.target as HTMLSelectElement).value as typeof layout; rebuild(); });
document.querySelector<HTMLSelectElement>('#gsp-coat')!.addEventListener('change', e => { gspCoat = (e.target as HTMLSelectElement).value as GspCoatId; rebuild(); });
document.querySelector<HTMLSelectElement>('#setter-coat')!.addEventListener('change', e => { setterCoat = (e.target as HTMLSelectElement).value as EnglishSetterCoatId; rebuild(); });
let previous = performance.now(), accumulator = 0, raf = 0;
function frame(now: number): void {
  const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now;
  if (playing && !document.hidden) { accumulator += dt; while (accumulator >= stepSeconds) { advance(stepSeconds); accumulator -= stepSeconds; } }
  else accumulator = 0;
  controls.update();
  updateStatus();
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
  setPose(value: Pose) { if (!poses.includes(value)) throw new Error(`Unknown comparison pose: ${value}`); selectPose(value); },
  advance(seconds: number) { playing = false; for (let i = 0; i < Math.round(seconds / stepSeconds); i++) advance(stepSeconds); updateControls(); },
  state() {
    return { pose, quality, light, playing, time, travel, speed, paceTime,
      renderers: panels.map(p => ({ breed: p.breed, style: p.style, source: p.system.constructor.name,
        scale: p.nodes.find(n => n.name === `${p.breed}-root`)?.scale.toArray() ?? [1, 1, 1],
        state: p.dog.state, gait: p.dog.gait, camera: p.camera.position.toArray(), fov: p.camera.fov,
        paws: p.system.snapshot()?.feet.map(foot => ({ i: foot.i, gap: foot.groundGap, supporting: isTravel(pose) ? null : pose !== 'point' || foot.i !== 0 })),
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
