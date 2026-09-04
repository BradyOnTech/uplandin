import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { P, TOD, type TimeOfDay } from './palette';
import { mulberry32 } from '../game/math';

/*
 * FRAME POC — composition vs assets, isolated from the game sim.
 *
 * Thesis under test: the 3D frames read "subpar" because of framing and a
 * few authored shapes, not because Three.js can't do Firewatch.
 *
 *   OLD preset: tall dense grass to the eye, no sightline, big black gun,
 *     shadows off, blobby clouds.
 *   NEW preset: near-camera cut, sightline corridor to the dog, smaller
 *     readable gun, tree shadows on, 2 soft cloud masses, patchy ground.
 *
 * Static framing: camera at (0, 40) looking north (-z) at a pointing dog
 * 9 m ahead, dawn default. WASD + drag to move; press C to re-cut grass
 * around the new camera. URL: ?poc=old|new&tod=dawn&capture=1 for the
 * headless A/B.
 */

const params = new URLSearchParams(location.search);
type Preset = 'old' | 'new';
interface State {
  preset: Preset;
  nearCut: boolean;
  corridor: boolean;
  shadows: boolean;
  softClouds: boolean;
  density: number;
  gunScale: number;
  tod: TimeOfDay;
}

const PRESETS: Record<Preset, Omit<State, 'tod'>> = {
  old: { preset: 'old', nearCut: false, corridor: false, shadows: false, softClouds: false, density: 1.25, gunScale: 1.18 },
  new: { preset: 'new', nearCut: true, corridor: true, shadows: true, softClouds: true, density: 0.7, gunScale: 0.95 },
};

const state: State = {
  ...PRESETS[(params.get('poc') as Preset) === 'old' ? 'old' : 'new'],
  tod: (params.get('tod') as TimeOfDay) || 'dawn',
};
const CAPTURE = params.has('capture');
if (CAPTURE) document.body.classList.add('capture');
// Independent of OLD/NEW: authored Kenney props vs our procedural ones.
let kenneyOn = params.get('kenney') !== '0';

/* ---------------- deterministic noise + height ---------------- */

function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const s = (t: number): number => t * t * (3 - 2 * t);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const u = s(xf);
  const v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function heightAt(x: number, z: number): number {
  const n1 = vnoise(x * 0.02, z * 0.02, 1971) - 0.5;
  const n2 = vnoise(x * 0.07 + 31, z * 0.07 - 17, 9241) - 0.5;
  return n1 * 3.2 + n2 * 0.7;
}

const CAM0 = new THREE.Vector3(0, 0, 40);
CAM0.y = heightAt(0, 40) + 1.7;
const DOG = new THREE.Vector3(0, 0, 31);
DOG.y = heightAt(0, 31);

/* ---------------- renderer / scene / camera ---------------- */

const canvas = document.getElementById('poc') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 1500);
camera.position.copy(CAM0);
// Three.js cameras face -z at rotation 0: yaw 0 looks north at the dog.
let yaw = 0;
let pitch = -0.045;
function applyLook(): void {
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
}
applyLook();
scene.add(camera);
// Prop layers: procedural (ours) vs authored (Kenney CC0). Toggled live.
const propProc = new THREE.Group();
const propKen = new THREE.Group();
propKen.visible = false;
scene.add(propProc, propKen);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ---------------- sky: gradient + sun + 2 soft masses ---------------- */

