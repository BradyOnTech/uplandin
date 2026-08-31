import * as THREE from 'three';
import { playShot, unlockAudio } from '../../audio';
import { getGun, type GunConfig } from '../../game/guns';
import type { Ctx, Subsystem } from '../engine';
import { P, TOD, type TimeOfDay } from '../palette';
import type { BirdsSystem } from './birds';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';

/*
 * GUN subsystem — the player finally exists.
 *
 * A low-poly SIDE-BY-SIDE shotgun viewmodel (the upland classic: two
 * muzzles and a broad breech face silhouette wider than any over/under
 * from the shooter's eye), flat-shaded boxes in palette walnut and
 * blued-steel tones, with a gloved forend hand cradling the splinter
 * forend and a trigger hand on the wrist. Firewatch's E3 frames put
 * hands and tools in the lower frame with the world beyond — that is
 * the whole brief.
 *
 * STATES (intent, not sim — the sim stays read-only through hunt3d):
 *  - CARRY: diagonal ready across the lower frame — stock low right,
 *    muzzles up-left. Distance-driven walk bob (the dog's law: motion
 *    keys to meters moved, never seconds) plus a breathing sway.
 *    SWAY NEVER SWING — the 2D gunAim law carried over: every offset is
 *    smoothed and clamped; the gun lags the view by a few hundredths of
 *    a radian and settles, it never pendulums.
 *  - MOUNT: on aim intent (right mouse held; the capture harness stages
 *    it via __gunAudit) the stock rises to the cheek in ~180 ms with a
 *    smoothstep ease and a small decaying sight-picture settle: barrels
 *    centered low, rib under the eye line, muzzle at the point of aim.
 *    While mounted, if the sim dog is POINTING, the barrels settle a
 *    few clamped hundredths of a radian toward the pointed bird (read
 *    through the hunt3d bridge — the gun answers the game's moment).
 *  - RECOIL hook: kick() + recoilOffset() are the surface the fx round
 *    drives later. The motion is live now — an underdamped spring kicks
 *    the gun rearward and the muzzles up, then recovers — no firing FX.
 *
 * LIGHTING: the same directional response family the dog wears (own
 * implementation — never imported): Lambert under the scene sun and
 * hemisphere, warm lift on sun-facing facets, shade facets multiplied
 * toward the hour's grassShadow tint, and a hot sun-colored rim at the
 * golden hours so the barrels catch the sunrise the way every other
 * silhouette in the field does.
 *
 * Both tiers identical (≈500 tris, ONE draw call — lite skips nothing).
 * Zero per-frame allocations; every vector preallocated. dispose()
 * releases the geometry and material.
 */

/** Mount time (s): cheek-weld rise, inside the 150-250 ms law. */
const MOUNT_S = 0.18;
/** Recoil spring: stiffness/damping (underdamped — kick then recover). */
const RECOIL_K = 180;
const RECOIL_C = 16;
/** Kick impulse: rearward m/s and muzzle-up rad/s at strength 1. */
const KICK_Z = 0.85;
const KICK_PITCH = 2.4;
/** Walk bob: meters of ground per bob cycle, and amplitudes. */
const STRIDE_M = 1.7;
/** Sway clamp (rad) — the "never swing" ceiling on view lag. */
const SWAY_MAX = 0.028;
/** Mounted settle toward the pointed bird: clamp (rad) and blend. */
const AIM_MAX = 0.05;

/** Camera-space poses: position + YXZ euler targets per state.
 *  Iteration 2: closer, higher and 1.18x scale — the first render put the
 *  hands below the frame line and the gun read as a twig; Firewatch's
 *  viewmodels are CHUNKY and near. */
// Iteration 4: COMPACT low ready — the full lower-frame diagonal put the
// barrel line straight across the pointing dog in the staged rise frame
// (the round-10 money shot; measured muzzle-tip screen angles against the
// dog's silhouette at both capture FOVs). The muzzle now rides ~8 deg
// left, ~4 deg low: still a diagonal ready in the lower frame, but the
// left third — where the dog lives in every point/rise staging — stays
// clear glass.
const CARRY_POS = new THREE.Vector3(0.125, -0.235, -0.4);
const CARRY_ROT = new THREE.Vector3(0.17, 0.36, 0.07); // pitch, yaw, roll
const MOUNT_POS = new THREE.Vector3(0, -0.132, -0.26);
const MOUNT_ROT = new THREE.Vector3(0.038, 0, 0);
/** Viewmodel scale — FP guns render oversize or they read as twigs. */
const RIG_SCALE = 1.18;

