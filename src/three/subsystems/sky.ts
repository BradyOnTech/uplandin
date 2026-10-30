import * as THREE from 'three';
import type { LandscapeModel } from '../../game/landscape';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { fieldTimeOfDay, type TimeOfDay } from '../palette';
import { gradeUniforms } from '../grade';
import { ATMOSPHERE_GLSL, atmosphereUniforms, poolFloor, regionAtmosphere, writeAtmosphere } from '../atmosphere';
import { buildHorizon, horizonLand, TERRAIN_APRON_M, type Horizon, type HorizonLand } from '../horizon';
import { buildFarTerrain, type FarTerrain } from '../farTerrain';
import { bakeSkyOcclusion, setSkyMap, skyOcclusionTexture, writeGroundLight, type SkyOcclusion } from '../groundLight';
import { VegetationWind } from './vegetationWind';
import type { Condition } from '../../game/conditions';
import type { Month } from '../../game/season';
import type { WindStrength } from '../../game/wind';
import { AUTHORED_WIND, seasonLook, weatherLook, weatherSpec, writeFieldConditions } from '../fieldConditions';
import { createWeatherParticles, type WeatherParticles } from '../weatherParticles';
import { snapShadowTarget } from '../shadowPlacement';
import { createSharptailCloudAtlas, SHARPTAIL_CLOUD_ATLAS_GLSL } from './sharptailCloudAtlas';

/*
 * SKY subsystem: graded dome, sun disc + glow, layered distant ridges,
 * hemisphere ambient, fog, and per-time-of-day exposure — all keyed off
 * the TOD presets in palette.ts.
 *
 * Firewatch's sky is not a two-color lerp: it's a hot narrow band at the
 * horizon (hugging the sun's azimuth) that cools upward through three
 * stops, with 2-3 ridge silhouettes flattening toward the fog color with
 * distance. This dome shader + three unlit ring meshes do exactly that,
 * cheap enough for the 'lite' tier (no post chain, one draw each).
 */

const VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position; // dome is camera-centered and unrotated: model space = view dir
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uHot;
uniform float uHotStrength;
uniform vec3 uBelow;
uniform vec3 uSunDir;
uniform vec3 uSunDisc;
uniform vec3 uGlow;
uniform vec3 uGlowMid;
uniform float uGlowStrength;
uniform vec2 uDiscCos; // x: outer cos (soft edge start), y: inner cos (full disc)
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uCloudAmt;
uniform float uQuail;
uniform float uPheasant;
uniform float uChukar;
uniform float uSharptail;
uniform float uOvercast;
uniform vec3 uDeck;
varying vec3 vPos;
${ATMOSPHERE_GLSL}

/*
 * Flat cumulus: ONE authored cumulus silhouette (lumpy towers over a flat
 * base), instanced three times with different center/scale/mirror. Local
 * coordinates are true-angle (azimuth scaled by cos of elevation) so the
 * shapes never bend into hooks near the zenith. A tight smoothstep on the
 * field gives the Firewatch paper-cut edge; a second sample at a raised
 * elevation shades the underside flat.
 */
float puff(vec2 o, vec2 c, vec2 r) {
  vec2 d = (o - c) / r;
  return exp(-dot(d, d));
}

float cumulus(vec2 o) {
  float f = puff(o, vec2(0.0, 0.02), vec2(0.20, 0.062));  // main body
  f += puff(o, vec2(-0.13, 0.05), vec2(0.10, 0.052));     // left tower
  f += puff(o, vec2(0.08, 0.085), vec2(0.085, 0.058));    // tall tower
  f += puff(o, vec2(0.21, 0.005), vec2(0.10, 0.038));     // right shoulder
  f += puff(o, vec2(-0.26, -0.01), vec2(0.085, 0.032));   // trailing scrap
  // Flat cumulus base: cut everything below the baseline.
  f *= smoothstep(-0.045, -0.012, o.y);
  return f;
}

// Broad wind-shaped layers for the plains. Unequal shoulders and a broken
// trailing edge avoid repeating the same small cumulus icon around the dome.
float prairieBank(vec2 o) {
  o.y += o.x * 0.022;
  o.y += sin(o.x * 22.0) * 0.005 + sin(o.x * 49.0) * 0.002;
  float f = puff(o, vec2(-0.05, 0.0), vec2(0.31, 0.028));
  f += puff(o, vec2(-0.26, 0.019), vec2(0.20, 0.037)) * 0.85;
  f += puff(o, vec2(0.22, 0.007), vec2(0.24, 0.023)) * 0.72;
  f += puff(o, vec2(0.53, -0.023), vec2(0.23, 0.012)) * 0.6;
  return f;
}

/** True-angle local offset from a mass center (az, sinEl), incl. mirror/scale. */
vec2 cloudLocal(vec2 ae, vec2 c, vec2 ms) {
  float dx = atan(sin(ae.x - c.x), cos(ae.x - c.x));
  dx *= sqrt(max(1.0 - ae.y * ae.y, 0.0)); // cos(elevation): no zenith bend
  return vec2(dx, ae.y - c.y) * ms;        // ms: (mirror/scale, 1/scale)
}

${SHARPTAIL_CLOUD_ATLAS_GLSL}

float cloudField(vec2 ae) {
  if (uSharptail > 0.5) {
    // Nonblocking fallback while the painted atlas loads, or if it fails.
    float f = prairieBank(cloudLocal(ae, vec2(-2.55, .25), vec2(1.10, 2.25)));
    f = max(f, prairieBank(cloudLocal(ae, vec2(.75, .22), vec2(-.9, 2.15))));
    f = max(f, prairieBank(cloudLocal(ae, vec2(2.35, .12), vec2(1.55, 2.7))));
    return f;
  }
  if (uChukar > 0.5) {
    // Thin wind-shaped banks leave the open ridge skyline readable.
    float f=prairieBank(cloudLocal(ae,vec2(-1.45,.37),vec2(1.05,2.4)));
    f=max(f,prairieBank(cloudLocal(ae,vec2(2.1,.29),vec2(-1.3,2.9))));
    f=max(f,prairieBank(cloudLocal(ae,vec2(.42,.19),vec2(1.8,3.3))));
    return f;
  }
  if (uPheasant > 0.5) {
    // Long, separated autumn banks leave open flight corridors between
    // layers instead of repeating the same outlined cumulus silhouette.
    float f = prairieBank(cloudLocal(ae, vec2(-2.35, 0.20), vec2(0.95, 1.2)));
    f = max(f, prairieBank(cloudLocal(ae, vec2(1.25, 0.30), vec2(-1.35, 1.6))));
    f = max(f, prairieBank(cloudLocal(ae, vec2(-0.45, 0.12), vec2(1.65, 2.2))));
    f = max(f, prairieBank(cloudLocal(ae, vec2(2.85, 0.09), vec2(-1.5, 2.7))));
    return f;
  }
  if (uQuail > 0.5) {
    // Southern Plains cloud decks: uneven rising shoulders break into a
    // long trailing bank. Two composite groups stay below the old five-bank
    // sampling cost and avoid a lone, rounded cloud-icon silhouette.
    vec2 a = cloudLocal(ae, vec2(-2.55, .27), vec2(1.0, 1.1));
    vec2 b = cloudLocal(ae, vec2(1.94, .24), vec2(-1.2, 1.35));
    float f = prairieBank(a) + .36 * cumulus(a * vec2(1.55, 1.9));
    f = max(f, prairieBank(b) + .32 * cumulus(b * vec2(1.7, 2.1)));
    return f;
  }

  // Mass A — big anvil ahead of the noon-open camera (az ~5 deg, high —
  // kept clear of the dawn-into-sun frame corner at az ~45-55 deg).
  float f = cumulus(cloudLocal(ae, vec2(0.08, 0.30), vec2(1.0, 1.0)));
  // Mass B — lower bank to the west (evening frame's right third), mirrored.
  // Frame-PoC restyle: masses B–E widened ~1.5x (lower 1/scale) so the deck
  // reads as broad soft plates, not scattered worms. Threshold below rose to
  // compensate, holding total coverage roughly constant.
  f = max(f, cumulus(cloudLocal(ae, vec2(-1.05, 0.17), vec2(-1.0, 1.0)) ));
  // Mass C — small scrap near the dawn sun corridor.
  f = max(f, cumulus(cloudLocal(ae, vec2(1.45, 0.13), vec2(1.9, 1.4))));
  // Masses D/E — low distant scraps: the noon frame reads 2-3 masses at
  // different heights, which is what sells the sky's depth.
  f = max(f, cumulus(cloudLocal(ae, vec2(0.82, 0.105), vec2(2.6, 1.9))));
  f = max(f, cumulus(cloudLocal(ae, vec2(-0.18, 0.145), vec2(-2.2, 1.6))));
  return f;
}