const skyUniforms = {
  uTop: { value: new THREE.Color() },
  uMid: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunDisc: { value: new THREE.Color() },
  uGlow: { value: new THREE.Color() },
  uSoft: { value: 1 },
  uCloudLit: { value: new THREE.Color() },
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uTop, uMid, uHorizon, uSunDisc, uGlow, uCloudLit;
    uniform vec3 uSunDir;
    uniform float uSoft;
    varying vec3 vDir;
    float mass(vec2 ae, vec2 c, vec2 r) {
      vec2 d = (ae - c) / r;
      float f = exp(-dot(d, d));
      f *= smoothstep(-0.02, 0.015, ae.y - (c.y - r.y * 1.4));
      return f;
    }
    void main() {
      vec3 dir = normalize(vDir);
      float h = max(dir.y, 0.0);
      vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.20, h));
      col = mix(col, uTop, smoothstep(0.14, 0.55, h));
      float d = max(dot(dir, uSunDir), 0.0);
      col = mix(col, uGlow, clamp(pow(d, 7.0) * 0.7, 0.0, 0.75));
      vec2 ae = vec2(atan(dir.x, dir.z), dir.y);
      float cm;
      if (uSoft > 0.5) {
        // NEW: two broad soft masses, kept clear of the sun corridor.
        cm = mass(ae, vec2(2.75, 0.30), vec2(0.24, 0.055));
        cm = max(cm, mass(ae, vec2(-2.55, 0.18), vec2(0.19, 0.045)) * 0.9);
        float m = smoothstep(0.55, 0.68, cm) * smoothstep(0.04, 0.10, dir.y);
        float shade = smoothstep(0.45, 0.75, mass(ae + vec2(0.0, 0.06), vec2(2.75, 0.30), vec2(0.24, 0.055)));
        col = mix(col, mix(uCloudLit * 0.82, uCloudLit * 1.12, shade), m * 0.95);
      } else {
        // OLD: five small hard blobs scattered over the sun corridor.
        cm = mass(ae, vec2(2.6, 0.16), vec2(0.07, 0.022));
        cm = max(cm, mass(ae, vec2(3.05, 0.26), vec2(0.09, 0.025)));
        cm = max(cm, mass(ae, vec2(-2.8, 0.12), vec2(0.06, 0.02)));
        cm = max(cm, mass(ae, vec2(2.2, 0.30), vec2(0.08, 0.025)));
        cm = max(cm, mass(ae, vec2(-2.2, 0.22), vec2(0.07, 0.022)));
        float m = smoothstep(0.55, 0.62, cm) * smoothstep(0.03, 0.07, dir.y);
        col = mix(col, uCloudLit, m);
      }
      col = mix(col, uSunDisc, clamp(pow(d, 300.0) * 1.2, 0.0, 1.0));
      col = mix(col, uHorizon * 0.9, smoothstep(0.0, 0.06, -dir.y));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), skyMat);
skyDome.frustumCulled = false;
skyDome.renderOrder = -30;
scene.add(skyDome);

/* ---------------- lights ---------------- */

const key = new THREE.DirectionalLight(0xffffff, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 50;
key.shadow.camera.far = 700;
key.shadow.camera.left = -70;
key.shadow.camera.right = 70;
key.shadow.camera.top = 70;
key.shadow.camera.bottom = -70;
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.12;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xffffff, 0.4);
scene.add(fill, fill.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemi);
scene.fog = new THREE.FogExp2(0xffffff, 0.004);

const keyDir = new THREE.Vector3(0, 1, 0);
function applyTod(tod: TimeOfDay): void {
  const spec = TOD[tod];
  renderer.toneMappingExposure = spec.exposure;
  skyUniforms.uTop.value.setHex(spec.skyTop);
  skyUniforms.uMid.value.setHex(spec.skyMid);
  skyUniforms.uHorizon.value.setHex(spec.skyHorizon);
  skyUniforms.uSunDisc.value.setHex(spec.sunDisc);
  skyUniforms.uGlow.value.setHex(spec.sunGlow);
  skyUniforms.uCloudLit.value.setHex(spec.cloudLit);
  // NEW pulls the sun ahead-left of the view (backlight + long shadows
  // toward the camera). OLD keeps the spec sun (behind the camera: flat).
  const sunAz = state.preset === 'new' ? 210 : spec.sunAzimuth;
  const sunEl = state.preset === 'new' ? 7 : spec.sunElevation;
  const el = THREE.MathUtils.degToRad(sunEl);
  const az = THREE.MathUtils.degToRad(sunAz);
  keyDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  skyUniforms.uSunDir.value.copy(keyDir);
  key.color.setHex(spec.sunColor);
  key.intensity = spec.sunIntensity;
  fill.color.setHex(spec.fillColor);
  fill.intensity = spec.fillIntensity;
  hemi.color.setHex(spec.ambientSky);
  hemi.groundColor.setHex(spec.ambientGround);
  hemi.intensity = spec.ambientIntensity;
  const fog = scene.fog as THREE.FogExp2;
  fog.color.setHex(spec.fogColor);
  // NEW melts the field into the ridges (depth); OLD stays thin and flat.
  fog.density = spec.fogDensity * (state.preset === 'new' ? 1.5 : 1);
}

/* ---------------- terrain: patchy, not flat ---------------- */

