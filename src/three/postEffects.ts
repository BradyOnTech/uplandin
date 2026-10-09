import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { lookAt, type LookSettings } from './looks';
import type { TimeOfDay } from './palette';
import { OCCLUSION_WEIGHT_ACTIVE } from './foliageMask';
import { GRADE_GLSL, gradeUniforms } from './grade';

/**
 * Screen effects for the desktop High tier: the scene renders once into a
 * multisampled HDR target with depth (linear: three never tone maps into a
 * render target, so the materials' built-in grade waits for step 4), then
 *   1. ambient occlusion from that depth at half resolution (no second
 *      scene render), blurred along depth edges;
 *   2. a composite applies the occlusion;
 *   3. bloom on the HDR image;
 *   4. a final pass runs the same tone mapping and grade every material runs
 *      on Lightweight (grade.ts, with the time of day's exposure) and writes
 *      sRGB to the screen. High grades once, and both tiers match apart from
 *      occlusion and bloom. The haze lives in every material's fog
 *      (atmosphere.ts).
 * The gun and hands, inside a metre, take no occlusion, and the falloff
 * keeps them from casting halos on the field behind. The scene's alpha is an
 * occlusion weight (foliageMask.ts): grass and other foliage write less than
 * 1, so they take and cast only part of the occlusion. `?lookdebug=1,2,4..6`
 * shows occlusion, depth, raw occlusion, its stored depth or the occlusion
 * weight.
 */

const VERTEX = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const VIEW_POSITION = /* glsl */`
#include <packing>
uniform float uNear;
uniform float uFar;
uniform vec2 uTanHalf;
float viewZ(float depth) { return perspectiveDepthToViewZ(depth, uNear, uFar); }
vec3 viewPosition(vec2 uv, float depth) {
  float z = viewZ(depth);
  return vec3((uv * 2.0 - 1.0) * uTanHalf * -z, z);
}`;

const AO_FRAGMENT = /* glsl */`
${VIEW_POSITION}
uniform sampler2D tDepth;
uniform sampler2D tColor;
uniform vec2 uFullSize;
uniform float uProjScale;
uniform float uRadius;
uniform float uIntensity;
uniform float uMaxDistance;
varying vec2 vUv;
float depthAt(vec2 uv) { return texture2D(tDepth, uv).x; }
float noise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
void main() {
  // Half-resolution pixel centres fall on full-resolution texel edges; snap
  // to a texel centre so nearest-filtered depth reads stay unambiguous.
  vec2 uv0 = (floor(vUv * uFullSize) + .5) / uFullSize;
  float depth = depthAt(uv0);
  if (depth >= .99999) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
  vec3 p = viewPosition(uv0, depth);
  float dist = -p.z;
  // The gun and hands sit inside a metre; they keep their own shading.
  if (dist > uMaxDistance || dist < 1.2) { gl_FragColor = vec4(1.0, dist, 0.0, 1.0); return; }
  // Normal from depth, taking the flatter neighbour on each axis so
  // silhouettes do not smear across depth edges.
  vec2 texel = 1.0 / uFullSize;
  vec2 ux = vec2(texel.x, 0.0), uy = vec2(0.0, texel.y);
  vec3 pr = viewPosition(uv0 + ux, depthAt(uv0 + ux)), pl = viewPosition(uv0 - ux, depthAt(uv0 - ux));
  vec3 pu = viewPosition(uv0 + uy, depthAt(uv0 + uy)), pd = viewPosition(uv0 - uy, depthAt(uv0 - uy));
  // A wire or a single distant blade has both neighbours on one axis far
  // behind it. Its colour is mostly the ground through it (multisampled),
  // so it gets no occlusion of its own.
  float gap = .15 * dist + .1;
  if ((pr.z < p.z - gap && pl.z < p.z - gap) || (pu.z < p.z - gap && pd.z < p.z - gap)) {
    gl_FragColor = vec4(1.0, dist, 0.0, 1.0); return;
  }
  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
  vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
  vec3 n = cross(dx, dy);
  if (dot(n, n) < 1e-12) { gl_FragColor = vec4(1.0, dist, 0.0, 1.0); return; }
  n = normalize(n);
  if (dot(n, p) > 0.0) n = -n;
  // Scalable ambient obscurance (McGuire et al. 2012) on a golden-angle disk.
  float screenRadius = clamp(uRadius * uProjScale / dist, 2.0, 96.0);
  float spin = noise(gl_FragCoord.xy) * 6.2831853;
  float r2 = uRadius * uRadius;
  float bias = .012 + dist * .0015;
  float sum = 0.0;
  const int SAMPLES = 12;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + .5) / float(SAMPLES);
    float angle = float(i) * 2.39996323 + spin;
    vec2 uv = uv0 + vec2(cos(angle), sin(angle)) * sqrt(t) * screenRadius * texel;
    vec3 v = viewPosition(uv, depthAt(uv)) - p;
    float vv = dot(v, v);
    float f = max(r2 - vv, 0.0);
    // Foliage casts only its share of occlusion (the scene's alpha).
    float occluder = clamp(texture2D(tColor, uv).a, 0.0, 1.0);
    sum += occluder * f * f * f * max((dot(v, n) - bias) / (.01 + vv), 0.0);
  }
  float ao = max(0.0, 1.0 - sum * uIntensity * 5.0 / (r2 * r2 * r2 * float(SAMPLES)));
  ao = mix(ao, 1.0, smoothstep(uMaxDistance * .6, uMaxDistance, dist));
  gl_FragColor = vec4(ao, dist, 0.0, 1.0);
}`;