void main() {
  vec3 dir = normalize(vPos);
  float h = dir.y;
  float hc = max(h, 0.0);

  // Three-stop gradient: horizon -> mid -> top, cooling upward.
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, hc));
  col = mix(col, uTop, smoothstep(0.12, 0.48, hc));

  // Hot horizon band, focused toward the sun's azimuth.
  vec2 sunFlat = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  vec2 dirFlat = normalize(dir.xz + vec2(1e-5, 0.0));
  float az = max(dot(dirFlat, sunFlat), 0.0);
  float azFocus = 0.15 + 0.85 * az * az;
  // Damp the band below the horizon: it must not paint the terrain-to-ridge
  // gap bright gold (the 1px sparkle seam and "bare lit strip" tells).
  float band = exp(-hc * 16.0) * uHotStrength * azFocus;
  band *= 1.0 - smoothstep(0.0, 0.025, -h);
  col = mix(col, uHot, clamp(band, 0.0, 0.85));

  // Three-stop bloom halo around the sun — wide pale-gold ambience, a
  // warm orange mid halo, then a hot bloom hugging the disc — so the sun
  // bleeds into the sky like a light source, not a pasted white dot.
  float d = max(dot(dir, uSunDir), 0.0);
  float g1 = pow(d, 7.0) * uGlowStrength;
  col = mix(col, uGlow, clamp(g1 * 0.7, 0.0, 0.8));

  // Flat cumulus ride above the wide glow but under the hot core + disc,
  // so a low sun still burns through them instead of being pasted over.
  vec2 ae = vec2(atan(dir.x, dir.z), h);
  bool paintedPrairie = uSharptail > .5 && uSharptailCloudReady > .5;
  vec4 prairieCloud = vec4(0.0);
  float cf = 0.0;
  if (paintedPrairie) prairieCloud = sharptailPaintedCloud(ae);
  else cf = cloudField(ae);
  float layered = max(max(uQuail, uPheasant), max(uChukar, uSharptail));
  // Painted bodies need readable volume; the thin procedural bank amount
  // would make the whole illustration translucent. Keep fractional edges.
  float cloudOpacity = paintedPrairie ? clamp(.76 + uCloudAmt * .7, .85, .95) : uCloudAmt;
  float cm = (paintedPrairie ? prairieCloud.a : smoothstep(mix(0.55, 0.45, layered), mix(0.60, 0.58, layered), cf))
    * cloudOpacity * smoothstep(0.05, 0.10, h);
  // Flat painted plates (round 5): fw-e3-5's cumulus is 2-3 VALUE STEPS
  // with hard undersides — not an airbrushed gradient (measured: our cloud
  // interior ramped 0.69->0.87 with 13% banding edges; the ref holds ~3
  // flat plates at 0.85/0.92/1.0). Quantize the thickness-above field into
  // a lit face, a mid plate, and a shaded belly; smoothsteps kept tight so
  // edges are anti-aliased, never gradients.
  float cAboveRaw = 0.0;
  if (!paintedPrairie) cAboveRaw = cloudField(ae + vec2(0.0, mix(0.055, 0.016, layered)));
  float plateMid = smoothstep(0.32, 0.38, cAboveRaw);
  float plateDeep = smoothstep(0.60, 0.66, cAboveRaw);
  // Round 6 (item 4): the underside shade answers the SUN'S HEIGHT. At the
  // golden hours a near-horizontal key side-lights the deck — crowns burn
  // warm while bellies drop further and pull cool toward the vault; at
  // noon the bellies stay the flat neutral gray plate. cLow=0 reproduces
  // the round-5 noon look exactly.
  float cLow = 1.0 - smoothstep(0.08, 0.45, uSunDir.y);
  vec3 cShade = uCloudShade * mix(vec3(1.0), vec3(0.72, 0.76, 0.98), cLow);
  // Lit faces ride ABOVE 1.0 pre-tonemap so ACES blows them toward the
  // reference's paper-white crowns (measured ref p50 V=1.0, ours 0.84).
  vec3 cCol = mix(uCloudLit * mix(1.28, 1.36, cLow), mix(uCloudLit, cShade, mix(0.45, 0.68, cLow)), plateMid);
  cCol = mix(cCol, cShade, plateDeep);
  if (layered > 0.5) {
    // Restrained tonal relief: thin trailing pieces borrow the sky color,
    // while the thicker middle carries one cool underside and warm crown.
    float belly = smoothstep(0.35, 1.35, cAboveRaw);
    cCol = mix(uCloudLit * 1.12, mix(uCloudLit, cShade, 0.55), belly);
  }
  if (paintedPrairie) {
    // The atlas supplies painted form, not a fixed noon light. Its linear
    // value maps into the same TOD cream and cool-shadow palette as the sky.
    // Using value also prevents colored RGB under wispy alpha from tinting
    // the cloud edge. Alpha is sampled once and remains fractional.
    float paintLight = clamp((dot(prairieCloud.rgb, vec3(.2126, .7152, .0722)) - .10) / .72, 0.0, 1.0);
    cCol = mix(cShade, uCloudLit * 1.12, paintLight);
  }
  col = mix(col, cCol, cm);

  float g2 = pow(d, 42.0) * uGlowStrength;
  col = mix(col, uGlowMid, clamp(g2 * 0.85, 0.0, 0.85));
  float g3 = pow(d, 220.0) * uGlowStrength;
  col = mix(col, uSunDisc, clamp(g3, 0.0, 0.95));

  // A rain or snow day draws a low grey deck over all of it, lighter at the
  // horizon, with a faint bright patch where the sun hides.
  vec3 deck = mix(uDeck * 1.1, uDeck * .84, smoothstep(0.0, .55, hc)) + uGlow * pow(d, 6.0) * .06;
  col = mix(col, deck, uOvercast);

  // Below the horizon, settle to the fog color (ground haze, soft seam) —
  // fast, so any sliver between terrain rim and ridge cards reads as haze.
  // The same sky-driven tint the field's fog takes (atmosphere.ts).
  col = mix(col, uplandFogTint(uBelow, dir), smoothstep(0.0, 0.05, -h));

  // Sun disc with a soft edge; it may set into the haze but not below it.
  float disc = smoothstep(uDiscCos.x, uDiscCos.y, d) * smoothstep(-0.035, -0.005, h) * (1.0 - uOvercast);
  col = mix(col, uSunDisc, disc);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  // Dither after tone map + encode so the 8-bit gradient never bands.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor.rgb += (n - 0.5) * (1.5 / 255.0);
}
`;

/*
 * Ridge card material: flat silhouette color plus a light-spill lobe toward
 * the sun's azimuth, so the shoulders flanking the sun notch catch the glow
 * (Firewatch's sunset frames always light the ridge nearest the sun).
 */
const RIDGE_VERT = /* glsl */ `
attribute float aHaze;
attribute float aBase;
varying vec2 vDirXZ;
varying float vY;
varying float vHaze;
varying float vBase;
void main() {
  vDirXZ = position.xz; // ring is camera-centered: model xz = azimuth dir
  vY = position.y;
  vHaze = aHaze;
  vBase = aBase;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/*
 * Horizon haze lives HERE, not in sheet geometry: an exponential height
 * falloff blends the ridge color toward the sky/haze color, so ridge bases
 * melt into the horizon with no edge anywhere. Crests keep their color.
 */
const RIDGE_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform vec3 uSpill;
uniform float uSpillStrength;
uniform vec2 uSunXZ;
uniform vec3 uHaze;
uniform float uHazeK;
uniform float uHazeAmt;
varying vec2 vDirXZ;
varying float vY;
varying float vHaze;
varying float vBase;
${ATMOSPHERE_GLSL}
void main() {
  float az = max(dot(normalize(vDirXZ), uSunXZ), 0.0);
  float spill = pow(az, 9.0) * uSpillStrength;
  vec3 col = mix(uCol, uSpill, clamp(spill, 0.0, 0.6));
  // Haze absorption (round 5): tree-serration columns carry aHaze, CONFINED
  // above the tree-base line aBase — the sawtooth dissolves partway into
  // atmosphere without smearing pale stripes down the whole card.
  float tHaze = vHaze * smoothstep(vBase, vBase + 1.2, vY);
  float haze = exp(-max(vY, 0.0) * uHazeK) * uHazeAmt + tHaze;
  col = mix(col, uplandFogTint(uHaze, vec3(vDirXZ.x, 0.0, vDirXZ.y)), clamp(haze, 0.0, 0.95));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Ridge silhouette layers: radius, base height, amplitude, plus the aerial
 * perspective recipe — `far` steps the color from the TOD's near `ridge`
 * toward its cool `ridgeFar`, then `fogMix` pulls gently toward the haze.
 * Monotonic recession: nearest darkest, every step lighter AND cooler.
 */
const RIDGE_LAYERS: ReadonlyArray<{
  radius: number;
  base: number;
  amp: number;
  far: number;
  fogMix: number;
  /** In-shader haze: strength at the base and how fast it decays upward. */
  hazeAmt: number;
  /** Weight of the ridged-noise crease term (sharp crests/saddles). */
  jag: number;
  /** Octave frequencies — different per layer so bands never run parallel. */
  freqs: readonly [number, number, number];
  /** Scale on the connective noise: authored features must not drown in
   *  octave soup, so layers carrying named landmarks damp the noise. */
  noiseScale: number;
  /** Mid-ground landform ring: colored from TOD.landform (not the ridge
   *  ramp) and pre-fogged to its radius — the THIRD depth plane. */
  land?: boolean;
  /** Conifer serration height in meters (0/undefined = no treeline). */
  trees?: number;
  /** How far the serration dissolves into haze (aHaze on tree verts). */
  treeHaze?: number;
}> = [
  // THE BENCH (round 5): a low mid-ground landform ring between the fence
  // line and the hills — treeline wedges rise only where features are
  // authored, so each hero frame reads one mass, not a moat.
  // base sits BELOW the plain: only the authored features surface, as
  // isolated masses — a 360-degree bench read as a pale moat wall.
  { radius: 235, base: -7, amp: 15, far: 0, fogMix: 0, hazeAmt: 0.32, jag: 0.06, freqs: [4, 9, 21], noiseScale: 0.5, land: true, trees: 3.0, treeHaze: 0.25 },
  { radius: 300, base: 11, amp: 20, far: 0.0, fogMix: 0.08, hazeAmt: 0.55, jag: 0.05, freqs: [3, 8, 19], noiseScale: 1.0, trees: 3.4, treeHaze: 0.4 },
  { radius: 430, base: 14, amp: 32, far: 0.55, fogMix: 0.16, hazeAmt: 0.75, jag: 0.18, freqs: [4, 10, 23], noiseScale: 0.72 },
  // far stops short of 1.0 so THE PEAK keeps a hint of its own hue against
  // the sky at noon instead of dissolving into ridgeFar completely.
  // far/fogMix restrained: THE PEAK needs committed value against the sky
  // (fw-e3-2 keeps its far ranges violet, not vapor).
  { radius: 600, base: 20, amp: 48, far: 0.42, fogMix: 0.12, hazeAmt: 0.92, jag: 0.35, freqs: [5, 12, 29], noiseScale: 0.5 },
];

/**
 * Named skyline features — authored, not rolled. World azimuth in degrees
 * (0 = +z); a feature at azimuth F in a frame whose view azimuth is V sits
 * (V - F) degrees screen-RIGHT of center. Hero view azimuths: dawn-field 0,
 * noon-open +20, dawn-ridge -30, dawn-into-sun +85, evening-field -95,
 * lastlight -90. `h` is a multiple of the layer's amp; negative h cuts a
 * notch. `sl`/`sr` are flank sigmas in degrees — asymmetry IS the shape.
 */
interface RidgeFeature {
  c: number;
  h: number;
  sl: number;
  sr: number;
}
const RIDGE_FEATURES: ReadonlyArray<ReadonlyArray<RidgeFeature>> = [
  // THE BENCH ring: one authored landform per hero frame, placed off the
  // frame centers (dawn-field 0, noon-open +20, dawn-ridge -30,
  // dawn-into-sun +85, evening -95, lastlight -90). The +40..+62 window
  // stays empty — the dawn sun corridor keeps its clean glow horizon.
  [
    { c: 12, h: 1.55, sl: 11, sr: 17 }, // treeline bench: dawn-field / noon-open
    { c: -24, h: 0.95, sl: 6, sr: 9 }, // small knob, dawn-field left third
    { c: -42, h: 1.2, sl: 7, sr: 11 }, // dawn-ridge mass
    { c: 95, h: 0.9, sl: 6, sr: 10 }, // dawn-into-sun, right of the disc
    { c: -70, h: 1.1, sl: 8, sr: 12 }, // lastlight/evening, screen-left of glow
    { c: -116, h: 1.3, sl: 9, sr: 14 }, // evening right third
    { c: 165, h: 1.0, sl: 10, sr: 16 }, // back hemisphere filler
  ],
  // Near band (conifer line): a long low bench behind dawn-field, a small
  // knob screen-left of it, a pass notch, back-hemisphere fillers.
  [
    { c: -6, h: 0.45, sl: 18, sr: 26 },
    { c: 38, h: 0.62, sl: 7, sr: 13 },
    { c: -52, h: 0.5, sl: 9, sr: 6 },
    { c: -70, h: -0.55, sl: 5, sr: 5 }, // the pass
    { c: 150, h: 0.55, sl: 12, sr: 20 },
    { c: -140, h: 0.5, sl: 14, sr: 10 },
  ],
  // Mid band: THE SADDLE — twin summits with a genuine gap that frames the
  // hero snag in dawn-ridge (view -30: they sit +8 and +32 screen-right).
  [
    { c: -38, h: 1.45, sl: 4.5, sr: 9 },
    { c: -62, h: 1.1, sl: 6, sr: 4 },
    { c: -50, h: -0.28, sl: 3.5, sr: 3.5 }, // saddle floor
    { c: 100, h: 0.72, sl: 8, sr: 14 },
    { c: 170, h: 0.55, sl: 11, sr: 18 },
    { c: -150, h: 0.6, sl: 12, sr: 8 },
  ],
  // Far band: THE PEAK — dominant asymmetric summit on dawn-field's left
  // third (dead center at noon-open, e3-5 monolith staging): steep face
  // toward frame center, THE SHOULDER stepping down screen-left behind a
  // bench break. A second anchor for the evening/lastlight frames at -118
  // (clear of the setting sun's disc corridor). The +60..+110 window stays
  // quiet so dawn-into-sun keeps its soft glow horizon.
  [
    // az 10, not 22: the landmark oak sits on the az-25 sightline from the
    // dawn-field camera — THE PEAK must not hide behind it.
    { c: 10, h: 1.9, sl: 4.8, sr: 8.5 },
    { c: 40, h: 0.5, sl: 8, sr: 14 }, // THE SHOULDER
    { c: 26, h: -0.5, sl: 6, sr: 6 }, // bench break: peak and shoulder SEPARATE
    { c: -118, h: 1.05, sl: 5, sr: 11 },
    { c: -129, h: 0.45, sl: 3.5, sr: 5.5 }, // spur off the evening anchor
    { c: 150, h: 0.55, sl: 14, sr: 20 },
    { c: -165, h: 0.5, sl: 12, sr: 16 },
  ],
];
// Serrated bands get the resolution.
const RIDGE_SEGS = [1536, 1536, 640, 512] as const;
/** Share of the region's farthest fog the nearest and farthest region-true
 * horizon bands take (atmosphere.ts `distance` is the whole). */
const HORIZON_FOG_NEAR = .42;
/** Cloud-shadow drift, metres a second: calm air to a strong wind. */
const CLOUD_SPEED_MIN = 3;
const CLOUD_SPEED_RANGE = 10;
const HORIZON_FOG_FAR = .9;
const RIDGE_BOTTOM = -40;
const TREE_COUNT = 190; // conifers around a serrated ring (~8-10 m spacing)

interface RidgeProfile {
  layers: typeof RIDGE_LAYERS;
  features: ReadonlyArray<ReadonlyArray<RidgeFeature>>;
  segments: readonly number[];
  treeCount: number;
  /** Fraction of hunter elevation carried into the distant skyline. */
  verticalFollow?: number;
}

const DEFAULT_RIDGES: RidgeProfile = {
  layers: RIDGE_LAYERS,
  features: RIDGE_FEATURES,
  segments: RIDGE_SEGS,
  treeCount: TREE_COUNT,
};

/** Broad Great Basin benches: lower and softer than Chukar's broken ridge,
 * with one readable rim and a long, open return horizon. */
const HUN_RIDGES: RidgeProfile = {
  layers: [
    { radius: 280, base: -1, amp: 9, far: 0, fogMix: 0.03, hazeAmt: 0.34, jag: 0.08, freqs: [3, 8, 19], noiseScale: 0.54, land: true },
    { radius: 430, base: 6, amp: 19, far: 0.16, fogMix: 0.1, hazeAmt: 0.56, jag: 0.13, freqs: [4, 9, 23], noiseScale: 0.62 },
    { radius: 650, base: 15, amp: 38, far: 0.48, fogMix: 0.16, hazeAmt: 0.76, jag: 0.2, freqs: [3, 7, 17], noiseScale: 0.58 },
    { radius: 900, base: 27, amp: 66, far: 0.7, fogMix: 0.23, hazeAmt: 0.9, jag: 0.14, freqs: [4, 11, 29], noiseScale: 0.52 },
  ],
  features: [
    [{ c: -34, h: 0.74, sl: 23, sr: 37 }, { c: 55, h: 0.46, sl: 32, sr: 25 }, { c: 146, h: 0.58, sl: 24, sr: 34 }],
    [{ c: -45, h: 0.86, sl: 18, sr: 28 }, { c: 20, h: 0.48, sl: 20, sr: 33 }, { c: 106, h: 0.68, sl: 26, sr: 21 }, { c: -142, h: 0.44, sl: 28, sr: 38 }],
    [{ c: -66, h: 0.72, sl: 22, sr: 34 }, { c: 18, h: 0.42, sl: 28, sr: 24 }, { c: 112, h: 0.65, sl: 25, sr: 40 }],
    [{ c: -88, h: 0.62, sl: 32, sr: 50 }, { c: 8, h: 0.46, sl: 42, sr: 35 }, { c: 126, h: 0.7, sl: 30, sr: 46 }],
  ],
  segments: [640, 576, 512, 448],
  treeCount: 0,
  verticalFollow: 0.68,
};

/** Ruffed-grouse country: a close dark timber wall with irregular conifer
 * crowns. The horizon stays compressed so the player reads short sightlines
 * before the first bird is found. */
const GROUSE_RIDGES: RidgeProfile = {
  layers: [
    { radius: 220, base: -2, amp: 8, far: 0, fogMix: 0.02, hazeAmt: 0.3, jag: 0.05, freqs: [4, 9, 23], noiseScale: 0.5, land: true, trees: 4.6, treeHaze: 0.18 },
    { radius: 330, base: 5, amp: 17, far: 0.15, fogMix: 0.08, hazeAmt: 0.5, jag: 0.1, freqs: [3, 8, 19], noiseScale: 0.58, trees: 6.2, treeHaze: 0.3 },
    { radius: 520, base: 13, amp: 32, far: 0.48, fogMix: 0.15, hazeAmt: 0.72, jag: 0.16, freqs: [4, 10, 25], noiseScale: 0.55 },
    { radius: 760, base: 24, amp: 60, far: 0.72, fogMix: 0.22, hazeAmt: 0.9, jag: 0.13, freqs: [3, 7, 21], noiseScale: 0.5 },
  ],
  features: [
    [{ c: -44, h: 0.6, sl: 17, sr: 25 }, { c: 26, h: 0.48, sl: 22, sr: 31 }, { c: 112, h: 0.68, sl: 19, sr: 28 }, { c: -142, h: 0.44, sl: 25, sr: 18 }],
    [{ c: -58, h: 0.72, sl: 16, sr: 24 }, { c: 18, h: 0.5, sl: 25, sr: 18 }, { c: 98, h: 0.6, sl: 20, sr: 29 }, { c: 164, h: 0.42, sl: 23, sr: 16 }],
    [{ c: -78, h: 0.7, sl: 22, sr: 34 }, { c: 12, h: 0.46, sl: 36, sr: 24 }, { c: 116, h: 0.64, sl: 24, sr: 38 }],
    [{ c: -96, h: 0.6, sl: 28, sr: 46 }, { c: 6, h: 0.48, sl: 48, sr: 34 }, { c: 128, h: 0.68, sl: 30, sr: 50 }],
  ],
  segments: [768, 640, 512, 448],
  treeCount: 168,
  verticalFollow: 0.7,
};

/** Alder bottoms: low wet ground, soft tree lines, and a hazy wooded rise
 * behind the bottom. It is quieter and flatter than the upland grouse ring. */
const WOODCOCK_RIDGES: RidgeProfile = {
  layers: [
    { radius: 240, base: -2.5, amp: 6, far: 0, fogMix: 0.03, hazeAmt: 0.4, jag: 0.03, freqs: [3, 8, 19], noiseScale: 0.44, land: true, trees: 3.6, treeHaze: 0.28 },
    { radius: 380, base: 3, amp: 13, far: 0.2, fogMix: 0.11, hazeAmt: 0.62, jag: 0.06, freqs: [4, 9, 23], noiseScale: 0.5, trees: 4.5, treeHaze: 0.4 },
    { radius: 590, base: 11, amp: 27, far: 0.56, fogMix: 0.18, hazeAmt: 0.78, jag: 0.1, freqs: [3, 7, 17], noiseScale: 0.5 },
  ],
  features: [
    [{ c: -68, h: 0.44, sl: 28, sr: 38 }, { c: 14, h: 0.5, sl: 34, sr: 46 }, { c: 104, h: 0.42, sl: 32, sr: 27 }],
    [{ c: -88, h: 0.5, sl: 24, sr: 36 }, { c: 10, h: 0.58, sl: 39, sr: 52 }, { c: 118, h: 0.46, sl: 28, sr: 40 }],
    [{ c: -122, h: 0.62, sl: 30, sr: 46 }, { c: -8, h: 0.52, sl: 48, sr: 37 }, { c: 102, h: 0.58, sl: 34, sr: 52 }],
  ],
  segments: [640, 576, 448],
  treeCount: 132,
  verticalFollow: 0.7,
};

/** Desert washes: mesas and eroded shoulders with deliberate flat gaps. A
 * low first shelf leaves room for the wash and thornscrub to own the frame. */
const DESERT_RIDGES: RidgeProfile = {
  layers: [
    { radius: 270, base: -1, amp: 10, far: 0, fogMix: 0.03, hazeAmt: 0.28, jag: 0.12, freqs: [3, 8, 19], noiseScale: 0.58, land: true },
    { radius: 430, base: 7, amp: 24, far: 0.17, fogMix: 0.09, hazeAmt: 0.48, jag: 0.24, freqs: [4, 9, 21], noiseScale: 0.64 },
    { radius: 650, base: 17, amp: 48, far: 0.5, fogMix: 0.16, hazeAmt: 0.7, jag: 0.3, freqs: [3, 7, 17], noiseScale: 0.6 },
    { radius: 890, base: 30, amp: 78, far: 0.72, fogMix: 0.24, hazeAmt: 0.88, jag: 0.22, freqs: [4, 10, 25], noiseScale: 0.54 },
  ],
  features: [
    [{ c: -48, h: 0.78, sl: 12, sr: 27 }, { c: 34, h: 0.46, sl: 18, sr: 31 }, { c: 126, h: 0.7, sl: 16, sr: 24 }],
    [{ c: -70, h: 0.84, sl: 13, sr: 24 }, { c: 8, h: -0.2, sl: 10, sr: 13 }, { c: 72, h: 0.52, sl: 18, sr: 29 }, { c: 154, h: 0.6, sl: 16, sr: 30 }],
    [{ c: -96, h: 0.72, sl: 18, sr: 34 }, { c: 24, h: 0.45, sl: 26, sr: 18 }, { c: 118, h: 0.76, sl: 15, sr: 35 }],
    [{ c: -116, h: 0.7, sl: 26, sr: 44 }, { c: 6, h: 0.42, sl: 40, sr: 24 }, { c: 112, h: 0.82, sl: 20, sr: 45 }],
  ],
  segments: [640, 576, 512, 448],
  treeCount: 0,
  verticalFollow: 0.72,
};

/** Oak canyon skyline: red-rock fins and shaded canyon rims, kept below the
 * Chukar profile so the country feels enclosed without becoming a mountain
 * climb. */
const MEARNS_RIDGES: RidgeProfile = {
  layers: [
    { radius: 235, base: -1, amp: 14, far: 0, fogMix: 0.03, hazeAmt: 0.3, jag: 0.16, freqs: [3, 8, 19], noiseScale: 0.58, land: true },
    { radius: 360, base: 8, amp: 27, far: 0.14, fogMix: 0.09, hazeAmt: 0.5, jag: 0.24, freqs: [4, 9, 23], noiseScale: 0.66 },
    { radius: 540, base: 19, amp: 52, far: 0.48, fogMix: 0.16, hazeAmt: 0.72, jag: 0.28, freqs: [3, 7, 17], noiseScale: 0.62 },
    { radius: 760, base: 32, amp: 88, far: 0.7, fogMix: 0.23, hazeAmt: 0.9, jag: 0.2, freqs: [4, 10, 25], noiseScale: 0.55 },
  ],
  features: [
    [{ c: -42, h: 0.74, sl: 12, sr: 24 }, { c: 28, h: 0.52, sl: 20, sr: 30 }, { c: 102, h: 0.62, sl: 16, sr: 23 }],
    [{ c: -58, h: 0.82, sl: 14, sr: 26 }, { c: 4, h: -0.32, sl: 9, sr: 12 }, { c: 58, h: 0.54, sl: 17, sr: 25 }, { c: 136, h: 0.68, sl: 14, sr: 28 }],
    [{ c: -82, h: 0.7, sl: 18, sr: 32 }, { c: 10, h: 0.46, sl: 25, sr: 19 }, { c: 112, h: 0.74, sl: 17, sr: 35 }],
    [{ c: -104, h: 0.64, sl: 24, sr: 42 }, { c: 6, h: 0.4, sl: 36, sr: 24 }, { c: 118, h: 0.78, sl: 20, sr: 44 }],
  ],
  segments: [640, 576, 512, 448],
  treeCount: 0,
  verticalFollow: 0.7,
};

/** Timberline parks: a high, cold skyline with a readable conifer band and
 * a few alpine summits beyond it. The tallest layer stays sparse for a clean
 * silhouette against the sky. */
const TIMBERLINE_RIDGES: RidgeProfile = {
  layers: [
    { radius: 230, base: -2, amp: 13, far: 0, fogMix: 0.02, hazeAmt: 0.28, jag: 0.1, freqs: [3, 8, 21], noiseScale: 0.56, land: true, trees: 4.4, treeHaze: 0.18 },
    { radius: 350, base: 8, amp: 29, far: 0.14, fogMix: 0.08, hazeAmt: 0.46, jag: 0.18, freqs: [4, 9, 23], noiseScale: 0.66, trees: 6.8, treeHaze: 0.3 },
    { radius: 530, base: 21, amp: 62, far: 0.48, fogMix: 0.15, hazeAmt: 0.7, jag: 0.25, freqs: [3, 7, 17], noiseScale: 0.62 },
    { radius: 770, base: 37, amp: 118, far: 0.7, fogMix: 0.22, hazeAmt: 0.92, jag: 0.3, freqs: [4, 10, 25], noiseScale: 0.54 },
  ],
  features: [
    [{ c: -38, h: 0.62, sl: 18, sr: 28 }, { c: 28, h: 0.46, sl: 25, sr: 34 }, { c: 112, h: 0.74, sl: 17, sr: 27 }],
    [{ c: -52, h: 0.74, sl: 17, sr: 27 }, { c: 22, h: 0.5, sl: 26, sr: 36 }, { c: 108, h: 0.82, sl: 18, sr: 30 }],
    [{ c: -74, h: 0.78, sl: 18, sr: 33 }, { c: 16, h: 0.5, sl: 28, sr: 22 }, { c: 104, h: 0.9, sl: 16, sr: 34 }],
    [{ c: -96, h: 0.68, sl: 25, sr: 46 }, { c: 4, h: 1.35, sl: 10, sr: 20 }, { c: 86, h: 0.9, sl: 25, sr: 42 }],
  ],
  segments: [768, 640, 512, 448],
  treeCount: 176,
  verticalFollow: 0.72,
};

/** Valley oak country: warm rolling foothills with broad shoulders and no
 * conifer sawtooth. The near band stays deliberately low so the live oak
 * crowns in the field remain the visual landmarks. */
const VALLEY_OAK_RIDGES: RidgeProfile = {
  layers: [
    { radius: 290, base: -1.5, amp: 8, far: 0, fogMix: 0.03, hazeAmt: 0.34, jag: 0.04, freqs: [3, 8, 21], noiseScale: 0.46, land: true },
    { radius: 450, base: 4, amp: 17, far: 0.18, fogMix: 0.1, hazeAmt: 0.54, jag: 0.08, freqs: [4, 10, 25], noiseScale: 0.5 },
    { radius: 680, base: 13, amp: 36, far: 0.5, fogMix: 0.17, hazeAmt: 0.74, jag: 0.12, freqs: [3, 7, 19], noiseScale: 0.54 },
  ],
  features: [
    [{ c: -68, h: 0.52, sl: 28, sr: 43 }, { c: 18, h: 0.42, sl: 38, sr: 52 }, { c: 112, h: 0.48, sl: 31, sr: 44 }],
    [{ c: -82, h: 0.6, sl: 24, sr: 40 }, { c: 8, h: 0.46, sl: 42, sr: 55 }, { c: 116, h: 0.56, sl: 28, sr: 45 }],
    [{ c: -112, h: 0.68, sl: 28, sr: 48 }, { c: -6, h: 0.5, sl: 48, sr: 38 }, { c: 102, h: 0.62, sl: 32, sr: 52 }],
  ],
  segments: [576, 512, 416],
  treeCount: 0,
  verticalFollow: 0.7,
};

/** The core grounds' region-true horizons (horizon.ts) as ridge layers. */
function horizonProfile(horizon: Horizon): RidgeProfile {
  return {
    layers: horizon.layers.map(layer => ({ ...layer, jag: 0, freqs: [1, 1, 1] as const, noiseScale: 0 })),
    features: horizon.layers.map(() => []),
    segments: horizon.layers.map(layer => layer.segments),
    treeCount: 0,
  };
}

function ridgeProfileFor(landscape?: LandscapeModel): RidgeProfile {
  if (landscape?.area.id === 'hun-benches') return HUN_RIDGES;
  if (landscape?.area.id === 'grouse-woods') return GROUSE_RIDGES;
  if (landscape?.area.id === 'woodcock-bottoms') return WOODCOCK_RIDGES;
  if (landscape?.area.id === 'desert-washes') return DESERT_RIDGES;
  if (landscape?.area.id === 'mearns-canyons') return MEARNS_RIDGES;
  if (landscape?.area.id === 'timberline-parks') return TIMBERLINE_RIDGES;
  if (landscape?.area.id === 'valley-oaks') return VALLEY_OAK_RIDGES;
  return DEFAULT_RIDGES;
}

/** Deterministic integer hash -> [0,1). */
function hash01(i: number, seed: number): number {
  let h = (Math.imul(i, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Wrap-safe value noise on the ring: lattice of `freq` points, smooth. */
function ringNoise(theta: number, freq: number, seed: number): number {
  const u = ((theta / (Math.PI * 2)) % 1) * freq;
  const i0 = Math.floor(u);
  const t = u - i0;
  const w0 = ((i0 % freq) + freq) % freq;
  const w1 = (w0 + 1) % freq;
  const a = hash01(w0, seed);
  const b = hash01(w1, seed);
  const s = t * t * (3 - 2 * t);
  return a + (b - a) * s;
}

/** What the sky reads of the hunt's day. */
interface DayHunt {
  condition?(): Condition;
  month?(): Month;
  huntState?(): { condition: Condition; windStrength: WindStrength };
}

export class SkySystem implements Subsystem {
  readonly id = 'sky';
  private dome!: THREE.Mesh;
  private mat!: THREE.ShaderMaterial;
  private cloudAtlas?: ReturnType<typeof createSharptailCloudAtlas>;
  private sun!: THREE.DirectionalLight;
  private fill!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private ridges: THREE.Mesh[] = [];
  private ridgeMats: THREE.ShaderMaterial[] = [];
  // Preallocated scratch (no per-frame or per-apply allocations).
  private ridgeBase = new THREE.Color();
  private ridgeFar = new THREE.Color();
  private fogCol = new THREE.Color();
  private hazeCol = new THREE.Color();
  // Light directions (unit, world) — set in apply(), consumed per frame by
  // the camera-following rig in update(). Preallocated.
  private keyDir = new THREE.Vector3(0, 1, 0);
  private fillDir = new THREE.Vector3(0, 1, 0);
  private fwd = new THREE.Vector3();
  private readonly ridgeProfile: RidgeProfile;
  /** The core grounds' region-true horizon, or null for the generic ridges. */
  private readonly horizon: Horizon | null;
  private readonly land: HorizonLand | null;
  /** The far country with real parallax beyond the terrain apron. */
  private far: FarTerrain | null = null;
  private readonly quail: boolean;
  private readonly areaId: string;
  /** World height the region's fog pools at (atmosphere.ts). */
  private poolFloor = 0;
  /** This ground's baked sky occlusion and its texture (groundLight.ts). */
  private skyBake: SkyOcclusion | null = null;
  private skyMap: THREE.DataTexture | null = null;
  /** The hunt's one wind carries the cloud shadows. */
  private readonly wind = new VegetationWind();
  private windConnected = false;
  private groundTod: TimeOfDay = 'morning';
  private readonly drift = { x: 0, z: 0 };
  /** The day (fieldConditions.ts), read from the hunt on the first frame. */
  private condition: Condition = 'mild';
  private month: Month = 'October';
  /** The hunt's wind as the sky reads it (0 calm to 1 strong). */
  private windLevel = AUTHORED_WIND;
  private conditionsKnown = false;
  private particles: WeatherParticles | null = null;
  private disposeReview: (() => void) | null = null;
  private readonly skyTint = new THREE.Color();
  private readonly particleLight = new THREE.Color();
  private readonly levelSun = { x: 1, z: 0 };
  private readonly sunDir = new THREE.Vector3();

  constructor(private readonly landscape?: LandscapeModel) {
    this.land = landscape ? horizonLand(landscape) : null;
    this.horizon = landscape && this.land ? buildHorizon(landscape.area.id, this.land) : null;
    this.ridgeProfile = this.horizon ? horizonProfile(this.horizon) : ridgeProfileFor(landscape);
    this.quail = landscape?.area.id === 'quail-fields';
    this.areaId = landscape?.area.id ?? '';
  }

  init(ctx: Ctx): void {
    if (this.areaId === 'sharptail-prairie') this.cloudAtlas = createSharptailCloudAtlas();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uHot: { value: new THREE.Color() },
        uHotStrength: { value: 0.9 },
        uBelow: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunDisc: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uGlowMid: { value: new THREE.Color() },
        uGlowStrength: { value: 0.8 },
        uDiscCos: {
          value: new THREE.Vector2(
            Math.cos(THREE.MathUtils.degToRad(3.2)),
            Math.cos(THREE.MathUtils.degToRad(2.0)),
          ),
        },
        uCloudLit: { value: new THREE.Color() },
        uCloudShade: { value: new THREE.Color() },
        uCloudAmt: { value: 0 },
        uSharptailCloudAtlas: this.cloudAtlas?.atlas ?? { value: null },
        uSharptailCloudReady: this.cloudAtlas?.ready ?? { value: 0 },
        uChukar: { value: this.areaId === 'chukar-ridge' ? 1 : 0 },
        uSharptail: { value: this.areaId === 'sharptail-prairie' ? 1 : 0 },
        uQuail: { value: this.quail ? 1 : 0 },
        uPheasant: { value: this.areaId === 'pheasant-coverts' ? 1 : 0 },
        uOvercast: { value: 0 },
        uDeck: { value: new THREE.Color(0x9aa1a7) },
        ...gradeUniforms(),
        ...atmosphereUniforms(),
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 24), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -30;
    ctx.scene.add(this.dome);

    this.buildRidges(ctx);

    // KEY: the shadow caster. It rides the TRUE sun elevation (floored at
    // ~4°) so dawn/evening throw the long raking shadows Firewatch lives
    // on. The old rig cheated this light up to >=14°, which is why long
    // shadows never existed. Form modeling at grazing angles is restored
    // by the separate non-casting fill below.
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    const shadowRes = ctx.quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(shadowRes, shadowRes);
    // Frustum extents are set per-TOD in apply() (light-space height is
    // elevation-dependent: a low sun compresses the ground footprint, so
    // tightening top/bottom buys texel density exactly when long shadows
    // need it). near/far bracket the 300 m light offset used in update().
    this.sun.shadow.camera.near = 120;
    this.sun.shadow.camera.far = 480;
    // Grazing-angle acne control: a small constant bias plus a modest
    // normal-space offset. Keep normalBias SMALL — at 6° elevation every
    // meter of normal offset slides the contact point ~10 m along the
    // ground: 0.35 erased every fence-post and trunk shadow root, which is
    // why round 3 read "no prop casts anything". 0.12 keeps posts casting;
    // the slightly larger constant bias holds acne down with PCFSoft.
    this.sun.shadow.bias = this.areaId==='chukar-ridge' ? -0.00015 : -0.0006;
    this.sun.shadow.normalBias = this.areaId==='chukar-ridge' ? .045 : .12;
    ctx.scene.add(this.sun);
    ctx.scene.add(this.sun.target);

    // FILL: no shadow, same azimuth, elevation floored at ~16° — it models
    // the swells and canopy tops the way the old cheated light did, without
    // erasing the key's long shadows. Color/intensity per TOD.
    this.fill = new THREE.DirectionalLight(0xffffff, 0);
    this.fill.castShadow = false;
    ctx.scene.add(this.fill);
    ctx.scene.add(this.fill.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    ctx.scene.add(this.hemi);

    ctx.scene.fog = new THREE.FogExp2(0xffffff, 0.005);
    const landscape = this.landscape;
    if (landscape) {
      this.poolFloor = poolFloor((x, z) => landscape.heightAtWorld(x, z), landscape.worldBounds(), regionAtmosphere(this.areaId).floor);
      // Sky occlusion over the property and its terrain apron, baked before
      // the first frame so every material compiles with this ground's map.
      const b = landscape.worldBounds(), m = TERRAIN_APRON_M;
      this.skyBake = bakeSkyOcclusion((x, z) => landscape.heightAtWorld(x, z),
        { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
      this.skyMap = skyOcclusionTexture(this.skyBake);
      setSkyMap(this.skyMap);
      if (this.land) this.far = buildFarTerrain(landscape, this.land, ctx.quality);
      if (this.far) ctx.scene.add(this.far.mesh);
    }

    this.apply(ctx, ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => this.apply(ctx, e.detail)) as EventListener);
  }

  /**
   * Distant ridge lines, Firewatch's signature: 2-3 silhouette bands at
   * different radii, each flattened toward the fog color with distance.
   * Camera-following rings (zero parallax backdrop), built once from a
   * LOCAL seeded stream (per-subsystem RNG contract). The skyline is
   * AUTHORED shape language — RIDGE_FEATURES places THE peak, THE saddle,
   * THE shoulder at named azimuths; noise is only connective tissue — and
   * the nearest band carries a serrated conifer line along the crest (the
   * Firewatch e3-5 treeline).
   */
  private buildRidges(ctx: Ctx): void {
    const backdrop = this.quail || this.areaId === 'chukar-ridge' || this.areaId === 'pheasant-coverts' || this.areaId === 'sharptail-prairie';
    const rng = mulberry32(0x51d9e5);
    for (let l = 0; l < this.ridgeProfile.layers.length; l++) {
      const layer = this.ridgeProfile.layers[l];
      const SEG = this.ridgeProfile.segments[l];
      const [f1, f2, f3] = layer.freqs;
      const s1 = (rng() * 0x7fffffff) | 0;
      const s2 = (rng() * 0x7fffffff) | 0;
      const s3 = (rng() * 0x7fffffff) | 0;
      const s4 = (rng() * 0x7fffffff) | 0;
      // Authored features with a whisper of deterministic jitter so the
      // profile never reads mathematically placed.
      const peaks: Array<{ c: number; h: number; sl: number; sr: number }> = [];
      for (const f of this.ridgeProfile.features[l]) {
        peaks.push({
          c: THREE.MathUtils.degToRad(f.c + (rng() - 0.5) * 3),
          h: layer.amp * f.h * (0.94 + rng() * 0.12),
          sl: THREE.MathUtils.degToRad(f.sl),
          sr: THREE.MathUtils.degToRad(f.sr),
        });
      }
      const treePhase = rng();
      const sTree = (rng() * 0x7fffffff) | 0;
      const sTreeH = (rng() * 0x7fffffff) | 0;
      const sTreeP = (rng() * 0x7fffffff) | 0;
      const sCluster = (rng() * 0x7fffffff) | 0;
      const sTreeW = (rng() * 0x7fffffff) | 0;
      const positions = new Float32Array((SEG + 1) * 2 * 3);
      const hazeAttr = new Float32Array((SEG + 1) * 2);
      const baseAttr = new Float32Array((SEG + 1) * 2);
      const indices: number[] = [];
      for (let i = 0; i <= SEG; i++) {
        const theta = (i / SEG) * Math.PI * 2;
        // 3 octaves of wrap-safe value noise + a ridged crease term:
        // rolling swells, secondary undulation, fine spurs, sharp saddles.
        const n1 = ringNoise(theta, f1, s1) * 2 - 1;
        const n2 = ringNoise(theta, f2, s2) * 2 - 1;
        const n3 = ringNoise(theta, f3, s3) * 2 - 1;
        const crease = 1 - Math.abs(n2); // V-creases where octave 2 crosses 0
        let h =
          layer.base +
          layer.amp * layer.noiseScale *
            (0.3 * n1 + 0.18 * n2 + 0.09 * n3 + layer.jag * crease);
        let peakSum = 0;
        for (const pk of peaks) {
          let d = theta - pk.c;
          d = Math.atan2(Math.sin(d), Math.cos(d)); // wrap to [-pi, pi]
          const sigma = d < 0 ? pk.sl : pk.sr;
          peakSum += pk.h * Math.exp(-0.5 * (d / sigma) * (d / sigma));
        }
        // Summit-riding detail: rocky jag that scales with peak height, so
        // crests never read as glassy gaussian domes but bases stay calm.
        // Damped with the layer's noiseScale — THE far peak must stay ONE
        // summit, not split into sub-peaks.
        const n4 = ringNoise(theta, f3 * 2 + 1, s4) * 2 - 1;
        h += peakSum * (1 + 0.14 * layer.noiseScale * n4);
        // Conifer serration (round-5 rewrite, item 6): per-tree WIDTH and
        // height variation, clustered MULTI-CELL gaps (a slow cluster noise
        // gates whole runs empty, a per-tree roll knocks out singles inside
        // stands), and haze absorption via aHaze — an irregular treeline,
        // not a doily edge. On the land ring, trees ride the authored
        // features only (treeline WEDGES, not a 360-degree moat).
        let treeFrac = 0;
        let treeBase = 0;
        if (layer.trees) {
          const treeCount = this.ridgeProfile.treeCount;
          const u = (theta / (Math.PI * 2)) * treeCount + treePhase * treeCount;
          const ui = Math.floor(u);
          const f = u - ui;
          const uiw = treeCount > 0 ? ((ui % treeCount) + treeCount) % treeCount : 0; // seam-safe
          const cluster = ringNoise(theta, 11, sCluster);
          if (cluster > 0.36 && hash01(uiw, sTree) > 0.12) {
            const wvar = 0.5 + 0.85 * hash01(uiw, sTreeW);
            const fc = (f - 0.5) / wvar + 0.5;
            if (fc > 0 && fc < 1) {
              const apex = 0.3 + 0.4 * hash01(uiw, sTreeP);
              const tri = this.areaId === 'pheasant-coverts'
                ? Math.pow(Math.sin(fc * Math.PI), .65)
                : fc < apex ? fc / apex : (1 - fc) / (1 - apex);
              let hgt = (0.3 + 0.7 * hash01(uiw, sTreeH)) * (0.2 + 1.0 * cluster);
              if (layer.land) {
                hgt *= THREE.MathUtils.clamp(peakSum / (0.45 * layer.amp), 0.1, 1);
              }
              treeBase = h;
              const rise = tri * layer.trees * hgt;
              h += rise;
              treeFrac = THREE.MathUtils.clamp(rise / layer.trees, 0, 1);
            }
          }
        }
        if (this.horizon) {
          // Region-true silhouettes may dip below the local datum: clamping
          // them to one positive floor made a water-like horizon strip.
          const sample = this.horizon.sample(l, theta);
          h = sample.crest;
          treeBase = sample.ground;
          treeFrac = Math.min(1, sample.crown / 12);
        } else h = Math.max(h, layer.land ? -2.0 : l <= 1 ? 2.5 : 1.2);
        const x = Math.sin(theta) * layer.radius;
        const z = Math.cos(theta) * layer.radius;
        const top = i * 2;
        positions[top * 3] = x;
        positions[top * 3 + 1] = h;
        positions[top * 3 + 2] = z;
        positions[(top + 1) * 3] = x;
        positions[(top + 1) * 3 + 1] = RIDGE_BOTTOM;
        positions[(top + 1) * 3 + 2] = z;
        // Both column verts carry the SAME haze amount and tree-base line —
        // the frag confines the absorb above aBase, so nothing smears down.
        hazeAttr[top] = treeFrac * (layer.treeHaze ?? 0);
        hazeAttr[top + 1] = hazeAttr[top];
        baseAttr[top] = treeFrac > 0 ? treeBase : h + 1;
        baseAttr[top + 1] = baseAttr[top];
        if (i < SEG) {
          const a = top;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aHaze', new THREE.BufferAttribute(hazeAttr, 1));
      geo.setAttribute('aBase', new THREE.BufferAttribute(baseAttr, 1));
      geo.setIndex(indices);
      const mat = new THREE.ShaderMaterial({
        vertexShader: RIDGE_VERT,
        fragmentShader: RIDGE_FRAG,
        uniforms: {
          uCol: { value: new THREE.Color() },
          uSpill: { value: new THREE.Color() },
          uSpillStrength: { value: 0 },
          uSunXZ: { value: new THREE.Vector2(1, 0) },
          uHaze: { value: new THREE.Color() },
          // Haze decays over roughly the lower half of the layer's relief.
          uHazeK: { value: 3.0 / (layer.base + 0.5 * layer.amp) },
          uHazeAmt: { value: layer.hazeAmt },
          ...gradeUniforms(),
          ...atmosphereUniforms(),
        },
        side: THREE.DoubleSide, // viewed from inside the ring
        depthWrite: false,
        depthTest: !backdrop,
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      // These large properties use camera-following backdrop rings: their radii
      // lie inside the playable property and must never cut off distant props.
      // Paint after the dome, before the real world, with far bands first.
      // Other properties retain their existing depth-resolved ridge order.
      mesh.renderOrder = backdrop ? -20 - l : 10 - l;
      ctx.scene.add(mesh);
      this.ridges.push(mesh);
      this.ridgeMats.push(mat);
    }
  }

  /** The hour's light under the day's weather. */
  private hour(tod: TimeOfDay) { return weatherSpec(fieldTimeOfDay(this.areaId, tod), this.condition, this.windLevel); }

  private apply(ctx: Ctx, tod: TimeOfDay): void {
    const spec = this.hour(tod);
    // A rain or snow day's deck takes the hour's (greyed) mid-sky colour.
    this.mat.uniforms.uOvercast.value = weatherLook(this.condition).overcast;
    (this.mat.uniforms.uDeck.value as THREE.Color).setHex(spec.skyMid);
    const u = this.mat.uniforms;
    (u.uTop.value as THREE.Color).setHex(spec.skyTop);
    (u.uMid.value as THREE.Color).setHex(spec.skyMid);
    (u.uHorizon.value as THREE.Color).setHex(spec.skyHorizon);
    (u.uHot.value as THREE.Color).setHex(spec.hotBand);
    u.uHotStrength.value = spec.hotStrength;
    (u.uBelow.value as THREE.Color).setHex(spec.fogColor);
    (u.uSunDisc.value as THREE.Color).setHex(spec.sunDisc);
    (u.uGlow.value as THREE.Color).setHex(spec.sunGlow);
    (u.uGlowMid.value as THREE.Color).setHex(spec.sunGlowMid);
    u.uGlowStrength.value = spec.glowStrength;
    (u.uCloudLit.value as THREE.Color).setHex(spec.cloudLit);
    (u.uCloudShade.value as THREE.Color).setHex(spec.cloudShade);
    u.uCloudAmt.value = spec.cloudAmount;

    const el = THREE.MathUtils.degToRad(spec.sunElevation);
    const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
    const sx = Math.sin(az) * Math.cos(el);
    const sy = Math.sin(el);
    const sz = Math.cos(az) * Math.cos(el);
    (u.uSunDir.value as THREE.Vector3).set(sx, sy, sz);
    // Split rig: the shadow-casting KEY rides the true elevation (floored
    // just off the horizon so the shadow camera stays sane), the FILL rides
    // high to model form. Directions are stored; update() positions both
    // lights around the camera every frame.
    const kel = Math.max(el, THREE.MathUtils.degToRad(4));
    this.keyDir.set(Math.sin(az) * Math.cos(kel), Math.sin(kel), Math.cos(az) * Math.cos(kel));
    this.sun.color.setHex(spec.sunColor);
    this.sun.intensity = spec.sunIntensity;
    const fel = Math.max(el, THREE.MathUtils.degToRad(16));
    this.fillDir.set(Math.sin(az) * Math.cos(fel), Math.sin(fel), Math.cos(az) * Math.cos(fel));
    if (this.quail || this.areaId === 'chukar-ridge' || this.areaId === 'pheasant-coverts' || this.areaId === 'sharptail-prairie') {
      // A separate sky fill reveals the shaded face of prairie plants and
      // the Line Shack. A fill beside the key only brightens the same faces.
      this.fillDir.set(-Math.sin(az) * 0.64, 0.77, -Math.cos(az) * 0.64);
    }
    this.fill.color.setHex(spec.fillColor);
    this.fill.intensity = spec.fillIntensity;
    // Shadow frustum: X spans the view width; light-space Y needs only the
    // elevation-compressed ground footprint plus caster height, so it
    // tightens hard at the golden hours (texel density where it counts).
    const shCam = this.sun.shadow.camera;
    const halfX = 100;
    const halfY = Math.min(110, Math.max(38, 16 + 130 * Math.sin(kel)));
    shCam.left = -halfX;
    shCam.right = halfX;
    shCam.top = halfY;
    shCam.bottom = -halfY;
    shCam.updateProjectionMatrix();

    this.hemi.color.setHex(spec.ambientSky);
    this.hemi.groundColor.setHex(spec.ambientGround);
    this.hemi.intensity = spec.ambientIntensity;

    const fog = ctx.scene.fog as THREE.FogExp2;
    fog.color.setHex(spec.fogColor);
    fog.density = spec.fogDensity;
    writeAtmosphere(spec, regionAtmosphere(this.areaId), tod, this.sunDir.set(sx, sy, sz), this.poolFloor);
    this.groundTod = tod;
    this.writeGround(spec);

    // Aerial perspective: each ridge steps from the near color toward the
    // cool far color, then flattens gently toward the fog with distance.
    // Light spill toward the sun azimuth rides the TOD's horizon heat and
    // dies off with layer distance.
    this.fogCol.setHex(spec.fogColor);
    // Base haze color: fog pulled toward the sky's horizon stop — what the
    // dome shows just below the horizon, so ridge bases dissolve into it.
    this.hazeCol.setHex(spec.skyHorizon).lerp(this.fogCol, 0.55);
    const sunFlatLen = Math.hypot(sx, sz) || 1;
    const air = regionAtmosphere(this.areaId);
    if (this.horizon) {
      // Below the horizon is far land under the haze, as the fog leaves the
      // terrain's far edge, never bare fog.
      (u.uBelow.value as THREE.Color).setHex(spec.landform).lerp(this.fogCol, air.distance);
    }
    for (let l = 0; l < this.ridgeMats.length; l++) {
      const ru = this.ridgeMats[l].uniforms;
      if (this.horizon) {
        // Region horizons lie beyond the terrain's fogged far edge: each
        // band takes its own hue (the land, then ridge stepping to ridgeFar)
        // under nearly as much of the same fog, a little more per band, so
        // they step back lighter and cooler and never stand darker than the
        // land in front of them by more than a rise beyond it would.
        // A single band is the farthest one.
        const layer = this.ridgeProfile.layers[l], depth = this.ridgeMats.length > 1 ? l / (this.ridgeMats.length - 1) : 1;
        this.ridgeBase.setHex(layer.land ? spec.landform : spec.ridge);
        if (!layer.land) this.ridgeBase.lerp(this.ridgeFar.setHex(spec.ridgeFar), layer.far);
        (ru.uCol.value as THREE.Color).copy(this.ridgeBase).lerp(this.fogCol, air.distance * (HORIZON_FOG_NEAR + (HORIZON_FOG_FAR - HORIZON_FOG_NEAR) * depth));
      } else if (this.ridgeProfile.layers[l].land) {
        // THE BENCH: its own hue (TOD.landform), sunk into the scene fog at
        // its radius so it reads as a mass IN the field's atmosphere — the
        // haze step between the fence line and the ridge stack.
        const d = this.ridgeProfile.layers[l].radius;
        const ff = 1 - Math.exp(-(spec.fogDensity * d) * (spec.fogDensity * d));
        this.ridgeBase.setHex(spec.landform);
        (ru.uCol.value as THREE.Color)
          .copy(this.ridgeBase)
          .lerp(this.fogCol, Math.min(0.42, ff * 0.5));
      } else {
        this.ridgeBase.setHex(spec.ridge);
        this.ridgeFar.setHex(spec.ridgeFar);
        (ru.uCol.value as THREE.Color)
          .copy(this.ridgeBase)
          .lerp(this.ridgeFar, this.ridgeProfile.layers[l].far)
          .lerp(this.fogCol, this.ridgeProfile.layers[l].fogMix);
      }
      // Region horizons and the long views fade to scene fog. Match it at
      // their backdrop bases instead of adding a bright strip.
      (ru.uHaze.value as THREE.Color).copy(this.horizon ? this.fogCol : this.hazeCol);
      (ru.uSpill.value as THREE.Color).setHex(spec.hotBand);
      ru.uSpillStrength.value = spec.hotStrength * 0.55 * (1 - 0.55 * this.ridgeProfile.layers[l].far);
      (ru.uSunXZ.value as THREE.Vector2).set(sx / sunFlatLen, sz / sunFlatLen);
      // Per-TOD haze boost: stronger amount AND slower vertical decay, so
      // dusk ranges melt into the afterglow instead of cutting navy wedges.
      const layer = this.ridgeProfile.layers[l];
      ru.uHazeAmt.value = Math.min(0.95, layer.hazeAmt * spec.ridgeHazeBoost);
      ru.uHazeK.value = 3.0 / ((layer.base + 0.5 * layer.amp) * spec.ridgeHazeBoost);
    }

    // Dawn/dusk lift, noon restraint — the underexposure fix lives here.
    ctx.renderer.toneMappingExposure = spec.exposure;
  }

  /** The hour's ground light: sky map strength, and cloud shadows from the
   * region's cover scaled by the hour's sky, fading as the sun drops. */
  private writeGround(spec = this.hour(this.groundTod)): void {
    const g = regionAtmosphere(this.areaId).ground, overcast = weatherLook(this.condition).overcast;
    const sunUp = THREE.MathUtils.smoothstep(spec.sunElevation, 1, 16);
    writeGroundLight(this.skyBake, {
      // Under a deck the light is all sky, so hollows read darker still.
      occlusion: Math.min(1, g.occlusion * (1 + overcast * .35)), crest: g.crest, floor: g.floor, cloudSize: g.cloudSize,
      // A full deck casts no cloud shadows.
      cloudCover: g.cloudCover * THREE.MathUtils.clamp(.55 + spec.cloudAmount, .55, 1.2) * (1 - overcast),
      // Broken cloud on a wild day casts harder shadows than a still day's.
      cloudStrength: g.cloudStrength * (.35 + .65 * sunUp) * (1 + (this.windLevel - AUTHORED_WIND) * .6),
    }, this.drift);
  }

  /** Read the day from the hunt once it is ready, and dress the field. */
  private readConditions(ctx: Ctx): void {
    this.conditionsKnown = true;
    let hunt: DayHunt | undefined;
    try { hunt = ctx.get('hunt3d') as unknown as DayHunt; } catch { hunt = undefined; }
    if (typeof hunt?.condition !== 'function') return;
    this.dress(ctx, hunt.condition(), hunt.month?.() ?? 'October');
    if (new URLSearchParams(location.search).has('capture')) this.installDayReview(ctx, hunt);
  }

  /** The hour's light under the day's weather, and the day's near weather. */
  private dress(ctx: Ctx, condition: Condition, month: Month): void {
    this.condition = condition;
    this.month = month;
    this.wind.update();
    this.windLevel = this.wind.strength.value;
    const season = seasonLook(this.areaId, month);
    this.far?.setLeaves(season.leafGreen, season.leafFall);
    this.apply(ctx, ctx.timeOfDay);
    if (this.particles) { ctx.scene.remove(this.particles.points); this.particles.dispose(); }
    this.particles = createWeatherParticles(condition, ctx.quality);
    ctx.scene.add(this.particles.points);
  }

  /** Capture-only review hooks (tools3d/weather-review.mjs): dress the same
   * frozen moment for another day, and hide the birds for a with-and-without
   * comparison. Systems that build once for the day (Cattail's frost and
   * snow patches) keep the day the page loaded with. */
  private installDayReview(ctx: Ctx, hunt: DayHunt): void {
    const hidden = new Map<THREE.Object3D, boolean>();
    const scope = window as unknown as { __fieldReview?: unknown };
    scope.__fieldReview = {
      day: () => ({ condition: this.condition, month: this.month }),
      setDay: (condition: Condition, month: Month, wind?: WindStrength) => {
        const state = hunt.huntState?.();
        if (state) { state.condition = condition; if (wind) state.windStrength = wind; }
        this.dress(ctx, condition, month);
      },
      setBirdsVisible: (visible: boolean) => {
        if (visible) { for (const [object, was] of hidden) object.visible = was; hidden.clear(); return; }
        if (hidden.size) return;
        ctx.scene.traverse(object => {
          const material = (object as THREE.Mesh).material;
          if (!(object as THREE.Mesh).isMesh || !material || Array.isArray(material) || material.userData.fieldExempt !== 'bird') return;
          hidden.set(object, object.visible); object.visible = false;
        });
      },
    };
    this.disposeReview = () => { if (scope.__fieldReview) delete scope.__fieldReview; };
  }

  /** The day on the ground, every frame: frost burns off and the wind's
   * sheen rolls on with the field's clock. */
  private writeField(ctx: Ctx): void {
    const spec = this.hour(this.groundTod);
    const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
    this.levelSun.x = Math.sin(az); this.levelSun.z = Math.cos(az);
    this.skyTint.setHex(spec.skyHorizon).lerp(this.fogCol, .4);
    const toward = this.wind.direction.value;
    writeFieldConditions({
      areaId: this.areaId, condition: this.condition, month: this.month, tod: this.groundTod,
      sunElevation: spec.sunElevation, seconds: ctx.time,
      wind: { x: toward.x, z: toward.y, strength: this.wind.strength.value },
      ground: this.skyBake ? { minHeight: this.skyBake.minHeight, maxHeight: this.skyBake.maxHeight, lowGround: this.poolFloor + 3 } : null,
      sky: this.skyTint, sun: this.levelSun,
    });
    if (this.particles) {
      // Particles take the sky's light: dim under a deck, warm at evening.
      this.particleLight.setHex(spec.ambientSky).multiplyScalar(.55 + .25 * spec.ambientIntensity).lerp(this.sun.color, .25);
      this.particles.update(ctx.camera.position, { x: toward.x, z: toward.y, strength: this.wind.strength.value }, ctx.time, this.particleLight);
    }
  }

  update(ctx: Ctx): void {
    // Cloud shadows drift downwind at a speed set by the hunt's wind. The
    // hunt is ready only once the field is, so connect on the first frame.
    if (!this.windConnected) { this.wind.connect(ctx); this.windConnected = true; }
    this.wind.update();
    const speed = CLOUD_SPEED_MIN + CLOUD_SPEED_RANGE * this.wind.strength.value, toward = this.wind.direction.value;
    this.drift.x = -toward.x * speed * ctx.time; this.drift.z = -toward.y * speed * ctx.time;
    if (!this.conditionsKnown) this.readConditions(ctx);
    this.writeGround();
    this.writeField(ctx);

    // The dome and ridge rings ride the camera so the horizon never recedes.
    this.dome.position.copy(ctx.camera.position);
    for (let l = 0; l < this.ridges.length; l++) {
      const y = ctx.camera.position.y;
      this.ridges[l].position.set(ctx.camera.position.x,
        this.horizon ? this.horizon.ringHeight(l, y) : y * (this.ridgeProfile.verticalFollow ?? 0), ctx.camera.position.z);
    }
    // Preserve the broad midground coverage while anchoring the depth grid
    // to whole light-space texels. Ground elevation matters on every property.
    const cam = ctx.camera.position;
    ctx.camera.getWorldDirection(this.fwd);
    const ax = cam.x + this.fwd.x * 55;
    const az = cam.z + this.fwd.z * 55;
    const ty = this.landscape?.heightAtWorld(cam.x, cam.z) ?? 0;
    const target = this.sun.target.position.set(ax, ty, az);
    snapShadowTarget(target, this.keyDir, this.sun.shadow.camera, this.sun.shadow.mapSize);
    this.sun.position.copy(target).addScaledVector(this.keyDir, 300);
    this.fill.target.position.set(cam.x, 0, cam.z);
    this.fill.position.set(
      cam.x + this.fillDir.x * 300,
      this.fillDir.y * 300,
      cam.z + this.fillDir.z * 300,
    );
  }

  dispose(ctx: Ctx): void {
    if (this.far) { ctx.scene.remove(this.far.mesh); this.far.dispose(); this.far = null; }
    if (this.particles) { ctx.scene.remove(this.particles.points); this.particles.dispose(); this.particles = null; }
    this.disposeReview?.(); this.disposeReview = null;
    this.skyMap?.dispose();
    this.skyMap = null;
    this.cloudAtlas?.dispose();
    this.cloudAtlas = undefined;
    ctx.scene.remove(this.dome);
    this.dome.geometry.dispose();
    this.mat.dispose();
    for (let l = 0; l < this.ridges.length; l++) {
      ctx.scene.remove(this.ridges[l]);
      this.ridges[l].geometry.dispose();
      this.ridgeMats[l].dispose();
    }
    ctx.scene.remove(this.sun, this.sun.target, this.fill, this.fill.target, this.hemi);
    this.sun.dispose();
    this.fill.dispose();
    this.hemi.dispose();
    ctx.scene.fog = null;
  }
}
