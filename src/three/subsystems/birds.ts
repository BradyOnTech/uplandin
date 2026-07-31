import * as THREE from 'three';
import { YOUNG_FLIGHT_MULT } from '../../game/birds';
import { mulberry32 } from '../../game/math';
import {
  escapeVelocityFan,
  exitDirFor,
  flushBias,
  glideStep,
  levelStep,
  type FlushBias,
} from '../../game/shot';
import { getSpecies, type SpeciesConfig } from '../../game/species';
import type { Ctx, Subsystem } from '../engine';
import { P, TOD, type TimeOfDay } from '../palette';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';

/*
 * BIRDS subsystem — the covey rise, the game's arcade heart, in 3D.
 *
 * THE SIM MATH IS THE AUTHORITY. The 2D FlushScene pipeline (its docblock
 * + docs/TUNING.md) computes a rise in stages, and this file TRANSLATES
 * each stage to world space — it never reinvents a knob:
 *
 *  1. flushBias(walk-in px) from shot.ts sizes the rise (hunt3d records
 *     the walk-in distance when triggerFlush fires).
 *  2. WAVES: up to WAVE_MAX (FlushScene's MAX_AIRBORNE = 3) birds burst
 *     SIMULTANEOUSLY; the next wave rises only when the sky is clear and
 *     LAUNCH_GAP_MS has passed; ~18% are sleepers that pop 350–900 ms
 *     after their wave — the straggler at your feet.
 *  3. Per-bird velocity IS escapeVelocityFan(flight, shuffledLane, 3):
 *     species arc slice + FAN_SPREAD_PUSH + full-slice jitter, then the
 *     FlushScene layers: speed roll (0.85–1.3×, wild 0.95–1.4×), the
 *     per-flush break direction (±28 px/s drift), young-bird mult.
 *  4. Flight phases: after flight.glideAfterMs the quail locks wings and
 *     glideStep drives it; after levelAfterMs the rooster levels via
 *     levelStep. Both accelerate toward an exit — the tilted playfield.
 *  5. 3D TRANSLATION (the only new thing here): the 2D fan plane maps to
 *     world space around the ESCAPE BEARING — away from the hunter,
 *     bent DOWN THE WIND. 2D x (lateral px/s) rides the fan's right
 *     axis; 2D y (screen-down px/s) is climb; and a forward carry along
 *     the bearing supplies what the 2D view said with depth-shrink: a
 *     rising bird is a DEPARTING bird. Every airborne bird gains range
 *     from the hunter every tick — no hovering, ever.
 *
 * TIME: bird flight advances on the 30 Hz fixed tick (or step() under
 * ?capture=1 — the 2D game froze field time during a rise by switching
 * scenes; stepRise in the capture API is that same held breath: birds
 * fly, the pointing dog stands). All randomness comes from a local
 * per-rise mulberry32 stream. update() only writes transforms — a
 * captured rise is a pure function of the seed and the tick count.
 *
 * BODIES: low-poly bobwhite ~0.24 m — chunky hex-loft body (russet back,
 * buff belly — the palette's gamebird roles), dark cap over a buff
 * throat, SHORT ROUNDED wings (two double-sided quads each, flapping at
 * the species' flapRate), stub tail. ~132 tris a bird, 3 draw calls
 * (body+tail, wingL, wingR); 6-bird pool worst case ≈ 19 calls with the
 * launch-burst debris. A folded falling frame (wings pinned, tumbling)
 * ships now for the gun phase to call via downBird().
 *
 * Per-frame: transform writes only, zero allocations.
 */

/** Local streams — never ctx.rng (per-subsystem determinism law). */
const BIRD_ART_SEED = 0xb0bde7;
const RISE_SEED = 0x2e15e;

/** FlushScene's MAX_AIRBORNE: Duck Hunt rules the sky — at most a few
 *  readable targets at once; a big covey is a longer sequence. */
const WAVE_MAX = 3;
/** FlushScene's LAUNCH_GAP_MS — the breath between waves. */
const LAUNCH_GAP_MS = 300;
/** FlushScene sleeper knobs: chance / delay window (ms). */
const SLEEPER_CHANCE = 0.18;
const SLEEPER_MIN_MS = 350;
const SLEEPER_RAND_MS = 550;
/** FlushScene's per-flush break direction: ±28 px/s (drift = (r-.5)*56). */
const DRIFT_SPAN_PX = 56;
/** FlushScene's WAVE_SLOT_SPREAD — seeds the virtual screen-x that
 *  exitDirFor reads, so lane geometry biases exits exactly as in 2D. */
const SLOT_SPREAD_PX = 78;
/** 2D screen center x — exitDirFor's reference frame. */
const SCREEN_CX = 240;

/**
 * Flush-view px -> meters, horizontal axis. The shooting gallery ran its
 * own scale; 0.14 lands the authority numbers in believable air: a
 * 130 px/s bobwhite burst ≈ 18 m/s, GLIDE_MAX 150 ≈ 21 m/s downwind.
 */
