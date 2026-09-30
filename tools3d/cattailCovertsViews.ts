import type { AreaConfig } from '../src/game/areas';

/** One staged review camera in property yards. `lift` raises the eye for
 * overviews; every other view stands at the hunter's normal eye height. */
export interface MapReviewView {
  id: string;
  name: string;
  at: [number, number];
  toward: [number, number];
  pitch: number;
  lift?: number;
}

/**
 * Cattail Coverts review locations, anchored to the authored landmarks so a
 * layout edit keeps every view pointed at the same place. Shared by the
 * in-browser playground and the headless capture script.
 */
export function cattailCovertsViews(area: AreaConfig): MapReviewView[] {
  const at = (id: string) => {
    const landmark = area.landmarks.find(l => l.id === id);
    if (!landmark) throw new Error(`Cattail Coverts is missing landmark ${id}`);
    return landmark.position;
  };
  const drop = area.dropPoints[0].position;
  const slough = at('south-slough'), barn = at('old-homestead'), pothole = at('west-pothole');
  const fence = at('north-fence'), pond = at('area-feature');
  const v = (id: string, name: string, from: { x: number; y: number }, to: { x: number; y: number }, pitch: number, lift?: number): MapReviewView =>
    ({ id, name, at: [from.x, from.y], toward: [to.x, to.y], pitch, lift });
  return [
    v('truck', 'Truck', { x: drop.x, y: drop.y - 8 }, { x: drop.x + 20, y: drop.y - 180 }, -3),
    v('slough-shore', 'Slough shore', { x: slough.x + 60, y: slough.y + 64 }, slough, -4),
    v('slough-neck', 'Slough neck', { x: slough.x + 50, y: slough.y - 112 }, { x: slough.x - 10, y: slough.y - 30 }, -4),
    v('homestead', 'Homestead yard', { x: barn.x + 24, y: barn.y + 46 }, barn, -2),
    v('shelterbelt', 'Shelterbelt edge', { x: barn.x - 110, y: barn.y - 80 }, { x: barn.x + 30, y: barn.y - 90 }, -3),
    v('west-pothole', 'West Pothole', { x: pothole.x + 88, y: pothole.y + 58 }, pothole, -4),
    v('harvest', 'Harvest field', { x: pothole.x + 30, y: pothole.y + 140 }, { x: fence.x + 60, y: fence.y + 30 }, -3),
    v('north-fields', 'North fields', { x: 500, y: 330 }, { x: 640, y: 110 }, -3),
    v('east-fields', 'East fields', { x: 940, y: 470 }, { x: 1250, y: 360 }, -3),
    v('stock-pond', 'Stock Pond', { x: pond.x - 70, y: pond.y + 90 }, pond, -3),
    v('section-fence', 'Section fence', { x: 850, y: 440 }, { x: 905, y: 395 }, -3),
    v('stubble-close', 'Corn stubble underfoot', { x: 450, y: 740 }, { x: 430, y: 700 }, -24),
    v('wheat-close', 'Wheat stubble underfoot', { x: 1100, y: 690 }, { x: 1140, y: 650 }, -22),
    v('overview-south', 'Overview from the south', { x: drop.x, y: area.world.h - 4 }, { x: drop.x + 20, y: area.world.h * .45 }, -20, 55),
    v('overview-north', 'Overview from the north', { x: area.world.w * .5, y: 6 }, { x: area.world.w * .47, y: area.world.h * .6 }, -20, 55),
  ];
}
