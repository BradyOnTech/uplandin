import { Engine } from './engine';
import type { TimeOfDay } from './palette';
import { SkySystem } from './subsystems/sky';
import { TerrainSystem } from './subsystems/terrain';
import { Hunt3DSystem, type WorldPatch } from './subsystems/hunt3d';
import { PlayerSystem } from './subsystems/player';
import { GrassSystem } from './subsystems/grass';
import { FloraSystem } from './subsystems/flora';
import { DogSystem } from './subsystems/dog';
import { BirdsSystem } from './subsystems/birds';

/*
 * Uplandin 3D entry. Boot order = subsystem registration order; the
 * capture API (window.__api3d / __ready3d) is the contract every visual
 * critic in the pipeline drives — keep it stable.
 */

const params = new URLSearchParams(location.search);
const quality = params.get('quality') === 'lite' ? 'lite' : 'high';

const canvas = document.getElementById('game3d') as HTMLCanvasElement;
const engine = new Engine(canvas, quality);

engine.register(new SkySystem());
engine.register(new TerrainSystem());
// hunt3d before grass: grass reads the sim's cover patches at init.
engine.register(new Hunt3DSystem());
engine.register(new PlayerSystem());
engine.register(new GrassSystem());
engine.register(new FloraSystem());
engine.register(new DogSystem());
engine.register(new BirdsSystem());

declare global {
  interface Window {
    __ready3d?: boolean;
    __api3d?: {
      setTod(tod: TimeOfDay): void;
      setPose(x: number, z: number, yawDeg: number, pitchDeg?: number): void;
      renderOnce(): void;
      info(): { calls: number; triangles: number };
      /** Advance the (capture-frozen) sim by exact 30 Hz ticks. */
      stepSim(ticks: number): void;
      /**
       * Advance ONLY the covey-rise presentation (the 2D scene-cut,
       * translated: field time holds its breath while the rise plays —
       * the pointing dog stands under the exploding birds).
       */
      stepRise(ticks: number): void;
      /** Walk the mapped hunter in and flush the pointed covey (sim law). */
      triggerFlush(): { ids: number[]; distPx: number } | null;
      /** Airborne rise birds, world meters — capture telemetry. */
      birds(): { simId: number; x: number; y: number; z: number; airMs: number; status: string }[];
      /** Sim snapshot in world meters — capture poses shots off this. */
      hunt(): {
        dog: { x: number; z: number; state: string; gait: string };
        hunter: { x: number; z: number };
        patches: readonly WorldPatch[];
        simMs: { last: number; max: number; avg: number };
      };
    };
  }
}

engine.start().then(() => {
  const tod = (params.get('tod') as TimeOfDay) ?? 'dawn';
  engine.setTimeOfDay(tod);
  window.__api3d = {
    setTod: (t) => engine.setTimeOfDay(t),
    setPose: (x, z, yaw, pitch) => engine.ctx.get<PlayerSystem>('player').setPose(engine.ctx, x, z, yaw, pitch),
    renderOnce: () => engine.renderOnce(),
    info: () => ({
      calls: engine.ctx.renderer.info.render.calls,
      triangles: engine.ctx.renderer.info.render.triangles,
    }),
    // Field sim and rise presentation advance in lockstep (a no-op for
    // birds until a covey is up); stepRise moves ONLY the rise.
    stepSim: (ticks) => {
      engine.ctx.get<Hunt3DSystem>('hunt3d').step(engine.ctx, ticks);
      engine.ctx.get<BirdsSystem>('birds').step(engine.ctx, ticks);
    },
    stepRise: (ticks) => engine.ctx.get<BirdsSystem>('birds').step(engine.ctx, ticks),
    triggerFlush: () => engine.ctx.get<Hunt3DSystem>('hunt3d').triggerFlush(engine.ctx),
    birds: () => engine.ctx.get<BirdsSystem>('birds').airborne(),
    hunt: () => {
      const h = engine.ctx.get<Hunt3DSystem>('hunt3d');
      const dogW = h.dogWorld({ x: 0, z: 0 });
      const hunterW = h.simToWorld(h.huntState().hunterPos.x, h.huntState().hunterPos.y, { x: 0, z: 0 });
      return {
        dog: { x: dogW.x, z: dogW.z, state: h.dog().state, gait: h.dog().gait },
        hunter: hunterW,
        patches: h.coverPatches(),
        simMs: h.simMs(),
      };
    },
  };
  // Two settle frames so shadows/fog are warm before any capture.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__ready3d = true;
  }));
});
