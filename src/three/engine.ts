import * as THREE from 'three';
import { mulberry32 } from '../game/math';
import type { TimeOfDay } from './palette';
import { FrameTelemetry } from './frameTelemetry';
import { sampleVertexColorsInside } from './centroidColors';

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

/** An optional screen-effects pipeline that replaces the plain scene render. */
export interface RenderPipeline {
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  /** Drawing-buffer size in pixels. */
  setSize(width: number, height: number): void;
  dispose(): void;
}

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
  private frameTelemetry = new FrameTelemetry();
  private systemsReadyAtMs: number | null = null;
  private pipeline: RenderPipeline | null = null;
  private readonly drawingSize = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement, quality: Quality, seed = 1971) {
    // Multisampled thin strips must not extrapolate their vertex colours
    // (centroidColors.ts); this runs before any material compiles.
    sampleVertexColorsInside();
    // Preserve thin vegetation edges even at the lightweight pixel budget.
    // The browser may decline multisampling; geometry and shadow savings
    // still distinguish the tiers independently of this context request.
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: quality === 'high' ? 'high-performance' : 'low-power' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    // Filter both tiers: an unfiltered 1024 map turns a close dog's shadow
    // into large squares. Lite still uses one quarter of the shadow-map
    // texels and its smaller geometry/pixel budgets. Keep the broad coverage
    // for midground trees and rocks instead of shrinking it around the dog.
    renderer.shadowMap.type = THREE.PCFShadowMap;
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
      if (this.pipeline) {
        renderer.getDrawingBufferSize(this.drawingSize);
        this.pipeline.setSize(this.drawingSize.x, this.drawingSize.y);
      }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Resizing clears the drawing buffer. A rotated, paused phone must
      // keep its field visible behind the menu without resuming the hunt.
      if (this.running && this.ctx.paused) this.renderOnce();
    };
    window.addEventListener('resize', resize, { signal: this.abort.signal });
    window.visualViewport?.addEventListener('resize', resize, { signal:this.abort.signal });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      this.frameTelemetry.breakContinuity();
    }, { signal: this.abort.signal });
    resize();
  }
  register(sys: Subsystem): void { this.systems.push(sys); this.byId.set(sys.id, sys); }
  /** Render through a screen-effects pipeline, or directly when null. The
   * caller keeps a detached pipeline; the engine disposes the active one. */
  setPipeline(pipeline: RenderPipeline | null): void {
    if (pipeline === this.pipeline) return;
    this.pipeline = pipeline;
    if (!pipeline) return;
    this.ctx.renderer.getDrawingBufferSize(this.drawingSize);
    pipeline.setSize(this.drawingSize.x, this.drawingSize.y);
  }
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
    this.systemsReadyAtMs = this.last;
    this.resetTelemetry('startup');
    this.frameId = requestAnimationFrame(this.frame);
    return true;
  }
  private frame = (now: number): void => {
    if (!this.running) return;
    const elapsed = Math.max(0, now - this.last);
    this.last = now;
    if (!this.ctx.paused) {
      const dt = Math.min(0.1, elapsed / 1000);
      const fixedStart = performance.now();
      this.ctx.time += dt;
      this.accum += dt * 1000;
      while (this.accum >= FIXED_MS) {
        this.accum -= FIXED_MS;
        for (const sys of this.systems) sys.fixedUpdate?.(this.ctx, FIXED_MS);
      }
      this.ctx.fixedAlpha = this.accum / FIXED_MS;
      const updateStart = performance.now();
      for (const sys of this.systems) sys.update?.(this.ctx, dt);
      const renderStart = performance.now();
      this.renderFrame();
      this.frameTelemetry.record(elapsed, updateStart - fixedStart, renderStart - updateStart,
        performance.now() - renderStart, this.ctx.renderer.info.render, this.ctx.renderer.info.memory,
        typeof document === 'undefined' || document.visibilityState !== 'hidden');
    }
    this.frameId = requestAnimationFrame(this.frame);
  };
  pause(paused: boolean): void {
    this.ctx.paused = paused;
    this.last = performance.now();
    this.frameTelemetry.breakContinuity();
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
      if (this.pipeline) this.pipeline.render(renderer, scene, camera);
      else renderer.render(scene, camera);
      for (const sys of this.systems) sys.renderOverlay?.(this.ctx);
    } finally {
      renderer.info.autoReset = autoReset;
    }
  }
  resetTelemetry(label = 'manual'): void {
    this.frameTelemetry.reset(label, performance.now(), this.ctx.renderer.info.memory);
  }
  telemetry() {
    const measurement = this.frameTelemetry.snapshot(performance.now());
    const renderer = this.ctx.renderer;
    return {
      quality: this.ctx.quality, paused: this.ctx.paused,
      resolution: { width: renderer.domElement.width, height: renderer.domElement.height, dpr: renderer.getPixelRatio() },
      render: { ...renderer.info.render }, memory: { ...renderer.info.memory },
      frameMs: { ...measurement.frameMs, totalFrames: measurement.framesRecorded },
      measurement,
      loading: { systemsReadySinceNavigationMs: this.systemsReadyAtMs },
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
    this.pipeline?.dispose();
    this.pipeline = null;
    this.ctx.renderer.dispose();
  }
}
