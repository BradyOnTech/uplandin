import type { Condition } from './conditions';
import { scatterRects, type Rect } from './field';
import { mulberry32 } from './math';
import type { SpeciesShare } from './species';
import type { Vec2 } from './types';
import { pheasantDryCover, pheasantShoreCover, pheasantWestFence } from './pheasantHabitat';
import { pheasantFarmCover } from './pheasantFarm';
import { pheasantOldFarmsteadCover } from './pheasantFeatures';
import { chukarCoverPatches } from './chukarLandscape';
import { quailCoverPatches } from './quailComposition';
import { SHARPTAIL_COVER_PATCHES } from './sharptailLandscape';

export type LandmarkKind = 'gate' | 'windmill' | 'barn' | 'pond' | 'fence';

export type TerrainKind = 'prairie' | 'wetland' | 'woods' | 'rimrock' | 'desert' | 'canyon' | 'alpine' | 'oak-savanna';

/** Stable landform recipe: a named location keeps its recognizable ground. */
export interface AreaTerrainProfile {
  kind: TerrainKind;
  seed: number;
  baseHeight: number;
  broadRelief: number;
  rollingRelief: number;
  detailRelief: number;
  /** Meters gained across 100 horizontal meters in world x/z. */
  gradeX: number;
  gradeZ: number;
}

export interface AreaLandmark {
  id: string;
  name: string;
  kind: LandmarkKind;
  position: Vec2;
}

export interface AreaTrail {
  id: string;
  points: Vec2[];
}

export interface DropPoint {
  id: string;
  name: string;
  position: Vec2;
  /** Direction the hunter faces into the covert (screen-coordinate radians). */
  heading: number;
  /** Bird-free radius around the parked vehicle and unloaded guns. */
  safetyRadius: number;
  landmarkId?: string;
}

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
  terrain: AreaTerrainProfile;
  dropPoints: DropPoint[];
  landmarks: AreaLandmark[];
  trails: AreaTrail[];
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

const TERRAIN_DEFAULTS: Record<TerrainKind, Omit<AreaTerrainProfile, 'kind' | 'seed'>> = {
  prairie: { baseHeight: 6, broadRelief: 18, rollingRelief: 6, detailRelief: 1.4, gradeX: 0, gradeZ: 0 },
  wetland: { baseHeight: 3, broadRelief: 7, rollingRelief: 2.5, detailRelief: 0.7, gradeX: 0, gradeZ: 0 },
  woods: { baseHeight: 5, broadRelief: 13, rollingRelief: 5, detailRelief: 1.6, gradeX: 0, gradeZ: 0 },
  rimrock: { baseHeight: 11, broadRelief: 30, rollingRelief: 10, detailRelief: 2.4, gradeX: 0.7, gradeZ: -1.1 },
  desert: { baseHeight: 7, broadRelief: 16, rollingRelief: 7, detailRelief: 1.8, gradeX: 0.25, gradeZ: 0.35 },
  canyon: { baseHeight: 9, broadRelief: 25, rollingRelief: 11, detailRelief: 2.2, gradeX: 0.45, gradeZ: -0.7 },
  alpine: { baseHeight: 16, broadRelief: 34, rollingRelief: 12, detailRelief: 2.8, gradeX: 1.2, gradeZ: -0.45 },
  'oak-savanna': { baseHeight: 7, broadRelief: 20, rollingRelief: 7, detailRelief: 1.5, gradeX: -0.25, gradeZ: 0.1 },
};

function terrain(kind: TerrainKind, seed: number): AreaTerrainProfile {
  return { kind, seed, ...TERRAIN_DEFAULTS[kind] };
}

