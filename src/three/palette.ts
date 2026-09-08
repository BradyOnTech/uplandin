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
  // Dusk far grass melts into the violet shadow mass (round 5: measured
  // lastlight ground was H357 S0.45 — warm concrete under a violet sky.
  // The dusk field must carry the sky's ambient, so the haze goes violet).
  grassHazeDusk: 0x473a5e,
  // Haze roles: pale enough to survive linear-space + ACES without going
  // rust — fog and hemisphere colors must come from these, not the hot
  // accents (blush/emberSoft read warm in sRGB but saturate to mud).
  hazeDawn: 0xf2c4a4,
  hazeEvening: 0xf3b183,
  sunLow: 0xf2ab72,
  // Round-5 measured fix: in LINEAR space a saturated warm key multiplies
  // every albedo to H~31 — grass at H52 and soil at H17 both landed on the
  // same orange (measured hueGap -1.5 vs fw's +13). The dawn KEY must be
  // pale enough that albedo hue survives; the dawn's warmth lives in the
  // sky, halo, rim, and drench wedge instead.
  sunDawnKey: 0xf6c493,
  // Aerial-perspective roles: distant vegetation dissolves toward these,
  // and ridge stacks step near->far toward a cool counterweight so the
  // golden-hour frames never collapse into a single-hue orange filter.
  grassHazeDawn: 0xc9b6a8,
  ridgeEvening: 0x7a4526,
  // Teal-shifted noon ridge per fw-firewatch-e3-5's monolith staging.
  ridgeNoon: 0x5e8894,
  // Shadow-core tints (multipliers on grass root colors, not albedos):
  // neutral at midday, cool violet at the golden hours.
  shadowNeutral: 0xf0eeea,
  shadowDawn: 0xc0b2da,
  shadowEvening: 0xb7a4d0,
  shadowNight: 0x9a8fc2,
  // Noon rescue roles: round 1's noon was a dead washed blue. Firewatch
  // noon commits — saturated teal zenith, a warmed cream horizon.
  noonZenith: 0x4f87a8,
  noonMid: 0x8fb4c6,
  noonHorizon: 0xe9dcc0,
  // Flat cumulus roles: lit face / underside shade at full day. The other
  // TODs tint clouds from existing sky roles (blush, mauve, glowGold...).
  cloudWhite: 0xf7f3e8,
  cloudShadeNoon: 0xaebbca,
  // Round-3 hue-separation roles: soil and grass are DIFFERENT materials.
  // Soil is brown and 15-20% darker than the old straw ramp; grass sits in
  // a straw-gold band with olive/green undertones so the lower two thirds
  // of frame is never a single tan ramp again.
  // Round-5 measured move: fw meadows keep soil ~13 deg COOLER in hue and
  // ~0.15 LESS saturated than the straw above it (soil H16-18/S0.4, grass
  // H30/S0.66). Ours sat at H32/S0.79 — same hue as the tufts. Soil family
  // pulled to cool umber; tufts nudged yellower so the split reads BY HUE.
  // Iteration 2: the warm dawn key multiplies every hue ~15 deg toward
  // orange, so the ALBEDO split must overshoot — grass at H52, soil at H17
  // — to land at the ref's lit-straw-vs-cool-umber gap after lighting.
  soilBrown: 0x664639,
  soilDark: 0x483227,
  grassGold: 0xd2c157,
  grassOlive: 0x808540,
  forbGreen: 0x5f7a33,
  // Great Basin rimrock: pale volcanic dust, weathered basalt/granite,
  // blue-grey sage, and the yellow-green lichen that catches on faces.
  rimrockDust: 0xb8a176,
  rimrockSoil: 0x8f7554,
  rimrockStone: 0x827a70,
  rimrockStoneLight: 0xb3a38c,
  rimrockShade: 0x4d4947,
  rimrockSage: 0x69715d,
  rimrockLichen: 0xb49b2f,
  // Midground canopy green — the second hue family the noon frame needs.
  canopyGreen: 0x54622a,
  // Evening anti-monochrome roles: blue-grey zenith, desaturated grass haze
  // so warmth reads as light on surfaces instead of a tint over the lens.
  eveningZenith: 0x455478,
  grassHazeEvening: 0xb38a70,
  // Round-4 light-truth roles: the soil's cool umber half (the sun drench
  // lobe warms the other half — two hues, one field), the evening
  // foreground's deep warm sienna (true black is reserved for lastlight),
  // and the violet the lastlight foreground lifts toward so silhouettes
  // stay readable instead of crushing to void.
  soilCool: 0x55453c,
  siennaDusk: 0x9a5a36,
  duskViolet: 0x655a8a,
  // Round-5 roles — measure-driven. The lastlight field carries the sky's
  // ambient: a violet shadow mass (hemisphere ground bounce + the cool-mass
  // tint the ground/grass shaders mix toward away from the sun lobe).
  duskGroundViolet: 0x50427a,
  // Noon cumulus paint: near-white lit faces (ref p50 V=0.92; ours read
  // 0.78 gray) over a flat shaded underside step.
  cloudBright: 0xfffef8,
  // Mid-ground landform silhouettes (the third depth plane): one hue per
  // light, stepped between the field and the far ridges.
  landDawn: 0x5c4c3d,
  landEvening: 0x6e3a24,
  landDusk: 0x2e2038,
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
  /**
   * High-elevation fill that models the swells when the shadow-casting key
   * rides low (the key follows the TRUE sun elevation so dawn/evening throw
   * long shadows; the fill restores form modeling without casting).
   */
  fillColor: number;
  fillIntensity: number;
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
  /** Ridge haze multiplier: >1 melts silhouettes higher into the sky (the
   *  lastlight navy-wedge fix — dusk ridges dissolve, never intersect). */
  ridgeHazeBoost: number;
  /** Mid stop of the sun bloom halo: core -> this -> ambient sky. */
  sunGlowMid: number;
  /** Tone-mapping exposure for this light — dawn/dusk lift, noon restraint. */
  exposure: number;
  /** Flat cumulus tinting: sunlit face, underside shade, and coverage 0-1. */
  cloudLit: number;
  cloudShade: number;
  cloudAmount: number;
  /**
   * Sun drench: distant ground and grass albedo grade toward this hue in a
   * lobe around the sun azimuth, strongest near the horizon — Firewatch
   * carries the sky's color down onto the field instead of stopping the
   * light at the horizon line.
   */
  groundSunTint: number;
  /** 0-1 strength of the drench lobe (0 kills it). */
  groundSunK: number;
  /** Small additive glow riding the drench so low light reads ON the ground. */
  groundSunEmit: number;
  /**
   * Distance band of the drench lobe (meters). Screen geometry rules it:
   * a first-person camera puts 10-80 m in a thin strip under the horizon,
   * so a wedge that must fill frame (lastlight pool) starts near, and a
   * wedge that must hug the horizon (dawn) starts far.
   */
  groundSunNear: number;
  groundSunFar: number;
  /**
   * Ceiling on grass albedo luminance. Effectively off (>=4) in daylight;
   * at silhouette hour it clamps the pale seed heads and cut tips that
   * otherwise sparkle inside the black foreground.
   */
  grassLumCap: number;
  /** Painted flora two-tone: warm sun-facing facets / cooled shade facets. */
  floraWarm: number;
  floraCool: number;
  /**
   * Mid-ground landform silhouette color (the third depth plane between
   * the fence line and the far ridge stack — rock bench / treeline wedge).
   */
  landform: number;
  /**
   * Cool-mass tint: the sky ambient carried into the UNLIT ground/grass —
   * everything outside the sun-drench lobe grades toward this. The
   * lastlight violet-shadow-mass fix; ~0 in full daylight.
   */
  groundCoolTint: number;
  groundCoolK: number;
}