const FLUSH_PX_TO_M = 0.14;
/**
 * Vertical axis runs a TIGHTER scale: the 2D sky was 205 px tall and a
 * burst crossed it in ~1.2 s — mapped 1:1 with the horizontal scale the
 * covey teleports out of every readable frame. 0.10 keeps the same beat
 * (steep climb, ~10 m up when the glide flattens) inside a composable
 * window. Same law, different axis of the translation.
 */
const FLUSH_PX_TO_M_V = 0.1;
/**
 * LAUNCH placement scale (px -> m): FlushScene staged launches on a 480
 * px readable stage — lanes SLOT_SPREAD apart, field position only a
 * clamped ±55 px NUDGE, ±16 px jitter ("this view runs on Duck Hunt
 * rules, not covey GPS"). Iteration 3 lesson: launching from raw sim
 * positions (±9 m covey jitter) scattered the explosion into lone
 * specks; the 2D stage placement IS the authority, so we translate it —
 * anchored at the covey centroid, spread along the fan's right axis.
 */
const LAUNCH_PX_TO_M = 0.035;
/** FlushScene's worldNudge clamp (±px) and launch jitter (±px). */
const NUDGE_CLAMP_PX = 55;
const NUDGE_GAIN = 0.35;
const LAUNCH_JITTER_PX = 16;
/**
 * Presentation scale on the 0.24 m body — the same tribute the 2D view
 * paid with chunky sprites (its bobwhite spanned ~9% of the screen):
 * the silhouette must read GAMEBIRD at the 15-25 m a rise honestly
 * frames from, and a to-scale bobwhite is a 6-12 px speck there. 2.4
 * is still a fraction of the 2D license. Duck Hunt rules the sky.
 */
const RISE_SCALE = 2.4;

/** Forward carry along the escape bearing (m/s): what 2D said with
 *  depth-shrink. Ramps up as wings bite so range ALWAYS grows. */
const FWD_MIN = 3.5;
const FWD_MAX = 9.0;
const FWD_RAMP_MS = 1400;
/** How hard the escape bearing bends downwind (0 = pure away). */
const WIND_BIAS = 0.55;

/** A bird this far from the hunter (m) has left the stage. */
const GONE_RANGE = 80;
/** A glide that touches grass after this long has put down — gone. */
const LAND_MIN_AIR_MS = 1200;
const MAX_AIR_MS = 15000;

/** Pool = the airborne budget: one wave + sleepers, headroom for later. */
const POOL = 6;

/** 2D falling authority: 170 px/s drop, 540 deg/s tumble. */
const FALL_PX_PER_S = 170;
const TUMBLE_RAD_PER_S = (540 * Math.PI) / 180;

const DEBRIS_N = 24;
const DEBRIS_LIFE_MS = 900;

type SlotStatus = 'idle' | 'waiting' | 'flying' | 'falling' | 'done';

interface Slot {
  status: SlotStatus;
  simId: number;
  species: SpeciesConfig;
  /** Sim-authority velocity in FLUSH px/s: x lateral, y screen-down. */
  vel: { x: number; y: number };
  /** Virtual 2D screen-x (px) — exitDirFor's frame of reference. */
  sxPx: number;
  exitDir: 1 | -1 | 0;
  x: number;
  y: number;
  z: number;
  /** World velocity of the last tick (orientation reads these). */
  vxW: number;
  vyW: number;
  vzW: number;
  airMs: number;
  delayMs: number;
  wobblePh: number;
  wobbleMult: number;
  gliding: boolean;
  root: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
}

/* ------------------------------ geometry ------------------------------ */

type V3 = readonly [number, number, number];

class SoupBuilder {
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

  /** Both windings — thin wing/tail panels read from above and below. */
  quad2(a: V3, b: V3, c: V3, d: V3, color: THREE.Color): void {
    this.quad(a, b, c, d, color);
    this.quad(d, c, b, a, color);
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    return geo;
  }
}

interface SectZ {
  y: number;
  z: number;
  hw: number;
  hh: number;
}

/** Hex ring: top vertex, flanks, keel — same shape language as the dog. */
const HEX_ANG = [90, 150, 210, 270, 330, 30].map((d) => (d * Math.PI) / 180);

/**
 * Body loft sections, tail root -> head. ~0.24 m beak to tail tip and
 * CHUNKY: the belly ring is nearly as deep as the bird is long — the
 * round-shouldered bowling-pin silhouette that says GAMEBIRD against
 * sky, not songbird.
 */
const BODY_SECTS: SectZ[] = [
  { y: 0.006, z: -0.075, hw: 0.02, hh: 0.018 },
  { y: 0.0, z: -0.03, hw: 0.038, hh: 0.035 },
  { y: 0.0, z: 0.02, hw: 0.044, hh: 0.04 },
  { y: 0.009, z: 0.06, hw: 0.033, hh: 0.031 },
  { y: 0.024, z: 0.092, hw: 0.021, hh: 0.021 },
];

export class BirdsSystem implements Subsystem {
  readonly id = 'birds';

  private hunt!: Hunt3DSystem;
  private terrain!: TerrainSystem;
  private frozen = false;

  private mat?: THREE.MeshLambertMaterial;
  private geos: THREE.BufferGeometry[] = [];
  private slots: Slot[] = [];