function geographyPoints(w: number, h: number, seed: number) {
  // Quail Fields is the tuned onboarding covert. Preserve its proven hunt
  // line while every additional property receives its own layout below.
  if (seed === 11) {
    return {
      south: { x: w * 0.42, y: h - 42 },
      west: { x: 42, y: h * 0.58 },
      junction: { x: w * 0.55, y: h * 0.48 },
      southMid: { x: w * 0.45, y: h * 0.67 },
      westMid: { x: w * 0.27, y: h * 0.55 },
      feature: { x: w * 0.69, y: h * 0.31 },
    };
  }
  const rng = mulberry32(seed);
  const south = { x: w * (0.34 + rng() * 0.17), y: h - (34 + rng() * 20) };
  const west = { x: 34 + rng() * 20, y: h * (0.42 + rng() * 0.22) };
  const junction = { x: w * (0.42 + rng() * 0.2), y: h * (0.38 + rng() * 0.2) };
  const southMid = {
    x: south.x * 0.58 + junction.x * 0.42 + (rng() - 0.5) * w * 0.08,
    y: south.y * 0.58 + junction.y * 0.42,
  };
  const westMid = {
    x: west.x * 0.58 + junction.x * 0.42,
    y: west.y * 0.58 + junction.y * 0.42 + (rng() - 0.5) * h * 0.08,
  };
  const feature = { x: w * (0.58 + rng() * 0.25), y: h * (0.2 + rng() * 0.23) };
  return { south, west, junction, southMid, westMid, feature };
}

/** A real first objective off each parking place, visible on the map. */
function entryCover(w: number, h: number, seed: number): Rect[] {
  if (seed === 11) {
    return [
      { x: w * 0.42 - 35, y: h - 128, w: 70, h: 52 },
      { x: 76, y: h * 0.58 - 35, w: 58, h: 70 },
    ];
  }
  const points = geographyPoints(w, h, seed);
  const make = (drop: Vec2, toward: Vec2, width: number, height: number): Rect => {
    const angle = Math.atan2(toward.y - drop.y, toward.x - drop.x);
    const center = { x: drop.x + Math.cos(angle) * 78, y: drop.y + Math.sin(angle) * 78 };
    return { x: center.x - width / 2, y: center.y - height / 2, w: width, h: height };
  };
  return [
    make(points.south, points.southMid, 70, 52),
    make(points.west, points.westMid, 58, 70),
  ];
}

/** Shared, deterministic geography consumed by the map and both hunt renderers. */
function geography(w: number, h: number, feature: { name: string; kind: LandmarkKind }, seed: number) {
  const points = geographyPoints(w, h, seed);
  const { south, west, junction, southMid, westMid } = points;
  return {
    dropPoints: [
      {
        id: 'south-gate',
        name: 'South Gate',
        position: south,
        heading: seed === 11 ? -Math.PI / 2 : Math.atan2(southMid.y - south.y, southMid.x - south.x),
        safetyRadius: 48,
        landmarkId: 'south-gate',
      },
      {
        id: 'west-track',
        name: 'West Track',
        position: west,
        heading: seed === 11 ? 0 : Math.atan2(westMid.y - west.y, westMid.x - west.x),
        safetyRadius: 48,
        landmarkId: 'west-gate',
      },
    ] satisfies DropPoint[],
    landmarks: [
      { id: 'south-gate', name: 'South Gate', kind: 'gate', position: { x: south.x, y: south.y + 12 } },
      { id: 'west-gate', name: 'West Gate', kind: 'gate', position: { x: west.x - 12, y: west.y } },
      { id: 'area-feature', name: feature.name, kind: feature.kind, position: points.feature },
    ] satisfies AreaLandmark[],
    trails: [
      { id: 'south-track', points: [south, southMid, junction] },
      { id: 'west-track', points: [west, westMid, junction] },
    ] satisfies AreaTrail[],
  };
}