export const TOD: Record<TimeOfDay, TodSpec> = {
  dawn: {
    sunElevation: 6,
    // 52, not 95: dawn-field looks along az 0, and a shadow band running
    // perpendicular to the view collapses to ~3 px at 80 m — the sun must
    // sit AHEAD-right of that view so the long tree/fence shadows rake
    // diagonally TOWARD the camera. At 52 the dawn-into-sun pose (view az
    // ~85, ~96 deg horizontal FOV) still holds the disc in frame-left.
    sunAzimuth: 52,
    sunColor: P.sunDawnKey,
    // First light: the key is hot and everything else restrained, so the
    // long shadows it throws at 6° actually read against the lit field —
    // shadow contrast is key/(fill+ambient), not key intensity alone.
    // 4.0, was 5.0: the round-5 pale key carries more luminance per unit,
    // and 5.0 blew the pale stubble to frost-white.
    sunIntensity: 4.0,
    // Fill matches the pale key: a glowGold fill re-oranged every shadow
    // the key missed and erased the hue split all over again.
    fillColor: P.sunDawnKey,
    fillIntensity: 0.45,
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
    // Round-5 keystone: warm key, COOL sky ambient (the fw complementary).
    // A cream/warmGray ambient kept every shadow orange — measured shadow
    // mass H37/S0.73 vs the ref's cool umber H16/S0.48. The vault is
    // slate-lavender at dawn; shadows must breathe it.
    ambientSky: P.mauve,
    ambientGround: P.soilCool,
    ambientIntensity: 0.58,
    ridge: P.ridgeDawn,
    ridgeFar: P.mauve,
    grassHaze: P.grassHazeDawn,
    grassShadow: P.shadowDawn,
    ridgeHazeBoost: 1.0,
    sunGlowMid: P.sunLow,
    exposure: 1.42,
    cloudLit: P.blush,
    cloudShade: P.mauve,
    cloudAmount: 0.42,
    // Round-5 sun response: the field must not wear noon colors with the
    // sun 10 degrees up — stronger, tighter drench wedge + ground bloom.
    // sunLow, not glowGold: the wedge needs a HUE step off the field
    // (glowGold sits at the same H33 as the straw and vanished) — but
    // emberSoft painted a brick-red carpet; sunLow is the sun's own orange.
    groundSunTint: P.sunLow,
    groundSunK: 0.5,
    groundSunEmit: 0.3,
    groundSunNear: 25,
    groundSunFar: 95,
    grassLumCap: 4,
    floraWarm: 1.0,
    floraCool: 0.5,
    landform: P.landDawn,
    groundCoolTint: P.shadowDawn,
    groundCoolK: 0,
  },
  morning: {
    sunElevation: 25,
    sunAzimuth: 120,
    sunColor: P.sunCore,
    sunIntensity: 2.3,
    fillColor: P.sunCore,
    fillIntensity: 0,
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
    ambientIntensity: 0.8,
    ridge: P.slate,
    ridgeFar: P.mauve,
    grassHaze: P.skyMilk,
    grassShadow: P.shadowNeutral,
    ridgeHazeBoost: 1.0,
    sunGlowMid: P.strawPale,
    exposure: 1.1,
    cloudLit: P.cloudWhite,
    cloudShade: P.skyPale,
    cloudAmount: 0.7,
    groundSunTint: P.strawPale,
    groundSunK: 0.15,
    groundSunEmit: 0.04,
    groundSunNear: 20,
    groundSunFar: 80,
    grassLumCap: 4,
    floraWarm: 0.35,
    floraCool: 0.3,
    landform: P.canopyGreen,
    groundCoolTint: P.shadowNeutral,
    groundCoolK: 0,
  },
  noon: {
    // 38, not 52: an October noon sun at prairie latitude rides low — and
    // it is the difference between a foreshortened shadow sliver hiding
    // behind each trunk and a real directional shadow the frame can read.
    sunElevation: 38,
    // 115, not 180: the noon-open camera looks az ~20, and a sun parked at
    // its back drops every shadow BEHIND its own tree (invisible). Coming
    // from the frame's right, shadows rake screen-left ACROSS the view —
    // Firewatch cross-lights its middays for exactly this reason.
    sunAzimuth: 115,
    sunColor: P.sunCore,
    sunIntensity: 2.6,
    fillColor: P.sunCore,
    fillIntensity: 0,
    // Noon commits now: saturated teal zenith over a warmed cream horizon
    // (the round-1 washed skyDeep/skyMilk lerp read as a dead overcast).
    skyTop: P.noonZenith,
    skyMid: P.noonMid,
    skyHorizon: P.noonHorizon,
    hotBand: P.strawPale,
    hotStrength: 0.3,
    sunDisc: P.sunHigh,
    sunGlow: P.skyMilk,
    glowStrength: 0.2,
    fogColor: P.noonHorizon,
    fogDensity: 0.0021,
    ambientSky: P.skyPale,
    ambientGround: P.straw,
    ambientIntensity: 0.55,
    // Teal-shifted hazy ranges (fw-e3-5): darkest nearest, still lighter
    // than foreground shadows.
    ridge: P.ridgeNoon,
    ridgeFar: P.skyPale,
    // Far grass melts toward sunlit straw, not cream — round 2's cream
    // haze bleached the whole midfield white.
    grassHaze: P.straw,
    grassShadow: P.shadowNeutral,
    ridgeHazeBoost: 1.0,
    sunGlowMid: P.skyMilk,
    exposure: 0.9,
    // Near-white lit faces (measured: ref cloud p50 V=0.92, ours 0.78).
    cloudLit: P.cloudBright,
    cloudShade: P.cloudShadeNoon,
    cloudAmount: 1.0,
    groundSunTint: P.noonHorizon,
    groundSunK: 0.08,
    groundSunEmit: 0,
    groundSunNear: 20,
    groundSunFar: 80,
    grassLumCap: 4,
    // Committed noon canopy split (item 7): bright sun-struck top, a
    // distinctly cooler/darker underside mass — flat single-value canopies
    // read as painted rocks under the audit light.
    floraWarm: 0.6,
    floraCool: 0.62,
    landform: P.canopyGreen,
    groundCoolTint: P.shadowNeutral,
    groundCoolK: 0,
  },
  evening: {
    sunElevation: 9,
    sunAzimuth: 260,
    // Warm KEY, not a warm filter: the sun is emberSoft but restrained, and
    // everything it doesn't touch — shadow sides, zenith, fill — pulls
    // violet/blue-grey so warmth reads as light striking surfaces.
    sunColor: P.emberSoft,
    sunIntensity: 4.2,
    fillColor: P.emberSoft,
    fillIntensity: 0.95,
    skyTop: P.eveningZenith,
    skyMid: P.mauve,
    skyHorizon: P.hazeEvening,
    hotBand: P.glowGold,
    hotStrength: 1.0,
    sunDisc: P.sunHigh,
    sunGlow: P.glowGold,
    glowStrength: 0.9,
    fogColor: P.hazeEvening,
    fogDensity: 0.0045,
    // Cool violet fill from the sky vault; the ground bounce is a deep warm
    // SIENNA (item 5: the evening foreground reads as late sun, not the
    // near-black that belongs to lastlight — the value crush is delayed).
    ambientSky: P.mauve,
    ambientGround: P.siennaDusk,
    ambientIntensity: 1.0,
    // Warm near ridge stepping to desaturated blue-violet far — the cool
    // counterweight that keeps golden hour from reading as an orange filter.
    ridge: P.ridgeEvening,
    ridgeFar: P.ridgeDawn,
    grassHaze: P.grassHazeEvening,
    grassShadow: P.shadowEvening,
    ridgeHazeBoost: 1.1,
    sunGlowMid: P.ember,
    exposure: 1.3,
    cloudLit: P.glowGold,
    cloudShade: P.mauve,
    cloudAmount: 0.38,
    groundSunTint: P.sunLow,
    groundSunK: 0.55,
    groundSunEmit: 0.26,
    groundSunNear: 8,
    groundSunFar: 60,
    grassLumCap: 4,
    floraWarm: 0.95,
    floraCool: 0.55,
    landform: P.landEvening,
    // A whisper of the violet vault on the shadow masses keeps golden hour
    // from reading as one red filter.
    groundCoolTint: P.eveningZenith,
    groundCoolK: 0.12,
  },
  lastlight: {
    sunElevation: 2,
    sunAzimuth: 275,
    // Silhouette hour: the ground drops BELOW the horizon glow — dusk
    // ground is darker than dusk sky — and only grass tips keep a warm rim.
    sunColor: P.russet,
    sunIntensity: 1.8,
    // Silhouette hour: barely any fill — the ground must drop BELOW the
    // horizon glow, so nothing lifts it except the warm rim on tips.
    fillColor: P.russet,
    fillIntensity: 0.3,
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
    // Violet sky vault (item 10): the crushed foreground lifts toward deep
    // violet instead of void black, so silhouettes stay readable.
    // Round 5: the ground bounce is VIOLET too — warmGray bounced a warm
    // gray onto the dusk field and produced the measured concrete (ground
    // H357 S0.45 flat V0.20 under a H290 sky). The field is the sky's
    // shadow mass now; only the drench lobe stays warm.
    ambientSky: P.duskViolet,
    ambientGround: P.duskGroundViolet,
    ambientIntensity: 1.7,
    // Near ridge sits at the fog color so the fogged terrain crest melts
    // into it instead of reading as a mismatched lit patch.
    ridge: P.oxblood,
    ridgeFar: P.duskNavy,
    grassHaze: P.grassHazeDusk,
    grassShadow: P.shadowNight,
    // Dusk ranges dissolve high into the afterglow — no flat navy wedge
    // intersecting the sky.
    ridgeHazeBoost: 1.8,
    sunGlowMid: P.russet,
    exposure: 1.15,
    cloudLit: P.duskNavy,
    cloudShade: P.nightNavy,
    cloudAmount: 0.3,
    // Round 5: the warm half of the dusk field — a real orange gradient
    // under the glow (K 0.28 was a whisper; the wedge must READ).
    groundSunTint: P.russet,
    groundSunK: 0.85,
    groundSunEmit: 0.32,
    groundSunNear: 3,
    groundSunFar: 40,
    // The silhouette-hour clamp (item 6): no stubble facet may out-shine
    // the afterglow — the field reads as ONE dim mass so the sky stays the
    // hero. 0.24, was 0.34: the pale tips still glittered like stars.
    grassLumCap: 0.24,
    floraWarm: 0.15,
    floraCool: 0.65,
    landform: P.landDusk,
    // The violet shadow mass itself: unlit ground and grass grade hard
    // toward the sky vault's hue away from the sun lobe.
    groundCoolTint: P.duskGroundViolet,
    groundCoolK: 0.55,
  },
};