  /** Sun-answer uniforms (the dog's proven coat recipe, sized for russet). */
  private tone = {
    uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
    uWarmK: { value: 0 },
    uCoolK: { value: 0 },
    uCoolTint: { value: new THREE.Color(P.shadowNeutral) },
    uRimColor: { value: new THREE.Color(0) },
    uRimK: { value: 0 },
  };
  private hazeScratch = new THREE.Color(P.cream);

  /* --------------------------- rise state --------------------------- */
  /** Sim bird ids already staged into this presentation. */
  private staged = new Set<number>();
  /** Launch queue (sim ids), ring buffer — covey order, like the 2D view. */
  private queue = new Int32Array(32);
  private qHead = 0;
  private qTail = 0;
  private riseActive = false;
  private riseSeq = 0;
  private riseRng: () => number = mulberry32(RISE_SEED);
  private bias: FlushBias = { min: 0.9, max: 1.15, kind: 'earned' };
  private driftPx = 0;
  /** Escape bearing (unit, world xz) and its right axis — the fan plane. */
  private escX = 0;
  private escZ = 1;
  private rightX = 1;
  private rightZ = 0;
  /** Hunter world position at the flush — range is measured from here. */
  private hunterX = 0;
  private hunterZ = 0;
  /** Covey centroid at the flush: world m (launch anchor) + sim px (nudge). */
  private originX = 0;
  private originZ = 0;
  private originSimX = 0;
  private originSimY = 0;
  /** ms since the flush was staged (rise-local clock). */
  private riseMs = 0;
  private lastLaunchMs = -Infinity;
  private laneBuf = [0, 1, 2];

  /* ----------------------- launch-burst debris ---------------------- */
  private debrisGeo?: THREE.BufferGeometry;
  private debrisMesh?: THREE.Mesh;
  /** Per-particle dir (xyz) + speed, rolled per burst from the rise rng. */
  private debrisVel = new Float32Array(DEBRIS_N * 4);
  private debrisOx = 0;
  private debrisOy = 0;
  private debrisOz = 0;
  private debrisMs = -1;

  // Preallocated scratch.
  private w2 = { x: 0, z: 0 };