/** The windmill and return track complete a walkable loop on the shared map. */
function quailGeography() {
  const base = geography(1200, 700, { name: 'Old Windmill', kind: 'windmill' }, 11);
  // The service track passes south of the tower and tank, leaving both beside
  // the route. Matching approach/departure tangents keep the two ruts joined.
  const windmillAccess = { x: base.landmarks[2].position.x, y: base.landmarks[2].position.y + 9 };
  const authored: AreaTrail[] = [
      { id: 'south-track', points: [base.dropPoints[0].position, { x: 507, y: 633 }, { x: 498, y: 602 }, { x: 514, y: 557 }, { x: 543, y: 518 }, base.trails[0].points[1], { x: 568, y: 419 }, { x: 619, y: 363 }, base.trails[0].points[2]] },
      { id: 'west-track', points: [base.dropPoints[1].position, { x: 91, y: 410 }, { x: 139, y: 394 }, { x: 200, y: 402 }, { x: 269, y: 383 }, base.trails[1].points[1], { x: 418, y: 373 }, { x: 504, y: 390 }, { x: 593, y: 365 }, base.trails[1].points[2]] },
      { id: 'windmill-track', points: [base.trails[0].points[2], { x: 750, y: 299 }, { x: 786, y: 240 }, { x: windmillAccess.x - 20, y: windmillAccess.y + 3 }, windmillAccess] },
      { id: 'east-return', points: [windmillAccess, { x: windmillAccess.x + 20, y: windmillAccess.y - 3 }, { x: 922, y: 298 }, { x: 965, y: 435 }, { x: 790, y: 555 }, { x: 650, y: 533 }, base.trails[0].points[1]] },
    ];
  const key = (p: Vec2) => `${p.x},${p.y}`;
  // Keep every branch connection exact while rounding ordinary bends.
  const anchors = new Set(authored.flatMap((trail) => [key(trail.points[0]), key(trail.points.at(-1)!)]));
  const trails = authored.map((trail): AreaTrail => {
    const points: Vec2[] = [trail.points[0]];
    for (let i = 1; i < trail.points.length - 1; i++) {
      const p = trail.points[i]; const before = trail.points[i - 1]; const after = trail.points[i + 1];
      if (anchors.has(key(p))) { points.push(p); continue; }
      const back = Math.hypot(before.x - p.x, before.y - p.y);
      const next = Math.hypot(after.x - p.x, after.y - p.y);
      const radius = Math.min(16, back * 0.28, next * 0.28);
      const a = { x: p.x + (before.x - p.x) * radius / back, y: p.y + (before.y - p.y) * radius / back };
      const b = { x: p.x + (after.x - p.x) * radius / next, y: p.y + (after.y - p.y) * radius / next };
      for (let n = 0; n <= 6; n++) {
        const t = n / 6; const u = 1 - t;
        points.push({ x: u * u * a.x + 2 * u * t * p.x + t * t * b.x, y: u * u * a.y + 2 * u * t * p.y + t * t * b.y });
      }
    }
    points.push(trail.points.at(-1)!);
    return { id: trail.id, points };
  });
  return { ...base, trails };
}

function pointOffDrop(drop: DropPoint, forward: number, right: number): Vec2 {
  return {
    x: drop.position.x + Math.cos(drop.heading) * forward - Math.sin(drop.heading) * right,
    y: drop.position.y + Math.sin(drop.heading) * forward + Math.cos(drop.heading) * right,
  };
}

