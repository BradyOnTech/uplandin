import type { ShotAssistancePreference } from './shotAssistance';

export type InputMode = 'auto' | 'touch' | 'desktop';
const KEY = 'uplandin.3d.controls';
const SHOT_ASSISTANCE_KEY = 'uplandin.3d.shot-assistance.v1';

export function shotAssistancePreference(): ShotAssistancePreference {
  try {
    const saved = localStorage.getItem(SHOT_ASSISTANCE_KEY);
    if (saved === 'off' || saved === 'light' || saved === 'generous') return saved;
  } catch { /* Storage is optional. */ }
  return 'difficulty';
}

export function saveShotAssistancePreference(value: ShotAssistancePreference): void {
  try { localStorage.setItem(SHOT_ASSISTANCE_KEY, value); } catch { /* Storage is optional. */ }
}

export function preferredInputMode(params = new URLSearchParams(location.search)): InputMode {
  const explicit = params.get('controls');
  if (explicit === 'touch' || explicit === 'desktop' || explicit === 'auto') return explicit;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'touch' || saved === 'desktop') return saved;
  } catch { /* Storage is optional. */ }
  return 'auto';
}

export function usesTouchControls(mode = preferredInputMode()): boolean {
  return mode === 'touch' || (mode === 'auto' && matchMedia('(any-pointer: coarse)').matches);
}

export function saveInputMode(mode: InputMode): void {
  try { localStorage.setItem(KEY, mode); } catch { /* Storage is optional. */ }
}

export type TouchSensitivity = 'look' | 'swing';
export function mobileSightPicture(): 'closer' | 'wide' {
  try { return localStorage.getItem('uplandin.3d.sight') === 'wide' ? 'wide' : 'closer'; } catch { return 'closer'; }
}
/** Keep a short landscape phone from turning Closer into a panoramic shot
 * view. Cap the horizontal field near 90 degrees, with bounded vertical
 * optics; portrait/tablets retain the established 58-degree sight picture.
 * Bird dimensions, flight, shot pattern and difficulty remain unchanged. */
export function mobileShotFov(mount: number, closer: boolean, aspect = 16 / 9): number {
  if (!closer) return 70;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const mounted = Math.max(46, Math.min(58, 2 * Math.atan(1 / safeAspect) * 180 / Math.PI));
  return 70 - (70 - mounted) * Math.max(0, Math.min(1, mount));
}
export function touchSensitivity(kind: TouchSensitivity): number {
  try {
    const value = Number(localStorage.getItem(`uplandin.3d.touch.${kind}`));
    if (value >= .5 && value <= 2) return value;
  } catch { /* Storage is optional. */ }
  return 1;
}
export function saveTouchSensitivity(kind: TouchSensitivity, value: number): void {
  try { localStorage.setItem(`uplandin.3d.touch.${kind}`, String(Math.min(2, Math.max(.5, value)))); } catch { /* optional */ }
}

/** A quiet center for walking; a deliberate outer drag requests running. */
export function touchMovement(x: number, y: number): { dx:number;dy:number;running:boolean } {
  const distance = Math.hypot(x, y);
  if (distance <= 8) return { dx:0, dy:0, running:false };
  const amount = Math.min(1, (distance - 8) / 50);
  return { dx:x / distance * amount, dy:y / distance * amount, running:distance >= 86 };
}