const BLUR_FRAGMENT = /* glsl */`
uniform sampler2D tAO;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  vec4 centre = texture2D(tAO, vUv);
  float z = centre.g, sum = centre.r, weight = 1.0;
  for (int i = -4; i <= 4; i++) {
    if (i == 0) continue;
    vec4 s = texture2D(tAO, vUv + uStep * float(i));
    float w = exp(-float(i * i) / 10.0) * exp(-abs(s.g - z) / (.03 * z + .05));
    sum += s.r * w; weight += w;
  }
  gl_FragColor = vec4(sum / weight, z, 0.0, 1.0);
}`;

/** The brightest linear value a scene pixel keeps on its way to the bloom. */
export const HDR_CEILING = 10;

const COMPOSITE_FRAGMENT = /* glsl */`
${VIEW_POSITION}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tAO;
uniform vec2 uAOSize;
uniform vec2 uFullSize;
uniform float uAOStrength;
uniform float uSkyDistance;
uniform int uDebug;
varying vec2 vUv;
void main() {
  vec4 color = texture2D(tColor, vUv);
  // A ceiling above anything the field draws (prairie water's sun glint,
  // the brightest, peaks a little over 8) and a floor at black: a single
  // wild pixel must not reach the bloom, which would spread it into a flash
  // across the frame (centroidColors.ts has the one we found).
  color.rgb = clamp(color.rgb, 0.0, ${HDR_CEILING.toFixed(1)});
  float depth = texture2D(tDepth, vUv).x;
  bool sky = depth >= .99999;
  float z = sky ? uSkyDistance : -viewZ(depth);
  bool thin = false;
  if (!sky) {
    // A wire or single blade: multisampled colour is mostly what lies
    // behind it, so it skips occlusion.
    vec2 texel = 1.0 / uFullSize;
    float zl = texture2D(tDepth, vUv - vec2(texel.x, 0.0)).x, zr = texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x;
    float zd = texture2D(tDepth, vUv - vec2(0.0, texel.y)).x, zu = texture2D(tDepth, vUv + vec2(0.0, texel.y)).x;
    float gap = .15 * z + .1;
    float behindX = min(zl >= .99999 ? uSkyDistance : -viewZ(zl), zr >= .99999 ? uSkyDistance : -viewZ(zr));
    float behindY = min(zd >= .99999 ? uSkyDistance : -viewZ(zd), zu >= .99999 ? uSkyDistance : -viewZ(zu));
    thin = behindY > z + gap || behindX > z + gap;
  }
  if (!sky && !thin) {
    // Joint bilateral upsample of the half-resolution occlusion.
    vec2 st = vUv * uAOSize - .5, f = fract(st), t = 1.0 / uAOSize;
    vec2 base = (floor(st) + .5) * t;
    vec4 a00 = texture2D(tAO, base), a10 = texture2D(tAO, base + vec2(t.x, 0.0));
    vec4 a01 = texture2D(tAO, base + vec2(0.0, t.y)), a11 = texture2D(tAO, base + t);
    vec4 bilinear = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
    vec4 near = exp(-abs(vec4(a00.g, a10.g, a01.g, a11.g) - z) / (.04 * z + .05));
    vec4 w = bilinear * near + 1e-4;
    float ao = dot(w, vec4(a00.r, a10.r, a01.r, a11.r)) / dot(w, vec4(1.0));
    // Foliage takes only its share of occlusion (the scene's alpha).
    ao = mix(1.0, ao, clamp(color.a, 0.0, 1.0));
    color.rgb *= mix(1.0, ao, uAOStrength);
    if (uDebug == 1) { gl_FragColor = vec4(vec3(ao), 1.0); return; }
  }
  if (uDebug == 4) { gl_FragColor = vec4(vec3(texture2D(tAO, vUv).r), 1.0); return; }
  if (uDebug == 6) { gl_FragColor = vec4(vec3(clamp(color.a, 0.0, 1.0)), 1.0); return; }
  if (uDebug == 5) { gl_FragColor = vec4(vec3(texture2D(tAO, vUv).g / 8.0), 1.0); return; }
  if (uDebug == 2) { gl_FragColor = vec4(z / 8.0, fract(z * 4.0), sky ? 1.0 : 0.0, 1.0); return; }
  gl_FragColor = color;
}`;

