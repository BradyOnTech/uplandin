/**
 * Browser half of tools3d/dog-motion-bench.mjs: the actual runtime dog
 * renderer (GeneratedDogSystem and its contact solver) for each breed, side
 * by side, driven by a recorded hunt trace or a synthetic run, on the same
 * terrain triangulation the game draws. Every breed gets the identical travel,
 * camera and light; only the renderer's source differs between a before and
 * an after run (the driver bundles this file against either checkout).
 *
 * Staged review only: the hunt simulation is replaced by its recorded output.
 */
import * as THREE from 'three';
import { GeneratedDogSystem } from '../src/three/subsystems/generatedDog';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { fieldTimeOfDay } from '../src/three/palette';
import { buildQuailTerrainGeometry } from '../src/three/subsystems/quailTerrain';
import { quailGroundTileAt, quailGroundTiles } from '../src/three/subsystems/quailGroundGeometry';
import type { Ctx } from '../src/three/engine';

interface Tick {
  t: number; x: number; z: number; heading: number; travel: number;
  state: string; gait: string; scent: string; progress: number; waiting: boolean; creeping: boolean;
  slam: number | null; carrying: number | null; reserved: number | null; holdMs: number;
  hunter: [number, number]; reach: [number, number, number] | null; watch: [number, number, number] | null;
}
interface Segment {
  name: string; ticks: Tick[]; ground: 'chukar' | 'flat' | 'slope';
  slope?: number; cover?: { height: number; z0: number; z1: number };
  side?: 'left' | 'heading'; patches?: { cx: number; cz: number; hx: number; hz: number }[];
}
interface Config {
  quality: 'high' | 'lite'; breeds: string[]; views: string[]; fps: number; segments: Segment[];
  panel: { w: number; h: number }; label: string;
}
type Save = (name: string, data: string) => Promise<void>;
declare global { interface Window { benchConfig: Config; saveFrame: Save; benchDone?: unknown; benchError?: string; benchProgress?: string } }

const COATS: Record<string, { coat: string; look: 'smooth' | 'faceted' }> = {
  gsp: { coat: 'liver-roan', look: 'smooth' },
  'english-setter': { coat: 'orange-belton', look: 'faceted' },
  griffon: { coat: 'steel-gray', look: 'faceted' },
};
/** Chukar near-terrain divisions per 128 yd tile (CHUKAR_GROUND_DETAIL). */
const CHUKAR_DIVISIONS = { high: 48, lite: 32 } as const;
const VIEW_ROWS: Record<string, { fov: number; full?: [number, number] }> = {
  side: { fov: 30 }, eye: { fov: 70, full: [1920, 1080] }, look: { fov: 30, full: [1920, 1080] },
};

const area = getArea('chukar-ridge');
const landscape = new LandscapeModel(area, 'south-gate');
const toProperty = { x: 0, y: 0 };

/** The rendered near-terrain surface: the exact triangles the game draws. */
function chukarMeshHeight(x: number, z: number, divisions: number): number {
  landscape.worldToProperty(x, z, toProperty);
  const tile = quailGroundTileAt(landscape, toProperty.x, toProperty.y);
  const u = THREE.MathUtils.clamp((toProperty.x - tile.x) / tile.width * divisions, 0, divisions - 1e-6);
  const v = THREE.MathUtils.clamp((toProperty.y - tile.y) / tile.depth * divisions, 0, divisions - 1e-6);
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const h = (a: number, b: number) => landscape.heightAtProperty(tile.x + a / divisions * tile.width, tile.y + b / divisions * tile.depth);
  // Triangles (a, b, a+1) and (a+1, b, b+1): the diagonal runs from (i+1, j) to (i, j+1).
  if (fu + fv <= 1) { const h00 = h(i, j); return h00 + fu * (h(i + 1, j) - h00) + fv * (h(i, j + 1) - h00); }
  const h11 = h(i + 1, j + 1);
  return h11 + (1 - fu) * (h(i, j + 1) - h11) + (1 - fv) * (h(i + 1, j) - h11);
}

