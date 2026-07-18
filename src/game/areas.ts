import type { Rect } from './field';

/**
 * A hunting area: a map (cover layout + palette) plus the species mix that
 * lives there. Bird behavior is data — nerve, covey size, runner tendency —
 * so new areas and new species are configuration, not code.
 */
export interface AreaConfig {
  id: string;
  name: string;
  tagline: string;
  grass: number;
  cover: number;
  patches: Rect[];
  birdCount: number;
  coveyMaxSize: number;
  /** 0..1 share of birds that run from the dog. */
  runnerChance: number;
  nerveMinMs: number;
  nerveMaxMs: number;
}

export const AREAS: AreaConfig[] = [
  {
    id: 'quail-fields',
    name: 'Quail Fields',
    tagline: 'big coveys, and they hold tight',
    grass: 0x5a9440,
    cover: 0x3d7429,
    patches: [
      { x: 30, y: 30, w: 70, h: 45 },
      { x: 150, y: 20, w: 60, h: 40 },
      { x: 300, y: 35, w: 80, h: 50 },
      { x: 410, y: 60, w: 50, h: 60 },
      { x: 60, y: 130, w: 65, h: 50 },
      { x: 200, y: 120, w: 75, h: 55 },
      { x: 350, y: 150, w: 70, h: 45 },
      { x: 120, y: 210, w: 60, h: 40 },
      { x: 260, y: 205, w: 80, h: 45 },
    ],
    birdCount: 8,
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
    patches: [
      { x: 40, y: 40, w: 90, h: 30 },
      { x: 220, y: 30, w: 60, h: 35 },
      { x: 360, y: 45, w: 85, h: 30 },
      { x: 80, y: 120, w: 120, h: 28 },
      { x: 260, y: 115, w: 100, h: 30 },
      { x: 30, y: 190, w: 100, h: 32 },
      { x: 210, y: 195, w: 110, h: 30 },
      { x: 380, y: 180, w: 70, h: 40 },
    ],
    birdCount: 6,
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
    patches: [
      { x: 20, y: 20, w: 100, h: 60 },
      { x: 170, y: 15, w: 90, h: 55 },
      { x: 320, y: 25, w: 130, h: 60 },
      { x: 30, y: 110, w: 110, h: 65 },
      { x: 190, y: 105, w: 100, h: 60 },
      { x: 340, y: 115, w: 120, h: 55 },
      { x: 60, y: 200, w: 120, h: 55 },
      { x: 240, y: 195, w: 110, h: 55 },
    ],
    birdCount: 5,
    coveyMaxSize: 2,
    runnerChance: 0.3,
    nerveMinMs: 3000,
    nerveMaxMs: 5500,
  },
];

export function getArea(id: string): AreaConfig {
  return AREAS.find((a) => a.id === id) ?? AREAS[0];
}
