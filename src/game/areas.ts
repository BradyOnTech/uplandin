import { scatterRects, type Rect } from './field';
import { mulberry32 } from './math';

/**
 * A hunting area: a world (size + cover layout + palette) plus the species
 * mix that lives there. Bird behavior is data — nerve, covey size, runner
 * tendency — so new areas and new species are configuration, not code.
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
  coveyMaxSize: number;
  /** 0..1 share of birds that run from the dog. */
  runnerChance: number;
  nerveMinMs: number;
  nerveMaxMs: number;
}

function world(w: number, h: number): Rect {
  return { x: 0, y: 0, w, h };
}

export const AREAS: AreaConfig[] = [
  {
    id: 'quail-fields',
    name: 'Quail Fields',
    tagline: 'big coveys, and they hold tight',
    grass: 0x5a9440,
    cover: 0x3d7429,
    world: world(1200, 700),
    patches: scatterRects(world(1200, 700), { count: 26, minW: 70, maxW: 130, minH: 40, maxH: 75 }, mulberry32(11)),
    stocking: 1.5,
    coveyMaxSize: 4,
    runnerChance: 0.15,
    nerveMinMs: 6000,
    nerveMaxMs: 10000,
  },
  {
    id: 'pheasant-coverts',
    name: 'Pheasant Coverts',
    tagline: "they'd rather run than fly",
    grass: 0x8a7a3a,
    cover: 0x5e5424,
    world: world(1400, 800),
    patches: scatterRects(world(1400, 800), { count: 30, minW: 90, maxW: 170, minH: 28, maxH: 50 }, mulberry32(22)),
    stocking: 0.85,
    coveyMaxSize: 2,
    runnerChance: 0.7,
    nerveMinMs: 4000,
    nerveMaxMs: 7000,
  },
  {
    id: 'grouse-woods',
    name: 'Grouse Woods',
    tagline: 'nervous birds in thick cover',
    grass: 0x3f6b4a,
    cover: 0x28513a,
    world: world(1000, 640),
    patches: scatterRects(world(1000, 640), { count: 24, minW: 80, maxW: 150, minH: 50, maxH: 85 }, mulberry32(33)),
    stocking: 1.1,
    coveyMaxSize: 2,
    runnerChance: 0.3,
    nerveMinMs: 3000,
    nerveMaxMs: 5500,
  },
];

/** Stocking is a density; the actual head count scales with world size. */
export function areaBirdCount(area: AreaConfig): number {
  return Math.max(3, Math.round((area.world.w * area.world.h) / 100_000 * area.stocking));
}

export function getArea(id: string): AreaConfig {
  return AREAS.find((a) => a.id === id) ?? AREAS[0];
}
