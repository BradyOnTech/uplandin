import type { AreaConfig } from '../src/game/areas';
import { SHARPTAIL_BADGER_KNOLL, SHARPTAIL_ERRATICS, SHARPTAIL_HOMESTEAD, SHARPTAIL_LANDFORM_DETAILS, SHARPTAIL_STOCK_POND, SHARPTAIL_TIPI_RINGS } from '../src/game/sharptailFeatures';
import type { MapReviewView } from './cattailCovertsViews';

/**
 * Sharptail Prairie review locations, anchored to the authored drops, Line
 * Shack, erratics and landform details so layout edits keep them aimed.
 * Shared by the in-browser playground and the headless capture script.
 */
export function sharptailPrairieViews(area: AreaConfig): MapReviewView[] {
  const south = area.dropPoints[0].position, west = area.dropPoints[1].position;
  const shack = area.landmarks.find(l => l.id === 'area-feature')!.position;
  const stone = (id: string) => SHARPTAIL_ERRATICS.find(s => s.id === id)!;
  const detail = (id: string) => SHARPTAIL_LANDFORM_DETAILS.find(d => d.id === id)!;
  const v = (id: string, name: string, from: { x: number; y: number }, to: { x: number; y: number }, pitch: number, lift?: number): MapReviewView =>
    ({ id, name, at: [from.x, from.y], toward: [to.x, to.y], pitch, lift });
  const graystone = stone('west-graystone'), swaleStone = stone('west-swale-stone'), lone = stone('middle-lone-stone');
  const westDraw = detail('west-draw');
  return [
    v('truck', 'South gate', { x: south.x + 10, y: south.y - 55 }, { x: south.x + 40, y: south.y - 230 }, -3),
    v('south-shoulder', 'South shoulder', { x: 672, y: 576 }, { x: 868, y: 528 }, -4),
    v('west-truck', 'West Track', { x: west.x + 55, y: west.y - 6 }, { x: west.x + 230, y: west.y - 40 }, -3),
    v('west-draw', 'West draw', { x: westDraw.x - 60, y: westDraw.y + 30 }, { x: westDraw.x + 80, y: westDraw.y - 30 }, -4),
    v('erratics', 'West graystones', { x: graystone.x - 26, y: graystone.y + 18 }, { x: graystone.x, y: graystone.y }, -2),
    v('swale-stones', 'Swale stones', { x: swaleStone.x + 30, y: swaleStone.y + 20 }, { x: swaleStone.x, y: swaleStone.y }, -3),
    v('lone-stone', 'Lone stone', { x: lone.x - 30, y: lone.y + 25 }, { x: lone.x, y: lone.y }, -2),
    v('stone-close', 'Graystone close', { x: graystone.x - 9, y: graystone.y + 6 }, { x: graystone.x, y: graystone.y }, -6),
    v('windbreak', 'Windbreak approach', { x: 896, y: 304 }, { x: 1024, y: 300 }, -3),
    v('poplars', 'Shelterbelt poplars', { x: 1030, y: 318 }, { x: 1010, y: 262 }, 6),
    v('shack', 'Line Shack', { x: shack.x - 30, y: shack.y + 42 }, shack, -1),
    v('return', 'Prairie return', { x: 1190, y: 448 }, { x: 1008, y: 496 }, -4),
    v('swale', 'Swale bottom', { x: 800, y: 440 }, { x: 1000, y: 395 }, -2),
    v('cover-close', 'Native stand underfoot', { x: 700, y: 620 }, { x: 740, y: 600 }, -22),
    v('windmill', 'Swale windmill', { x: 560, y: 520 }, { x: 600, y: 470 }, 4),
    v('cattle-guard', 'Cattle guard', { x: south.x - 16, y: south.y - 14 }, { x: south.x, y: 790 }, -24, 5),
    v('west-gate', 'West wire gate', { x: 14, y: west.y - 9 }, { x: 4, y: west.y }, -16, 1),
    v('stock-pond', 'Stock pond', { x: SHARPTAIL_STOCK_POND.x + 50, y: SHARPTAIL_STOCK_POND.y + 36 }, SHARPTAIL_STOCK_POND, -14, 6),
    v('stock-dam', 'Stock dam', { x: SHARPTAIL_STOCK_POND.dam.x - 34, y: SHARPTAIL_STOCK_POND.dam.y + 30 }, { x: SHARPTAIL_STOCK_POND.dam.x + 10, y: SHARPTAIL_STOCK_POND.dam.y }, -8, 4),
    v('homestead-ruin', 'Homestead ruin', { x: SHARPTAIL_HOMESTEAD.x + 18, y: SHARPTAIL_HOMESTEAD.y - 16 }, SHARPTAIL_HOMESTEAD, -4),
    v('tipi-rings', 'Tipi rings', { x: SHARPTAIL_TIPI_RINGS[0].x - 9, y: SHARPTAIL_TIPI_RINGS[0].y + 12 }, SHARPTAIL_TIPI_RINGS[0], -30, 2.5),
    v('badger-knoll', 'Badger knoll', { x: SHARPTAIL_BADGER_KNOLL.x + 11, y: SHARPTAIL_BADGER_KNOLL.y + 9 }, SHARPTAIL_BADGER_KNOLL, -22, 1),
    v('fence', 'Boundary fence', { x: 640, y: 786 }, { x: 540, y: 796 }, -3),
    v('overview-south', 'Overview from the south', { x: south.x, y: area.world.h - 4 }, { x: south.x, y: area.world.h * .4 }, -18, 60),
    v('overview-west', 'Overview from the west', { x: 6, y: area.world.h * .5 }, { x: area.world.w * .6, y: area.world.h * .45 }, -18, 60),
  ];
}
