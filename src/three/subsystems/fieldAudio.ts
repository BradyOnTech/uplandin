import * as THREE from 'three';
import type { Hunt3DSystem } from './hunt3d';
import { playDogCollar, playDogMovement, playFieldSong, startFieldAmbience, type DogCollarSound } from '../../audio';
import type { Ctx, Subsystem } from '../engine';
import { fieldSoundscape } from '../fieldSoundscape';
import { DogCollarCadence, dogBellInterval, dogCollarGain, dogCollarMode, type DogCollarCue } from '../dogCollarAudio';
import type { TerrainSystem } from './terrain';
interface Collar {
  x: number; z: number; quietFor: number; positioned: boolean;
  cadence: DogCollarCadence; kind: DogCollarCue | null; sound?: DogCollarSound;
  soundKind?: DogCollarCue;
}
export class FieldAudioSystem implements Subsystem {
  readonly id = 'field-audio';
  private ambience: ReturnType<typeof startFieldAmbience> = null;
  private nextSong = 13;
  private abort = new AbortController();
  private capture = false;
  private disposed = false;
  private hidden = false;
  private dogs = new Map<number, { x: number; z: number; distance: number }>();
  private collars = new Map<number, Collar>();
  private terrain!: TerrainSystem;
  private hunt!: Hunt3DSystem;
  private pointRevisions = new Map<number, number>();
  private dogPosition = { x: 0, z: 0 };
  private forward = new THREE.Vector3();
  private collarOffset = new THREE.Vector3();
  private listenerInverse = new THREE.Quaternion();
  constructor(private readonly areaId?: string) {}
  init(ctx: Ctx): void {
    this.terrain = ctx.get<TerrainSystem>('terrain');
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.syncPointRevisions();
    this.capture = new URLSearchParams(location.search).has('capture');
    const signal = this.abort.signal;
    ctx.events.addEventListener('pause', ((e: CustomEvent) => {
      this.dogs.clear();
      this.suspendCollars();
      this.ambience?.setPaused(e.detail || this.hidden);
    }) as EventListener, { signal });
    if (typeof document !== 'undefined') {
      this.hidden = document.hidden;
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.hidden; this.dogs.clear(); this.suspendCollars();
        this.ambience?.setPaused(this.hidden || ctx.paused);
      }, { signal });
    }
    // Release the buffers when leaving, but keep listeners alive for a
    // browser back/forward-cache restore; the next active frame restarts once.
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => {
      this.dogs.clear(); this.suspendCollars(); this.ambience?.stop(); this.ambience = null;
    }, { signal });
    const profile = fieldSoundscape(this.areaId);
    if (profile) this.nextSong = profile.songGain > 0 ? profile.songInterval : Infinity;
  }
  update(ctx: Ctx, dt = 1 / 60): void {
    if (this.capture || this.disposed || this.hidden || ctx.paused || !(dt > 0)) return;
    this.ambience ??= startFieldAmbience(this.areaId);
    const hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.ambience?.setWind?.(hunt.huntState().windStrength);
    ctx.camera.getWorldDirection(this.forward);
    ctx.camera.getWorldQuaternion(this.listenerInverse).invert();
    for (let slot = 0; slot < hunt.dogCount(); slot++) {
      const position = hunt.dogWorld(this.dogPosition, slot);
      this.updateCollar(ctx, hunt, slot, position, dt);
      const previous = this.dogs.get(slot);
      if (!previous) { this.dogs.set(slot, { ...position, distance: 0 }); continue; }
      const moved = Math.hypot(position.x-previous.x, position.z-previous.z);
      previous.x = position.x; previous.z = position.z;
      if (moved > 8) { previous.distance = 0; continue; } // Relocation is not a footfall.
      if (hunt.dog(slot).gait === 'still') { previous.distance = 0; continue; }
      previous.distance += moved;
      if (previous.distance < .8) continue;
      previous.distance %= .8;
      const dx = position.x-ctx.camera.position.x, dz = position.z-ctx.camera.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= 18) continue;
      const cover = hunt.coverPatches().some(p => Math.abs(position.x-p.cx)<p.hx && Math.abs(position.z-p.cz)<p.hz);
      const horizontal = Math.hypot(this.forward.x, this.forward.z);
      const pan = distance > .01 && horizontal > .01
        ? (-this.forward.z*dx+this.forward.x*dz)/(distance*horizontal) : 0;
      playDogMovement(cover, .09*(1-distance/18)**2, pan);
    }
    for (const [slot, collar] of this.collars) if (slot >= hunt.dogCount()) {
      collar.sound?.stop(); this.collars.delete(slot);
    }
    if (ctx.time > this.nextSong) {
      const profile = fieldSoundscape(this.areaId);
      playFieldSong(profile?.songGain ?? 1);
      this.nextSong = ctx.time + (profile?.songInterval ?? 19) + (Math.sin(ctx.time * 0.3) + 1) * 6;
    }
  }
  private updateCollar(ctx: Ctx, hunt: Hunt3DSystem, slot: number, position: { x: number; z: number }, dt: number): void {
    let collar = this.collars.get(slot);
    if (!collar) {
      collar = { ...position, positioned: false, quietFor: Infinity, cadence: new DogCollarCadence(), kind: null };
      this.collars.set(slot, collar);
    }
    const moved = collar.positioned ? Math.hypot(position.x - collar.x, position.z - collar.z) : 0;
    collar.x = position.x; collar.z = position.z; collar.positioned = true;
    // Fixed simulation positions can repeat over several render frames. Keep
    // the physical movement indication across those frames, not across stops.
    collar.quietFor = moved > .005 && moved < 8 ? 0 : collar.quietFor + dt;
    const dog = hunt.dog(slot);
    const gearTier = hunt.trackingGearTier(), revision = hunt.dogPointRevision(slot);
    const pointed = revision > (this.pointRevisions.get(slot) ?? revision);
    this.pointRevisions.set(slot, revision);
    const kind = dogCollarMode(dog.state, dog.gait, gearTier, collar.quietFor < .12);
    // A real, brief point may have already become a rise by this render. Its
    // short locate tone may finish, but an old movement bell stops on point.
    if ((kind !== collar.kind && collar.soundKind !== 'beeper') || moved >= 8) { collar.sound?.stop(); collar.sound = undefined; }
    collar.kind = kind;
    this.collarOffset.set(position.x, this.terrain.heightAt(position.x, position.z) + .65, position.z).sub(ctx.camera.position);
    const distance = this.collarOffset.length();
    this.collarOffset.applyQuaternion(this.listenerInverse);
    if (collar.soundKind && collar.sound?.active) collar.sound.updateSpatial(dogCollarGain(collar.soundKind, distance), this.collarOffset);
    if (moved >= 8) { collar.cadence.suspend(); return; }
    const cue = collar.cadence.advance(dt, kind, gearTier >= 1 && pointed, dogBellInterval(dog.state, dog.gait, dog.scentStage));
    if (cue) {
      collar.sound?.stop();
      collar.sound = playDogCollar(cue, dogCollarGain(cue, distance), this.collarOffset);
      collar.soundKind = cue;
    }
  }
  private suspendCollars(): void {
    this.syncPointRevisions();
    for (const collar of this.collars.values()) {
      collar.sound?.stop(); collar.sound = undefined;
      collar.cadence.suspend(); collar.positioned = false; collar.quietFor = Infinity;
    }
  }
  private syncPointRevisions(): void {
    for (let slot = 0; slot < this.hunt.dogCount(); slot++) this.pointRevisions.set(slot, this.hunt.dogPointRevision(slot));
  }
  dispose(): void {
    this.disposed = true; this.dogs.clear(); this.suspendCollars(); this.collars.clear();
    this.abort.abort(); this.ambience?.stop(); this.ambience = null;
  }
}
