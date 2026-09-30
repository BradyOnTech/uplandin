import type { AreaLandmark } from './areas';
import type { Rect } from './field';
import { pheasantPondRadii } from './pheasantHabitat';
import { PROPERTY_PX_TO_M } from './worldUnits';

/**
 * The working-farm details of Cattail Coverts beyond crops and cover: rock
 * picked off the fields and heaped at their edges, stored round-bale rows,
 * the foundation of the original homestead in its weedy corner, a duck blind
 * on the big slough and a flooded low spot in the east corn. Authored in
 * property yards on the 1400 x 800 plan (like the fields) so the renderer,
 * plant placement and tests agree on where each one is.
 */
export interface PheasantRockPile { x: number; y: number; /** Metres. */ radius: number; seed: number }
export interface PheasantBaleRow {
  x: number; y: number;
  /** Direction the row runs, radians in property space (0 = +x). */
  angle: number;
  count: number;
  /** A second course nested on top, the way bales are stored over winter. */
  stacked: boolean;
  weathered: boolean;
}
export interface PheasantSite { x: number; y: number; /** Radians, property space. */ angle: number }
export interface PheasantSheetWater { x: number; y: number; /** Metres. */ rx: number; ry: number; angle: number }

const scale = (world: Rect) => ({ sx: world.w / 1400, sy: world.h / 800 });

export function pheasantRockPiles(world: Rect): PheasantRockPile[] {
  const { sx, sy } = scale(world);
  return ([
    // Headlands: where the picker dumps a load at the end of a pass.
    [352, 282, 2.3], [412, 324, 1.9], [872, 486, 2.1], [1338, 582, 2.4], [300, 742, 1.8], [1188, 544, 2.0],
    // The bare knob on the hill in the middle of the farm: too stony to plow.
    [762, 338, 3.4],
  ] as const).map(([x, y, radius], i) => ({ x: world.x + x * sx, y: world.y + y * sy, radius, seed: 7301 + i * 131 }));
}

export function pheasantBaleRows(world: Rect): PheasantBaleRow[] {
  const { sx, sy } = scale(world);
  const row = (x: number, y: number, angle: number, count: number, stacked: boolean, weathered: boolean): PheasantBaleRow =>
    ({ x: world.x + x * sx, y: world.y + y * sy, angle, count, stacked, weathered });
  return [
    // Stored end to end along the west fence of the Stock Pond hay.
    row(912, 104, Math.PI / 2, 15, true, true),
    row(924, 104, Math.PI / 2, 11, false, true),
    // The last cutting, still where it was dropped at the south end.
    row(1130, 238, 0, 7, false, false),
  ];
}

/** Bales in a stored row sit end to end; singles are left where they fell. */
export function pheasantBaleSpacing(row: PheasantBaleRow): number {
  // Stacked rows sit round side to round side; stored singles end to end.
  return (row.stacked ? 1.6 : row.weathered ? 1.5 : 31) / PROPERTY_PX_TO_M;
}

/** The original homestead: a fieldstone foundation in the lee of the west belt. */
export function pheasantOldFarmstead(world: Rect): PheasantSite {
  const { sx, sy } = scale(world);
  return { x: world.x + 78 * sx, y: world.y + 206 * sy, angle: .12 };
}

/** The weedy acre the plow has gone around since the house came down. */
export function pheasantOldFarmsteadCover(world: Rect): Rect[] {
  const { sx, sy } = scale(world);
  return [{ x: world.x + 46 * sx, y: world.y + 180 * sy, w: 66 * sx, h: 54 * sy }];
}

/** Sheet water standing in the lowest swale of the east corn. */
export function pheasantSheetWater(world: Rect): PheasantSheetWater {
  const { sx, sy } = scale(world);
  return { x: world.x + 1280 * sx, y: world.y + 403 * sy, rx: 14, ry: 10, angle: .2 };
}

/** A plywood-and-cattail blind dug into the south-east shore of the Slough. */
export function pheasantDuckBlind(landmarks: readonly AreaLandmark[]): PheasantSite | undefined {
  const slough = landmarks.find(l => l.id === 'south-slough');
  if (!slough) return undefined;
  const { rx, rz } = pheasantPondRadii(slough.id);
  const around = 1.36, reach = 1.17;
  const x = slough.position.x + Math.cos(around) * rx * reach / PROPERTY_PX_TO_M;
  const y = slough.position.y + Math.sin(around) * rz * reach / PROPERTY_PX_TO_M;
  // Facing out over the open water.
  return { x, y, angle: Math.atan2(slough.position.y - y, slough.position.x - x) };
}

/** Ground no plant or stubble grows through, in property yards. */
export function pheasantFeatureFootprints(world: Rect, landmarks: readonly AreaLandmark[]): { x: number; y: number; radius: number }[] {
  const out = pheasantRockPiles(world).map(p => ({ x: p.x, y: p.y, radius: p.radius * .85 / PROPERTY_PX_TO_M }));
  const home = pheasantOldFarmstead(world);
  out.push({ x: home.x, y: home.y, radius: 6.6 / PROPERTY_PX_TO_M });
  const blind = pheasantDuckBlind(landmarks);
  // The blind and the trodden path back through the cattail to dry ground.
  if (blind) for (let step = 0; step < 5; step++) out.push({
    x: blind.x - Math.cos(blind.angle) * step * 1.3 / PROPERTY_PX_TO_M,
    y: blind.y - Math.sin(blind.angle) * step * 1.3 / PROPERTY_PX_TO_M, radius: (step ? 1.1 : 1.9) / PROPERTY_PX_TO_M });
  for (const row of pheasantBaleRows(world)) {
    const step = pheasantBaleSpacing(row);
    for (let i = 0; i < row.count; i++) out.push({ x: row.x + Math.cos(row.angle) * step * i, y: row.y + Math.sin(row.angle) * step * i, radius: 1 / PROPERTY_PX_TO_M });
  }
  return out;
}
