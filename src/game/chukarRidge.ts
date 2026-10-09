/**
 * Chukar Ridge as a property: its entries, named hunt areas, landmarks and
 * routes, all placed on the authored canyon (chukarCanyon.ts). Property yards.
 *
 * Ten hunt areas, from the top down: Rim Flat (the sage plateau), West Point
 * (an upper-rim spur), High Bench, Castle Rock (the middle rim's tower),
 * Sage Draw (the route up the west wall), West Bench (the guzzler), Cheat
 * Face (the big south-facing cheat slope), River Breaks (the knobs above the
 * river road), Spring Creek (the side canyon and its spring seam) and the
 * North Face (the shaded flank of the east ridge).
 */
import { CHUKAR_WORLD, chukarHeight, chukarWallAt, type ChukarWallSample } from './chukarCanyon';
import { CHUKAR_GUZZLER, CHUKAR_SPRING_SEAM } from './chukarHabitat';
import { registerHuntAreas, seededAreaGrid, type HuntArea } from './huntAreas';
import type { Vec2 } from './types';

export interface ChukarEntry { id: string; name: string; position: Vec2; /** Where the hunter faces on arrival. */ toward: Vec2 }

/** Four truck entries around the edge: the bottom, the west bench, the top
 * and the side canyon's mouth. The first two keep their old ids. */
export const CHUKAR_ENTRIES: readonly ChukarEntry[] = [
  { id: 'south-gate', name: 'River Road', position: { x: 470, y: 1385 }, toward: { x: 540, y: 1200 } },
  { id: 'west-track', name: 'West Bench', position: { x: 22, y: 1000 }, toward: { x: 150, y: 950 } },
  { id: 'rim-track', name: 'Rim Gate', position: { x: 1350, y: 15 }, toward: { x: 1250, y: 200 } },
  { id: 'creek-mouth', name: 'Spring Creek', position: { x: 1200, y: 1385 }, toward: { x: 1250, y: 1200 } },
];

/** Remembered places, each the landmark of a hunt area. */
export const CHUKAR_PLACES = {
  corral: { x: 560, y: 190 },
  westPoint: { x: 468, y: 490 },
  cairn: { x: 548, y: 622 },
  castleRock: { x: 993, y: 812 },
  snag: { x: 735, y: 560 },
  guzzler: { x: CHUKAR_GUZZLER.x, y: CHUKAR_GUZZLER.y },
  slide: { x: 860, y: 700 },
  chimney: { x: 905, y: 1180 },
  spring: CHUKAR_SPRING_SEAM[0],
  splitRock: { x: 1800, y: 700 },
} as const;

type Seed = [number, number];
interface ChukarAreaSpec extends HuntArea { seeds: Seed[]; /** A drainage whose floor this area claims. */ claims?: string }