const FINAL_FRAGMENT = /* glsl */`
uniform sampler2D tColor;
uniform float uExposure;
uniform int uRaw;
varying vec2 vUv;
${GRADE_GLSL}
void main() {
  if (uRaw == 1) { gl_FragColor = vec4(texture2D(tColor, vUv).rgb, 1.0); return; }
  gl_FragColor = vec4(uplandGradeDisplay(texture2D(tColor, vUv).rgb, uExposure), 1.0);
}`;

/** The scene renders into half-float colour; without a renderable half-float
 * format the field keeps the plain render. */
export function supportsScreenEffects(renderer: Pick<THREE.WebGLRenderer, 'extensions'>): boolean {
  return renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
}

const screenMaterial = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
  new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });

export class PostEffects {
  private width = 1;
  private height = 1;
  private readonly sceneTarget: THREE.WebGLRenderTarget;
  private readonly aoTarget: THREE.WebGLRenderTarget;
  private readonly aoBlurTarget: THREE.WebGLRenderTarget;
  private readonly hdrTarget: THREE.WebGLRenderTarget;
  private readonly quad = new FullScreenQuad();
  private readonly ao: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly final: THREE.ShaderMaterial;
  private readonly bloom: UnrealBloomPass;
  private tod: TimeOfDay = 'morning';
  private ground?: string;

