import * as THREE from 'three';
import type { Hunt3DSystem } from './hunt3d';
import { playBirdCall, playBirdFlock, playDogBreath, playDogCollar, playDogMovement, playHeartbeat, playHullDrop, prepareBirdSounds,
  prepareDogSounds, prepareStepSounds, setFieldTension, startFieldAmbience, type BirdSound, type DogCollarSound, type SoundDirection } from '../../audio';
import { DogBreathing } from '../sound/dogSounds';
import { hullSurface } from '../sound/gunFoley';
import { AMBIENT_BIRD_GAIN, CoveyCalls, CoveyGathering, groundBirdWait, groundSpace, nextGroundBird, QUARRY_CALL_GAIN, QUARRY_VOICES,
  type HeardBird } from '../sound/fieldBirds';
import { getArea } from '../../game/areas';
import { mulberry32 } from '../../game/math';
import type { Ctx, Subsystem } from '../engine';
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
  /** The land's own birds, and the quarry's voices (sound/fieldBirds.ts). */
  private readonly random: () => number;
  private nextBird = Infinity;
  private listenAgain = 0;
  private readonly gathering: CoveyGathering;
  private readonly coveyCalls: CoveyCalls;
  private birdSounds = new Set<BirdSound>();
  private birdPosition = { x: 0, z: 0 };
  private birdOffset = new THREE.Vector3();
  /** Each dog's breathing, heard close by. */
  private breathing = new Map<number, DogBreathing>();
  private breathOffset = new THREE.Vector3();
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
  /** Walking in on a point: 0 far off, 1 with the dog at your feet. */
  private tension = 0;
  constructor(private readonly areaId?: string) {
    let seed = 0x7f4a7c15;
    for (const char of areaId ?? '') seed = Math.imul(seed ^ char.charCodeAt(0), 0x01000193) >>> 0;
    this.random = mulberry32(seed);
    this.gathering = new CoveyGathering(this.random);
    this.coveyCalls = new CoveyCalls(this.random);
  }
  init(ctx: Ctx): void {
    this.terrain = ctx.get<TerrainSystem>('terrain');
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.syncPointRevisions();
    this.capture = new URLSearchParams(location.search).has('capture');
    const signal = this.abort.signal;
    ctx.events.addEventListener('pause', ((e: CustomEvent) => {
      this.dogs.clear();
      this.suspendCollars(); this.silenceBirds();
      this.ambience?.setPaused(e.detail || this.hidden);
    }) as EventListener, { signal });
    if (typeof document !== 'undefined') {
      this.hidden = document.hidden;
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.hidden; this.dogs.clear(); this.suspendCollars(); this.silenceBirds();
        this.ambience?.setPaused(this.hidden || ctx.paused);
      }, { signal });
    }
    // Release the buffers when leaving, but keep listeners alive for a
    // browser back/forward-cache restore; the next active frame restarts once.
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => {
      this.dogs.clear(); this.suspendCollars(); this.silenceBirds(); this.ambience?.stop(); this.ambience = null;
    }, { signal });
    // The first bird calls a little sooner than the rest.
    this.nextBird = ctx.time + groundBirdWait(this.areaId, ctx.timeOfDay, this.random) * .5;
    if (!this.capture) {
      prepareBirdSounds(this.areaId, this.areaId ? getArea(this.areaId).speciesMix.map(share => share.speciesId) : []);
      prepareDogSounds(this.hunt.dogCount());
      prepareStepSounds();
    }
    ctx.events.addEventListener('hull-landed', ((e: CustomEvent<{ x: number; y: number; z: number; speed: number }>) =>
      this.hullLanded(ctx, e.detail)) as EventListener, { signal });
    // A bird going up at the hunter's feet: the pulse jumps.
    ctx.events.addEventListener('close-flush', ((e: CustomEvent<{ intensity: number }>) => {
      if (!this.capture && !this.hidden && !ctx.paused) playHeartbeat(e.detail.intensity);
      this.tension = 0; this.applyTension();
    }) as EventListener, { signal });
  }
  /** A fired hull touching down: a clink on the rimrock, a tick in the grass. */
  private hullLanded(ctx: Ctx, landing: { x: number; y: number; z: number; speed: number }): void {
    if (this.capture || this.hidden || ctx.paused) return;
    const dx = landing.x - ctx.camera.position.x, dz = landing.z - ctx.camera.position.z;
    const flat = Math.hypot(dx, dz), distance = Math.hypot(flat, landing.y - ctx.camera.position.y);
    if (!(distance < 25)) return;
    ctx.camera.getWorldDirection(this.forward);
    const horizontal = Math.hypot(this.forward.x, this.forward.z);
    const pan = flat > .05 && horizontal > .01 ? (-this.forward.z * dx + this.forward.x * dz) / (flat * horizontal) : 0;
    playHullDrop(hullSurface(this.areaId), Math.min(1, landing.speed / 4.5) / (1 + distance / 3), pan * .8);
  }
  private applyTension(): void {
    this.ambience?.setTension?.(this.tension);
    setFieldTension(this.tension);
  }
  /** How close the hunter is to a standing point, 0..1. */
  private pointTension(ctx: Ctx, hunt: Hunt3DSystem): number {
    let tension = 0;
    for (let slot = 0; slot < hunt.dogCount(); slot++) {
      if (hunt.dog(slot).state !== 'pointing') continue;
      const dog = hunt.dogWorld(this.dogPosition, slot);
      const distance = Math.hypot(dog.x - ctx.camera.position.x, dog.z - ctx.camera.position.z);
      const t = Math.min(1, Math.max(0, (45 - distance) / 35));
      tension = Math.max(tension, t * t * (3 - 2 * t));
    }
    return tension;
  }
  update(ctx: Ctx, dt = 1 / 60): void {
    if (this.capture || this.disposed || this.hidden || ctx.paused || !(dt > 0)) return;
    this.ambience ??= startFieldAmbience(this.areaId);
    const hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.ambience?.setWind?.(hunt.huntState().windStrength);
    this.ambience?.setHour?.(ctx.timeOfDay);
    const target = this.pointTension(ctx, hunt);
    this.tension += (target - this.tension) * Math.min(1, dt * (target > this.tension ? 1.5 : 4));
    this.applyTension();
    ctx.camera.getWorldDirection(this.forward);
    ctx.camera.getWorldQuaternion(this.listenerInverse).invert();
    for (let slot = 0; slot < hunt.dogCount(); slot++) {
      const position = hunt.dogWorld(this.dogPosition, slot);
      this.updateCollar(ctx, hunt, slot, position, dt);
      this.updateBreath(ctx, hunt, slot, position, dt);
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
    // The land's birds hush while the hunter walks in on a point.
    if (ctx.time > this.nextBird) {
      if (this.tension < .2) this.groundBird(ctx);
      this.nextBird = ctx.time + groundBirdWait(this.areaId, ctx.timeOfDay, this.random);
    }
    if (ctx.time >= this.listenAgain) { this.listenAgain = ctx.time + 1; this.quarryCall(ctx, hunt); }
  }

  /** Listener-relative direction to a bearing (clockwise from -Z) and elevation. */
  private bearingDirection(bearing: number, elevation: number): SoundDirection {
    const flat = Math.cos(elevation);
    this.birdOffset.set(Math.sin(bearing) * flat, Math.sin(elevation), -Math.cos(bearing) * flat).applyQuaternion(this.listenerInverse);
    return { x: this.birdOffset.x, y: this.birdOffset.y, z: this.birdOffset.z };
  }
  private keep(sound: BirdSound | undefined): void {
    for (const old of this.birdSounds) if (!old.active) this.birdSounds.delete(old);
    if (sound) this.birdSounds.add(sound);
  }
  /** One of the land's own birds: from the cover around, or crossing the sky. */
  private groundBird(ctx: Ctx): void {
    const pick = nextGroundBird(this.areaId, ctx.timeOfDay, this.random);
    if (!pick) return;
    const { bird } = pick, height = bird.overhead ? .45 + this.random() * .45 : .03;
    const turn = (this.random() < .5 ? -1 : 1) * (.7 + this.random() * .6);
    const placement = { distance: pick.distance, direction: this.bearingDirection(pick.bearing, height),
      to: bird.overhead ? this.bearingDirection(pick.bearing + turn, height * .8) : undefined,
      space: groundSpace(this.areaId), gain: bird.gain * AMBIENT_BIRD_GAIN };
    this.keep('flock' in bird ? playBirdFlock(bird.flock, placement, pick.seed) : playBirdCall(bird.call, placement));
  }
  /** The quarry, heard only from real birds: a scattered covey gathering, an unfound covey calling. */
  private quarryCall(ctx: Ctx, hunt: Hunt3DSystem): void {
    const singles: HeardBird[] = [], coveys = new Map<number, HeardBird>(), camera = ctx.camera.position;
    for (const bird of hunt.huntState().birds) {
      if (bird.state !== 'hidden' || !QUARRY_VOICES[bird.speciesId]) continue;
      hunt.simToWorld(bird.pos.x, bird.pos.y, this.birdPosition);
      const heard = { id: bird.id, coveyId: bird.coveyId, speciesId: bird.speciesId, x: this.birdPosition.x, z: this.birdPosition.z,
        distance: Math.hypot(this.birdPosition.x - camera.x, this.birdPosition.z - camera.z) };
      if (bird.single || bird.heldSingle) singles.push(heard);
      else if (!coveys.has(bird.coveyId)) coveys.set(bird.coveyId, heard);
    }
    const call = this.gathering.update(ctx.time, singles) ?? this.coveyCalls.update(ctx.time, ctx.timeOfDay, [...coveys.values()]);
    if (!call || this.tension >= .2) return;
    this.birdOffset.set(call.x, this.terrain.heightAt(call.x, call.z) + .2, call.z).sub(camera).applyQuaternion(this.listenerInverse);
    this.keep(playBirdCall(call.call, { distance: call.distance, direction: { x: this.birdOffset.x, y: this.birdOffset.y, z: this.birdOffset.z },
      space: groundSpace(this.areaId), gain: QUARRY_CALL_GAIN }));
  }
  /** Panting that quickens with work, a nose on scent, a held breath on point. */
  private updateBreath(ctx: Ctx, hunt: Hunt3DSystem, slot: number, position: { x: number; z: number }, dt: number): void {
    let breath = this.breathing.get(slot);
    if (!breath) { breath = new DogBreathing(); this.breathing.set(slot, breath); }
    this.breathOffset.set(position.x, this.terrain.heightAt(position.x, position.z) + .5, position.z).sub(ctx.camera.position);
    const heard = breath.advance(dt, hunt.dog(slot), this.breathOffset.length());
    if (!heard) return;
    this.breathOffset.applyQuaternion(this.listenerInverse);
    playDogBreath(heard.cue, heard.level, { x: this.breathOffset.x, y: this.breathOffset.y, z: this.breathOffset.z });
  }
  private silenceBirds(): void {
    for (const sound of this.birdSounds) sound.stop();
    this.birdSounds.clear();
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
      collar.sound = playDogCollar(cue, dogCollarGain(cue, distance), this.collarOffset, slot);
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
    this.disposed = true; this.dogs.clear(); this.suspendCollars(); this.silenceBirds(); this.collars.clear();
    this.abort.abort(); this.ambience?.stop(); this.ambience = null;
    setFieldTension(0);
  }
}
