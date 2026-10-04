/**
 * Live dog preview for the menus: the real in-game dog renderers (smooth and
 * faceted) on a small sunlit turntable. It runs the same runtime systems as
 * the field, driven by a fixture hunt, so what the player picks here is what
 * walks out of the truck.
 *
 * Loaded on demand (dynamic import) so the menus open without WebGL.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Dog } from '../game/dog';
import { getBreed } from '../game/breeds';
import { getArea } from '../game/areas';
import { mulberry32 } from '../game/math';
import type { Ctx, Quality, Subsystem } from './engine';
import { fieldTimeOfDay } from './palette';
import { GeneratedDogSystem } from './subsystems/generatedDog';
import { generatedCoatFor } from './dogs/generatedGsp';
import type { DogStyle } from './dogs/dogStyle';
import type { ModeledBreedId } from '../game/dogCoats';

export type PreviewBreed = ModeledBreedId;
export type PreviewPose = 'stand' | 'point' | 'trot' | 'run';
export interface PreviewDog { breed: PreviewBreed; coat: string; style: DogStyle; label?: string }
export interface DogPreview {
  /** Show one dog, or several side by side (for comparing styles or a brace). */
  show(dogs: readonly PreviewDog[]): void;
  setPose(pose: PreviewPose): void;
  /** Suspend rendering while the preview is off screen. */
  setActive(active: boolean): void;
  dispose(): void;
}
export interface DogPreviewOptions {
  quality?: Quality;
  autoRotate?: boolean;
  /** Called once the first frame with dogs has been drawn. */
  onReady?: () => void;
  /** Draw the turf disc (default); portraits keep only the dog and its shadow. */
  ground?: boolean;
}

const STEP = 1 / 60;
const PACE: Record<PreviewPose, number> = { stand: 0, point: 0, trot: 2, run: 5.2 };
const AREA = getArea('quail-fields');

interface Panel {
  spec: PreviewDog; scene: THREE.Scene; camera: THREE.PerspectiveCamera; ctx: Ctx;
  system: Subsystem & { update(ctx: Ctx, dt: number): void }; dog: Dog;
  lights: THREE.Light[]; ground: THREE.Mesh; shadow: THREE.Mesh;
}

/** A soft, painterly turf disc: warm field colour fading to transparent. */
function groundTexture(): THREE.CanvasTexture {
  const size = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const rng = mulberry32(77);
  g.fillStyle = '#8e8a62'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const x = rng() * size, y = rng() * size, l = 2 + rng() * 7;
    g.strokeStyle = rng() < .5 ? '#a39c6c' : rng() < .5 ? '#77774f' : '#b3a878';
    g.globalAlpha = .35 + rng() * .4; g.lineWidth = .8 + rng();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - .5) * 2, y - l); g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(9, 9);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
