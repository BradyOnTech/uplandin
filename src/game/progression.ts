import { GUNS } from './guns';

/**
 * What the hunter's level unlocks. Everything derives from the level itself —
 * no separate purchase economy (yet): reach the level, own the thing.
 *
 * Hunter XP: bird downed +1, a double on one flush +1 bonus, hunt completed +2.
 */

export const HUNTER_LEVEL_CAP = 10;

export const TRUCK_LEVEL = 2;

/** The truck opens travel beyond the home region. */
export function truckUnlocked(hunterLevel: number): boolean {
  return hunterLevel >= TRUCK_LEVEL;
}

export const GEAR_NAMES = ['bell', 'beeper collar', 'GPS handheld', 'GPS + map'] as const;

/** Dog tracking gear tier (0-3); the best you've earned is what you carry. */
export function gearTierFor(hunterLevel: number): number {
  return hunterLevel >= 9 ? 3 : hunterLevel >= 6 ? 2 : hunterLevel >= 3 ? 1 : 0;
}

/** Kennel capacity: the dog box grows 1 → 3 → 5. */
export function kennelSlots(hunterLevel: number): number {
  return hunterLevel >= 7 ? 5 : hunterLevel >= 4 ? 3 : 1;
}

/** XP required to advance FROM `level`. */
export function hunterXpForLevel(level: number): number {
  return Math.round(10 * Math.pow(level, 1.5));
}

export function hunterLevelForXp(xp: number): number {
  let level = 1;
  let needed = 0;
  while (level < HUNTER_LEVEL_CAP) {
    needed += hunterXpForLevel(level);
    if (xp < needed) break;
    level++;
  }
  return level;
}

/** Summary callouts for everything a freshly-reached level unlocks. */
export function unlocksAtLevel(level: number): string[] {
  const out: string[] = [];
  if (level === TRUCK_LEVEL) out.push('the truck — the whole map is open');
  for (const g of GUNS) {
    if (g.unlockLevel === level && g.unlockLevel > 1) out.push(g.name);
  }
  if (level === 3) out.push('beeper collar');
  if (level === 6) out.push('GPS handheld');
  if (level === 9) out.push('GPS + map');
  if (level === 4) out.push('dog box (3 kennel slots)');
  if (level === 7) out.push('big dog box (5 kennel slots)');
  return out;
}
