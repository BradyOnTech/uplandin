import * as THREE from 'three';
import type { Condition } from '../game/conditions';
import type { Month } from '../game/season';
import type { TimeOfDay, TodSpec } from './palette';

/**
 * The day on the ground: season, wetness, frost, snow and the wind's sheen,
 * read by every lit surface on both tiers.
 *
 * One shared set of values (the same shared-array scheme as the grade, fog
 * and ground light) and one include, applied in three's shared
 * `normal_fragment_maps` chunk before lighting, at each surface's world
 * position and normal. It reaches terrain, legacy and kit vegetation,
 * props and the far country without per-system hooks:
 *   - season: the month's colour ramp on vegetation (hue-picked from the
 *     surface's own colour: straw, grass and leaf, never soil, rock, paint
 *     or the dog), green swales in September, bleached grass by November;
 *   - wetness: rain darkens the ground and gives it a sky sheen;
 *   - frost: whitens upward faces and grass tips, burns off over the hunt
 *     where the sun reaches, and lingers in shade, north faces and low
 *     ground (read from the ground light's sky map, whose blue channel holds
 *     the ground's height);
 *   - snow: on upward faces, deeper on lee slopes, scoured off windward,
 *     broken into drifts, with grass blades (upright normals) poking through;
 *   - wind: bands of sheen rolling downwind across the grass at the speed of
 *     the hunt's one wind.
 * Surfaces are weathered only near the ground (within a few metres of the
 * map's height), never the skinned dog, never the gun at the hunter's eye.
 *
 * Every value is a departure from neutral, so zeros leave the scene as it
 * was. A shader of another kind can adopt the layer with `FIELD_GLSL` and
 * `fieldConditionsUniforms()` (it also needs the ground light's), calling
 * `uplandFieldColor(albedo, world, worldNormal, surface, plant, wet)` with
 * surface 1 and plant 1 for grass, cover and shrubs.
 */

export const FIELD_UNIFORM = 'uplandField';
const SLOTS = 7;
/**
 * Slot layout (vec4 each): 0 vegetation tint - 1 (rgb), saturation - 1;
 * 1 bleach, September swales, slough ice (0 to 1), snow cover; 2 wetness, frost, frost
 * burn-off (0 to 1), wind sheen; 3 wind direction (x, z, toward), wind phase
 * (metres travelled), snow drift; 4 sky map height floor, height span, low
 * ground (cold-air pooling) height, map ready; 5 wet sheen colour; 6 the
 * sun's level direction (x, z).
 */
export const FIELD = new Float32Array(SLOTS * 4);

export function fieldConditionsUniforms(): Record<string, THREE.IUniform> {
  return { [FIELD_UNIFORM]: { value: FIELD } };
}

