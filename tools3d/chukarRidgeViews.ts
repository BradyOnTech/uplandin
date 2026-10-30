import type { AreaConfig } from '../src/game/areas';
import { CHUKAR_GUZZLER, CHUKAR_SPRING_SEAM } from '../src/game/chukarHabitat';
import { CHUKAR_PLACES } from '../src/game/chukarRidge';
import type { MapReviewView } from './cattailCovertsViews';

/** Chukar Ridge review locations: the entries, the named hunt areas and the
 * canyon views. The first five keep the postcard ids used since the
 * baseline so before/after sheets line up. */
export function chukarRidgeViews(area: AreaConfig): MapReviewView[] {
  const v = (id: string, name: string, from: { x: number; y: number }, to: { x: number; y: number }, pitch: number, lift?: number): MapReviewView =>
    ({ id, name, at: [from.x, from.y], toward: [to.x, to.y], pitch, lift });
  const drop = (id: string) => area.dropPoints.find(d => d.id === id)?.position ?? area.dropPoints[0].position;
  const river = drop('south-gate'), rim = drop('rim-track'), spring = CHUKAR_SPRING_SEAM[0], seamFoot = CHUKAR_SPRING_SEAM.at(-1)!;
  return [
    v('truck', 'River Road entry, up the wall', { x: river.x + 9, y: river.y - 16 }, { x: 640, y: 900 }, 5),
    v('talus', 'Lower rim and its talus apron', { x: 1004, y: 1090 }, { x: 1000, y: 1030 }, 13),
    v('guzzler', 'West Bench guzzler', { x: CHUKAR_GUZZLER.x - 12, y: CHUKAR_GUZZLER.y + 14 }, CHUKAR_GUZZLER, -10, 1),
    v('seep-above', 'Spring seam from the rim', { x: spring.x + 18, y: spring.y - 46 }, seamFoot, -14, 1.5),
    v('cairn', "High Bench, sheepherder's cairn", { x: CHUKAR_PLACES.cairn.x - 4, y: CHUKAR_PLACES.cairn.y + 9 }, CHUKAR_PLACES.cairn, 6),
    v('castle', 'Castle Rock from the cheat face', { x: 1030, y: 900 }, CHUKAR_PLACES.castleRock, 14),
    v('rim-overlook', 'From the upper rim, across the canyon', { x: 1010, y: 320 }, { x: 980, y: 1650 }, -9),
    v('rim-gate', 'Rim Gate entry, across the flat', { x: rim.x, y: rim.y + 8 }, { x: 1200, y: 420 }, -2),
    v('sage-draw', 'Up Sage Draw', { x: 628, y: 1010 }, { x: 700, y: 560 }, 7),
    v('north-face', 'North Face above Spring Creek', { x: 1610, y: 830 }, CHUKAR_PLACES.splitRock, 9),
    v('breaks', 'River Breaks, down to the river', { x: 720, y: 1240 }, { x: 820, y: 1660 }, -7),
    v('corral', 'Line camp corral on the Rim Flat', { x: CHUKAR_PLACES.corral.x + 20, y: CHUKAR_PLACES.corral.y + 18 }, CHUKAR_PLACES.corral, -3),
    v('chimney', 'Cabin chimney in the breaks', { x: CHUKAR_PLACES.chimney.x - 14, y: CHUKAR_PLACES.chimney.y + 12 }, CHUKAR_PLACES.chimney, 3),
  ];
}