/** Authored prairie-pothole anchors shared by the map and both renderers. */
function pheasantGeography(w: number, h: number) {
  const base = geography(w, h, { name: 'Stock Pond', kind: 'pond' }, 22);
  const [south, west] = base.dropPoints;
  const southSlough = pointOffDrop(south, 92, 4);
  const westPothole = pointOffDrop(west, 106, -8);
  const oldHomestead = pointOffDrop(south, 156, -72);
  const southShoulder = pointOffDrop(south, 94, -64);
  const southApproach = pointOffDrop(south, 32, -27);
  // Trails meet at the front of the farmyard, never through the barn itself.
  const homesteadYard = { x: oldHomestead.x + 8, y: oldHomestead.y + 30 };
  const homesteadFarCorner = { x: oldHomestead.x + 110, y: oldHomestead.y - 94 };
  const sloughNeck = { x: southSlough.x + 76, y: southSlough.y - 104 };
  const westShoulder = pointOffDrop(west, 108, 62);
  const westFieldEntry = pointOffDrop(west, 68, 55);
  const junction = base.trails[0].points.at(-1)!;
  const landmarks = [
    ...base.landmarks,
    { id: 'south-slough', name: 'South Slough', kind: 'pond' as const, position: southSlough },
    { id: 'west-pothole', name: 'West Pothole', kind: 'pond' as const, position: westPothole },
    { id: 'old-homestead', name: 'Old Homestead', kind: 'barn' as const, position: oldHomestead },
  ] satisfies AreaLandmark[];
  const northFence = pheasantWestFence(landmarks).at(-1)!;
  landmarks.push({ id: 'north-fence', name: 'North Fence', kind: 'fence', position: northFence });
  return {
    ...base,
    dropPoints: [south, west].map((drop, index) => {
      const next = index === 0 ? southApproach : pointOffDrop(west, 35, 28);
      return { ...drop, heading: Math.atan2(next.y - drop.position.y, next.x - drop.position.x) };
    }),
    landmarks,
    // Cover follows the farm: CRP blocks, fencerows and a grassed waterway,
    // then the authored pond pockets and farmstead windbreak take precedence.
    patches: pheasantDryCover([
      ...pheasantFarmCover(world(w, h)),
      ...pheasantOldFarmsteadCover(world(w, h)),
      ...pheasantShoreCover(landmarks),
    ], landmarks),
    // Work the live shore from the entry, or heel across the cut field and
    // approach its end from open ground. Neither route dictates a bird's
    // outcome: runners can turn through the connected rim on either side.
    trails: [
      { id: 'south-slough-line', points: [south.position, southApproach, pointOffDrop(south, 58, -52), southShoulder, homesteadYard] },
      // The field-side circuit can get the handler ahead of the east shore;
      // the neck remains live cover connecting this wetland to the farm.
      { id: 'south-headland-flank', points: [southApproach,
        { x: southSlough.x - 28, y: southSlough.y + 80 },
        { x: southSlough.x + 112, y: southSlough.y + 80 },
        { x: southSlough.x + 164, y: southSlough.y + 28 },
        { x: southSlough.x + 152, y: southSlough.y - 66 }, sloughNeck, homesteadFarCorner] },
      { id: 'slough-neck-line', points: [homesteadYard,
        { x: southSlough.x - 24, y: southSlough.y - 66 },
        { x: southSlough.x + 14, y: southSlough.y - 68 }, sloughNeck] },
      // Work the sheltered inside edge, or circle through cut ground around
      // the exposed western end. Both routes return to the same farm corner.
      { id: 'homestead-shelterbelt-line', points: [homesteadYard,
        { x: oldHomestead.x - 34, y: oldHomestead.y + 30 },
        { x: oldHomestead.x - 34, y: oldHomestead.y - 46 },
        { x: oldHomestead.x + 60, y: oldHomestead.y - 46 }, homesteadFarCorner, junction] },
      { id: 'homestead-field-loop', points: [homesteadYard,
        { x: oldHomestead.x - 34, y: oldHomestead.y + 30 },
        { x: oldHomestead.x - 34, y: oldHomestead.y + 62 },
        { x: oldHomestead.x - 90, y: oldHomestead.y + 62 },
        { x: oldHomestead.x - 90, y: oldHomestead.y - 106 },
        { x: oldHomestead.x + 110, y: oldHomestead.y - 106 }, homesteadFarCorner] },
      { id: 'west-pothole-line', points: [west.position, pointOffDrop(west, 35, 28), westFieldEntry, westShoulder, pointOffDrop(west, 145, 62), northFence, junction] },
      { id: 'west-harvest-flank', points: [westFieldEntry,
        { x: westPothole.x - 40, y: westPothole.y + 98 },
        { x: westPothole.x + 106, y: westPothole.y + 108 }, northFence] },
      { id: 'homestead-fence-edge', points: [homesteadFarCorner,
        { x: oldHomestead.x - 90, y: oldHomestead.y - 106 }, northFence] },
    ] satisfies AreaTrail[],
  };
}