/** Quail Fields' primary warm daylight; other properties keep their existing TOD recipes. */
export const QUAIL_DAYLIGHT = {
  sunElevation: 25, sunAzimuth: 118, sunColor: 0xffe8c4, sunIntensity: 3.0,
  fillColor: 0xa9c7d7, fillIntensity: 0.34,
  ambientSky: 0xb4cbd3, ambientGround: 0x777763, ambientIntensity: 0.84,
  skyTop: 0x467b8b, skyMid: 0x99b7bc, skyHorizon: 0xe5d6b8,
  hotBand: 0xf3ddaf, hotStrength: 0.18, fogColor: 0xb4c0b7, fogDensity: 0.0017,
  ridge: 0x405e58, ridgeFar: 0x8eabb5, landform: 0x71846a,
  cloudLit: 0xf4edd9, cloudShade: 0xb4c9d2, cloudAmount: 0.22,
  exposure: 0.98,
} as const;

// Quail has a single lighting recipe shared by the sky and lit presentation
// assets. Golden-hour warmth comes from the key; the fill remains cool so the
// whole landscape does not become an orange filter.
const QUAIL_TOD: Record<TimeOfDay, TodSpec> = {
  morning: { ...TOD.morning, ...QUAIL_DAYLIGHT },
  noon: { ...TOD.noon, ...QUAIL_DAYLIGHT, sunElevation: 38, hotStrength: .12 },
  dawn: { ...TOD.dawn, sunColor: 0xffd4a0, sunIntensity: 2.3,
    fillColor: 0x9aafcb, fillIntensity: .42, ambientSky: 0x9eaec7, ambientGround: 0x675e55, ambientIntensity: .86,
    skyTop: 0x546b86, skyMid: 0xb4abb0, skyHorizon: 0xeac29b,
    fogColor: 0xb6b8b9, fogDensity: .0024, hotStrength: .35, glowStrength: .45,
    ridge: 0x555f71, ridgeFar: 0x9da7b9, cloudLit: 0xf1d1b5, cloudShade: 0x9daaba, cloudAmount: .22, exposure: 1.02 },
  evening: { ...TOD.evening, sunElevation: 12, sunColor: 0xffd1a0, sunIntensity: 2.8,
    fillColor: 0x9aafcf, fillIntensity: .48, ambientSky: 0x9baecb, ambientGround: 0x746654, ambientIntensity: .9,
    skyTop: 0x536e8b, skyMid: 0xb3b2b5, skyHorizon: 0xe8c49e,
    fogColor: 0xb4b8bc, fogDensity: .0021, hotStrength: .40, glowStrength: .46,
    ridge: 0x52616e, ridgeFar: 0x9ba8ba, cloudLit: 0xf1d1ad, cloudShade: 0x94a4bd, cloudAmount: .22,
    grassShadow: 0x748799, floraWarm: .30, floraCool: .40, exposure: 1.0 },
  lastlight: { ...TOD.lastlight, sunColor: 0xf4b891, sunIntensity: 1.1,
    fillColor: 0x8fa5c3, fillIntensity: .30, ambientSky: 0x8c9cb9, ambientGround: 0x55545b, ambientIntensity: .7,
    skyTop: 0x394e6b, skyMid: 0x858caa, skyHorizon: 0xc8a7a0,
    fogColor: 0x929caf, fogDensity: .0027, hotStrength: .25, glowStrength: .32,
    ridge: 0x414e64, ridgeFar: 0x838fa8, cloudLit: 0xcab8b9, cloudShade: 0x75859f, cloudAmount: .22, exposure: 1.06 },
};
export function quailTimeOfDay(tod: TimeOfDay): TodSpec { return QUAIL_TOD[tod]; }

