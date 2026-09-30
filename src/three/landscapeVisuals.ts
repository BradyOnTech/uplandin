import { QuailGroundPropsSystem } from './subsystems/quailGroundProps';
import type { LandscapeModel } from '../game/landscape';
import type { Subsystem } from './engine';
import { huntingDoctrine } from '../game/huntDoctrine';
import { loadQuailTreeKit } from './assets/quailTreeKit';
import { QuailKitSystem } from './subsystems/quailKit';
import { QuailEnvironmentSystem } from './subsystems/quailEnvironment';
import { GrassSystem } from './subsystems/grass';
import { RimrockCoverSystem } from './subsystems/rimrockCover';
import { RimrockFloraSystem } from './subsystems/rimrockFlora';
import { ChukarEnvironmentSystem } from './subsystems/chukarEnvironment';
import { PheasantCoverSystem } from './subsystems/pheasantCover';
import { PheasantScenerySystem } from './subsystems/pheasantScenery';
import { PheasantCropResidueSystem } from './subsystems/pheasantCropResidue';
import { SharptailTurfSystem } from './subsystems/sharptailTurf';
import { SharptailRanchSystem } from './subsystems/sharptailRanch';
import { PropertyHabitatSystem } from './subsystems/propertyHabitat';
import { PropertyTrailsSystem } from './subsystems/propertyTrails';
import { HunBenchSystem } from './subsystems/hunBench';
import { WetBottomsSystem } from './subsystems/wetBottoms';
import { DryWashSystem } from './subsystems/dryWash';
import { CanyonOakSystem } from './subsystems/canyonOak';
import { AlpineParksSystem } from './subsystems/alpineParks';
import { ValleyOakSystem } from './subsystems/valleyOak';
import { WoodlandFloorSystem } from './subsystems/woodlandFloor';

interface LandscapeVisuals {
  systems: readonly Subsystem[];
}

interface LandscapeVisualAdapter {
  create(landscape: LandscapeModel): LandscapeVisuals;
}

/**
 * Open country gets the continuous grass treatment. Using the Quail Fields
 * hero composition as a universal fallback made every
 * other property inherit the same oak/snags/fence arrangement, which erased
 * the very species differences the hunt doctrine is meant to express.
 */
const OPEN_COUNTRY_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({ systems: [new GrassSystem(), new PropertyTrailsSystem(landscape), new PropertyHabitatSystem(landscape)] }),
};

/**
 * Close-cover properties rely on their own instanced habitat vocabulary. A
 * woods, wet bottom, desert wash, or alpine edge should not receive the
 * prairie grass carpet or the Quail Fields hero tree recipe as a default.
 * The tiled terrain remains shared; only the visible cover grammar changes.
 */
const CLOSE_COVER_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({ systems: [new PropertyTrailsSystem(landscape), new PropertyHabitatSystem(landscape),
    ...(landscape.area.id === 'grouse-woods' ? [new WoodlandFloorSystem(landscape)] : [])] }),
};

const RIMROCK_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({
    systems: [new PropertyTrailsSystem(landscape), new RimrockCoverSystem(landscape, 'chukar'), new RimrockFloraSystem(landscape)],
  }),
};

const PHEASANT_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({
    systems: [new PropertyTrailsSystem(landscape), new PheasantCoverSystem(landscape), new PheasantCropResidueSystem(landscape), new PheasantScenerySystem(landscape)],
  }),
};

const HUN_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({
    systems: [new PropertyTrailsSystem(landscape), new HunBenchSystem(landscape), new RimrockCoverSystem(landscape, 'hun')],
  }),
};

const WOODCOCK_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({
    // PropertyHabitat keeps the wetland's distant fill continuous; the
    // bespoke kit owns the low wet chain and the close alder-floor grammar.
    systems: [new PropertyTrailsSystem(landscape), new PropertyHabitatSystem(landscape), new WetBottomsSystem(landscape)],
  }),
};

const DESERT_WASH_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({
    // The wash itself is the route ribbon here. Keeping it out of the generic
    // property habitat adapter prevents desert cover from collapsing into the
    // same route surface used by other maps; the habitat fill still supplies
    // the sparse, species-specific thornscrub between named washes.
    systems: [new PropertyHabitatSystem(landscape), new DryWashSystem(landscape)],
  }),
};

const MEARNS_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({
    // The generic canyon fill is scrub and talus only; this dedicated layer
    // owns the red-rock draw shelves and oak-shadow rhythm that makes
    // Montezuma quail country read differently from Desert Washes.
    systems: [new PropertyTrailsSystem(landscape), new PropertyHabitatSystem(landscape), new CanyonOakSystem(landscape)],
  }),
};

const TIMBERLINE_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({
    // Blue-grouse parks keep the shared conifer/timberline fill, then add a
    // sparse seasonal layer that makes the high edge read in snow and frost.
    systems: [new PropertyTrailsSystem(landscape), new PropertyHabitatSystem(landscape), new AlpineParksSystem(landscape)],
  }),
};

const VALLEY_OAK_VISUALS: LandscapeVisualAdapter = {
  create: (landscape) => ({
    // The open grass remains continuous, but mature live-oak shade islands
    // own the route rhythm on this property. They make the California quail
    // hunt read as shade-to-shade movement rather than a warm prairie reskin.
    systems: [
      new GrassSystem(),
      new PropertyTrailsSystem(landscape),
      new PropertyHabitatSystem(landscape),
      new ValleyOakSystem(landscape),
    ],
  }),
};

const AREA_VISUALS: Readonly<Record<string, LandscapeVisualAdapter | undefined>> = {
  'sharptail-prairie': { create: (landscape) => ({ systems: [new GrassSystem(landscape), new SharptailTurfSystem(landscape), new SharptailRanchSystem(landscape), new PropertyTrailsSystem(landscape), new PropertyHabitatSystem(landscape)] }) },
  'quail-fields': { create: (landscape) => ({ systems: [new QuailEnvironmentSystem(landscape, loadQuailTreeKit), new QuailKitSystem(landscape), new QuailGroundPropsSystem(landscape)] }) },
  'chukar-ridge': { create: (landscape) => ({ systems: [new ChukarEnvironmentSystem(landscape)] }) },
  'pheasant-coverts': PHEASANT_VISUALS,
  'hun-benches': HUN_VISUALS,
  'woodcock-bottoms': WOODCOCK_VISUALS,
  'desert-washes': DESERT_WASH_VISUALS,
  'mearns-canyons': MEARNS_VISUALS,
  'timberline-parks': TIMBERLINE_VISUALS,
  'valley-oaks': VALLEY_OAK_VISUALS,
};

/** One visual seam; terrain and species choices stay in the adapter layer. */
export function createLandscapeVisuals(landscape: LandscapeModel): LandscapeVisuals {
  const areaAdapter = AREA_VISUALS[landscape.area.id];
  if (areaAdapter) return areaAdapter.create(landscape);
  // Hun country is a rimrock property even though its hunt doctrine is
  // expressed as a bench-covey. Keep the authored geology and sage/rock
  // composition visible so the map reads as a Great Basin hunt at a glance.
  if (landscape.area.terrain.kind === 'rimrock') return RIMROCK_VISUALS.create(landscape);
  const style = huntingDoctrine(landscape.area.id).style;
  const adapter = style === 'open-covey' || style === 'oak-savanna'
    ? OPEN_COUNTRY_VISUALS
    : CLOSE_COVER_VISUALS;
  return adapter.create(landscape);
}