/** Needs `uplandSkyMap`, `uplandGround` and `uplandNoise` (groundLight.ts). */
export const FIELD_GLSL = /* glsl */`
#define UPLAND_FIELD_LIT
uniform vec4 ${FIELD_UNIFORM}[${SLOTS}];
/** Vegetation by colour: yellow through green, with some chroma. */
float uplandVegetation(vec3 c) {
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  return smoothstep(0.0, .07, c.g - c.b) * smoothstep(-.02, .05, c.g - c.r * .62) * smoothstep(.02, .07, chroma);
}
/** The ground's height and openness here (x height, y open, z inside map). */
vec3 uplandGroundAt(vec2 xz) {
  vec4 m = uplandGround[0];
  vec2 uv = (xz - m.xy) * m.zw;
  vec4 t = texture2D(uplandSkyMap, uv);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0) * ${FIELD_UNIFORM}[4].w;
  return vec3(${FIELD_UNIFORM}[4].x + t.b * ${FIELD_UNIFORM}[4].y, mix(1.0, t.r, inside), inside);
}
vec3 uplandFieldColor(vec3 c, vec3 world, vec3 n, float surface, float plant, out float wet) {
  vec4 f0 = ${FIELD_UNIFORM}[0], f1 = ${FIELD_UNIFORM}[1], f2 = ${FIELD_UNIFORM}[2], f3 = ${FIELD_UNIFORM}[3], f4 = ${FIELD_UNIFORM}[4];
  vec3 g = uplandGroundAt(world.xz);
  float above = max(world.y - g.x, 0.0) * g.z;
  surface *= 1.0 - smoothstep(3.0, 6.0, above);
  wet = 0.0;
  if (surface <= 0.0) return c;
  // Plants by their colour (straw to green), or any instanced plant.
  float veg = max(uplandVegetation(c), plant * smoothstep(.02, .07, max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)))) * surface;
  float lum = dot(c, vec3(.2126, .7152, .0722));
  // Season: the month's tint and saturation, bleaching, green swales.
  vec3 s = c * (1.0 + f0.rgb);
  s = mix(vec3(dot(s, vec3(.2126, .7152, .0722))), s, 1.0 + f0.a);
  s = mix(s, vec3(lum * 1.22), f1.x);
  float low = 1.0 - smoothstep(f4.z, f4.z + 6.0, world.y);
  s = mix(s, s * vec3(.72, 1.06, .66), f1.y * clamp(low + (1.0 - g.y) * 2.0, 0.0, 1.0));
  c = mix(c, s, veg);
  // Wind: bands of sheen rolling downwind across the grass.
  vec2 across = vec2(-f3.y, f3.x);
  float wave = uplandNoise(vec2((dot(world.xz, f3.xy) - f3.z) / 9.0, dot(world.xz, across) / 26.0));
  c *= 1.0 + f2.w * (wave - .5) * 2.0 * veg;
  // Wet ground darkens; the sheen is added with the light.
  wet = f2.x * surface;
  c *= 1.0 - wet * (.38 - .14 * veg);
  wet *= 1.0 - plant;
  // Frost: burns off where the sun reaches, lingers in shade and low ground.
  float facing = clamp(n.y, 0.0, 1.0);
  float sunward = clamp(dot(n.xz, ${FIELD_UNIFORM}[6].xy) * .8 + n.y * .45, 0.0, 1.0);
  float linger = max(max(1.0 - g.y * g.y, low), 1.0 - sunward);
  float frost = f2.y * (1.0 - f2.z * (1.0 - linger)) * surface;
  // Hoar on the ground's open faces and a grey rime on the grass, not a
  // blanket (plant normals often point up, so they take a fixed share).
  frost *= mix(.2 + .8 * smoothstep(.3, .95, facing), .5, plant);
  c = mix(c, vec3(.66, .72, .78), clamp(frost, 0.0, 1.0) * .24);
  // Snow: upward faces, deeper in the lee, broken into drifts, with the
  // grass standing through it. The fine drift detail settles to its mean
  // with distance so far snow does not sparkle.
  float drift = 1.0 + f3.w * dot(n.xz, f3.xy);
  float fine = mix(uplandNoise(world.xz / 2.3), .5, smoothstep(25.0, 90.0, length(world - cameraPosition)));
  float drifts = uplandNoise(world.xz / 7.0 + vec2(13.0, 3.0)) * .6 + fine * .4;
  float snow = f1.w * smoothstep(.55, .86, facing) * drift;
  snow = smoothstep(.3, .7, snow + (drifts - .5) * .55) * surface * (1.0 - .78 * plant);
  c = mix(c, vec3(.82, .85, .9), clamp(snow, 0.0, 1.0));
  return c;
}`;

const SURFACE = /* glsl */`
float uplandWet = 0.0;
#if defined( USE_FOG ) && defined( UPLAND_FIELD_LIT )
{
	// Not the skinned dog, not the gun at the eye; instanced plants apart.
	float uplandSurface = min( vUplandSurface, 1.0 ) * smoothstep( 1.6, 3.0, length( vFogRay ) );
	vec3 uplandWorldNormal = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
	diffuseColor.rgb = uplandFieldColor( diffuseColor.rgb, cameraPosition + vFogRay, uplandWorldNormal, uplandSurface, step( 1.5, vUplandSurface ), uplandWet );
	// Only open, upward ground takes a wet sheen; blades and rock faces do not.
	uplandWet *= smoothstep( .6, .95, uplandWorldNormal.y );
}
#endif`;
const SHEEN = /* glsl */`
// Wet ground catches the sky at a glancing angle.
reflectedLight.indirectDiffuse += ${FIELD_UNIFORM}[5].rgb * uplandWet * pow( 1.0 - clamp( dot( geometryNormal, geometryViewDir ), 0.0, 1.0 ), 5.0 ) * .16;`;
const MARK = '// upland field conditions';

/**
 * Patch three's normal-map and lights chunks and built-in uniforms. Must run
 * before any material compiles, after the atmosphere and ground light (it
 * uses their fog varyings and sky map). Returns false, leaving everything
 * alone, if three's chunks no longer read as expected.
 */
