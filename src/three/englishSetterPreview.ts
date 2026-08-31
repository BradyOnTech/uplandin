import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBlueBeltonEnglishSetterModel } from '../../docs/3d/img2threejs/english-setter/generated/createEnglishSetterBlockout';

declare global {
  interface Window {
    __setterReady?: boolean;
    __setterStats?: { triangles: number; drawCalls: number };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#setter-preview');
if (!canvas) throw new Error('Missing #setter-preview canvas');

const params = new URLSearchParams(window.location.search);
const view = params.get('view') ?? 'three-quarter';
const label = document.querySelector<HTMLElement>('#view-label');
if (label) label.textContent = view;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0xc9d5d0, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc9d5d0, 3.4, 5.4);

const dog = createBlueBeltonEnglishSetterModel({ castShadow: true, receiveShadow: false });
scene.add(dog);

dog.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(dog);
dog.position.y -= bounds.min.y;
dog.updateMatrixWorld(true);
const groundedBounds = new THREE.Box3().setFromObject(dog);
const center = groundedBounds.getCenter(new THREE.Vector3());
const size = groundedBounds.getSize(new THREE.Vector3());

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.MeshStandardMaterial({ color: 0xa9b59a, roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

scene.add(new THREE.HemisphereLight(0xeaf2f0, 0x766d55, 1.45));
const key = new THREE.DirectionalLight(0xffe1aa, 3.2);
key.position.set(-2.4, 3.2, 2.1);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -1.5;
key.shadow.camera.right = 1.5;
key.shadow.camera.top = 1.5;
key.shadow.camera.bottom = -1.5;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9ebdd2, 1.1);
rim.position.set(2, 1.8, -2.4);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.01, 20);
const radius = Math.max(size.x, size.y, size.z) * 2.45;
const target = center.clone().add(new THREE.Vector3(0, size.y * 0.03, 0));
const cameraDirections: Record<string, THREE.Vector3> = {
  side: new THREE.Vector3(1, 0.12, 0),
  front: new THREE.Vector3(0, 0.12, 1),
  rear: new THREE.Vector3(0, 0.12, -1),
  'rear-three-quarter': new THREE.Vector3(0.72, 0.25, -0.72),
  'three-quarter': new THREE.Vector3(-0.72, 0.25, 0.72),
};
const direction = (cameraDirections[view] ?? cameraDirections['three-quarter']).clone().normalize();
camera.position.copy(target).addScaledVector(direction, radius);
camera.lookAt(target);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(target);
controls.enableDamping = false;
controls.update();

let triangles = 0;
let drawCalls = 0;
dog.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return;
  drawCalls += 1;
  const count = object.geometry.index?.count ?? object.geometry.getAttribute('position')?.count ?? 0;
  triangles += Math.floor(count / 3);
});
window.__setterStats = { triangles, drawCalls };

function render(): void {
  renderer.render(scene, camera);
}

controls.addEventListener('change', render);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  render();
});

render();
requestAnimationFrame(() => {
  render();
  window.__setterReady = true;
});
