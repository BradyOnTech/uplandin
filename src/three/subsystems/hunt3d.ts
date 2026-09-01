import { getDropPoint, type AreaConfig, type DropPoint } from '../../game/areas';
import { playWhistle } from '../../audio';
import { circleBack } from '../../game/birds';
import { BREEDS, getBreed, type BreedMotion } from '../../game/breeds';
import { loadCareer, saveCareer } from '../../game/career';
import { Dog, type DogGait, type DogState } from '../../game/dog';
import { conditionMults } from '../../game/conditions';
import { createThreeHuntSetup } from '../../game/gameplayMode';
import { settleCareerHunt, type CareerHuntResult } from '../../game/huntResults';
import {
  HuntSimulation,
  HUNT_SHOT_RANGE,
  type HuntDogMotion,
  type RiseResolution,
  type HuntSimulationEvent,
} from '../../game/huntSimulation';
import { dist, mulberry32 } from '../../game/math';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../../game/landscape';
import type { HuntState } from '../../game/state';
import type { Vec2 } from '../../game/types';
import { endHuntEarly } from '../../game/state';
import { windMults } from '../../game/wind';
import type { Ctx, Subsystem } from '../engine';
import { huntPaceMultiplier } from '../dogs/huntMotion';
import type { BirdsSystem } from './birds';
import type { PlayerSystem } from './player';

/*
 * HUNT3D subsystem: the bridge that makes this world THE GAME's world.
 *
 * It owns exactly three things:
 *  1. The authoritative sim instance — createHunt on the quail-fields area
 *     with a fixed seed, consumed read-only through the same call surfaces
 *     the 2D FieldScene used (createHunt, dog.update, updateBirds).
 *  2. The sim-px <-> world-meters mapping. 1 sim px = 1 yard = 0.9144 m,
 *     the selected drop pinned to the local render anchor, sim +x -> world
 *     +x, sim +y (screen down) -> world +z. The LandscapeModel keeps those
 *     local coordinates registered to one stable named property.
 *  3. Advancing the sim at the fixed 30 Hz step: player camera position
 *     maps to sim hunterPos, then updateBirds + dog.update run exactly as
 *     FieldScene ran them. The sim dog's position/state/gait are the source
 *     of truth the dog subsystem renders next phase.
 *
 * It renders NOTHING (zero draw calls, zero scene objects). Other
 * subsystems reach it via ctx.get('hunt3d'); grass reads coverPatches()
 * so the field's visible cover is where the birds actually hide.
 *
 * Capture determinism: with ?capture=1 the sim does NOT free-run on the
 * engine loop — the harness advances it explicitly via step() (exposed as
 * __api3d.stepSim), so a captured dog pose is a pure function of the seed.
 */

/** Fixed hunt seed: one covert, same birds, every boot (this phase). */
const HUNT_SEED = 0x51ba11;
/** Independent stream for the dog's own dice (creep/honor/work rolls). */
const DOG_SEED = 0xd0663d;

/** Standalone review fallback; launched hunts use the shared selected dog. */
const DEFAULT_DOG_BREED = 'english-setter';

/** Live onboarding: begin close enough to read the dog, clear of the gun. */
const LIVE_DOG_AHEAD_M = 5;
const LIVE_DOG_LEFT_M = 2;
const LIVE_DOG_RELEASE_MOVE_PX = 1;
/** 2D's 75 px/s reads as 69 m/s under the 3D yard mapping. */
const LIVE_DOG_MOVEMENT_SCALE = 0.05;
/**
 * The 2D sim speed was authored in screen pixels, so one universal 3D
 * scale made the cast "trot" faster than the cover "run" and turned the
 * scent track into a 5 m/s crouch. These are presentation pace scales;
 * behavior timing and the authoritative state machine remain unchanged.
 */
const LIVE_DOG_TROT_SCALE = 0.025;
const LIVE_DOG_TRACK_SCALE = 0.014;
// The shared scent approach already applies a controlled stalk pace. Boost
// only that approach before its own pace factor; ordinary low tracking keeps
// the original scale and the gait-scale ordering remains meaningful.
const LIVE_DOG_STALK_SCALE = 0.05;

