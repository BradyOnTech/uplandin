/**
 * Coats a player can choose for the breeds that have their own 3D model.
 *
 * This is the renderer-free catalog used by saves, launch URLs and menus.
 * The 3D appearance modules (`three/dogs/germanShorthairedPointer.ts`,
 * `three/dogs/englishSetter.ts` and `three/dogs/griffon.ts`) own the colours;
 * a test keeps the ids of the lists identical.
 */

/** Breeds with a dedicated 3D model. Other breeds are 2D-only for now. */
export const MODELED_BREED_IDS = ['gsp', 'english-setter', 'griffon'] as const;
export type ModeledBreedId = (typeof MODELED_BREED_IDS)[number];

export interface CoatChoice { id: string; label: string }

const COATS: Record<ModeledBreedId, readonly CoatChoice[]> = {
  gsp: [
    { id: 'liver-white', label: 'Liver and white' },
    { id: 'liver-roan', label: 'Liver roan' },
    { id: 'solid-liver', label: 'Solid liver' },
    { id: 'black-roan', label: 'Black roan' },
  ],
  'english-setter': [
    { id: 'orange-belton', label: 'Orange belton' },
    { id: 'blue-belton', label: 'Blue belton' },
    { id: 'tricolor', label: 'Tricolor' },
    { id: 'liver-belton', label: 'Liver belton' },
    { id: 'lemon-belton', label: 'Lemon belton' },
  ],
  griffon: [
    { id: 'steel-gray', label: 'Steel gray and brown' },
  ],
};

export function isModeledBreed(breedId: string | null | undefined): breedId is ModeledBreedId {
  return MODELED_BREED_IDS.includes(breedId as ModeledBreedId);
}

/** The 3D model a breed is drawn with: its own, or the setter body as a stand-in. */
export function modelForBreed(breedId: string): ModeledBreedId {
  return isModeledBreed(breedId) ? breedId : 'english-setter';
}

export function coatsForBreed(breedId: string): readonly CoatChoice[] {
  return COATS[modelForBreed(breedId)];
}

export function defaultCoatFor(breedId: string): string {
  return coatsForBreed(breedId)[0].id;
}

/** A coat that belongs to the breed's model, or that model's default. */
export function resolveCoatFor(breedId: string, coatId: string | null | undefined): string {
  return coatsForBreed(breedId).some(coat => coat.id === coatId) ? coatId! : defaultCoatFor(breedId);
}

export function coatLabel(breedId: string, coatId: string | null | undefined): string {
  const id = resolveCoatFor(breedId, coatId);
  return coatsForBreed(breedId).find(coat => coat.id === id)!.label;
}
