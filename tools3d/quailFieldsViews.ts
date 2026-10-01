import type { AreaConfig } from '../src/game/areas';
import { QUAIL_BURN, QUAIL_CREEK, QUAIL_OLD_FENCE, QUAIL_RAKE } from '../src/game/quailFeatures';
import type { MapReviewView } from './cattailCovertsViews';

/** Quail Fields review locations for the farm history pieces, anchored to
 * the authored feature data so a layout edit keeps every view on target. */
export function quailFieldsViews(area: AreaConfig): MapReviewView[] {
  const v = (id: string, name: string, from: { x: number; y: number }, to: { x: number; y: number }, pitch: number, lift?: number): MapReviewView =>
    ({ id, name, at: [from.x, from.y], toward: [to.x, to.y], pitch, lift });
  const drop = area.dropPoints[0].position, creek = QUAIL_CREEK[Math.floor(QUAIL_CREEK.length * .45)];
  return [
    v('truck', 'Truck', { x: drop.x, y: drop.y - 8 }, { x: drop.x + 20, y: drop.y - 180 }, -3),
    v('old-fence', 'Old line fence', { x: QUAIL_OLD_FENCE[1].x - 14, y: QUAIL_OLD_FENCE[1].y - 22 }, { x: QUAIL_OLD_FENCE[2].x, y: QUAIL_OLD_FENCE[2].y - 40 }, -4),
    v('rake', 'Dump rake', { x: QUAIL_RAKE.x - 9, y: QUAIL_RAKE.y + 7 }, QUAIL_RAKE, -10),
    v('creek', 'Dry creek', { x: creek.x - 14, y: creek.y + 10 }, { x: creek.x + 12, y: creek.y - 4 }, -14, .5),
    v('burn', 'Prescribed burn', { x: QUAIL_BURN.x - 40, y: QUAIL_BURN.y - 62 }, QUAIL_BURN, -8, 1.5),
    v('overview-south', 'Overview from the south', { x: drop.x, y: area.world.h - 4 }, { x: drop.x + 20, y: area.world.h * .45 }, -20, 55),
  ];
}
