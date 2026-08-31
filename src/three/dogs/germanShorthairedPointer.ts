/** Coat families for the distinct low-poly German Shorthaired Pointer. */

export const GSP_COAT_IDS = [
  'liver-roan',
  'liver-white',
  'solid-liver',
  'black-roan',
] as const;

export type GspCoatId = (typeof GSP_COAT_IDS)[number];

export interface GspCoatChoice {
  id: GspCoatId;
  label: string;
}

export const GSP_COATS: readonly GspCoatChoice[] = [
  { id: 'liver-roan', label: 'Liver roan' },
  { id: 'liver-white', label: 'Liver and white' },
  { id: 'solid-liver', label: 'Solid liver' },
  { id: 'black-roan', label: 'Black roan' },
];

export const DEFAULT_GSP_COAT: GspCoatId = 'liver-roan';

export interface GermanShorthairedPointerAppearance {
  id: GspCoatId;
  label: string;
  pattern: 'roan' | 'patched' | 'solid';
  headBlaze: boolean;
  ground: number;
  groundDim: number;
  legShade: number;
  pawShade: number;
  primary: number;
  primaryDeep: number;
  nose: number;
  eye: number;
  markingEmissive: number;
  markingEmissiveIntensity: number;
}

const LIVER = 0x58352b;
const LIVER_DEEP = 0x2f201d;
const BLACK = 0x25282a;
const BLACK_DEEP = 0x101315;

const APPEARANCES: Record<GspCoatId, GermanShorthairedPointerAppearance> = {
  'liver-roan': {
    id: 'liver-roan', label: 'Liver roan', pattern: 'roan', headBlaze: false,
    ground: 0x91857d, groundDim: 0x71655e, legShade: 0x675a54, pawShade: 0x554944,
    primary: LIVER, primaryDeep: LIVER_DEEP, nose: 0x241918, eye: 0x4b2c20,
    markingEmissive: 0x251713, markingEmissiveIntensity: 0.16,
  },
  'liver-white': {
    id: 'liver-white', label: 'Liver and white', pattern: 'patched', headBlaze: true,
    ground: 0xeee8dc, groundDim: 0xcfc5b6, legShade: 0xb7aa9a, pawShade: 0x9d8f80,
    primary: LIVER, primaryDeep: LIVER_DEEP, nose: 0x241918, eye: 0x4b2c20,
    markingEmissive: 0x251713, markingEmissiveIntensity: 0.18,
  },
  'solid-liver': {
    id: 'solid-liver', label: 'Solid liver', pattern: 'solid', headBlaze: false,
    ground: LIVER, groundDim: 0x432a24, legShade: 0x3c2722, pawShade: 0x2f211e,
    primary: LIVER, primaryDeep: LIVER_DEEP, nose: 0x211716, eye: 0x4a2c20,
    markingEmissive: 0x1d1210, markingEmissiveIntensity: 0.14,
  },
  'black-roan': {
    id: 'black-roan', label: 'Black roan', pattern: 'roan', headBlaze: false,
    ground: 0x929698, groundDim: 0x6f7477, legShade: 0x62676a, pawShade: 0x515659,
    primary: BLACK, primaryDeep: BLACK_DEEP, nose: 0x101214, eye: 0x4a3022,
    markingEmissive: 0x101214, markingEmissiveIntensity: 0.12,
  },
};

export function isGspCoatId(value: string | null | undefined): value is GspCoatId {
  return GSP_COAT_IDS.includes(value as GspCoatId);
}

export function resolveGspCoat(value: string | null | undefined): GspCoatId {
  return isGspCoatId(value) ? value : DEFAULT_GSP_COAT;
}

export function germanShorthairedPointerAppearance(
  id: GspCoatId,
): GermanShorthairedPointerAppearance {
  return APPEARANCES[id];
}
