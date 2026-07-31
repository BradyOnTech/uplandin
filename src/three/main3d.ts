import { Engine } from './engine';
import type { TimeOfDay } from './palette';
import { SkySystem } from './subsystems/sky';
import { TerrainSystem } from './subsystems/terrain';
import { PlayerSystem } from './subsystems/player';
import { GrassSystem } from './subsystems/grass';
import { FloraSystem } from './subsystems/flora';

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
engine.register(new PlayerSystem());
engine.register(new GrassSystem());
engine.register(new FloraSystem());

declare global {
  interface Window {
    __ready3d?: boolean;
    __api3d?: {
      setTod(tod: TimeOfDay): void;
      setPose(x: number, z: number, yawDeg: number, pitchDeg?: number): void;
      renderOnce(): void;
      info(): { calls: number; triangles: number };
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
  };
  // Two settle frames so shadows/fog are warm before any capture.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__ready3d = true;
  }));
});