function fadeTexture(): THREE.CanvasTexture {
  const size = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!, r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0, '#fff'); r.addColorStop(.3, '#fff'); r.addColorStop(.75, '#555'); r.addColorStop(1, '#000');
  g.fillStyle = r; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createDogPreview(container: HTMLElement, options: DogPreviewOptions = {}): DogPreview {
  const quality: Quality = options.quality ?? (Math.min(innerWidth, innerHeight) < 700 ? 'lite' : 'high');
  const canvas = document.createElement('canvas');
  canvas.className = 'dog-preview-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 80);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false; controls.enableZoom = true; controls.minDistance = 1.6; controls.maxDistance = 6;
  controls.minPolarAngle = .5; controls.maxPolarAngle = 1.45;
  controls.enableDamping = true; controls.dampingFactor = .08;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotate = (options.autoRotate ?? true) && !reduced; controls.autoRotateSpeed = .9;
  let resumeTimer = 0;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer); });
  controls.addEventListener('end', () => {
    clearTimeout(resumeTimer);
    if ((options.autoRotate ?? true) && !reduced) resumeTimer = window.setTimeout(() => { controls.autoRotate = true; }, 5000);
  });
  const turf = groundTexture(), fade = fadeTexture();
  let panels: Panel[] = [], pose: PreviewPose = 'stand', travel = 0, time = 0, active = true, raf = 0, ready = false;
  let accumulator = 0, previous = performance.now();

  function makePanel(spec: PreviewDog, index: number): Panel {
    const scene = new THREE.Scene();
    const dog = new Dog({ x: 0, y: 0 }, { breed: getBreed(spec.breed), level: 8, ageMult: 1 }, mulberry32(1881 + index));
    dog.heading = Math.PI / 2; dog.state = 'heel'; dog.gait = 'still';
    const hunt = {
      areaConfig: () => AREA, dog: () => dog,
      dropPoint: () => AREA.dropPoints[0],
      dogRenderWorld: (_alpha: number, out: { x: number; z: number }) => Object.assign(out, { x: 0, z: travel }),
      dogWorld: (out: { x: number; z: number }) => Object.assign(out, { x: 0, z: travel }),
      dogRenderHeading: () => Math.PI / 2, dogRenderTravelHeading: () => Math.PI / 2,
      huntState: () => ({ areaId: AREA.id, birds: [{ id: 1, speciesId: 'bobwhite', pos: { x: 0, y: travel + 3 } }] }),
      simToWorld: (x: number, z: number, out: { x: number; z: number }) => Object.assign(out, { x, z }),
      coverPatches: () => [],
    };
    const terrain = { heightAt: () => 0 };
    const birds = { markingTarget: () => false, groundedTarget: () => false };
    const panelCamera = camera.clone();
    const ctx = { scene, camera: panelCamera, renderer, quality, timeOfDay: 'morning', time: 0, fixedAlpha: 1,
      paused: false, rng: mulberry32(31 + index), events: new EventTarget(),
      get: (id: string) => {
        if (id === 'hunt3d') return hunt;
        if (id === 'terrain') return terrain;
        if (id === 'birds') return birds;
        throw new Error(`Dog preview has no subsystem: ${id}`);
      },
    } as unknown as Ctx;
    const spec3 = fieldTimeOfDay(AREA.id, 'morning');
    const sun = new THREE.DirectionalLight(spec3.sunColor, spec3.sunIntensity * 1.05); sun.castShadow = true;
    sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: .1, far: 30 });
    sun.shadow.bias = -.0002; sun.shadow.normalBias = .02; sun.shadow.radius = 3;
    const fill = new THREE.DirectionalLight(spec3.fillColor, spec3.fillIntensity * 1.2);
    const rim = new THREE.DirectionalLight(0xfff0d6, .55);
    const hemi = new THREE.HemisphereLight(spec3.ambientSky, spec3.ambientGround, spec3.ambientIntensity * 1.1);
    scene.add(sun, sun.target, fill, fill.target, rim, rim.target, hemi);
    renderer.toneMappingExposure = spec3.exposure;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(2.1, 64),
      new THREE.MeshLambertMaterial({ map: turf, alphaMap: fade, transparent: true, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.002; ground.visible = options.ground ?? true; scene.add(ground);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.ShadowMaterial({ opacity: .42, transparent: true }));
    shadow.rotation.x = -Math.PI / 2; shadow.receiveShadow = true; scene.add(shadow);
    // Both looks draw on the field's skinned rig, exactly as they hunt.
    const system = new GeneratedDogSystem(generatedCoatFor(spec.breed, spec.coat), 0,
      spec.style) as unknown as Panel['system'];
    system.init(ctx);
    return { spec, scene, camera: panelCamera, ctx, system, dog, lights: [sun, fill, rim, hemi], ground, shadow };
  }
  function placeLights(p: Panel): void {
    const spec = fieldTimeOfDay(AREA.id, 'morning');
    const az = THREE.MathUtils.degToRad(spec.sunAzimuth + 35), el = THREE.MathUtils.degToRad(Math.max(46, spec.sunElevation));
    const [sun, fill, rim] = p.lights as THREE.DirectionalLight[];
    sun.position.set(Math.sin(az) * Math.cos(el) * 8, Math.sin(el) * 8, travel + Math.cos(az) * Math.cos(el) * 8); sun.target.position.set(0, 0, travel);
    fill.position.set(-Math.sin(az) * 6, 5, travel - Math.cos(az) * 6); fill.target.position.set(0, .3, travel);
    rim.position.set(-Math.sin(az) * 3, 3, travel + Math.cos(az) * -8); rim.target.position.set(0, .4, travel);
    p.ground.position.z = p.shadow.position.z = travel;
    (p.ground.material as THREE.MeshLambertMaterial).map!.offset.set(0, -travel / (4.2 / 9));
  }
  function applyPose(speed: number): void {
    for (const p of panels) {
      p.dog.state = pose === 'point' ? 'pointing' : speed > .03 ? 'quartering' : 'heel';
      p.dog.gait = speed <= .03 ? 'still' : speed < 1.4 ? 'track' : speed >= 4.8 ? 'run' : 'trot';
      p.dog.pointedBirdId = pose === 'point' ? 1 : null;
      p.dog.scentStage = 'none'; p.dog.scentProgress = 0;
    }
  }
  function advance(dt: number, move = true): void {
    const speed = move ? PACE[pose] : 0;
    applyPose(speed);
    const delta = speed * dt; time += dt; travel += delta;
    camera.position.z += delta; controls.target.z += delta;
    for (const p of panels) { p.ctx.time = time; p.dog.pos.y = travel; p.system.update(p.ctx, dt); placeLights(p); }
  }
  function frameCamera(): void {
    const wide = panels.length > 1 && container.clientWidth < container.clientHeight * 1.2;
    const distance = wide ? 3.3 : panels.length > 1 ? 3.1 : 2.7;
    const direction = new THREE.Vector3(.72, .3, .64).normalize();
    controls.target.set(0, .42, .12 + travel);
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    controls.update();
  }
  function disposePanels(): void {
    for (const p of panels) {
      p.system.dispose?.(p.ctx);
      for (const light of p.lights) light.dispose();
      p.ground.geometry.dispose(); (p.ground.material as THREE.Material).dispose();
      p.shadow.geometry.dispose(); (p.shadow.material as THREE.Material).dispose();
    }
    panels = [];
  }
  function render(): void {
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    const ratio = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) renderer.setSize(width, height, false);
    renderer.setScissorTest(true);
    renderer.clear();
    // Side by side on wide stages, stacked on tall ones.
    const across = width >= height * 1.2 || panels.length === 1;
    panels.forEach((p, i) => {
      const n = panels.length;
      const w = across ? Math.floor(width / n) : width, h = across ? height : Math.floor(height / n);
      const left = across ? i * w : 0, bottom = across ? 0 : (n - 1 - i) * h;
      p.camera.position.copy(camera.position); p.camera.quaternion.copy(camera.quaternion);
      p.camera.fov = camera.fov; p.camera.aspect = w / h; p.camera.updateProjectionMatrix();
      renderer.setViewport(left, bottom, w, h); renderer.setScissor(left, bottom, w, h);
      renderer.render(p.scene, p.camera);
    });
  }
  function frame(now: number): void {
    raf = 0;
    if (!active || document.hidden) return;
    const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 4) { advance(STEP); accumulator -= STEP; steps++; }
    if (steps === 4) accumulator = 0;
    controls.update();
    render();
    if (!ready && panels.length) { ready = true; options.onReady?.(); }
    raf = requestAnimationFrame(frame);
  }
  function start(): void { if (!raf && active) { previous = performance.now(); raf = requestAnimationFrame(frame); } }
  const onVisibility = () => { if (!document.hidden) start(); };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    show(dogs) {
      const same = dogs.length === panels.length && dogs.every((d, i) => d.breed === panels[i].spec.breed && d.coat === panels[i].spec.coat && d.style === panels[i].spec.style);
      if (same) return;
      disposePanels(); travel = 0; time = 0;
      panels = dogs.map(makePanel);
      // Settle standing contact before the first visible frame.
      for (let i = 0; i < 50; i++) advance(STEP, false);
      frameCamera(); render(); start();
    },
    setPose(next) { pose = next; start(); },
    setActive(value) { active = value; if (value) start(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    dispose() {
      active = false; if (raf) cancelAnimationFrame(raf); clearTimeout(resumeTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      controls.dispose(); disposePanels(); turf.dispose(); fade.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
