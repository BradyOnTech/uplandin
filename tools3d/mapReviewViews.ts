import type { AreaConfig } from '../src/game/areas';
import { cattailCovertsViews, type MapReviewView } from './cattailCovertsViews';
import { sharptailPrairieViews } from './sharptailPrairieViews';
import { quailFieldsViews } from './quailFieldsViews';
import { chukarRidgeViews } from './chukarRidgeViews';

export type { MapReviewView };

/** Staged review views for every map that has a review playground. */
export function mapReviewViews(area: AreaConfig): MapReviewView[] {
  if (area.id === 'pheasant-coverts') return cattailCovertsViews(area);
  if (area.id === 'sharptail-prairie') return sharptailPrairieViews(area);
  if (area.id === 'quail-fields') return quailFieldsViews(area);
  if (area.id === 'chukar-ridge') return chukarRidgeViews(area);
  throw new Error(`No review views authored for ${area.id}`);
}
