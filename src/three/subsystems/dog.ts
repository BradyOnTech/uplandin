import * as THREE from 'three';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
import { P, TOD, type TimeOfDay } from '../palette';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';

/*
 * DOG subsystem — the reason the game exists.
 *
 * A segmented low-poly English Setter (A Short Hike's shape language:
 * flat-shaded tapered prisms, strong silhouette, zero realism) rendered
 * on top of the LIVE sim dog from hunt3d. The sim is truth: position,
 * heading, state and gait come from Dog.update exactly as the 2D
 * FieldScene consumed them; this file only decides what the truth looks
 * like.
 *
 *  - BODY: hex-lofted torso (deep chest, thick forequarters, waist tuck,
 *    haunch), boxed neck sunk wide into the chest, dropped triangular ear
 *    flaps (the #1 dog identifier — the silhouette survives front and 3/4
 *    angles), rigid flag tail with notched feathering facets, four
 *    two-segment legs. White coat off the palette's pale role with dark
 *    head patches and a sparse belton ticking suggestion. ~0.55 m at the
 *    shoulder, ~490 tris, 15 draw calls.
 *  - LIGHTING: the coat takes the WORLD's light (round-7 mandate — the
 *    fullbright emissive cheat made the dog ignore every TOD): Lambert
 *    under the scene sun/hemisphere plus the flora facet recipe — warm
 *    sun-side lift, shade facets multiplied toward the TOD shadow tint
 *    (mauve-gray at dawn, violet at lastlight), sun-colored rim at the
 *    golden hours. Albedo is strawPale — never #fff.
 *  - GROUNDING: dog meshes never render into the shadow map (the grazing-
 *    sun splat read as a burn mark); one soft sun-aligned contact ellipse
 *    (multiply-blended, stretched by sun elevation) grounds the torso.
 *    Feet plant analytically — the root sinks by the lowest standing
 *    paw's clearance. Grass opens around the dog via partingPoint().
 *  - LOCOMOTION: distance-driven gait (the 2D lesson — legs turn exactly
 *    as fast as the ground moves): the stride phase advances per meter
 *    traveled, never per second, so the dog never moonwalks. Diagonal
 *    trot pairs, a 4-beat rotary gallop on 'run', body bob, ear bounce,
 *    tail carriage by gait, a lean into turns.
 *  - THE POINT: sim state 'pointing' (and 'honoring') freezes the classic
 *    — body rigid and horizontal, tail STRAIGHT UP, head locked on the
 *    pointed bird's world position, left foreleg lifted and folded. The
 *    game's money shot; every parameter here serves that silhouette.
 *  - Determinism: all idle motion (wag, breath, ear flops) keys off
 *    ctx.time and is DISABLED under ?capture=1, where smoothing snaps to
 *    targets — a captured pose is a pure function of the sim seed.
 *
 * Per-frame: one sim read, ~20 group-transform writes, zero allocations.
 */

/** Local stream for coat flecks/build jitter — never ctx.rng. */
const DOG_ART_SEED = 0x5e77e6;

/* ------------------------------ geometry ------------------------------ */

type V3 = readonly [number, number, number];

/** Cross-section for z-axis parts (torso, neck, tail, head boxes). */
interface SectZ {
  x: number;
  y: number;
  z: number;
  hw: number;
  hh: number;
}

/** Cross-section for y-axis parts (legs, ears). */
interface SectY {
  x: number;
  y: number;
  z: number;
  hw: number;
  hd: number;
}

class PartBuilder {
  private pos: number[] = [];
  private col: number[] = [];

  tri(a: V3, b: V3, c: V3, color: THREE.Color): void {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
  }

  quad(a: V3, b: V3, c: V3, d: V3, color: THREE.Color): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /** Same quad emitted with both windings — thin fins/ears read from both sides. */
  quad2(a: V3, b: V3, c: V3, d: V3, color: THREE.Color): void {
    this.quad(a, b, c, d, color);
    this.quad(d, c, b, a, color);
  }

  /**
   * Tapered box along z: s0 = rear section, s1 = front (s1.z > s0.z).
   * Optional per-face colors (top/bottom/side/cap) paint patches for free.
   */
  boxZ(
    s0: SectZ,
    s1: SectZ,
    c: { side: THREE.Color; top?: THREE.Color; bottom?: THREE.Color; front?: THREE.Color; back?: THREE.Color },
  ): void {
    const A0: V3 = [s0.x - s0.hw, s0.y - s0.hh, s0.z];
    const B0: V3 = [s0.x + s0.hw, s0.y - s0.hh, s0.z];
    const C0: V3 = [s0.x + s0.hw, s0.y + s0.hh, s0.z];
    const D0: V3 = [s0.x - s0.hw, s0.y + s0.hh, s0.z];
    const A1: V3 = [s1.x - s1.hw, s1.y - s1.hh, s1.z];
    const B1: V3 = [s1.x + s1.hw, s1.y - s1.hh, s1.z];
    const C1: V3 = [s1.x + s1.hw, s1.y + s1.hh, s1.z];
    const D1: V3 = [s1.x - s1.hw, s1.y + s1.hh, s1.z];
    this.quad(A1, B1, C1, D1, c.front ?? c.side); // +z
    this.quad(B0, A0, D0, C0, c.back ?? c.side); // -z
    this.quad(D1, C1, C0, D0, c.top ?? c.side); // +y
    this.quad(A0, B0, B1, A1, c.bottom ?? c.side); // -y
    this.quad(B0, C0, C1, B1, c.side); // +x
    this.quad(D0, A0, A1, D1, c.side); // -x
  }

