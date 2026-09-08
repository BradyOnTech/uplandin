/**
 * Bird species are configs: covey habits, nerve, runner tendency, how they
 * fly when flushed, and special rules (protected hens). Areas carry a
 * weighted species mix, so new ground and new birds are data, not code.
 */

/** How a species flies in the shooting view. */
export interface FlightStyle {
  speedMin: number;
  speedMax: number;
  /** 0..1 — how vertical the rise is. 1 towers straight up, 0.4 burns out low. */
  climb: number;
  /** Sideways jink amplitude in the air (px/s). */
  wobble: number;
  /** Wingbeat animation rate (fps) — quail buzz, roosters row. Default 14. */
  flapRate?: number;
  /** Burst fliers lock their wings after this and glide — the quail move. */
  glideAfterMs?: number;
  /** Rooster move: stop climbing after this and accelerate into a crossing shot. */
  levelAfterMs?: number;
}

export interface SpeciesPalette {
  body: number;
  head: number;
  tail: number;
}

export type SpeciesGroundResponse = 'none' | 'uphill' | 'downhill';

/** Species-owned preferred direction for a flushed bird on sloped ground. */
export type SpeciesFlightDirection = 'none' | 'downhill';

/** Species-owned ground behavior used when a bird roads ahead of the dog. */
export interface RunnerBehavior {
  /** Distance at which the dog makes a runner break into a road (property px). */
  fleeRadius?: number;
  /** Rate at which the bird spends its running energy. */
  energyRate?: number;
  /** Multiplier for the winded pause before it can run again. */
  restMultiplier?: number;
  /** How strongly the bird adopts an authored route when one is nearby. */
  routeBias?: number;
}

export interface SpeciesConfig {
  id: string;
  name: string;
  /**
   * Target size in the shot view (1 = pheasant-class). A tribute to
   * realism inside the arcade: quail are small, fast little targets;
   * a rooster is a barn door that's faster than it looks.
   */
  size?: number;
  coveyMin: number;
  coveyMax: number;
  /** Radius in property-space units occupied by a covey around its authored anchor. */
  coveyJitter?: number;
  /** Whether a point should read as a covey approach instead of a solitary rise. */
  coveyApproach?: boolean;
  /** Whether runner members may road ahead before the covey rises. */
  roadAsCovey?: boolean;
  /** Whether a flush launches the hidden group together or only the trigger. */
  flushAsCovey?: boolean;
  /** Relative point patience; the area doctrine supplies the other half of this. */
  pointNerveMult?: number;
  /** Relative hunter approach radius at the end of a point. */
  pointRadiusMult?: number;
  /**
   * Radius in property pixels where a moving hunter can disturb a hidden
   * bird before the dog has made a point. This is for underfoot flushers
   * such as grouse and woodcock; runners keep their road behavior instead.
   */
  hunterDisturbanceRadius?: number;
  /** Species-owned response to a sloped ground/run line. */
  groundResponse?: SpeciesGroundResponse;
  /** Species-owned horizontal break direction after the flush. */
  flightDirection?: SpeciesFlightDirection;
  /** 0..1 share of birds that run from the dog. */
  runnerChance: number;
  /** Ground-speed multiplier while running — chukar and scaled quail burn legs. */
  runSpeedMult?: number;
  /** Fine-grained ground temperament; map routes supply the physical corridor. */
  runnerBehavior?: RunnerBehavior;
  nerveMinMs: number;
  nerveMaxMs: number;
  flight: FlightStyle;
  palette: SpeciesPalette;
  /** Ringneck rule: hens flush too, but shooting one costs you. */
  henRule?: boolean;
  /** Signature flush sound on the rise. */
  sound?: 'cackle' | 'twitter' | 'thunder';
  /** Timber birds put a tree between themselves and the gun in the shot view. */
  timber?: boolean;
}