const CHUKAR_TOD = Object.fromEntries((Object.keys(QUAIL_TOD) as TimeOfDay[]).map(tod=>[tod,{
  ...QUAIL_TOD[tod],
  ...(tod==='morning'||tod==='noon'?{
    skyTop:0x416c87,skyMid:0x94b1be,skyHorizon:0xd6d7c8,
    fogColor:0xaab8be,fogDensity:.0012,sunColor:0xffead0,
    sunAzimuth:130,fillIntensity:.28,ambientGround:0x7e766a,ambientIntensity:.76,
    ridge:0x53646f,ridgeFar:0x92a8bb,landform:0x80796b,cloudAmount:.14,
    floraWarm:.24,floraCool:.35,
  }:{fogDensity:.0018}),
}])) as Record<TimeOfDay,TodSpec>;

// Prairie pothole light: a cooler sky and a low, damp horizon keep the
// cattail cover distinct from Quail's dry gold and Chukar's hard desert sun.
const PHEASANT_TOD = Object.fromEntries((Object.keys(TOD) as TimeOfDay[]).map((tod) => [tod, {
  ...TOD[tod],
  ...(tod === 'morning' || tod === 'noon' ? {
    skyTop: 0x4c7180, skyMid: 0x9eb4b7, skyHorizon: 0xd8cfb5,
    fogColor: 0xb4c0bc, fogDensity: tod === 'noon' ? .00155 : .0019,
    sunColor: 0xffe5c0, fillColor: 0xaec7cd, fillIntensity: .39,
    ambientGround: 0x777564, ambientIntensity: .82,
    ridge: 0x53665b, ridgeFar: 0x95a9aa, landform: 0x75816d,
    floraWarm: .25, floraCool: .52, exposure: .97,
  } : tod === 'dawn' || tod === 'evening' ? {
    skyTop: 0x536d82, skyMid: 0xa7afb0, skyHorizon: 0xd7b69b,
    fogColor: 0xa9b2b2, fogDensity: .00225, fillColor: 0x9cb6c9,
    fillIntensity: .48, ambientGround: 0x69645e, ambientIntensity: .84,
    floraWarm: .23, floraCool: .55, exposure: 1.01,
  } : {
    skyTop: 0x3b536b, skyMid: 0x7d8e9f, skyHorizon: 0xbca39d,
    fogColor: 0x919ca2, fogDensity: .00255, ambientGround: 0x55575b,
    floraWarm: .13, floraCool: .7, exposure: 1.04,
  }),
}])) as Record<TimeOfDay, TodSpec>;