let groundMesh: THREE.Mesh | null = null;
function buildTerrain(): void {
  if (groundMesh) {
    scene.remove(groundMesh);
    groundMesh.geometry.dispose();
    (groundMesh.material as THREE.Material).dispose();
    groundMesh = null;
  }
  // NEW commits to a bold quilt (big olive sweeps, bare dirt, worn trail).
  // OLD keeps the timid version that reads flat brown at eye level.
  const bold = state.preset === 'new';
  const SIZE = 260;
  const SEG = 110;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const cStraw = new THREE.Color(0xaa9554);
  const cGold = new THREE.Color(0xd2c157);
  const cOlive = new THREE.Color(0x695926);
  const cSoil = new THREE.Color(0x664639);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + CAM0.x;
    const z = pos.getZ(i) + CAM0.z;
    const y = heightAt(x, z);
    pos.setY(i, y);
    pos.setX(i, x);
    pos.setZ(i, z);
    const meso = vnoise(x * 0.05 + 18, z * 0.05 + 41, 1971);
    const micro = vnoise(x * 0.35, z * 0.35, 555);
    tmp.copy(cStraw).lerp(cGold, meso).lerp(cOlive, Math.max(0, 0.52 - meso) * (bold ? 1.7 : 1.1));
    const bare = vnoise(x * 0.03 - 51, z * 0.03 + 77, 31337);
    const bareT = bold ? 0.55 : 0.58;
    if (bare > bareT) tmp.lerp(cSoil, Math.min(1, (bare - bareT) * 3.2) * (bold ? 0.9 : 0.75));
    const grain = (bold ? 0.84 : 0.88) + micro * (bold ? 0.32 : 0.24);
    colors[i * 3] = tmp.r * grain;
    colors[i * 3 + 1] = tmp.g * grain;
    colors[i * 3 + 2] = tmp.b * grain;
  }
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - DOG.x;
    const dz = pos.getZ(i) - DOG.z;
    const d = Math.hypot(dx, dz);
    if (d < 10) {
      const k = (1 - d / 10) * 0.35;
      colors[i * 3] *= 1 - k;
      colors[i * 3 + 1] *= 1 - k;
      colors[i * 3 + 2] *= 1 - k * 0.8;
    }
  }
  if (bold) {
    // worn trail from the hunter to the working cover — the eye's path.
    const dx = DOG.x - CAM0.x;
    const dz = DOG.z - CAM0.z;
    const len2 = Math.max(dx * dx + dz * dz, 1e-4);
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const t = THREE.MathUtils.clamp(((px - CAM0.x) * dx + (pz - CAM0.z) * dz) / len2, 0, 1);
      const d = Math.hypot(px - (CAM0.x + dx * t), pz - (CAM0.z + dz * t));
      if (d < 1.4) {
        const k = (1 - d / 1.4) * 0.5;
        colors[i * 3] = colors[i * 3] * (1 - k) + 0.82 * k;
        colors[i * 3 + 1] = colors[i * 3 + 1] * (1 - k) + 0.72 * k;
        colors[i * 3 + 2] = colors[i * 3 + 2] * (1 - k) + 0.5 * k;
      }
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  groundMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
}

/* ---------------- grass: one tuft geometry, instanced ---------------- */

function buildTuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const rng = mulberry32(0x9e1d77);
  const root: [number, number, number] = [0.42, 0.39, 0.3];
  const tip: [number, number, number] = [0.96, 0.89, 0.62];
  const push = (x: number, y: number, z: number, t: number): void => {
    positions.push(x, y, z);
    colors.push(root[0] + (tip[0] - root[0]) * t, root[1] + (tip[1] - root[1]) * t, root[2] + (tip[2] - root[2]) * t);
  };
  for (let b = 0; b < 7; b++) {
    const a = rng() * Math.PI * 2;
    const lean = 0.08 + rng() * 0.3;
    const h = 0.85 + rng() * 0.35;
    const w = 0.035 + rng() * 0.02;
    const ox = Math.sin(a);
    const oz = Math.cos(a);
    const sx = Math.cos(a);
    const sz = -Math.sin(a);
    const tx = ox * Math.sin(lean) * h;
    const tz = oz * Math.sin(lean) * h;
    const tw = w * 0.4;
    push(-sx * w * 0.5, 0, -sz * w * 0.5, 0);
    push(sx * w * 0.5, 0, sz * w * 0.5, 0);
    push(tx + sx * tw * 0.5, h, tz + sz * tw * 0.5, 1);
    push(-sx * w * 0.5, 0, -sz * w * 0.5, 0);
    push(tx + sx * tw * 0.5, h, tz + sz * tw * 0.5, 1);
    push(tx - sx * tw * 0.5, h, tz - sz * tw * 0.5, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const n = new Float32Array((positions.length / 3) * 3);
  for (let i = 0; i < positions.length / 3; i++) n[i * 3 + 1] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  geo.computeBoundingSphere();
  return geo;
}
const tuftGeo = buildTuftGeometry();
let grassMesh: THREE.InstancedMesh | null = null;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function distToSightline(x: number, z: number): number {
  const ax = camera.position.x;
  const az = camera.position.z;
  const dx = DOG.x - ax;
  const dz = DOG.z - az;
  const len2 = Math.max(dx * dx + dz * dz, 1e-4);
  const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function rebuildGrass(): void {
  if (grassMesh) {
    scene.remove(grassMesh);
    grassMesh.dispose();
    grassMesh = null;
  }
  const rng = mulberry32(1971);
  const MAX = 6500;
  const mesh = new THREE.InstancedMesh(tuftGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), MAX);
  mesh.receiveShadow = true;
  let placed = 0;
  let guard = 0;
  const target = Math.min(MAX, Math.floor(4200 * state.density));
  while (placed < target && guard++ < MAX * 14) {
    const r = 46 * Math.sqrt(rng());
    const th = rng() * Math.PI * 2;
    const x = CAM0.x + Math.sin(th) * r;
    const z = CAM0.z + Math.cos(th) * r * 0.9 - 8;
    const dDog = Math.hypot(x - DOG.x, z - DOG.z);
    const inCover = dDog < 9;
    const keepP = inCover ? 0.95 : 0.42 + vnoise(x * 0.06, z * 0.06, 4127) * 0.4;
    if (rng() > keepP) continue;
    const dCam = Math.hypot(x - camera.position.x, z - camera.position.z);
    let h = inCover ? 0.75 + rng() * 0.45 : 0.4 + rng() * 0.4;
    if (state.preset === 'old') h *= 1.15;
    if (state.nearCut && dCam < 8) h *= 0.45;
    if (state.corridor && distToSightline(x, z) < 1.0 && dCam > 2 && dCam < 14) h *= 0.32;
    _p.set(x, heightAt(x, z) - 0.02, z);
    _e.set(0, rng() * Math.PI * 2, 0);
    _q.setFromEuler(_e);
    const w = 0.9 + rng() * 0.5;
    _s.set(w, h, w);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(placed, _m);
    const gold = vnoise(x * 0.1, z * 0.1, 777);
    if (state.preset === 'new') {
      // straw gold that holds against the dawn key — never gray.
      _c.setRGB(0.98 + gold * 0.22, 0.8 + gold * 0.24, 0.46 + gold * 0.16);
    } else {
      _c.setRGB(0.85 + gold * 0.3, 0.78 + gold * 0.28, 0.52 + gold * 0.18);
    }
    if (inCover) _c.multiplyScalar(0.82);
    mesh.setColorAt(placed, _c);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  grassMesh = mesh;
}

/* ---------------- dog: authored-proportion placeholder ---------------- */

{
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xe9e2d2, flatShading: true });
  const brown = new THREE.MeshLambertMaterial({ color: 0x7a4a28, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e2a26, flatShading: true });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0): void => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    g.add(m);
  };
  add(new THREE.BoxGeometry(0.2, 0.24, 0.34), white, 0, 0.46, 0.08);
  add(new THREE.BoxGeometry(0.16, 0.18, 0.26), white, 0, 0.48, -0.2);
  add(new THREE.BoxGeometry(0.1, 0.16, 0.2), white, 0, 0.56, 0.28, -0.5);
  add(new THREE.BoxGeometry(0.11, 0.11, 0.16), white, 0, 0.68, 0.36);
  add(new THREE.BoxGeometry(0.06, 0.07, 0.12), white, 0, 0.65, 0.48);
  add(new THREE.BoxGeometry(0.03, 0.03, 0.02), dark, 0, 0.67, 0.545);
  add(new THREE.BoxGeometry(0.03, 0.14, 0.07), brown, -0.07, 0.64, 0.35, 0, 0.15);
  add(new THREE.BoxGeometry(0.03, 0.14, 0.07), brown, 0.07, 0.64, 0.35, 0, -0.15);
  add(new THREE.BoxGeometry(0.045, 0.42, 0.045), white, 0, 0.78, -0.33, 0.12);
  const legF = new THREE.BoxGeometry(0.055, 0.42, 0.06);
  add(legF, white, -0.07, 0.21, 0.2);
  add(new THREE.BoxGeometry(0.05, 0.2, 0.05), white, 0.07, 0.32, 0.26, -1.9);
  add(new THREE.BoxGeometry(0.055, 0.42, 0.06), white, -0.07, 0.21, -0.26);
  add(new THREE.BoxGeometry(0.055, 0.42, 0.06), white, 0.07, 0.21, -0.26);
  g.position.copy(DOG);
  g.rotation.y = Math.PI * 0.82;
  scene.add(g);
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 24),
    new THREE.MeshBasicMaterial({ color: 0x1a140e, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.scale.set(1, 1.9, 1);
  blob.position.set(DOG.x + 0.5, heightAt(DOG.x, DOG.z) + 0.03, DOG.z - 0.6);
  scene.add(blob);
}

/* ---------------- trees + rocks ---------------- */

const shadowCasters: THREE.Object3D[] = [];
function makeTree(x: number, z: number, s: number, tint: number): void {
  const y = heightAt(x, z);
  const grp = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14 * s, 0.22 * s, 2.4 * s, 6),
    new THREE.MeshLambertMaterial({ color: 0x4a3826, flatShading: true }),
  );
  trunk.position.y = 1.2 * s;
  grp.add(trunk);
  const seedNum = Math.abs(Math.floor(x * 13 + z * 7)) + 5;
  const rng = mulberry32(seedNum);
  for (let i = 0; i < 3; i++) {
    const r = (1.5 - i * 0.28) * s * (0.85 + rng() * 0.3);
    const c = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0),
      new THREE.MeshLambertMaterial({ color: tint, flatShading: true }),
    );
    c.position.set((rng() - 0.5) * s, (2.6 + i * 0.85) * s, (rng() - 0.5) * s);
    c.scale.y = 0.82;
    grp.add(c);
  }
  grp.position.set(x, y - 0.05, z);
  grp.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      shadowCasters.push(o);
    }
  });
  propProc.add(grp);
}
function makeRock(x: number, z: number, s: number): void {
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(s, 0),
    new THREE.MeshLambertMaterial({ color: 0x8a8178, flatShading: true }),
  );
  m.position.set(x, heightAt(x, z) + s * 0.3, z);
  m.rotation.set(0.4, x, 0.2);
  m.castShadow = true;
  m.receiveShadow = true;
  shadowCasters.push(m);
  propProc.add(m);
}
makeTree(-13, 22, 1.5, 0x6a6a2e);
makeTree(11, 18, 1.2, 0x7a7a33);
makeTree(26, 4, 1.7, 0x8a7a2e);
makeTree(-25, 0, 1.4, 0x5a5e28);
makeTree(5, -12, 1.1, 0x6a6a2e);
makeRock(-6, 26, 0.5);
makeRock(14, 28, 0.8);
makeRock(-18, 34, 0.65);