export function installFieldConditions(
  chunks: Record<string, string> = THREE.ShaderChunk as unknown as Record<string, string>,
  lib: Record<string, { uniforms: Record<string, THREE.IUniform> }> = THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, THREE.IUniform> }>,
): boolean {
  const maps = chunks.normal_fragment_maps, end = chunks.lights_fragment_end, pars = chunks.lights_pars_begin;
  if (maps === undefined || !end?.includes('reflectedLight') || !pars?.includes('uplandGroundLight')) return false;
  if (!maps.includes(MARK)) {
    chunks.lights_pars_begin = `${pars}\n${MARK}${FIELD_GLSL}`;
    chunks.normal_fragment_maps = `${maps}\n${MARK}${SURFACE}`;
    chunks.lights_fragment_end = `${end}\n${MARK}${SHEEN}`;
  }
  for (const shader of Object.values(lib)) Object.assign(shader.uniforms, fieldConditionsUniforms());
  return true;
}

/** A month's colours on one ground's vegetation. */
export interface SeasonLook {
  tint: readonly [number, number, number];
  saturation: number;
  bleach: number;
  swales: number;
  /** Snow lying on the ground whatever the day. */
  snow: number;
  /** Ice on the sloughs and stock dams, from the margins in. */
  ice: number;
}

const SEASON: Readonly<Record<Month, SeasonLook>> = {
  // Still green in the swales, the uplands curing.
  September: { tint: [-.07, .05, -.08], saturation: .06, bleach: 0, swales: .6, snow: 0, ice: 0 },
  // The colour peak: copper bluestem, gold cheat, red sumac.
  October: { tint: [.03, 0, -.05], saturation: .14, bleach: 0, swales: .12, snow: 0, ice: 0 },
  // Bleached and windy.
  November: { tint: [.01, -.01, -.03], saturation: -.22, bleach: .16, swales: 0, snow: 0, ice: .3 },
  // Winter: bleached straw under lying snow.
  December: { tint: [0, -.01, -.02], saturation: -.34, bleach: .26, swales: 0, snow: .4, ice: .85 },
  January: { tint: [0, -.01, -.02], saturation: -.4, bleach: .3, swales: 0, snow: .55, ice: 1 },
};

/** Each ground's departures from the plains year. */
const REGION_SEASON: Readonly<Record<string, Partial<Record<Month, Partial<SeasonLook>>>>> = {
  // Southern Plains: winters are mostly open.
  'quail-fields': { November: { ice: 0 }, December: { snow: 0, ice: .2 }, January: { snow: .1, ice: .35 } },
  // Cheatgrass greens after the November rains.
  'chukar-ridge': { November: { tint: [-.04, .05, -.04], saturation: -.06, bleach: .04 }, December: { snow: .3 } },
  // The Coteau whitens early.
  'sharptail-prairie': { November: { snow: .12 } },
};

export function seasonLook(areaId: string, month: Month): SeasonLook {
  return { ...SEASON[month], ...(REGION_SEASON[areaId]?.[month] ?? {}) };
}

/** What a condition does to the ground and air. */
export interface WeatherLook {
  wetness: number;
  frost: number;
  snow: number;
  /** Overcast over the sky (0 clear to 1 full deck). */
  overcast: number;
  /** Scales the sun and the distance fog. */
  sun: number;
  fog: number;
  /** Extra bleach and dust (hot days). */
  dust: number;
}

const WEATHER: Readonly<Record<Condition, WeatherLook>> = {
  mild: { wetness: 0, frost: 0, snow: 0, overcast: 0, sun: 1, fog: 1, dust: 0 },
  frost: { wetness: 0, frost: 1, snow: 0, overcast: 0, sun: 1, fog: .9, dust: 0 },
  hot: { wetness: 0, frost: 0, snow: 0, overcast: 0, sun: 1.05, fog: 1.25, dust: .1 },
  rain: { wetness: .85, frost: 0, snow: 0, overcast: .92, sun: .3, fog: 1.6, dust: 0 },
  snow: { wetness: .15, frost: 0, snow: .92, overcast: .8, sun: .45, fog: 1.4, dust: 0 },
};

export function weatherLook(condition: Condition): WeatherLook { return WEATHER[condition]; }

const grey = new THREE.Color(), tmp = new THREE.Color();
const toward = (hex: number, target: number, t: number) => tmp.setHex(hex).lerp(grey.setHex(target), t).getHex();

