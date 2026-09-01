import type { LandscapeModel } from '../game/landscape';
import type { Subsystem } from './engine';
import { FloraSystem } from './subsystems/flora';
import { GrassSystem } from './subsystems/grass';
import { RimrockCoverSystem } from './subsystems/rimrockCover';
import { RimrockFloraSystem } from './subsystems/rimrockFlora';
import { PheasantCoverSystem } from './subsystems/pheasantCover';
import { PheasantScenerySystem } from './subsystems/pheasantScenery';

interface LandscapeVisuals {
  systems: readonly Subsystem[];
}

interface LandscapeVisualAdapter {
  create(landscape: LandscapeModel): LandscapeVisuals;
}

const PRAIRIE_VISUALS: LandscapeVisualAdapter = {
  create: () => ({ systems: [new GrassSystem(), new FloraSystem()] }),
};

const RIMROCK_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({
    systems: [new RimrockCoverSystem(landscape), new RimrockFloraSystem(landscape)],
  }),
};

const PHEASANT_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({
    systems: [new PheasantCoverSystem(landscape), new PheasantScenerySystem(landscape)],
  }),
};

const AREA_VISUALS: Readonly<Record<string, LandscapeVisualAdapter | undefined>> = {
  'chukar-ridge': RIMROCK_VISUALS,
  'pheasant-coverts': PHEASANT_VISUALS,
};

/** One visual seam; individual renderers never branch on terrain kind. */
export function createLandscapeVisuals(landscape: LandscapeModel): LandscapeVisuals {
  const adapter = AREA_VISUALS[landscape.area.id]
    ?? (landscape.area.terrain.kind === 'rimrock' ? RIMROCK_VISUALS : PRAIRIE_VISUALS);
  return adapter.create(landscape);
}