/**
 * Secondary properties share the same five sun positions, but their air and
 * fill should still describe the species' country. These are deliberately
 * small patches over the locked TOD palette: the renderer keeps one light
 * path and one performance budget while each map gets a recognizable sky,
 * horizon, and shadow balance.
 */
function patchedTod(patches: Partial<Record<TimeOfDay, Partial<TodSpec>>>): Record<TimeOfDay, TodSpec> {
  return (Object.keys(TOD) as TimeOfDay[]).reduce((result, tod) => {
    result[tod] = { ...TOD[tod], ...(patches[tod] ?? {}) };
    return result;
  }, {} as Record<TimeOfDay, TodSpec>);
}

// The open prairie is broad and wind-polished: cool air keeps the long view
// silver while the low horizon retains the straw field under it.
const SHARPTAIL_TOD = patchedTod({
  morning: { skyTop: 0x547b8c, skyMid: 0xaabcc0, skyHorizon: 0xe0d4b8, fogColor: 0xb8c2bd, fogDensity: .0017, sunAzimuth: 132, fillColor: 0xaec6cf, fillIntensity: .28, ambientGround: 0x77745f, ambientIntensity: .72, ridge: 0x566b6b, ridgeFar: 0x9cb4bd, landform: 0x7a896f, floraWarm: .28, floraCool: .42, exposure: 1.0 },
  noon: { skyTop: 0x4a7890, skyMid: 0x91b8c2, skyHorizon: 0xe3d8bd, fogColor: 0xb2c1bd, fogDensity: .00145, sunAzimuth: 128, fillColor: 0xa9c6d0, fillIntensity: .18, ambientGround: 0x77745d, ambientIntensity: .58, ridge: 0x50808a, ridgeFar: 0x9fb9c2, landform: 0x73876f, floraWarm: .42, floraCool: .48, exposure: .94 },
  evening: { skyTop: 0x536b83, skyMid: 0xb1b2ad, skyHorizon: 0xe5c49e, fogColor: 0xb5bbb8, fogDensity: .0022, fillColor: 0x9fb9ca, fillIntensity: .5, ambientGround: 0x706454, ambientIntensity: .9, ridge: 0x5d626b, ridgeFar: 0x9ca8b9, floraWarm: .34, floraCool: .46, exposure: 1.03 },
});

