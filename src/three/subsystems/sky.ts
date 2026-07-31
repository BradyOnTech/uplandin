import * as THREE from 'three';
import type { Ctx, Subsystem } from '../engine';
import { TOD, type TimeOfDay } from '../palette';

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
varying vec3 vPos;

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
  float g2 = pow(d, 42.0) * uGlowStrength;
  col = mix(col, uGlowMid, clamp(g2 * 0.85, 0.0, 0.85));
  float g3 = pow(d, 220.0) * uGlowStrength;
  col = mix(col, uSunDisc, clamp(g3, 0.0, 0.95));

  // Below the horizon, settle to the fog color (ground haze, soft seam) —
  // fast, so any sliver between terrain rim and ridge cards reads as haze.
  col = mix(col, uBelow, smoothstep(0.0, 0.05, -h));

  // Sun disc with a soft edge; it may set into the haze but not below it.
  float disc = smoothstep(uDiscCos.x, uDiscCos.y, d) * smoothstep(-0.035, -0.005, h);
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
varying vec2 vDirXZ;
void main() {
  vDirXZ = position.xz; // ring is camera-centered: model xz = azimuth dir
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RIDGE_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform vec3 uSpill;
uniform float uSpillStrength;
uniform vec2 uSunXZ;
varying vec2 vDirXZ;
void main() {
  float az = max(dot(normalize(vDirXZ), uSunXZ), 0.0);
  float spill = pow(az, 12.0) * uSpillStrength;
  vec3 col = mix(uCol, uSpill, clamp(spill, 0.0, 0.6));
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
}> = [
  { radius: 300, base: 14, amp: 28, far: 0.0, fogMix: 0.1 },
  { radius: 430, base: 24, amp: 46, far: 0.55, fogMix: 0.22 },
  { radius: 600, base: 38, amp: 72, far: 1.0, fogMix: 0.38 },
];
// Nearest band carries a serrated conifer line, so it gets the resolution.
const RIDGE_SEGS = [1536, 512, 384] as const;
const RIDGE_BOTTOM = -40;
const TREE_COUNT = 210; // conifers around the nearest ring (~9 m spacing)

export class SkySystem implements Subsystem {
  readonly id = 'sky';
  private dome!: THREE.Mesh;
  private mat!: THREE.ShaderMaterial;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private ridges: THREE.Mesh[] = [];
  private ridgeMats: THREE.ShaderMaterial[] = [];
  // Preallocated scratch (no per-frame or per-apply allocations).
  private ridgeBase = new THREE.Color();
  private ridgeFar = new THREE.Color();
  private fogCol = new THREE.Color();

  init(ctx: Ctx): void {
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

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    const shadowRes = ctx.quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(shadowRes, shadowRes);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    const s = 90;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0004;
    ctx.scene.add(this.sun);
    ctx.scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    ctx.scene.add(this.hemi);

    ctx.scene.fog = new THREE.FogExp2(0xffffff, 0.005);

    this.apply(ctx, ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => this.apply(ctx, e.detail)) as EventListener);
  }

  /**
   * Distant ridge lines, Firewatch's signature: 2-3 silhouette bands at
   * different radii, each flattened toward the fog color with distance.
   * Camera-following rings (zero parallax backdrop), deterministic from
   * ctx.rng, built once. The skyline is AUTHORED shape language, not a
   * sine wiggle: a handful of asymmetric peaks with one dominant summit
   * off-center, saddles between, and — nearest band only — a serrated
   * conifer line along the crest (the Firewatch e3-5 treeline).
   */
  private buildRidges(ctx: Ctx): void {
    for (let l = 0; l < RIDGE_LAYERS.length; l++) {
      const layer = RIDGE_LAYERS[l];
      const SEG = RIDGE_SEGS[l];
      // Asymmetric peaks: gaussian summits with different left/right sigmas.
      const peaks: Array<{ c: number; h: number; sl: number; sr: number }> = [];
      for (let p = 0; p < 5; p++) {
        peaks.push({
          c: ctx.rng() * Math.PI * 2,
          h: p === 0 ? layer.amp * (0.85 + ctx.rng() * 0.3) : layer.amp * (0.2 + ctx.rng() * 0.4),
          sl: 0.22 + ctx.rng() * 0.5,
          sr: (0.22 + ctx.rng() * 0.5) * (0.45 + ctx.rng() * 1.2),
        });
      }
      const rp1 = ctx.rng() * Math.PI * 2;
      const rp2 = ctx.rng() * Math.PI * 2;
      const treePhase = ctx.rng();
      const treeMod = ctx.rng() * Math.PI * 2;
      const positions = new Float32Array((SEG + 1) * 2 * 3);
      const indices: number[] = [];
      for (let i = 0; i <= SEG; i++) {
        const theta = (i / SEG) * Math.PI * 2;
        // Rolling connective tissue between summits.
        let h =
          layer.base +
          0.16 * layer.amp * Math.sin(2 * theta + rp1) +
          0.09 * layer.amp * Math.sin(5 * theta + rp2);
        for (const pk of peaks) {
          let d = theta - pk.c;
          d = Math.atan2(Math.sin(d), Math.cos(d)); // wrap to [-pi, pi]
          const sigma = d < 0 ? pk.sl : pk.sr;
          h += pk.h * Math.exp(-0.5 * (d / sigma) * (d / sigma));
        }
        if (l === 0) {
          // Conifer serration: triangular teeth with per-tree hashed heights
          // and occasional gaps — an irregular treeline, not a doily edge.
          const u = (theta / (Math.PI * 2)) * TREE_COUNT + treePhase;
          const ui = Math.floor(u);
          const uiw = ((ui % TREE_COUNT) + TREE_COUNT) % TREE_COUNT; // seam-safe
          const tri = 1 - Math.abs((u - ui) * 2 - 1);
          let hh = ((0x9e3779b9 ^ Math.imul(uiw + 11, 374761393)) >>> 16) % 1000 / 1000;
          hh = hh < 0.18 ? 0.12 : 0.4 + hh * 0.6;
          h += tri * 2.1 * hh * (0.7 + 0.3 * Math.sin(7 * theta + treeMod));
        }
        h = Math.max(h, 2.5);
        const x = Math.sin(theta) * layer.radius;
        const z = Math.cos(theta) * layer.radius;
        const top = i * 2;
        positions[top * 3] = x;
        positions[top * 3 + 1] = h;
        positions[top * 3 + 2] = z;
        positions[(top + 1) * 3] = x;
        positions[(top + 1) * 3 + 1] = RIDGE_BOTTOM;
        positions[(top + 1) * 3 + 2] = z;
        if (i < SEG) {
          const a = top;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(indices);
      const mat = new THREE.ShaderMaterial({
        vertexShader: RIDGE_VERT,
        fragmentShader: RIDGE_FRAG,
        uniforms: {
          uCol: { value: new THREE.Color() },
          uSpill: { value: new THREE.Color() },
          uSpillStrength: { value: 0 },
          uSunXZ: { value: new THREE.Vector2(1, 0) },
        },
        side: THREE.DoubleSide, // viewed from inside the ring
        depthWrite: false,
        depthTest: true, // real radii: terrain and skirt occlude correctly
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      // After opaque ground (which depth-resolves against them); among
      // themselves, far paints first so nearer bands overlap.
      mesh.renderOrder = 10 - l;
      ctx.scene.add(mesh);
      this.ridges.push(mesh);
      this.ridgeMats.push(mat);
    }
  }

  private apply(ctx: Ctx, tod: TimeOfDay): void {
    const spec = TOD[tod];
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

    const el = THREE.MathUtils.degToRad(spec.sunElevation);
    const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
    const sx = Math.sin(az) * Math.cos(el);
    const sy = Math.sin(el);
    const sz = Math.cos(az) * Math.cos(el);
    (u.uSunDir.value as THREE.Vector3).set(sx, sy, sz);
    // Light-elevation cheat: the visual disc sits at the true elevation,
    // but the LIGHT comes from no lower than ~16° so a grazing dawn sun
    // still models the swells instead of leaving the field unlit.
    const lel = Math.max(el, THREE.MathUtils.degToRad(18));
    this.sun.position
      .set(Math.sin(az) * Math.cos(lel), Math.sin(lel), Math.cos(az) * Math.cos(lel))
      .multiplyScalar(300);
    this.sun.color.setHex(spec.sunColor);
    this.sun.intensity = spec.sunIntensity;

    this.hemi.color.setHex(spec.ambientSky);
    this.hemi.groundColor.setHex(spec.ambientGround);
    this.hemi.intensity = spec.ambientIntensity;

    const fog = ctx.scene.fog as THREE.FogExp2;
    fog.color.setHex(spec.fogColor);
    fog.density = spec.fogDensity;

    // Aerial perspective: each ridge steps from the near color toward the
    // cool far color, then flattens gently toward the fog with distance.
    // Light spill toward the sun azimuth rides the TOD's horizon heat and
    // dies off with layer distance.
    this.fogCol.setHex(spec.fogColor);
    const sunFlatLen = Math.hypot(sx, sz) || 1;
    for (let l = 0; l < this.ridgeMats.length; l++) {
      this.ridgeBase.setHex(spec.ridge);
      this.ridgeFar.setHex(spec.ridgeFar);
      const ru = this.ridgeMats[l].uniforms;
      (ru.uCol.value as THREE.Color)
        .copy(this.ridgeBase)
        .lerp(this.ridgeFar, RIDGE_LAYERS[l].far)
        .lerp(this.fogCol, RIDGE_LAYERS[l].fogMix);
      (ru.uSpill.value as THREE.Color).setHex(spec.hotBand);
      ru.uSpillStrength.value = spec.hotStrength * 0.45 * (1 - 0.55 * RIDGE_LAYERS[l].far);
      (ru.uSunXZ.value as THREE.Vector2).set(sx / sunFlatLen, sz / sunFlatLen);
    }

    // Dawn/dusk lift, noon restraint — the underexposure fix lives here.
    ctx.renderer.toneMappingExposure = spec.exposure;
  }

  update(ctx: Ctx): void {
    // The dome and ridge rings ride the camera so the horizon never recedes.
    this.dome.position.copy(ctx.camera.position);
    for (let l = 0; l < this.ridges.length; l++) {
      this.ridges[l].position.set(ctx.camera.position.x, 0, ctx.camera.position.z);
    }
  }

  dispose(ctx: Ctx): void {
    ctx.scene.remove(this.dome);
    this.dome.geometry.dispose();
    this.mat.dispose();
    for (let l = 0; l < this.ridges.length; l++) {
      ctx.scene.remove(this.ridges[l]);
      this.ridges[l].geometry.dispose();
      this.ridgeMats[l].dispose();
    }
    ctx.scene.remove(this.sun, this.sun.target, this.hemi);
    this.sun.dispose();
    this.hemi.dispose();
    ctx.scene.fog = null;
  }
}
