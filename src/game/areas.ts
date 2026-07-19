import type { Condition } from './conditions';
import { scatterRects, type Rect } from './field';
import { mulberry32 } from './math';
import type { SpeciesShare } from './species';

/**
 * A hunting area: a world (size + cover layout + palette) plus a weighted
 * species mix. Bird behavior lives on the species; the area says which birds
 * live here and how thick they are on the ground.
 *
 * Worlds are larger than the 480×270 viewport; the camera follows the hunter.
 * Cover is scattered from a fixed per-area seed, so every visit to a covert
 * finds the same ground.
 */
export interface AreaConfig {
  id: string;
  name: string;
  tagline: string;
  grass: number;
  cover: number;
  world: Rect;
  patches: Rect[];
  /** Birds per 100k px² of world — bigger worlds stock more birds. */
  stocking: number;
  speciesMix: SpeciesShare[];
  /** Uphill direction (radians, screen coords) on sloped ground — the chukar rule. */
  slope?: number;
  /** Climate lean for the per-hunt condition roll (desert heat, high-country snow). */
  conditionBias?: Condition;
}

function world(w: number, h: number): Rect {
  return { x: 0, y: 0, w, h };
}

export const AREAS: AreaConfig[] = [
  // — Southern Plains —
  {
    id: 'quail-fields',
    name: 'Quail Fields',
    tagline: 'big coveys, and they hold tight',
    grass: 0x5a9440,
    cover: 0x3d7429,
    world: world(1200, 700),
    patches: scatterRects(world(1200, 700), { count: 26, minW: 70, maxW: 130, minH: 40, maxH: 75 }, mulberry32(11)),
    stocking: 1.5,
    speciesMix: [{ speciesId: 'bobwhite', weight: 1 }],
  },
  // — Prairie Pothole —
  {
    id: 'pheasant-coverts',
    name: 'Cattail Coverts',
    tagline: "roosters would rather run than fly",
    grass: 0x8a7a3a,
    cover: 0x5e5424,
    world: world(1400, 800),
    patches: scatterRects(world(1400, 800), { count: 30, minW: 90, maxW: 170, minH: 28, maxH: 50 }, mulberry32(22)),
    stocking: 0.85,
    speciesMix: [
      { speciesId: 'ringneck', weight: 0.8 },
      { speciesId: 'hun', weight: 0.2 },
    ],
  },
  {
    id: 'sharptail-prairie',
    name: 'Sharptail Prairie',
    tagline: 'wild flushers on the wide open',
    grass: 0xa08d55,
    cover: 0x7c6c3d,
    world: world(1400, 800),
    patches: scatterRects(world(1400, 800), { count: 22, minW: 110, maxW: 200, minH: 40, maxH: 70 }, mulberry32(44)),
    stocking: 0.7,
    speciesMix: [
      { speciesId: 'sharptail', weight: 0.5 },
      { speciesId: 'prairie-chicken', weight: 0.3 },
      { speciesId: 'hun', weight: 0.2 },
    ],
  },
  // — North Woods —
  {
    id: 'grouse-woods',
    name: 'Grouse Woods',
    tagline: 'nervous birds in thick cover',
    grass: 0x3f6b4a,
    cover: 0x28513a,
    world: world(1000, 640),
    patches: scatterRects(world(1000, 640), { count: 24, minW: 80, maxW: 150, minH: 50, maxH: 85 }, mulberry32(33)),
    stocking: 1.1,
    speciesMix: [
      { speciesId: 'ruffed-grouse', weight: 0.75 },
      { speciesId: 'woodcock', weight: 0.25 },
    ],
  },
  {
    id: 'woodcock-bottoms',
    name: 'Alder Bottoms',
    tagline: 'timberdoodles sit until you step on them',
    grass: 0x4a6b3f,
    cover: 0x2f5130,
    world: world(1000, 640),
    patches: scatterRects(world(1000, 640), { count: 28, minW: 60, maxW: 110, minH: 45, maxH: 80 }, mulberry32(55)),
    stocking: 1.2,
    speciesMix: [
      { speciesId: 'woodcock', weight: 0.7 },
      { speciesId: 'ruffed-grouse', weight: 0.3 },
    ],
    conditionBias: 'rain',
  },
  // — Great Basin —
  {
    id: 'hun-benches',
    name: 'Rimrock Benches',
    tagline: 'gray ghosts that flush as one',
    grass: 0x9a8a60,
    cover: 0x6e6244,
    world: world(1400, 800),
    patches: scatterRects(world(1400, 800), { count: 18, minW: 100, maxW: 180, minH: 35, maxH: 60 }, mulberry32(66)),
    stocking: 0.65,
    speciesMix: [{ speciesId: 'hun', weight: 1 }],
  },
  {
    id: 'chukar-ridge',
    name: 'Chukar Ridge',
    tagline: 'they run up and fly down',
    grass: 0x8f7f5e,
    cover: 0x5e5340,
    world: world(1400, 800),
    patches: scatterRects(world(1400, 800), { count: 16, minW: 90, maxW: 160, minH: 30, maxH: 55 }, mulberry32(77)),
    stocking: 0.7,
    speciesMix: [
      { speciesId: 'chukar', weight: 0.8 },
      { speciesId: 'hun', weight: 0.2 },
    ],
    slope: -Math.PI / 2, // uphill is north — they run up-screen, fly down
  },
  // — Sonoran Desert —
  {
    id: 'desert-washes',
    name: 'Desert Washes',
    tagline: 'big desert coveys in the thornscrub',
    grass: 0xb89f72,
    cover: 0x77694a,
    world: world(1200, 700),
    patches: scatterRects(world(1200, 700), { count: 22, minW: 70, maxW: 130, minH: 35, maxH: 65 }, mulberry32(88)),
    stocking: 1.6,
    speciesMix: [
      { speciesId: 'gambels-quail', weight: 0.6 },
      { speciesId: 'scaled-quail', weight: 0.4 },
    ],
    conditionBias: 'hot',
  },
  {
    id: 'mearns-canyons',
    name: 'Oak Canyons',
    tagline: 'Montezuma quail sit until your boot moves them',
    grass: 0x8a8050,
    cover: 0x565c30,
    world: world(1000, 640),
    patches: scatterRects(world(1000, 640), { count: 24, minW: 65, maxW: 120, minH: 45, maxH: 75 }, mulberry32(99)),
    stocking: 1.3,
    speciesMix: [
      { speciesId: 'mearns-quail', weight: 0.8 },
      { speciesId: 'gambels-quail', weight: 0.2 },
    ],
    conditionBias: 'hot',
  },
  // — High Rockies —
  {
    id: 'timberline-parks',
    name: 'Timberline Parks',
    tagline: 'blue grouse hold on the high edges',
    grass: 0x55704e,
    cover: 0x334a36,
    world: world(1000, 640),
    patches: scatterRects(world(1000, 640), { count: 22, minW: 75, maxW: 140, minH: 45, maxH: 80 }, mulberry32(111)),
    stocking: 1.0,
    speciesMix: [
      { speciesId: 'blue-grouse', weight: 0.7 },
      { speciesId: 'mountain-quail', weight: 0.3 },
    ],
    slope: 0, // uphill is east, toward the peaks
    conditionBias: 'snow',
  },
  // — Pacific Valleys —
  {
    id: 'valley-oaks',
    name: 'Valley Oaks',
    tagline: 'topknots by the dozen under the oaks',
    grass: 0x7e8a4a,
    cover: 0x4e5c2e,
    world: world(1200, 700),
    patches: scatterRects(world(1200, 700), { count: 24, minW: 70, maxW: 135, minH: 40, maxH: 70 }, mulberry32(122)),
    stocking: 1.6,
    speciesMix: [{ speciesId: 'california-quail', weight: 1 }],
  },
];

/** Stocking is a density; the actual head count scales with world size. */
export function areaBirdCount(area: AreaConfig): number {
  return Math.max(3, Math.round((area.world.w * area.world.h) / 100_000 * area.stocking));
}

export function getArea(id: string): AreaConfig {
  return AREAS.find((a) => a.id === id) ?? AREAS[0];
}
