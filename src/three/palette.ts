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
  // Sun and atmosphere roles (3D sky dome, ridge silhouettes)
  sunCore: 0xfff2d8,
  sunHigh: 0xfff8ea,
  glowGold: 0xffd9a2,
  mauve: 0x8d7a96,
  skyDeep: 0x7d9cc0,
  ridgeDawn: 0x5d5266,
  ridgeDusk: 0x241019,
  // Haze roles: pale enough to survive linear-space + ACES without going
  // rust — fog and hemisphere colors must come from these, not the hot
  // accents (blush/emberSoft read warm in sRGB but saturate to mud).
  hazeDawn: 0xf2c4a4,
  hazeEvening: 0xf3b183,
  sunLow: 0xf0a060,
  // Aerial-perspective roles: distant vegetation dissolves toward these,
  // and ridge stacks step near->far toward a cool counterweight so the
  // golden-hour frames never collapse into a single-hue orange filter.
  grassHazeDawn: 0xc9b6a8,
  ridgeEvening: 0x7a4526,
  ridgeNoon: 0x7b90a3,
  // Shadow-core tints (multipliers on grass root colors, not albedos):
  // neutral at midday, cool violet at the golden hours.
  shadowNeutral: 0xf0eeea,
  shadowDawn: 0xd7cfdd,
  shadowEvening: 0xb7a4d0,
  shadowNight: 0x9a8fc2,
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
  /** Three-stop sky gradient: horizon → mid → top (cooling upward). */
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  /** Hot narrow band hugging the horizon, focused toward the sun azimuth. */
  hotBand: number;
  hotStrength: number;
  /** Visible sun disc + soft glow around it. */
  sunDisc: number;
  sunGlow: number;
  glowStrength: number;
  fogColor: number;
  fogDensity: number;
  ambientSky: number;
  ambientGround: number;
  ambientIntensity: number;
  /** Distant ridge silhouette base color (flattened toward fog per layer). */
  ridge: number;
  /** Farthest ridge color — the cool counterweight the stack steps toward. */
  ridgeFar: number;
  /** Distant instanced vegetation lerps its albedo toward this haze. */
  grassHaze: number;
  /** Multiplier tint on grass shadow cores (cool at the golden hours). */
  grassShadow: number;
  /** Mid stop of the sun bloom halo: core -> this -> ambient sky. */
  sunGlowMid: number;
  /** Tone-mapping exposure for this light — dawn/dusk lift, noon restraint. */
  exposure: number;
}

export const TOD: Record<TimeOfDay, TodSpec> = {
  dawn: {
    sunElevation: 6,
    sunAzimuth: 95,
    sunColor: P.sunLow,
    // First light: the sun is a rim, not a floodlight — the ground hasn't
    // warmed yet. Cool neutral ambient, restrained sun, only tips catch it.
    sunIntensity: 2.0,
    skyTop: P.slate,
    skyMid: P.mauve,
    skyHorizon: P.hazeDawn,
    hotBand: P.glowGold,
    hotStrength: 0.9,
    sunDisc: P.sunHigh,
    sunGlow: P.glowGold,
    glowStrength: 0.85,
    fogColor: P.hazeDawn,
    fogDensity: 0.0045,
    ambientSky: P.cream,
    ambientGround: P.warmGray,
    ambientIntensity: 1.0,
    ridge: P.ridgeDawn,
    ridgeFar: P.mauve,
    grassHaze: P.grassHazeDawn,
    grassShadow: P.shadowDawn,
    sunGlowMid: P.sunLow,
    exposure: 1.32,
  },
  morning: {
    sunElevation: 25,
    sunAzimuth: 120,
    sunColor: P.sunCore,
    sunIntensity: 2.3,
    skyTop: P.skyBlue,
    skyMid: P.skyPale,
    skyHorizon: P.skyMilk,
    hotBand: P.strawPale,
    hotStrength: 0.3,
    sunDisc: P.sunHigh,
    sunGlow: P.strawPale,
    glowStrength: 0.35,
    fogColor: P.skyMilk,
    fogDensity: 0.003,
    ambientSky: P.skyPale,
    ambientGround: P.straw,
    ambientIntensity: 0.9,
    ridge: P.slate,
    ridgeFar: P.mauve,
    grassHaze: P.skyMilk,
    grassShadow: P.shadowNeutral,
    sunGlowMid: P.strawPale,
    exposure: 1.1,
  },
  noon: {
    sunElevation: 52,
    sunAzimuth: 180,
    sunColor: P.sunCore,
    sunIntensity: 2.6,
    skyTop: P.skyDeep,
    skyMid: P.skyPale,
    skyHorizon: P.skyMilk,
    hotBand: P.skyMilk,
    hotStrength: 0.15,
    sunDisc: P.sunHigh,
    sunGlow: P.skyMilk,
    glowStrength: 0.2,
    fogColor: P.skyMilk,
    fogDensity: 0.0018,
    ambientSky: P.skyPale,
    ambientGround: P.straw,
    ambientIntensity: 0.6,
    // Lifted, desaturated slate: the near band must read as hazy mountains,
    // not a sea — darkest nearest, still lighter than foreground shadows.
    ridge: P.ridgeNoon,
    ridgeFar: P.skyPale,
    grassHaze: P.cream,
    grassShadow: P.shadowNeutral,
    sunGlowMid: P.skyMilk,
    exposure: 0.9,
  },
  evening: {
    sunElevation: 9,
    sunAzimuth: 260,
    // emberSoft, restrained: full ember at 3.2 painted the entire field one
    // saturated orange — light should be warm, not a filter.
    sunColor: P.emberSoft,
    sunIntensity: 2.8,
    skyTop: P.slate,
    skyMid: P.blush,
    skyHorizon: P.hazeEvening,
    hotBand: P.glowGold,
    hotStrength: 1.0,
    sunDisc: P.sunHigh,
    sunGlow: P.glowGold,
    glowStrength: 0.9,
    fogColor: P.hazeEvening,
    fogDensity: 0.0045,
    ambientSky: P.hazeEvening,
    ambientGround: P.straw,
    ambientIntensity: 0.9,
    // Warm near ridge stepping to desaturated blue-violet far — the cool
    // counterweight that keeps golden hour from reading as an orange filter.
    ridge: P.ridgeEvening,
    ridgeFar: P.ridgeDawn,
    grassHaze: P.emberSoft,
    grassShadow: P.shadowEvening,
    sunGlowMid: P.ember,
    exposure: 1.3,
  },
  lastlight: {
    sunElevation: 2,
    sunAzimuth: 275,
    sunColor: P.russet,
    sunIntensity: 2.0,
    skyTop: P.nightNavy,
    skyMid: P.duskNavy,
    skyHorizon: P.oxblood,
    hotBand: P.ember,
    hotStrength: 1.0,
    sunDisc: P.ember,
    sunGlow: P.russet,
    glowStrength: 0.9,
    fogColor: P.oxblood,
    fogDensity: 0.006,
    ambientSky: P.slate,
    ambientGround: P.warmGray,
    ambientIntensity: 0.7,
    // Near ridge sits at the fog color so the fogged terrain crest melts
    // into it instead of reading as a mismatched lit patch.
    ridge: P.oxblood,
    ridgeFar: P.duskNavy,
    grassHaze: P.warmGray,
    grassShadow: P.shadowNight,
    sunGlowMid: P.russet,
    exposure: 1.15,
  },
};
