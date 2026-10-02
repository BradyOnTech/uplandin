import { ShallowWater, wadingSpeedMultiplier } from '../../game/shallowWater';
import * as THREE from 'three';
import { unlockAudio, playFootstep } from '../../audio';
import { onRoute, stepSurface } from '../sound/stepSounds';
import { PROPERTY_PX_TO_M, type GroundSample } from '../../game/landscape';
import type { LandscapeModel } from '../../game/landscape';
import type { Ctx, Subsystem } from '../engine';
import type { TerrainSystem } from './terrain';
import type { Hunt3DSystem } from './hunt3d';
import { ObstacleIndex } from '../../game/obstacleIndex';
import { bindMouseLook } from '../mouseLook';
import { touchMovement, touchSensitivity, opticalLookScale } from '../inputMode';

const WALK_SPEED = 2.2;
const SPRINT_MULT = 1.9;
const EYE = 1.62;
const COLLISION_STEP_METERS = 0.09;

/** Keyboard/mouse and touch express the same movement and recall intent. */
/** The flinch: a 40 ms snap, then a quick settle; gone within half a second. */
const FLINCH_SECONDS = .5;
export function flinchEnvelope(age: number): number {
  if (age < 0 || age >= FLINCH_SECONDS) return 0;
  return age < .04 ? age / .04 : Math.exp(-(age - .04) / .1);
}

export class PlayerSystem implements Subsystem {
  readonly id = 'player';
  private keys = new Set<string>();
  private yaw = Math.PI;
  private pitch = -0.16;
  /**
   * A gentle look the game asks for (bending to take a bird from the dog):
   * the view eases toward `pitch` and the eye lowers by `stoop`. Any look
   * input of the player's own releases the pitch at once.
   */
  private assist: { pitch: number | null; stoop: number } = { pitch: null, stoop: 0 };
  private assistOverridden = false;
  private stoop = 0;
  private pos = new THREE.Vector3(0, 0, 40);
  private vel = new THREE.Vector3();
  private bobPhase = 0;
  private reviewLift = 0;
  private stepDistance = 0;
  private captureMode = false;
  private recallPending = false;
  /** Dog commands pressed since the hunt last read them. */
  private commandQueue: Array<'whoa' | 'release' | 'cast' | 'dead'> = [];
  private abort = new AbortController();
  private touchMove: { id: number; x: number; y: number; dx: number; dy: number; running:boolean } | null = null;
  private touchLook: { id: number; x: number; y: number } | null = null;
  private bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  private scenery?: Subsystem & { collisionCircles?: () => readonly { x: number; z: number; radius: number }[] };
  private landmarks?: Subsystem & { collisionCircles?: () => readonly { x: number; z: number; radius: number }[] };
  private hunt?: Hunt3DSystem;
  private obstacleIndex?: ObstacleIndex;
  private readonly water?: ShallowWater;
  private waterDepth = 0;
  private groundSample: GroundSample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
  private propertyPoint = { x: 0, y: 0 };
  private propertyAt(land: LandscapeModel): [number, number] {
    land.worldToProperty(this.pos.x, this.pos.z, this.propertyPoint);
    return [this.propertyPoint.x, this.propertyPoint.y];
  }
  constructor(private readonly landscape?: LandscapeModel) {
    if (landscape) this.water = new ShallowWater(landscape);
  }