export const CHUKAR_HUNT_AREAS: readonly ChukarAreaSpec[] = [
  { id: 'rim-flat', name: 'Rim Flat', center: { x: 700, y: 140 }, seeds: [[550, 180], [1250, 120], [2050, 90]],
    landform: 'the sage plateau above the upper rim', cover: 'big sagebrush with cheat and bunchgrass openings',
    landmark: { name: 'Line camp corral', position: CHUKAR_PLACES.corral },
    uses: { feed: .6, loaf: .2, roost: .1, escape: .1 },
    birds: 'Huns feed on the flat at first light and evening; late in the season chukar work the rim edge and pitch over it when pushed.' },
  { id: 'west-point', name: 'West Point', center: { x: 450, y: 470 }, seeds: [[460, 480], [250, 400]],
    landform: 'an upper-rim spur, its talus and the cheat slope below', cover: 'rimrock, talus and cheatgrass',
    landmark: { name: 'West Point', position: CHUKAR_PLACES.westPoint },
    uses: { roost: .8, escape: .9, loaf: .4, feed: .3 },
    birds: 'Chukar roost on the point and call off it at dawn, then walk down onto the cheat; pushed birds run back up to the rocks.' },
  { id: 'high-bench', name: 'High Bench', center: { x: 600, y: 610 }, seeds: [[560, 600], [880, 590], [1180, 660]],
    landform: 'the broad bench between the middle and upper rims', cover: 'bluebunch wheatgrass with sage under the rim lip',
    landmark: { name: "Sheepherder's cairn", position: CHUKAR_PLACES.cairn },
    uses: { loaf: .9, feed: .5, roost: .2, escape: .3 },
    birds: 'Midday coveys loaf on the bench in reach of the rim; on warm days they sit in the lip shade.' },
  { id: 'castle-rock', name: 'Castle Rock', center: { x: 990, y: 740 }, seeds: [[990, 740]],
    landform: "the middle rim's tallest point, columns on three sides", cover: 'rimrock and talus',
    landmark: { name: 'Castle Rock', position: CHUKAR_PLACES.castleRock },
    uses: { roost: .9, escape: 1, loaf: .5 },
    birds: 'Roost and escape cover: birds call from the castle at first light and run into its talus when pressed.' },
  { id: 'sage-draw', name: 'Sage Draw', center: { x: 680, y: 760 }, seeds: [[690, 700]], claims: 'sage-draw',
    landform: 'a draw cutting all three rims, the easy way up the west wall', cover: 'big sage in the bottom, cheat on the sides',
    landmark: { name: 'Juniper snag', position: CHUKAR_PLACES.snag },
    uses: { escape: .6, loaf: .6, feed: .3, water: .1 },
    birds: 'On windy days birds tuck into the sage bottom; any day it funnels runners uphill to the rims.' },
  { id: 'west-bench', name: 'West Bench', center: { x: 260, y: 880 }, seeds: [[250, 870], [60, 990]],
    landform: 'the lower bench on the west wall', cover: 'cheat and bunchgrass, sage along the lip',
    landmark: { name: 'Guzzler', position: CHUKAR_PLACES.guzzler },
    uses: { water: .9, loaf: .6, feed: .4 },
    birds: 'Early season and hot afternoons the guzzler draws coveys from the slopes above; mornings they feed on the bench.' },
  { id: 'cheat-face', name: 'Cheat Face', center: { x: 880, y: 800 }, seeds: [[880, 800], [1080, 880], [460, 760]],
    landform: 'the long south-facing slope between the lower and middle rims', cover: 'cheatgrass striped with cattle trails',
    landmark: { name: 'The Slide', position: CHUKAR_PLACES.slide },
    uses: { feed: 1, loaf: .3, escape: .3 },
    birds: 'The morning feed, more so as the season goes on and the cheat greens after rain; flushed birds sail down the face.' },
  { id: 'river-breaks', name: 'River Breaks', center: { x: 650, y: 1230 }, seeds: [[550, 1220], [900, 1250], [250, 1200]],
    landform: 'rolling knobs and gullies above the river road', cover: 'cheatgrass with sage in the gullies',
    landmark: { name: 'Cabin chimney', position: CHUKAR_PLACES.chimney },
    uses: { feed: .7, water: .3, loaf: .3 },
    birds: 'Early and late in the day birds come down the breaks toward the river; the nearest birds to the road.' },
  { id: 'spring-creek', name: 'Spring Creek', center: { x: 1700, y: 650 }, seeds: [[1560, 860], [1820, 450]], claims: 'spring-creek',
    landform: 'the side canyon, its creek bed greened below the spring', cover: 'willow, rose and green grass on the seam; sage and cheat on the walls',
    landmark: { name: 'Spring and willows', position: CHUKAR_PLACES.spring },
    uses: { water: 1, feed: .5, loaf: .4, escape: .3 },
    birds: 'Water: in September and on hot days coveys stay within a walk of the spring and come to it morning and evening.' },
  { id: 'north-face', name: 'North Face', center: { x: 1850, y: 760 }, seeds: [[1830, 700], [2050, 650], [1700, 1000]],
    landform: 'the shaded north flank of the east ridge', cover: 'bluebunch wheatgrass and talus, cool and green',
    landmark: { name: 'Split Rock', position: CHUKAR_PLACES.splitRock },
    uses: { loaf: .7, escape: .5, roost: .3, feed: .2 },
    birds: 'Warm afternoons push loafing coveys into the shade here; it holds frost and scent longest in the morning.' },
];