  /** Tapered box along -y: s0 = upper section, s1 = lower (s1.y < s0.y). */
  boxY(s0: SectY, s1: SectY, color: THREE.Color): void {
    const A0: V3 = [s0.x - s0.hw, s0.y, s0.z - s0.hd];
    const B0: V3 = [s0.x + s0.hw, s0.y, s0.z - s0.hd];
    const C0: V3 = [s0.x + s0.hw, s0.y, s0.z + s0.hd];
    const D0: V3 = [s0.x - s0.hw, s0.y, s0.z + s0.hd];
    const A1: V3 = [s1.x - s1.hw, s1.y, s1.z - s1.hd];
    const B1: V3 = [s1.x + s1.hw, s1.y, s1.z - s1.hd];
    const C1: V3 = [s1.x + s1.hw, s1.y, s1.z + s1.hd];
    const D1: V3 = [s1.x - s1.hw, s1.y, s1.z + s1.hd];
    this.quad(D1, C1, C0, D0, color); // +z
    this.quad(B1, A1, A0, B0, color); // -z
    this.quad(C1, B1, B0, C0, color); // +x
    this.quad(A1, D1, D0, A0, color); // -x
    this.quad(A1, B1, C1, D1, color); // -y
    this.quad(D0, C0, B0, A0, color); // +y
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    return geo;
  }
}

/** Hex ring in the x-y plane — top vertex, flanks, keel. Dog-ish section. */
const HEX_ANG = [90, 150, 210, 270, 330, 30].map((d) => (d * Math.PI) / 180);

function hexRing(s: SectZ, out: V3[]): void {
  for (let i = 0; i < 6; i++) {
    out[i] = [s.x + Math.cos(HEX_ANG[i]) * s.hw, s.y + Math.sin(HEX_ANG[i]) * s.hh, s.z];
  }
}

/** Loft hex sections rear→front (increasing z) with pointed end caps. */
function loftZ(
  b: PartBuilder,
  sections: SectZ[],
  colors: THREE.Color[],
  capRear: V3,
  capFront: V3,
  capRearC: THREE.Color,
  capFrontC: THREE.Color,
): void {
  const rings: V3[][] = sections.map((s) => {
    const r: V3[] = new Array(6);
    hexRing(s, r);
    return r;
  });
  for (let k = 0; k < rings.length - 1; k++) {
    const rear = rings[k];
    const front = rings[k + 1];
    for (let j = 0; j < 6; j++) {
      const j2 = (j + 1) % 6;
      b.quad(rear[j], rear[j2], front[j2], front[j], colors[k]);
    }
  }
  const first = rings[0];
  const last = rings[rings.length - 1];
  for (let j = 0; j < 6; j++) {
    const j2 = (j + 1) % 6;
    b.tri(first[j2], first[j], capRear, capRearC); // rear cap (faces -z)
    b.tri(last[j], last[j2], capFront, capFrontC); // front cap (faces +z)
  }
}

/* --------------------------- proportions (m) --------------------------- */
// A 0.55 m setter, nose +z. Pivots are where groups attach; geometry is
// built in each group's local space with the origin AT the joint.

const FORE_X = 0.062;
const FORE_Y = 0.415;
const FORE_Z = 0.155;
const HIND_X = 0.066;
const HIND_Y = 0.43;
const HIND_Z = -0.27;
const NECK_PIVOT: V3 = [0, 0.46, 0.2];
const NECK_TOP: V3 = [0, 0.15, 0.11]; // head joint in neck-local space
const TAIL_PIVOT: V3 = [0, 0.465, -0.33];

/**
 * Torso loft sections, rear→front: rump, hip, waist tuck, heart girth,
 * shoulder/prosternum. Round 7: the chest DEEPENED and the forequarters
 * THICKENED — the off-profile mandate. The heart girth is the widest,
 * deepest ring on the dog and the prosternum stays broad so a front or
 * three-quarter view reads chest mass, not a spindle.
 */
const TORSO_SECTS: SectZ[] = [
  { x: 0, y: 0.44, z: -0.33, hw: 0.055, hh: 0.075 },
  { x: 0, y: 0.43, z: -0.24, hw: 0.084, hh: 0.11 },
  { x: 0, y: 0.445, z: -0.06, hw: 0.074, hh: 0.1 },
  { x: 0, y: 0.42, z: 0.13, hw: 0.108, hh: 0.148 },
  { x: 0, y: 0.415, z: 0.27, hw: 0.088, hh: 0.13 },
];

/** Gait cycle tuning. Stride = meters of ground per full leg cycle. */
interface GaitCfg {
  stride: number;
  swing: number;
  fold: number;
  bob: number;
  rock: number;
  /** Per-leg phase offsets FL, FR, HL, HR. */
  off: readonly [number, number, number, number];
  tail: number;
  wag: number;
  wagHz: number;
  neck: number;
  head: number;
}

const HALF = Math.PI;
const GAITS: Record<'run' | 'trot' | 'track', GaitCfg> = {
  // Rotary-gallop flavored 4-beat: near-paired hinds driving, fronts
  // reaching — the big quartering stride.
  run: {
    stride: 1.55, swing: 0.8, fold: 1.25, bob: 0.028, rock: 0.05,
    off: [0, 0.55, HALF + 0.35, HALF + 0.9],
    tail: 0.25, wag: 0.1, wagHz: 5, neck: 0.06, head: 0.04,
  },
  // Diagonal 2-beat trot — level tail, level back, workmanlike.
  trot: {
    stride: 1.0, swing: 0.55, fold: 0.85, bob: 0.018, rock: 0.015,
    off: [0, HALF, HALF, 0],
    tail: 0.12, wag: 0.16, wagHz: 6, neck: 0.0, head: 0.02,
  },
  // Making game: crouched, fast-legged creep — tail HIGH and cracking,
  // head reaching down the scent cone.
  track: {
    stride: 0.62, swing: 0.34, fold: 0.5, bob: 0.008, rock: 0.01,
    off: [0, HALF, HALF, 0],
    tail: 0.95, wag: 0.3, wagHz: 9, neck: 0.42, head: 0.1,
  },
};