/* -------- midground layer: fence right, bushes left (both presets) ------ */
/* The empty middle is what made both frames read as "grass to nowhere".   */
/* Kept off the dog's sightline so the point silhouette stays clean.       */
{
  const postMat = new THREE.MeshLambertMaterial({ color: 0x4a3826, flatShading: true });
  const fence = new THREE.Group();
  for (let x = 8; x <= 32; x += 4) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 0.14), postMat);
    p.position.set(x, heightAt(x, 24) + 0.55, 24);
    fence.add(p);
    shadowCasters.push(p);
  }
  for (const wy of [0.7, 0.95]) {
    // wires follow the terrain exactly (segments between posts).
    const pts: number[] = [];
    for (let x = 8; x < 32; x += 4) {
      pts.push(x, heightAt(x, 24) + wy, 24, x + 4, heightAt(x + 4, 24) + wy, 24);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    fence.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1e1c18 })));
  }
  fence.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(fence);
  const bushMat = new THREE.MeshLambertMaterial({ color: 0x4f5a26, flatShading: true });
  const bushMat2 = new THREE.MeshLambertMaterial({ color: 0x6a6a2e, flatShading: true });
  const rngB = mulberry32(4242);
  const bushAt: Array<[number, number, number]> = [[-11, 22, 1.2], [-16, 27, 1.6], [-7, 18, 0.8], [14, 12, 1.0], [-20, 16, 1.1]];
  for (const [bx, bz, bs] of bushAt) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(bs, 0), rngB() > 0.5 ? bushMat : bushMat2);
    b.position.set(bx, heightAt(bx, bz) + bs * 0.55, bz);
    b.scale.y = 0.65;
    b.castShadow = true;
    b.receiveShadow = true;
    shadowCasters.push(b);
    propProc.add(b);
  }
}

/* ------ authored props: Kenney Nature Kit (CC0) vs procedural -------- */
/* Same spots, authored shapes. The whole engine question in one toggle. */

