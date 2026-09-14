import * as THREE from 'three';
import { mulberry32 } from '../game/math';
import type { TimeOfDay } from './palette';

export type Quality = 'high' | 'lite';
export interface Ctx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  rng: () => number;
  events: EventTarget;
  quality: Quality;
  timeOfDay: TimeOfDay;
  time: number;
  fixedAlpha: number;
  paused: boolean;
  get<T extends Subsystem>(id: string): T;
}
export interface Subsystem {
  readonly id: string;
  init(ctx: Ctx): void | Promise<void>;
  fixedUpdate?(ctx: Ctx, dtMs: number): void;
  update?(ctx: Ctx, dt: number): void;
  /** View models render after the world, with their own depth buffer. */
  renderOverlay?(ctx: Ctx): void;
  dispose?(ctx: Ctx): void;
}
const FIXED_MS = 1000 / 30;

/** Finite backing resolution, independent of a Retina display's native DPR. */
export function renderPixelRatio(width: number, height: number, deviceRatio: number, quality: Quality): number {
  const pixelBudget = quality === 'lite' ? 1280 * 720 : 1920 * 1080;
  return Math.min(deviceRatio, Math.sqrt(pixelBudget / Math.max(1, width * height)));
}

export class Engine {
  readonly ctx: Ctx;
  private systems: Subsystem[] = [];
  private byId = new Map<string, Subsystem>();
  private accum = 0;
  private last = 0;
  private running = false;
  private disposed = false;
  private initialized: Subsystem[] = [];
  private frameId = 0;
  private abort = new AbortController();
  private frameTimes = new Float32Array(3600);
  private frameCursor = 0;
  private frameCount = 0;
  private maxFrameMs = 0;

  constructor(canvas: HTMLCanvasElement, quality: Quality, seed = 1971) {
    // Preserve thin vegetation edges even at the lightweight pixel budget.
    // The browser may decline multisampling; geometry and shadow savings
    // still distinguish the tiers independently of this context request.
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: quality === 'high' ? 'high-performance' : 'low-power' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    // Keep the directional shadow language on the lightweight tier, but use
    // a single depth sample there. Phones pay for every shadow-map sample on
    // the ground and dense low-poly cover; a hard shadow preserves the
    // contact/readability cue while avoiding the filter taps. Three.js 0.185
    // folds PCFSoftShadowMap into PCFShadowMap, so select the intended modes
    // explicitly instead of relying on the deprecated alias.
    renderer.shadowMap.type = quality === 'high' ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1600);
    const self = this;
    this.ctx = {
      scene: new THREE.Scene(), camera, renderer, rng: mulberry32(seed),
      events: new EventTarget(), quality, timeOfDay: 'morning', time: 0, fixedAlpha: 1, paused: false,
      get<T extends Subsystem>(id: string): T {
        const sys = self.byId.get(id);
        if (!sys) throw new Error(`subsystem not registered: ${id}`);
        return sys as T;
      },
    };
    let previousWidth = 0, previousHeight = 0, previousRatio = 0;
    const resize = () => {
      const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
      const ratio = renderPixelRatio(w, h, window.devicePixelRatio || 1, quality);
      if (w === previousWidth && h === previousHeight && ratio === previousRatio) return;
      previousWidth = w; previousHeight = h; previousRatio = ratio;
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Resizing clears the drawing buffer. A rotated, paused phone must
      // keep its field visible behind the menu without resuming the hunt.
      if (this.running && this.ctx.paused) this.renderOnce();
    };
    window.addEventListener('resize', resize, { signal: this.abort.signal });
    window.visualViewport?.addEventListener('resize', resize, { signal:this.abort.signal });
    resize();
  }
  register(sys: Subsystem): void { this.systems.push(sys); this.byId.set(sys.id, sys); }
  async start(progress?: (id: string, current: number, total: number) => void): Promise<boolean> {
    if (this.disposed) return false;
    for (let i = 0; i < this.systems.length; i++) {
      const system = this.systems[i];
      progress?.(system.id, i, this.systems.length);
      try {
        await system.init(this.ctx);
      } catch (error) {
        // An async asset load may own partial resources even when it fails.
        system.dispose?.(this.ctx);
        if (this.disposed) return false;
        this.dispose();
        throw error;
      }
      if (this.disposed) {
        // Loading can finish after pagehide. Release that late asset instead
        // of reviving a renderer whose page has already been left.
        system.dispose?.(this.ctx);
        return false;
      }
      this.initialized.push(system);
    }
    progress?.('ready', this.systems.length, this.systems.length);
    this.running = true;
    this.last = performance.now();
    this.frameId = requestAnimationFrame(this.frame);
    return true;
  }
  private frame = (now: number): void => {
    if (!this.running) return;
    const elapsed = Math.max(0, now - this.last);
    this.last = now;
    if (!this.ctx.paused) {
      const dt = Math.min(0.1, elapsed / 1000);
      this.frameTimes[this.frameCursor] = elapsed;
      this.frameCursor = (this.frameCursor + 1) % this.frameTimes.length;
      this.frameCount++;
      this.maxFrameMs = Math.max(this.maxFrameMs, elapsed);
      this.ctx.time += dt;
      this.accum += dt * 1000;
      while (this.accum >= FIXED_MS) {
        this.accum -= FIXED_MS;
        for (const sys of this.systems) sys.fixedUpdate?.(this.ctx, FIXED_MS);
      }
      this.ctx.fixedAlpha = this.accum / FIXED_MS;
      for (const sys of this.systems) sys.update?.(this.ctx, dt);
      this.renderFrame();
    }
    this.frameId = requestAnimationFrame(this.frame);
  };
  pause(paused: boolean): void {
    this.ctx.paused = paused;
    this.last = performance.now();
    this.ctx.events.dispatchEvent(new CustomEvent('pause', { detail: paused }));
  }
  renderOnce(): void {
    this.ctx.fixedAlpha = 1;
    for (const sys of this.systems) sys.update?.(this.ctx, 0);
    this.renderFrame();
  }
  private renderFrame(): void {
    const { renderer, scene, camera } = this.ctx;
    const autoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.info.reset();
    try {
      renderer.render(scene, camera);
      for (const sys of this.systems) sys.renderOverlay?.(this.ctx);
    } finally {
      renderer.info.autoReset = autoReset;
    }
  }
  telemetry() {
    const count = Math.min(this.frameCount, this.frameTimes.length);
    const samples = Array.from(this.frameTimes.subarray(0, count)).sort((a, b) => a - b);
    const pick = (p: number) => samples[Math.min(count - 1, Math.floor(count * p))] ?? 0;
    const renderer = this.ctx.renderer;
    return {
      quality: this.ctx.quality, paused: this.ctx.paused,
      resolution: { width: renderer.domElement.width, height: renderer.domElement.height, dpr: renderer.getPixelRatio() },
      render: { ...renderer.info.render }, memory: { ...renderer.info.memory },
      frameMs: { samples: count, totalFrames: this.frameCount, p50: pick(0.5), p95: pick(0.95), p99: pick(0.99), max: this.maxFrameMs },
    };
  }
  setTimeOfDay(tod: TimeOfDay): void {
    this.ctx.timeOfDay = tod;
    this.ctx.events.dispatchEvent(new CustomEvent('tod', { detail: tod }));
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.abort.abort();
    for (let i = this.initialized.length - 1; i >= 0; i--) this.initialized[i].dispose?.(this.ctx);
    this.initialized.length = 0;
    this.ctx.renderer.dispose();
  }
}
