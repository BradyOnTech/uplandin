/**
 * The two dog art styles under evaluation. Both are complete presentations
 * over the same shared hunt simulation:
 * - smooth: one skinned, softly shaded mesh with contact-solved limbs;
 * - faceted: the articulated low-poly sculpt with flat-shaded planes.
 *
 * Choosing the house style later is a two-line change here:
 * set both `DEFAULT_DOG_STYLE` entries to the chosen style and set
 * `DOG_STYLE_SELECTABLE` to false. Every menu control for the style then
 * disappears and stored choices are ignored.
 */
export const DOG_STYLES = ['smooth', 'faceted'] as const;
export type DogStyle = (typeof DOG_STYLES)[number];

/** While the house style is undecided, players may pick a style for every dog. */
export const DOG_STYLE_SELECTABLE = true;

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
