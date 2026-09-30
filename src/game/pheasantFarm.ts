import type { Rect } from './field';
import type { Vec2 } from './types';

/**
 * Cattail Coverts is a working prairie-pothole farm in late October. Every
 * yard of it belongs to something: harvested crop, hay, a grass fencerow, a
 * CRP block, a slough or the farmstead. The plan is authored in property
 * yards on the 1400 x 800 layout and shared by the simulation (cover),
 * the survey map, terrain paint and crop residue, so what the hunter sees
 * is exactly where birds can hold.
 */
export type PheasantCrop = 'corn' | 'beans' | 'wheat' | 'hay';

export interface PheasantFarmField {
  id: string;
  crop: PheasantCrop;
  /** Axis-aligned field in property yards. */
  rect: Rect;
  /** Planter direction: rows run along property x ('ew') or y ('ns'). */
  rows: 'ew' | 'ns';
}

const FIELD_PLAN: readonly PheasantFarmField[] = [
  // Mowed grass around the north CRP blocks, and the wheat below them.
  { id: 'north-grass', crop: 'hay', rows: 'ew', rect: { x: 0, y: 0, w: 380, h: 112 } },
  { id: 'north-wheat', crop: 'wheat', rows: 'ew', rect: { x: 0, y: 112, w: 380, h: 188 } },
  { id: 'north-beans', crop: 'beans', rows: 'ns', rect: { x: 380, y: 0, w: 510, h: 300 } },
  { id: 'stock-pond-hay', crop: 'hay', rows: 'ew', rect: { x: 890, y: 0, w: 510, h: 300 } },
  { id: 'pothole-corn', crop: 'corn', rows: 'ew', rect: { x: 0, y: 300, w: 380, h: 260 } },
  { id: 'center-beans', crop: 'beans', rows: 'ew', rect: { x: 380, y: 300, w: 510, h: 160 } },
  { id: 'east-corn', crop: 'corn', rows: 'ns', rect: { x: 890, y: 300, w: 510, h: 260 } },
  { id: 'southwest-wheat', crop: 'wheat', rows: 'ns', rect: { x: 0, y: 560, w: 380, h: 240 } },
  { id: 'homestead-corn', crop: 'corn', rows: 'ns', rect: { x: 380, y: 460, w: 510, h: 340 } },
  { id: 'southeast-wheat', crop: 'wheat', rows: 'ew', rect: { x: 890, y: 560, w: 510, h: 240 } },
];

/** The farm's fields, scaled onto any property of the authored proportions. */
export function pheasantFarmFields(world: Rect): PheasantFarmField[] {
  const sx = world.w / 1400, sy = world.h / 800;
  return FIELD_PLAN.map(field => ({ ...field, rect: {
    x: world.x + field.rect.x * sx, y: world.y + field.rect.y * sy, w: field.rect.w * sx, h: field.rect.h * sy,
  } }));
}

/**
 * Standing grass that belongs to the farm's structure rather than random
 * rectangles in a crop field: retired CRP blocks, a grassed waterway, weedy
 * fencerows along the section lines and a standing food-plot strip. The
 * pond pockets and farmstead windbreak are added by the habitat rules.
 * Long runs are split so birds spread along them as they would in random cover.
 */
export function pheasantFarmCover(world: Rect): Rect[] {
  const sx = world.w / 1400, sy = world.h / 800;
  return ([
    // North CRP along the property line, two blocks split by a mowed break.
    [20, 20, 170, 92], [196, 20, 164, 92],
    // Weedy fencerow on the section line between the north fields.
    [372, 24, 16, 128], [372, 158, 16, 128],
    // Grassed waterway draining the north beans toward the farm.
    [598, 36, 30, 118], [598, 160, 30, 118],
    // CRP buffer north of the Stock Pond.
    [948, 36, 130, 46], [1084, 36, 136, 46],
    // East CRP block, food-plot strip and the waterway below it.
    [905, 318, 150, 62], [1120, 324, 160, 40], [910, 486, 160, 50],
    // East property fencerow in three runs.
    [1362, 310, 16, 150], [1362, 468, 16, 150], [1362, 626, 16, 150],
    // South-west corner grass and the fencerow above the wheat.
    [60, 600, 110, 44], [20, 553, 170, 14], [196, 553, 164, 14],
    // Rough strip between the beans and the farmstead.
    [470, 420, 110, 40],
    // Weedy stretches of the east-west section fence.
    [400, 292, 190, 14], [1080, 553, 270, 14],
  ] as const).map(([x, y, w, h]) => ({ x: world.x + x * sx, y: world.y + y * sy, w: w * sx, h: h * sy }));
}

/** Section-line fences in property yards. Gaps are left where routes cross. */
export function pheasantFarmFenceLines(world: Rect): Vec2[][] {
  const sx = world.w / 1400, sy = world.h / 800;
  const p = (x: number, y: number): Vec2 => ({ x: world.x + x * sx, y: world.y + y * sy });
  return [
    [p(380, 6), p(380, 794)],
    [p(890, 6), p(890, 794)],
    [p(6, 300), p(1394, 300)],
    [p(6, 560), p(380, 560)],
    [p(890, 560), p(1394, 560)],
    [p(1394, 6), p(1394, 794)],
    [p(6, 6), p(1394, 6)],
  ];
}
