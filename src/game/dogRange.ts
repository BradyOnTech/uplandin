/**
 * How far the dog hunts from the gun in the 3D field. A close dog keeps the
 * hunter in every contact but covers little ground; a big-running dog finds
 * more birds and asks the hunter to go to its points. The breed's own range
 * stat and the property's doctrine still scale the chosen setting.
 */
export type DogRange = 'close' | 'medium' | 'big';

export const DOG_RANGES: Record<DogRange, { label: string; description: string; radiusM: number; aheadM: number }> = {
  close: { label: 'Close', description: 'Stays within gun range. Fewer finds, every point is on top of you.', radiusM: 22, aheadM: 14 },
  medium: { label: 'Medium', description: 'Quarters the ground in front of you. The usual foot-hunting dog.', radiusM: 34, aheadM: 26 },
  big: { label: 'Big running', description: 'Hunts wide and far ahead. Finds more birds; you go to the points.', radiusM: 50, aheadM: 38 },
};

export const DEFAULT_DOG_RANGE: DogRange = 'medium';

export function parseDogRange(value: string | null | undefined): DogRange | undefined {
  return value === 'close' || value === 'medium' || value === 'big' ? value : undefined;
}
