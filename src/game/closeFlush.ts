/**
 * The close flush: the bird that goes up under the hunter's boots. How
 * "explosive" a rise is depends on the distance between the hunter and the
 * bird at the moment it takes wing, in metres. One at a few yards is a full
 * eruption; one at the edge of gun range is an ordinary rise. The value
 * drives presentation only (launch climb, sound, cover blast and the
 * hunter's flinch); it never changes where a bird is or whether it flushes.
 */
const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function closeFlushIntensity(speciesId: string, distanceM: number): number {
  if (!Number.isFinite(distanceM)) return 0;
  // A rooster underfoot is the whole point of pheasant hunting; a covey is
  // close within a couple more strides; timber birds explode close or not at all.
  const [full, none] = speciesId === 'ringneck' ? [3.5, 8.5]
    : speciesId === 'ruffed-grouse' || speciesId === 'woodcock' ? [3, 7]
      : [4.5, 10];
  return 1 - smooth(full, none, distanceM);
}

/** Below this the presentation treats a rise as a close flush. */
export const CLOSE_FLUSH_THRESHOLD = .35;

/**
 * Some coveys sit tight and let the hunter walk right in on them. `coveyRoll`
 * is the covey's own seeded 0..1 value (see coveyRoll), so it is stable while
 * the hunter approaches and differs from hunt to hunt. Chukar do it now and
 * then, bobwhite more often, sharptail only occasionally.
 */
export function tightCoveyShare(speciesId: string): number {
  return speciesId === 'bobwhite' ? .26 : speciesId === 'chukar' ? .3
    : speciesId === 'hun' ? .18 : speciesId === 'sharptail' ? .12 : speciesId === 'prairie-chicken' ? .08 : 0;
}
export function tightCovey(speciesId: string, coveyRoll: number): boolean {
  return coveyRoll < tightCoveyShare(speciesId);
}

/** A tight covey's flush radius in property yards, before the challenge scale. */
export function tightCoveyRadius(speciesId: string, coveyRoll: number): number {
  return 4.5 + Math.min(1, coveyRoll / Math.max(.01, tightCoveyShare(speciesId))) * 3;
}

/** A covey's seeded roll: from its first bird's individual roll, decorrelated
 * from that bird's own nerve so tight coveys are not also the jumpiest. */
export function coveyRoll(birds: readonly { id: number; coveyId: number; approachRoll?: number }[], coveyId: number): number {
  let first: { id: number; approachRoll?: number } | undefined;
  for (const bird of birds) if (bird.coveyId === coveyId && (!first || bird.id < first.id)) first = bird;
  const roll = first?.approachRoll ?? ((Math.imul(coveyId + 1, 1597334677) >>> 0) / 0xffffffff);
  return (roll * 7.31 + .173) % 1;
}

/** Tight birds hold through the walk-in: their nerve drains this much slower. */
export const TIGHT_COVEY_NERVE_SCALE = .4;

/**
 * After a covey breaks, a bird or two may have held. Those singles stay put
 * until the hunter walks up on them (or the dog points them). Returns how
 * many of the covey hold back, from a 0..1 roll. Never all of a small covey.
 */
export function heldSingles(speciesId: string, coveySize: number, roll: number, tight: boolean): number {
  if (coveySize < 4) return 0;
  const chance = (speciesId === 'chukar' ? .32 : speciesId === 'bobwhite' ? .3 : speciesId === 'hun' ? .25
    : speciesId === 'sharptail' ? .18 : speciesId === 'prairie-chicken' ? .12 : 0) * (tight ? 1.4 : 1);
  if (roll >= chance) return 0;
  return coveySize >= 8 && roll < chance * .3 ? 2 : 1;
}

/** A held single goes up when the hunter comes within this many yards. */
export const HELD_SINGLE_FLUSH_RADIUS = 6;

/**
 * Pheasants rarely sit alone in good cover. When one rooster or hen goes,
 * another bird holding nearby may break a second or two later, just as the
 * hunter has swung on the first. Distances in property yards, time in ms.
 */
export const SECOND_BIRD = { reach: 14, chance: .5, minMs: 700, maxMs: 2400 } as const;
