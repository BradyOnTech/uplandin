import type { HuntChallenge } from '../game/huntChallenge';

export type ShotAssistancePreference = 'difficulty' | 'off' | 'light' | 'generous';
export type ShotTriggerSource = 'touch' | 'mouse' | 'keyboard' | 'other';
export interface ShotAssistanceProfile {
  readonly level: 'off' | 'light' | 'generous';
  readonly angularAllowanceRad: number;
  readonly maxAllowanceM: number;
}

export const NO_SHOT_ASSISTANCE: Readonly<ShotAssistanceProfile> = Object.freeze({
  level: 'off', angularAllowanceRad: 0, maxAllowanceM: 0,
});
// Extra radial tolerance, added equally to every gun's existing pattern.
// Both limits apply: nearby birds get only a small angular allowance and
// distant birds never acquire an ever-widening assistance cone.
// At 12 / 30 / 50 m, Light adds .094 / .236 / .240 m;
// Generous adds .168 / .400 / .400 m. Flight speed, lead and range are unchanged.
const LIGHT: Readonly<ShotAssistanceProfile> = Object.freeze({
  level: 'light', angularAllowanceRad: .45 * Math.PI / 180, maxAllowanceM: .24,
});
const GENEROUS: Readonly<ShotAssistanceProfile> = Object.freeze({
  level: 'generous', angularAllowanceRad: .8 * Math.PI / 180, maxAllowanceM: .40,
});

/** Resolve once at deliberate trigger request, using the active hunt snapshot. */
export function resolveShotAssistance(
  challenge: HuntChallenge,
  preference: ShotAssistancePreference,
  source: ShotTriggerSource,
): Readonly<ShotAssistanceProfile> {
  if (source !== 'touch' || preference === 'off') return NO_SHOT_ASSISTANCE;
  if (preference === 'generous') return GENEROUS;
  if (preference === 'light') return LIGHT;
  return challenge === 'relaxed' ? GENEROUS : challenge === 'wild' ? NO_SHOT_ASSISTANCE : LIGHT;
}

export function shotAssistanceAllowance(distanceM: number, profile: Readonly<ShotAssistanceProfile>): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 0;
  return Math.min(profile.maxAllowanceM, distanceM * Math.tan(profile.angularAllowanceRad));
}