/** Neutral standing joint angles: FL, FR upper/lower then HL, HR. */
const NEUTRAL_U = [-0.03, -0.03, -0.22, -0.22];
const NEUTRAL_L = [0.06, 0.06, 0.45, 0.45];

/** exp-smoothing toward a target; snap = capture determinism. */
function approach(cur: number, target: number, rate: number, dt: number, snap: boolean): number {
  if (snap) return target;
  return target + (cur - target) * Math.exp(-rate * dt);
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class DogSystem implements Subsystem {
  readonly id = 'dog';

  private hunt!: Hunt3DSystem;
  private terrain!: TerrainSystem;
  private mat?: THREE.MeshLambertMaterial;
  private geos: THREE.BufferGeometry[] = [];

  private root = new THREE.Group();
  private body = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private earL = new THREE.Group();
  private earR = new THREE.Group();
  private tail = new THREE.Group();
  /** FL, FR, HL, HR — upper pivots at shoulder/hip, lower at knee/hock. */
  private legU: THREE.Group[] = [];
  private legL: THREE.Group[] = [];

  private frozen = false;
  /** Sun-answer uniforms shared by the one coat material. */
  private tone = {
    uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
    uWarmK: { value: 0 },
    uCoolK: { value: 0 },
    uCoolTint: { value: new THREE.Color(P.shadowNeutral) },
    uRimColor: { value: new THREE.Color(0) },
    uRimK: { value: 0 },
  };
  private creamScratch = new THREE.Color(P.cream);

  // Contact-shadow ellipse (the grounding — dog meshes never cast).
  private shadowGrp = new THREE.Group();
  private shadowGeo?: THREE.CircleGeometry;
  private shadowMat?: THREE.ShaderMaterial;
  /** World-space shadow direction (away from the sun), set per TOD. */
  private shadowDirX = 0;
  private shadowDirZ = -1;
  private shadowYaw = 0;

  // Smoothed pose state.
  private yaw = 0;
  private roll = 0;
  private slopePitch = 0;
  private bodyPitch = 0;
  private bob = 0;
  private neckPitch = 0;
  private headPitch = 0;
  private headYaw = 0;
  private tailPitch = -0.55;
  private tailYaw = 0;
  private earFlop = 0;
  private uAng = [0, 0, 0, 0];
  private lAng = [0, 0, 0, 0];
  private phase = 0;
  private yawRate = 0;

  // Preallocated scratch.
  private posW = { x: 0, z: 0 };
  private birdW = { x: 0, z: 0 };
  private lastX = 0;
  private lastZ = 0;
  private hasLast = false;

  init(ctx: Ctx): void {
    this.frozen = new URLSearchParams(location.search).has('capture');
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.terrain = ctx.get<TerrainSystem>('terrain');
    const high = ctx.quality === 'high';

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // ROUND 7, item 1 — the coat takes the WORLD's light. The flora facet
    // recipe sized for a white coat: sun-facing facets take a warm lift,
    // shade facets multiply toward the hour's SHADOW TINT (mauve-gray at
    // dawn, violet at lastlight — the same palette roles the grass cores
    // breathe), and a sun-colored rim keeps the lit edge alive at the
    // golden hours. The Lambert base under the scene sun/hemisphere does
    // the actual modeling — no more fullbright emissive cheat.
    const tone = this.tone;
    this.mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, tone);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uSunDirW;\nuniform float uWarmK;\nuniform float uCoolK;\n' +
            'uniform vec3 uCoolTint;\nuniform vec3 uRimColor;\nuniform float uRimK;',
        )
        .replace(
          '#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\n' +
            '\tvec3 gWN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );\n' +
            '\tvec3 gVW = normalize( ( vec4( normalize( vViewPosition ), 0.0 ) * viewMatrix ).xyz );\n' +
            // Committed plateau split at the terminator (the flora round-6
            // lesson): one lit face, one shade face, a few degrees of
            // anti-aliased transition between them.
            '\tfloat gSplit = smoothstep( -0.15, 0.3, dot( gWN, uSunDirW ) );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.26, 1.1, 0.88 ), gSplit * uWarmK );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), uCoolTint, ( 1.0 - gSplit ) * uCoolK );',
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' +
            // Low-sun rim: the hot edge on glancing sun-facing facets that
            // keeps the white coat alive when the camera faces the sunrise.
            '\tfloat gRim = pow( 1.0 - abs( dot( gWN, gVW ) ), 2.5 ) * clamp( dot( gWN, uSunDirW ) * 0.7 + 0.3, 0.0, 1.0 );\n' +
            '\ttotalEmissiveRadiance += uRimColor * ( gRim * uRimK );',
        );
    };
    const applyTod = (tod: TimeOfDay): void => {
      const spec = TOD[tod];
      const silh = spec.grassLumCap < 1;
      const lowSun = THREE.MathUtils.clamp(1 - (spec.sunElevation - 2) / 13, 0, 1);
      // Sky-fill whisper: enough that the coat never renders slate-blue
      // under the vault (iteration-2 measure: an ambientSky fill turned
      // the noon dog pewter), never enough to go fullbright again. The
      // fill leans on the hour's HAZE role — pale and warm by palette
      // construction — at roughly half round-6's fullbright dose.
      this.mat!.emissive.setHex(spec.fogColor).lerp(this.creamScratch, 0.4);
      this.mat!.emissiveIntensity = silh ? 0.04 : 0.11;
      const el = THREE.MathUtils.degToRad(spec.sunElevation);
      const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
      this.tone.uSunDirW.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      this.tone.uWarmK.value = 0.3 + spec.floraWarm * 0.5;
      // Shade facets take the hour's shadow tint — the same role the grass
      // roots multiply toward, so dog and field sit in ONE light. The tint
      // is deepened (x0.78) because the palette shadow roles are pale
      // multipliers sized for grass roots; on the bright coat they need
      // real darkening to read as the mauve-gray shade mass at all.
      this.tone.uCoolTint.value.setHex(spec.grassShadow).multiplyScalar(0.78);
      this.tone.uCoolK.value = silh ? 0.6 : 0.3 + lowSun * 0.35;
      // Rim rides the hour's sun color — HOT at the golden hours: the
      // backlit money shot lives on this one warm edge.
      this.tone.uRimColor.value.setHex(spec.sunColor);
      this.tone.uRimK.value = (silh ? 0.3 : 0.12) + lowSun * 1.25;
      // Contact ellipse answers the sun: aligned to the azimuth, stretched
      // as the sun drops, its darkening tinted by the hour's shadow role.
      this.shadowDirX = -Math.sin(az);
      this.shadowDirZ = -Math.cos(az);
      this.shadowYaw = Math.atan2(this.shadowDirX, this.shadowDirZ);
      // Scale values are RADII of the unit disc: half-width across the
      // shadow, half-length along it (iteration 2: the first pass scaled
      // by full length and painted a 2.6 m stain under the dawn dog).
      const len = THREE.MathUtils.clamp(0.35 / Math.tan(Math.max(el, 0.06)), 0.5, 0.95);
      this.shadowGrp.scale.set(0.4, 1, len);
      const su = this.shadowMat!.uniforms;
      (su.uTint.value as THREE.Color).setHex(spec.grassShadow).multiplyScalar(0.45);
      su.uK.value = silh ? 0.14 : 0.46 + lowSun * 0.1;
    };

    // Contact ellipse build: a unit disc in the xz plane, multiply-blended
    // radial falloff — it darkens whatever it hovers over (soil, skirts,
    // blades) the way a soft blob shadow should, and costs one draw call.
    this.shadowGeo = new THREE.CircleGeometry(1, 28);
    this.shadowGeo.rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTint: { value: new THREE.Color(P.shadowNeutral) },
        uK: { value: 0.4 },
      },
      vertexShader:
        'varying vec2 vXY;\n' +
        'void main() {\n' +
        '\tvXY = position.xz;\n' +
        '\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n' +
        '}',
      fragmentShader:
        'uniform vec3 uTint;\nuniform float uK;\nvarying vec2 vXY;\n' +
        'void main() {\n' +
        '\tfloat gFall = 1.0 - smoothstep( 0.3, 1.0, length( vXY ) );\n' +
        '\tgl_FragColor = vec4( mix( vec3( 1.0 ), uTint, gFall * uK ), 1.0 );\n' +
        '}',
      blending: THREE.MultiplyBlending,
      transparent: true,
      depthWrite: false,
    });
    this.shadowGrp.add(new THREE.Mesh(this.shadowGeo, this.shadowMat));
    this.shadowGrp.rotation.order = 'YXZ';
    ctx.scene.add(this.shadowGrp);

    applyTod(ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => applyTod(e.detail)) as EventListener);

    this.buildBody(high);

    this.root.add(this.body);
    ctx.scene.add(this.root);
    // First placement so frame 0 isn't a dog at the origin.
    this.update(ctx, 1 / 60);
  }

  /**
   * GROUNDING CONTRACT — grass reads this via ctx.get('dog') and opens a
   * second parting point around it (the same mechanism that parts blades
   * for the camera). World meters; r is the body-parting radius.
   */
  partingPoint(out: { x: number; z: number; r: number }): void {
    out.x = this.lastX;
    out.z = this.lastZ;
    out.r = 0.9;
  }

  /* ------------------------------- build ------------------------------- */

  private mesh(geo: THREE.BufferGeometry, _high: boolean): THREE.Mesh {
    this.geos.push(geo);
    const m = new THREE.Mesh(geo, this.mat!);
    // NEVER into the shadow map (round 7, item 2): at a grazing dawn sun
    // the segmented body smeared into a noisy splat that read as a burn
    // mark. The contact ellipse is the dog's grounding on every tier.
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  }

  private buildBody(high: boolean): void {
    const rng = mulberry32(DOG_ART_SEED);
    // Coat roles: warm white straight off strawPale (the palette's palest
    // warm — any cream/gray lerp reads slate under the blue sky ambient),
    // patches an oxblood-charcoal near-black, warm shading underneath.
    const coat = new THREE.Color(P.strawPale).multiplyScalar(1.05);
    const coatDim = new THREE.Color(P.strawPale).multiplyScalar(0.88);
    const patch = new THREE.Color(P.oxblood).lerp(new THREE.Color(P.charcoal), 0.42);
    const nose = new THREE.Color(P.charcoal).multiplyScalar(0.55);
    const tick = patch.clone().lerp(coat, 0.12);

    // TORSO — hex loft with belly/keel shading and the belton suggestion.
    {
      const b = new PartBuilder();
      const secC = [coatDim, coat, coat, coat];
      loftZ(
        b, TORSO_SECTS, secC,
        [0, 0.455, -0.36], [0, 0.41, 0.29],
        coatDim, coat,
      );
      // Belton ticking: a sparse handful of dark surface flecks on the
      // flanks + one saddle patch at the left hip. Suggestion, not noise.
      const fleck = (zt: number, ang: number, s: number, col: THREE.Color): void => {
        // Interpolate the loft at parameter zt ∈ [0,1] rear→front.
        const f = zt * (TORSO_SECTS.length - 1);
        const k = Math.min(TORSO_SECTS.length - 2, Math.floor(f));
        const t = f - k;
        const s0 = TORSO_SECTS[k];
        const s1 = TORSO_SECTS[k + 1];
        const cx = s0.x + (s1.x - s0.x) * t;
        const cy = s0.y + (s1.y - s0.y) * t;
        const cz = s0.z + (s1.z - s0.z) * t;
        const hw = s0.hw + (s1.hw - s0.hw) * t;
        const hh = s0.hh + (s1.hh - s0.hh) * t;
        const px = cx + Math.cos(ang) * hw;
        const py = cy + Math.sin(ang) * hh;
        // Ellipse outward normal in x-y.
        let nx = Math.cos(ang) * hh;
        let ny = Math.sin(ang) * hw;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        const ox = px + nx * 0.006;
        const oy = py + ny * 0.006;
        // Tangents: around the ring, and along the body.
        const tx = -ny;
        const ty = nx;
        const a: V3 = [ox - tx * s - 0, oy - ty * s, cz - s];
        const bq: V3 = [ox + tx * s, oy + ty * s, cz - s];
        const c: V3 = [ox + tx * s, oy + ty * s, cz + s];
        const d: V3 = [ox - tx * s, oy - ty * s, cz + s];
        b.quad(a, bq, c, d, col);
      };
      // Saddle patch over the left hip — the classic broken blanket.
      fleck(0.22, (200 * Math.PI) / 180, 0.052, patch);
      fleck(0.3, (165 * Math.PI) / 180, 0.036, patch);
      for (let i = 0; i < 11; i++) {
        const side = rng() < 0.5;
        const ang = ((side ? 155 : 335) + rng() * 55) * (Math.PI / 180);
        fleck(0.12 + rng() * 0.75, ang, 0.011 + rng() * 0.009, tick);
      }
      this.body.add(this.mesh(b.build(), high));
    }

    // NECK — raked ~40° forward-up, baked into geometry (group stays at
    // identity when standing so the pivot math reads clean). Round 7: the
    // base sits WIDE and DEEP inside the chest so neck and forequarters
    // read as one connected mass from every angle, never a stick on a box.
    {
      const b = new PartBuilder();
      b.boxZ(
        { x: 0, y: -0.075, z: -0.075, hw: 0.068, hh: 0.105 },
        { x: 0, y: NECK_TOP[1] - 0.015, z: NECK_TOP[2] + 0.015, hw: 0.04, hh: 0.054 },
        { side: coat, bottom: coatDim },
      );
      const m = this.mesh(b.build(), high);
      this.neck.add(m);
    }
    this.neck.position.set(NECK_PIVOT[0], NECK_PIVOT[1], NECK_PIVOT[2]);
    this.body.add(this.neck);

    // HEAD — white skull with dark patches at the eyes/ears, white muzzle,
    // charcoal nose: at 20 m the read is a white dog with a marked face,
    // not a featureless dark blob.
    {
      const b = new PartBuilder();
      // Skull: white dome, occiput via taper.
      b.boxZ(
        { x: 0, y: 0.012, z: -0.045, hw: 0.04, hh: 0.036 },
        { x: 0, y: 0.008, z: 0.075, hw: 0.049, hh: 0.046 },
        { side: coat, top: coat, bottom: coatDim, back: coat },
      );
      // Eye/cheek patches: dark quads proud of the skull sides.
      for (const s of [-1, 1]) {
        b.quad2(
          [s * 0.0505, 0.036, 0.062], [s * 0.0505, 0.038, 0.005],
          [s * 0.0505, -0.012, -0.002], [s * 0.0505, -0.014, 0.058],
          patch,
        );
      }
      // Muzzle: square setter flews, slightly below skull axis.
      b.boxZ(
        { x: 0, y: -0.008, z: 0.07, hw: 0.031, hh: 0.032 },
        { x: 0, y: -0.002, z: 0.185, hw: 0.024, hh: 0.026 },
        { side: coat, bottom: coatDim },
      );
      // Nose leather.
      b.boxZ(
        { x: 0, y: 0.006, z: 0.183, hw: 0.017, hh: 0.016 },
        { x: 0, y: 0.004, z: 0.208, hw: 0.013, hh: 0.012 },
        { side: nose, front: nose },
      );
      this.head.add(this.mesh(b.build(), high));
    }
    this.head.position.set(NECK_TOP[0], NECK_TOP[1], NECK_TOP[2]);
    this.neck.add(this.head);

    // EARS — dropped TRIANGULAR flaps (round 7, item 3: ears are the #1
    // dog identifier). Wide-based, flared off the skull so the silhouette
    // reads dog from the front and three-quarter, not just perfect side
    // view. Two facets each with a slight fold; double-sided quads.
    for (const side of [-1, 1]) {
      const b = new PartBuilder();
      // Base edge hugs the skull top; the flap widens to the fold then
      // tapers to a blunt hanging tip, drifting outward as it drops.
      b.quad2(
        [0, 0.004, -0.032], [0, 0.004, 0.032],
        [side * 0.012, -0.078, 0.04], [side * 0.012, -0.078, -0.04],
        patch,
      );
      b.quad2(
        [side * 0.012, -0.078, -0.04], [side * 0.012, -0.078, 0.04],
        [side * 0.022, -0.132, 0.011], [side * 0.022, -0.132, -0.011],
        patch,
      );
      const grp = side < 0 ? this.earL : this.earR;
      grp.add(this.mesh(b.build(), high));
      grp.position.set(side * 0.046, 0.042, 0.012);
      grp.rotation.z = side * -0.52; // flare off the skull — reads front-on
      grp.rotation.y = side * 0.18;
      this.head.add(grp);
    }

    // TAIL — round 7, item 4: a RIGID FLAG. Straight tapered bone, and the
    // feathering rebuilt as three notched facets with sawtooth gaps along
    // the trailing edge — raised on point it reads as the flag over the
    // grass, the read a handler steers by.
    {
      const b = new PartBuilder();
      // Straight bone, root -> tip, no saber droop: the flag pole.
      b.boxZ(
        { x: 0, y: 0, z: -0.34, hw: 0.008, hh: 0.01 },
        { x: 0, y: 0, z: 0, hw: 0.024, hh: 0.028 },
        { side: coat },
      );
      // Three feathering facets off the underside, each ending in a notch
      // (the sawtooth trailing edge of real setter feathering), emitted as
      // TWO layers in a shallow V so the flag keeps presence when the
      // camera lines up with its plane — a single fin vanished edge-on in
      // the dawn-point frame. Alternating coat/coatDim per lock.
      for (const lx of [-0.009, 0.009]) {
        const yb = lx < 0 ? 0 : -0.008; // layered locks, not a mirror
        b.quad2(
          [lx, -0.018, -0.04], [lx, -0.022, -0.125],
          [lx * 2.2, -0.108 + yb, -0.088], [lx * 2.2, -0.09 + yb, -0.03],
          coat,
        );
        b.quad2(
          [lx, -0.024, -0.13], [lx, -0.028, -0.225],
          [lx * 2.2, -0.102 + yb, -0.188], [lx * 2.2, -0.114 + yb, -0.114],
          coatDim,
        );
        b.quad2(
          [lx, -0.03, -0.23], [lx, -0.036, -0.325],
          [lx * 2.2, -0.08 + yb, -0.282], [lx * 2.2, -0.094 + yb, -0.208],
          coat,
        );
      }
      this.tail.add(this.mesh(b.build(), high));
    }
    this.tail.position.set(TAIL_PIVOT[0], TAIL_PIVOT[1], TAIL_PIVOT[2]);
    this.body.add(this.tail);

    // LEGS — two segments each, origin at the joint, geometry down -y.
    for (let i = 0; i < 4; i++) {
      const fore = i < 2;
      const side = i % 2 === 0 ? -1 : 1;
      const upper = new THREE.Group();
      const lower = new THREE.Group();
      {
        const b = new PartBuilder();
        if (fore) {
          // Thick forequarters (round 7): a real forearm mass under the
          // widened chest, tapering to the wrist.
          b.boxY(
            { x: 0, y: 0.03, z: -0.006, hw: 0.04, hd: 0.064 },
            { x: 0, y: -0.195, z: 0.004, hw: 0.021, hd: 0.027 },
            coat,
          );
        } else {
          // Haunch: broad thigh mass tapering to the stifle.
          b.boxY(
            { x: 0, y: 0.04, z: -0.01, hw: 0.036, hd: 0.085 },
            { x: 0, y: -0.205, z: 0.01, hw: 0.02, hd: 0.03 },
            coat,
          );
        }
        upper.add(this.mesh(b.build(), high));
      }
      {
        const b = new PartBuilder();
        const len = fore ? 0.2 : 0.21;
        b.boxY(
          { x: 0, y: 0, z: 0, hw: 0.017, hd: 0.024 },
          { x: 0, y: -len + 0.03, z: -0.004, hw: 0.013, hd: 0.018 },
          coat,
        );
        // Paw: small forward block.
        b.boxY(
          { x: 0, y: -len + 0.032, z: 0.012, hw: 0.022, hd: 0.036 },
          { x: 0, y: -len, z: 0.014, hw: 0.02, hd: 0.034 },
          coatDim,
        );
        lower.add(this.mesh(b.build(), high));
      }
      upper.position.set(
        side * (fore ? FORE_X : HIND_X),
        fore ? FORE_Y : HIND_Y,
        fore ? FORE_Z : HIND_Z,
      );
      lower.position.set(0, fore ? -0.195 : -0.205, 0);
      upper.add(lower);
      this.body.add(upper);
      this.legU.push(upper);
      this.legL.push(lower);
    }
  }

  /* ------------------------------- update ------------------------------ */

  update(ctx: Ctx, dt: number): void {
    const sd = this.hunt.dog();
    this.hunt.dogWorld(this.posW);
    const x = this.posW.x;
    const z = this.posW.z;
    const gy = this.terrain.heightAt(x, z);
    const snap = this.frozen;

    // Movement since last frame drives BOTH facing and stride phase — legs
    // turn exactly as fast as the ground moves.
    let dx = 0;
    let dz = 0;
    if (this.hasLast) {
      dx = x - this.lastX;
      dz = z - this.lastZ;
    }
    this.lastX = x;
    this.lastZ = z;
    this.hasLast = true;
    const moved = Math.hypot(dx, dz);

    const state = sd.state;
    const gait = sd.gait;
    const pointing = state === 'pointing' || state === 'honoring';

    // Facing: travel direction while moving; on point, square to the bird.
    let targetYaw = this.yaw;
    if (moved > 0.004) targetYaw = Math.atan2(dx, dz);
    let hasBird = false;
    if (pointing) {
      // Sim heading already faces the bird/point; prefer the exact bird line.
      targetYaw = Math.atan2(Math.cos(sd.heading), Math.sin(sd.heading));
      if (state === 'pointing' && sd.pointedBirdId !== null) {
        const birds = this.hunt.huntState().birds;
        for (let i = 0; i < birds.length; i++) {
          if (birds[i].id === sd.pointedBirdId) {
            this.hunt.simToWorld(birds[i].pos.x, birds[i].pos.y, this.birdW);
            targetYaw = Math.atan2(this.birdW.x - x, this.birdW.z - z);
            hasBird = true;
            break;
          }
        }
      }
    } else if (gait === 'still' && moved <= 0.004) {
      targetYaw = Math.atan2(Math.cos(sd.heading), Math.sin(sd.heading));
    }
    const dYaw = wrapAngle(targetYaw - this.yaw);
    const yawK = snap ? 1 : 1 - Math.exp(-10 * dt);
    this.yaw += dYaw * yawK;
    // Turn rate → lean into the turn (zeroed rigid when frozen/pointing).
    const rawRate = dt > 0 ? (dYaw * yawK) / dt : 0;
    this.yawRate = approach(this.yawRate, THREE.MathUtils.clamp(rawRate, -4, 4), 6, dt, snap);

    // Stride phase: distance-driven, per-gait stride length.
    const g = gait === 'run' || gait === 'trot' || gait === 'track' ? GAITS[gait] : GAITS.trot;
    if (moved > 0) this.phase = (this.phase + (moved / g.stride) * Math.PI * 2) % (Math.PI * 2 * 3);

    // Terrain slope under the spine (nose-down positive).
    const fx = Math.sin(this.yaw) * 0.3;
    const fz = Math.cos(this.yaw) * 0.3;
    const slope = Math.atan2(
      this.terrain.heightAt(x - fx, z - fz) - this.terrain.heightAt(x + fx, z + fz),
      0.6,
    );
    this.slopePitch = approach(this.slopePitch, THREE.MathUtils.clamp(slope, -0.4, 0.4), 8, dt, snap);

    /* ---------------- pose targets by sim state/gait ---------------- */
    const time = snap ? 0 : ctx.time;
    let tBob = 0;
    let tPitch = 0;
    let tRoll = snap || pointing ? 0 : THREE.MathUtils.clamp(-this.yawRate * 0.05, -0.12, 0.12);
    let tNeck = 0;
    let tHeadP = 0;
    let tHeadY = 0;
    let tTailP = -0.55;
    let tTailY = 0;
    let tEar = 0;
    const tU = [NEUTRAL_U[0], NEUTRAL_U[1], NEUTRAL_U[2], NEUTRAL_U[3]];
    const tL = [NEUTRAL_L[0], NEUTRAL_L[1], NEUTRAL_L[2], NEUTRAL_L[3]];
    let rate = 10;

    if (pointing) {
      // THE POINT, round-7 refined: the whole dog LEANS at the scent —
      // crouched a hair, weight rolled onto the forehand, head and neck
      // dropped ~12 degrees toward the bird, tail a rigid raised flag.
      // Intensity lives in the lean, not in a mannequin standing tall.
      rate = 14;
      tBob = -0.042; // crouch: the body sinks into the stalk it froze from
      tPitch = 0.075; // nose-down pitch — weight on the forehand
      tRoll = 0;
      tNeck = 0.48; // dropped ~12 deg past round 6's level drive
      tTailP = 1.32; // the raised flag — high, rigid, unmistakable
      tTailY = 0;
      tEar = 0.06;
      // Head locked on the bird's actual position — muzzle drives DOWN the
      // scent line (the dropped-head intensity of a real pointing setter).
      if (hasBird) {
        const bdx = this.birdW.x - x;
        const bdz = this.birdW.z - z;
        const horiz = Math.hypot(bdx, bdz);
        const headH = gy + 0.46; // head height once the dropped pose settles
        const birdY = this.terrain.heightAt(this.birdW.x, this.birdW.z) + 0.12;
        tHeadY = THREE.MathUtils.clamp(wrapAngle(Math.atan2(bdx, bdz) - this.yaw), -0.6, 0.6);
        tHeadP =
          THREE.MathUtils.clamp(Math.atan2(headH - birdY, Math.max(horiz, 0.5)) * 0.7, -0.05, 0.4) -
          tNeck * 0.55;
      } else {
        tHeadP = 0.08 - tNeck * 0.55; // honoring: muzzle down the line
      }
      // Left fore lifted high, folded tight under the wrist — the gap of
      // daylight under the chest is half the pose's read.
      tU[0] = -1.35;
      tL[0] = 2.1;
    } else if (gait === 'still') {
      if (sd.scentCheck) {
        // First-scent freeze: mid-stride statue, head snapped up the cone.
        rate = 16;
        const cfg = GAITS.track;
        for (let i = 0; i < 4; i++) {
          const th = this.phase + cfg.off[i];
          tU[i] = NEUTRAL_U[i] + cfg.swing * Math.sin(th) * 0.7;
          tL[i] = NEUTRAL_L[i] + cfg.fold * Math.max(0, Math.cos(th)) * 0.7;
        }
        tNeck = -0.12; // head UP — the "dog makes game" beat
        tHeadP = 0.1;
        tTailP = 0.55;
      } else if (state === 'retrieving') {
        // Mouthing the fall: head buried, tail level, hind end high.
        tNeck = 1.05;
        tHeadP = 0.35 - 1.05 * 0.55;
        tTailP = 0.2;
        tBob = -0.01;
        tPitch = 0.09;
      } else {
        // Heel / idle stand: easy tail, soft breathing.
        tTailP = -0.5 + (snap ? 0 : Math.sin(time * 1.4) * 0.04);
        tTailY = snap ? 0 : Math.sin(time * 1.1) * 0.1;
        tBob = snap ? 0 : Math.sin(time * 2.2) * 0.004;
        tHeadY = snap ? 0 : Math.sin(time * 0.4) * 0.2;
      }
    } else {
      // LOCOMOTION — legs, bob, tail and ears all keyed to the same
      // distance-driven phase.
      for (let i = 0; i < 4; i++) {
        const th = this.phase + g.off[i];
        tU[i] = NEUTRAL_U[i] + g.swing * Math.sin(th);
        tL[i] = NEUTRAL_L[i] + g.fold * Math.max(0, Math.cos(th - 0.35));
      }
      tBob = g.bob * Math.sin(this.phase * 2 + 0.8);
      tPitch = g.rock * Math.sin(this.phase + 2.2);
      tNeck = g.neck;
      tHeadP = g.head - g.neck * 0.55;
      tTailP = g.tail;
      tTailY = snap ? 0 : Math.sin(time * g.wagHz * 2) * g.wag;
      tEar = g.bob * 6 * Math.sin(this.phase * 2 + 2.2);
      // Cover work: inside a sim patch the tail cracks HIGH and busy —
      // the flag over the bluestem is how the handler tracks the dog.
      if (state === 'quartering') {
        const patches = this.hunt.coverPatches();
        for (let i = 0; i < patches.length; i++) {
          const p = patches[i];
          if (Math.abs(x - p.cx) < p.hx && Math.abs(z - p.cz) < p.hz) {
            tTailP = 0.85;
            tTailY = snap ? 0 : Math.sin(time * 16) * 0.38;
            break;
          }
        }
      }
      if (state === 'retrieving') {
        // Head-low carry/approach on the fetch.
        tNeck = 0.85;
        tHeadP = 0.15 - 0.85 * 0.55;
        tTailP = 0.15;
      }
      if (gait === 'track') tBob -= 0.03; // the stalking crouch
    }

    /* --------------------------- apply pose -------------------------- */
    this.bob = approach(this.bob, tBob, rate, dt, snap);
    this.bodyPitch = approach(this.bodyPitch, tPitch, rate, dt, snap);
    this.roll = approach(this.roll, tRoll, rate, dt, snap);
    this.neckPitch = approach(this.neckPitch, tNeck, rate, dt, snap);
    this.headPitch = approach(this.headPitch, tHeadP, rate, dt, snap);
    this.headYaw = approach(this.headYaw, tHeadY, rate, dt, snap);
    this.tailPitch = approach(this.tailPitch, tTailP, rate, dt, snap);
    this.tailYaw = approach(this.tailYaw, tTailY, rate, dt, snap);
    this.earFlop = approach(this.earFlop, tEar, rate, dt, snap);
    for (let i = 0; i < 4; i++) {
      this.uAng[i] = approach(this.uAng[i], tU[i], rate + 4, dt, snap);
      this.lAng[i] = approach(this.lAng[i], tL[i], rate + 4, dt, snap);
      this.legU[i].rotation.x = -this.uAng[i];
      this.legL[i].rotation.x = this.lAng[i];
    }

    // FEET PLANTED (round 7, item 2): analytic paw clearance — for each
    // standing leg, how far its paw hangs above local ground in body space
    // (two cosines per leg, no IK) — and the root sinks by the smallest,
    // so the longest-extended paw touches terrain instead of hovering.
    let clearance = Infinity;
    for (let i = 0; i < 4; i++) {
      if (pointing && i === 0) continue; // the lifted foreleg never plants
      const fore = i < 2;
      const pawY =
        (fore ? FORE_Y : HIND_Y) -
        (fore ? 0.195 : 0.205) * Math.cos(this.uAng[i]) -
        (fore ? 0.2 : 0.21) * Math.cos(this.lAng[i] - this.uAng[i]);
      if (pawY < clearance) clearance = pawY;
    }
    clearance = THREE.MathUtils.clamp(clearance, -0.04, 0.1);

    this.root.position.set(x, gy - clearance, z);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.set(this.slopePitch, this.yaw, 0);
    // Contact ellipse: sun-aligned in world space (never yawing with the
    // body), pitched to the terrain along the shadow direction.
    const shx = this.shadowDirX * 0.6;
    const shz = this.shadowDirZ * 0.6;
    const shSlope = Math.atan2(
      this.terrain.heightAt(x - shx, z - shz) - this.terrain.heightAt(x + shx, z + shz),
      1.2,
    );
    this.shadowGrp.position.set(x, gy + 0.03, z);
    this.shadowGrp.rotation.set(shSlope, this.shadowYaw, 0);
    this.body.position.y = this.bob;
    this.body.rotation.set(this.bodyPitch, 0, this.roll);
    this.neck.rotation.x = this.neckPitch;
    this.head.rotation.set(this.headPitch, this.headYaw, 0);
    this.tail.rotation.set(this.tailPitch, this.tailYaw, 0);
    this.earL.rotation.x = this.earFlop;
    this.earR.rotation.x = this.earFlop;
  }

  dispose(ctx: Ctx): void {
    ctx.scene.remove(this.root);
    ctx.scene.remove(this.shadowGrp);
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    this.mat?.dispose();
    this.mat = undefined;
    this.shadowGeo?.dispose();
    this.shadowGeo = undefined;
    this.shadowMat?.dispose();
    this.shadowMat = undefined;
  }
}
