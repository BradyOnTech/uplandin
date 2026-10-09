/**
 * Chukar Ridge habitat, read from the land rather than painted on it.
 *
 * - Basalt rims and their talus aprons are roost and escape cover.
 * - Cheatgrass takes the sunny south and west slopes and the breaks.
 * - Bluebunch wheatgrass holds the north and east faces and the high bench.
 * - Big sage fills the draw bottoms and the rim flat, and shelters under
 *   the rim lips on the benches.
 * - The spring seam in Spring Creek is water, with willow, rose and green
 *   grass; the guzzler on the west bench is water too.
 *
 * Every consumer (ground paint, plants, the dog's cover, bird placement, the
 * survey map) reads these same values.
 */
import { CHUKAR_RIM_IDS, CHUKAR_WALL, chukarHeight, chukarTalusAt, chukarWallAt, type ChukarWallSample } from './chukarCanyon';
import { FeatureLine, type LineHit, clamp01, smoothstep, valueNoise } from './featureLandform';

const mosaic = valueNoise(7741);
import type { GroundSample } from './landscape';
import type { Vec2 } from './types';

export type ChukarCover = 'rimrock' | 'talus' | 'sage' | 'cheat' | 'bunchgrass' | 'seep' | 'bare';
export const CHUKAR_COVERS: readonly ChukarCover[] = ['rimrock', 'talus', 'sage', 'cheat', 'bunchgrass', 'seep', 'bare'];

/** The spring seam: the spring rises at the foot of the middle rim where
 * Spring Creek cuts it, and greens the creek bed below. Property yards. */
export const CHUKAR_SPRING_SEAM: readonly Vec2[] = [
  { x: 1858, y: 344 }, { x: 1846, y: 392 }, { x: 1826, y: 446 }, { x: 1803, y: 500 }, { x: 1782, y: 556 }, { x: 1764, y: 612 },
];
/** Half-width of the green seam, yards, at its head and its foot. */
export const CHUKAR_SEAM_WIDTH = { head: 6, foot: 15 } as const;
const seamLine = new FeatureLine(CHUKAR_SPRING_SEAM.map((p, i) => ({ ...p, half: CHUKAR_SEAM_WIDTH.head + (CHUKAR_SEAM_WIDTH.foot - CHUKAR_SEAM_WIDTH.head) * i / (CHUKAR_SPRING_SEAM.length - 1) })), CHUKAR_SEAM_WIDTH.foot + 6);
const seamHit: LineHit = { distance: 0, t: 0, segment: 0, side: 0 };

/** The guzzler on the lower bench, west: a rain apron and drinker. */
export const CHUKAR_GUZZLER = { x: 300, y: 905, angle: Math.PI / 2 } as const;

/** Green wetness of the spring seam, 0..1. */
export function chukarSeamAt(x: number, y: number): number {
  if (!seamLine.nearest(x, y, seamHit)) return 0;
  const half = seamLine.value(seamHit, 'half');
  const ragged = half * (1 + Math.sin(x * .31 + y * .17) * .16);
  // Fresh at the spring head, spreading and fading toward the foot.
  const along = (seamHit.segment + seamHit.t) / (CHUKAR_SPRING_SEAM.length - 1);
  return (1 - smoothstep(ragged * .45, ragged, seamHit.distance)) * (1 - smoothstep(.8, 1.05, along) * .6);
}

export interface ChukarGround {
  cover: ChukarCover;
  sage: number; cheat: number; bunchgrass: number; talus: number; rimrock: number; seep: number;
  /** Wall coordinate and band, for consumers that work by elevation band. */
  s: number; band: string;
  /** In a draw bottom (0..1) and on a crest (0..1). */
  draw: number; crest: number;
  /** +1 faces due south, -1 due north, 0 level or east/west. */
  southness: number;
}

const wall: ChukarWallSample = { s: 0, broken: 0, draw: 0, drawId: null, crest: 0 };
const rimBands = CHUKAR_RIM_IDS.map(id => CHUKAR_WALL.band(id));
const flat = CHUKAR_WALL.band('rim-flat');
const highBench = CHUKAR_WALL.band('high-bench');

