import type { LandscapeModel } from '../game/landscape';
import type { Subsystem } from './engine';
import { FloraSystem } from './subsystems/flora';
import { GrassSystem } from './subsystems/grass';
import { RimrockCoverSystem } from './subsystems/rimrockCover';
import { RimrockFloraSystem } from './subsystems/rimrockFlora';

interface LandscapeVisuals {
  cover: Subsystem;
  flora: Subsystem;
}

interface LandscapeVisualAdapter {
  create(landscape: LandscapeModel): LandscapeVisuals;
}

const PRAIRIE_VISUALS: LandscapeVisualAdapter = {
  create: () => ({ cover: new GrassSystem(), flora: new FloraSystem() }),
};

const RIMROCK_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({
    cover: new RimrockCoverSystem(landscape),
    flora: new RimrockFloraSystem(landscape),
  }),
};

/** One visual seam; individual renderers never branch on terrain kind. */
export function createLandscapeVisuals(landscape: LandscapeModel): LandscapeVisuals {
  const adapter = landscape.area.terrain.kind === 'rimrock' ? RIMROCK_VISUALS : PRAIRIE_VISUALS;
  return adapter.create(landscape);
}
