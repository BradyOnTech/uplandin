import type { WetBottomsSystem } from './wetBottoms';
import * as THREE from 'three';
import { playShot, unlockAudio, playActionClick } from '../../audio';
import { GUNS, getGun, type GunConfig } from '../../game/guns';
import type { Ctx, Subsystem } from '../engine';
import type { BirdsSystem } from './birds';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';
import type { PropertyHabitatSystem } from './propertyHabitat';
import type { LandmarksSystem } from './landmarks';
import { terrainBlocksShot } from '../shotVisibility';
import { TravellingShot } from '../shotPattern';
import { shotSightPicture, mobileShotFov, shotAssistancePreference } from '../inputMode';
import { resolveShotAssistance, type ShotAssistanceProfile, type ShotTriggerSource } from '../shotAssistance';
import { createSportingShotgun, type SportingShotgun } from '../assets/shotgun';
import { shotgunCycleCues, shotgunReloadCues, type ShotgunMechanism } from '../shotgunActionTiming';

/** First-person sporting gun and hands. Every equipped action uses its own
 * articulated viewmodel, with a common bead position and mount.
 *
 * Inputs express mount/trigger/reload intent. Ammunition, cooldown and the
 * travelling shot remain here, with shot targets swept on the bird clock.
 * Cosmetic motion follows the render clock: distance-driven carry, an eased
 * shoulder mount, and a frame-rate-independent damped recoil spring. At a
 * settled sporting mount, the front bead lies on the camera's shot ray.
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
// The production slice stays compact in the lower-right at normal FOV70.
// At a settled mount the bead is geometrically on the camera's shot ray.
const SPORT_CARRY_POS = new THREE.Vector3(.19, -.285, -.50);
const SPORT_CARRY_ROT = new THREE.Vector3(-.08, -.12, -.10);
const SPORT_MOUNT_ROT = new THREE.Vector3(.085, 0, 0);
const SPORT_MOUNT_POS = new THREE.Vector3(0, -(.030 * Math.cos(.085) + .766 * Math.sin(.085)), -.34);

interface ShotRequest {
  readonly source: ShotTriggerSource;
  readonly assistance: Readonly<ShotAssistanceProfile>;
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
  private sporting?: SportingShotgun;
  /** Staged visual inspection only; never changes ammo or reload timing. */
  private visualReloadPreview: number | null = null;
  private root = new THREE.Group();
  private rig = new THREE.Group();
  private frozen = false;

  /** Aim intent (RMB / staged). The one input the states hang off. */
  private aim = false;
  private pendingTrigger: { until: number; request: ShotRequest } | null = null;
  /** Mount timeline 0..1 (linear; pose uses ease()). */
  private mountT = 0;
  private keyboardAim = false;
  private touchHeld = false;
  private touchLowerAt: number | null = null;
  private touchStatus = '';
  private closerSight = false;
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
  private shells = 0;
  private stowedShells = new Map<string, number>();
  private lastShotMs = -Infinity;
  private cycleElapsed = Infinity;
  private reloadElapsed = 0;
  private reloadDuration = 0;
  private keydownHandler?: (event: KeyboardEvent) => void;
  private inputAbort = new AbortController();
  private reticle: HTMLElement | null = null;
  private shotCallout: HTMLElement | null = null;
  private shotCalloutUntil = 0;
  private shots: { pattern: TravellingShot; presentationPhase: number;
    visible: (target: { x: number; y: number; z: number }) => boolean }[] = [];

  // Preallocated scratch.
  private prevCam = new THREE.Vector3();
  private hasPrev = false;
  private fwd = new THREE.Vector3();

  init(ctx: Ctx): void {
    const syncSight = () => {
      this.closerSight = shotSightPicture(!!document.body?.classList.contains('touch-controls-active')) === 'closer';
    };
    syncSight();
    this.frozen = new URLSearchParams(location.search).has('capture');
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.birds = ctx.get<BirdsSystem>('birds');
    this.terrain = ctx.get<TerrainSystem>('terrain');
    this.gun = getGun(this.hunt.huntState().gunId);
    this.shells = this.gun.shells;
    if (this.hunt.falconry) return;
    this.reticle = document.getElementById('reticle');
    this.shotCallout = document.getElementById('shot-callout');

    this.sporting = this.createViewmodel(this.gun);
    this.rig.add(this.sporting.root);
    this.rig.scale.setScalar(1);
    this.root.add(this.rig);
    ctx.scene.add(this.root);

    if (!this.frozen) {
      const signal = this.inputAbort.signal;
      ctx.events.addEventListener('touch-sight-change', syncSight, { signal });
      ctx.events.addEventListener('input-reset', syncSight, { signal });
      window.addEventListener('mousedown', (e) => {
        if (document.body?.classList.contains('touch-controls-active')) return;
        if (ctx.paused || (e.target !== ctx.renderer.domElement && document.pointerLockElement !== ctx.renderer.domElement)) return;
        if (e.button === 2) this.aim = true;
        // In trackpad drag-look mode, a latched keyboard aim leaves the
        // primary button free for looking. Space is the trigger.
        else if (e.button === 0 && this.mountT > 0.7
          && (!this.keyboardAim || document.pointerLockElement === ctx.renderer.domElement)) this.requestFire(ctx, 'mouse');
      }, { signal });
      window.addEventListener('mouseup', (e) => {
        if (document.body?.classList.contains('touch-controls-active')) return;
        if (e.button === 2) this.aim = this.keyboardAim; if (!this.aim) this.pendingTrigger = null;
      }, { signal });
      ctx.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
      this.keydownHandler = (event) => {
        const target = event.target as HTMLElement | null;
        if (ctx.paused || event.repeat || event.ctrlKey || event.metaKey || event.altKey
          || target?.closest?.('button, input, select, textarea, [contenteditable="true"]')) return;
        if (event.code === 'KeyF' || event.key.toLowerCase() === 'f') {
          event.preventDefault();
          if (this.isReloading()) return;
          this.keyboardAim = !this.keyboardAim;
          this.aim = this.keyboardAim;
          if (!this.aim) this.pendingTrigger = null;
        } else if (event.code === 'Space' || event.key === ' ') {
          event.preventDefault();
          this.requestFire(ctx, 'keyboard');
        } else if (event.key.toLowerCase() === 'r') this.beginReload();
      };
      window.addEventListener('keydown', this.keydownHandler, { signal });
      ctx.events.addEventListener('hunt-action', ((event: CustomEvent) => {
        if (ctx.paused) return;
        // The adapter records the initiating pointer, including mouse previews
        // and keyboard activation. A visible touch HUD is not trigger provenance.
        const action = typeof event.detail === 'string' ? event.detail : event.detail?.action;
        const suppliedSource = typeof event.detail === 'object' ? event.detail?.source : undefined;
        const source: ShotTriggerSource = suppliedSource === 'touch' || suppliedSource === 'mouse'
          || suppliedSource === 'keyboard' ? suppliedSource : 'other';
        if (action === 'touch-mount') {
          if (this.isReloading()) return;
          if (this.shells <= 0) { this.beginReload(); return; }
          this.touchHeld = true; this.touchLowerAt = null; this.aim = true;
        } else if (action === 'touch-fire') {
          if (!this.touchHeld) return;
          this.touchHeld = false; this.touchLowerAt = ctx.time + 2.5;
          this.requestFire(ctx, source);
        } else if (action === 'mount') { this.touchLowerAt = null; this.aim = true; }
        else if (action === 'lower') {
          this.touchHeld = false; this.touchLowerAt = null;
          this.aim = this.keyboardAim = false; this.pendingTrigger = null;
        }
        else if (action === 'reload') this.beginReload();
        else if (action === 'fire') this.requestFire(ctx, source);
      }) as EventListener, { signal });
      const lowerGun = () => {
        this.touchHeld = false; this.touchLowerAt = null;
        this.pendingTrigger = null;
        this.keyboardAim = false;
        this.aim = false;
        document.querySelector('[data-action="aim"]')?.setAttribute('aria-pressed', 'false');
      };
      ctx.events.addEventListener('pause', lowerGun, { signal });
      ctx.events.addEventListener('input-reset', lowerGun, { signal });
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
    this.sporting?.fire();
    this.cycleElapsed = 0;
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

  private createViewmodel(gun: GunConfig): SportingShotgun {
    return createSportingShotgun(gun.id === 'remington-870' ? 'pump'
      : gun.id === 'over-under' ? 'over-under'
      : gun.id === 'side-by-side' ? 'side-by-side' : 'semi-auto');
  }

  equippedGunId(): string { return this.gun.id; }

  /** Change equipment on the paused field, retaining the hunt and each gun's shells. */
  equipGun(ctx: Ctx, gunId: string): boolean {
    if (this.hunt.falconry) return false;
    const next = GUNS.find(gun => gun.id === gunId);
    if (!ctx.paused || !this.sporting || !next || this.hunt.huntState().fieldSessionEnded) return false;
    if (next.id === this.gun.id) return true;
    const model = this.createViewmodel(next);
    this.stowedShells.set(this.gun.id, this.shells);
    this.rig.remove(this.sporting.root);
    this.sporting.dispose();
    this.sporting = model; this.rig.add(model.root);
    this.gun = next;
    this.shells = this.stowedShells.get(next.id) ?? next.shells;
    this.hunt.huntState().gunId = next.id;
    this.aim = this.keyboardAim = false;
    this.pendingTrigger = null; this.mountT = 0;
    this.reloadElapsed = this.reloadDuration = 0;
    this.cycleElapsed = Infinity;
    this.visualReloadPreview = null;
    this.recZ = this.recVZ = this.recP = this.recVP = 0;
    this.wasMounted = false; this.settleAge = 10;
    this.shotCalloutUntil = 0;
    if (this.shotCallout) this.shotCallout.hidden = true;
    document.querySelector?.('[data-action="aim"]')?.setAttribute('aria-pressed', 'false');
    this.update(ctx, 0);
    return true;
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

  /** Readiness describes the real action, never whether a bird is available. */
  touchShotStatus(ctx: Ctx): string {
    if (this.isReloading()) return 'Reloading';
    if (this.shells <= 0) return 'Press to reload';
    if (!this.aim) return 'Hold · swing · release';
    if (this.mountT <= .7) return 'Raising gun';
    if (ctx.time * 1000 - this.lastShotMs < this.gun.cooldownMs) return 'Cycling action';
    return this.touchHeld ? 'Release to shoot' : 'Ready for next shot';
  }

  reloadProgress(): number {
    return this.reloadDuration > 0
      ? THREE.MathUtils.clamp(this.reloadElapsed / this.reloadDuration, 0, 1)
      : 0;
  }

  private beginReload(): boolean {
    this.touchHeld = false; this.touchLowerAt = null;
    this.pendingTrigger = null;
    if (this.isReloading() || this.shells >= this.gun.shells) return false;
    this.aim = false;
    this.keyboardAim = false;
    document.querySelector?.('[data-action="aim"]')?.setAttribute('aria-pressed', 'false');
    this.reloadElapsed = 0;
    this.reloadDuration = RELOAD_OPEN_S + (this.gun.shells - this.shells) * RELOAD_PER_SHELL_S;
    if (this.shotCallout) {
      this.shotCallout.textContent = 'RELOADING';
      this.shotCallout.classList.add('miss');
      this.shotCallout.hidden = false;
      this.shotCalloutUntil = Infinity;
    }
    return true;
  }

  private requestFire(ctx: Ctx, source: ShotTriggerSource): void {
    if (ctx.paused || this.isReloading()) return;
    const request: ShotRequest = Object.freeze({ source, assistance: resolveShotAssistance(
      source === 'touch' ? this.hunt.getActiveChallenge() : 'balanced', shotAssistancePreference(), source,
    ) });
    if (this.aim && this.mountT <= .7) {
      // Honor one deliberate trigger during this short mount, regardless of bird activity.
      this.pendingTrigger ??= { until: ctx.time + .25, request };
    }
    const hint = this.mountT <= .7
      ? this.aim ? 'RAISING GUN' : 'F TO AIM · SPACE TO SHOOT'
      : null;
    if (!hint) { this.pendingTrigger = null; this.fire(ctx, request); return; }
    if (this.shotCallout) {
      this.shotCallout.textContent = hint;
      this.shotCallout.classList.remove('miss');
      this.shotCallout.hidden = false;
      this.shotCalloutUntil = ctx.time + 1.5;
    }
  }

  private fire(ctx: Ctx, request: ShotRequest): void {
    if (this.hunt.falconry) return;
    if (ctx.paused || this.isReloading()) return;
    if (this.shells <= 0) {
      this.beginReload();
      return;
    }
    const nowMs = ctx.time * 1000;
    if (nowMs - this.lastShotMs < this.gun.cooldownMs) return;
    this.lastShotMs = nowMs;
    this.shells--;
    if (this.shotCallout?.textContent === 'RAISING GUN') this.shotCallout.hidden = true;
    this.kick(1);
    unlockAudio();
    playShot();

    ctx.camera.getWorldDirection(this.fwd);
    let habitat: PropertyHabitatSystem | undefined;
    try { habitat = ctx.get<PropertyHabitatSystem>('property-habitat'); } catch { /* bespoke properties use their own scenery */ }
    let wetBottoms: WetBottomsSystem | undefined;
    try { wetBottoms = ctx.get<WetBottomsSystem>('woodcock-wet-bottoms'); } catch { /* other properties */ }
    let landmarks: LandmarksSystem | undefined;
    try { landmarks = ctx.get<LandmarksSystem>('landmarks'); } catch { /* properties without solid landmarks */ }
    let flora: Subsystem & { blocksShot?: (origin: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }) => boolean } | undefined;
    try { flora = ctx.get('flora'); } catch { /* properties without dedicated flora */ }
    let quail: typeof flora, chukar: typeof flora;
    try { quail = ctx.get('quail-environment'); } catch { /* other properties */ }
    try { chukar = ctx.get('chukar-environment'); } catch { /* other properties */ }
    const presentationPhase = this.frozen ? 1 : THREE.MathUtils.clamp(ctx.fixedAlpha ?? 1, 0, 1);
    const pattern = new TravellingShot(ctx.camera.position, this.fwd, this.gun.spread / 400,
      this.birds.shotTargets(presentationPhase), request.assistance);
    const origin = pattern.origin;
    this.shots.push({ pattern, presentationPhase,
      visible: target => !terrainBlocksShot(origin, target, (x, z) => this.terrain.heightAt(x, z))
        && !habitat?.blocksShot?.(origin, target)
        && !wetBottoms?.blocksShot?.(origin, target)
        && !landmarks?.blocksShot?.(origin, target)
        && !flora?.blocksShot?.(origin, target)
        && !quail?.blocksShot?.(origin, target)
        && !chukar?.blocksShot?.(origin, target),
    });
  }

  // Birds advance first. Each shot samples successive fixed-tick spans at its
  // original displayed phase, avoiding a one-tick lead penalty from smoother
  // rendering or a timeline that changes with later display frame rates.
  fixedUpdate(ctx: Ctx, dtMs: number): void {
    if (ctx.paused || !this.shots.length) return;
    this.shots = this.shots.filter(shot => {
      const targets = this.birds.shotTargets(shot.presentationPhase);
      const birdId = shot.pattern.advance(dtMs / 1000, targets, shot.visible);
      if (!shot.pattern.done) return true;
      const hit = birdId !== null && this.hunt.resolveBird(birdId, 'downed');
      if (hit && birdId !== null) this.birds.downBird(birdId, shot.pattern.impact ?? undefined);
      if (this.shotCallout) {
        this.shotCallout.textContent = hit ? 'HIT!' : 'MISS';
        this.shotCallout.classList.toggle('miss', !hit);
        this.shotCallout.hidden = false;
        this.shotCalloutUntil = ctx.time + (hit ? .8 : .55);
      }
      return false;
    });
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
    // Exact damped spring step: a slow mobile frame must not reverse the
    // first kick or change recovery strength as Euler integration did.
    const damping = RECOIL_C / 2;
    const frequency = Math.sqrt(RECOIL_K - damping * damping);
    const decay = Math.exp(-damping * dt), c = Math.cos(frequency * dt), s = Math.sin(frequency * dt) / frequency;
    const z = this.recZ, vz = this.recVZ, p = this.recP, vp = this.recVP;
    this.recZ = decay * (z * c + (vz + damping * z) * s);
    this.recVZ = decay * (vz * c - (damping * vz + RECOIL_K * z) * s);
    this.recP = decay * (p * c + (vp + damping * p) * s);
    this.recVP = decay * (vp * c - (damping * vp + RECOIL_K * p) * s);
  }

  update(ctx: Ctx, dt: number): void {
    if (this.hunt.falconry) return;
    const cam = ctx.camera;
    const snap = this.frozen;
    if (this.touchLowerAt !== null && ctx.time >= this.touchLowerAt && !this.touchHeld) {
      this.touchLowerAt = null; this.aim = false; this.pendingTrigger = null;
    }

    // Use the same render intervals as the visible mechanism. The completion
    // frame still emits its final latch before clearing the reload clock.
    const mechanism: ShotgunMechanism = this.gun.id === 'remington-870' ? 'pump' : this.gun.id as ShotgunMechanism;
    const audible = !snap && !ctx.paused && this.visualReloadPreview === null && dt > 0;
    if (this.isReloading()) {
      if (audible) shotgunReloadCues(mechanism, this.reloadElapsed, this.reloadElapsed + dt,
        this.reloadDuration, this.gun.shells - this.shells, playActionClick);
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
    if (this.shotCallout && !this.shotCallout.hidden && ctx.time >= this.shotCalloutUntil) {
      this.shotCallout.hidden = true;
    }

    this.advance(dt);
    const touch = !!document.body?.classList.contains('touch-controls-active');
    document.body?.classList.toggle('touch-gun-raised', touch && this.aim && !ctx.paused);
    document.body?.classList.toggle('touch-gun-held', touch && this.touchHeld && !ctx.paused);
    if (!snap) {
      const fov = mobileShotFov(this.mountProgress(), this.closerSight, cam.aspect);
      if (Math.abs(cam.fov - fov) > .01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    }
    const status = this.touchShotStatus(ctx);
    if (status !== this.touchStatus) {
      this.touchStatus = status;
      const label = document.getElementById('touch-shot-status');
      if (label) label.textContent = status;
    }
    if (this.reticle) this.reticle.hidden = this.frozen || ctx.paused || this.isReloading() || this.mountT < .35;
    if (this.pendingTrigger) {
      const pending = this.pendingTrigger;
      if (ctx.paused || !this.aim || this.isReloading() || ctx.time >= pending.until) this.pendingTrigger = null;
      else if (this.mountT > .7) {
        this.pendingTrigger = null;
        this.fire(ctx, pending.request);
      }
    }
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

    // ---- compose the camera-space pose (root rides the camera exactly).
    this.root.position.copy(cam.position);
    this.root.quaternion.copy(cam.quaternion);

    const breakAction = this.gun.id === 'over-under' || this.gun.id === 'side-by-side';
    const carryK = 1 - m;
    const bobAmp = this.speedK * (1 - m);
    const carryPos = SPORT_CARRY_POS;
    const mountPos = SPORT_MOUNT_POS;
    const carryRot = SPORT_CARRY_ROT;
    const mountRot = SPORT_MOUNT_ROT;
    const carryMotion = carryK;
    const time = snap ? 0 : ctx.time;
    const breath = Math.sin(time * 1.8);
    // Sight-picture settle: one quick decaying nod after the rise lands.
    const settle = this.wasMounted ? 0.016 * Math.exp(-9 * this.settleAge) * Math.sin(26 * this.settleAge) : 0;

    this.rig.position.set(
      carryPos.x * carryK + mountPos.x * m + Math.sin(this.stridePhase) * 0.005 * bobAmp + reloadArc * .045,
      carryPos.y * carryK + mountPos.y * m +
        Math.sin(this.stridePhase * 2) * 0.007 * bobAmp +
        breath * 0.0025 * (1 - 0.6 * m) * carryMotion + reloadArc * (breakAction ? .13 : .075),
      carryPos.z * carryK + mountPos.z * m + this.recZ,
    );
    this.rig.rotation.order = 'YXZ';
    this.rig.rotation.set(
      carryRot.x * carryK + mountRot.x * m +
        this.swayPitch * carryMotion + breath * .0012 * carryMotion + settle + this.recP +
        reloadArc * (breakAction ? -.18 : .08),
      carryRot.y * carryK + mountRot.y * m + this.swayYaw * carryMotion,
      carryRot.z * carryK + mountRot.z * m +
        Math.sin(this.stridePhase) * .012 * bobAmp + reloadArc * (breakAction ? .28 : -1.05),
    );
    if (Number.isFinite(this.cycleElapsed)) {
      if (audible) shotgunCycleCues(mechanism, this.cycleElapsed, this.cycleElapsed + dt, playActionClick);
      this.cycleElapsed += dt;
      if (this.cycleElapsed > .5) this.cycleElapsed = Infinity;
    }
    this.sporting?.update(
      this.visualReloadPreview === null ? this.reloadElapsed : this.visualReloadPreview * (RELOAD_OPEN_S + this.gun.shells * RELOAD_PER_SHELL_S),
      this.visualReloadPreview === null ? this.reloadDuration : RELOAD_OPEN_S + this.gun.shells * RELOAD_PER_SHELL_S,
      this.visualReloadPreview === null ? this.gun.shells - this.shells : this.gun.shells, this.recZ, dt,
    );
  }

  dispose(ctx: Ctx): void {
    this.shots = [];
    this.pendingTrigger = null;
    this.inputAbort.abort();
    ctx.scene.remove(this.root);
    if (this.keydownHandler) window.removeEventListener('keydown', this.keydownHandler);
    this.keydownHandler = undefined;
    this.sporting?.dispose();
    this.sporting = undefined;
    if (this.reticle) this.reticle.hidden = true;
    if (this.shotCallout) this.shotCallout.hidden = true;
  }
}
