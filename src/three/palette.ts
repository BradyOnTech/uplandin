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