/** Broad contour benches and a remembered return for Hungarian partridge. */
function hunGeography(w: number, h: number) {
  const base = geography(w, h, { name: 'High Bench Fence', kind: 'fence' }, 66);
  const [south, west] = base.dropPoints;
  const p = (x: number, y: number): Vec2 => ({ x: w * x, y: h * y });
  const lowerBench = p(.45, .67);
  const junction = p(.56, .54);
  const upperBench = p(.72, .34);
  const flank = p(.83, .43);
  const landmarks = base.landmarks.map((landmark) => landmark.id === 'area-feature'
    ? { ...landmark, name: 'High Bench Fence', position: upperBench }
    : landmark);
  landmarks.push(
    { id: 'lower-bench', name: 'Lower Bench', kind: 'fence' as const, position: lowerBench },
    { id: 'flank-marker', name: 'Flank Marker', kind: 'fence' as const, position: flank },
  );
  return {
    ...base,
    landmarks,
    // Huns are a flank-and-return hunt: use the contour to get alongside a
    // covey, then remember the upper marker when a wild rise circles back.
    dropPoints: base.dropPoints.map((drop, index) => ({
      ...drop,
      heading: index === 0
        ? Math.atan2(lowerBench.y - south.position.y, lowerBench.x - south.position.x)
        : Math.atan2(junction.y - west.position.y, junction.x - west.position.x),
    })),
    trails: [
      { id: 'south-contour', points: [south.position, p(.36, .78), p(.42, .71), lowerBench, p(.53, .63), junction] },
      { id: 'west-contour', points: [west.position, p(.2, .56), p(.31, .53), p(.4, .56), junction] },
      { id: 'flank-bench', points: [junction, p(.63, .47), p(.68, .41), upperBench, flank] },
      { id: 'circleback-return', points: [flank, p(.9, .29), p(.91, .42), p(.82, .55), p(.7, .59), junction] },
    ] satisfies AreaTrail[],
  };
}

/** Switchback access and contour benches for the chukar property. */
function chukarGeography(w: number, h: number) {
  const base = geography(w, h, { name: 'Rimrock Tank', kind: 'pond' }, 77);
  const [south, west] = base.dropPoints;
  const lower = { x: w * .46, y: h * .72 };
  const middle = { x: w * .61, y: h * .53 };
  const upper = { x: w * .72, y: h * .31 };
  const westBench = { x: w * .28, y: h * .42 };
  const p=(x:number,y:number):Vec2=>({x:x*w/1400,y:y*h/800});
  return {
    ...base,
    landmarks:[...base.landmarks,
      {id:'lower-sage-bench',name:'Sage Bench',kind:'fence' as const,position:lower},
      {id:'split-shoulder',name:'Split Shoulder',kind:'fence' as const,position:middle},
      {id:'rim-overlook',name:'Rim Overlook',kind:'fence' as const,position:upper}],
    // Face the authored first switchback, not the old generic junction.
    // Trailhead props and dog release use these same bearings.
    dropPoints: [
      { ...south, heading: Math.atan2(710-south.position.y,640-south.position.x) },
      { ...west, heading: Math.atan2(22, 52) },
    ],
    trails: [
      { id: 'south-switchback', points: [south.position,p(640,710),p(702,658),p(650,618),lower,p(748,552),p(804,521),p(871,509),p(905,468),middle] },
      { id: 'west-switchback', points: [west.position, { x: west.position.x + 52, y: west.position.y + 22 }, westBench, { x: w * .42, y: h * .37 }, middle] },
      { id: 'upper-bench', points: [middle,p(938,376),p(1013,365),p(1035,302),upper] },
      { id: 'rim-return', points: [upper,p(1090,279),p(1083,381),p(967,452),p(905,468)] },
      { id: 'tank-traverse', points: [upper,p(933,215),base.landmarks.find(l=>l.id==='area-feature')!.position] },
    ] satisfies AreaTrail[],
  };
}

