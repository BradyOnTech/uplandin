/**
 * The field's looks. Each look is a colour grade, which every material
 * applies in its tone mapping on both tiers (grade.ts), plus the High tier's
 * screen effects (postEffects.ts): ambient occlusion and bloom. Crisp autumn
 * was chosen in October 2026 and is what both tiers render with; each core
 * ground adds its own light. A field link can ask for `?look=off` (plain ACES,
 * no grade or screen effects) or another look (`golden`, `natural`) to
 * compare. Haze is not part of a look: the regional atmosphere draws it in
 * every material (atmosphere.ts).
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

/** A ground's own grade on top of a look, applied after the time of day:
 * multipliers on white balance and saturation, a scale on contrast's
 * departure from neutral (so a flat last light stays flat), and added shadow
 * and highlight tints. `byTime` adds an hour's own tweak on top, the same
 * way. */
export interface LookGroundTweak {
  whiteBalance?: Rgb;
  saturation?: number;
  contrast?: number;
  shadowTint?: Rgb;
  highlightTint?: Rgb;
  byTime?: Partial<Record<TimeOfDay, Omit<LookGroundTweak, 'byTime'>>>;
}

export interface LookSettings {
  label: string;
  detail: string;
  /** Changes by time of day: low light needs a gentler grade (the S-curve
   * and black offset would crush an evening field to black), and a high sun
   * needs less saturation. */
  byTime?: Partial<Record<TimeOfDay, LookTimeTweak>>;
  /** Each ground's own light, by area id (see LookGroundTweak). */
  byGround?: Partial<Record<string, LookGroundTweak>>;
  /** Screen-space ambient occlusion (High). Radius and fade distance in metres. */
  ao: { radius: number; intensity: number; strength: number; maxDistance: number };
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
    byGround: {
      // A prairie-pothole farm in November: cold blue air, the slanting
      // sun pale on the stubble rather than golden, blue shade under the
      // shelterbelts. Evening keeps a little more of the low sun's warmth.
      'pheasant-coverts': { whiteBalance: [1.005, 1, .985], saturation: .98, contrast: 1.2,
        highlightTint: [.006, .006, .002], shadowTint: [-.006, .002, .016],
        byTime: { evening: { whiteBalance: [1.03, 1, .97] } } },
      // Northern mixed grass under a big sky: the clearest air and a firmer
      // contrast, so the cured grass doesn't wash pale.
      'sharptail-prairie': { whiteBalance: [1.02, 1, .975], contrast: 1.4, shadowTint: [0, .003, .01],
        // Evening: warm gold light, cool blue-violet shade, a gentler curve
        // so the shade side holds its colour instead of sinking to brown.
        byTime: { evening: { contrast: .7, shadowTint: [-.006, -.002, .007] } } },
      // Southern quail woods: soft, humid light, the red soil kept from orange.
      'quail-fields': { whiteBalance: [1.01, 1, .99], saturation: .88, contrast: .7, highlightTint: [.006, .006, .002] },
      // High desert: dry clarity, and blue shade off the rock.
      'chukar-ridge': { whiteBalance: [.985, 1, 1.02], saturation: .92, contrast: 1.5, shadowTint: [-.006, 0, .014] },
    },
  },
  golden: {
    label: 'Golden haze',
    detail: 'Warm, glowing morning air: soft blacks, distance melting into haze, a painterly feel.',
    ao: { radius: 1.1, intensity: .9, strength: .7, maxDistance: 160 },
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
    bloom: { strength: .25, radius: .5, threshold: 1.25 },
    grade: {
      whiteBalance: [1.01, 1, .985], saturation: 1.07, contrast: 1.04,
      slope: [1, 1, 1], offset: [0, 0, 0], power: [1, 1, 1],
      shadowTint: [0, 0, .004], highlightTint: [.004, .002, 0], vignette: .14,
    },
  },
};

const times = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const plus = (a: Rgb, b: Rgb): Rgb => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** A look as it applies at a time of day, on a ground (an area id). */
export function lookAt(look: LookSettings, tod: TimeOfDay, ground?: string): LookSettings {
  const tweak = look.byTime?.[tod], local = ground === undefined ? undefined : look.byGround?.[ground];
  const timed: LookSettings = !tweak ? look : {
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
  if (!local) return timed;
  const hour = local.byTime?.[tod];
  return { ...timed, grade: hour ? groundGrade(groundGrade(timed.grade, local), hour) : groundGrade(timed.grade, local) };
}

function groundGrade(g: LookSettings['grade'], local: Omit<LookGroundTweak, 'byTime'>): LookSettings['grade'] {
  return {
    ...g,
    whiteBalance: local.whiteBalance ? times(g.whiteBalance, local.whiteBalance) : g.whiteBalance,
    saturation: g.saturation * (local.saturation ?? 1),
    contrast: 1 + (g.contrast - 1) * (local.contrast ?? 1),
    shadowTint: local.shadowTint ? plus(g.shadowTint, local.shadowTint) : g.shadowTint,
    highlightTint: local.highlightTint ? plus(g.highlightTint, local.highlightTint) : g.highlightTint,
  };
}

/** The look a field link names, or null when it names none. */
export function resolveLook(value: string | null | undefined): LookId | null {
  return LOOK_IDS.includes(value as LookId) ? value as LookId : null;
}

/** The field's look, chosen October 2026. */
export const DEFAULT_LOOK: LookId = 'crisp';

/** The look a field renders with on either tier: the link's look, `off` for
 * none (plain ACES), or Crisp autumn. */
export function fieldLook(value: string | null | undefined): LookId | null {
  if (value === 'off') return null;
  return resolveLook(value) ?? DEFAULT_LOOK;
}

/** Only desktop High adds the screen effects (occlusion and bloom). */
export function fieldScreenEffects(look: LookId | null, quality: 'high' | 'lite'): boolean {
  return look !== null && quality === 'high';
}