let kenneyLoaded = false;
function applyKenneyVisibility(): void {
  const show = kenneyOn && kenneyLoaded;
  propKen.visible = show;
  propProc.visible = !show;
}
// Palette mapping shared with the game's PropsSystem: pack albedo is only a
// starting point — foliage/wood/stone each grade toward a palette role.
const kenLeaf = new THREE.Color(P.canopyGreen);
const kenWood = new THREE.Color(P.soilBrown);
const kenStone = new THREE.Color(P.stoneGray);
function kenTint(name: string): { role: 'leaf' | 'wood' | 'stone'; k: number } {
  const n = name.toLowerCase();
  if (n.includes('leaf') || n.includes('grass')) return { role: 'leaf', k: 0.9 };
  // Kenney 'dirt' runs hot terracotta in direct sun — grade it harder.
  if (n.includes('dirt') || n.includes('soil')) return { role: 'wood', k: 0.8 };
  if (n.includes('wood') || n.includes('bark')) return { role: 'wood', k: 0.5 };
  return { role: 'stone', k: 0.35 };
}
const kenneyReady = (async (): Promise<void> => {
  try {
    const loader = new GLTFLoader();
    const base = `${import.meta.env.BASE_URL}models/kenney/`;
    const [detailed, rockL, rockS, bush] = await Promise.all([
      loader.loadAsync(`${base}tree_detailed.glb`),
      loader.loadAsync(`${base}rock_largeA.glb`),
      loader.loadAsync(`${base}rock_smallD.glb`),
      loader.loadAsync(`${base}plant_bushDetailed.glb`),
    ]);
    const place = (src: THREE.Object3D, x: number, z: number, s: number, ry: number, sink = 0.1): void => {
      const o = src.clone();
      o.position.set(x, heightAt(x, z) - sink, z);
      o.scale.setScalar(s);
      o.rotation.y = ry;
      o.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          // Asset normalization (the compiler step in miniature): Kenney's
          // GLBs store sRGB numbers in baseColorFactor and ship metalness
          // 1 with no env map (renders black). A real pipeline bakes this
          // fix once at import; the PoC applies it at load. Then the game
          // rules apply: grade toward palette roles (no neon pack green,
          // no orange trunks) and carry a whisper of albedo emissive so no
          // shade side ever voids to black regardless of sun position.
          const m = c.material as THREE.MeshStandardMaterial;
          m.metalness = 0;
          m.roughness = 0.9;
          m.flatShading = true;
          if (m.color) {
            const { role, k } = kenTint(m.name);
            if (role === 'leaf') {
              // Graded by eye, not derived: Kenney's leaf numbers land near-
              // black under hemisphere-only light once converted (narrow
              // cones catch almost no sky). The file value used as-is and
              // pulled hard toward the palette reads as sunlit sage instead.
              m.color.lerp(kenLeaf, 0.75);
            } else {
              m.color.convertSRGBToLinear();
              if (role === 'wood') m.color.lerp(kenWood, k);
              else m.color.lerp(kenStone, k);
            }
            m.emissive.copy(m.color);
            m.emissiveIntensity = 0.12;
          }
          c.castShadow = true;
          c.receiveShadow = true;
          shadowCasters.push(c);
        }
      });
      propKen.add(o);
    };
    // Kenney Nature Kit is modeled small (hero pine is ~2 m) — scale to the
    // same 4–5 m trees and knee-high rocks/bushes the procedural set uses.
    // tree_pineDefaultA quarantined (see props.ts note) — detailed only.
    place(detailed.scene, -13, 22, 3.2, 0.4);
    place(detailed.scene, 11, 18, 2.4, 2.2);
    place(detailed.scene, 26, 4, 3.4, 3.6);
    place(detailed.scene, -25, 0, 2.6, 1.1);
    place(detailed.scene, 5, -12, 2.2, 5.0);
    place(rockL.scene, -6, 26, 1.6, 0.7, 0.2);
    place(rockS.scene, 14, 28, 1.4, 2.9, 0.08);
    place(rockL.scene, -18, 34, 1.3, 4.4, 0.2);
    place(bush.scene, -11, 22, 2.0, 0.2, 0.15);
    place(bush.scene, -16, 27, 2.4, 2.0, 0.15);
    place(bush.scene, -7, 18, 1.6, 4.0, 0.15);
    place(bush.scene, 14, 12, 2.0, 1.4, 0.15);
    place(bush.scene, -20, 16, 2.2, 3.0, 0.15);
    kenneyLoaded = true;
    applyKenneyVisibility();
  } catch (err) {
    console.warn('[poc] kenney load failed, procedural fallback', err);
  }
})();

/* ---------------- gun ---------------- */

const gun = new THREE.Group();
const layoutGunPos = new THREE.Vector3();
{
  const steel = new THREE.MeshLambertMaterial({ color: 0x848b93 });
  const steelDark = new THREE.MeshLambertMaterial({ color: 0x3c4147 });
  const walnut = new THREE.MeshLambertMaterial({ color: 0x7b5a38 });
  const glove = new THREE.MeshLambertMaterial({ color: 0x6a6a3e });
  // Viewmodel fill: real FPS guns are lit independently so they never go
  // black against a bright field. Emissive carries the albedo (a standard
  // viewmodel trick), the key light still models the top faces.
  steel.emissive.setHex(0x848b93); steel.emissiveIntensity = 0.35;
  steelDark.emissive.setHex(0x3c4147); steelDark.emissiveIntensity = 0.55;
  walnut.emissive.setHex(0x7b5a38); walnut.emissiveIntensity = 0.35;
  glove.emissive.setHex(0x6a6a3e); glove.emissiveIntensity = 0.35;
  const box = (w: number, h: number, l: number, mat: THREE.Material, x: number, y: number, z: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    m.position.set(x, y, z);
    gun.add(m);
  };
  box(0.024, 0.024, 0.66, steel, -0.013, 0.01, -0.42);
  box(0.024, 0.024, 0.66, steel, 0.013, 0.01, -0.42);
  box(0.012, 0.008, 0.62, steelDark, 0, 0.026, -0.42);
  box(0.05, 0.055, 0.14, steelDark, 0, 0.0, -0.03);
  box(0.042, 0.035, 0.26, walnut, 0, -0.02, -0.21);
  box(0.04, 0.05, 0.3, walnut, 0, -0.055, 0.16);
  box(0.062, 0.04, 0.11, glove, 0.004, -0.052, -0.22);
  box(0.03, 0.055, 0.09, glove, 0.042, -0.02, -0.22);
  box(0.075, 0.06, 0.09, glove, -0.01, -0.075, -0.1);
  camera.add(gun);
}
function layoutGun(): void {
  if (state.preset === 'old') {
    gun.position.set(0.125, -0.235, -0.4);
    gun.rotation.set(0.17, 0.36, 0.07);
  } else {
    gun.position.set(0.21, -0.25, -0.5);
    gun.rotation.set(0.1, 0.16, 0.04);
  }
  gun.scale.setScalar(state.gunScale);
  layoutGunPos.copy(gun.position);
}

