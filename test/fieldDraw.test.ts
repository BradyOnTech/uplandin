import { describe, expect, it } from 'vitest';
import { cellNoise, inCoverFringe, inRaggedCoverCore } from '../src/game/fieldDraw';
import type { Rect } from '../src/game/field';

const patch: Rect = { x: 100, y: 100, w: 80, h: 60 };

describe('fieldDraw ragged cover', () => {
  it('cellNoise is deterministic and in 0..1', () => {
    const a = cellNoise(3, 7, 1);
    const b = cellNoise(3, 7, 1);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });

  it('patch center is always dark core', () => {
    expect(inRaggedCoverCore(140, 130, patch)).toBe(true);
  });

  it('far outside the patch is never core', () => {
    expect(inRaggedCoverCore(10, 10, patch)).toBe(false);
  });

  it('fringe is outside core but near the patch', () => {
    // Just outside the north edge — often fringe, never core.
    const samples: boolean[] = [];
    for (let x = 110; x < 170; x += 4) {
      samples.push(inCoverFringe(x, 92, patch));
      expect(inRaggedCoverCore(x, 92, patch)).toBe(false);
    }
    // At least some fringe samples fire (soft ring, not empty).
    expect(samples.some(Boolean)).toBe(true);
  });

  it('core is denser than pure rect-fill at the rim (ragged carve)', () => {
    // Count core hits along the geometric rect edge tiles.
    let coreHits = 0;
    let total = 0;
    for (let x = patch.x; x < patch.x + patch.w; x += 8) {
      total++;
      if (inRaggedCoverCore(x, patch.y + 4, patch)) coreHits++;
    }
    // Rim is carved — not 100% filled like a solid AABB stamp.
    expect(coreHits).toBeLessThan(total);
  });
});
