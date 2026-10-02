import type { GunConfig } from './guns';

/**
 * How a shotgun's weight and balance feel in the hands. The Remington 870 is
 * the reference: its feel is the original tuning of the first-person gun.
 *
 * Weight and balance shape the gun's own motion — the mount, the kick and
 * the lag of a carried gun as the hunter turns. They never delay the aim:
 * at a settled mount the bead lies on the shot, whatever the gun.
 */
export interface GunFeel {
  /** Seconds for a full mount from the carry. */
  mountS: number;
  /** Recoil impulse, rearward and muzzle-up: 1 for the reference gun. */
  kick: number;
  /** Muzzle flip per barrel in firing order, multiplying the kick's lift. */
  flip: readonly number[];
  /** A long-recoil action's second jolt as the barrel runs home. */
  shuffle: { delayS: number; z: number; pitch: number } | null;
  /** Carried-gun view lag: smoothing rate (1/s), lower for more swing weight. */
  swayRate: number;
  /** Largest carried-gun lag (rad). */
  swayMax: number;
  /** Size of the quiver as the sight picture settles: light guns quiver more. */
  settle: number;
}

const REFERENCE = { weightKg: 3.4, balanceM: .02 } as const;
/** The reference gun's mount: a cheek-weld rise inside the 150-250 ms law. */
export const REFERENCE_MOUNT_S = .18;
/** A shotgun's radius of gyration about its balance point (m). */
const GYRATION_M = .33;
/** The swing pivots at the shoulders and hips, this far behind the front hand (m). */
const PIVOT_M = .45;

/** Moment of inertia about the swing's pivot, kg m². */
export function swingInertia(handling: Pick<GunConfig['handling'], 'weightKg' | 'balanceM'>): number {
  return handling.weightKg * (GYRATION_M ** 2 + (PIVOT_M + handling.balanceM) ** 2);
}

export function gunFeel(gun: Pick<GunConfig, 'id' | 'handling'>): GunFeel {
  const swing = swingInertia(gun.handling) / swingInertia(REFERENCE);
  const mass = gun.handling.weightKg / REFERENCE.weightKg;
  return {
    mountS: REFERENCE_MOUNT_S * Math.sqrt(swing),
    // The same load kicks a light gun harder: recoil velocity goes as 1/mass.
    kick: 1 / mass,
    // The 686 fires its under barrel first, close to the shoulder's line;
    // the top barrel's higher bore lifts the muzzle more.
    flip: gun.id === 'over-under' ? [.86, 1.12] : [1],
    // The Auto-5's barrel and bolt recoil together; as the barrel returns it
    // gives the stock a second, forward jolt: the "double shuffle".
    shuffle: gun.id === 'semi-auto' ? { delayS: .075, z: -.3, pitch: -.4 } : null,
    swayRate: 7 / swing,
    swayMax: .028 * Math.sqrt(swing),
    settle: 1 / mass,
  };
}

/** A gun's weight the way an American upland hunter says it: "7 lb 8 oz". */
export function weightLabel(kg: number): string {
  const ounces = Math.round(kg / .028349523125);
  return `${Math.floor(ounces / 16)} lb ${ounces % 16} oz`;
}