/* ---------------- ridges: shaped silhouettes, not stripes ---------------- */

function gauss(x: number, c: number, s: number): number {
  const d = (x - c) / s;
  return Math.exp(-d * d);
}
function makeRidge(w: number, h: number, z: number, color: number, seed: number, peaks: Array<[number, number, number]>): void {
  const geo = new THREE.PlaneGeometry(w, h, 128, 1);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) <= 0) continue; // bottom row stays buried
    const x = pos.getX(i);
    let p = 10 + vnoise(x * 0.004 + seed, seed * 1.7, seed) * 22;
    for (const [c, amp, s] of peaks) p += gauss(x, c, s) * amp;
    pos.setY(i, -h / 2 + p);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
  );
  m.position.set(0, 0, z);
  scene.add(m);
}
makeRidge(1200, 110, -260, 0x5d5266, 11, [[-140, 46, 130], [190, 30, 100]]);
makeRidge(1500, 150, -430, 0x8d7a96, 47, [[80, 60, 150], [-330, 34, 110]]);
{
  // far ground skirt so no void gap shows between terrain edge and ridges.
  const skirt = new THREE.Mesh(
    new THREE.CircleGeometry(850, 48),
    new THREE.MeshLambertMaterial({ color: 0x8a6f3f }),
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.set(CAM0.x, -1.2, CAM0.z - 100);
  scene.add(skirt);
}

/* ---------------- apply state ---------------- */

function applyAll(): void {
  applyTod(state.tod);
  skyUniforms.uSoft.value = state.softClouds ? 1 : 0;
  key.castShadow = state.shadows;
  for (const o of shadowCasters) o.castShadow = state.shadows;
  layoutGun();
  buildTerrain();
  rebuildGrass();
  skyDome.position.copy(camera.position);
}

/* ---------------- input ---------------- */

let dragging = false;
let lx = 0;
let ly = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lx = e.clientX;
  ly = e.clientY;
});
window.addEventListener('pointerup', () => {
  dragging = false;
});
window.addEventListener('pointermove', (e) => {
  if (!dragging || CAPTURE) return;
  yaw -= (e.clientX - lx) * 0.0032;
  pitch = THREE.MathUtils.clamp(pitch - (e.clientY - ly) * 0.0028, -0.5, 0.45);
  lx = e.clientX;
  ly = e.clientY;
  applyLook();
});
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'c') rebuildGrass();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function bindUI(): void {
  const el = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
  const setPreset = (p: Preset): void => {
    const tod = state.tod;
    Object.assign(state, PRESETS[p], { tod });
    syncUI();
    applyAll();
  };
  (document.getElementById('poc-old') as HTMLButtonElement).onclick = () => setPreset('old');
  (document.getElementById('poc-new') as HTMLButtonElement).onclick = () => setPreset('new');
  el('poc-nearp').onchange = () => {
    state.nearCut = el('poc-nearp').checked;
    rebuildGrass();
  };
  el('poc-corp').onchange = () => {
    state.corridor = el('poc-corp').checked;
    rebuildGrass();
  };
  el('poc-shad').onchange = () => {
    state.shadows = el('poc-shad').checked;
    key.castShadow = state.shadows;
    for (const o of shadowCasters) o.castShadow = state.shadows;
  };
  el('poc-clou').onchange = () => {
    state.softClouds = el('poc-clou').checked;
    skyUniforms.uSoft.value = state.softClouds ? 1 : 0;
  };
  el('poc-ken').onchange = () => {
    kenneyOn = el('poc-ken').checked;
    applyKenneyVisibility();
  };
  el('poc-dens').oninput = () => {
    state.density = parseFloat(el('poc-dens').value);
    (document.getElementById('poc-densv') as HTMLElement).textContent = state.density.toFixed(2);
    rebuildGrass();
  };
  el('poc-gun').oninput = () => {
    state.gunScale = parseFloat(el('poc-gun').value);
    (document.getElementById('poc-gunv') as HTMLElement).textContent = state.gunScale.toFixed(2);
    layoutGun();
  };
  (document.getElementById('poc-tod') as HTMLSelectElement).onchange = (e) => {
    state.tod = (e.target as HTMLSelectElement).value as TimeOfDay;
    applyTod(state.tod);
  };
  (document.getElementById('poc-recut') as HTMLButtonElement).onclick = () => rebuildGrass();
}
function syncUI(): void {
  const el = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
  el('poc-nearp').checked = state.nearCut;
  el('poc-corp').checked = state.corridor;
  el('poc-shad').checked = state.shadows;
  el('poc-clou').checked = state.softClouds;
  el('poc-ken').checked = kenneyOn;
  el('poc-dens').value = String(state.density);
  el('poc-gun').value = String(state.gunScale);
  (document.getElementById('poc-densv') as HTMLElement).textContent = state.density.toFixed(2);
  (document.getElementById('poc-gunv') as HTMLElement).textContent = state.gunScale.toFixed(2);
  (document.getElementById('poc-tod') as HTMLSelectElement).value = state.tod;
  (document.getElementById('poc-old') as HTMLButtonElement).classList.toggle('active', state.preset === 'old');
  (document.getElementById('poc-new') as HTMLButtonElement).classList.toggle('active', state.preset === 'new');
}

