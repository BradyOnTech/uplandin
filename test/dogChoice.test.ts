import { describe, expect, it } from 'vitest';
import { addDogToKennel, emptyCareer, setHomeRegion } from '../src/game/career';
import { coatLabel, coatsForBreed, defaultCoatFor, isModeledBreed, modelForBreed, MODELED_BREED_IDS, resolveCoatFor } from '../src/game/dogCoats';
import { commitCareerSetup, commitDogCoat, commitPreparationDog } from '../src/game/huntPreparation';
import { normalizeQuickConfig } from '../src/game/quick';
import { GSP_COAT_IDS } from '../src/three/dogs/germanShorthairedPointer';
import { ENGLISH_SETTER_COAT_IDS } from '../src/three/dogs/englishSetter';
import { GRIFFON_COAT_IDS } from '../src/three/dogs/griffon';
import { DEFAULT_DOG_STYLE, DOG_STYLE_KEY, DOG_STYLE_SELECTABLE, effectiveDogStyle, preferredDogStyle, saveDogStyle } from '../src/three/dogs/dogStyle';

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe('coat catalog for the modelled breeds', () => {
  it('matches the coats each 3D model can draw', () => {
    expect(coatsForBreed('gsp').map(c => c.id).sort()).toEqual([...GSP_COAT_IDS].sort());
    expect(coatsForBreed('english-setter').map(c => c.id).sort()).toEqual([...ENGLISH_SETTER_COAT_IDS].sort());
    expect(coatsForBreed('griffon').map(c => c.id).sort()).toEqual([...GRIFFON_COAT_IDS].sort());
  });
  it('models the GSP, English Setter and Griffon; other breeds borrow the setter body', () => {
    expect(MODELED_BREED_IDS).toEqual(['gsp', 'english-setter', 'griffon']);
    expect(modelForBreed('griffon')).toBe('griffon');
    expect(isModeledBreed('vizsla')).toBe(false);
    expect(modelForBreed('vizsla')).toBe('english-setter');
    expect(modelForBreed('gsp')).toBe('gsp');
  });
  it('keeps a coat that belongs to the breed and replaces one that does not', () => {
    expect(resolveCoatFor('gsp', 'black-roan')).toBe('black-roan');
    expect(resolveCoatFor('gsp', 'orange-belton')).toBe(defaultCoatFor('gsp'));
    expect(resolveCoatFor('english-setter', undefined)).toBe('orange-belton');
    expect(defaultCoatFor('gsp')).toBe('liver-white');
    expect(coatLabel('english-setter', 'tricolor')).toBe('Tricolor');
  });
});

describe('coats in saves', () => {
  it('normalizes Quick coats to the chosen breeds and drops a solo hunt’s second coat', () => {
    expect(normalizeQuickConfig({ breedId: 'gsp', coatId: 'solid-liver' }).coatId).toBe('solid-liver');
    expect(normalizeQuickConfig({ breedId: 'gsp', coatId: 'lemon-belton' }).coatId).toBe('liver-white');
    expect(normalizeQuickConfig({ breed2Id: 'none', coat2Id: 'tricolor' }).coat2Id).toBeUndefined();
    expect(normalizeQuickConfig({ breed2Id: 'english-setter', coat2Id: 'tricolor' }).coat2Id).toBe('tricolor');
    expect('coatId' in normalizeQuickConfig({})).toBe(false);
  });
  it('welcomes a dog with its coat and lets the player change it later', () => {
    const home = setHomeRegion(emptyCareer(), 'southern-plains');
    const added = commitPreparationDog(home, { name: 'Sage', breedId: 'english-setter', coatId: 'blue-belton' });
    expect(added.ok && added.dog.coatId).toBe('blue-belton');
    if (!added.ok) throw new Error(added.message);
    const changed = commitDogCoat(added.career, added.dog.id, 'lemon-belton');
    expect(changed.ok && changed.career.kennel[0].coatId).toBe('lemon-belton');
    const wrong = commitDogCoat(added.career, added.dog.id, 'black-roan');
    expect(wrong.ok).toBe(false);
    expect(commitDogCoat(added.career, 'nobody', 'lemon-belton').ok).toBe(false);
  });
  it('stores the first career dog’s coat with the home ground', () => {
    const result = commitCareerSetup(emptyCareer(), { homeRegionId: 'southern-plains', dog: { name: 'Tess', breedId: 'gsp', coatId: 'liver-roan' } });
    expect(result.ok && result.career.kennel[0].coatId).toBe('liver-roan');
  });
  it('leaves older kennel dogs without a coat until one is chosen', () => {
    const { dog } = addDogToKennel(emptyCareer(), 'Old Blue', 'gsp');
    expect('coatId' in dog).toBe(false);
  });
});

describe('one art style for every dog', () => {
  it('uses the stored choice for both breeds, or each breed’s default when none is stored', () => {
    const s = storage();
    expect(preferredDogStyle(s)).toBeNull();
    expect(effectiveDogStyle('gsp', null)).toBe(DEFAULT_DOG_STYLE.gsp);
    expect(effectiveDogStyle('english-setter', null)).toBe(DEFAULT_DOG_STYLE['english-setter']);
    saveDogStyle('faceted', s);
    expect(s.values.get(DOG_STYLE_KEY)).toBe('faceted');
    if (DOG_STYLE_SELECTABLE) {
      expect(preferredDogStyle(s)).toBe('faceted');
      expect(effectiveDogStyle('gsp', 'faceted')).toBe('faceted');
    }
    s.setItem(DOG_STYLE_KEY, 'cartoon');
    expect(preferredDogStyle(s)).toBeNull();
  });
});
