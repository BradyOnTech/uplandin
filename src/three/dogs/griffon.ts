/**
 * The coat family for the Wirehaired Pointing Griffon model.
 *
 * October 3, 2026: Brady chose the breed's classic coat only, steel gray
 * with brown markings: a brown head and ears, a grizzled steel-gray body
 * (pale and brown hairs through gray) and brown patches over it. The nose is
 * always brown. Everything else about the coat stays behind this module.
 */

export const GRIFFON_COAT_IDS = ['steel-gray'] as const;

export type GriffonCoatId = (typeof GRIFFON_COAT_IDS)[number];

export interface GriffonCoatChoice {
  id: GriffonCoatId;
  label: string;
}

export const GRIFFON_COATS: readonly GriffonCoatChoice[] = [
  { id: 'steel-gray', label: 'Steel gray and brown' },
];

export const DEFAULT_GRIFFON_COAT: GriffonCoatId = 'steel-gray';

/** Palette roles consumed only by the Griffon's coat and head. */
export interface GriffonAppearance {
  id: GriffonCoatId;
  label: string;
  /** The steel-gray body as it reads from a few strides off. */
  ground: number;
  groundDim: number;
  /** The pale hairs of the grizzle. */
  grizzle: number;
  /** Brown head, ears and markings. */
  primary: number;
  primaryDeep: number;
  nose: number;
  eye: number;
}

const APPEARANCES: Record<GriffonCoatId, GriffonAppearance> = {
  'steel-gray': {
    id: 'steel-gray', label: 'Steel gray and brown',
    ground: 0x6c6863, groundDim: 0x54514d, grizzle: 0xb0aa9f,
    primary: 0x5e3d2c, primaryDeep: 0x3a261d,
    nose: 0x3d2620, eye: 0x7a5124,
  },
};

export function isGriffonCoatId(value: string | null | undefined): value is GriffonCoatId {
  return GRIFFON_COAT_IDS.includes(value as GriffonCoatId);
}

export function resolveGriffonCoat(value: string | null | undefined): GriffonCoatId {
  return isGriffonCoatId(value) ? value : DEFAULT_GRIFFON_COAT;
}

export function griffonAppearance(id: GriffonCoatId): GriffonAppearance {
  return APPEARANCES[id];
}

/** The darkest a coat facet's marker is drawn; the coat shader reads it back. */
export const GRIFFON_TONE_FLOOR = .78;

/**
 * A harsh coat in the faceted look: every facet is its own lock of hair. The
 * coat surface marker carries the facet's tone (0..1) in its brightness, and
 * the coat shader turns it into that lock's shade of steel gray.
 */
export function griffonMarkerTone(marker: number, tone: number): number {
  const k = GRIFFON_TONE_FLOOR + (1 - GRIFFON_TONE_FLOOR) * Math.min(1, Math.max(0, tone));
  return [16, 8, 0].reduce((hex, shift) => hex | (Math.round(((marker >> shift) & 255) * k) << shift), 0);
}

/** A stable 0..1 value for a point: the same facet always gets the same lock. */
export function griffonHash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 412.3 + y * 289.1 + z * 157.7) * 43758.5453;
  return s - Math.floor(s);
}