/* ---------------- main loop ---------------- */

let lastT = performance.now();
let elapsed = 0;
let statT = 0;
function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  elapsed += dt;
  if (!CAPTURE) {
    const sp = (keys.has('shift') ? 7 : 3.2) * dt;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    if (keys.has('w')) {
      camera.position.x += fx * sp;
      camera.position.z += fz * sp;
    }
    if (keys.has('s')) {
      camera.position.x -= fx * sp;
      camera.position.z -= fz * sp;
    }
    if (keys.has('a')) {
      camera.position.x -= rx * sp;
      camera.position.z -= rz * sp;
    }
    if (keys.has('d')) {
      camera.position.x += rx * sp;
      camera.position.z += rz * sp;
    }
    camera.position.y = heightAt(camera.position.x, camera.position.z) + 1.7;
  }
  const aheadX = camera.position.x - Math.sin(yaw) * 30;
  const aheadZ = camera.position.z - Math.cos(yaw) * 30;
  key.target.position.set(aheadX, 0, aheadZ);
  key.position.set(aheadX + keyDir.x * 300, Math.max(keyDir.y, 0.06) * 300, aheadZ + keyDir.z * 300);
  fill.position.set(camera.position.x + keyDir.x * 200, 120, camera.position.z + keyDir.z * 200);
  fill.target.position.copy(camera.position);
  skyDome.position.copy(camera.position);
  gun.position.y = layoutGunPos.y + Math.sin(elapsed * 1.7) * 0.004;
  renderer.render(scene, camera);
  statT += dt;
  if (statT > 0.5) {
    statT = 0;
    const s = document.getElementById('poc-stats');
    if (s) {
      s.textContent =
        `${state.preset.toUpperCase()} · ${state.tod} · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`;
    }
  }
}

declare global {
  interface Window {
    __pocReady?: boolean;
    __poc?: {
      preset: () => Preset;
      info: () => { calls: number; triangles: number };
      debug: () => string[];
    };
  }
}

if (!CAPTURE) bindUI();
syncUI();
applyAll();
frame();

if (CAPTURE) {
  // Headless A/B waits for the authored props when they are switched on.
  void kenneyReady.then(() => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.__pocReady = true;
      }),
    );
  });
}
window.__poc = {
  preset: () => state.preset,
  info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  debug: () => {
    const out: string[] = [];
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const o of propKen.children) {
      box.setFromObject(o);
      box.getSize(v);
      const mats: string[] = [];
      o.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          const m = c.material as THREE.MeshStandardMaterial;
          mats.push(`${m.type} col=${m.color ? m.color.getHexString() : '?'} vc=${!!m.vertexColors}`);
        }
      });
      out.push(
        `pos=${o.position.x.toFixed(1)},${o.position.y.toFixed(2)},${o.position.z.toFixed(1)} ` +
        `size=${v.x.toFixed(2)}x${v.y.toFixed(2)}x${v.z.toFixed(2)} | ${mats.join(' ; ')}`,
      );
    }
    out.push(`propKen.visible=${propKen.visible} propProc.visible=${propProc.visible} n=${propKen.children.length}`);
    return out;
  },
};
