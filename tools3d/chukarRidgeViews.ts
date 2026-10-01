import type { AreaConfig } from '../src/game/areas';
import { CHUKAR_GUZZLER, CHUKAR_JUNIPER_SNAG, CHUKAR_SEEP, CHUKAR_SHEEP_CAIRN, CHUKAR_TALUS_FANS } from '../src/game/chukarFeatures';
import type { MapReviewView } from './cattailCovertsViews';

/** Chukar Ridge review locations for its remembered places. */
export function chukarRidgeViews(area: AreaConfig): MapReviewView[] {
  const v = (id: string, name: string, from: { x: number; y: number }, to: { x: number; y: number }, pitch: number, lift?: number): MapReviewView =>
    ({ id, name, at: [from.x, from.y], toward: [to.x, to.y], pitch, lift });
  const drop = area.dropPoints[0].position, seep = CHUKAR_SEEP[2], fan = CHUKAR_TALUS_FANS[2];
  return [
    v('truck', 'Truck', { x: drop.x, y: drop.y - 8 }, { x: drop.x + 20, y: drop.y - 180 }, 2),
    v('seep', 'Spring seep', { x: seep.x - 38, y: seep.y + 6 }, seep, -6),
    v('cairn', 'Sheepherder cairn', { x: CHUKAR_SHEEP_CAIRN.x - 4, y: CHUKAR_SHEEP_CAIRN.y + 7 }, CHUKAR_SHEEP_CAIRN, 6),
    v('talus', 'Talus fan', { x: fan.toe.x + 20, y: fan.toe.y + 22 }, fan.apex, 6),
    v('guzzler', 'Guzzler', { x: CHUKAR_GUZZLER.x - 12, y: CHUKAR_GUZZLER.y + 14 }, CHUKAR_GUZZLER, -10, 1),
    v('snag', 'Juniper snag', { x: CHUKAR_JUNIPER_SNAG.x + 6, y: CHUKAR_JUNIPER_SNAG.y + 16 }, CHUKAR_JUNIPER_SNAG, 10),
    v('seep-above', 'Seep from the shoulder', { x: CHUKAR_JUNIPER_SNAG.x - 10, y: CHUKAR_JUNIPER_SNAG.y - 22 }, seep, -6),
  ];
}
