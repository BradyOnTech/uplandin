import * as THREE from 'three';
import type { Condition } from '../game/conditions';
import type { Quality } from './engine';
import { gradeUniforms } from './grade';

/**
 * A capped handful of weather near the hunter, in one draw on either tier:
 * rain streaks, snowflakes, or wind-blown chaff (seed heads and leaf bits)
 * on dry days, so the wind reads even with the HUD off. The points live in a
 * box that rides the camera and wrap inside it; their motion is all in the
 * vertex shader, driven by the hunt's wind and the field's clock.
 */

/** Points per tier and kind: small, fixed caps. */
export const WEATHER_PARTICLES: Readonly<Record<Quality, Readonly<Record<'rain' | 'snow' | 'chaff', number>>>> = {
  high: { rain: 420, snow: 360, chaff: 70 },
  lite: { rain: 220, snow: 190, chaff: 36 },
};
/** The box round the hunter, metres. */
const BOX = { x: 18, y: 10, z: 18 };

export type ParticleKind = 'rain' | 'snow' | 'chaff';
export function particleKind(condition: Condition): ParticleKind {
  return condition === 'rain' ? 'rain' : condition === 'snow' ? 'snow' : 'chaff';
}

const VERTEX = /* glsl */`
attribute float aSeed;
uniform vec3 uCamera;
uniform vec2 uWind;
uniform float uWindSpeed;
uniform float uTime;
uniform float uKind;
uniform float uSize;
uniform vec3 uBox;
varying float vFade;
varying float vSeed;
void main() {
  vec3 p = position;
  float t = uTime;
  vec3 drift;
  if (uKind < .5) drift = vec3(uWind * uWindSpeed * .35, -9.0);             // rain
  else if (uKind < 1.5) drift = vec3(uWind * uWindSpeed * .55, -1.1);       // snow
  else drift = vec3(uWind * uWindSpeed * 1.15, .15 * sin(t * 1.7 + aSeed * 40.0)); // chaff
  vec3 moved = p + vec3(drift.x, drift.z, drift.y) * t;
  if (uKind > .5) moved.xz += vec2(sin(t * .9 + aSeed * 31.0), cos(t * .7 + aSeed * 17.0)) * (uKind < 1.5 ? .6 : .25);
  // Wrap inside the box round the hunter.
  vec3 local = mod(moved - uCamera + uBox * .5, uBox) - uBox * .5;
  // Chaff skims the grass; rain and snow fill the air.
  if (uKind > 1.5) local.y = mod(local.y, 3.2) - 1.4;
  vec4 mv = viewMatrix * vec4(uCamera + local, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vFade = smoothstep(.6, 2.0, d) * (1.0 - smoothstep(uBox.x * .36, uBox.x * .5, length(local.xz)));
  vSeed = aSeed;
  gl_PointSize = uSize * (uKind < .5 ? 1.6 : 1.0) / max(d, .5);
}`;

const FRAGMENT = /* glsl */`
uniform float uKind;
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
varying float vSeed;
void main() {
  vec2 q = gl_PointCoord - .5;
  float a;
  if (uKind < .5) a = (1.0 - smoothstep(.02, .07, abs(q.x))) * (1.0 - smoothstep(.3, .5, abs(q.y)));      // a streak
  else if (uKind < 1.5) a = 1.0 - smoothstep(.2, .5, length(q));                                            // a flake
  else a = (1.0 - smoothstep(.12, .3, abs(q.y + q.x * (vSeed - .5)))) * (1.0 - smoothstep(.25, .45, abs(q.x))); // a fleck
  a *= vFade * uOpacity;
  if (a < .02) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface WeatherParticles {
  points: THREE.Points;
  kind: ParticleKind;
  count: number;
  update(camera: THREE.Vector3, wind: { x: number; z: number; strength: number }, time: number, light: THREE.Color): void;
  dispose(): void;
}

/** Build the hunt's weather points for a condition on a tier. */
export function createWeatherParticles(condition: Condition, quality: Quality, seed = 1): WeatherParticles {
  const kind = particleKind(condition), count = WEATHER_PARTICLES[quality][kind];
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const positions = new Float32Array(count * 3), seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rand() - .5) * BOX.x; positions[i * 3 + 1] = (rand() - .5) * BOX.y; positions[i * 3 + 2] = (rand() - .5) * BOX.z;
    seeds[i] = rand();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const color = new THREE.Color(kind === 'rain' ? 0xb8c2cc : kind === 'snow' ? 0xf2f4f6 : 0xb79c6a);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, fog: false,
    uniforms: {
      uCamera: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(1, 0) }, uWindSpeed: { value: 0 },
      uTime: { value: 0 }, uKind: { value: kind === 'rain' ? 0 : kind === 'snow' ? 1 : 2 },
      uSize: { value: kind === 'rain' ? 70 : kind === 'snow' ? 34 : 26 }, uBox: { value: new THREE.Vector3(BOX.x, BOX.y, BOX.z) },
      uColor: { value: color.clone() }, uOpacity: { value: kind === 'rain' ? .45 : kind === 'snow' ? .9 : .85 },
      ...gradeUniforms(),
    },
  });
  const points = new THREE.Points(geometry, material);
  points.name = `weather ${kind}`;
  points.frustumCulled = false;
  points.renderOrder = 20;
  const u = material.uniforms;
  return {
    points, kind, count,
    update(camera, wind, time, light) {
      (u.uCamera.value as THREE.Vector3).copy(camera);
      (u.uWind.value as THREE.Vector2).set(wind.x, wind.z);
      // Chaff only flies when there is wind to carry it.
      u.uWindSpeed.value = 2 + 9 * wind.strength;
      u.uTime.value = time;
      (u.uColor.value as THREE.Color).copy(color).multiply(light);
      if (kind === 'chaff') u.uOpacity.value = .85 * Math.min(1, wind.strength * 1.6);
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
