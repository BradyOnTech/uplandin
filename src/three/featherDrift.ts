import * as THREE from 'three';

/**
 * Body feathers knocked loose by a hit (October 2026). Each one drifts down
 * on its own: it bursts off the bird, loses its speed to the air within a
 * moment, then flutters and sails down with the wind at under a metre a
 * second. Feathers that reach the ground lie there a little while, marking
 * the spot, then fade. Stepped on the fixed tick, so captures and live play
 * agree. One draw call for every feather in the field.
 */
export interface FeatherColors { colors: readonly THREE.Color[] }

const hex = (value: number) => new THREE.Color(value);
/** Loose-feather tones per species: the body, not the wing coverts. */
export const FEATHER_TONES: Record<string, readonly THREE.Color[]> = {
  'ringneck:rooster': [hex(0x9a4a22), hex(0xc4954a), hex(0x3a2a1e), hex(0xd2b27a), hex(0x6d7d76)],
  'ringneck:hen': [hex(0xc2a275), hex(0x8a6a46), hex(0x5a4430), hex(0xdcc49a)],
  hun: [hex(0x9a9488), hex(0xa0582c), hex(0xc8b490), hex(0x6a645c)],
  sharptail: [hex(0xd8ccb0), hex(0x7a5e40), hex(0xe8e2d4), hex(0x5a4632)],
  'prairie-chicken': [hex(0xc8b08a), hex(0x6e5236), hex(0xe2d6bc)],
  bobwhite: [hex(0x7a5236), hex(0xc8a878), hex(0xe8e0cc), hex(0x4a3424)],
  chukar: [hex(0xa8a49c), hex(0xc8b28a), hex(0x4a3a2e), hex(0xe2dccf)],
};
const DEFAULT_TONES = [hex(0xd2c29a), hex(0x8a6e4c), hex(0x5a4632)];

export function featherTones(speciesId: string, sex?: 'hen' | 'rooster'): readonly THREE.Color[] {
  return FEATHER_TONES[`${speciesId}:${sex ?? 'rooster'}`] ?? FEATHER_TONES[speciesId] ?? DEFAULT_TONES;
}

/** Seconds a feather lies on the ground before it starts to fade, and the fade. */
const REST_S = 2.6, FADE_S = 1.4, MAX_LIFE_S = 9;

export class FeatherDrift {
  readonly points: THREE.Points;
  private readonly position: Float32Array;
  private readonly color: Float32Array;
  private readonly alpha: Float32Array;
  private readonly size: Float32Array;
  private readonly velocity: Float32Array;
  private readonly flutter: Float32Array;
  private readonly age: Float32Array;
  private readonly restAge: Float32Array;
  private next = 0;
  private live = 0;