// Timber and wet bottoms are overcast country: blue-green fill preserves
// trunks and alder against the mist instead of painting them orange.
const GROUSE_WOODS_TOD = patchedTod({
  morning: { skyTop: 0x496878, skyMid: 0x9db4b1, skyHorizon: 0xcbd0bd, fogColor: 0xaab9b4, fogDensity: .0031, sunAzimuth: 112, sunIntensity: 1.95, fillColor: 0x9eb9bd, fillIntensity: .48, ambientSky: 0x93adae, ambientGround: 0x586653, ambientIntensity: .92, ridge: 0x405b56, ridgeFar: 0x8aa69f, landform: 0x5f735e, floraWarm: .18, floraCool: .56, exposure: 1.02 },
  noon: { skyTop: 0x456879, skyMid: 0x8daaae, skyHorizon: 0xc7ccb9, fogColor: 0xa8b8b3, fogDensity: .0027, sunAzimuth: 118, sunIntensity: 2.15, fillColor: 0x9bb8ba, fillIntensity: .36, ambientSky: 0x91a9ab, ambientGround: 0x52634f, ambientIntensity: .82, ridge: 0x3f5d58, ridgeFar: 0x88a49e, landform: 0x5a705a, floraWarm: .24, floraCool: .58, exposure: .97 },
  evening: { skyTop: 0x4c5c73, skyMid: 0x8e9aa3, skyHorizon: 0xc1b4a3, fogColor: 0x939f9d, fogDensity: .0049, fillColor: 0x889fb7, fillIntensity: .86, ambientSky: 0x7e91a0, ambientGround: 0x4d534b, ambientIntensity: 1.02, ridge: 0x3e4b50, ridgeFar: 0x788c9a, landform: 0x4c5e54, floraWarm: .16, floraCool: .66, exposure: 1.16 },
  lastlight: { skyTop: 0x293d56, skyMid: 0x69788e, skyHorizon: 0x9f8f8a, fogColor: 0x78838c, fogDensity: .0067, ambientSky: 0x687b93, ambientGround: 0x3f4650, ambientIntensity: 1.6, ridge: 0x303d4b, ridgeFar: 0x63748a, landform: 0x37414a, floraWarm: .1, floraCool: .72, exposure: 1.1 },
});
const WOODCOCK_BOTTOMS_TOD = patchedTod({
  morning: { skyTop: 0x506d79, skyMid: 0xa3b8ae, skyHorizon: 0xc8cdb9, fogColor: 0xaab9ae, fogDensity: .0038, sunAzimuth: 105, sunIntensity: 1.8, fillColor: 0xa5c0bf, fillIntensity: .55, ambientSky: 0x9bb3ac, ambientGround: 0x526453, ambientIntensity: .98, ridge: 0x526960, ridgeFar: 0x8ea69b, landform: 0x64765d, floraWarm: .16, floraCool: .6, exposure: 1.03 },
  noon: { skyTop: 0x4f7180, skyMid: 0x93b4b2, skyHorizon: 0xd0cdb8, fogColor: 0xa5b8b0, fogDensity: .0032, sunAzimuth: 110, sunIntensity: 2.05, fillColor: 0xa5bec0, fillIntensity: .42, ambientSky: 0x94afa9, ambientGround: 0x506453, ambientIntensity: .88, ridge: 0x4e6a63, ridgeFar: 0x8ba9a0, landform: 0x5f765f, floraWarm: .2, floraCool: .6, exposure: .98 },
  evening: { skyTop: 0x536879, skyMid: 0x9ba49f, skyHorizon: 0xc8b09a, fogColor: 0x989f9a, fogDensity: .0052, fillColor: 0x8ea9ba, fillIntensity: .92, ambientSky: 0x859ba4, ambientGround: 0x4f554c, ambientIntensity: 1.08, ridge: 0x4a5859, ridgeFar: 0x7b9096, landform: 0x505c52, floraWarm: .18, floraCool: .67, exposure: 1.18 },
});

