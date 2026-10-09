import type { AreaConfig } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { cattailCovertsViews, type MapReviewView } from './cattailCovertsViews';
import { sharptailPrairieViews } from './sharptailPrairieViews';
import { quailFieldsViews } from './quailFieldsViews';
import { chukarRidgeViews } from './chukarRidgeViews';

export type { MapReviewView };

/** Staged review views for every map that has a review playground. */
export function mapReviewViews(area: AreaConfig): MapReviewView[] {
  if (area.id === 'pheasant-coverts') return [...cattailCovertsViews(area), ...longViews(area)];
  if (area.id === 'sharptail-prairie') return [...sharptailPrairieViews(area), ...longViews(area)];
  if (area.id === 'quail-fields') return [...quailFieldsViews(area), ...longViews(area)];
  if (area.id === 'chukar-ridge') return [...chukarRidgeViews(area), ...longViews(area)];
  throw new Error(`No review views authored for ${area.id}`);
}

/**
 * Long views for judging light, haze and the far country. They are found
 * from the landform, not placed: `vista` stands on the property's highest
 * ground and looks out over its nearest edge into the country beyond;
 * `crest` stands on the same high ground and looks back across the length
 * of the property. A resized or reshaped ground moves them with it.
 */
export function longViews(area: AreaConfig): MapReviewView[] {
  const landscape = new LandscapeModel(area), w = area.world;
  let best = { h: -Infinity, x: w.x + w.w / 2, y: w.y + w.h / 2 };
  // Stay off the fence line so the frame is not all boundary.
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 24; j++) {
    const x = w.x + w.w * (.08 + .84 * i / 40), y = w.y + w.h * (.08 + .84 * j / 24);
    const h = landscape.heightAtProperty(x, y);
    if (h > best.h) best = { h, x, y };
  }
  const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
  // Out over the nearest edge from the high ground.
  const edges = [[best.x - w.x, -1, 0], [w.x + w.w - best.x, 1, 0], [best.y - w.y, 0, -1], [w.y + w.h - best.y, 0, 1]] as const;
  const [, ox, oy] = [...edges].sort((a, b) => a[0] - b[0])[0];
  const across = Math.hypot(cx - best.x, cy - best.y) > 1 ? [cx - best.x, cy - best.y] : [w.w, 0];
  const far = Math.hypot(w.w, w.h);
  const length = Math.hypot(across[0], across[1]);
  return [
    { id: 'vista', name: 'High-ground vista', at: [best.x, best.y], toward: [best.x + ox * far, best.y + oy * far], pitch: -2, lift: 1.5 },
    { id: 'crest', name: 'Crest, looking across', at: [best.x, best.y], toward: [best.x + across[0] / length * far, best.y + across[1] / length * far], pitch: -3, lift: 1.5 },
  ];
}
