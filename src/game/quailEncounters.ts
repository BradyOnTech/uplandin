import { getDropPoint, type AreaConfig } from './areas';
import { dist } from './math';
import { pickAmongBest } from './areaEncounters';
import type { RNG, Vec2 } from './types';

/** Starting tuning for a field worth exploring; challenge multiplies this. */
export const QUAIL_FIELD_BIRD_COUNT = 56;
/** Minimum distance between two quail coveys' home cover. */
export const QUAIL_COVEY_SPACING = 72;

/** Choose a seeded sequence of separated cover locations. Every challenge
 * uses the same sequence, then stocks a shorter or longer prefix. Each seed
 * picks among the good cover, so the opening varies across the walk-in area
 * and later coveys move between hunts; a replayed seed is identical.
 * The player's actual route is never read and outcomes are not adapted live.
 */
export function quailEncounterAnchors(area: AreaConfig, dropId: string | undefined, rng: RNG): Vec2[] {
  const drop = getDropPoint(area, dropId);
  const forward = { x: Math.cos(drop.heading), y: Math.sin(drop.heading) };
  const candidates = area.patches.flatMap(patch => Array.from({ length: 10 }, (_, i) => ({
    // Keep the usable corners represented even when all random samples fall
    // outside the opening search band (notably the narrow West entry).
    x: patch.x + 12 + (i < 4 ? i % 2 : rng()) * Math.max(0, patch.w - 24),
    y: patch.y + 12 + (i < 4 ? Math.floor(i / 2) : rng()) * Math.max(0, patch.h - 24),
    variation: rng() * 90 + (i < 4 ? 80 : 0),
  }))).filter(point => area.dropPoints.every(entry => dist(point, entry.position) >= entry.safetyRadius + 16));
  const anchors: Vec2[] = [];
  const firstDistance = 76 + rng() * 96;
  for (let index = 0; index < 20; index++) {
    const wanted = index === 0 ? firstDistance : 140 + index * 72 + rng() * 70;
    const scored: { candidate: typeof candidates[number]; score: number }[] = [];
    for (const candidate of candidates) {
      if (anchors.some(anchor => dist(anchor, candidate) < QUAIL_COVEY_SPACING)) continue;
      const dx = candidate.x - drop.position.x, dy = candidate.y - drop.position.y;
      const distance = Math.hypot(dx, dy);
      const ahead = dx * forward.x + dy * forward.y;
      const lateral = Math.abs(dx * forward.y - dy * forward.x);
      if (index === 0 && (distance < 70 || distance > 180 || ahead < 55 || lateral > 60)) continue;
      const score = Math.abs(distance - wanted) + candidate.variation + (index === 0 ? lateral * .25 : 0);
      scored.push({ candidate, score });
    }
    const best = pickAmongBest(scored, rng);
    if (!best) break;
    anchors.push({ x: best.x, y: best.y });
  }
  return anchors;
}