  init(ctx: Ctx): void {
    this.captureMode = new URLSearchParams(location.search).has('capture');
    // All authored properties now use their full heightfield. Keep the hunter
    // inside the named parcel on every map, while specialized scenery still
    // contributes its own collision circles below.
    this.bounds = this.landscape ? this.landscape.worldBounds() : undefined;
    const canvas = ctx.renderer.domElement;
    const signal = this.abort.signal;
    let lookSensitivity = touchSensitivity('look'), swingSensitivity = touchSensitivity('swing');
    ctx.events.addEventListener('touch-sensitivity-change', () => {
      lookSensitivity = touchSensitivity('look'); swingSensitivity = touchSensitivity('swing');
    }, { signal });
    const clear = () => {
      const ids = [this.touchMove?.id, this.touchLook?.id];
      this.keys.clear(); this.touchMove = null; this.touchLook = null; this.vel.set(0, 0, 0); this.showStick();
      for (const id of ids) if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    ctx.events.addEventListener('pause', clear, { signal });
    ctx.events.addEventListener('input-reset', clear, { signal });
    window.addEventListener('resize', clear, { signal });
    signal.addEventListener('abort', clear, { once:true });
    ctx.events.addEventListener('hunt-action', ((event: CustomEvent) => {
      if (!ctx.paused && event.detail === 'recall') this.recallPending = true;
      if (!ctx.paused && ['whoa', 'release', 'cast', 'dead'].includes(event.detail)) this.commandQueue.push(event.detail);
    }) as EventListener, { signal });
    window.addEventListener('blur', clear, { signal });
    // A bird erupting at the hunter's feet makes them flinch: a short jerk of
    // the head, gone before the gun comes up. Real time, never slow motion.
    ctx.events.addEventListener('close-flush', ((event: CustomEvent<{ intensity: number }>) => {
      if (this.captureMode || ctx.paused) return;
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const intensity = Math.max(0, Math.min(1, event.detail.intensity));
      this.flinch = { age: 0, pitch: THREE.MathUtils.degToRad(2.6) * intensity, roll: THREE.MathUtils.degToRad(1.1) * intensity * (Math.random() < .5 ? -1 : 1) };
    }) as EventListener, { signal });
    ctx.events.addEventListener('look-assist', ((event: CustomEvent<{ pitch?: number | null; stoop?: number }>) => {
      if (this.captureMode) return;
      this.assist.pitch = typeof event.detail?.pitch === 'number' ? THREE.MathUtils.clamp(event.detail.pitch, -1.2, 1.2) : null;
      this.assist.stoop = Math.max(0, Math.min(.5, event.detail?.stoop ?? 0));
      this.assistOverridden = false;
    }) as EventListener, { signal });
    ctx.events.addEventListener('hunt-touch-look', ((event: CustomEvent<{dx:number;dy:number}>) => {
      if (ctx.paused || this.captureMode) return;
      this.assistOverridden = true;
      const optics = opticalLookScale(ctx.camera.fov);
      this.yaw -= event.detail.dx * .004 * swingSensitivity * optics;
      this.pitch = THREE.MathUtils.clamp(this.pitch - event.detail.dy * .004 * swingSensitivity * optics, -1.4, 1.4);
      // A release may arrive before the next frame; fire along the latest swing.
      this.place(ctx);
    }) as EventListener, { signal });
    if (!this.captureMode) {
      canvas.addEventListener('click', (event) => {
        if (ctx.paused || event.pointerType === 'touch') return;
        unlockAudio();
      }, { signal });
      const look = bindMouseLook(canvas, {
        signal, paused: () => ctx.paused || !!document.body?.classList.contains('touch-controls-active'),
        turn: (dx, dy) => {
          this.assistOverridden = true;
          const optics = opticalLookScale(ctx.camera.fov);
          this.yaw -= dx * .0022 * optics;
          this.pitch = THREE.MathUtils.clamp(this.pitch - dy * .0022 * optics, -1.4, 1.4);
          // Mouse movement and a trigger can arrive in the same frame.
          // Match touch swing: the shot must see the latest camera direction.
          this.place(ctx);
        },
        fallbackChanged: active => {
          let hint = document.getElementById('mouse-look-fallback');
          if (!hint && active) {
            hint = document.createElement('div'); hint.id = 'mouse-look-fallback';
            hint.textContent = document.body.classList.contains('falconry-hunt') ? 'Drag to look · Space slips the hawk' : 'Drag to look · F toggles aim · Space shoots';
            document.getElementById('controls')?.append(hint);
          }
          if (hint) hint.hidden = !active;
        },
      });
      ctx.events.addEventListener('pause', look.release, { signal });
      window.addEventListener('keydown', (event) => {
        if (ctx.paused || (event.target instanceof HTMLElement && /INPUT|SELECT|BUTTON/.test(event.target.tagName))) return;
        this.keys.add(event.code);
        if (event.code === 'KeyQ' && !event.repeat) this.recallPending = true;
        const command = ({ KeyZ: 'whoa', KeyX: 'release', KeyC: 'cast', KeyV: 'dead' } as const)[event.code as 'KeyZ'];
        if (command && !event.repeat && !document.body?.classList.contains('falconry-hunt')) this.commandQueue.push(command);
        if (['KeyW','KeyA','KeyS','KeyD','Space'].includes(event.code)) event.preventDefault();
      }, { signal });
      window.addEventListener('keyup', (event) => this.keys.delete(event.code), { signal });
      canvas.addEventListener('pointerdown', (event) => {
        const touch = event.pointerType === 'touch' || (event.pointerType === 'mouse' && document.body?.classList.contains('touch-controls-active'));
        if (!touch || ctx.paused || event.button > 0) return;
        event.preventDefault();
        unlockAudio();
        if (event.clientX < window.innerWidth * 0.45) {
          if (this.touchMove) return;
          this.touchMove = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, running:false };
        } else {
          if (this.touchLook) return;
          this.touchLook = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }
        canvas.setPointerCapture(event.pointerId);
        this.showStick();
      }, { signal });
      canvas.addEventListener('pointermove', (event) => {
        if (ctx.paused) return;
        if (this.touchMove?.id === event.pointerId) {
          Object.assign(this.touchMove, touchMovement(event.clientX - this.touchMove.x, event.clientY - this.touchMove.y));
          this.showStick();
        } else if (this.touchLook?.id === event.pointerId) {
          this.assistOverridden = true;
          this.yaw -= (event.clientX - this.touchLook.x) * 0.004 * lookSensitivity;
          this.pitch = THREE.MathUtils.clamp(this.pitch - (event.clientY - this.touchLook.y) * 0.004 * lookSensitivity, -1.4, 1.4);
          this.touchLook.x = event.clientX; this.touchLook.y = event.clientY;
        }
      }, { signal });
      const end = (event: PointerEvent) => {
        if (this.touchMove?.id === event.pointerId) this.touchMove = null;
        if (this.touchLook?.id === event.pointerId) this.touchLook = null;
        this.showStick();
      };
      canvas.addEventListener('pointerup', end, { signal });
      canvas.addEventListener('pointercancel', end, { signal });
      canvas.addEventListener('lostpointercapture', end, { signal });
    }
    this.place(ctx);
  }
  private showStick(): void {
    const stick = document.getElementById('move-stick');
    if (!stick) return;
    stick.hidden = !this.touchMove;
    stick.dataset.running = String(this.touchMove?.running ?? false);
    document.body?.classList.toggle('touch-moving', !!this.touchMove);
    if (this.touchMove) {
      stick.style.left = `${this.touchMove.x}px`; stick.style.top = `${this.touchMove.y}px`;
      stick.style.setProperty('--stick-x', `${this.touchMove.dx * 38}px`);
      stick.style.setProperty('--stick-y', `${this.touchMove.dy * 38}px`);
    }
  }
  isRunning(): boolean {
    const keyboardMoving = this.keys.has('KeyW') || this.keys.has('KeyA') || this.keys.has('KeyS') || this.keys.has('KeyD');
    return this.waterDepth < .12 && ((keyboardMoving && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'))) || !!this.touchMove?.running);
  }
  consumeRecall(): boolean { const pending = this.recallPending; this.recallPending = false; return pending; }
  consumeCommands(): Array<'whoa' | 'release' | 'cast' | 'dead'> { return this.commandQueue.splice(0); }
  setHuntHeading(ctx: Ctx, heading: number): void { this.yaw = -heading - Math.PI / 2; this.place(ctx); }
  /** Capture and review poses. `lift` raises the eye above its standing
   * height for map-review overviews; ordinary play always passes zero. */
  setPose(ctx: Ctx, x: number, z: number, yawDeg: number, pitchDeg = 0, lift = 0): void {
    this.waterDepth = this.water?.depthAtWorld(x, z) ?? 0;
    // Capture review may also lower the eye, as a hunter bending to his dog.
    this.reviewLift = Math.max(-.5, lift);
    this.pos.set(x, 0, z); this.yaw = THREE.MathUtils.degToRad(yawDeg); this.pitch = THREE.MathUtils.degToRad(pitchDeg); this.place(ctx);
  }
  /** Optional handler-view tracking; movement and mouse look remain grounded. */
  watchWorld(ctx: Ctx, target: {x:number;y:number;z:number}, dt: number): void {
    const dx=target.x-ctx.camera.position.x,dz=target.z-ctx.camera.position.z;
    const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(target.y-ctx.camera.position.y,Math.hypot(dx,dz));
    const blend=1-Math.exp(-dt*7);
    this.yaw+=Math.atan2(Math.sin(yaw-this.yaw),Math.cos(yaw-this.yaw))*blend;
    this.pitch+=(THREE.MathUtils.clamp(pitch,-1.2,1.2)-this.pitch)*blend;
    this.place(ctx);
  }
  private place(ctx: Ctx): void {
    const ground = ctx.get<TerrainSystem>('terrain').heightAt(this.pos.x, this.pos.z);
    ctx.camera.position.set(this.pos.x, ground + EYE - this.stoop + this.reviewLift + Math.sin(this.bobPhase) * 0.018, this.pos.z);
    const kick = this.flinch ? flinchEnvelope(this.flinch.age) : 0;
    ctx.camera.rotation.set(this.pitch + (this.flinch?.pitch ?? 0) * kick, this.yaw, (this.flinch?.roll ?? 0) * kick, 'YXZ');
  }
  private flinch?: { age: number; pitch: number; roll: number };
  update(ctx: Ctx, dt: number): void {
    if (this.flinch && dt > 0) {
      this.flinch.age += dt;
      if (this.flinch.age > FLINCH_SECONDS) this.flinch = undefined;
    }
    this.waterDepth = this.water?.depthAtWorld(this.pos.x, this.pos.z) ?? 0;
    this.hunt ??= ctx.get<Hunt3DSystem>('hunt3d');
    if (dt > 0 && !ctx.paused) {
      if (this.assist.pitch !== null && !this.assistOverridden) this.pitch += (this.assist.pitch - this.pitch) * (1 - Math.exp(-dt * 5.5));
      this.stoop += (this.assist.stoop - this.stoop) * (1 - Math.exp(-dt * 6.5));
    }
    if (dt > 0 && !this.captureMode && !ctx.paused && this.hunt.falconry?.phase !== 'picking-up') {
      const f = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0) - (this.touchMove?.dy ?? 0);
      const s = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + (this.touchMove?.dx ?? 0);
      // Camera right is +X when yaw=0; movement matches the visible view.
      this.vel.set(-Math.sin(this.yaw) * f + Math.cos(this.yaw) * s, 0, -Math.cos(this.yaw) * f - Math.sin(this.yaw) * s);
      if (this.vel.lengthSq() > 0.0025) {
        this.vel.clampLength(0, 1).multiplyScalar(WALK_SPEED * wadingSpeedMultiplier(this.waterDepth) * (this.isRunning() ? SPRINT_MULT : 1));
        const oldX = this.pos.x, oldZ = this.pos.z;
        if (this.bounds) {
          if (!this.scenery) {
            try {
              const areaId = this.landscape?.area.id;
              if (areaId === 'chukar-ridge') this.scenery = ctx.get('chukar-environment');
              else if (areaId === 'quail-fields') this.scenery = ctx.get('quail-environment');
              else if (areaId === 'woodcock-bottoms') this.scenery = ctx.get('woodcock-wet-bottoms');
              else if (areaId === 'grouse-woods') this.scenery = ctx.get('property-habitat');
              else if (areaId === 'pheasant-coverts') this.scenery = ctx.get('flora');
              else if (areaId === 'sharptail-prairie') this.scenery = ctx.get('sharptail-ranch');
            } catch { /* environment initializes after input */ }
          }
          this.landmarks ??= ctx.get('landmarks');
          this.obstacleIndex ??= new ObstacleIndex([
            ...(this.scenery?.collisionCircles?.() ?? []), ...(this.landmarks.collisionCircles?.() ?? []),
          ].map(circle => ({ x: circle.x, y: circle.z, radius: circle.radius })));
          // A long frame can put both endpoints outside a thin fence. Resolve
          // along the movement path before a step can reach the opposite side.
          const steps = Math.max(1, Math.ceil(this.vel.length() * dt / COLLISION_STEP_METERS));
          for (let step = 0; step < steps; step++) {
            const stepX = this.pos.x, stepZ = this.pos.z;
            this.pos.addScaledVector(this.vel, dt / steps);
            this.pos.x = THREE.MathUtils.clamp(this.pos.x, this.bounds.minX + 1.5, this.bounds.maxX - 1.5);
            this.pos.z = THREE.MathUtils.clamp(this.pos.z, this.bounds.minZ + 1.5, this.bounds.maxZ - 1.5);
            // Adjacent fence circles overlap. A push from one must be checked
            // against its neighbor before the next movement step.
            for (let pass = 0; pass < 4; pass++) {
              let corrected = false;
              for (const circle of this.obstacleIndex.nearby(this.pos.x, this.pos.z, .32)) {
                const dx = this.pos.x - circle.x, dz = this.pos.z - circle.y;
                const distance = Math.hypot(dx, dz), radius = circle.radius + 0.32;
                if (distance < radius - 1e-7) {
                  if (distance < 0.001) { this.pos.x = stepX; this.pos.z = stepZ; }
                  else { this.pos.x = circle.x + dx / distance * radius; this.pos.z = circle.y + dz / distance * radius; }
                  corrected = true;
                }
              }
              if (!corrected) break;
            }
          }
        } else this.pos.addScaledVector(this.vel, dt);
        const moved = Math.hypot(this.pos.x - oldX, this.pos.z - oldZ);
        this.bobPhase += moved * 4.3;
        this.stepDistance += moved;
        if (moved > 0 && this.stepDistance >= 0.86) {
          this.stepDistance %= 0.86;
          this.hunt ??= ctx.get<Hunt3DSystem>('hunt3d');
          const inCover = this.hunt.coverPatches().some((patch) => Math.abs(this.pos.x - patch.cx) < patch.hx && Math.abs(this.pos.z - patch.cz) < patch.hz);
          // The ground underfoot: the land's own rock, plant and wet, cover and water,
          // and the bare dirt of a farm lane (a prairie two-track is grass).
          const land = this.landscape, ground = land?.surfaceAtWorld(this.pos.x, this.pos.z, this.groundSample);
          const lane = !!land && land.area.id !== 'sharptail-prairie'
            && onRoute(land.area.trails, ...this.propertyAt(land), 1 / PROPERTY_PX_TO_M);
          playFootstep(ground ? stepSurface(ground, inCover, this.waterDepth, lane) : inCover ? 'cover' : 'grass', 0.10, this.isRunning());
        }
      }
    }
    this.place(ctx);
  }
  dispose(): void { this.abort.abort(); this.keys.clear(); this.obstacleIndex = undefined; this.showStick(); }
}
