import { Engine } from './engine';
import type { TimeOfDay } from './palette';
import { SkySystem } from './subsystems/sky';
import { TerrainSystem } from './subsystems/terrain';
import { Hunt3DSystem, type WorldPatch } from './subsystems/hunt3d';
import { PlayerSystem } from './subsystems/player';
import { GrassSystem } from './subsystems/grass';
import { FloraSystem } from './subsystems/flora';
import { DogSystem } from './subsystems/dog';

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
    stepSim: (ticks) => engine.ctx.get<Hunt3DSystem>('hunt3d').step(engine.ctx, ticks),
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