/** Membership seeds the elevation-weighted grid measures from. Elevation
 * counts this many yards per metre, so a rim divides two areas. */
const AREA_CLIMB = 7;
const AREA_CELL = 8;

registerHuntAreas('chukar-ridge', () => {
  const sample: ChukarWallSample = { s: 0, broken: 0, draw: 0, drawId: null, crest: 0 };
  const claimants = new Map(CHUKAR_HUNT_AREAS.flatMap((area, index) => area.claims ? [[area.claims, index] as const] : []));
  const seeds = CHUKAR_HUNT_AREAS.flatMap((area, index) => area.seeds.map(([x, y]) => ({ area: index, x, y, height: chukarHeight(x, y) })));
  const indexAt = seededAreaGrid(CHUKAR_WORLD, AREA_CELL, seeds, chukarHeight, (x, y) => {
    chukarWallAt(x, y, sample);
    return sample.drawId && sample.draw > .3 ? claimants.get(sample.drawId) ?? -1 : -1;
  }, AREA_CLIMB);
  return { areas: CHUKAR_HUNT_AREAS, indexAt };
});

/**
 * Trail waypoints. The routes themselves are planned over the real surface
 * by tools3d/bake-chukar-trails.mjs (contours where they can, switchbacks
 * where they must, around the rimrock) and baked into chukarTrails.ts.
 */
export const CHUKAR_TRAIL_WAYPOINTS: readonly { id: string; points: Vec2[] }[] = [
  { id: 'river-road-climb', points: [CHUKAR_ENTRIES[0].position, { x: 540, y: 1200 }, { x: 612, y: 1050 }, { x: 642, y: 900 }, { x: 668, y: 790 }, { x: 700, y: 600 }, { x: 722, y: 430 }, { x: 745, y: 250 }] },
  { id: 'west-bench-trail', points: [CHUKAR_ENTRIES[1].position, { x: 150, y: 950 }, { x: 280, y: 860 }, { x: 460, y: 905 }, { x: 642, y: 900 }] },
  { id: 'high-bench-trail', points: [{ x: 700, y: 600 }, { x: 560, y: 600 }, { x: 420, y: 560 }] },
  { id: 'castle-trail', points: [{ x: 700, y: 600 }, { x: 880, y: 590 }, { x: 990, y: 720 }, { x: 1180, y: 660 }] },
  { id: 'rim-two-track', points: [CHUKAR_ENTRIES[2].position, { x: 1100, y: 160 }, { x: 745, y: 250 }, { x: 560, y: 205 }, { x: 300, y: 260 }] },
  { id: 'spring-creek-trail', points: [CHUKAR_ENTRIES[3].position, { x: 1265, y: 1140 }, { x: 1430, y: 990 }, { x: 1620, y: 820 }, { x: 1760, y: 600 }, { x: 1850, y: 360 }, { x: 1930, y: 160 }, { x: 1975, y: 60 }] },
  { id: 'cheat-traverse', points: [{ x: 668, y: 790 }, { x: 880, y: 800 }, { x: 1080, y: 880 }, { x: 1265, y: 1140 }] },
  { id: 'breaks-road', points: [CHUKAR_ENTRIES[0].position, { x: 700, y: 1300 }, { x: 905, y: 1215 }, { x: 1100, y: 1330 }, CHUKAR_ENTRIES[3].position] },
];