export function liveMovementScaleForGait(gait: DogGait): number {
  if (gait === 'run') return LIVE_DOG_MOVEMENT_SCALE;
  if (gait === 'track') return LIVE_DOG_TRACK_SCALE;
  // A still pose can transition into a trot on this tick; a nonzero value
  // avoids adding an artificial one-tick pause to that transition.
  return LIVE_DOG_TROT_SCALE;
}

export function liveMovementScaleForDog(
  gait: DogGait,
  state: DogState,
  motion: BreedMotion,
  pacePhase: number,
): number {
  const activelySearching = state === 'quartering' && (gait === 'run' || gait === 'trot');
  const base = state === 'tracking' && gait === 'track'
    ? LIVE_DOG_STALK_SCALE
    : liveMovementScaleForGait(gait);
  return base * huntPaceMultiplier(motion, pacePhase, activelySearching);
}

export function liveDogBreedId(search: string): string {
  const requested = new URLSearchParams(search).get('breed');
  return requested && BREEDS.some((breed) => breed.id === requested) ? requested : DEFAULT_DOG_BREED;
}
/** Quarter around a point ahead of the player, not a huge circle behind them. */
const LIVE_DOG_ANCHOR_AHEAD_M = 6;
const LIVE_DOG_RANGE_M = 3.5;
const LIVE_DOG_INTRO_ANGLE = -1.15;

/** Sim tick budget (ms). The sim is tiny; blowing this means a bug. */
const SIM_MS_BUDGET = 2;

/** FieldScene's walk-in trigger: hunter this close to a pointed bird
 *  flushes the covey (checkFlush's own gate — sim px). */
const FLUSH_RADIUS_PX = 22;
/** FieldScene's HUNTER_SPEED (sim px/s): triggerFlush walks in honestly. */
const HUNTER_SPEED_PX = 55;
/** Guard on the walk-in (30 Hz ticks): far past any legal point range. */
const WALK_IN_MAX_TICKS = 2400;
/** Independent stream for the flush dice the 2D flow rolled on
 *  Math.random (Dog.onFlush steadiness) — capture must not re-roll. */
const FLUSH_SEED = 0xf1a5e5;

/** An axis-aligned cover patch in world meters (center + half extents). */
export interface WorldPatch {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
}

export class Hunt3DSystem implements Subsystem {
  readonly id = 'hunt3d';

  private area!: AreaConfig;
  private hunt!: HuntState;
  private simDogs: Dog[] = [];
  private patchesW: WorldPatch[] = [];
  private coordWorld = { x: 0, z: 0 };
  /** capture mode: sim advances only through step(). */
  private frozen = false;
  /** The authored 2D spawn is ~250 m from the 3D camera start; sync once. */
  private liveSpawnSynced = false;
  private liveIntroHolding = false;
  private liveIntroHunter: Vec2 = { x: 0, y: 0 };
  private liveDogAnchor: Vec2 = { x: 0, y: 0 };
  private simulation!: HuntSimulation;
  /** Adapter-only pace/range mapping passed through the shared sim seam. */
  private liveDogMotions: HuntDogMotion[] = [];
  private simMsLast = 0;
  private simMsMax = 0;
  private simMsTotal = 0;
  private simTicks = 0;
  private budgetWarned = false;
  /** Flush dice (Dog.onFlush steadiness roll) — own deterministic stream. */
  private flushRng: () => number = mulberry32(FLUSH_SEED);
  /** The most recent covey rise: ids + the walk-in distance that earned it. */
  private lastFlush: { ids: number[]; distPx: number } | null = null;
  /** Adjacent authoritative snapshots for smooth render interpolation. */
  private dogSnapshots: Array<{
    prevX: number;
    prevY: number;
    currX: number;
    currY: number;
    ready: boolean;
  }> = [];
  /** Slow deterministic acceleration/deceleration while actively searching. */
  private pacePhases: number[] = [];
  /** Career settlement is idempotent even if the HUD renders many frames. */
  private careerDogIds: Array<string | null> = [];
  private careerResult: CareerHuntResult | null = null;
  private careerSettled = false;
  private gearTier = 0;

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    this.frozen = new URLSearchParams(location.search).has('capture');

