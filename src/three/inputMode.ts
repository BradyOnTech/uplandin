export type InputMode = 'auto' | 'touch' | 'desktop';
const KEY = 'uplandin.3d.controls';

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