export const SPECIES: SpeciesConfig[] = [
  {
    id: 'bobwhite',
    name: 'Northern Bobwhite',
    size: 0.62,
    coveyMin: 5,
    coveyMax: 9,
    coveyJitter: 8,
    coveyApproach: true,
    flushAsCovey: true,
    pointNerveMult: 0.9,
    pointRadiusMult: 1,
    groundResponse: 'none',
    runnerChance: 0.05,
    runnerBehavior: { fleeRadius: 35, energyRate: 1, restMultiplier: 1, routeBias: 0 },
    nerveMinMs: 6500,
    nerveMaxMs: 11000,
    flight: { speedMin: 115, speedMax: 155, climb: 0.75, wobble: 26, flapRate: 18, glideAfterMs: 900 },
    palette: { body: 0x8a5a2b, head: 0xc9a15c, tail: 0x5a3a22 },
  },
  {
    id: 'ringneck',
    name: 'Ringneck Pheasant',
    size: 1.15,
    coveyMin: 1,
    coveyMax: 3,
    coveyJitter: 13,
    coveyApproach: false,
    flushAsCovey: false,
    pointNerveMult: 0.92,
    pointRadiusMult: 0.86,
    groundResponse: 'none',
    runnerChance: 0.75,
    runnerBehavior: { fleeRadius: 45, energyRate: .78, restMultiplier: .72, routeBias: .42 },
    nerveMinMs: 4000,
    nerveMaxMs: 7000,
    flight: { speedMin: 125, speedMax: 160, climb: 0.65, wobble: 14, flapRate: 9, levelAfterMs: 1000 },
    palette: { body: 0x7a3c1e, head: 0x1e5a3a, tail: 0x9a6a30 },
    henRule: true,
    sound: 'cackle',
  },
  {
    id: 'ruffed-grouse',
    name: 'Ruffed Grouse',
    size: 0.9,
    coveyMin: 1,
    coveyMax: 2,
    coveyJitter: 7,
    coveyApproach: false,
    flushAsCovey: false,
    pointNerveMult: 1.16,
    pointRadiusMult: 0.82,
    hunterDisturbanceRadius: 14,
    groundResponse: 'none',
    runnerChance: 0.15,
    runnerBehavior: { fleeRadius: 34, energyRate: .96, restMultiplier: 1.02, routeBias: .12 },
    nerveMinMs: 2500,
    nerveMaxMs: 5000,
    flight: { speedMin: 155, speedMax: 195, climb: 0.55, wobble: 34, flapRate: 16 },
    palette: { body: 0x6e5138, head: 0x8a6a48, tail: 0x4a3626 },
    sound: 'thunder',
    timber: true,
  },
  {
    id: 'woodcock',
    name: 'American Woodcock',
    size: 0.7,
    coveyMin: 1,
    coveyMax: 1,
    coveyJitter: 5,
    coveyApproach: false,
    flushAsCovey: false,
    pointNerveMult: 0.7,
    pointRadiusMult: 0.78,
    hunterDisturbanceRadius: 9,
    groundResponse: 'none',
    runnerChance: 0,
    runnerBehavior: { fleeRadius: 32, energyRate: 1, restMultiplier: 1, routeBias: 0 },
    nerveMinMs: 9000,
    nerveMaxMs: 14000,
    flight: { speedMin: 85, speedMax: 115, climb: 0.95, wobble: 42, flapRate: 12 },
    palette: { body: 0x9a6a4a, head: 0xb08560, tail: 0x6e4a32 },
    sound: 'twitter',
  },
  {
    id: 'sharptail',
    name: 'Sharptailed Grouse',
    size: 0.85,
    coveyMin: 3,
    coveyMax: 6,
    coveyJitter: 16,
    // Sharptails flush as a group, but they do not give the dog the tight
    // quail-style walk-in. In open prairie the hunter earns a longer, wider
    // shot window by reading the wind lane and committing to the covey edge.
    // `flushAsCovey` remains true below, so this only changes the approach
    // rhythm; the covey still rises together when one bird breaks.
    coveyApproach: false,
    flushAsCovey: true,
    pointNerveMult: 1.08,
    pointRadiusMult: 1.1,
    groundResponse: 'none',
    runnerChance: 0.2,
    runnerBehavior: { fleeRadius: 35, energyRate: .94, restMultiplier: 1.08, routeBias: .12 },
    nerveMinMs: 2000,
    nerveMaxMs: 4500,
    flight: { speedMin: 140, speedMax: 175, climb: 0.5, wobble: 12, flapRate: 13, glideAfterMs: 800 },
    palette: { body: 0xb09a70, head: 0xc9b287, tail: 0xe8dcc0 },
  },
  {
    id: 'hun',
    name: 'Hungarian Partridge',
    size: 0.75,
    coveyMin: 6,
    coveyMax: 10,
    coveyJitter: 14,
    coveyApproach: true,
    // Huns can hold as a covey at the point, but road along the bench while
    // the dog closes. Keeping this separate from `coveyApproach` preserves
    // the group flush and circle-back rules.
    roadAsCovey: true,
    flushAsCovey: true,
    pointNerveMult: 0.96,
    pointRadiusMult: 1.05,
    groundResponse: 'none',
    runnerChance: 0.25,
    runnerBehavior: { fleeRadius: 37, energyRate: .94, restMultiplier: .9, routeBias: .22 },
    nerveMinMs: 2000,
    nerveMaxMs: 4000,
    flight: { speedMin: 135, speedMax: 168, climb: 0.6, wobble: 20, flapRate: 16, glideAfterMs: 1100 },
    palette: { body: 0x8a7458, head: 0xa4552f, tail: 0x74553a },
  },
  {
    id: 'chukar',
    name: 'Chukar',
    size: 0.78,
    coveyMin: 5,
    coveyMax: 10,
    coveyJitter: 15,
    coveyApproach: false,
    flushAsCovey: true,
    pointNerveMult: 1.06,
    pointRadiusMult: 0.92,
    groundResponse: 'uphill',
    flightDirection: 'downhill',
    runnerChance: 0.8,
    runSpeedMult: 1.3, // uphill legs — they will outwalk you
    runnerBehavior: { fleeRadius: 40, energyRate: 1.18, restMultiplier: .86, routeBias: .24 },
    nerveMinMs: 2500,
    nerveMaxMs: 5000,
    // The downhill flush: fast, flat, and gone.
    flight: { speedMin: 165, speedMax: 200, climb: 0.3, wobble: 10, flapRate: 15 },
    palette: { body: 0x9a8f7a, head: 0xb8543a, tail: 0x6e6654 },
  },
  {
    id: 'prairie-chicken',
    name: 'Greater Prairie Chicken',
    size: 0.9,
    coveyMin: 4,
    coveyMax: 8,
    coveyJitter: 15,
    coveyApproach: true,
    roadAsCovey: true,
    flushAsCovey: true,
    pointNerveMult: 1.08,
    pointRadiusMult: 1.08,
    groundResponse: 'none',
    runnerChance: 0.15,
    runnerBehavior: { fleeRadius: 35, energyRate: .92, restMultiplier: 1.05, routeBias: .12 },
    nerveMinMs: 2000,
    nerveMaxMs: 4000,
    flight: { speedMin: 140, speedMax: 170, climb: 0.5, wobble: 10, flapRate: 13, glideAfterMs: 900 },
    palette: { body: 0x8a6a45, head: 0xc9853a, tail: 0x5e4a30 },
  },
  {
    id: 'blue-grouse',
    name: 'Blue Grouse',
    size: 0.95,
    coveyMin: 1,
    coveyMax: 2,
    coveyJitter: 7,
    coveyApproach: false,
    flushAsCovey: false,
    pointNerveMult: 1.12,
    pointRadiusMult: 0.84,
    hunterDisturbanceRadius: 12,
    groundResponse: 'none',
    runnerChance: 0.1,
    runnerBehavior: { fleeRadius: 32, energyRate: .9, restMultiplier: 1.08, routeBias: .1 },
    nerveMinMs: 7000,
    nerveMaxMs: 11000,
    flight: { speedMin: 150, speedMax: 185, climb: 0.55, wobble: 20, flapRate: 14 },
    palette: { body: 0x5a6270, head: 0x6e7684, tail: 0x3e4550 },
    sound: 'thunder',
    timber: true,
  },
  {
    id: 'california-quail',
    name: 'California Quail',
    size: 0.65,
    coveyMin: 8,
    coveyMax: 14,
    coveyJitter: 17,
    coveyApproach: true,
    roadAsCovey: true,
    flushAsCovey: true,
    pointNerveMult: 0.98,
    pointRadiusMult: 1.06,
    groundResponse: 'none',
    runnerChance: 0.3,
    runnerBehavior: { fleeRadius: 35, energyRate: .95, restMultiplier: .9, routeBias: .2 },
    nerveMinMs: 5000,
    nerveMaxMs: 8000,
    flight: { speedMin: 115, speedMax: 150, climb: 0.7, wobble: 24, flapRate: 18, glideAfterMs: 1000 },
    palette: { body: 0x6e6a5e, head: 0x2e2a24, tail: 0x54504a },
  },
  {
    id: 'gambels-quail',
    name: "Gambel's Quail",
    size: 0.65,
    coveyMin: 8,
    coveyMax: 14,
    coveyJitter: 18,
    coveyApproach: true,
    roadAsCovey: true,
    flushAsCovey: true,
    pointNerveMult: 0.88,
    pointRadiusMult: 1.02,
    groundResponse: 'none',
    runnerChance: 0.5,
    runnerBehavior: { fleeRadius: 36, energyRate: 1, restMultiplier: .82, routeBias: .5 },
    nerveMinMs: 4000,
    nerveMaxMs: 7000,
    flight: { speedMin: 118, speedMax: 152, climb: 0.7, wobble: 24, flapRate: 18, glideAfterMs: 1000 },
    palette: { body: 0xa08a68, head: 0x6e3a24, tail: 0x7a6a50 },
  },
  {
    id: 'scaled-quail',
    name: 'Scaled Quail',
    size: 0.65,
    coveyMin: 6,
    coveyMax: 12,
    coveyJitter: 18,
    coveyApproach: false,
    flushAsCovey: true,
    pointNerveMult: 1,
    pointRadiusMult: 1,
    groundResponse: 'none',
    runnerChance: 0.85,
    runSpeedMult: 1.25, // cotton-tops would rather sprint than fly
    runnerBehavior: { fleeRadius: 42, energyRate: 1.08, restMultiplier: .78, routeBias: .5 },
    nerveMinMs: 3500,
    nerveMaxMs: 6000,
    flight: { speedMin: 125, speedMax: 158, climb: 0.6, wobble: 20, flapRate: 18, glideAfterMs: 950 },
    palette: { body: 0x9aa0a8, head: 0xd8d4c8, tail: 0x767c84 },
  },
  {
    id: 'mearns-quail',
    name: 'Montezuma Quail',
    size: 0.62,
    coveyMin: 4,
    coveyMax: 8,
    coveyJitter: 6,
    coveyApproach: true,
    flushAsCovey: true,
    pointNerveMult: 0.62,
    pointRadiusMult: 0.72,
    // Montezuma coveys hold so tightly that a hunter crossing the oak litter
    // can bump them before the dog has finished the point. Keep the radius
    // narrow: this is a boot-in-cover flush, not a general wild-flush rule.
    hunterDisturbanceRadius: 10,
    groundResponse: 'none',
    runnerChance: 0,
    runnerBehavior: { fleeRadius: 31, energyRate: 1, restMultiplier: 1, routeBias: 0 },
    nerveMinMs: 10000,
    nerveMaxMs: 15000, // sits tighter than any bird in the game
    flight: { speedMin: 105, speedMax: 140, climb: 0.8, wobble: 30, flapRate: 16 },
    palette: { body: 0x4e3a2e, head: 0xd8d0c0, tail: 0x352a20 },
  },
  {
    id: 'mountain-quail',
    name: 'Mountain Quail',
    size: 0.68,
    coveyMin: 4,
    coveyMax: 8,
    coveyJitter: 10,
    coveyApproach: true,
    roadAsCovey: true,
    flushAsCovey: true,
    pointNerveMult: 0.94,
    pointRadiusMult: 1.02,
    groundResponse: 'uphill',
    runnerChance: 0.45,
    runnerBehavior: { fleeRadius: 38, energyRate: 1.04, restMultiplier: .9, routeBias: .24 },
    nerveMinMs: 4500,
    nerveMaxMs: 7500,
    flight: { speedMin: 128, speedMax: 160, climb: 0.65, wobble: 22, flapRate: 17, glideAfterMs: 1000 },
    palette: { body: 0x70584a, head: 0x4a5460, tail: 0x54423a },
  },
];

export function getSpecies(id: string): SpeciesConfig {
  return SPECIES.find((s) => s.id === id) ?? SPECIES[0];
}

/** One entry of an area's weighted species mix. */
export interface SpeciesShare {
  speciesId: string;
  weight: number;
}

/** Pick a species from a weighted mix. */
export function rollSpecies(mix: SpeciesShare[], roll: number): SpeciesConfig {
  const total = mix.reduce((a, s) => a + s.weight, 0);
  let r = roll * total;
  for (const share of mix) {
    r -= share.weight;
    if (r < 0) return getSpecies(share.speciesId);
  }
  return getSpecies(mix[mix.length - 1].speciesId);
}