  constructor(readonly capacity = 96) {
    this.position = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.alpha = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.velocity = new Float32Array(capacity * 3);
    /** Per feather: phase, rate (rad/s), sway (m/s), fall speed (m/s). */
    this.flutter = new Float32Array(capacity * 4);
    this.age = new Float32Array(capacity).fill(-1);
    this.restAge = new Float32Array(capacity).fill(-1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    geometry.setAttribute('featherAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geometry.setAttribute('featherSize', new THREE.BufferAttribute(this.size, 1));
    const material = new THREE.PointsMaterial({ size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float featherAlpha;\nattribute float featherSize;\nvarying float vFeatherAlpha;')
        .replace('gl_PointSize = size;', 'gl_PointSize = size * featherSize;\n\tvFeatherAlpha = featherAlpha;');
      // A tapered body feather rather than a square point sprite.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFeatherAlpha;')
        .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 featherUV = gl_PointCoord * 2.0 - 1.0;
        float featherEdge = 1.0 - abs(featherUV.y) * .95 - abs(featherUV.x) * 2.2;
        if (featherEdge <= 0.0 || vFeatherAlpha <= 0.0) discard;
        diffuseColor.a *= vFeatherAlpha * smoothstep(0.0, .25, featherEdge);
        diffuseColor.rgb *= .82 + .18 * (1.0 - featherUV.y);`);
    };
    material.customProgramCacheKey = () => 'uplandin-feather-drift-v1';
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.name = 'Loose feathers';
  }

  /** Feathers in the air or on the ground. */
  get count(): number { return this.live; }

  /** Knock `count` feathers loose at a hit, carrying a little of the bird's speed. */
  emit(at: { x: number; y: number; z: number }, birdVelocity: { x: number; y: number; z: number }, count: number,
    tones: readonly THREE.Color[], rng: () => number): void {
    for (let n = 0; n < count; n++) {
      const i = this.next; this.next = (this.next + 1) % this.capacity;
      if (this.age[i] < 0) this.live++;
      const j = i * 3, f = i * 4;
      this.position[j] = at.x + (rng() - .5) * .3;
      this.position[j + 1] = at.y + (rng() - .5) * .2;
      this.position[j + 2] = at.z + (rng() - .5) * .3;
      const azimuth = rng() * Math.PI * 2, burst = .6 + rng() * 1.6;
      this.velocity[j] = Math.cos(azimuth) * burst + birdVelocity.x * .18;
      this.velocity[j + 1] = .3 + rng() * 1.1 + Math.max(0, birdVelocity.y) * .1;
      this.velocity[j + 2] = Math.sin(azimuth) * burst + birdVelocity.z * .18;
      const tone = tones[Math.floor(rng() * tones.length) % tones.length];
      this.color[j] = tone.r; this.color[j + 1] = tone.g; this.color[j + 2] = tone.b;
      this.size[i] = .085 + rng() * .075;
      this.alpha[i] = 1;
      this.flutter[f] = rng() * Math.PI * 2;
      this.flutter[f + 1] = 3.5 + rng() * 4;
      this.flutter[f + 2] = .22 + rng() * .3;
      this.flutter[f + 3] = .45 + rng() * .5;
      this.age[i] = 0; this.restAge[i] = -1;
    }
    this.points.visible = this.live > 0;
    this.touch();
  }

  /** One fixed tick: drag, flutter, wind drift; landing and fading. */
  step(dt: number, groundAt: (x: number, z: number) => number, wind: { x: number; z: number }): void {
    if (this.live === 0) return;
    const drag = Math.exp(-2.4 * dt), settle = 1 - Math.exp(-2 * dt);
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i] < 0) continue;
      this.age[i] += dt;
      const j = i * 3, f = i * 4;
      if (this.restAge[i] >= 0) {
        this.restAge[i] += dt;
        this.alpha[i] = 1 - Math.min(1, Math.max(0, (this.restAge[i] - REST_S) / FADE_S));
      } else {
        this.velocity[j] *= drag; this.velocity[j + 2] *= drag;
        this.velocity[j + 1] += (-this.flutter[f + 3] - this.velocity[j + 1]) * settle;
        this.flutter[f] += this.flutter[f + 1] * dt;
        const sway = this.flutter[f + 2];
        this.position[j] += (this.velocity[j] + Math.cos(this.flutter[f]) * sway + wind.x) * dt;
        this.position[j + 1] += (this.velocity[j + 1] + Math.sin(this.flutter[f] * 2) * sway * .35) * dt;
        this.position[j + 2] += (this.velocity[j + 2] + Math.sin(this.flutter[f] * .7) * sway + wind.z) * dt;
        const ground = groundAt(this.position[j], this.position[j + 2]) + .02;
        if (this.position[j + 1] <= ground) { this.position[j + 1] = ground; this.restAge[i] = 0; }
      }
      if (this.alpha[i] <= 0 || this.age[i] > MAX_LIFE_S) {
        this.age[i] = -1; this.alpha[i] = 0; this.live--;
      }
    }
    this.points.visible = this.live > 0;
    this.touch();
  }

  /** Clear every feather (a new hunt, or tests). */
  clear(): void {
    this.age.fill(-1); this.restAge.fill(-1); this.alpha.fill(0); this.live = 0; this.next = 0;
    this.points.visible = false; this.touch();
  }

  /** Read-only view for tests and telemetry. */
  feather(i: number): { x: number; y: number; z: number; alpha: number; landed: boolean } | null {
    if (this.age[i] < 0) return null;
    return { x: this.position[i * 3], y: this.position[i * 3 + 1], z: this.position[i * 3 + 2], alpha: this.alpha[i], landed: this.restAge[i] >= 0 };
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }

  private touch(): void {
    const g = this.points.geometry;
    for (const name of ['position', 'featherAlpha', 'color', 'featherSize']) (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }
}
