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
 *  - BODY: hex-lofted torso (deep chest, waist tuck, haunch), boxed neck/
 *    head/muzzle, hanging setter ears, saber tail with a feathering fin,
 *    four two-segment legs. White coat off the palette's pale role with
 *    dark head patches and a sparse belton ticking suggestion (a few
 *    surface flecks — suggestion, not noise). ~0.55 m at the shoulder,
 *    ~430 tris, 14 draw calls.
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

/** Torso loft sections, rear→front: rump, hip, waist tuck, heart girth, prosternum. */
const TORSO_SECTS: SectZ[] = [
  { x: 0, y: 0.44, z: -0.33, hw: 0.055, hh: 0.075 },
  { x: 0, y: 0.43, z: -0.24, hw: 0.082, hh: 0.108 },
  { x: 0, y: 0.445, z: -0.06, hw: 0.072, hh: 0.098 },
  { x: 0, y: 0.425, z: 0.12, hw: 0.094, hh: 0.132 },
  { x: 0, y: 0.42, z: 0.24, hw: 0.078, hh: 0.122 },
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
    uRimColor: { value: new THREE.Color(0) },
    uRimK: { value: 0 },
  };
  private creamScratch = new THREE.Color(P.cream);

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
    // Sun answer (the flora recipe, sized for a white coat): sun-facing
    // facets take a warm lift, shade facets cool gently — a white dog under
    // a blue sky vault otherwise renders slate-blue head to tail, and the
    // coat must read WHITE at a glance in every light.
    const tone = this.tone;
    this.mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, tone);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uSunDirW;\nuniform float uWarmK;\nuniform float uCoolK;\n' +
            'uniform vec3 uRimColor;\nuniform float uRimK;',
        )
        .replace(
          '#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\n' +
            '\tvec3 gWN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );\n' +
            '\tvec3 gVW = normalize( ( vec4( normalize( vViewPosition ), 0.0 ) * viewMatrix ).xyz );\n' +
            '\tfloat gSplit = smoothstep( -0.15, 0.3, dot( gWN, uSunDirW ) );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.24, 1.1, 0.9 ), gSplit * uWarmK );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.86, 0.85, 0.94 ), ( 1.0 - gSplit ) * uCoolK );',
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' +
            // Low-sun rim: the hot edge on glancing sun-facing facets that
            // keeps the white coat alive when the camera faces the sunrise.
            '\tfloat gRim = pow( 1.0 - abs( dot( gWN, gVW ) ), 3.0 ) * clamp( dot( gWN, uSunDirW ) * 0.7 + 0.3, 0.0, 1.0 );\n' +
            '\ttotalEmissiveRadiance += uRimColor * ( gRim * uRimK );',
        );
    };
    // Warm-leaning ambient whisper so the shade side never goes unlit
    // blue-black; crushed at the silhouette hour so the dog stays a
    // silhouette against the afterglow.
    const applyTod = (tod: TimeOfDay): void => {
      const spec = TOD[tod];
      // The A-Short-Hike character cheat: the hero coat carries its own
      // warm fill so the dog reads WHITE in every daylight, never the
      // pewter-lavender a white albedo turns under a mauve sky vault. The
      // fill leans on the haze role of the hour (they are pale AND warm by
      // construction) and rises exactly when the sun drops — the low-sun
      // hours are when the hemisphere goes coolest.
      const silh = spec.grassLumCap < 1;
      const lowSun = THREE.MathUtils.clamp(1 - (spec.sunElevation - 2) / 13, 0, 1);
      this.mat!.emissive.setHex(spec.fogColor).lerp(this.creamScratch, 0.35);
      this.mat!.emissiveIntensity = silh ? 0.05 : 0.2 + lowSun * 0.3;
      const el = THREE.MathUtils.degToRad(spec.sunElevation);
      const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
      this.tone.uSunDirW.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      this.tone.uWarmK.value = 0.35 + spec.floraWarm * 0.55;
      this.tone.uCoolK.value = silh ? 0.2 : 0.22;
      // Rim rides the hour's sun color, strongest at the golden hours.
      this.tone.uRimColor.value.setHex(spec.sunColor);
      this.tone.uRimK.value = (silh ? 0.25 : 0.12) + lowSun * 0.75;
    };
    applyTod(ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => applyTod(e.detail)) as EventListener);

    this.buildBody(high);

    this.root.add(this.body);
    ctx.scene.add(this.root);
    // First placement so frame 0 isn't a dog at the origin.
    this.update(ctx, 1 / 60);
  }

  /* ------------------------------- build ------------------------------- */

  private mesh(geo: THREE.BufferGeometry, high: boolean): THREE.Mesh {
    this.geos.push(geo);
    const m = new THREE.Mesh(geo, this.mat!);
    m.castShadow = high;
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
    // identity when standing so the pivot math reads clean).
    {
      const b = new PartBuilder();
      b.boxZ(
        { x: 0, y: -0.04, z: -0.045, hw: 0.052, hh: 0.082 },
        { x: 0, y: NECK_TOP[1] - 0.015, z: NECK_TOP[2] + 0.015, hw: 0.037, hh: 0.05 },
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

    // EARS — long, low-set, hanging flat: the setter signature. Separate
    // meshes so they bounce with the gait.
    for (const side of [-1, 1]) {
      const b = new PartBuilder();
      b.boxY(
        { x: 0, y: 0, z: 0, hw: 0.009, hd: 0.04 },
        { x: side * 0.014, y: -0.148, z: 0.012, hw: 0.005, hd: 0.028 },
        patch,
      );
      const grp = side < 0 ? this.earL : this.earR;
      grp.add(this.mesh(b.build(), high));
      grp.position.set(side * 0.05, 0.03, 0.018);
      grp.rotation.z = side * -0.3; // flare off the skull
      this.head.add(grp);
    }

    // TAIL — straight saber with a feathering fin below: level at the
    // trot, STRAIGHT UP on point (the fin then flags behind it).
    {
      const b = new PartBuilder();
      b.boxZ(
        { x: 0, y: -0.008, z: -0.2, hw: 0.016, hh: 0.018 },
        { x: 0, y: 0, z: 0, hw: 0.024, hh: 0.03 },
        { side: coat },
      );
      b.boxZ(
        { x: 0, y: -0.024, z: -0.36, hw: 0.007, hh: 0.009 },
        { x: 0, y: -0.008, z: -0.2, hw: 0.016, hh: 0.018 },
        { side: coat },
      );
      // Feather fin: ragged white flag hanging off the underside — on
      // point the tail stands and this flags behind it.
      b.quad2(
        [0, -0.016, -0.05], [0, -0.026, -0.17], [0, -0.095, -0.14], [0, -0.075, -0.045],
        coat,
      );
      b.quad2(
        [0, -0.026, -0.17], [0, -0.036, -0.29], [0, -0.08, -0.235], [0, -0.095, -0.14],
        coatDim,
      );
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
          b.boxY(
            { x: 0, y: 0.02, z: 0, hw: 0.032, hd: 0.05 },
            { x: 0, y: -0.195, z: 0.004, hw: 0.02, hd: 0.026 },
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
      // THE POINT. Rigid, horizontal, tail at twelve o'clock, head nailed
      // to the bird, left foreleg lifted and folded — intensity itself.
      rate = 14;
      tBob = -0.028;
      tPitch = 0.05;
      tRoll = 0;
      tNeck = 0.34; // neck drops from the proud rake toward a level drive
      tTailP = 1.62; // twelve o'clock, unmistakable at any camera slope
      tTailY = 0;
      tEar = 0.06;
      // Head locked on the bird's actual position — muzzle stays near
      // level (the classic intensity), only a modest dip onto the line.
      if (hasBird) {
        const bdx = this.birdW.x - x;
        const bdz = this.birdW.z - z;
        const horiz = Math.hypot(bdx, bdz);
        const headH = gy + 0.52; // head height once the pose settles
        const birdY = this.terrain.heightAt(this.birdW.x, this.birdW.z) + 0.12;
        tHeadY = THREE.MathUtils.clamp(wrapAngle(Math.atan2(bdx, bdz) - this.yaw), -0.6, 0.6);
        tHeadP =
          THREE.MathUtils.clamp(Math.atan2(headH - birdY, Math.max(horiz, 0.5)) * 0.55, -0.1, 0.3) -
          tNeck * 0.55;
      } else {
        tHeadP = -tNeck * 0.55; // honoring: level muzzle down the line
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

    this.root.position.set(x, gy, z);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.set(this.slopePitch, this.yaw, 0);
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
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    this.mat?.dispose();
    this.mat = undefined;
  }
}
