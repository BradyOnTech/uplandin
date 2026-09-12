/**
 * Shotguns trade capacity for swing. The pump holds three but makes you
 * work the action between shots; the doubles hold two and fire as fast as
 * you can press, with a wider, more forgiving pattern.
 */
export interface GunConfig {
  id: string;
  name: string;
  shells: number;
  /** Minimum ms between shots (working the action). 0 = as fast as you tap. */
  cooldownMs: number;
  /** Shot pattern radius in the shooting view. */
  spread: number;
  /** Hunter level required. */
  unlockLevel: number;
  blurb: string;
}

export const GUNS: GunConfig[] = [
  {
    id: 'remington-870',
    name: 'Remington 870 pump',
    shells: 3,
    cooldownMs: 500,
    spread: 14,
    unlockLevel: 1,
    blurb: 'three shells, work the action',
  },
  {
    id: 'semi-auto',
    name: 'Browning A5',
    shells: 3,
    cooldownMs: 250,
    spread: 14,
    unlockLevel: 3,
    blurb: 'humpback semi-auto, quick cycling',
  },
  {
    id: 'over-under',
    name: 'Beretta 686 Silver Pigeon',
    shells: 2,
    cooldownMs: 0,
    spread: 16,
    unlockLevel: 5,
    blurb: 'two barrels, no waiting',
  },
  {
    id: 'side-by-side',
    name: 'RFM Venus',
    shells: 2,
    cooldownMs: 0,
    spread: 18,
    unlockLevel: 8,
    blurb: 'two barrels, forgiving pattern',
  },
];

export function getGun(id: string): GunConfig {
  return GUNS.find((g) => g.id === id) ?? GUNS[0];
}

export function unlockedGuns(hunterLevel: number): GunConfig[] {
  return GUNS.filter((g) => g.unlockLevel <= hunterLevel);
}
