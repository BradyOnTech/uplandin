/**
 * The complete coat family for the English Setter model.
 *
 * Callers choose one stable id. Everything needed to make that choice read
 * in the low-poly renderer stays behind this module: coat values, markings,
 * dark-coat fill and the optional tan points of a tricolor.
 */

export const ENGLISH_SETTER_COAT_IDS = [
  'orange-belton',
  'blue-belton',
  'tricolor',
  'liver-belton',
  'lemon-belton',
] as const;

export type EnglishSetterCoatId = (typeof ENGLISH_SETTER_COAT_IDS)[number];

export interface EnglishSetterCoatChoice {
  id: EnglishSetterCoatId;
  label: string;
}

export const ENGLISH_SETTER_COATS: readonly EnglishSetterCoatChoice[] = [
  { id: 'orange-belton', label: 'Orange belton' },
  { id: 'blue-belton', label: 'Blue belton' },
  { id: 'tricolor', label: 'Tricolor' },
  { id: 'liver-belton', label: 'Liver belton' },
  { id: 'lemon-belton', label: 'Lemon belton' },
];

export const DEFAULT_ENGLISH_SETTER_COAT: EnglishSetterCoatId = 'orange-belton';

/** Palette roles consumed only by the English Setter sculpt implementation. */
export interface EnglishSetterAppearance {
  id: EnglishSetterCoatId;
  label: string;
  ground: number;
  groundDim: number;
  legShade: number;
  pawShade: number;
  primary: number;
  primaryDeep: number;
  /** Present only on a blue-belton-and-tan tricolor. */
  tanPoint?: number;
  tanPointDeep?: number;
  nose: number;
  eye: number;
  markingEmissive: number;
  markingEmissiveIntensity: number;
}

const APPEARANCES: Record<EnglishSetterCoatId, EnglishSetterAppearance> = {
  'orange-belton': {
    id: 'orange-belton',
    label: 'Orange belton',
    ground: 0xf4efe3,
    groundDim: 0xd8cdb9,
    legShade: 0xc8baa4,
    pawShade: 0xb5a58f,
    primary: 0xc35a27,
    primaryDeep: 0x7a2c16,
    nose: 0x211815,
    eye: 0x4a2818,
    markingEmissive: 0x7a3218,
    markingEmissiveIntensity: 0.35,
  },
  // "Blue" is the traditional name for black hairs intermingled with the
  // white ground. Cool charcoal preserves that read under the warm field sun.
  'blue-belton': {
    id: 'blue-belton',
    label: 'Blue belton',
    ground: 0xf1eee6,
    groundDim: 0xcecbc2,
    legShade: 0xbcbab3,
    pawShade: 0xa7a59f,
    primary: 0x303943,
    primaryDeep: 0x11161b,
    nose: 0x101214,
    eye: 0x5a3824,
    markingEmissive: 0x151b20,
    markingEmissiveIntensity: 0.2,
  },
  'tricolor': {
    id: 'tricolor',
    label: 'Tricolor',
    ground: 0xf1eee6,
    groundDim: 0xcecbc2,
    // Tan points extend down the legs as they do on a working tricolor.
    legShade: 0xb86b38,
    pawShade: 0x865035,
    primary: 0x2d353d,
    primaryDeep: 0x101519,
    tanPoint: 0xc5793d,
    tanPointDeep: 0x8a4828,
    nose: 0x101214,
    eye: 0x50301f,
    markingEmissive: 0x211a17,
    markingEmissiveIntensity: 0.22,
  },
  'liver-belton': {
    id: 'liver-belton',
    label: 'Liver belton',
    ground: 0xf2ede2,
    groundDim: 0xd3c8b9,
    legShade: 0xc3b3a0,
    pawShade: 0xac9985,
    primary: 0x744032,
    primaryDeep: 0x3b211b,
    nose: 0x2a1815,
    eye: 0x563021,
    markingEmissive: 0x3f2119,
    markingEmissiveIntensity: 0.28,
  },
  'lemon-belton': {
    id: 'lemon-belton',
    label: 'Lemon belton',
    ground: 0xf5f0e4,
    groundDim: 0xdccfba,
    legShade: 0xcbbda6,
    pawShade: 0xb8a88f,
    primary: 0xd49a42,
    primaryDeep: 0x91602b,
    nose: 0x34241e,
    eye: 0x5d3a21,
    markingEmissive: 0x735020,
    markingEmissiveIntensity: 0.28,
  },
};

export function isEnglishSetterCoatId(value: string | null | undefined): value is EnglishSetterCoatId {
  return ENGLISH_SETTER_COAT_IDS.includes(value as EnglishSetterCoatId);
}

export function resolveEnglishSetterCoat(value: string | null | undefined): EnglishSetterCoatId {
  return isEnglishSetterCoatId(value) ? value : DEFAULT_ENGLISH_SETTER_COAT;
}

export function englishSetterAppearance(id: EnglishSetterCoatId): EnglishSetterAppearance {
  return APPEARANCES[id];
}
