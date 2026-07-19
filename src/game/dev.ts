/**
 * Testing helpers. The puppy arc is the game, but testing shouldn't require
 * living it: `?doglevel=8` on the URL runs hunts with a leveled dog profile.
 * The save is untouched — XP still accrues to the real kennel dog.
 */
export function devDogLevel(search: string): number | null {
  const m = /[?&]doglevel=(\d+)/.exec(search);
  if (!m) return null;
  return Math.max(1, Math.min(10, parseInt(m[1], 10)));
}
