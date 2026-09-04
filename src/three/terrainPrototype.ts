import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

declare global {
  interface Window {
    __terrainPrototypeReady?: boolean;
    __terrainPrototypeStats?: { triangles: number; drawCalls: number };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#terrain-prototype');
const stats = document.querySelector<HTMLElement>('#terrain-stats');
if (!canvas) throw new Error('Missing #terrain-prototype canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8299a4);
scene.fog = new THREE.FogExp2(0x8299a4, 0.0027);

scene.add(new THREE.HemisphereLight(0xc9dbea, 0x625640, 2.0));

const sun = new THREE.DirectionalLight(0xffd596, 4.25);
sun.position.set(-95, 125, 72);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -150;
sun.shadow.camera.right = 150;
sun.shadow.camera.top = 150;
sun.shadow.camera.bottom = -150;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 420;
sun.shadow.bias = -0.00012;
scene.add(sun);

const skyFill = new THREE.DirectionalLight(0xb9d2df, 0.55);
skyFill.position.set(80, 45, -90);
scene.add(skyFill);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 1400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 16;
controls.maxDistance = 340;
controls.maxPolarAngle = Math.PI * 0.49;

function render(): void {
  controls.update();
  renderer.render(scene, camera);
}

new GLTFLoader().load(
  '/prototypes/blender-chukar/chukar-vertical-slice.glb',
  (gltf) => {
    const terrain = gltf.scene;
    scene.add(terrain);

    let triangles = 0;
    let drawCalls = 0;
    terrain.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = !object.name.includes('Bunchgrass');
      object.receiveShadow = true;
      drawCalls += Array.isArray(object.material) ? object.material.length : 1;
      const count = object.geometry.index?.count ?? object.geometry.getAttribute('position')?.count ?? 0;
      triangles += Math.floor(count / 3);
    });

    const heroCliff = terrain.getObjectByName('PROTO_HeroCliff');
    const heroBounds = heroCliff
      ? new THREE.Box3().setFromObject(heroCliff)
      : new THREE.Box3().setFromObject(terrain);
    const target = heroBounds.getCenter(new THREE.Vector3()).add(new THREE.Vector3(-5, -7, 8));
    controls.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(-66, 29, 68));
    camera.lookAt(target);
    controls.update();

    window.__terrainPrototypeStats = { triangles, drawCalls };
    window.__terrainPrototypeReady = true;
    if (stats) stats.textContent = `${triangles.toLocaleString()} triangles · ${drawCalls} material draws`;
    render();
  },
  undefined,
  (error) => {
    console.error(error);
    if (stats) stats.textContent = 'Terrain export failed to load';
  },
);

renderer.setAnimationLoop(render);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
