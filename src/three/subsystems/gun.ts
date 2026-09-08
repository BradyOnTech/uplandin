import type { WetBottomsSystem } from './wetBottoms';
import * as THREE from 'three';
import { playShot, unlockAudio, playActionClick } from '../../audio';
import { getGun, type GunConfig } from '../../game/guns';
import type { Ctx, Subsystem } from '../engine';
import { P, fieldTimeOfDay, type TimeOfDay } from '../palette';
import type { BirdsSystem } from './birds';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';
import type { PropertyHabitatSystem } from './propertyHabitat';
import { terrainBlocksShot } from '../shotVisibility';
import { createSportingShotgun, type SportingShotgun } from '../assets/shotgun';

/*
 * GUN subsystem — the player finally exists.
 *
 * The equipped pump/semiautomatic uses the sporting walnut/steel
 * asset with separate gloved hands and visible cosmetic shell loading. The
 * legacy low-poly SIDE-BY-SIDE shotgun viewmodel (the upland classic: two
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
/** Opening the action plus loading each missing shell. */
const RELOAD_OPEN_S = 0.55;
const RELOAD_PER_SHELL_S = 0.38;
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
// The production slice stays compact in the lower-right at normal FOV70.
// At a settled mount the bead is geometrically on the camera's shot ray.
const SPORT_CARRY_POS = new THREE.Vector3(.19, -.285, -.50);
const SPORT_CARRY_ROT = new THREE.Vector3(-.08, -.12, -.10);
const SPORT_MOUNT_ROT = new THREE.Vector3(.045, 0, 0);
const SPORT_MOUNT_POS = new THREE.Vector3(0, -(.030 * Math.cos(.045) + .766 * Math.sin(.045)), -.37);

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
  private sporting?: SportingShotgun;
  /** Staged visual inspection only; never changes ammo or reload timing. */
  private visualReloadPreview: number | null = null;
  private root = new THREE.Group();
  private rig = new THREE.Group();
  private frozen = false;

  /** Aim intent (RMB / staged). The one input the states hang off. */
  private aim = false;
  /** Mount timeline 0..1 (linear; pose uses ease()). */
  private mountT = 0;
  private keyboardAim = false;
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
  private reloadElapsed = 0;
  private reloadDuration = 0;
  private keydownHandler?: (event: KeyboardEvent) => void;
  private inputAbort = new AbortController();
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
      const spec = fieldTimeOfDay(this.hunt.huntState().areaId,tod);
      const silh = spec.grassLumCap < 1;
      const lowSun = THREE.MathUtils.clamp(1 - (spec.sunElevation - 2) / 13, 0, 1);
      const el = THREE.MathUtils.degToRad(spec.sunElevation);
      const az = THREE.MathUtils.degToRad(spec.sunAzimuth);
      this.tone.uGunSunDirW.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      this.tone.uGunWarmK.value = 0.25 + spec.floraWarm * 0.4;
      this.tone.uGunCoolTint.value.setHex(spec.grassShadow).multiplyScalar(0.85);
      // Viewmodel fill (frame-PoC result): real FPS guns are lit independently
      // so dark walnut/steel never voids against a bright field. The old dose
      // (0.008+0.012) left carry/mount reads as one black wedge at dawn.
      this.tone.uGunCoolK.value = silh ? 0.5 : 0.32 + lowSun * 0.28;
      this.tone.uGunRimColor.value.setHex(spec.sunColor);
      this.tone.uGunRimK.value = (silh ? 0.2 : 0.06) + lowSun * 0.5;
      this.tone.uGunFillK.value = silh ? 0.024 : 0.032 + lowSun * 0.048;
      // Fog-family emissive whisper so lastlight steel never voids out.
      this.mat!.emissive.setHex(spec.fogColor).lerp(this.creamScratch, 0.3);
      this.mat!.emissiveIntensity = 0.036;
    };
    applyTod(ctx.timeOfDay);
    this.todHandler = ((e: CustomEvent) => applyTod(e.detail)) as EventListener;
    ctx.events.addEventListener('tod', this.todHandler);

    if (this.gun.id === 'semi-auto' || this.gun.id === 'remington-870') {
      this.sporting = createSportingShotgun(this.gun.id === 'remington-870' ? 'pump' : 'semi-auto');
      this.rig.add(this.sporting.root);
      this.rig.scale.setScalar(1);
    } else {
      this.geo = this.buildGun();
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      this.rig.add(mesh);
      this.rig.scale.setScalar(RIG_SCALE);
    }
    this.root.add(this.rig);
    ctx.scene.add(this.root);

    if (!this.frozen) {
      const signal = this.inputAbort.signal;
      window.addEventListener('mousedown', (e) => {
        if (ctx.paused || (e.target !== ctx.renderer.domElement && document.pointerLockElement !== ctx.renderer.domElement)) return;
        if (e.button === 2) this.aim = true;
        // In trackpad drag-look mode, a latched keyboard aim leaves the
        // primary button free for looking. Space is the trigger.
        else if (e.button === 0 && this.mountT > 0.7
          && (!this.keyboardAim || document.pointerLockElement === ctx.renderer.domElement)) this.fire(ctx);
      }, { signal });
      window.addEventListener('mouseup', (e) => { if (e.button === 2) this.aim = this.keyboardAim; }, { signal });
      ctx.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
      this.keydownHandler = (event) => {
        const target = event.target as HTMLElement | null;
        if (ctx.paused || event.repeat || event.ctrlKey || event.metaKey || event.altKey
          || target?.closest?.('button, input, select, textarea, [contenteditable="true"]')) return;
        if (event.code === 'KeyF' || event.key.toLowerCase() === 'f') {
          event.preventDefault();
          this.keyboardAim = !this.keyboardAim;
          this.aim = this.keyboardAim;
        } else if (event.code === 'Space' || event.key === ' ') {
          event.preventDefault();
          if (this.mountT > .7) this.fire(ctx);
        } else if (event.key.toLowerCase() === 'r') this.beginReload();
      };
      window.addEventListener('keydown', this.keydownHandler, { signal });
      ctx.events.addEventListener('hunt-action', ((event: CustomEvent) => {
        if (ctx.paused) return;
        if (event.detail === 'mount') this.aim = true;
        else if (event.detail === 'lower') this.aim = false;
        else if (event.detail === 'reload') this.beginReload();
        else if (event.detail === 'fire' && this.mountT > 0.7) this.fire(ctx);
      }) as EventListener, { signal });
      const lowerGun = () => {
        this.keyboardAim = false;
        this.aim = false;
        document.querySelector('[data-action="aim"]')?.setAttribute('aria-pressed', 'false');
      };
      ctx.events.addEventListener('pause', lowerGun, { signal });
      window.addEventListener('blur', lowerGun, { signal });
    } else {
      // CAPTURE HARNESS HANDLE (dog pattern: tooling only, never gameplay):
      // stage states, measure the mount clock and the recoil spring with
      // the SAME integrator update() runs — numbers, not claims.
      (window as unknown as { __gunAudit?: unknown }).__gunAudit = {
        setState: (mode: 'carry' | 'mount') => {
          this.aim = mode === 'mount';
          this.visualReloadPreview = null;
          this.mountT = this.aim ? 1 : 0;
          this.settleAge = 10;
          this.recZ = this.recVZ = this.recP = this.recVP = 0;
        },
        setReloadPreview: (progress: number | null) => {
          this.visualReloadPreview = progress === null ? null : THREE.MathUtils.clamp(progress, 0, 1);
          this.aim = false;
          this.mountT = 0;
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
        viewmodel: () => {
          this.root.updateMatrixWorld(true);
          const bead = this.sporting ? this.sporting.bead.clone().applyMatrix4(this.rig.matrixWorld).project(ctx.camera) : null;
          return { model: this.sporting ? this.sporting.root.name : 'legacy-side-by-side', gunId: this.gun.id, capacity: this.gun.shells, fov: ctx.camera.fov, beadNdc: bead ? { x: bead.x, y: bead.y } : null, stagedReloadProgress: this.visualReloadPreview };
        },
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

  shellCapacity(): number {
    return this.gun.shells;
  }

  isReloading(): boolean {
    return this.reloadDuration > 0;
  }

  reloadProgress(): number {
    return this.reloadDuration > 0
      ? THREE.MathUtils.clamp(this.reloadElapsed / this.reloadDuration, 0, 1)
      : 0;
  }

  private beginReload(): boolean {
    if (this.isReloading() || this.shells >= this.gun.shells) return false;
    this.aim = false;
    this.reloadElapsed = 0;
    playActionClick();
    this.reloadDuration = RELOAD_OPEN_S + (this.gun.shells - this.shells) * RELOAD_PER_SHELL_S;
    if (this.shotCallout) {
      this.shotCallout.textContent = 'RELOADING';
      this.shotCallout.classList.add('miss');
      this.shotCallout.hidden = false;
      this.shotCalloutUntil = Infinity;
    }
    return true;
  }

  private fire(ctx: Ctx): void {
    if (ctx.paused || !this.birds.isRiseActive() || this.isReloading()) return;
    if (this.shells <= 0) {
      this.beginReload();
      return;
    }
    const nowMs = ctx.time * 1000;
    if (nowMs - this.lastShotMs < this.gun.cooldownMs) return;
    this.lastShotMs = nowMs;
    this.shells--;
    this.kick(1);
    unlockAudio();
    playShot();

    ctx.camera.getWorldDirection(this.fwd);
    let habitat: PropertyHabitatSystem | undefined;
    try { habitat = ctx.get<PropertyHabitatSystem>('property-habitat'); } catch { /* bespoke properties use their own scenery */ }
    let wetBottoms: WetBottomsSystem | undefined;
    try { wetBottoms = ctx.get<WetBottomsSystem>('woodcock-wet-bottoms'); } catch { /* other properties */ }
    let flora: Subsystem & { blocksShot?: (origin: THREE.Vector3, target: { x: number; y: number; z: number }) => boolean } | undefined;
    try { flora = ctx.get('flora'); } catch { /* properties without dedicated flora */ }
    const birdId = this.birds.shootRay(
      ctx.camera.position,
      this.fwd,
      this.gun.spread / 400,
      target => !terrainBlocksShot(ctx.camera.position, target, (x, z) => this.terrain.heightAt(x, z))
        && !habitat?.blocksShot?.(ctx.camera.position, target)
        && !wetBottoms?.blocksShot?.(ctx.camera.position, target)
        && !flora?.blocksShot?.(ctx.camera.position, target),
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
      this.lastShotMs = -Infinity;
    }
    if (this.isReloading()) {
      this.reloadElapsed += dt;
      if (this.reloadElapsed >= this.reloadDuration) {
        this.shells = this.gun.shells;
        this.reloadElapsed = 0;
        this.reloadDuration = 0;
        this.lastShotMs = -Infinity;
        if (this.shotCallout) {
          this.shotCallout.textContent = 'LOADED';
          this.shotCallout.classList.remove('miss');
          this.shotCallout.hidden = false;
          this.shotCalloutUntil = ctx.time + 0.55;
        }
      }
    }
    if (this.reticle) {
      this.reticle.hidden = this.frozen || !this.birds.isRiseActive() || this.mountT < 0.35;
    }
    if (this.shotCallout && !this.shotCallout.hidden && ctx.time >= this.shotCalloutUntil) {
      this.shotCallout.hidden = true;
    }

    this.advance(dt);
    const m = ease(this.mountT);
    const reloadP = this.visualReloadPreview ?? this.reloadProgress();
    const reloadArc = Math.sin(reloadP * Math.PI);

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
    const bobAmp = this.speedK * (1 - (this.sporting ? 1 : .85) * m);
    const carryPos = this.sporting ? SPORT_CARRY_POS : CARRY_POS;
    const mountPos = this.sporting ? SPORT_MOUNT_POS : MOUNT_POS;
    const carryRot = this.sporting ? SPORT_CARRY_ROT : CARRY_ROT;
    const mountRot = this.sporting ? SPORT_MOUNT_ROT : MOUNT_ROT;
    const carryMotion = this.sporting ? carryK : 1;
    const time = snap ? 0 : ctx.time;
    const breath = Math.sin(time * 1.8);
    // Sight-picture settle: one quick decaying nod after the rise lands.
    const settle = this.wasMounted ? 0.016 * Math.exp(-9 * this.settleAge) * Math.sin(26 * this.settleAge) : 0;

    this.rig.position.set(
      carryPos.x * carryK + mountPos.x * m + Math.sin(this.stridePhase) * 0.005 * bobAmp + (this.sporting ? reloadArc * .045 : 0),
      carryPos.y * carryK + mountPos.y * m +
        Math.sin(this.stridePhase * 2) * 0.007 * bobAmp +
        breath * 0.0025 * (1 - 0.6 * m) * carryMotion + reloadArc * (this.sporting ? .075 : -.075),
      carryPos.z * carryK + mountPos.z * m + this.recZ,
    );
    this.rig.rotation.order = 'YXZ';
    this.rig.rotation.set(
      carryRot.x * carryK + mountRot.x * m +
        this.swayPitch * carryMotion + breath * .0012 * carryMotion + settle + this.recP +
        (this.sporting ? 0 : this.aimPitch * m) + reloadArc * (this.sporting ? .08 : .42),
      carryRot.y * carryK + mountRot.y * m + this.swayYaw * carryMotion + (this.sporting ? 0 : this.aimYaw * m),
      carryRot.z * carryK + mountRot.z * m +
        Math.sin(this.stridePhase) * .012 * bobAmp + reloadArc * (this.sporting ? -1.05 : .16),
    );
    this.sporting?.update(
      this.visualReloadPreview === null ? this.reloadElapsed : this.visualReloadPreview * (RELOAD_OPEN_S + 3 * RELOAD_PER_SHELL_S),
      this.visualReloadPreview === null ? this.reloadDuration : RELOAD_OPEN_S + 3 * RELOAD_PER_SHELL_S,
      this.visualReloadPreview === null ? this.gun.shells - this.shells : 3, this.recZ, dt,
    );
  }

  dispose(ctx: Ctx): void {
    this.inputAbort.abort();
    ctx.scene.remove(this.root);
    if (this.keydownHandler) window.removeEventListener('keydown', this.keydownHandler);
    this.keydownHandler = undefined;
    if (this.todHandler) ctx.events.removeEventListener('tod', this.todHandler);
    this.todHandler = undefined;
    this.sporting?.dispose();
    this.sporting = undefined;
    this.geo?.dispose();
    this.geo = undefined;
    this.mat?.dispose();
    this.mat = undefined;
    if (this.reticle) this.reticle.hidden = true;
    if (this.shotCallout) this.shotCallout.hidden = true;
  }
}