// The basin bench is clear and hard-edged; dry air gives the rock a crisp
// value step while the sage stays just cool enough to separate from dust.
const HUN_BENCHES_TOD = patchedTod({
  morning: { skyTop: 0x5d7d95, skyMid: 0xa9bac0, skyHorizon: 0xe0d2b4, fogColor: 0xb4bfc0, fogDensity: .00125, sunAzimuth: 122, sunIntensity: 2.55, fillColor: 0xa9c0c6, fillIntensity: .18, ambientGround: 0x79705f, ambientIntensity: .68, ridge: 0x5b6263, ridgeFar: 0x9aaeb7, landform: 0x817967, floraWarm: .38, floraCool: .36, exposure: .98 },
  noon: { skyTop: 0x4e7890, skyMid: 0x8eafbd, skyHorizon: 0xe5d8bf, fogColor: 0xb1bec0, fogDensity: .001, sunAzimuth: 126, sunIntensity: 2.9, fillColor: 0xaac0c8, fillIntensity: .12, ambientGround: 0x796f5b, ambientIntensity: .5, ridge: 0x5a7d84, ridgeFar: 0x9db6be, landform: 0x827b68, floraWarm: .5, floraCool: .4, exposure: .9 },
  evening: { skyTop: 0x596f84, skyMid: 0xb0aaa0, skyHorizon: 0xe4bd93, fogColor: 0xb7b7b0, fogDensity: .0019, fillColor: 0x9fb8c8, fillIntensity: .5, ambientGround: 0x706050, ambientIntensity: .9, ridge: 0x705d53, ridgeFar: 0x9ba8b0, floraWarm: .44, floraCool: .42, exposure: 1.08 },
});

// Desert washes get a dry, pale horizon and a restrained amber key. The
// shade stays blue enough to make water pockets and dog cover readable.
const DESERT_WASHES_TOD = patchedTod({
  morning: { skyTop: 0x65798d, skyMid: 0xb6b7ab, skyHorizon: 0xe1c18f, fogColor: 0xc0b59a, fogDensity: .0013, sunAzimuth: 138, sunIntensity: 2.75, fillColor: 0xb4c0bd, fillIntensity: .24, ambientGround: 0x77694e, ambientIntensity: .72, ridge: 0x756859, ridgeFar: 0xa9a99c, landform: 0x8d775a, floraWarm: .58, floraCool: .38, exposure: .98 },
  noon: { skyTop: 0x587c91, skyMid: 0x9eb9bd, skyHorizon: 0xe7c996, fogColor: 0xc0b79e, fogDensity: .001, sunAzimuth: 142, sunIntensity: 3.1, fillColor: 0xb4c5c4, fillIntensity: .14, ambientGround: 0x806f51, ambientIntensity: .5, ridge: 0x667b7a, ridgeFar: 0xa8b6ae, landform: 0x92785a, floraWarm: .7, floraCool: .36, exposure: .9 },
  evening: { skyTop: 0x685c73, skyMid: 0xb6a39b, skyHorizon: 0xe8b37f, fogColor: 0xc1a795, fogDensity: .0022, fillColor: 0x9dacbd, fillIntensity: .56, ambientGround: 0x705746, ambientIntensity: .9, ridge: 0x815041, ridgeFar: 0x9fa0aa, landform: 0x8e5f46, floraWarm: .72, floraCool: .42, exposure: 1.08 },
  lastlight: { skyTop: 0x343b5b, skyMid: 0x7f7285, skyHorizon: 0xc1836f, fogColor: 0x9b817d, fogDensity: .0049, ambientSky: 0x786d8e, ambientGround: 0x51414e, ambientIntensity: 1.45, ridge: 0x593b42, ridgeFar: 0x76798f, landform: 0x563e43, floraWarm: .3, floraCool: .68, exposure: 1.12 },
});

const MEARNS_CANYONS_TOD = patchedTod({
  morning: { skyTop: 0x536e7d, skyMid: 0xaab3aa, skyHorizon: 0xd9bd9c, fogColor: 0xb9afa0, fogDensity: .002, sunAzimuth: 120, sunIntensity: 2.35, fillColor: 0xa4b7bb, fillIntensity: .3, ambientGround: 0x66584b, ambientIntensity: .78, ridge: 0x6f5045, ridgeFar: 0x9ca29b, landform: 0x895c47, floraWarm: .42, floraCool: .48, exposure: .99 },
  noon: { skyTop: 0x4f7180, skyMid: 0x91b0b3, skyHorizon: 0xe0c49d, fogColor: 0xb8afa0, fogDensity: .00165, sunAzimuth: 124, sunIntensity: 2.8, fillColor: 0xa7bcc0, fillIntensity: .2, ambientGround: 0x675848, ambientIntensity: .6, ridge: 0x765347, ridgeFar: 0xa3aca8, landform: 0x95614b, floraWarm: .56, floraCool: .48, exposure: .92 },
  evening: { skyTop: 0x625b73, skyMid: 0xb19e9b, skyHorizon: 0xe5b180, fogColor: 0xb99d93, fogDensity: .0028, fillColor: 0x9eabbc, fillIntensity: .7, ambientGround: 0x604b43, ambientIntensity: .94, ridge: 0x814b3e, ridgeFar: 0x938596, landform: 0x7a4a40, floraWarm: .68, floraCool: .48, exposure: 1.12 },
  lastlight: { skyTop: 0x362e51, skyMid: 0x75627b, skyHorizon: 0xb9746d, fogColor: 0x8e747d, fogDensity: .0058, ambientSky: 0x756684, ambientGround: 0x4f3948, ambientIntensity: 1.58, ridge: 0x4c3042, ridgeFar: 0x6e7187, landform: 0x4a3342, floraWarm: .25, floraCool: .7, exposure: 1.16 },
});

