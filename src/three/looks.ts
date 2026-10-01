/**
 * Screen-effects looks for the desktop High tier. Each look is one set of
 * numbers for the same pipeline in postEffects.ts: ambient occlusion, ground
 * haze, bloom and a colour grade. Crisp autumn was chosen in October 2026 and
 * is what High renders with. A field link can ask for `?look=off` (no screen
 * effects) or another look (`golden`, `natural`) to compare; Lightweight
 * never renders screen effects.
 */
import type { TimeOfDay } from './palette';

export const LOOK_IDS = ['crisp', 'golden', 'natural'] as const;
export type LookId = (typeof LOOK_IDS)[number];
export type Rgb = readonly [number, number, number];

/** A look's values that change with the time of day; each replaces the
 * look's own value at that time. */
export interface LookTimeTweak {
  aoStrength?: number;
  contrast?: number;
  saturation?: number;
  offset?: Rgb;
  vignette?: number;
}

export interface LookSettings {
  label: string;
  detail: string;
  /** Changes by time of day: low light needs a gentler grade (the S-curve
   * and black offset would crush an evening field to black), and a high sun
   * needs less saturation. */
  byTime?: Partial<Record<TimeOfDay, LookTimeTweak>>;
  /** Screen-space ambient occlusion. Radius and fade distance in metres. */
  ao: { radius: number; intensity: number; strength: number; maxDistance: number };
  /**
   * Exponential height haze over the existing scene fog: density per metre at
   * the hunter's feet, thinning by `falloff` per metre of height. Its colour is
   * the time of day's fog colour times `tint`, pulled toward the sun's colour
   * by `sunTint` in a lobe of width `sunPower` around the sun.
   */
  haze: { density: number; falloff: number; tint: Rgb; sunTint: number; sunPower: number; skyDistance: number };
  /** Bloom on the HDR image: threshold is linear scene brightness. */
  bloom: { strength: number; radius: number; threshold: number };
  grade: {
    /** White balance multipliers, applied before tone mapping. */
    whiteBalance: Rgb;
    saturation: number;
    /** 1 is neutral; above 1 adds an S-curve, below 1 flattens it. */
    contrast: number;
    /** ASC CDL slope, offset and power in display space. */
    slope: Rgb;
    offset: Rgb;
    power: Rgb;
    /** Additive tints on the shadows and the highlights, display space. */
    shadowTint: Rgb;
    highlightTint: Rgb;
    /** Darkening at the frame corners, 0 to 1. */
    vignette: number;
  };
}

export const LOOKS: Record<LookId, LookSettings> = {
  crisp: {
    label: 'Crisp autumn',
    detail: 'Clean air, deep contact shadows, saturated autumn colour and firm contrast.',
    ao: { radius: .9, intensity: 1.1, strength: .85, maxDistance: 140 },
    haze: { density: .0004, falloff: .05, tint: [1, 1, 1], sunTint: .3, sunPower: 10, skyDistance: 900 },
    bloom: { strength: .16, radius: .35, threshold: 1.6 },
    grade: {
      whiteBalance: [1.02, 1, .97], saturation: 1.16, contrast: 1.12,
      slope: [1.02, 1.01, 1], offset: [-.008, -.008, -.006], power: [1, 1, 1],
      shadowTint: [0, .004, .012], highlightTint: [.012, .006, -.004], vignette: .16,
    },
    byTime: {
      // A high sun already saturates the dry ground; keep it from going orange.
      noon: { saturation: 1.08 },
      evening: { contrast: 1.06, offset: [-.003, -.003, -.002] },
      lastlight: { aoStrength: .6, contrast: 1, offset: [.004, .004, .008], vignette: .1 },
    },
  },
  golden: {
    label: 'Golden haze',
    detail: 'Warm, glowing morning air: soft blacks, distance melting into haze, a painterly feel.',
    ao: { radius: 1.1, intensity: .9, strength: .7, maxDistance: 160 },
    haze: { density: .003, falloff: .035, tint: [1.08, 1, .86], sunTint: .85, sunPower: 6, skyDistance: 900 },
    bloom: { strength: .35, radius: .6, threshold: 1.3 },
    grade: {
      whiteBalance: [1.07, 1, .88], saturation: 1.04, contrast: .94,
      slope: [1.03, 1, .95], offset: [.008, .012, .016], power: [1, 1, 1.02],
      shadowTint: [-.01, .01, .02], highlightTint: [.03, .012, -.02], vignette: .24,
    },
  },
  natural: {
    label: 'Natural',
    detail: 'True colour and gentle contrast: today’s world, grounded and with a little depth.',
    ao: { radius: .8, intensity: .95, strength: .6, maxDistance: 120 },
    haze: { density: .0008, falloff: .05, tint: [1, 1, 1], sunTint: .4, sunPower: 8, skyDistance: 900 },
    bloom: { strength: .25, radius: .5, threshold: 1.25 },
    grade: {
      whiteBalance: [1.01, 1, .985], saturation: 1.07, contrast: 1.04,
      slope: [1, 1, 1], offset: [0, 0, 0], power: [1, 1, 1],
      shadowTint: [0, 0, .004], highlightTint: [.004, .002, 0], vignette: .14,
    },
  },
};

/** A look as it applies at a time of day. */
export function lookAt(look: LookSettings, tod: TimeOfDay): LookSettings {
  const tweak = look.byTime?.[tod];
  if (!tweak) return look;
  return {
    ...look,
    ao: { ...look.ao, strength: tweak.aoStrength ?? look.ao.strength },
    grade: {
      ...look.grade,
      contrast: tweak.contrast ?? look.grade.contrast,
      saturation: tweak.saturation ?? look.grade.saturation,
      offset: tweak.offset ?? look.grade.offset,
      vignette: tweak.vignette ?? look.grade.vignette,
    },
  };
}

/** The look a field link names, or null when it names none. */
export function resolveLook(value: string | null | undefined): LookId | null {
  return LOOK_IDS.includes(value as LookId) ? value as LookId : null;
}

/** High's look, chosen October 2026. */
export const DEFAULT_LOOK: LookId = 'crisp';

/** The look a field renders with: the link's look, `off` for none, or
 * Crisp autumn; Lightweight never renders screen effects. */
export function fieldLook(value: string | null | undefined, quality: 'high' | 'lite'): LookId | null {
  if (quality !== 'high' || value === 'off') return null;
  return resolveLook(value) ?? DEFAULT_LOOK;
}