/** Wide, wind-facing lanes for birds that use the open prairie. */
function sharptailGeography(w: number, h: number) {
  const base = geography(w, h, { name: 'Line Shack', kind: 'barn' }, 44);
  const [south, west] = base.dropPoints;
  const junction = base.trails[0].points.at(-1)!;
  const feature = base.landmarks.find((landmark) => landmark.id === 'area-feature')!.position;
  const p = (x: number, y: number): Vec2 => ({ x: w * x / 1400, y: h * y / 800 });
  // Both routes meet south of the facade, outside the building's collision
  // circle. The barn itself is a destination, not a road-through endpoint.
  const shackAccess = { x: feature.x, y: feature.y + 18 };
  // Round the authoritative polyline once. Terrain wear, grass, route mesh,
  // survey and return navigation consume these same points; no visual-only
  // spline can wander out of the safe walking corridor.
  const rounded = (points: Vec2[]): Vec2[] => {
    const result = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1];
      const before = Math.hypot(a.x - b.x, a.y - b.y), after = Math.hypot(c.x - b.x, c.y - b.y);
      const cut = Math.min(26, before * .22, after * .22);
      if (cut < .01) { result.push(b); continue; }
      const entry = { x: b.x + (a.x - b.x) * cut / before, y: b.y + (a.y - b.y) * cut / before };
      const exit = { x: b.x + (c.x - b.x) * cut / after, y: b.y + (c.y - b.y) * cut / after };
      result.push(entry, { x: entry.x * .25 + b.x * .5 + exit.x * .25, y: entry.y * .25 + b.y * .5 + exit.y * .25 }, exit);
    }
    result.push(points.at(-1)!);
    return result;
  };
  return {
    ...base,
    // Follow oblique shoulders and shallow crossings. Broad grass outside
    // these lanes remains open to long casts and cross-country approaches.
    trails: [
      { id: 'south-grass-lane', points: rounded([south.position, p(690, 716), p(655, 640), p(635, 592), p(679, 548), p(738, 531), p(826, 484), p(855, 426), junction]) },
      { id: 'west-grass-lane', points: rounded([west.position, p(105, 480), p(194, 455), p(283, 428), p(357, 447), p(457, 421), p(540, 405), p(661, 392), junction]) },
      { id: 'wind-break-edge', points: rounded([junction, p(820, 369), p(866, 330), p(906, 293), p(951, 282), p(982, 327), shackAccess]) },
      { id: 'prairie-return', points: rounded([shackAccess, p(1074, 316), p(1138, 344), p(1171, 400), p(1212, 449), p(1160, 506), p(1082, 537), p(989, 529), p(914, 480), p(858, 428), junction]) },
    ] satisfies AreaTrail[],
  };
}

/** Short cuts and looping timber openings for ruffed grouse country. */
function grouseGeography(w: number, h: number) {
  const base = geography(w, h, { name: 'Logging Gate', kind: 'gate' }, 33);
  const [south, west] = base.dropPoints;
  const junction = base.trails[0].points.at(-1)!;
  const feature = base.landmarks.find((landmark) => landmark.id === 'area-feature')!.position;
  const p = (x: number, y: number): Vec2 => ({ x: w * x, y: h * y });
  return {
    ...base,
    // Grouse work is a sequence of close-range cover pockets: short cuts,
    // quick turns, and a small loop through the timber openings.
    trails: [
      { id: 'south-opening', points: [south.position, p(.4, .79), p(.46, .7), p(.49, .6), junction] },
      { id: 'west-cut', points: [west.position, p(.18, .58), p(.27, .52), p(.36, .54), junction] },
      { id: 'north-opening', points: [junction, p(.47, .39), p(.55, .34), feature] },
      { id: 'timber-loop', points: [junction, p(.63, .57), p(.7, .51), p(.67, .42), p(.58, .44), junction] },
    ] satisfies AreaTrail[],
  };
}

/** A connected low route that follows the wet pockets through alder bottoms. */
function woodcockGeography(w: number, h: number) {
  const base = geography(w, h, { name: 'Beaver Pond', kind: 'pond' }, 55);
  const [south, west] = base.dropPoints;
  const junction = base.trails[0].points.at(-1)!;
  const feature = base.landmarks.find((landmark) => landmark.id === 'area-feature')!.position;
  const p = (x: number, y: number): Vec2 => ({ x: w * x, y: h * y });
  return {
    ...base,
    dropPoints: [south, west].map((drop, index) => {
      const next = index === 0 ? p(.42, .78) : p(.21, .56);
      return { ...drop, heading: Math.atan2(next.y - drop.position.y, next.x - drop.position.x) };
    }),
    // Woodcock country is a wet-bottom chain: the handler moves between
    // alder pockets and pond edges rather than crossing the high ground.
    trails: [
      { id: 'south-bottom', points: [south.position, p(.42, .78), p(.49, .69), p(.54, .61), junction] },
      { id: 'west-bottom', points: [west.position, p(.21, .56), p(.31, .57), p(.39, .52), junction] },
      { id: 'pond-chain', points: [junction, p(.45, .56), p(.53, .52), p(.61, .48), feature] },
      { id: 'alder-return', points: [feature, p(.72, .33), p(.64, .26), p(.53, .29), p(.43, .38), junction] },
    ] satisfies AreaTrail[],
  };
}

