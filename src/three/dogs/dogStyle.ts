/**
 * The two dog art styles. Both are looks of the one skinned rig, its
 * contact-solved limbs and its motion, over the shared hunt simulation:
 * - smooth: softly shaded, finer rings;
 * - faceted: broad flat-shaded planes in the low-poly house style.
 *
 * October 1, 2026: each breed keeps the look Brady chose (a smooth GSP and a
 * faceted English Setter) and the player-facing style switch is closed.
 * October 2, 2026: the faceted setter now draws on the skinned rig and the
 * articulated sculpt is retired. The comparison bench
 * (tools3d/dog-comparison.html) still shows all four pairings.
 */
export const DOG_STYLES = ['smooth', 'faceted'] as const;
export type DogStyle = (typeof DOG_STYLES)[number];

/** Players no longer pick a style; each breed draws in its house style. */
export const DOG_STYLE_SELECTABLE: boolean = false;

/** Remembered player choice; one style applies to every breed. */
export const DOG_STYLE_KEY = 'uplandin.3d.dogstyle';

export const DOG_STYLE_LABELS: Record<DogStyle, { label: string; detail: string }> = {
  smooth: { label: 'Smooth', detail: 'One softly shaded, skinned body' },
  faceted: { label: 'Faceted', detail: 'Sculpted low-poly planes' },
};

/** Each breed's established style when no explicit choice is made. */
export const DEFAULT_DOG_STYLE: Record<'gsp' | 'english-setter', DogStyle> = {
  gsp: 'smooth',
  'english-setter': 'faceted',
};

export function resolveDogStyle(value: string | null | undefined): DogStyle | null {
  return DOG_STYLES.includes(value as DogStyle) ? value as DogStyle : null;
}

type ReadableStorage = Pick<Storage, 'getItem'>;
function defaultStorage(): Storage | null { try { return localStorage; } catch { return null; } }

/** The player's remembered style, or null when none is chosen (or choice is closed). */
export function preferredDogStyle(storage: ReadableStorage | null = defaultStorage()): DogStyle | null {
  if (!DOG_STYLE_SELECTABLE) return null;
  try { return resolveDogStyle(storage?.getItem(DOG_STYLE_KEY)); } catch { return null; }
}

export function saveDogStyle(style: DogStyle, storage: Pick<Storage, 'setItem'> | null = defaultStorage()): void {
  try { storage?.setItem(DOG_STYLE_KEY, style); } catch { /* The launch URL still carries the choice. */ }
}

/** The style a breed is drawn in, given an explicit choice (URL or preference). */
export function effectiveDogStyle(breed: 'gsp' | 'english-setter', choice: DogStyle | null): DogStyle {
  return DOG_STYLE_SELECTABLE && choice ? choice : DEFAULT_DOG_STYLE[breed];
}