  constructor(private look: LookSettings) {
    const hdr = { type: THREE.HalfFloatType, depthBuffer: false } as const;
    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1),
    });
    this.aoTarget = new THREE.WebGLRenderTarget(1, 1, hdr);
    this.aoBlurTarget = new THREE.WebGLRenderTarget(1, 1, hdr);
    this.hdrTarget = new THREE.WebGLRenderTarget(1, 1, hdr);
    const view = () => ({ uNear: { value: .05 }, uFar: { value: 1600 }, uTanHalf: { value: new THREE.Vector2(1, 1) } });
    this.ao = screenMaterial(AO_FRAGMENT, {
      ...view(), tDepth: { value: this.sceneTarget.depthTexture }, tColor: { value: this.sceneTarget.texture }, uFullSize: { value: new THREE.Vector2(1, 1) },
      uProjScale: { value: 1 }, uRadius: { value: 1 }, uIntensity: { value: 1 }, uMaxDistance: { value: 100 },
    });
    this.blur = screenMaterial(BLUR_FRAGMENT, { tAO: { value: null }, uStep: { value: new THREE.Vector2() } });
    this.composite = screenMaterial(COMPOSITE_FRAGMENT, {
      ...view(), tColor: { value: this.sceneTarget.texture }, tDepth: { value: this.sceneTarget.depthTexture },
      tAO: { value: this.aoTarget.texture }, uAOSize: { value: new THREE.Vector2(1, 1) }, uFullSize: { value: new THREE.Vector2(1, 1) }, uAOStrength: { value: 0 },
      uSkyDistance: { value: 900 }, uDebug: { value: 0 },
    });
    this.final = screenMaterial(FINAL_FRAGMENT, {
      tColor: { value: this.hdrTarget.texture }, uExposure: { value: 1 }, uRaw: { value: 0 }, ...gradeUniforms(),
    });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, 0, 1);
    this.setLook(look);
  }

  /** Look-development views: 0 the image, 1 occlusion, 2 depth bands,
   * 4 raw occlusion, 5 its stored depth, 6 the occlusion weight. */
  setDebug(mode: number): void { this.composite.uniforms.uDebug.value = mode; this.final.uniforms.uRaw.value = mode ? 1 : 0; }

  /** Occlusion and bloom follow the field's time of day (see
   * LookSettings.byTime); the grade is written by the field (grade.ts). */
  setTimeOfDay(tod: TimeOfDay): void {
    this.tod = tod;
    this.setLook(this.look);
  }

  /** And the ground (see LookSettings.byGround), by area id. */
  setGround(areaId: string): void {
    this.ground = areaId;
    this.setLook(this.look);
  }

  setLook(base: LookSettings): void {
    this.look = base;
    const look = lookAt(base, this.tod, this.ground);
    const a = this.ao.uniforms, c = this.composite.uniforms;
    a.uRadius.value = look.ao.radius; a.uIntensity.value = look.ao.intensity; a.uMaxDistance.value = look.ao.maxDistance;
    c.uAOStrength.value = look.ao.strength;
    this.bloom.strength = look.bloom.strength; this.bloom.radius = look.bloom.radius; this.bloom.threshold = look.bloom.threshold;
  }

  /** Drawing-buffer size in pixels. */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width)); this.height = Math.max(1, Math.round(height));
    const halfW = Math.max(1, Math.round(this.width / 2)), halfH = Math.max(1, Math.round(this.height / 2));
    this.sceneTarget.setSize(this.width, this.height);
    this.aoTarget.setSize(halfW, halfH); this.aoBlurTarget.setSize(halfW, halfH);
    this.hdrTarget.setSize(this.width, this.height);
    this.bloom.setSize(this.width, this.height);
    (this.ao.uniforms.uFullSize.value as THREE.Vector2).set(this.width, this.height);
    (this.composite.uniforms.uAOSize.value as THREE.Vector2).set(halfW, halfH);
    (this.composite.uniforms.uFullSize.value as THREE.Vector2).set(this.width, this.height);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.sceneTarget);
    // Foliage writes its occlusion weight only into this target.
    OCCLUSION_WEIGHT_ACTIVE.value = 1;
    try { renderer.render(scene, camera); } finally { OCCLUSION_WEIGHT_ACTIVE.value = 0; }
    this.syncView(camera);
    this.quad.material = this.ao; renderer.setRenderTarget(this.aoTarget); this.quad.render(renderer);
    const step = this.blur.uniforms.uStep.value as THREE.Vector2;
    this.blur.uniforms.tAO.value = this.aoTarget.texture; step.set(1 / this.aoTarget.width, 0);
    this.quad.material = this.blur; renderer.setRenderTarget(this.aoBlurTarget); this.quad.render(renderer);
    this.blur.uniforms.tAO.value = this.aoBlurTarget.texture; step.set(0, 1 / this.aoTarget.height);
    renderer.setRenderTarget(this.aoTarget); this.quad.render(renderer);
    this.quad.material = this.composite; renderer.setRenderTarget(this.hdrTarget); this.quad.render(renderer);
    if (this.look.bloom.strength > 0 && !this.final.uniforms.uRaw.value) this.bloom.render(renderer, this.hdrTarget, this.hdrTarget, 0, false);
    this.final.uniforms.uExposure.value = renderer.toneMappingExposure;
    this.quad.material = this.final; renderer.setRenderTarget(previous); this.quad.render(renderer);
  }

  private syncView(camera: THREE.PerspectiveCamera): void {
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    for (const material of [this.ao, this.composite]) {
      const u = material.uniforms;
      u.uNear.value = camera.near; u.uFar.value = camera.far;
      (u.uTanHalf.value as THREE.Vector2).set(tanY * camera.aspect, tanY);
    }
    this.ao.uniforms.uProjScale.value = this.height / (2 * tanY);
  }

  dispose(): void {
    this.sceneTarget.depthTexture?.dispose();
    for (const target of [this.sceneTarget, this.aoTarget, this.aoBlurTarget, this.hdrTarget]) target.dispose();
    for (const material of [this.ao, this.blur, this.composite, this.final]) material.dispose();
    this.bloom.dispose(); this.quad.dispose();
  }
}
