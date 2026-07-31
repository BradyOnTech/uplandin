/*
 * The locked Uplandin palette (docs/art/field-view-palette.gpl), carried
 * into 3D. Firewatch's whole look is disciplined palette + simple forms —
 * ours is October: straw gold, olive, russet, oxblood, overcast blues.
 * Every material in the 3D world draws from these roles. No hex literals
 * in subsystem code — import from here so the world stays one print.
 */

export const P = {
  // Ground and vegetation
  straw: 0xaa9554,
  strawLight: 0xd8976d,
  strawPale: 0xf8dec5,
  olive: 0x554d1e,
  oliveDeep: 0x1e2316,
  oliveMid: 0x695926,
  khaki: 0x97772a,
  // Accents
  russet: 0xb44a1a,
  russetDeep: 0x792800,
  ember: 0xf47516,
  emberSoft: 0xd87443,
  oxblood: 0x3f1a21,
  // Sky and atmosphere
  nightNavy: 0x00183a,
  duskNavy: 0x1c3464,
  slate: 0x526375,
  skyBlue: 0x6b89ad,
  skyPale: 0xadc7e0,
  skyMilk: 0xd0e6fd,
  cream: 0xd4d1c2,
  stoneGray: 0xada69e,
  warmGray: 0x846a5b,
  charcoal: 0x454346,
  blush: 0xf4b28f,
} as const;

/** Time-of-day presets the whole world keys from. */
export type TimeOfDay = 'dawn' | 'morning' | 'noon' | 'evening' | 'lastlight';

export interface TodSpec {
  /** Sun elevation in degrees above horizon (negative = below). */
  sunElevation: number;
  /** Sun azimuth degrees (0 = +z, CCW). */
  sunAzimuth: number;
  sunColor: number;
  sunIntensity: number;
  skyTop: number;
  skyHorizon: number;
  fogColor: number;
  fogDensity: number;
  ambientSky: number;
  ambientGround: number;
  ambientIntensity: number;
}

export const TOD: Record<TimeOfDay, TodSpec> = {
  dawn: {
    sunElevation: 6,
    sunAzimuth: 95,
    sunColor: P.emberSoft,
    sunIntensity: 1.6,
    skyTop: P.skyBlue,
    skyHorizon: P.blush,
    fogColor: P.blush,
    fogDensity: 0.006,
    ambientSky: P.skyPale,
    ambientGround: P.warmGray,
    ambientIntensity: 0.55,
  },
  morning: {
    sunElevation: 25,
    sunAzimuth: 120,
    sunColor: 0xfff2d8,
    sunIntensity: 2.0,
    skyTop: P.skyBlue,
    skyHorizon: P.skyMilk,
    fogColor: P.skyMilk,
    fogDensity: 0.0035,
    ambientSky: P.skyPale,
    ambientGround: P.straw,
    ambientIntensity: 0.6,
  },
  noon: {
    sunElevation: 52,
    sunAzimuth: 180,
    sunColor: 0xfff8ea,
    sunIntensity: 2.2,
    skyTop: 0x7d9cc0,
    skyHorizon: P.skyMilk,
    fogColor: P.skyMilk,
    fogDensity: 0.0025,
    ambientSky: P.skyPale,
    ambientGround: P.straw,
    ambientIntensity: 0.65,
  },
  evening: {
    sunElevation: 12,
    sunAzimuth: 260,
    sunColor: P.ember,
    sunIntensity: 1.7,
    skyTop: P.slate,
    skyHorizon: P.emberSoft,
    fogColor: P.emberSoft,
    fogDensity: 0.005,
    ambientSky: P.skyPale,
    ambientGround: P.warmGray,
    ambientIntensity: 0.5,
  },
  lastlight: {
    sunElevation: 2,
    sunAzimuth: 275,
    sunColor: P.russet,
    sunIntensity: 1.1,
    skyTop: P.duskNavy,
    skyHorizon: P.ember,
    fogColor: P.oxblood,
    fogDensity: 0.008,
    ambientSky: P.slate,
    ambientGround: P.oxblood,
    ambientIntensity: 0.4,
  },
};