/** Dry washes that narrow toward the tank and open into a water loop. */
function desertGeography(w: number, h: number) {
  const base = geography(w, h, { name: 'Windmill Tank', kind: 'windmill' }, 88);
  const [south, west] = base.dropPoints;
  const junction = base.trails[0].points.at(-1)!;
  const feature = base.landmarks.find((landmark) => landmark.id === 'area-feature')!.position;
  const p = (x: number, y: number): Vec2 => ({ x: w * x, y: h * y });
  return {
    ...base,
    // Desert coveys key on water and travel the easiest wash. The route
    // converges on the tank, then gives the hunter a dry return through scrub.
    trails: [
      { id: 'south-wash', points: [south.position, p(.41, .82), p(.47, .72), p(.56, .65), p(.63, .55), junction] },
      { id: 'west-wash', points: [west.position, p(.2, .58), p(.31, .6), p(.4, .56), junction] },
      { id: 'tank-wash', points: [junction, p(.63, .47), p(.68, .39), feature] },
      { id: 'tank-loop', points: [feature, p(.79, .27), p(.86, .36), p(.82, .5), p(.7, .57), junction] },
    ] satisfies AreaTrail[],
  };
}

/** A tight draw and oak-side return for Montezuma quail in canyon country. */
function mearnsGeography(w: number, h: number) {
  const base = geography(w, h, { name: 'Canyon Corral', kind: 'fence' }, 99);
  const [south, west] = base.dropPoints;
  const junction = base.trails[0].points.at(-1)!;
  const feature = base.landmarks.find((landmark) => landmark.id === 'area-feature')!.position;
  const p = (x: number, y: number): Vec2 => ({ x: w * x, y: h * y });
  return {
    ...base,
    // Mearns hunting stays in the shaded canyon draw: a narrow ascent,
    // a few oak-side shelves, and a return that keeps the walls close.
    trails: [
      { id: 'south-draw', points: [south.position, p(.42, .81), p(.46, .72), p(.5, .63), p(.53, .54), junction] },
      { id: 'west-draw', points: [west.position, p(.22, .57), p(.31, .54), p(.4, .52), junction] },
      { id: 'oak-draw', points: [junction, p(.56, .45), p(.59, .38), feature] },
      { id: 'canyon-rim-return', points: [feature, p(.69, .35), p(.65, .44), p(.61, .51), junction] },
    ] satisfies AreaTrail[],
  };
}

/** An eastward climb from the gates into the high parks and timber fingers. */
function timberlineGeography(w: number, h: number) {
  const base = geography(w, h, { name: 'Old Warming Hut', kind: 'barn' }, 111);
  const [south, west] = base.dropPoints;
  const junction = base.trails[0].points.at(-1)!;
  const feature = base.landmarks.find((landmark) => landmark.id === 'area-feature')!.position;
  const p = (x: number, y: number): Vec2 => ({ x: w * x, y: h * y });
  return {
    ...base,
    // The alpine grade rises east. These routes climb toward the hut, then
    // traverse the park edge and timber fingers along the high contour.
    trails: [
      { id: 'south-climb', points: [south.position, p(.46, .78), p(.57, .68), p(.67, .58), p(.75, .47), feature] },
      { id: 'west-climb', points: [west.position, p(.26, .55), p(.4, .49), p(.53, .44), junction] },
      { id: 'summit-traverse', points: [junction, p(.65, .4), feature] },
      { id: 'park-edge', points: [feature, p(.82, .27), p(.9, .34), p(.87, .46)] },
      { id: 'timber-fingers', points: [junction, p(.53, .57), p(.63, .51), p(.73, .48), p(.81, .53), p(.75, .59)] },
    ] satisfies AreaTrail[],
  };
}