/**
 * The hour's light under a condition: an overcast deck greys and lowers the
 * sky, drops the sun and lifts the shade; fog thickens and greys in rain,
 * whitens in snow; heat hazes the far land warm.
 */
export function weatherSpec(spec: TodSpec, condition: Condition): TodSpec {
  const w = WEATHER[condition];
  if (condition === 'mild') return spec;
  // A frost morning is clear, still air.
  if (condition === 'frost') return { ...spec, fogDensity: spec.fogDensity * w.fog };
  const deck = condition === 'snow' ? 0xa9aeb4 : 0x8f969c;
  const o = w.overcast;
  return {
    ...spec,
    skyTop: toward(spec.skyTop, condition === 'snow' ? 0xa9b0b8 : 0x6f7880, o),
    skyMid: toward(spec.skyMid, deck, o),
    skyHorizon: toward(spec.skyHorizon, condition === 'snow' ? 0xd2d4d4 : 0xa4a8aa, o),
    hotStrength: spec.hotStrength * (1 - o), glowStrength: spec.glowStrength * (1 - o * .85),
    fogColor: condition === 'hot' ? toward(spec.fogColor, 0xb8a888, .35) : toward(spec.fogColor, condition === 'snow' ? 0xb6bcc2 : 0x8a9094, o * .7),
    fogDensity: spec.fogDensity * w.fog,
    sunIntensity: spec.sunIntensity * w.sun,
    fillIntensity: spec.fillIntensity * (1 - o * .4),
    ambientIntensity: spec.ambientIntensity * (1 + o * .55),
    ambientSky: toward(spec.ambientSky, deck, o * .6),
    cloudAmount: Math.max(spec.cloudAmount, o),
    groundSunK: spec.groundSunK * (1 - o), groundSunEmit: spec.groundSunEmit * (1 - o),
    exposure: spec.exposure * (1 + o * .12),
  };
}

/** Frost burns off over about a quarter of an hour where the sun reaches,
 * faster the higher the sun; an evening or noon hunt starts with most gone. */
export function frostBurn(tod: TimeOfDay, sunElevation: number, seconds: number): number {
  const start = tod === 'dawn' ? 0 : tod === 'morning' ? .15 : tod === 'lastlight' ? .3 : .85;
  const rate = Math.max(0, Math.sin(Math.max(0, sunElevation) * Math.PI / 180)) / (15 * 60 * .42);
  return Math.min(1, start + rate * seconds);
}

export interface FieldState {
  areaId: string;
  condition: Condition;
  month: Month;
  tod: TimeOfDay;
  sunElevation: number;
  /** Seconds since the field opened. */
  seconds: number;
  /** The hunt's wind: toward direction (world x, z) and 0 to 1 strength. */
  wind: { x: number; z: number; strength: number };
  /** The ground light's map: height floor and span, and the low ground. */
  ground: { minHeight: number; maxHeight: number; lowGround: number } | null;
  /** Sky colour wet ground reflects. */
  sky: THREE.Color;
  /** The sun's level direction (x, z, unit). */
  sun: { x: number; z: number };
}

/** Write the day into the shared values. */
export function writeFieldConditions(s: FieldState, out: Float32Array = FIELD): void {
  const season = seasonLook(s.areaId, s.month), w = WEATHER[s.condition];
  out.fill(0);
  out[0] = season.tint[0]; out[1] = season.tint[1]; out[2] = season.tint[2]; out[3] = season.saturation - w.dust * .5;
  out[4] = Math.min(.6, season.bleach + w.dust); out[5] = s.condition === 'snow' ? 0 : season.swales;
  out[6] = season.ice; out[7] = Math.min(1, Math.max(season.snow, w.snow));
  out[8] = w.wetness; out[9] = w.frost; out[10] = frostBurn(s.tod, s.sunElevation, s.seconds);
  // Calm air barely stirs the grass; a strong wind rolls bright bands.
  out[11] = .025 + .1 * s.wind.strength;
  out[12] = s.wind.x; out[13] = s.wind.z; out[14] = (2 + 9 * s.wind.strength) * s.seconds; out[15] = .45 + .5 * s.wind.strength;
  if (s.ground) { out[16] = s.ground.minHeight; out[17] = s.ground.maxHeight - s.ground.minHeight; out[18] = s.ground.lowGround; out[19] = 1; }
  out[20] = s.sky.r; out[21] = s.sky.g; out[22] = s.sky.b;
  out[24] = s.sun.x; out[25] = s.sun.z;
}