  init(ctx: Ctx): void {
    this.frozen = new URLSearchParams(location.search).has('capture');
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.terrain = ctx.get<TerrainSystem>('terrain');

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // The dog's round-7 lesson, inherited whole: bodies take the WORLD's
    // light. Warm lift on sun-facing facets, shade facets multiplied
    // toward the hour's shadow tint, and a HOT sun-colored rim at the
    // golden hours — the dawn rise is backlit russet, the money light.
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
            '\tfloat gSplit = smoothstep( -0.15, 0.3, dot( gWN, uSunDirW ) );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.26, 1.1, 0.88 ), gSplit * uWarmK );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), uCoolTint, ( 1.0 - gSplit ) * uCoolK );',
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' +
            '\tfloat gRim = pow( 1.0 - abs( dot( gWN, gVW ) ), 2.5 ) * clamp( dot( gWN, uSunDirW ) * 0.7 + 0.3, 0.0, 1.0 );\n' +
            '\ttotalEmissiveRadiance += uRimColor * ( gRim * uRimK );',
        );
    };
    const applyTod = (tod: TimeOfDay): void => {
      const spec = TOD[tod];
      const silh = spec.grassLumCap < 1;
      const lowSun = THREE.MathUtils.clamp(1 - (spec.sunElevation - 2) / 13, 0, 1);
      this.mat!.emissive.setHex(spec.fogColor).lerp(this.hazeScratch, 0.4);
      this.mat!.emissiveIntensity = silh ? 0.04 : 0.1;
      const el = THREE.MathUtils.degToRad(spec.sunElevation);
      const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
      this.tone.uSunDirW.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      this.tone.uWarmK.value = 0.3 + spec.floraWarm * 0.5;
      this.tone.uCoolTint.value.setHex(spec.grassShadow).multiplyScalar(0.82);
      this.tone.uCoolK.value = silh ? 0.6 : 0.3 + lowSun * 0.3;
      // The rise against the sunrise lives on this edge: rim rides the
      // hour's sun color, hotter than the dog's — small bodies against
      // bright sky need the halo to keep their silhouette warm-lined.
      this.tone.uRimColor.value.setHex(spec.sunColor);
      this.tone.uRimK.value = (silh ? 0.35 : 0.15) + lowSun * 1.45;
    };
    applyTod(ctx.timeOfDay);
    ctx.events.addEventListener('tod', ((e: CustomEvent) => applyTod(e.detail)) as EventListener);

    this.buildPool(ctx);
    this.buildDebris(ctx);
  }

  /* ------------------------------ build ------------------------------ */

  private buildPool(ctx: Ctx): void {
    const rng = mulberry32(BIRD_ART_SEED);
    // Bobwhite roles off the locked palette: russet back over buff belly,
    // an oxblood-dark cap above a pale throat, dusk-brown wings a step
    // darker than the back so the beat reads inside the body mass.
    const back = new THREE.Color(P.russet).lerp(new THREE.Color(P.warmGray), 0.35);
    const backDim = back.clone().multiplyScalar(0.82);
    const belly = new THREE.Color(P.strawLight).lerp(new THREE.Color(P.strawPale), 0.45);
    const cap = new THREE.Color(P.oxblood).lerp(new THREE.Color(P.charcoal), 0.3);
    const throat = new THREE.Color(P.strawPale);
    const wingC = new THREE.Color(P.russetDeep).lerp(new THREE.Color(P.warmGray), 0.4);
    const wingDim = wingC.clone().multiplyScalar(0.85);
    const tailC = new THREE.Color(P.warmGray).multiplyScalar(0.7);

    const bodyGeo = this.buildBodyGeo(back, backDim, belly, cap, throat, tailC);
    const wingGeoL = this.buildWingGeo(-1, wingC, wingDim);
    const wingGeoR = this.buildWingGeo(1, wingC, wingDim);
    this.geos.push(bodyGeo, wingGeoL, wingGeoR);

    for (let i = 0; i < POOL; i++) {
      const root = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, this.mat!);
      body.castShadow = false;
      body.receiveShadow = false;
      root.add(body);
      const wingL = new THREE.Group();
      const wingR = new THREE.Group();
      const wl = new THREE.Mesh(wingGeoL, this.mat!);
      const wr = new THREE.Mesh(wingGeoR, this.mat!);
      wl.castShadow = wl.receiveShadow = false;
      wr.castShadow = wr.receiveShadow = false;
      wingL.add(wl);
      wingR.add(wr);
      // Shoulder pivots high on the chest — the flap arcs over the back.
      wingL.position.set(-0.03, 0.016, 0.028);
      wingR.position.set(0.03, 0.016, 0.028);
      root.add(wingL);
      root.add(wingR);
      root.scale.setScalar(RISE_SCALE);
      root.visible = false;
      ctx.scene.add(root);
      this.slots.push({
        status: 'idle',
        simId: -1,
        species: getSpecies('bobwhite'),
        vel: { x: 0, y: 0 },
        sxPx: SCREEN_CX,
        exitDir: 0,
        x: 0,
        y: 0,
        z: 0,
        vxW: 0,
        vyW: 0,
        vzW: 0,
        airMs: 0,
        delayMs: 0,
        wobblePh: rng() * 6.28,
        wobbleMult: 1,
        gliding: false,
        root,
        wingL,
        wingR,
      });
    }
  }

  /** Hex-lofted body + stub tail fan, one geometry (one draw call). */
  private buildBodyGeo(
    back: THREE.Color,
    backDim: THREE.Color,
    belly: THREE.Color,
    cap: THREE.Color,
    throat: THREE.Color,
    tailC: THREE.Color,
  ): THREE.BufferGeometry {
    const b = new SoupBuilder();
    const rings: V3[][] = BODY_SECTS.map((s) => {
      const r: V3[] = new Array(6);
      for (let i = 0; i < 6; i++) {
        r[i] = [Math.cos(HEX_ANG[i]) * s.hw, s.y + Math.sin(HEX_ANG[i]) * s.hh, s.z];
      }
      return r;
    });
    // Per-segment coloring around the ring: segments 5-0 and 0-1 are the
    // BACK (russet), 1-2 / 4-5 the flanks (dimmed), 2-3 / 3-4 the BELLY
    // (buff) — the two-tone gamebird read. The head band (last) swaps to
    // dark cap over buff throat: bobwhite's face pattern at silhouette
    // scale.
    const segTone = (band: number, j: number): THREE.Color => {
      const isHead = band === BODY_SECTS.length - 2;
      if (j === 5 || j === 0) return isHead ? cap : back;
      if (j === 1 || j === 4) return isHead ? cap : backDim;
      return isHead ? throat : belly;
    };
    for (let k = 0; k < rings.length - 1; k++) {
      const rear = rings[k];
      const front = rings[k + 1];
      for (let j = 0; j < 6; j++) {
        const j2 = (j + 1) % 6;
        b.quad(rear[j], rear[j2], front[j2], front[j], segTone(k, j));
      }
    }
    // Caps: tail-root point and the beak.
    const capRear: V3 = [0, 0.008, -0.092];
    const capFront: V3 = [0, 0.02, 0.118];
    const first = rings[0];
    const last = rings[rings.length - 1];
    for (let j = 0; j < 6; j++) {
      const j2 = (j + 1) % 6;
      b.tri(first[j2], first[j], capRear, backDim);
      b.tri(last[j], last[j2], capFront, cap);
    }
    // Stub tail: two short fan panels — bobwhite barely has one, and the
    // SHORT tail is half of what separates quail from songbird in the sky.
    b.quad2([-0.018, 0.01, -0.07], [0.004, 0.012, -0.072], [0.002, 0.0, -0.118], [-0.02, -0.002, -0.112], tailC);
    b.quad2([-0.004, 0.012, -0.072], [0.018, 0.01, -0.07], [0.02, -0.002, -0.112], [-0.002, 0.0, -0.118], tailC);
    return b.build();
  }

  /**
   * One wing: TWO quads — broad inner panel, shorter ROUNDED outer panel
   * (narrower, swept back, a hair drooped). Double-sided. side -1 = left
   * (extends -x), +1 = right.
   */
  private buildWingGeo(side: 1 | -1, wingC: THREE.Color, wingDim: THREE.Color): THREE.BufferGeometry {
    const b = new SoupBuilder();
    const s = side;
    // Inner panel: shoulder edge hugs the body, trailing edge full-chord.
    b.quad2(
      [0, 0, -0.034],
      [0, 0, 0.038],
      [s * 0.058, -0.002, 0.032],
      [s * 0.058, -0.004, -0.048],
      wingC,
    );
    // Outer panel: chord shrinks hard and the tip sweeps BACK — the round
    // stubby quail wing, nothing like a swallow's taper.
    b.quad2(
      [s * 0.058, -0.004, -0.048],
      [s * 0.058, -0.002, 0.032],
      [s * 0.106, -0.008, 0.004],
      [s * 0.106, -0.01, -0.038],
      wingDim,
    );
    return b.build();
  }

  private buildDebris(ctx: Ctx): void {
    // Launch burst: two dozen straw/duff bits kicked out of the cover as
    // the covey blows — one mesh, vertex-colored, visible only while a
    // burst lives. Grass-parting note: the shader parting uniforms belong
    // to grass/dog; this debris is the birds' own half of the moment.
    const rng = mulberry32(BIRD_ART_SEED ^ 0x5eed);
    const pos = new Float32Array(DEBRIS_N * 4 * 3);
    const col = new Float32Array(DEBRIS_N * 4 * 3);
    const idx = new Uint16Array(DEBRIS_N * 6);
    const tones = [
      new THREE.Color(P.straw),
      new THREE.Color(P.oliveMid),
      new THREE.Color(P.khaki),
      new THREE.Color(P.soilBrown),
    ];
    for (let i = 0; i < DEBRIS_N; i++) {
      const c = tones[Math.floor(rng() * tones.length)];
      for (let v = 0; v < 4; v++) {
        col[(i * 4 + v) * 3] = c.r;
        col[(i * 4 + v) * 3 + 1] = c.g;
        col[(i * 4 + v) * 3 + 2] = c.b;
      }
      idx[i * 6] = i * 4;
      idx[i * 6 + 1] = i * 4 + 1;
      idx[i * 6 + 2] = i * 4 + 2;
      idx[i * 6 + 3] = i * 4;
      idx[i * 6 + 4] = i * 4 + 2;
      idx[i * 6 + 5] = i * 4 + 3;
    }
    this.debrisGeo = new THREE.BufferGeometry();
    this.debrisGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.debrisGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.debrisGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.debrisMesh = new THREE.Mesh(this.debrisGeo, this.mat!);
    this.debrisMesh.castShadow = this.debrisMesh.receiveShadow = false;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.visible = false;
    ctx.scene.add(this.debrisMesh);
  }

  /* ----------------------------- sim tick ---------------------------- */

  fixedUpdate(ctx: Ctx, dtMs: number): void {
    if (this.frozen) return;
    this.tickBirds(dtMs);
  }

  /** Capture harness: advance the rise by exact 30 Hz ticks (the 2D
   *  scene-cut translated — field sim may hold while the rise plays). */
  step(_ctx: Ctx, ticks: number): void {
    for (let i = 0; i < ticks; i++) this.tickBirds(1000 / 30);
  }

  private tickBirds(dtMs: number): void {
    const dt = dtMs / 1000;
    this.riseMs += dtMs;

    // 1. Detect newly flushed sim birds -> stage a rise (covey order).
    const simBirds = this.hunt.huntState().birds;
    let newRise = false;
    for (let i = 0; i < simBirds.length; i++) {
      const b = simBirds[i];
      if (b.state !== 'flushed' || this.staged.has(b.id)) continue;
      this.staged.add(b.id);
      this.queue[this.qTail % this.queue.length] = b.id;
      this.qTail++;
      if (!this.riseActive) newRise = true;
    }
    if (newRise) this.stageRise(simBirds);

    // 2. Fly what's flying.
    let anyAloft = false;
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (s.status === 'idle' || s.status === 'done') continue;
      if (s.status === 'waiting') {
        anyAloft = true; // a pending sleeper blocks the next wave, as in 2D
        s.delayMs -= dtMs;
        if (s.delayMs <= 0) s.status = 'flying';
        continue;
      }
      if (s.status === 'falling') {
        // 2D authority: 170 px/s drop, 540 deg/s tumble (update() spins).
        s.vyW = -FALL_PX_PER_S * FLUSH_PX_TO_M_V;
        s.y += s.vyW * dt;
        s.airMs += dtMs;
        const g = this.terrain.heightAt(s.x, s.z);
        if (s.y <= g + 0.06) {
          s.y = g + 0.06;
          s.status = 'done';
          s.root.visible = false;
        }
        continue;
      }
      // flying
      anyAloft = true;
      s.airMs += dtMs;
      const fl = s.species.flight;
      // Flight phases — the sim's own exit drive mutates the sim-space vel.
      if (fl.glideAfterMs !== undefined && s.airMs > fl.glideAfterMs) {
        if (s.exitDir === 0) s.exitDir = exitDirFor(s.vel.x, s.sxPx);
        glideStep(s.vel, s.exitDir, dt);
        s.gliding = true;
      }
      if (fl.levelAfterMs !== undefined && s.airMs > fl.levelAfterMs) {
        if (s.exitDir === 0) s.exitDir = exitDirFor(s.vel.x, s.sxPx);
        levelStep(s.vel, s.exitDir, dt);
      }
      s.wobblePh += dt * 9;
      const latPx = s.vel.x + Math.sin(s.wobblePh) * fl.wobble * s.wobbleMult;
      s.sxPx += s.vel.x * dt;
      // 3D translation: lateral px on the fan's right axis, climb from
      // screen-y, forward carry along the escape bearing (ramping as the
      // wings bite). Range from the hunter grows every single tick.
      const fwd = FWD_MIN + (FWD_MAX - FWD_MIN) * Math.min(1, s.airMs / FWD_RAMP_MS);
      const latM = latPx * FLUSH_PX_TO_M;
      s.vxW = this.escX * fwd + this.rightX * latM;
      s.vzW = this.escZ * fwd + this.rightZ * latM;
      s.vyW = -s.vel.y * FLUSH_PX_TO_M_V;
      s.x += s.vxW * dt;
      s.z += s.vzW * dt;
      s.y += s.vyW * dt;
      const g = this.terrain.heightAt(s.x, s.z);
      if (s.y < g + 0.25) {
        s.y = g + 0.25;
        if (s.airMs > LAND_MIN_AIR_MS) {
          // Glided out and put down — gone from the presentation. The SIM
          // decides escape/relight; we never write bird state.
          s.status = 'done';
          s.root.visible = false;
          continue;
        }
      }
      const rx = s.x - this.hunterX;
      const rz = s.z - this.hunterZ;
      if (rx * rx + rz * rz > GONE_RANGE * GONE_RANGE || s.airMs > MAX_AIR_MS) {
        s.status = 'done';
        s.root.visible = false;
      }
    }

    // 3. Wave launcher — FlushScene.tryLaunch translated: next wave only
    //    when the sky is clear and the gap has passed.
    if (!anyAloft && this.qHead < this.qTail && this.riseMs - this.lastLaunchMs >= LAUNCH_GAP_MS) {
      this.launchWave(simBirds);
    }
    if (this.riseActive && !anyAloft && this.qHead >= this.qTail) {
      let quiet = true;
      for (let i = 0; i < POOL; i++) {
        if (this.slots[i].status === 'falling') quiet = false;
      }
      if (quiet) this.riseActive = false; // the sky settled
    }

    // 4. Debris clock.
    if (this.debrisMs >= 0) {
      this.debrisMs += dtMs;
      if (this.debrisMs > DEBRIS_LIFE_MS) this.debrisMs = -1;
    }
  }

  /** A covey just blew: roll the rise's character (bias, break direction,
   *  escape bearing bent down the wind) from a fresh per-rise stream. */
  private stageRise(simBirds: readonly { id: number; pos: { x: number; y: number } }[]): void {
    this.riseActive = true;
    this.riseSeq++;
    this.riseMs = 0;
    this.lastLaunchMs = -Infinity;
    this.riseRng = mulberry32((RISE_SEED + this.riseSeq * 0x9e3779b9) >>> 0);
    const info = this.hunt.lastFlushInfo();
    this.bias = flushBias(info ? info.distPx : 25, this.riseRng);
    this.driftPx = (this.riseRng() - 0.5) * DRIFT_SPAN_PX;

    // Covey centroid (queued birds) and hunter, in world meters — the
    // launch anchor; also kept in sim px for the 2D worldNudge law.
    let cx = 0;
    let cz = 0;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let q = this.qHead; q < this.qTail; q++) {
      const id = this.queue[q % this.queue.length];
      for (let i = 0; i < simBirds.length; i++) {
        if (simBirds[i].id === id) {
          sx += simBirds[i].pos.x;
          sy += simBirds[i].pos.y;
          this.hunt.simToWorld(simBirds[i].pos.x, simBirds[i].pos.y, this.w2);
          cx += this.w2.x;
          cz += this.w2.z;
          n++;
          break;
        }
      }
    }
    if (n > 0) {
      cx /= n;
      cz /= n;
      sx /= n;
      sy /= n;
    }
    this.originX = cx;
    this.originZ = cz;
    this.originSimX = sx;
    this.originSimY = sy;
    const hs = this.hunt.huntState();
    this.hunt.simToWorld(hs.hunterPos.x, hs.hunterPos.y, this.w2);
    this.hunterX = this.w2.x;
    this.hunterZ = this.w2.z;
    // Escape bearing: away from the gun, bent DOWN THE WIND (sim wind
    // blows toward angle a: sim x -> world x, sim y -> world z).
    let ax = cx - this.hunterX;
    let az = cz - this.hunterZ;
    const al = Math.hypot(ax, az) || 1;
    ax /= al;
    az /= al;
    const wx = Math.cos(hs.wind);
    const wz = Math.sin(hs.wind);
    let ex = ax + wx * WIND_BIAS;
    let ez = az + wz * WIND_BIAS;
    const el = Math.hypot(ex, ez) || 1;
    this.escX = ex / el;
    this.escZ = ez / el;
    this.rightX = -this.escZ;
    this.rightZ = this.escX;
  }

  /** One wave: up to WAVE_MAX birds burst together on shuffled lanes. */
  private launchWave(simBirds: readonly {
    id: number;
    pos: { x: number; y: number };
    young?: boolean;
    speciesId: string;
  }[]): void {
    this.lastLaunchMs = this.riseMs;
    // Shuffled lanes per wave (Fisher-Yates on the rise stream).
    for (let i = 2; i > 0; i--) {
      const j = Math.floor(this.riseRng() * (i + 1));
      const t = this.laneBuf[i];
      this.laneBuf[i] = this.laneBuf[j];
      this.laneBuf[j] = t;
    }
    let bx = 0;
    let bz = 0;
    let launched = 0;
    for (let k = 0; k < WAVE_MAX && this.qHead < this.qTail; k++) {
      const id = this.queue[this.qHead % this.queue.length];
      this.qHead++;
      let sim: (typeof simBirds)[number] | null = null;
      for (let i = 0; i < simBirds.length; i++) {
        if (simBirds[i].id === id) {
          sim = simBirds[i];
          break;
        }
      }
      if (!sim) continue;
      let slot: Slot | null = null;
      for (let i = 0; i < POOL; i++) {
        if (this.slots[i].status === 'idle' || this.slots[i].status === 'done') {
          slot = this.slots[i];
          break;
        }
      }
      if (!slot) break; // airborne budget is law
      const species = getSpecies(sim.speciesId);
      const lane = this.laneBuf[k];
      // STAGE 3, verbatim: the species fan slice for this lane...
      const v = escapeVelocityFan(species.flight, lane, WAVE_MAX, this.riseRng);
      // ...hot and lazy rolls (wild rises come out hotter)...
      const roll = (this.bias.kind === 'wild' ? 0.95 : 0.85) + this.riseRng() * 0.45;
      v.x *= roll;
      v.y *= roll;
      // ...the per-flush break direction...
      v.x += this.driftPx;
      // ...and the young-bird wings.
      if (sim.young) {
        v.x *= YOUNG_FLIGHT_MULT;
        v.y *= YOUNG_FLIGHT_MULT;
      }
      slot.vel.x = v.x;
      slot.vel.y = v.y;
      slot.simId = id;
      slot.species = species;
      slot.sxPx = SCREEN_CX + (lane - 1) * SLOT_SPREAD_PX;
      slot.exitDir = 0;
      // FlushScene's launch placement, translated onto the fan's right
      // axis at the covey centroid: lane spread + the bird's own field
      // position as a CLAMPED nudge (±55 px × 0.35 gain, sim px — the
      // "not covey GPS" law) + launch jitter, plus a hair of depth along
      // the escape axis so the burst isn't a picket line.
      const projPx =
        (sim.pos.x - this.originSimX) * this.rightX + (sim.pos.y - this.originSimY) * this.rightZ;
      const nudgePx = Math.max(-NUDGE_CLAMP_PX, Math.min(NUDGE_CLAMP_PX, projPx * NUDGE_GAIN));
      const offM =
        ((lane - 1) * SLOT_SPREAD_PX + nudgePx + (this.riseRng() * 2 - 1) * LAUNCH_JITTER_PX) *
        LAUNCH_PX_TO_M;
      const alongM = (this.riseRng() * 2 - 1) * 0.7;
      slot.x = this.originX + this.rightX * offM + this.escX * alongM;
      slot.z = this.originZ + this.rightZ * offM + this.escZ * alongM;
      slot.y = this.terrain.heightAt(slot.x, slot.z) + 0.2;
      slot.vxW = this.escX * FWD_MIN;
      slot.vzW = this.escZ * FWD_MIN;
      slot.vyW = -v.y * FLUSH_PX_TO_M_V;
      slot.airMs = 0;
      slot.wobblePh = launched * 2.1;
      slot.wobbleMult = 0.6 + this.riseRng();
      slot.gliding = false;
      // The sleeper: rises a beat after its wave.
      const sleeper = this.riseRng() < SLEEPER_CHANCE;
      slot.delayMs = sleeper ? SLEEPER_MIN_MS + this.riseRng() * SLEEPER_RAND_MS : 0;
      slot.status = sleeper ? 'waiting' : 'flying';
      slot.root.visible = !sleeper;
      bx += slot.x;
      bz += slot.z;
      launched++;
    }
    if (launched > 0) this.burstDebris(bx / launched, bz / launched);
  }

  private burstDebris(x: number, z: number): void {
    this.debrisOx = x;
    this.debrisOz = z;
    this.debrisOy = this.terrain.heightAt(x, z) + 0.25;
    this.debrisMs = 0;
    for (let i = 0; i < DEBRIS_N; i++) {
      const az = this.riseRng() * Math.PI * 2;
      const up = 0.35 + this.riseRng() * 0.6; // mostly upward — cover blows UP
      const horiz = Math.sqrt(Math.max(0, 1 - up * up));
      this.debrisVel[i * 4] = Math.cos(az) * horiz;
      this.debrisVel[i * 4 + 1] = up;
      this.debrisVel[i * 4 + 2] = Math.sin(az) * horiz;
      this.debrisVel[i * 4 + 3] = 1.6 + this.riseRng() * 3.2;
    }
  }

  /* ------------------------- read-only surface ----------------------- */

  /** Fold a bird out of the sky (the gun phase's hook — falling frame). */
  downBird(simId: number): boolean {
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (s.simId === simId && s.status === 'flying') {
        s.status = 'falling';
        return true;
      }
    }
    return false;
  }

  /** Capture telemetry: airborne birds (world m). Allocates — tooling only. */
  airborne(): { simId: number; x: number; y: number; z: number; airMs: number; status: string }[] {
    const out: { simId: number; x: number; y: number; z: number; airMs: number; status: string }[] = [];
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (s.status === 'flying' || s.status === 'falling' || s.status === 'waiting') {
        out.push({ simId: s.simId, x: s.x, y: s.y, z: s.z, airMs: s.airMs, status: s.status });
      }
    }
    return out;
  }

  /* ------------------------------ render ----------------------------- */

  update(_ctx: Ctx, _dt: number): void {
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      const visible = s.status === 'flying' || s.status === 'falling';
      s.root.visible = visible;
      if (!visible) continue;
      s.root.position.set(s.x, s.y, s.z);
      if (s.status === 'falling') {
        // Folded frame: wings pinned to the body, tumbling — dead weight.
        s.root.rotation.set(s.airMs * 0.001 * TUMBLE_RAD_PER_S, s.root.rotation.y, 0.5);
        s.wingL.rotation.set(0, 0.9, -1.35);
        s.wingR.rotation.set(0, -0.9, 1.35);
        continue;
      }
      // Nose along the world velocity; pitch climbs with the burst and
      // flattens into the glide — steep then flat, the quail signature.
      const hSpeed = Math.hypot(s.vxW, s.vzW);
      const yaw = Math.atan2(s.vxW, s.vzW);
      const pitch = THREE.MathUtils.clamp(Math.atan2(s.vyW, Math.max(hSpeed, 0.3)), -0.5, 1.1);
      s.root.rotation.order = 'YXZ';
      s.root.rotation.set(-pitch * 0.85, yaw, 0);
      if (s.gliding) {
        // Wings locked in the set-wing dihedral — the glide read.
        s.wingL.rotation.set(0, 0, -0.16);
        s.wingR.rotation.set(0, 0, 0.16);
      } else {
        // Wingbeat at the species' flapRate, keyed to airMs — VISIBLE
        // (±70 deg) and deterministic under capture stepping.
        const hz = s.species.flight.flapRate ?? 14;
        const ang = Math.sin((s.airMs / 1000) * hz * Math.PI * 2) * 1.25 - 0.12;
        s.wingL.rotation.set(0, 0, -ang);
        s.wingR.rotation.set(0, 0, ang);
      }
    }

    // Debris: kinematics re-derived from the burst clock — no per-frame
    // state, exact under both live frames and capture stepping.
    if (this.debrisMesh) {
      const active = this.debrisMs >= 0;
      this.debrisMesh.visible = active;
      if (active) {
        const t = this.debrisMs / 1000;
        const fade = 1 - this.debrisMs / DEBRIS_LIFE_MS;
        const attr = this.debrisGeo!.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < DEBRIS_N; i++) {
          const spd = this.debrisVel[i * 4 + 3];
          const px = this.debrisOx + this.debrisVel[i * 4] * spd * t;
          const py = this.debrisOy + this.debrisVel[i * 4 + 1] * spd * t - 4.9 * t * t;
          const pz = this.debrisOz + this.debrisVel[i * 4 + 2] * spd * t;
          // Big enough to read at the 12-15 m the rise frames from.
          const sz = 0.07 * fade;
          const o = i * 12;
          arr[o] = px - sz;
          arr[o + 1] = py - sz;
          arr[o + 2] = pz;
          arr[o + 3] = px + sz;
          arr[o + 4] = py - sz;
          arr[o + 5] = pz;
          arr[o + 6] = px + sz;
          arr[o + 7] = py + sz;
          arr[o + 8] = pz + sz * 0.6;
          arr[o + 9] = px - sz;
          arr[o + 10] = py + sz;
          arr[o + 11] = pz + sz * 0.6;
        }
        attr.needsUpdate = true;
      }
    }
  }

  dispose(ctx: Ctx): void {
    for (const s of this.slots) ctx.scene.remove(s.root);
    this.slots.length = 0;
    if (this.debrisMesh) ctx.scene.remove(this.debrisMesh);
    this.debrisGeo?.dispose();
    this.debrisGeo = undefined;
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    this.mat?.dispose();
    this.mat = undefined;
  }
}
