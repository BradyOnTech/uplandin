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
  /** 0..1 share of birds that run from the dog. */
  runnerChance: number;
  /** Ground-speed multiplier while running — chukar and scaled quail burn legs. */
  runSpeedMult?: number;
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
    runnerChance: 0.05,
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
    runnerChance: 0.75,
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
    runnerChance: 0.15,
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
    runnerChance: 0,
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
    runnerChance: 0.2,
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
    runnerChance: 0.25,
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
    runnerChance: 0.8,
    runSpeedMult: 1.3, // uphill legs — they will outwalk you
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
    runnerChance: 0.15,
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
    runnerChance: 0.1,
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
    runnerChance: 0.3,
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
    runnerChance: 0.5,
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
    runnerChance: 0.85,
    runSpeedMult: 1.25, // cotton-tops would rather sprint than fly
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
    runnerChance: 0,
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
    runnerChance: 0.45,
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