    const setup = createThreeHuntSetup(location.search, mulberry32(HUNT_SEED));
    this.gearTier = setup.gearTier;
    this.careerDogIds = setup.launch?.kind === 'career'
      ? [setup.kennelDog?.id ?? null, setup.brace?.kennelDog?.id ?? null]
      : [];
    this.area = setup.area;
    this.hunt = setup.hunt;
    const drop = getDropPoint(this.area, this.hunt.dropPointId);
    if (this.landscape.area.id !== this.area.id || this.landscape.dropPoint.id !== drop.id) {
      throw new Error(
        `hunt3d landscape mismatch: expected ${this.area.id}/${drop.id}, got `
        + `${this.landscape.area.id}/${this.landscape.dropPoint.id}`,
      );
    }
    ctx.get<PlayerSystem>('player').setHuntHeading(ctx, drop.heading);
    const dogProfiles = [
      { breed: setup.breed, level: setup.level, ageMultiplier: setup.ageMultiplier },
      ...(setup.brace
        ? [{
            breed: getBreed(setup.brace.breedId),
            level: setup.brace.level,
            ageMultiplier: setup.brace.ageMultiplier,
          }]
        : []),
    ];
    this.simDogs = dogProfiles.map((profile, slot) =>
      new Dog(
        { ...this.hunt.dogsPos[slot] },
        { breed: profile.breed, level: profile.level, ageMult: profile.ageMultiplier },
        mulberry32((DOG_SEED + slot * 0x9e3779b9) >>> 0),
        this.area.world,
      ),
    );
    this.dogSnapshots = this.simDogs.map((dog) => ({
      prevX: dog.pos.x,
      prevY: dog.pos.y,
      currX: dog.pos.x,
      currY: dog.pos.y,
      ready: false,
    }));
    this.pacePhases = this.simDogs.map(() => 0);
    this.liveDogMotions = this.simDogs.map((dog) => ({
      movementScale: this.frozen ? 1 : liveMovementScaleForGait(dog.gait),
      rangeRadius: this.frozen ? undefined : LIVE_DOG_RANGE_M / PROPERTY_PX_TO_M,
      workAnchor: this.frozen ? undefined : this.liveDogAnchor,
    }));
    this.simulation = new HuntSimulation({
      hunt: this.hunt,
      dogs: this.simDogs,
      area: this.area,
      rng: this.flushRng,
    });

