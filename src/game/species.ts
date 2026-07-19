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
}

export interface SpeciesPalette {
  body: number;
  head: number;
  tail: number;
}

export interface SpeciesConfig {
  id: string;
  name: string;
  coveyMin: number;
  coveyMax: number;
  /** 0..1 share of birds that run from the dog. */
  runnerChance: number;
  nerveMinMs: number;
  nerveMaxMs: number;
  flight: FlightStyle;
  palette: SpeciesPalette;
  /** Ringneck rule: hens flush too, but shooting one costs you. */
  henRule?: boolean;
  /** Signature flush sound on the rise. */
  sound?: 'cackle' | 'twitter' | 'thunder';
}

export const SPECIES: SpeciesConfig[] = [
  {
    id: 'bobwhite',
    name: 'Northern Bobwhite',
    coveyMin: 5,
    coveyMax: 9,
    runnerChance: 0.05,
    nerveMinMs: 6500,
    nerveMaxMs: 11000,
    flight: { speedMin: 115, speedMax: 155, climb: 0.75, wobble: 26 },
    palette: { body: 0x8a5a2b, head: 0xc9a15c, tail: 0x5a3a22 },
  },
  {
    id: 'ringneck',
    name: 'Ringneck Pheasant',
    coveyMin: 1,
    coveyMax: 3,
    runnerChance: 0.75,
    nerveMinMs: 4000,
    nerveMaxMs: 7000,
    flight: { speedMin: 125, speedMax: 160, climb: 0.65, wobble: 14 },
    palette: { body: 0x7a3c1e, head: 0x1e5a3a, tail: 0x9a6a30 },
    henRule: true,
    sound: 'cackle',
  },
  {
    id: 'ruffed-grouse',
    name: 'Ruffed Grouse',
    coveyMin: 1,
    coveyMax: 2,
    runnerChance: 0.15,
    nerveMinMs: 2500,
    nerveMaxMs: 5000,
    flight: { speedMin: 155, speedMax: 195, climb: 0.55, wobble: 34 },
    palette: { body: 0x6e5138, head: 0x8a6a48, tail: 0x4a3626 },
    sound: 'thunder',
  },
  {
    id: 'woodcock',
    name: 'American Woodcock',
    coveyMin: 1,
    coveyMax: 1,
    runnerChance: 0,
    nerveMinMs: 9000,
    nerveMaxMs: 14000,
    flight: { speedMin: 85, speedMax: 115, climb: 0.95, wobble: 42 },
    palette: { body: 0x9a6a4a, head: 0xb08560, tail: 0x6e4a32 },
    sound: 'twitter',
  },
  {
    id: 'sharptail',
    name: 'Sharptailed Grouse',
    coveyMin: 3,
    coveyMax: 6,
    runnerChance: 0.2,
    nerveMinMs: 2000,
    nerveMaxMs: 4500,
    flight: { speedMin: 140, speedMax: 175, climb: 0.5, wobble: 12 },
    palette: { body: 0xb09a70, head: 0xc9b287, tail: 0xe8dcc0 },
  },
  {
    id: 'hun',
    name: 'Hungarian Partridge',
    coveyMin: 6,
    coveyMax: 10,
    runnerChance: 0.25,
    nerveMinMs: 2000,
    nerveMaxMs: 4000,
    flight: { speedMin: 135, speedMax: 168, climb: 0.6, wobble: 20 },
    palette: { body: 0x8a7458, head: 0xa4552f, tail: 0x74553a },
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