/** A matte ground with a faint one-metre grid, so a slipping paw shows. */
function groundMaterial(color: number): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color, vertexColors: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBenchWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBenchWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBenchWorld;')
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 cell = abs(fract(vBenchWorld.xz) - .5);
float width = fwidth(vBenchWorld.x) + fwidth(vBenchWorld.z);
float line = 1. - smoothstep(.0, max(width, .012), .5 - max(cell.x, cell.y));
diffuseColor.rgb *= 1. - line * .16 * (1. - smoothstep(.04, .18, width));`);
  };
  return material;
}

function groundFor(segment: Segment, quality: 'high' | 'lite'): { meshes: THREE.Mesh[]; height: (x: number, z: number) => number; mesh: (x: number, z: number) => number } {
  if (segment.ground === 'chukar') {
    const divisions = CHUKAR_DIVISIONS[quality];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const t of segment.ticks) for (const [x, z] of [[t.x, t.z], t.hunter]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const material = groundMaterial(0xb39a66);
    const meshes = quailGroundTiles(landscape).filter(tile => {
      const a = landscape.propertyToWorld(tile.x, tile.y, { x: 0, z: 0 }), b = landscape.propertyToWorld(tile.x + tile.width, tile.y + tile.depth, { x: 0, z: 0 });
      return b.x > minX - 120 && a.x < maxX + 120 && b.z > minZ - 120 && a.z < maxZ + 120;
    }).map(tile => {
      const mesh = new THREE.Mesh(buildQuailTerrainGeometry(landscape, tile.x, tile.y, tile.width, tile.depth, divisions,
        (_l, _x, _y, color) => color.setRGB(1, 1, 1)), material);
      mesh.receiveShadow = true; return mesh;
    });
    return { meshes, height: (x, z) => landscape.heightAtWorld(x, z), mesh: (x, z) => chukarMeshHeight(x, z, divisions) };
  }
  const slope = segment.ground === 'slope' ? segment.slope ?? .5 : 0;
  const geometry = new THREE.PlaneGeometry(400, 400, slope ? 200 : 1, slope ? 200 : 1);
  geometry.rotateX(-Math.PI / 2);
  if (slope) { const p = geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) p.setY(i, p.getX(i) * slope); geometry.computeVertexNormals(); }
  const mesh = new THREE.Mesh(geometry, groundMaterial(0x9c9a7c)); mesh.receiveShadow = true;
  const height = (x: number) => x * slope;
  return { meshes: [mesh], height, mesh: height };
}

interface Panel {
  breed: string; scene: THREE.Scene; system: GeneratedDogSystem; ctx: Ctx; sun: THREE.DirectionalLight;
  view: Tick; prev: Tick; alpha: number;
}

function makePanel(breed: string, segment: Segment, ground: ReturnType<typeof groundFor>, quality: 'high' | 'lite', clock: { tick: Tick; prev: Tick; alpha: number }): Panel {
  const scene = new THREE.Scene();
  const spec = fieldTimeOfDay('chukar-ridge', 'morning');
  scene.background = new THREE.Color(spec.skyHorizon);
  scene.fog = new THREE.FogExp2(spec.fogColor, .0035);
  const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
  const sun = new THREE.DirectionalLight(spec.sunColor, spec.sunIntensity); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .5, far: 60 });
  sun.shadow.bias = -.0002; sun.shadow.normalBias = .02;
  // Light the side the bench looks at, high and a little ahead, so the
  // limbs read; the hour's colours and strengths stay Chukar morning.
  sun.userData.dir = new THREE.Vector3(-.55, .78, .3).normalize();
  const fill = new THREE.DirectionalLight(spec.fillColor, spec.fillIntensity); fill.position.set(-Math.sin(az), .8, -Math.cos(az));
  const hemi = new THREE.HemisphereLight(spec.ambientSky, spec.ambientGround, spec.ambientIntensity);
  scene.add(sun, sun.target, fill, hemi);
  for (const mesh of ground.meshes) scene.add(mesh.clone());
  const { coat, look } = COATS[breed];
  const dogView = {
    get state() { return clock.tick.state; }, get gait() { return clock.tick.gait; },
    get scentStage() { return clock.tick.scent; }, get scentProgress() { return clock.tick.progress; },
    get waitingForHandler() { return clock.tick.waiting; }, get creeping() { return clock.tick.creeping; },
    get carryingBirdId() { return clock.tick.carrying; },
    slamProgress: () => clock.tick.slam, reservedRetrieveId: () => clock.tick.reserved,
    retrieveHoldTimeMs: () => clock.tick.holdMs, watchedBirdIds: () => clock.tick.watch ? [1] : [],
  };
  const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  const hunt = {
    areaConfig: () => area, dropPoint: () => landscape.dropPoint, dog: () => dogView,
    dogRenderWorld: (_alpha: number, out: { x: number; z: number }) => {
      out.x = clock.prev.x + (clock.tick.x - clock.prev.x) * clock.alpha; out.z = clock.prev.z + (clock.tick.z - clock.prev.z) * clock.alpha; return out;
    },
    dogRenderHeading: () => lerpAngle(clock.prev.heading, clock.tick.heading, clock.alpha),
    dogRenderTravelHeading: () => lerpAngle(clock.prev.travel, clock.tick.travel, clock.alpha),
    huntState: () => ({ birds: [{ id: clock.tick.carrying ?? clock.tick.reserved ?? 1, speciesId: 'chukar' }] }),
    coverPatches: () => segment.patches ?? [],
  };
  const systems: Record<string, unknown> = {
    // The drawn surface too, for a renderer that plants paws on it.
    hunt3d: hunt, terrain: { heightAt: ground.height, surfaceHeightAt: ground.mesh },
    birds: {
      markingTarget: (_ids: readonly number[], out: THREE.Vector3) => !!clock.tick.watch && !!out.set(...clock.tick.watch),
      groundedTarget: (_id: number, out: THREE.Vector3) => !!clock.tick.reach && !!out.set(...clock.tick.reach),
    },
    grass: { launchHeightAt: (_x: number, z: number) => segment.cover && z >= segment.cover.z0 && z <= segment.cover.z1 ? segment.cover.height : 0 },
  };
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 2000);
  const ctx = { scene, camera, quality, timeOfDay: 'morning', time: 0, fixedAlpha: 1, paused: false, events: new EventTarget(),
    rng: Math.random, get: (id: string) => { if (id in systems) return systems[id]; throw new Error(`bench has no ${id}`); } } as unknown as Ctx;
  const system = new GeneratedDogSystem(coat as never, 0, look);
  system.init(ctx);
  return { breed, scene, system, ctx, sun, view: clock.tick, prev: clock.prev, alpha: 0 };
}

/** Joints and contacts the driver turns into the motion numbers. */
function sample(panel: Panel, ground: ReturnType<typeof groundFor>, ms: number) {
  const audit = panel.system.snapshot() as unknown as {
    gait: string; speed: number; clamped: number; moving: boolean; root: number[];
    feet: { i: number; locked: boolean; step: number; plantId: number; actual: number[]; groundGap: number }[];
  };
  const motion = (panel.system as unknown as { motion: { asset: { joints: Record<string, THREE.Bone>; root: THREE.Object3D } } }).motion;
  const { joints, root } = motion.asset;
  const q = joints.body.getWorldQuaternion(new THREE.Quaternion());
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), root.rotation.y);
  const local = yaw.invert().multiply(q), e = new THREE.Euler().setFromQuaternion(local, 'YXZ');
  const head = joints.head.getWorldPosition(new THREE.Vector3()), tail = joints.tail.getWorldQuaternion(new THREE.Quaternion());
  const tailDir = new THREE.Vector3(0, 0, -1).applyQuaternion(tail);
  const body = joints.body.getWorldPosition(new THREE.Vector3());
  return {
    gait: audit.gait, speed: +audit.speed.toFixed(3), clamped: audit.clamped, moving: audit.moving, ms: +ms.toFixed(3),
    root: audit.root.map(v => +v.toFixed(4)), yaw: +root.rotation.y.toFixed(4),
    pitch: +e.x.toFixed(4), roll: +e.z.toFixed(4), bodyY: +(body.y - audit.root[1]).toFixed(4),
    head: [+head.x.toFixed(4), +head.y.toFixed(4), +head.z.toFixed(4)], tailUp: +tailDir.y.toFixed(3),
    feet: audit.feet.map(f => ({ i: f.i, locked: f.locked, step: +f.step.toFixed(3), plant: f.plantId,
      p: f.actual.map(v => +v.toFixed(4)), gap: +f.groundGap.toFixed(4),
      meshGap: +(f.actual[1] - ground.mesh(f.actual[0], f.actual[2]) - .023).toFixed(4) })),
  };
}

async function run(): Promise<void> {
  const config = window.benchConfig;
  const pw = config.panel.w, rows = config.views.map(v => ({ view: v, h: v === 'side' ? config.panel.h : Math.round(pw * 9 / 16) }));
  const width = pw * config.breeds.length, height = rows.reduce((n, r) => n + r.h, 0);
  const canvas = document.createElement('canvas'); document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMappingExposure = fieldTimeOfDay('chukar-ridge', 'morning').exposure;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 2000);
  const result: Record<string, unknown> = { quality: config.quality, label: config.label, segments: [],
    gl: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  for (const segment of config.segments) {
    const ground = groundFor(segment, config.quality);
    const clock = { tick: segment.ticks[0], prev: segment.ticks[0], alpha: 1 };
    const panels = config.breeds.map(breed => makePanel(breed, segment, ground, config.quality, clock));
    const samples: Record<string, ReturnType<typeof sample>[]> = Object.fromEntries(config.breeds.map(b => [b, []]));
    // Smoothed camera rigs, shared by every panel so the breeds stay matched.
    const smooth = { x: segment.ticks[0].x, z: segment.ticks[0].z, heading: segment.ticks[0].heading, look: new THREE.Vector3() };
    const t0 = segment.ticks[0].t, t1 = segment.ticks.at(-1)!.t, dt = 1 / 60;
    const frames = Math.floor((t1 - t0) / dt);
    const every = Math.max(1, Math.round(60 / config.fps));
    let saved = 0;
    for (let frame = 0; frame <= frames; frame++) {
      const t = t0 + frame * dt, u = (t - t0) * 30, index = Math.min(segment.ticks.length - 1, Math.floor(u) + 1);
      clock.prev = segment.ticks[index - 1] ?? segment.ticks[0]; clock.tick = segment.ticks[index];
      clock.alpha = index >= segment.ticks.length - 1 && u >= segment.ticks.length - 1 ? 1 : u - Math.floor(u);
      for (const panel of panels) {
        panel.ctx.time = t; (panel.ctx as { fixedAlpha: number }).fixedAlpha = clock.alpha;
        const start = performance.now();
        panel.system.update(panel.ctx, frame === 0 ? 0 : dt);
        samples[panel.breed].push(sample(panel, ground, performance.now() - start));
      }
      const x = clock.prev.x + (clock.tick.x - clock.prev.x) * clock.alpha, z = clock.prev.z + (clock.tick.z - clock.prev.z) * clock.alpha;
      const k = 1 - Math.exp(-dt / .15);
      smooth.x += (x - smooth.x) * k; smooth.z += (z - smooth.z) * k;
      smooth.heading += Math.atan2(Math.sin(clock.tick.travel - smooth.heading), Math.cos(clock.tick.travel - smooth.heading)) * (1 - Math.exp(-dt / 1.4));
      if (frame % every) continue;
      let top = 0;
      for (const row of rows) {
        const spec = VIEW_ROWS[row.view];
        const gy = ground.height(smooth.x, smooth.z);
        if (row.view === 'side') {
          // Broadside from the dog's left, following its smoothed line.
          const h = segment.side === 'left' ? Math.PI / 2 : smooth.heading;
          const lx = Math.cos(h + Math.PI / 2), lz = Math.sin(h + Math.PI / 2);
          const cx = smooth.x + lx * 4.2, cz = smooth.z + lz * 4.2;
          camera.position.set(cx, Math.max(gy + .62, ground.height(cx, cz) + .45), cz);
          camera.lookAt(smooth.x, gy + .36, smooth.z);
          camera.fov = spec.fov; camera.aspect = pw / row.h; camera.clearViewOffset();
        } else {
          const [hx, hz] = clock.tick.hunter;
          camera.position.set(hx, ground.height(hx, hz) + 1.7, hz);
          camera.lookAt(smooth.x, gy + .35, smooth.z);
          camera.fov = spec.fov; camera.aspect = spec.full![0] / spec.full![1];
          camera.clearViewOffset(); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
          // A 1:1 window of the full frame round the dog: the pixels a player gets.
          const p = new THREE.Vector3(x, ground.height(x, z) + .35, z).project(camera);
          const cx = (p.x * .5 + .5) * spec.full![0], cy = (.5 - p.y * .5) * spec.full![1];
          camera.setViewOffset(spec.full![0], spec.full![1], Math.round(cx - pw / 2), Math.round(cy - row.h / 2), pw, row.h);
        }
        camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        panels.forEach((panel, i) => {
          // Each dog's shadow map is drawn once a frame, on its first view.
          renderer.shadowMap.needsUpdate = row === rows[0];
          const root = (panel.system as unknown as { motion: { asset: { root: THREE.Object3D } } }).motion.asset.root;
          const dir = panel.sun.userData.dir as THREE.Vector3;
          panel.sun.target.position.copy(root.position); panel.sun.position.copy(root.position).addScaledVector(dir, 25);
          renderer.setViewport(i * pw, height - top - row.h, pw, row.h); renderer.setScissor(i * pw, height - top - row.h, pw, row.h);
          renderer.setScissorTest(true); renderer.render(panel.scene, camera);
        });
        top += row.h;
      }
      await window.saveFrame(`${segment.name}/${String(saved++).padStart(5, '0')}.jpg`, canvas.toDataURL('image/jpeg', .88));
      if (frame % 300 === 0) window.benchProgress = `${segment.name} ${frame}/${frames}`;
    }
    (result.segments as unknown[]).push({ name: segment.name, t0, t1, frames: saved, rows, samples });
    for (const panel of panels) (panel.system as unknown as { dispose(): void }).dispose();
    for (const mesh of ground.meshes) mesh.geometry.dispose();
  }
  window.benchDone = result;
}
run().catch(error => { window.benchError = String(error?.stack ?? error); });
