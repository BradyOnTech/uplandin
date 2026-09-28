import { SHARPTAIL_SHOULDERS, sharptailCrestOffset, sharptailToeGrowth } from '../../game/sharptailLandscape';
import { sharptailWestDrawGrowth } from '../../game/sharptailWestDraw';
import { sharptailHorizonGrowth } from '../../game/sharptailHorizon';
import { sharptailDetailGrowth } from '../../game/sharptailFeatures';

export interface SharptailMeadowSample { crown: number; hollow: number; cured: number; exposed: number }

/** The prairie reads in connected vegetation masses following the physical
 * relief. Low warm crowns open the cast, darker sheltered drainage carries
 * rank grass, and a few exposed lee faces reveal the underlying till. These
 * art fields never move a habitat rectangle or change encounter rules. */
const shoulders = SHARPTAIL_SHOULDERS.map(shoulder => ({ ...shoulder,
  cos: Math.cos(shoulder.yaw), sin: Math.sin(shoulder.yaw),
}));

// Selected faces, not a repeated stripe on every hill. Coordinates follow
// the curved ridge section; all edges span tens of yards so both terrain
// LODs retain the same connected mass. Three unequal footprints compose the
// arrival brow, western wind shoulder and the face behind the Shack.
const exposedFaces: Readonly<Record<number, { along: number; reach: number; across: number; width: number; strength: number; bend: number }>> = {
  0: { along: .18, reach: .48, across: -.52, width: .27, strength: .95, bend: .12 },
  1: { along: .25, reach: .58, across: .56, width: .28, strength: .82, bend: -.16 },
  2: { along: -.22, reach: .52, across: -.43, width: .35, strength: 1, bend: .18 },
};

export const SHARPTAIL_MEADOW_COLORS = {
  crown: 0xcbb17a,
  hollow: 0x607864,
  cured: 0xb39a61,
  exposed: 0xb9b4a0,
} as const;
const toeGrowth = { low: 0, lee: 0, face: 0 };
const detailGrowth = { crown: 0, hollow: 0, exposed: 0 };
const horizonGrowth = { crown: 0, hollow: 0, exposed: 0 };
const westGrowth = { crown: 0, hollow: 0 };

export function sharptailMeadowAt(x: number, y: number, swale: number, out: SharptailMeadowSample): SharptailMeadowSample {
  let crown = 0, cured = 0, exposed = 0;
  for (let index = 0; index < shoulders.length; index++) {
    const shoulder = shoulders[index];
    const dx = x - shoulder.x, dy = y - shoulder.y;
    const u = (dx * shoulder.cos + dy * shoulder.sin) / shoulder.rx;
    const v = (-dx * shoulder.sin + dy * shoulder.cos) / shoulder.ry;
    const bend = sharptailCrestOffset(u, shoulder.bend);
    const across = v - bend;
    crown = Math.max(crown, Math.exp(-(u * u * 1.8 + across * across * 3.4)));
    cured = Math.max(cured, Math.exp(-(u * u * 2.1 + (across + .62) ** 2 * 8)));
    const face = exposedFaces[index];
    if (face) {
      const along = (u - face.along) / face.reach;
      // One broad uneven lip and a tapering toe, not fine camouflage noise.
      const lip = face.across + face.bend * Math.sin(along * 2.3);
      const width = face.width * (1 - .18 * Math.sin(along * 2.8));
      const edge = (across - lip) / width;
      exposed = Math.max(exposed, face.strength * Math.exp(-(along ** 4 * 1.4 + edge ** 4)));
    }
  }
  sharptailToeGrowth(x, y, toeGrowth);
  sharptailDetailGrowth(x, y, detailGrowth);
  sharptailHorizonGrowth(x, y, horizonGrowth);
  sharptailWestDrawGrowth(x, y, westGrowth);
  crown = Math.max(crown, toeGrowth.low, detailGrowth.crown, horizonGrowth.crown, westGrowth.crown);
  // Lee ribbons are attached to real secondary brows. The same fields drive
  // near stem height, middle-canopy relief and the far terrain value masses.
  out.hollow = Math.max(swale * swale, toeGrowth.lee * .88, detailGrowth.hollow, horizonGrowth.hollow, westGrowth.hollow);
  out.crown = crown * (1 - out.hollow * .85);
  out.cured = cured * (1 - out.hollow * .58) * (1 - out.crown * .55);
  // Till remains visible beneath vegetated faces. The grass placement layer
  // separately preserves cover-core density using the same stand mask.
  out.exposed = Math.max(exposed * .62, toeGrowth.face * .72, detailGrowth.exposed, horizonGrowth.exposed * .72) * (1 - out.hollow * .68);
  return out;
}

/** Bare openings spare concealed native stands even when their underlying
 * till is visible in the distant terrain paint. Shared by near/far plants. */
export function sharptailGrassOpening(exposed: number, stand: number): number {
  return exposed * (1 - stand * .95);
}