/* ------------------------------ geometry ------------------------------ */

type V3 = readonly [number, number, number];

interface SectZ {
  x: number;
  y: number;
  z: number;
  hw: number;
  hh: number;
}

interface SectY {
  x: number;
  y: number;
  z: number;
  hw: number;
  hd: number;
}

/** Own tiny flat-shaded box lofter (the house style — never imported). */
class GunBuilder {
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

  /** Tapered box along z: s0 = rear section, s1 = front (s1.z < s0.z —
   *  the muzzle points down -z, camera-forward). Per-face colors. */
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
    // s1 sits at smaller z (further from camera): windings flip vs the
    // dog's +z convention so faces still look outward.
    this.quad(B1, A1, D1, C1, c.front ?? c.side); // -z muzzle-ward cap
    this.quad(A0, B0, C0, D0, c.back ?? c.side); // +z camera-ward cap
    this.quad(C1, D1, D0, C0, c.top ?? c.side); // +y
    this.quad(B0, A0, A1, B1, c.bottom ?? c.side); // -y
    this.quad(C0, B0, B1, C1, c.side); // +x
    this.quad(A0, D0, D1, A1, c.side); // -x
  }

  /** Tapered box along -y: s0 = upper section, s1 = lower. */
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

/** Smoothstep ease for the mount timeline. */
function ease(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

export class GunSystem implements Subsystem {
  readonly id = 'gun';

  private hunt!: Hunt3DSystem;
  private birds!: BirdsSystem;
  private terrain!: TerrainSystem;
  private gun!: GunConfig;
  private mat?: THREE.MeshLambertMaterial;
  private geo?: THREE.BufferGeometry;
  private root = new THREE.Group();
  private rig = new THREE.Group();
  private frozen = false;

  /** Aim intent (RMB / staged). The one input the states hang off. */
  private aim = false;
  /** Mount timeline 0..1 (linear; pose uses ease()). */
  private mountT = 0;
  /** Sight-picture settle clock, armed when the mount completes. */
  private settleAge = 10;
  private wasMounted = false;

  // Recoil spring state — THE HOOK the fx round drives via kick().
  private recZ = 0;
  private recVZ = 0;
  private recP = 0;
  private recVP = 0;
  /** Read-only surface for fx/hud: rearward meters + muzzle-up radians. */
  private recOut = { z: 0, pitch: 0 };

  // Walk bob / breath / sway state.
  private stridePhase = 0;
  private speedK = 0;
  private swayYaw = 0;
  private swayPitch = 0;
  private lastCamYaw = 0;
  private hasLastYaw = false;
  private aimYaw = 0;
  private aimPitch = 0;
  private shells = 0;
  private lastShotMs = -Infinity;
  private lastRiseSequence = 0;
  private reticle: HTMLElement | null = null;
  private shotCallout: HTMLElement | null = null;
  private shotCalloutUntil = 0;

  // Preallocated scratch.
  private prevCam = new THREE.Vector3();
  private hasPrev = false;
  private fwd = new THREE.Vector3();
  private birdW = { x: 0, z: 0 };
  private birdV = new THREE.Vector3();

  /** Sun-answer uniforms — the dog-family directional response, own copy. */
  private tone = {
    uGunSunDirW: { value: new THREE.Vector3(0, 1, 0) },
    uGunWarmK: { value: 0 },
    uGunCoolK: { value: 0 },
    uGunCoolTint: { value: new THREE.Color(P.shadowNeutral) },
    uGunRimColor: { value: new THREE.Color(0) },
    uGunRimK: { value: 0 },
    uGunFillK: { value: 0 },
  };
  private creamScratch = new THREE.Color(P.cream);
  private todHandler?: EventListener;

  init(ctx: Ctx): void {
    this.frozen = new URLSearchParams(location.search).has('capture');
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.birds = ctx.get<BirdsSystem>('birds');
    this.terrain = ctx.get<TerrainSystem>('terrain');
    this.gun = getGun(this.hunt.huntState().gunId);
    this.shells = this.gun.shells;
    this.reticle = document.getElementById('reticle');
    this.shotCallout = document.getElementById('shot-callout');

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const tone = this.tone;
    this.mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, tone);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uGunSunDirW;\nuniform float uGunWarmK;\nuniform float uGunCoolK;\n' +
            'uniform vec3 uGunCoolTint;\nuniform vec3 uGunRimColor;\nuniform float uGunRimK;\nuniform float uGunFillK;',
        )
        .replace(
          '#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\n' +
            // World-space normal and view ray (the dog's derivation).
            '\tvec3 qWN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );\n' +
            '\tvec3 qVW = normalize( ( vec4( normalize( vViewPosition ), 0.0 ) * viewMatrix ).xyz );\n' +
            // Committed two-tone split at the terminator: warm hue shift on
            // sun-facing facets (a shift, not a gain — walnut and steel stay
            // dark materials), shade facets multiplied toward the hour's
            // shadow tint so the gun sits in the SAME light as the field.
            '\tfloat qSplit = smoothstep( -0.1, 0.35, dot( qWN, uGunSunDirW ) );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.16, 1.03, 0.86 ), qSplit * uGunWarmK );\n' +
            '\tdiffuseColor.rgb *= mix( vec3( 1.0 ), uGunCoolTint, ( 1.0 - qSplit ) * uGunCoolK );',
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' +
            // Low-sun rim: the hot edge along the barrels when the muzzles
            // swing anywhere near the sunrise — swells under backlight,
            // capped so blued steel never reads chrome.
            '\tfloat qBack = clamp( dot( -qVW, uGunSunDirW ), 0.0, 1.0 );\n' +
            // Iteration 4 measure: at mount the eye sees every top face at
            // grazing incidence, so an ungated fresnel rim painted the
            // whole rib pale — the rim must DEMAND a sun-facing normal
            // (hard gate, low cap) to stay an edge line on dark steel.
            '\tfloat qRim = pow( 1.0 - abs( dot( qWN, qVW ) ), 3.0 ) * clamp( dot( qWN, uGunSunDirW ) * 1.4 - 0.15, 0.0, 1.0 );\n' +
            '\ttotalEmissiveRadiance += uGunRimColor * min( qRim * uGunRimK * ( 0.6 + 1.2 * qBack * qBack ), 0.22 );\n' +
            // Shade fill (the dog's law, at viewmodel dose): dark albedos
            // amplify nothing — a whisper keeps the lee side breathing the
            // hour's shadow tint without washing the bluing off.
            '\ttotalEmissiveRadiance += uGunCoolTint * ( ( 1.0 - qSplit ) * uGunFillK );',
        );
    };
    const applyTod = (tod: TimeOfDay): void => {
      const spec = TOD[tod];
      const silh = spec.grassLumCap < 1;
      const lowSun = THREE.MathUtils.clamp(1 - (spec.sunElevation - 2) / 13, 0, 1);
      const el = THREE.MathUtils.degToRad(spec.sunElevation);
      const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
      this.tone.uGunSunDirW.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      this.tone.uGunWarmK.value = 0.25 + spec.floraWarm * 0.4;
      this.tone.uGunCoolTint.value.setHex(spec.grassShadow).multiplyScalar(0.85);
      this.tone.uGunCoolK.value = silh ? 0.5 : 0.32 + lowSun * 0.28;
      this.tone.uGunRimColor.value.setHex(spec.sunColor);
      this.tone.uGunRimK.value = (silh ? 0.2 : 0.06) + lowSun * 0.5;
      this.tone.uGunFillK.value = silh ? 0.006 : 0.008 + lowSun * 0.012;
      // Fog-family emissive whisper so lastlight steel never voids out.
      this.mat!.emissive.setHex(spec.fogColor).lerp(this.creamScratch, 0.3);
      this.mat!.emissiveIntensity = 0.012;
    };
    applyTod(ctx.timeOfDay);
    this.todHandler = ((e: CustomEvent) => applyTod(e.detail)) as EventListener;
    ctx.events.addEventListener('tod', this.todHandler);

    this.geo = this.buildGun();
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // always at the camera; never let it pop
    this.rig.add(mesh);
    this.rig.scale.setScalar(RIG_SCALE);
    this.root.add(this.rig);
    ctx.scene.add(this.root);

    if (!this.frozen) {
      // AIM INTENT: right mouse held = mount; released = dismount.
      // The 3D rise stays in the field: mount with RMB, put the camera's
      // center pattern on a bird, then fire with LMB.
      window.addEventListener('mousedown', (e) => {
        if (e.button === 2) this.aim = true;
        else if (e.button === 0 && this.mountT > 0.7) this.fire(ctx);
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 2) this.aim = false;
      });
      window.addEventListener('contextmenu', (e) => e.preventDefault());
    } else {
      // CAPTURE HARNESS HANDLE (dog pattern: tooling only, never gameplay):
      // stage states, measure the mount clock and the recoil spring with
      // the SAME integrator update() runs — numbers, not claims.
      (window as unknown as { __gunAudit?: unknown }).__gunAudit = {
        setState: (mode: 'carry' | 'mount') => {
          this.aim = mode === 'mount';
          this.mountT = this.aim ? 1 : 0;
          this.settleAge = 10;
          this.recZ = this.recVZ = this.recP = this.recVP = 0;
        },
        setVisible: (v: boolean) => {
          this.root.visible = v;
        },
        /** Live camera pose (world x/z + yaw/pitch degrees): the staging
         *  hook re-poses off this to slide the dog out from behind the
         *  mounted rib. Capture-only; allocation-free. */
        camPose: () => ({
          x: ctx.camera.position.x,
          z: ctx.camera.position.z,
          yawDeg: THREE.MathUtils.radToDeg(ctx.camera.rotation.y),
          pitchDeg: THREE.MathUtils.radToDeg(ctx.camera.rotation.x),
        }),
        state: () => ({
          aim: this.aim,
          mountT: this.mountT,
          recoil: { z: this.recZ, pitch: this.recP },
        }),
        /** Run the real mount integrator from rest: ms to 99% of the rise. */
        measureMount: () => {
          this.aim = true;
          this.mountT = 0;
          const dt = 1 / 240;
          let steps = 0;
          while (ease(this.mountT) < 0.99 && steps < 2400) {
            this.advance(dt);
            steps++;
          }
          const ms = (steps * 1000) / 240;
          this.mountT = 1;
          this.settleAge = 10;
          return { ms };
        },
        /** Kick the real spring: peak excursion + ms back inside deadband. */
        kickProbe: () => {
          this.recZ = this.recVZ = this.recP = this.recVP = 0;
          this.kick(1);
          const dt = 1 / 240;
          let peakZ = 0;
          let peakP = 0;
          let recoverMs = 0;
          for (let i = 1; i <= 480; i++) {
            this.advance(dt);
            if (this.recZ > peakZ) peakZ = this.recZ;
            if (this.recP > peakP) peakP = this.recP;
            const settled = Math.abs(this.recZ) < 0.002 && Math.abs(this.recP) < 0.006;
            if (!settled) recoverMs = (i * 1000) / 240;
          }
          this.recZ = this.recVZ = this.recP = this.recVP = 0;
          return { peakZ, peakPitchDeg: THREE.MathUtils.radToDeg(peakP), recoverMs };
        },
      };
    }
    this.update(ctx, 1 / 60);
  }

  /* --------------------------- public surface --------------------------- */

  /** RECOIL HOOK — the fx round calls this on the shot. Motion only. */
  kick(strength: number): void {
    this.recVZ += KICK_Z * strength;
    this.recVP += KICK_PITCH * strength;
  }

  /** Live recoil excursion (rearward meters, muzzle-up radians) — the
   *  surface fx/hud consume. Same object every call; do not mutate. */
  recoilOffset(): { z: number; pitch: number } {
    this.recOut.z = this.recZ;
    this.recOut.pitch = this.recP;
    return this.recOut;
  }

  /** Mount progress 0..1 (eased) — hud/fx read the sight picture off it. */
  mountProgress(): number {
    return ease(this.mountT);
  }

  shellsRemaining(): number {
    return this.shells;
  }

  private fire(ctx: Ctx): void {
    if (!this.birds.isRiseActive() || this.shells <= 0) return;
    const nowMs = ctx.time * 1000;
    if (nowMs - this.lastShotMs < this.gun.cooldownMs) return;
    this.lastShotMs = nowMs;
    this.shells--;
    this.kick(1);
    unlockAudio();
    playShot();

    ctx.camera.getWorldDirection(this.fwd);
    const birdId = this.birds.shootRay(
      ctx.camera.position,
      this.fwd,
      this.gun.spread / 400,
    );
    const hit = birdId !== null && this.hunt.resolveBird(birdId, 'downed');
    if (hit && birdId !== null) {
      this.birds.downBird(birdId);
    }
    if (this.shotCallout) {
      this.shotCallout.textContent = hit ? 'HIT!' : 'MISS';
      this.shotCallout.classList.toggle('miss', !hit);
      this.shotCallout.hidden = false;
      this.shotCalloutUntil = ctx.time + (hit ? 0.8 : 0.55);
    }
  }

  /* ------------------------------- build ------------------------------- */

  private buildGun(): THREE.BufferGeometry {
    const b = new GunBuilder();
    // Palette-derived materials: blued steel off charcoal (cold and dark),
    // rib highlight off slate, walnut between warmGray and russetDeep with
    // an oxblood-dark shadow face, olive canvas gloves with a deep cuff.
    // Iteration 2: the mounted eye looks straight down the TOP faces, and
    // the first render's pale slate-lerped top read as one bright plank
    // under the dawn hemisphere — blued steel stays DARK from above; the
    // rib groove goes darker still so the breech reads as two tubes.
    const steel = new THREE.Color(P.charcoal).multiplyScalar(0.5);
    const steelDark = new THREE.Color(P.charcoal).multiplyScalar(0.3);
    const steelTop = new THREE.Color(P.charcoal).lerp(new THREE.Color(P.slate), 0.3).multiplyScalar(0.42);
    // Iteration 3: the dawn key cooked the first walnut to salmon and the
    // olive palm to a pale tan blob — wood pulls toward gray-brown, the
    // gloves drop half a stop so the knuckle step carries the hand read.
    const walnut = new THREE.Color(P.warmGray).lerp(new THREE.Color(P.russetDeep), 0.35).multiplyScalar(0.78);
    const walnutDark = new THREE.Color(P.oxblood).lerp(new THREE.Color(P.russetDeep), 0.3).multiplyScalar(0.8);
    const glove = new THREE.Color(P.oliveMid).multiplyScalar(0.72);
    const gloveDark = new THREE.Color(P.olive).multiplyScalar(0.6);
    const cuff = new THREE.Color(P.oliveDeep).lerp(new THREE.Color(P.olive), 0.35);
    const bead = new THREE.Color(P.glowGold);

    // BARRELS — side by side, breech z -0.10 to muzzle z -0.72 (iteration
    // 2: 0.80 stretched a plank across half the mounted frame). Mid-dark
    // tops with a darker rib groove between: two tubes, not one board.
    for (const s of [-1, 1]) {
      b.boxZ(
        { x: s * 0.0125, y: 0.006, z: -0.1, hw: 0.011, hh: 0.011 },
        { x: s * 0.0115, y: 0.007, z: -0.72, hw: 0.0092, hh: 0.0092 },
        { side: steel, top: steel, bottom: steelDark, front: steelDark },
      );
    }
    // Center rib: the dark groove line between the tubes + muzzle bead.
    b.boxZ(
      { x: 0, y: 0.0165, z: -0.1, hw: 0.0045, hh: 0.0035 },
      { x: 0, y: 0.0175, z: -0.715, hw: 0.0035, hh: 0.0028 },
      { side: steelDark, top: steelDark },
    );
    b.boxZ(
      { x: 0, y: 0.0225, z: -0.708, hw: 0.0018, hh: 0.0018 },
      { x: 0, y: 0.0225, z: -0.7125, hw: 0.0015, hh: 0.0015 },
      { side: bead, top: bead, front: bead },
    );

    // RECEIVER — the boxlock action, slightly proud of the barrels, with
    // a low top strap and lever nub the mounted eye looks straight down.
    b.boxZ(
      { x: 0, y: -0.002, z: 0.03, hw: 0.021, hh: 0.026 },
      { x: 0, y: 0.0, z: -0.105, hw: 0.0235, hh: 0.028 },
      { side: steel, top: steelTop, bottom: steelDark, back: steel },
    );
    b.boxZ(
      { x: 0, y: 0.0295, z: 0.02, hw: 0.0038, hh: 0.0018 },
      { x: 0, y: 0.0295, z: -0.1, hw: 0.0045, hh: 0.0018 },
      { side: steelTop, top: steelTop },
    );

    // TRIGGER GUARD — front post off the action bar, thin bow under the
    // twin triggers, rear post rising into the wrist underside.
    b.boxY(
      { x: 0, y: -0.028, z: 0.016, hw: 0.0045, hd: 0.0055 },
      { x: 0, y: -0.053, z: 0.02, hw: 0.004, hd: 0.005 },
      steelDark,
    );
    b.boxZ(
      { x: 0, y: -0.0545, z: 0.095, hw: 0.005, hh: 0.0028 },
      { x: 0, y: -0.0545, z: 0.016, hw: 0.005, hh: 0.0028 },
      { side: steelDark, bottom: steelDark },
    );
    b.boxY(
      { x: 0, y: -0.036, z: 0.095, hw: 0.004, hd: 0.005 },
      { x: 0, y: -0.052, z: 0.093, hw: 0.004, hd: 0.005 },
      steelDark,
    );

    // FOREND — walnut splinter under the barrels; the forend hand's home.
    b.boxZ(
      { x: 0, y: -0.019, z: -0.095, hw: 0.019, hh: 0.017 },
      { x: 0, y: -0.014, z: -0.34, hw: 0.0155, hh: 0.012 },
      { side: walnut, bottom: walnutDark, front: walnutDark },
    );

    // STOCK — wrist dropping off the action into the comb and butt. The
    // butt sits behind the eye at mount (clipped — exactly where a real
    // cheek weld puts it); at carry it anchors the lower-right frame.
    b.boxZ(
      { x: 0, y: -0.03, z: 0.15, hw: 0.0185, hh: 0.0235 },
      { x: 0, y: -0.006, z: 0.028, hw: 0.016, hh: 0.021 },
      { side: walnut, top: walnut, bottom: walnutDark },
    );
    b.boxZ(
      { x: 0, y: -0.062, z: 0.42, hw: 0.022, hh: 0.05 },
      { x: 0, y: -0.031, z: 0.148, hw: 0.0185, hh: 0.026 },
      { side: walnut, top: walnut, bottom: walnutDark, back: walnutDark },
    );

    // FOREND HAND (left) — the glove that sells the first person: palm
    // cupped under the splinter, curled finger block wrapping the left
    // flank up to the barrels, thumb riding the right barrel, and a deep
    // olive cuff falling back toward the frame edge.
    // (Iteration 2: everything ~30% chunkier — the first render left the
    // whole hand below the frame line and the carry read as a bare stick.
    // Iteration 3: the finger wrap moves to the +x flank — the flank the
    // carry pose actually shows the camera; a hand whose fingers hide
    // behind the gun reads as a blob from the only angle that matters.)
    b.boxZ(
      { x: 0.002, y: -0.047, z: -0.175, hw: 0.03, hh: 0.019 },
      { x: 0.002, y: -0.043, z: -0.272, hw: 0.027, hh: 0.016 },
      { side: glove, bottom: gloveDark },
    );
    // Fingers: two stepped blocks (knuckle ridge) climbing the right side.
    b.boxZ(
      { x: 0.0305, y: -0.016, z: -0.182, hw: 0.0125, hh: 0.03 },
      { x: 0.029, y: -0.014, z: -0.262, hw: 0.011, hh: 0.027 },
      { side: glove, top: glove, bottom: gloveDark },
    );
    b.boxZ(
      { x: 0.021, y: 0.008, z: -0.192, hw: 0.0105, hh: 0.011 },
      { x: 0.0195, y: 0.009, z: -0.252, hw: 0.0095, hh: 0.01 },
      { side: gloveDark, top: glove },
    );
    // Thumb: along the left barrel flank, angled forward.
    b.boxZ(
      { x: -0.025, y: -0.012, z: -0.19, hw: 0.01, hh: 0.014 },
      { x: -0.021, y: 0.0, z: -0.255, hw: 0.008, hh: 0.01 },
      { side: glove, top: glove },
    );
    // Cuff: jacket sleeve swallowing the wrist, falling down-left-back.
    b.boxZ(
      { x: -0.01, y: -0.062, z: -0.08, hw: 0.038, hh: 0.03 },
      { x: -0.005, y: -0.052, z: -0.168, hw: 0.033, hh: 0.022 },
      { side: cuff, bottom: cuff },
    );

    // TRIGGER HAND (right) — wrapped on the wrist of the stock: fingers
    // curl the right flank toward the guard, thumb over the top strap,
    // cuff dropping toward the lower-right corner at carry.
    b.boxZ(
      { x: 0.021, y: -0.032, z: 0.055, hw: 0.011, hh: 0.02 },
      { x: 0.02, y: -0.028, z: 0.125, hw: 0.0105, hh: 0.019 },
      { side: glove, bottom: gloveDark },
    );
    b.boxZ(
      { x: 0.008, y: -0.052, z: 0.06, hw: 0.02, hh: 0.009 },
      { x: 0.007, y: -0.05, z: 0.118, hw: 0.018, hh: 0.008 },
      { side: gloveDark, bottom: gloveDark },
    );
    b.boxZ(
      { x: -0.013, y: 0.0, z: 0.07, hw: 0.009, hh: 0.009 },
      { x: -0.006, y: 0.012, z: 0.03, hw: 0.007, hh: 0.007 },
      { side: glove, top: glove },
    );
    b.boxZ(
      { x: 0.018, y: -0.032, z: 0.2, hw: 0.028, hh: 0.028 },
      { x: 0.019, y: -0.033, z: 0.128, hw: 0.023, hh: 0.023 },
      { side: cuff, back: cuff },
    );

    return b.build();
  }

  /* ------------------------------ motion ------------------------------- */

  /**
   * The one integrator for mount timeline, settle clock and the recoil
   * spring — update() runs it per frame and the capture probes step it
   * directly, so a measured number IS the shipped motion.
   */
  private advance(dt: number): void {
    const before = this.mountT;
    const target = this.aim ? 1 : 0;
    if (this.mountT !== target) {
      const step = dt / MOUNT_S;
      this.mountT = THREE.MathUtils.clamp(this.mountT + (target > before ? step : -step), 0, 1);
    }
    // Arm the sight-picture settle the instant the rise completes.
    if (this.mountT >= 1 && before < 1) {
      this.settleAge = 0;
      this.wasMounted = true;
    }
    if (this.mountT <= 0) this.wasMounted = false;
    this.settleAge += dt;
    // Recoil spring (underdamped): kick() injects velocity, this recovers.
    this.recVZ += (-RECOIL_K * this.recZ - RECOIL_C * this.recVZ) * dt;
    this.recZ += this.recVZ * dt;
    this.recVP += (-RECOIL_K * this.recP - RECOIL_C * this.recVP) * dt;
    this.recP += this.recVP * dt;
  }

  update(ctx: Ctx, dt: number): void {
    const cam = ctx.camera;
    const snap = this.frozen;

    const riseSequence = this.birds.riseSequence();
    if (riseSequence !== this.lastRiseSequence) {
      this.lastRiseSequence = riseSequence;
      this.shells = this.gun.shells;
      this.lastShotMs = -Infinity;
    }
    if (this.reticle) {
      this.reticle.hidden = this.frozen || !this.birds.isRiseActive() || this.mountT < 0.35;
    }
    if (this.shotCallout && !this.shotCallout.hidden && ctx.time >= this.shotCalloutUntil) {
      this.shotCallout.hidden = true;
    }

    this.advance(dt);
    const m = ease(this.mountT);

    // Distance-driven walk bob (never per-second): stride phase advances
    // per meter of camera travel; teleports (capture setPose) are ignored.
    let moved = 0;
    if (this.hasPrev) {
      const dx = cam.position.x - this.prevCam.x;
      const dz = cam.position.z - this.prevCam.z;
      moved = Math.hypot(dx, dz);
      if (moved > 0.5) moved = 0;
    }
    this.prevCam.copy(cam.position);
    this.hasPrev = true;
    if (!snap) {
      this.stridePhase = (this.stridePhase + (moved / STRIDE_M) * Math.PI * 2) % (Math.PI * 2);
      this.speedK = approach(this.speedK, THREE.MathUtils.clamp(dt > 0 ? moved / dt / 2.2 : 0, 0, 1), 5, dt, false);
    } else {
      // Deterministic capture attitude: mid-stride, easy pace.
      this.stridePhase = 0.9;
      this.speedK = 0.4;
    }

    // View-lag sway — SWAY NEVER SWING: smoothed, hard-clamped, no spring.
    this.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const camYaw = Math.atan2(this.fwd.x, this.fwd.z);
    let dYaw = 0;
    if (this.hasLastYaw) dYaw = wrapAngle(camYaw - this.lastCamYaw);
    this.lastCamYaw = camYaw;
    this.hasLastYaw = true;
    const swayTarget = snap ? 0 : THREE.MathUtils.clamp((dt > 0 ? -dYaw / dt : 0) * 0.011, -SWAY_MAX, SWAY_MAX);
    this.swayYaw = approach(this.swayYaw, swayTarget, 7, dt, snap);
    this.swayPitch = approach(this.swayPitch, snap ? 0 : this.fwd.y * -0.015, 6, dt, snap);

    // Mounted settle onto the pointed bird — the hunt3d bridge is the
    // intent surface: the sim (read-only) says the dog is pinned, and the
    // muzzles drift a clamped few hundredths of a radian onto the mark.
    let tAimYaw = 0;
    let tAimPitch = 0;
    if (m > 0.5) {
      let sd = this.hunt.dog();
      for (let slot = 0; slot < this.hunt.dogCount(); slot++) {
        const candidate = this.hunt.dog(slot);
        if (candidate.state === 'pointing' && candidate.pointedBirdId !== null) {
          sd = candidate;
          break;
        }
      }
      if ((sd.state === 'pointing' || sd.state === 'honoring') && sd.pointedBirdId !== null) {
        const birds = this.hunt.huntState().birds;
        for (let i = 0; i < birds.length; i++) {
          if (birds[i].id === sd.pointedBirdId) {
            this.hunt.simToWorld(birds[i].pos.x, birds[i].pos.y, this.birdW);
            this.birdV.set(this.birdW.x, this.terrain.heightAt(this.birdW.x, this.birdW.z) + 0.15, this.birdW.z);
            cam.worldToLocal(this.birdV);
            if (this.birdV.z < -0.5) {
              const horiz = Math.hypot(this.birdV.x, this.birdV.z);
              tAimYaw = THREE.MathUtils.clamp(Math.atan2(-this.birdV.x, -this.birdV.z) * 0.6, -AIM_MAX, AIM_MAX);
              tAimPitch = THREE.MathUtils.clamp(Math.atan2(this.birdV.y, horiz) * 0.6, -AIM_MAX, AIM_MAX);
            }
            break;
          }
        }
      }
    }
    this.aimYaw = approach(this.aimYaw, tAimYaw, 6, dt, snap);
    this.aimPitch = approach(this.aimPitch, tAimPitch, 6, dt, snap);

    // ---- compose the camera-space pose (root rides the camera exactly).
    this.root.position.copy(cam.position);
    this.root.quaternion.copy(cam.quaternion);

    const carryK = 1 - m;
    const bobAmp = this.speedK * (1 - 0.85 * m);
    const time = snap ? 0 : ctx.time;
    const breath = Math.sin(time * 1.8);
    // Sight-picture settle: one quick decaying nod after the rise lands.
    const settle = this.wasMounted ? 0.016 * Math.exp(-9 * this.settleAge) * Math.sin(26 * this.settleAge) : 0;

    this.rig.position.set(
      CARRY_POS.x * carryK + MOUNT_POS.x * m + Math.sin(this.stridePhase) * 0.005 * bobAmp,
      CARRY_POS.y * carryK + MOUNT_POS.y * m +
        Math.sin(this.stridePhase * 2) * 0.007 * bobAmp +
        breath * 0.0025 * (1 - 0.6 * m),
      CARRY_POS.z * carryK + MOUNT_POS.z * m + this.recZ,
    );
    this.rig.rotation.order = 'YXZ';
    this.rig.rotation.set(
      CARRY_ROT.x * carryK + MOUNT_ROT.x * m +
        this.swayPitch + breath * 0.0012 + settle + this.recP + this.aimPitch * m,
      CARRY_ROT.y * carryK + MOUNT_ROT.y * m + this.swayYaw + this.aimYaw * m,
      CARRY_ROT.z * carryK + MOUNT_ROT.z * m + Math.sin(this.stridePhase) * 0.012 * bobAmp,
    );
  }

  dispose(ctx: Ctx): void {
    ctx.scene.remove(this.root);
    if (this.todHandler) ctx.events.removeEventListener('tod', this.todHandler);
    this.todHandler = undefined;
    this.geo?.dispose();
    this.geo = undefined;
    this.mat?.dispose();
    this.mat = undefined;
    if (this.reticle) this.reticle.hidden = true;
    if (this.shotCallout) this.shotCallout.hidden = true;
  }
}
