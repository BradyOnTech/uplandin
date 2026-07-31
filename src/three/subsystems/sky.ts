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
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uCloudAmt;
varying vec3 vPos;

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

/** True-angle local offset from a mass center (az, sinEl), incl. mirror/scale. */
vec2 cloudLocal(vec2 ae, vec2 c, vec2 ms) {
  float dx = atan(sin(ae.x - c.x), cos(ae.x - c.x));
  dx *= sqrt(max(1.0 - ae.y * ae.y, 0.0)); // cos(elevation): no zenith bend
  return vec2(dx, ae.y - c.y) * ms;        // ms: (mirror/scale, 1/scale)
}

float cloudField(vec2 ae) {
  // Mass A — big anvil ahead of the noon-open camera (az ~5 deg, high —
  // kept clear of the dawn-into-sun frame corner at az ~45-55 deg).
  float f = cumulus(cloudLocal(ae, vec2(0.08, 0.30), vec2(1.0, 1.0)));
  // Mass B — lower bank to the west (evening frame's right third), mirrored.
  f = max(f, cumulus(cloudLocal(ae, vec2(-1.05, 0.17), vec2(-1.35, 1.45)) ));
  // Mass C — small scrap near the dawn sun corridor.
  f = max(f, cumulus(cloudLocal(ae, vec2(1.45, 0.13), vec2(1.9, 2.1))));
  // Masses D/E — low distant scraps: the noon frame reads 2-3 masses at
  // different heights, which is what sells the sky's depth.
  f = max(f, cumulus(cloudLocal(ae, vec2(0.82, 0.105), vec2(2.6, 2.9))));
  f = max(f, cumulus(cloudLocal(ae, vec2(-0.18, 0.145), vec2(-2.2, 2.4))));
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
  float cf = cloudField(ae);
  float cm = smoothstep(0.52, 0.60, cf) * uCloudAmt * smoothstep(0.05, 0.10, h);
  float cAbove = smoothstep(0.48, 0.60, cloudField(ae + vec2(0.0, 0.055)));
  vec3 cCol = mix(uCloudLit, uCloudShade, cAbove * 0.85);
  col = mix(col, cCol, cm);

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
varying float vY;
void main() {
  vDirXZ = position.xz; // ring is camera-centered: model xz = azimuth dir
  vY = position.y;
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
void main() {
  float az = max(dot(normalize(vDirXZ), uSunXZ), 0.0);
  float spill = pow(az, 9.0) * uSpillStrength;
  vec3 col = mix(uCol, uSpill, clamp(spill, 0.0, 0.6));
  float haze = exp(-max(vY, 0.0) * uHazeK) * uHazeAmt;
  col = mix(col, uHaze, clamp(haze, 0.0, 0.95));
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
  /** Peak width multiplier: far ranges get NARROW summits (mountains, not
   *  whales — a 0.5 rad gaussian at 600 m is a 300 m featureless mound). */
  sigmaScale: number;
  /** Secondary peak count — far ranges read as a range, not one bump. */
  peakCount: number;
}> = [
  { radius: 300, base: 11, amp: 20, far: 0.0, fogMix: 0.08, hazeAmt: 0.55, jag: 0.05, freqs: [3, 8, 19], sigmaScale: 1.0, peakCount: 3 },
  { radius: 430, base: 14, amp: 32, far: 0.55, fogMix: 0.16, hazeAmt: 0.75, jag: 0.18, freqs: [4, 10, 23], sigmaScale: 0.62, peakCount: 4 },
  { radius: 600, base: 20, amp: 48, far: 1.0, fogMix: 0.26, hazeAmt: 0.92, jag: 0.35, freqs: [5, 12, 29], sigmaScale: 0.42, peakCount: 6 },
];
// Nearest band carries a serrated conifer line, so it gets the resolution.
const RIDGE_SEGS = [1536, 640, 512] as const;
const RIDGE_BOTTOM = -40;
const TREE_COUNT = 190; // conifers around the nearest ring (~10 m spacing)

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
  private hazeCol = new THREE.Color();

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
        uCloudLit: { value: new THREE.Color() },
        uCloudShade: { value: new THREE.Color() },
        uCloudAmt: { value: 0 },
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
    // Wide enough that the midground groves (z 75-120 on the hero axes)
    // still cast — a 90 m box clipped exactly the trees the frames stage.
    const s = 135;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    // Without this the ortho camera keeps its constructor ±5 m frustum and
    // no cast shadow ever lands beyond a 10 m spot at the origin — the
    // round-2 "sun disc with zero terrain corroboration" bug.
    this.sun.shadow.camera.updateProjectionMatrix();
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
      const [f1, f2, f3] = layer.freqs;
      const s1 = (ctx.rng() * 0x7fffffff) | 0;
      const s2 = (ctx.rng() * 0x7fffffff) | 0;
      const s3 = (ctx.rng() * 0x7fffffff) | 0;
      const s4 = (ctx.rng() * 0x7fffffff) | 0;
      // One dominant off-center summit per layer, asymmetric flanks, plus
      // secondary peaks and a pair of spurs shouldering the summit — real
      // profile authoring, not connective sine tissue.
      const peaks: Array<{ c: number; h: number; sl: number; sr: number }> = [];
      const summitC = ctx.rng() * Math.PI * 2;
      const summitSl = (0.24 + ctx.rng() * 0.2) * layer.sigmaScale;
      peaks.push({
        c: summitC,
        h: layer.amp * (0.9 + ctx.rng() * 0.35),
        sl: summitSl,
        sr: summitSl * (0.45 + ctx.rng() * 1.1),
      });
      for (let sp = 0; sp < 2; sp++) {
        // Spurs: sharp subsidiary bumps on the summit's shoulders.
        const side = sp === 0 ? -1 : 1;
        peaks.push({
          c: summitC + side * (0.22 + ctx.rng() * 0.3) * layer.sigmaScale * 1.6,
          h: layer.amp * (0.18 + ctx.rng() * 0.25),
          sl: (0.05 + ctx.rng() * 0.06) * layer.sigmaScale * 1.6,
          sr: (0.05 + ctx.rng() * 0.06) * layer.sigmaScale * 1.6,
        });
      }
      for (let p = 0; p < layer.peakCount; p++) {
        const sl = (0.1 + ctx.rng() * 0.22) * layer.sigmaScale;
        peaks.push({
          c: summitC + Math.PI * (0.25 + ctx.rng() * 1.4) * (ctx.rng() < 0.5 ? -1 : 1),
          h: layer.amp * (0.25 + ctx.rng() * 0.45),
          sl,
          sr: sl * (0.5 + ctx.rng() * 1.3),
        });
      }
      const treePhase = ctx.rng();
      const sTree = (ctx.rng() * 0x7fffffff) | 0;
      const sTreeH = (ctx.rng() * 0x7fffffff) | 0;
      const sTreeP = (ctx.rng() * 0x7fffffff) | 0;
      const sCluster = (ctx.rng() * 0x7fffffff) | 0;
      const positions = new Float32Array((SEG + 1) * 2 * 3);
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
          layer.amp * (0.3 * n1 + 0.18 * n2 + 0.09 * n3 + layer.jag * crease);
        let peakSum = 0;
        for (const pk of peaks) {
          let d = theta - pk.c;
          d = Math.atan2(Math.sin(d), Math.cos(d)); // wrap to [-pi, pi]
          const sigma = d < 0 ? pk.sl : pk.sr;
          peakSum += pk.h * Math.exp(-0.5 * (d / sigma) * (d / sigma));
        }
        // Summit-riding detail: rocky jag that scales with peak height, so
        // crests never read as glassy gaussian domes but bases stay calm.
        const n4 = ringNoise(theta, f3 * 2 + 1, s4) * 2 - 1;
        h += peakSum * (1 + 0.14 * n4);
        if (l === 0) {
          // Conifer serration, e3-5 bar: per-tree hashed height AND apex
          // skew, cluster noise bunching tall runs with genuine gaps —
          // an irregular treeline, not a doily edge.
          const u = (theta / (Math.PI * 2)) * TREE_COUNT + treePhase * TREE_COUNT;
          const ui = Math.floor(u);
          const f = u - ui;
          const uiw = ((ui % TREE_COUNT) + TREE_COUNT) % TREE_COUNT; // seam-safe
          const gap = hash01(uiw, sTree);
          if (gap > 0.16) {
            const apex = 0.32 + 0.36 * hash01(uiw, sTreeP);
            const tri = f < apex ? f / apex : (1 - f) / (1 - apex);
            const cluster = ringNoise(theta, 13, sCluster);
            const hgt =
              (0.35 + 0.65 * hash01(uiw, sTreeH)) * (0.35 + 0.85 * cluster);
            h += tri * 3.4 * hgt;
          }
        }
        h = Math.max(h, l === 0 ? 2.5 : 1.2);
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
          uHaze: { value: new THREE.Color() },
          // Haze decays over roughly the lower half of the layer's relief.
          uHazeK: { value: 3.0 / (layer.base + 0.5 * layer.amp) },
          uHazeAmt: { value: layer.hazeAmt },
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
    (u.uCloudLit.value as THREE.Color).setHex(spec.cloudLit);
    (u.uCloudShade.value as THREE.Color).setHex(spec.cloudShade);
    u.uCloudAmt.value = spec.cloudAmount;

    const el = THREE.MathUtils.degToRad(spec.sunElevation);
    const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
    const sx = Math.sin(az) * Math.cos(el);
    const sy = Math.sin(el);
    const sz = Math.cos(az) * Math.cos(el);
    (u.uSunDir.value as THREE.Vector3).set(sx, sy, sz);
    // Light-elevation cheat: the visual disc sits at the true elevation,
    // but the LIGHT comes from no lower than ~14° so a grazing dawn sun
    // still models the swells — while casting the LONG shadows that
    // corroborate the sun's position (round-2 critics: a sun disc with
    // zero terrain consequence kills the time of day instantly).
    const lel = Math.max(el, THREE.MathUtils.degToRad(14));
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
    // Base haze color: fog pulled toward the sky's horizon stop — what the
    // dome shows just below the horizon, so ridge bases dissolve into it.
    this.hazeCol.setHex(spec.skyHorizon).lerp(this.fogCol, 0.55);
    const sunFlatLen = Math.hypot(sx, sz) || 1;
    for (let l = 0; l < this.ridgeMats.length; l++) {
      this.ridgeBase.setHex(spec.ridge);
      this.ridgeFar.setHex(spec.ridgeFar);
      const ru = this.ridgeMats[l].uniforms;
      (ru.uCol.value as THREE.Color)
        .copy(this.ridgeBase)
        .lerp(this.ridgeFar, RIDGE_LAYERS[l].far)
        .lerp(this.fogCol, RIDGE_LAYERS[l].fogMix);
      (ru.uHaze.value as THREE.Color).copy(this.hazeCol);
      (ru.uSpill.value as THREE.Color).setHex(spec.hotBand);
      ru.uSpillStrength.value = spec.hotStrength * 0.55 * (1 - 0.55 * RIDGE_LAYERS[l].far);
      (ru.uSunXZ.value as THREE.Vector2).set(sx / sunFlatLen, sz / sunFlatLen);
      // Per-TOD haze boost: stronger amount AND slower vertical decay, so
      // dusk ranges melt into the afterglow instead of cutting navy wedges.
      const layer = RIDGE_LAYERS[l];
      ru.uHazeAmt.value = Math.min(0.95, layer.hazeAmt * spec.ridgeHazeBoost);
      ru.uHazeK.value = 3.0 / ((layer.base + 0.5 * layer.amp) * spec.ridgeHazeBoost);
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
