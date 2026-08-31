import * as THREE from 'three';
import { mulberry32 } from '../game/math';
import type { TimeOfDay } from './palette';

/*
 * The 3D engine contract (see ARCHITECTURE-3D.md). Lifted from what worked
 * in Claude-of-Duty's OVERWATCH contract, sized for Uplandin:
 *
 *  - Subsystems own a file/directory and NEVER import each other's modules.
 *    Cross-talk goes through ctx.get(id) at runtime or ctx.events.
 *  - Deterministic randomness only: ctx.rng, never Math.random().
 *  - Allocate nothing per frame — preallocate vectors and reuse.
 *  - Every subsystem implements the Subsystem lifecycle.
 *
 * Mobile is a design constraint, not a port: budgets live in the contract
 * doc, quality tiers in ctx.quality ('high' desktop / 'lite' mobile).
 */

export type Quality = 'high' | 'lite';

export interface Ctx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  rng: () => number;
  events: EventTarget;
  quality: Quality;
  timeOfDay: TimeOfDay;
  /** Seconds since boot (render clock). */
  time: number;
  /** Fraction from the previous fixed snapshot to the current one. */
  fixedAlpha: number;
  get<T extends Subsystem>(id: string): T;
}

export interface Subsystem {
  readonly id: string;
  init(ctx: Ctx): void | Promise<void>;
  /** Fixed 30 Hz simulation step (dtMs constant). */
  fixedUpdate?(ctx: Ctx, dtMs: number): void;
  /** Per-frame, variable dt seconds. */
  update?(ctx: Ctx, dt: number): void;
  dispose?(ctx: Ctx): void;
}

const FIXED_MS = 1000 / 30;

export class Engine {
  readonly ctx: Ctx;
  private systems: Subsystem[] = [];
  private byId = new Map<string, Subsystem>();
  private accum = 0;
  private last = 0;
  private running = false;

  constructor(canvas: HTMLCanvasElement, quality: Quality, seed = 1971) {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality === 'high',
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // DPR cap: retina is beautiful and merciless; 2 is the ceiling even on
    // desktop, 1.5 on lite (mobile GPUs pay per pixel).
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5));

    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900);
    const scene = new THREE.Scene();

    const self = this;
    this.ctx = {
      scene,
      camera,
      renderer,
      rng: mulberry32(seed),
      events: new EventTarget(),
      quality,
      timeOfDay: 'dawn',
      time: 0,
      fixedAlpha: 1,
      get<T extends Subsystem>(id: string): T {
        const s = self.byId.get(id);
        if (!s) throw new Error(`subsystem not registered: ${id}`);
        return s as T;
      },
    };

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();
  }

  register(sys: Subsystem): void {
    this.systems.push(sys);
    this.byId.set(sys.id, sys);
  }

  async start(): Promise<void> {
    for (const s of this.systems) await s.init(this.ctx);
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.ctx.time += dt;
      this.accum += dt * 1000;
      while (this.accum >= FIXED_MS) {
        this.accum -= FIXED_MS;
        for (const s of this.systems) s.fixedUpdate?.(this.ctx, FIXED_MS);
      }
      // Presentation systems interpolate the authoritative 30 Hz snapshots
      // at the display refresh rate. Without this, a 60/120 Hz screen shows
      // the dog holding for one or three frames between every sim step.
      this.ctx.fixedAlpha = this.accum / FIXED_MS;
      for (const s of this.systems) s.update?.(this.ctx, dt);
      this.ctx.renderer.render(this.ctx.scene, this.ctx.camera);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Render exactly one frame now (capture tooling). */
  renderOnce(): void {
    // Capture tooling asks for the exact latest deterministic sim snapshot.
    this.ctx.fixedAlpha = 1;
    for (const s of this.systems) s.update?.(this.ctx, 1 / 60);
    this.ctx.renderer.render(this.ctx.scene, this.ctx.camera);
  }

  setTimeOfDay(tod: TimeOfDay): void {
    this.ctx.timeOfDay = tod;
    this.ctx.events.dispatchEvent(new CustomEvent('tod', { detail: tod }));
  }
}