    // Cover patches in world meters, once.
    for (const p of this.area.patches) {
      this.landscape.propertyToWorld(p.x + p.w / 2, p.y + p.h / 2, this.coordWorld);
      this.patchesW.push({
        cx: this.coordWorld.x,
        cz: this.coordWorld.z,
        hx: (p.w / 2) * PROPERTY_PX_TO_M,
        hz: (p.h / 2) * PROPERTY_PX_TO_M,
      });
    }
  }

  fixedUpdate(ctx: Ctx, dtMs: number): void {
    if (this.frozen) return;
    // The 2D scene cut held field time while the rise played. In open-world
    // 3D we keep the camera free but hold the dog/scent simulation so the
    // point does not dissolve into a new search under airborne birds.
    if (
      this.lastFlush &&
      ctx.get<BirdsSystem>('birds').isRiseActive()
    ) {
      this.worldToSim(ctx.camera.position.x, ctx.camera.position.z, this.hunt.hunterPos);
      return;
    }
    this.tick(ctx, dtMs);
  }

  /** Capture harness: advance the frozen sim by exact 30 Hz ticks. */
  step(ctx: Ctx, ticks: number): void {
    for (let i = 0; i < ticks; i++) this.tick(ctx, 1000 / 30);
  }

  private tick(ctx: Ctx, dtMs: number): void {
    const t0 = performance.now();
    // The player IS the hunter: camera world position -> sim hunterPos.
    this.worldToSim(ctx.camera.position.x, ctx.camera.position.z, this.hunt.hunterPos);
    const yaw = ctx.camera.rotation.y;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    if (!this.frozen) {
      this.liveDogAnchor.x =
        this.hunt.hunterPos.x + (forwardX * LIVE_DOG_ANCHOR_AHEAD_M) / PROPERTY_PX_TO_M;
      this.liveDogAnchor.y =
        this.hunt.hunterPos.y + (forwardZ * LIVE_DOG_ANCHOR_AHEAD_M) / PROPERTY_PX_TO_M;
    }

    // The 2D area's hunter/dog spawn lives near its bottom edge, while the
    // 3D player deliberately starts near the field center. Without this
    // one-time bridge the dog begins ~250 m away: technically in the
    // camera frustum, but sub-pixel and buried in grass. Place it five
    // meters ahead and two meters screen-left on the first LIVE tick.
    // Capture mode keeps the authored spawn so every existing deterministic
    // review/capture sequence remains byte-for-byte stable.
    let snappedSpawn = false;
    if (!this.frozen && !this.liveSpawnSynced) {
      const leftX = -Math.cos(yaw);
      const leftZ = Math.sin(yaw);
      for (let slot = 0; slot < this.simDogs.length; slot++) {
        const dog = this.simDogs[slot];
        const side = slot === 0 ? 1 : -1;
        dog.pos.x = this.hunt.hunterPos.x +
          (forwardX * LIVE_DOG_AHEAD_M + leftX * LIVE_DOG_LEFT_M * side) / PROPERTY_PX_TO_M;
        dog.pos.y = this.hunt.hunterPos.y +
          (forwardZ * LIVE_DOG_AHEAD_M + leftZ * LIVE_DOG_LEFT_M * side) / PROPERTY_PX_TO_M;
        dog.state = 'heel';
        dog.gait = 'still';
        // Stand three-quarter at heel so the marked head/ear is readable,
        // rather than presenting a featureless white rump to the player.
        dog.heading = Math.atan2(forwardZ, forwardX) + LIVE_DOG_INTRO_ANGLE * side;
      }
      this.liveIntroHolding = true;
      this.liveIntroHunter.x = this.hunt.hunterPos.x;
      this.liveIntroHunter.y = this.hunt.hunterPos.y;
      this.liveSpawnSynced = true;
      snappedSpawn = true;
    }
    if (this.liveIntroHolding) {
      const playerStartedWalking =
        dist(this.hunt.hunterPos, this.liveIntroHunter) >= LIVE_DOG_RELEASE_MOVE_PX;
      if (playerStartedWalking) {
        for (const dog of this.simDogs) dog.castOff();
        this.liveIntroHolding = false;
      }
    }

    // Preserve the previous authoritative snapshot before the sim writes
    // the next one. The first live placement snaps both ends so the dog
    // cannot interpolate in from its distant authored 2D spawn.
    if (!snappedSpawn) {
      for (const snapshot of this.dogSnapshots) {
        if (!snapshot.ready) continue;
        snapshot.prevX = snapshot.currX;
        snapshot.prevY = snapshot.currY;
      }
    }

    // Exactly the FieldScene consumption order: birds move, then the dog.
    // The breed's gameplay speed is already inside Dog; this low-frequency
    // multiplier supplies acceleration/deceleration within a cast rather
    // than making a hunting dog run at one mechanical velocity forever.
    if (!this.frozen) {
      for (let slot = 0; slot < this.simDogs.length; slot++) {
        const dog = this.simDogs[slot];
        this.pacePhases[slot] += (dtMs / 1000) * Math.PI * 2 * dog.profile.breed.motion.surgeHz;
        this.liveDogMotions[slot].movementScale = liveMovementScaleForDog(
          dog.gait,
          dog.state,
          dog.profile.breed.motion,
          this.pacePhases[slot],
        );
      }
    }
    const player = ctx.get<PlayerSystem>('player');
    const recall = player.consumeRecall();
    if (recall) playWhistle();
    const events = this.simulation.update(dtMs, {
      hunterPos: this.hunt.hunterPos,
      hunterRunning: player.isRunning(),
      recall,
      whistleRange: this.gearTier >= 3 ? Infinity : undefined,
      dogMotion: this.liveDogMotions,
    });
    this.recordEvents(events);
    for (let slot = 0; slot < this.simDogs.length; slot++) {
      const dog = this.simDogs[slot];
      const snapshot = this.dogSnapshots[slot];
      snapshot.currX = dog.pos.x;
      snapshot.currY = dog.pos.y;
      if (!snapshot.ready || snappedSpawn) {
        snapshot.prevX = snapshot.currX;
        snapshot.prevY = snapshot.currY;
        snapshot.ready = true;
      }
      this.hunt.dogsPos[slot].x = dog.pos.x;
      this.hunt.dogsPos[slot].y = dog.pos.y;
    }

    const ms = performance.now() - t0;
    this.simMsLast = ms;
    this.simMsTotal += ms;
    this.simTicks++;
    if (ms > this.simMsMax) this.simMsMax = ms;
    if (ms > SIM_MS_BUDGET && !this.budgetWarned) {
      this.budgetWarned = true;
      console.warn(`hunt3d: sim tick ${ms.toFixed(2)}ms exceeds ${SIM_MS_BUDGET}ms budget`);
    }
  }

  private recordEvents(events: readonly HuntSimulationEvent[]): void {
    for (const event of events) {
      if (event.type !== 'covey-flushed') continue;
      if (event.hunterDistance > HUNT_SHOT_RANGE) {
        const relanded = circleBack(
          this.hunt.birds,
          event.birdIds,
          this.area.world,
          this.flushRng,
          windMults(this.hunt.windStrength).nerve * conditionMults(this.hunt.condition).nerve,
        );
        if (relanded.length === 0) {
          for (const birdId of event.birdIds) this.simulation.resolveBird(birdId, 'escaped');
        }
        this.simulation.finishRise({ relight: false });
        continue;
      }
      this.lastFlush = { ids: event.birdIds, distPx: event.hunterDistance };
    }
  }

  /* ------------------------ flush-trigger plumbing --------------------- */

  /**
   * Deterministically WALK THE MAPPED HUNTER IN on the pointed bird and
   * flush the covey under the sim's own checkFlush conditions (FieldScene:
   * dog pointing + pointed bird still hidden + hunter within FLUSH_RADIUS).
   * The camera IS the mapped hunter, so the walk moves the camera along
   * the hunter->bird line at HUNTER_SPEED, ticking the sim at 30 Hz — a
   * pure function of the seed. On arrival the flush goes through the same
   * call surfaces the 2D game used: flushCovey + Dog.onFlush (steady dogs
   * stand; the roll comes from a fixed local stream).
   *
   * Returns the risen bird ids + the walk-in distance (flushBias's input),
   * or null if there is no live point (or the point broke on the way in).
   */
  triggerFlush(ctx: Ctx): { ids: number[]; distPx: number } | null {
    const pointingSlot = this.simDogs.findIndex((dog) => dog.state === 'pointing' && dog.pointedBirdId !== null);
    if (pointingSlot < 0) return null;
    const pointingDog = this.simDogs[pointingSlot];
    const birds = this.hunt.birds;
    let bird: (typeof birds)[number] | undefined;
    for (const b of birds) {
      if (b.id === pointingDog.pointedBirdId) {
        bird = b;
        break;
      }
    }
    if (!bird || bird.state !== 'hidden') return null;

    const previousFlush = this.lastFlush;
    const stepPx = HUNTER_SPEED_PX / 30;
    let guard = 0;
    while (dist(this.hunt.hunterPos, bird.pos) > FLUSH_RADIUS_PX && guard++ < WALK_IN_MAX_TICKS) {
      const dx = bird.pos.x - this.hunt.hunterPos.x;
      const dy = bird.pos.y - this.hunt.hunterPos.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = this.hunt.hunterPos.x + (dx / d) * stepPx;
      const ny = this.hunt.hunterPos.y + (dy / d) * stepPx;
      // Move the camera (the mapped hunter); tick() reads it back into
      // hunterPos — the exact FieldScene consumption order still runs.
      this.simToWorld(nx, ny, this.coordWorld);
      ctx.camera.position.x = this.coordWorld.x;
      ctx.camera.position.z = this.coordWorld.z;
      this.tick(ctx, 1000 / 30);
      if (this.lastFlush !== previousFlush) return this.lastFlush;
      if (pointingDog.state !== 'pointing' || bird.state !== 'hidden') return null;
    }
    if (dist(this.hunt.hunterPos, bird.pos) > FLUSH_RADIUS_PX) return null;
    const event = this.simulation.flushBird(bird.id, 'proximity', pointingSlot);
    if (event) this.recordEvents([event]);
    return this.lastFlush;
  }

  /** Resolve a 3D presentation outcome through the shared simulation. */
  resolveBird(birdId: number, outcome: 'downed' | 'escaped'): boolean {
    return this.simulation.resolveBird(birdId, outcome);
  }

  /** Convert a presentation-space ground contact into the shared fall. */
  recordFallWorld(birdId: number, worldX: number, worldZ: number): boolean {
    const position = this.worldToSim(worldX, worldZ, { x: 0, y: 0 });
    return this.simulation.recordFall(birdId, position);
  }

  finishRise(): RiseResolution | null {
    return this.simulation.finishRise();
  }

  /** Write off unresolved birds so either renderer can complete a hunt early. */
  endHunt(): number {
    return endHuntEarly(this.hunt);
  }

  /** Persist one completed 3D career hunt through the shared result module. */
  settleCareer(): CareerHuntResult | null {
    if (this.careerSettled) return this.careerResult;
    this.careerSettled = true;
    if (this.careerDogIds.length === 0 || this.careerDogIds.every((id) => id === null)) return null;
    const career = loadCareer();
    const dogs = this.careerDogIds.map((id) =>
      id ? career.kennel.find((candidate) => candidate.id === id) ?? null : null,
    );
    if (!dogs[0]) return null;
    this.careerResult = settleCareerHunt(career, this.hunt, dogs);
    saveCareer(this.careerResult.career);
    return this.careerResult;
  }

  /** The most recent rise (birds subsystem feeds flushBias from this). */
  lastFlushInfo(): { ids: number[]; distPx: number } | null {
    return this.lastFlush;
  }

  /* ------------------------- read-only surface ------------------------- */

  /** The authoritative hunt. Presentation reads it; only the sim writes. */
  huntState(): HuntState {
    return this.hunt;
  }

  areaConfig(): AreaConfig {
    return this.area;
  }

  dropPoint(): DropPoint {
    return getDropPoint(this.area, this.hunt.dropPointId);
  }

  /** Selected drop's parked truck, using the same offset as its renderer. */
  truckWorld<T extends { x: number; z: number }>(out: T): T {
    const drop = this.dropPoint();
    return this.simToWorld(
      drop.position.x - Math.cos(drop.heading) * 6,
      drop.position.y - Math.sin(drop.heading) * 6,
      out,
    );
  }

  /** The sim dog — position/state/gait are truth for the dog renderer. */
  dog(slot = 0): Dog {
    const dog = this.simDogs[slot];
    if (!dog) throw new Error(`hunt3d: dog slot ${slot} is not active`);
    return dog;
  }

  dogCount(): number {
    return this.simDogs.length;
  }

  /** Every cover patch of the covert, in world meters (axis-aligned). */
  coverPatches(): readonly WorldPatch[] {
    return this.patchesW;
  }

  /** Sim px -> world meters. Writes x/z into `out`, returns it. */
  simToWorld<T extends { x: number; z: number }>(sx: number, sy: number, out: T): T {
    return this.landscape.propertyToWorld(sx, sy, out);
  }

  /** World meters -> sim px. Writes x/y into `out`, returns it. */
  worldToSim(wx: number, wz: number, out: Vec2): Vec2 {
    return this.landscape.worldToProperty(wx, wz, out);
  }

  /** The sim dog's position in world meters. Writes into `out`. */
  dogWorld<T extends { x: number; z: number }>(out: T, slot = 0): T {
    const dog = this.dog(slot);
    return this.simToWorld(dog.pos.x, dog.pos.y, out);
  }

  /** Previous/current fixed snapshots interpolated for render presentation. */
  dogRenderWorld<T extends { x: number; z: number }>(alpha: number, out: T, slot = 0): T {
    const snapshot = this.dogSnapshots[slot];
    if (!snapshot) throw new Error(`hunt3d: dog snapshot ${slot} is not active`);
    const t = Math.max(0, Math.min(1, alpha));
    const sx = snapshot.prevX + (snapshot.currX - snapshot.prevX) * t;
    const sy = snapshot.prevY + (snapshot.currY - snapshot.prevY) * t;
    return this.simToWorld(sx, sy, out);
  }

  /** Sim tick cost (ms): last / worst / mean. Capture prints these. */
  simMs(): { last: number; max: number; avg: number } {
    return {
      last: this.simMsLast,
      max: this.simMsMax,
      avg: this.simTicks > 0 ? this.simMsTotal / this.simTicks : 0,
    };
  }
}