/** Meandering shade lanes between the old valley oak crowns. */
function valleyOakGeography(w: number, h: number) {
  const base = geography(w, h, { name: 'Pump House', kind: 'barn' }, 122);
  const [south, west] = base.dropPoints;
  const junction = base.trails[0].points.at(-1)!;
  const feature = base.landmarks.find((landmark) => landmark.id === 'area-feature')!.position;
  const p = (x: number, y: number): Vec2 => ({ x: w * x, y: h * y });
  return {
    ...base,
    // Valley quail move from one cool oak shadow to the next. The offset
    // bends leave room for trunks while preserving a continuous shade lane.
    trails: [
      { id: 'south-shade-lane', points: [south.position, p(.4, .79), p(.48, .7), p(.43, .61), p(.52, .54), junction] },
      { id: 'west-shade-lane', points: [west.position, p(.2, .55), p(.3, .5), p(.38, .55), p(.46, .48), junction] },
      { id: 'oak-lane', points: [junction, p(.55, .42), p(.63, .47), p(.7, .39), feature] },
      { id: 'trunk-loop', points: [feature, p(.79, .31), p(.84, .42), p(.77, .54), p(.67, .58), p(.6, .49), junction] },
    ] satisfies AreaTrail[],
  };
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
    terrain: terrain('prairie', 1971),
    ...quailGeography(),
    patches: quailCoverPatches(),
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
    terrain: terrain('wetland', 2201),
    ...pheasantGeography(1400, 800),
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
    terrain: terrain('prairie', 4401),
    ...sharptailGeography(1400, 800),
    patches: [...SHARPTAIL_COVER_PATCHES, ...entryCover(1400, 800, 44)],
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
    terrain: terrain('woods', 3301),
    ...grouseGeography(1000, 640),
    patches: [...scatterRects(world(1000, 640), { count: 24, minW: 80, maxW: 150, minH: 50, maxH: 85 }, mulberry32(33)), ...entryCover(1000, 640, 33)],
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
    terrain: terrain('wetland', 5501),
    ...woodcockGeography(1000, 640),
    patches: [...scatterRects(world(1000, 640), { count: 28, minW: 60, maxW: 110, minH: 45, maxH: 80 }, mulberry32(55)), ...entryCover(1000, 640, 55)],
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
    terrain: terrain('rimrock', 6601),
    ...hunGeography(1400, 800),
    patches: [...scatterRects(world(1400, 800), { count: 18, minW: 100, maxW: 180, minH: 35, maxH: 60 }, mulberry32(66)), ...entryCover(1400, 800, 66)],
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
    terrain: terrain('rimrock', 7701),
    ...chukarGeography(1400, 800),
    patches: chukarCoverPatches(world(1400,800),[...scatterRects(world(1400, 800), { count: 16, minW: 90, maxW: 160, minH: 30, maxH: 55 }, mulberry32(77)), ...entryCover(1400, 800, 77)]),
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
    terrain: terrain('desert', 8801),
    ...desertGeography(1200, 700),
    patches: [...scatterRects(world(1200, 700), { count: 22, minW: 70, maxW: 130, minH: 35, maxH: 65 }, mulberry32(88)), ...entryCover(1200, 700, 88)],
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
    terrain: terrain('canyon', 9901),
    ...mearnsGeography(1000, 640),
    patches: [...scatterRects(world(1000, 640), { count: 24, minW: 65, maxW: 120, minH: 45, maxH: 75 }, mulberry32(99)), ...entryCover(1000, 640, 99)],
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
    terrain: terrain('alpine', 11101),
    ...timberlineGeography(1000, 640),
    patches: [...scatterRects(world(1000, 640), { count: 22, minW: 75, maxW: 140, minH: 45, maxH: 80 }, mulberry32(111)), ...entryCover(1000, 640, 111)],
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
    terrain: terrain('oak-savanna', 12201),
    ...valleyOakGeography(1200, 700),
    patches: [...scatterRects(world(1200, 700), { count: 24, minW: 70, maxW: 135, minH: 40, maxH: 70 }, mulberry32(122)), ...entryCover(1200, 700, 122)],
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

export function getDropPoint(area: AreaConfig, id?: string): DropPoint {
  return area.dropPoints.find((drop) => drop.id === id) ?? area.dropPoints[0];
}
