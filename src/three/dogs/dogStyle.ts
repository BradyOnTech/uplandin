/**
 * The two dog art styles under evaluation. Both are complete presentations
 * over the same shared hunt simulation:
 * - smooth: one skinned, softly shaded mesh with contact-solved limbs;
 * - faceted: the articulated low-poly sculpt with flat-shaded planes.
 */
export const DOG_STYLES = ['smooth', 'faceted'] as const;
export type DogStyle = (typeof DOG_STYLES)[number];

/** Each breed's established style when no explicit choice is made. */
export const DEFAULT_DOG_STYLE: Record<'gsp' | 'english-setter', DogStyle> = {
  gsp: 'smooth',
  'english-setter': 'faceted',
};

export function resolveDogStyle(value: string | null | undefined): DogStyle | null {
  return DOG_STYLES.includes(value as DogStyle) ? value as DogStyle : null;
}