/** Habitat from a position plus its slope (rise over run) and grade. */
export function chukarGroundFrom(x: number, y: number, slope: number, gradeX: number, gradeY: number, out: ChukarGround): ChukarGround {
  chukarWallAt(x, y, wall);
  const s = wall.s;
  let band = 'rim-flat';
  for (const b of CHUKAR_WALL.bands) if (s < b.to) { band = b.id; break; }
  const southness = slope > .02 ? -gradeY / slope * smoothstep(.04, .2, slope) : 0;
  const steep = smoothstep(.35, .85, slope);
  const level = 1 - smoothstep(.07, .24, slope);
  let rimrock = 0;
  for (const b of rimBands) if (s > b.from - .5 && s < b.to + .5) rimrock = Math.max(rimrock, 1 - wall.broken);
  const talus = chukarTalusAt(s) * (1 - wall.broken * .7) * (1 - rimrock);
  const seep = chukarSeamAt(x, y);
  // A lip of shelter just behind each rim edge on the bench above it.
  let lip = 0;
  for (const b of rimBands) lip = Math.max(lip, smoothstep(b.to + 30, b.to + 4, s) * smoothstep(b.to, b.to + 4, s));
  const onFlat = smoothstep(flat.from + 10, flat.from + 60, s);
  // The flat is a mosaic: sage stands with cheat and bunchgrass openings.
  const stand = smoothstep(.36, .62, mosaic(x * .012, y * .012) * .75 + mosaic(x * .045 + 9, y * .045 + 3) * .25);
  const sage = clamp01((.12 + wall.draw * .78 + onFlat * (.12 + stand * .62) + lip * .35 + Math.max(0, -southness) * .12) * (1 - talus) * (1 - rimrock) * (1 - steep * .55) * (1 - seep * .8));
  const cheat = clamp01((.3 + Math.max(0, southness) * .62 + (band === 'river-breaks' || band === 'road-bench' ? .32 : 0) + onFlat * (1 - stand) * .2) * (1 - talus * .85) * (1 - rimrock) * (1 - seep));
  const onHigh = s > highBench.from && s < highBench.to ? 1 : 0;
  const bunchgrass = clamp01((.24 + Math.max(0, -southness) * .7 + onHigh * .28 + level * .05) * (1 - talus * .85) * (1 - rimrock) * (1 - seep));
  const bare = clamp01(steep * .6 - .1);
  out.sage = sage; out.cheat = cheat; out.bunchgrass = bunchgrass; out.talus = talus; out.rimrock = rimrock; out.seep = seep;
  out.s = s; out.band = band; out.draw = wall.draw; out.crest = wall.crest; out.southness = southness;
  let cover: ChukarCover = 'cheat', best = cheat;
  if (bunchgrass > best) { cover = 'bunchgrass'; best = bunchgrass; }
  if (sage > best * .9) { cover = 'sage'; best = sage; }
  if (bare > best) { cover = 'bare'; best = bare; }
  if (talus > .45) cover = 'talus';
  if (seep > .4) cover = 'seep';
  if (rimrock > .5) cover = 'rimrock';
  out.cover = cover;
  return out;
}

const STEP = 1.5;
const scratch: ChukarGround = { cover: 'cheat', sage: 0, cheat: 0, bunchgrass: 0, talus: 0, rimrock: 0, seep: 0, s: 0, band: '', draw: 0, crest: 0, southness: 0 };
/** Habitat at a position, measuring the slope from the cached surface. */
export function chukarGroundAt(x: number, y: number, out: ChukarGround = scratch): ChukarGround {
  const gx = (chukarHeight(x + STEP, y) - chukarHeight(x - STEP, y)) / (STEP * 2 * .9144);
  const gy = (chukarHeight(x, y + STEP) - chukarHeight(x, y - STEP)) / (STEP * 2 * .9144);
  return chukarGroundFrom(x, y, Math.hypot(gx, gy), gx, gy, out);
}

/** The shared GroundSample view of the habitat: rock, plants, wet. */
export function chukarSurfaceAt(x: number, y: number, slope: number, gradeX: number, gradeY: number, out: GroundSample): void {
  const g = chukarGroundFrom(x, y, slope, gradeX, gradeY, scratch);
  out.rockiness = clamp01(Math.max(g.rimrock, g.talus * .85, smoothstep(.75, 1.4, slope) * .7));
  out.vegetation = clamp01(g.sage * .85 + Math.max(g.cheat, g.bunchgrass) * .55 + g.seep);
  out.moisture = clamp01(g.seep + g.draw * .22);
}