const TIMBERLINE_PARKS_TOD = patchedTod({
  morning: { skyTop: 0x4d7082, skyMid: 0xa9bec1, skyHorizon: 0xd7d5c6, fogColor: 0xb0bec0, fogDensity: .0018, sunAzimuth: 112, sunIntensity: 2.2, fillColor: 0xaec6cb, fillIntensity: .32, ambientGround: 0x626e67, ambientIntensity: .78, ridge: 0x4c6665, ridgeFar: 0x93aeb5, landform: 0x6f8177, floraWarm: .3, floraCool: .5, exposure: .98 },
  noon: { skyTop: 0x47748c, skyMid: 0x8faeba, skyHorizon: 0xdedbc9, fogColor: 0xaebdc1, fogDensity: .00145, sunAzimuth: 118, sunIntensity: 2.55, fillColor: 0xaac4cc, fillIntensity: .2, ambientGround: 0x626d67, ambientIntensity: .62, ridge: 0x4a7077, ridgeFar: 0x9bb6bf, landform: 0x73867b, floraWarm: .4, floraCool: .52, exposure: .91 },
  evening: { skyTop: 0x4f6078, skyMid: 0x9fa3a5, skyHorizon: 0xd6b99b, fogColor: 0xa6a7a6, fogDensity: .0024, fillColor: 0x99afc1, fillIntensity: .58, ambientGround: 0x5e5b56, ambientIntensity: .96, ridge: 0x5d5757, ridgeFar: 0x8d9ca7, landform: 0x665e5a, floraWarm: .34, floraCool: .6, exposure: 1.08 },
  lastlight: { skyTop: 0x283c58, skyMid: 0x697992, skyHorizon: 0x9b8e8d, fogColor: 0x7c8790, fogDensity: .0058, ambientSky: 0x6a7e98, ambientGround: 0x424b55, ambientIntensity: 1.65, ridge: 0x2e3d4c, ridgeFar: 0x63758c, landform: 0x39444d, floraWarm: .1, floraCool: .74, exposure: 1.08 },
});

const VALLEY_OAKS_TOD = patchedTod({
  morning: { skyTop: 0x5b7c87, skyMid: 0xb6b8a9, skyHorizon: 0xe3cfaa, fogColor: 0xc2b99f, fogDensity: .0016, sunAzimuth: 126, sunIntensity: 2.65, fillColor: 0xb5c2bf, fillIntensity: .2, ambientGround: 0x766a4c, ambientIntensity: .72, ridge: 0x68705d, ridgeFar: 0xa9b0a6, landform: 0x7e805a, floraWarm: .56, floraCool: .38, exposure: .99 },
  noon: { skyTop: 0x508093, skyMid: 0x9fbcc0, skyHorizon: 0xe6d1a7, fogColor: 0xbebaa2, fogDensity: .0013, sunAzimuth: 130, sunIntensity: 2.95, fillColor: 0xb1c5c4, fillIntensity: .14, ambientGround: 0x796a4b, ambientIntensity: .54, ridge: 0x5c7a7a, ridgeFar: 0xa5b9b5, landform: 0x7d855a, floraWarm: .68, floraCool: .38, exposure: .91 },
  evening: { skyTop: 0x665c76, skyMid: 0xb7a29b, skyHorizon: 0xe7b984, fogColor: 0xc0a792, fogDensity: .0021, fillColor: 0x9eacc1, fillIntensity: .62, ambientGround: 0x705747, ambientIntensity: .95, ridge: 0x815242, ridgeFar: 0x9b94a4, landform: 0x865a43, floraWarm: .76, floraCool: .42, exposure: 1.12 },
  lastlight: { skyTop: 0x3d3156, skyMid: 0x7c6680, skyHorizon: 0xbd7b70, fogColor: 0x987b7a, fogDensity: .0052, ambientSky: 0x796887, ambientGround: 0x513f49, ambientIntensity: 1.5, ridge: 0x55343e, ridgeFar: 0x72738b, landform: 0x503940, floraWarm: .28, floraCool: .7, exposure: 1.14 },
});

const AREA_TOD: Readonly<Record<string, Record<TimeOfDay, TodSpec>>> = {
  'sharptail-prairie': SHARPTAIL_TOD,
  'grouse-woods': GROUSE_WOODS_TOD,
  'woodcock-bottoms': WOODCOCK_BOTTOMS_TOD,
  'hun-benches': HUN_BENCHES_TOD,
  'desert-washes': DESERT_WASHES_TOD,
  'mearns-canyons': MEARNS_CANYONS_TOD,
  'timberline-parks': TIMBERLINE_PARKS_TOD,
  'valley-oaks': VALLEY_OAKS_TOD,
};

export function fieldTimeOfDay(areaId:string,tod:TimeOfDay):TodSpec {
  return areaId==='quail-fields' ? QUAIL_TOD[tod]
    : areaId==='chukar-ridge' ? CHUKAR_TOD[tod]
      : areaId==='pheasant-coverts' ? PHEASANT_TOD[tod]
        : AREA_TOD[areaId]?.[tod] ?? TOD[tod];
}
