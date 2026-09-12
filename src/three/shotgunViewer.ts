import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUNS, getGun } from '../game/guns';
import { createSportingShotgun, type SportingShotgun } from './assets/shotgun';
import './shotgunViewer.css';

const descriptions: Record<string, { action: string; copy: string }> = {
  'remington-870': { action: 'PUMP ACTION', copy: 'A ribbed walnut forend travels with the support hand to work the action. A single barrel sits above the magazine tube.' },
  'semi-auto': { action: 'BROWNING A5 · SEMIAUTOMATIC', copy: 'The signature humpback receiver meets a long walnut forend and single sighting rib. The bolt cycles while the support grip stays planted.' },
  'over-under': { action: 'OVER / UNDER', copy: 'Two vertically stacked barrels, a deep receiver and a slim forend. The barrels hinge down to expose the chambers for reloading.' },
  'side-by-side': { action: 'SIDE BY SIDE', copy: 'Paired horizontal barrels, a broad boxlock and a straight walnut stock. The wider sighting plane gives this double its own character.' },
};
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = el<HTMLDivElement>('viewport');
const canvas = el<HTMLCanvasElement>('shotgun-view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x39483e);
scene.add(new THREE.HemisphereLight(0xe8eedc, 0x77705b, 2.5));
const key = new THREE.DirectionalLight(0xffe7c5, 3.4); key.position.set(2, 3, 1); scene.add(key);
const fill = new THREE.DirectionalLight(0xc0d6dc, 2); fill.position.set(-2, 1, -2); scene.add(fill);
const camera = new THREE.PerspectiveCamera(32, 1, .01, 20);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.minDistance = .48; controls.maxDistance = 5;
controls.target.set(0, -.035, -.15);
let selected = getGun(new URLSearchParams(location.search).get('gun') ?? 'remington-870');
let model: SportingShotgun;
let motion: 'ready' | 'reload' | 'cycle' = 'ready';
let elapsed = 0, reloadProgress = 0, last = 0, raf = 0;
const phase = el<HTMLInputElement>('reload-phase');
const status = el<HTMLParagraphElement>('motion-status');
const duration = () => .55 + selected.shells * .38;
const presetDirections: Record<string, THREE.Vector3> = {
  'three-quarter': new THREE.Vector3(1.5, .64, 1),
  profile: new THREE.Vector3(1, .12, 0),
  top: new THREE.Vector3(0, 1, .001),
  breech: new THREE.Vector3(.38, .35, 1),
  muzzle: new THREE.Vector3(.03, .15, -1),
};
function render(now: number) {
  raf = 0;
  const dt = last ? Math.min((now - last) / 1000, .05) : 0; last = now;
  if (motion === 'reload') {
    elapsed = Math.min(duration(), elapsed + dt);
    reloadProgress = elapsed / duration();
    if (reloadProgress >= 1) { motion = 'ready'; reloadProgress = 0; status.textContent = 'Reload complete'; }
    phase.value = String(reloadProgress);
  } else if (motion === 'cycle') {
    elapsed += dt;
    if (elapsed >= .65) { motion = 'ready'; status.textContent = 'Ready'; }
  }
  model.update(reloadProgress * duration(), reloadProgress > 0 && reloadProgress < 1 ? duration() : 0,
    selected.shells, 0, dt);
  renderer.render(scene, camera);
  if (motion !== 'ready') invalidate();
}
function invalidate() { if (!raf) raf = requestAnimationFrame(render); }
function setView(name: string) {
  const distance = Math.max(2, 2.15 / Math.max(.6, camera.aspect));
  camera.position.copy(presetDirections[name]).normalize().multiplyScalar(distance).add(controls.target);
  controls.update(); invalidate();
}
function chooseGun(id: string) {
  selected = getGun(id);
  if (model) { scene.remove(model.root); model.dispose(); }
  model = createSportingShotgun(selected.id === 'remington-870' ? 'pump' : selected.id as 'semi-auto' | 'over-under' | 'side-by-side', { hands: false });
  scene.add(model.root);
  motion = 'ready'; elapsed = 0; reloadProgress = 0; phase.value = '0'; status.textContent = 'Ready';
  el('gun-name').textContent = selected.name;
  el('gun-description').textContent = descriptions[selected.id].copy;
  el('action-label').textContent = descriptions[selected.id].action;
  el('capacity').textContent = `${selected.shells} shells`;
  el('unlock').textContent = `Level ${selected.unlockLevel}`;
  el<HTMLAnchorElement>('try-gun').href = `./index3d.html?area=pheasant-coverts&drop=west-track&quality=high&tod=morning&breed=gsp&coat=liver-white&dog=generated&gun=${selected.id}`;
  el<HTMLButtonElement>('cycle-action').hidden = selected.cooldownMs === 0;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-gun]')) button.setAttribute('aria-pressed', String(button.dataset.gun === selected.id));
  const url = new URL(location.href); url.searchParams.set('gun', selected.id); history.replaceState(null, '', url);
  invalidate();
}
GUNS.forEach((gun, i) => {
  const button = document.createElement('button'); button.type = 'button'; button.dataset.gun = gun.id;
  const number = document.createElement('span'); number.textContent = `0${i + 1}`;
  button.append(number, document.createTextNode(gun.name)); button.onclick = () => chooseGun(gun.id);
  el('gun-choices').append(button);
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) button.onclick = () => setView(button.dataset.view!);
controls.addEventListener('change', invalidate);
el('play-reload').onclick = () => { model.update(0, 0, 0, 0, 1); motion = 'reload'; elapsed = 0; reloadProgress = 0; last = 0; status.textContent = 'Reloading'; invalidate(); };
el('cycle-action').onclick = () => {
  motion = 'cycle'; elapsed = 0; reloadProgress = 0; phase.value = '0'; last = 0; model.fire(); status.textContent = 'Cycling action';
  invalidate();
};
phase.oninput = () => {
  // Manual inspection settles any interrupted pump/bolt cycle first.
  model.update(0, 0, 0, 0, 1);
  motion = 'ready'; reloadProgress = Number(phase.value);
  status.textContent = reloadProgress === 0 || reloadProgress === 1 ? 'Ready' : `Reload · ${Math.round(reloadProgress * 100)}%`;
  invalidate();
};
canvas.addEventListener('keydown', event => {
  const keyViews: Record<string, string> = { '1': 'profile', '2': 'top', '3': 'breech', '4': 'muzzle', '0': 'three-quarter' };
  if (keyViews[event.key]) { event.preventDefault(); setView(keyViews[event.key]); }
});
new ResizeObserver(() => {
  camera.aspect = viewport.clientWidth / viewport.clientHeight; camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
  setView('three-quarter');
}).observe(viewport);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = 0; }
  else invalidate();
});
chooseGun(selected.id); setView('three-quarter');
