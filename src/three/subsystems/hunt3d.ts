import type { AreaConfig } from '../../game/areas';
import { BREEDS, getBreed, type BreedMotion } from '../../game/breeds';
import { loadCareer, saveCareer } from '../../game/career';
import { Dog, type DogGait, type DogState } from '../../game/dog';
import { createThreeHuntSetup } from '../../game/gameplayMode';
import { settleCareerHunt, type CareerHuntResult } from '../../game/huntResults';
import {
  HuntSimulation,
  type HuntDogMotion,
  type RiseResolution,
  type HuntSimulationEvent,
} from '../../game/huntSimulation';
import { dist, mulberry32 } from '../../game/math';
import type { HuntState } from '../../game/state';
import type { Vec2 } from '../../game/types';
import type { Ctx, Subsystem } from '../engine';
import { huntPaceMultiplier } from '../dogs/huntMotion';
import type { BirdsSystem } from './birds';

/*
 * HUNT3D subsystem: the bridge that makes this world THE GAME's world.
 *
 * It owns exactly three things:
 *  1. The authoritative sim instance — createHunt on the quail-fields area
 *     with a fixed seed, consumed read-only through the same call surfaces
 *     the 2D FieldScene used (createHunt, dog.update, updateBirds).
 *  2. The sim-px <-> world-meters mapping. 1 sim px = 1 yard = 0.9144 m,
 *     sim world center pinned to the terrain origin, sim +x -> world +x,
 *     sim +y (screen down) -> world +z. Angles carry over unchanged.
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

/** 1 sim px = 1 yard. SHOT_RANGE 40 is a literal 40-yard gun. */
export const SIM_PX_TO_M = 0.9144;

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
/** Put one real fixed-seed covey down the opening lane, not beside the gun. */
const LIVE_OPENING_COVEY_AHEAD_M = 50;
const LIVE_OPENING_COVEY_SIDE_M = 7;
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
  private simDog!: Dog;
  private patchesW: WorldPatch[] = [];
  /** Sim-px coords of the world origin (sim world center). */
  private simCx = 0;
  private simCy = 0;
  /** capture mode: sim advances only through step(). */
  private frozen = false;
  /** The authored 2D spawn is ~250 m from the 3D camera start; sync once. */
  private liveSpawnSynced = false;
  private liveIntroHolding = false;
  private liveIntroHunter: Vec2 = { x: 0, y: 0 };
  private liveDogAnchor: Vec2 = { x: 0, y: 0 };
  private simulation!: HuntSimulation;
  /** Adapter-only pace/range mapping passed through the shared sim seam. */
  private liveDogMotion: HuntDogMotion = {};
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
  private dogPrevX = 0;
  private dogPrevY = 0;
  private dogCurrX = 0;
  private dogCurrY = 0;
  private dogSnapshotReady = false;
  /** Slow deterministic acceleration/deceleration while actively searching. */
  private pacePhase = 0;
  /** Career settlement is idempotent even if the HUD renders many frames. */
  private careerDogId: string | null = null;
  private careerResult: CareerHuntResult | null = null;
  private careerSettled = false;

  init(ctx: Ctx): void {
    this.frozen = new URLSearchParams(location.search).has('capture');

    const setup = createThreeHuntSetup(location.search, mulberry32(HUNT_SEED));
    this.careerDogId = setup.launch?.kind === 'career' ? setup.kennelDog?.id ?? null : null;
    this.area = setup.area;
    this.simCx = this.area.world.x + this.area.world.w / 2;
    this.simCy = this.area.world.y + this.area.world.h / 2;

    // Fixed RNG keeps captures reproducible. Career and Quick Hunt options
    // themselves come from the same saves/config used by FieldScene.
    this.hunt = setup.hunt;
    if (!this.frozen) {
      // createHunt scatters a sparse population across a kilometre-scale 2D
      // covert. The 3D camera has no overhead map and previously mapped to
      // the unrelated field center, leaving the nearest bird ~190 m off a
      // normal walking lane. Translate (never mutate) the shared simulation
      // so its first real covey sits ahead and slightly quartering from the
      // player's authored start. All subsequent movement, scent, pointing,
      // cover and bird state remain the shared simulation's responsibility.
      const openingBird = this.hunt.birds.find((bird) => bird.state === 'hidden');
      if (openingBird) {
        const yaw = ctx.camera.rotation.y;
        const forwardX = -Math.sin(yaw);
        const forwardZ = -Math.cos(yaw);
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);
        const targetWorldX =
          ctx.camera.position.x + forwardX * LIVE_OPENING_COVEY_AHEAD_M + rightX * LIVE_OPENING_COVEY_SIDE_M;
        const targetWorldZ =
          ctx.camera.position.z + forwardZ * LIVE_OPENING_COVEY_AHEAD_M + rightZ * LIVE_OPENING_COVEY_SIDE_M;
        this.simCx = openingBird.pos.x - targetWorldX / SIM_PX_TO_M;
        this.simCy = openingBird.pos.y - targetWorldZ / SIM_PX_TO_M;
      }
    }
    const liveBreed = setup.breed;
    this.simDog = new Dog(
      { ...this.hunt.dogsPos[0] },
      { breed: liveBreed, level: setup.level, ageMult: setup.ageMultiplier },
      mulberry32(DOG_SEED),
      this.area.world,
    );
    this.dogPrevX = this.dogCurrX = this.simDog.pos.x;
    this.dogPrevY = this.dogCurrY = this.simDog.pos.y;

    this.liveDogMotion = {
      movementScale: this.frozen ? 1 : liveMovementScaleForGait(this.simDog.gait),
      rangeRadius: this.frozen ? undefined : LIVE_DOG_RANGE_M / SIM_PX_TO_M,
      workAnchor: this.frozen ? undefined : this.liveDogAnchor,
    };
    this.simulation = new HuntSimulation({
      hunt: this.hunt,
      dogs: [this.simDog],
      area: this.area,
      rng: this.flushRng,
    });

    // Cover patches in world meters, once.
    for (const p of this.area.patches) {
      this.patchesW.push({
        cx: (p.x + p.w / 2 - this.simCx) * SIM_PX_TO_M,
        cz: (p.y + p.h / 2 - this.simCy) * SIM_PX_TO_M,
        hx: (p.w / 2) * SIM_PX_TO_M,
        hz: (p.h / 2) * SIM_PX_TO_M,
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
        this.hunt.hunterPos.x + (forwardX * LIVE_DOG_ANCHOR_AHEAD_M) / SIM_PX_TO_M;
      this.liveDogAnchor.y =
        this.hunt.hunterPos.y + (forwardZ * LIVE_DOG_ANCHOR_AHEAD_M) / SIM_PX_TO_M;
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
      this.simDog.pos.x = this.hunt.hunterPos.x +
        (forwardX * LIVE_DOG_AHEAD_M + leftX * LIVE_DOG_LEFT_M) / SIM_PX_TO_M;
      this.simDog.pos.y = this.hunt.hunterPos.y +
        (forwardZ * LIVE_DOG_AHEAD_M + leftZ * LIVE_DOG_LEFT_M) / SIM_PX_TO_M;
      this.simDog.state = 'heel';
      this.simDog.gait = 'still';
      // Stand three-quarter at heel so the marked head/ear is readable,
      // rather than presenting a featureless white rump to the player.
      this.simDog.heading = Math.atan2(forwardZ, forwardX) + LIVE_DOG_INTRO_ANGLE;
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
        this.simDog.castOff();
        this.liveIntroHolding = false;
      }
    }

    // Preserve the previous authoritative snapshot before the sim writes
    // the next one. The first live placement snaps both ends so the dog
    // cannot interpolate in from its distant authored 2D spawn.
    if (this.dogSnapshotReady && !snappedSpawn) {
      this.dogPrevX = this.dogCurrX;
      this.dogPrevY = this.dogCurrY;
    }

    // Exactly the FieldScene consumption order: birds move, then the dog.
    // The breed's gameplay speed is already inside Dog; this low-frequency
    // multiplier supplies acceleration/deceleration within a cast rather
    // than making a hunting dog run at one mechanical velocity forever.
    if (!this.frozen) {
      this.pacePhase += (dtMs / 1000) * Math.PI * 2 * this.simDog.profile.breed.motion.surgeHz;
      this.liveDogMotion.movementScale = liveMovementScaleForDog(
        this.simDog.gait,
        this.simDog.state,
        this.simDog.profile.breed.motion,
        this.pacePhase,
      );
    }
    const events = this.simulation.update(dtMs, {
      hunterPos: this.hunt.hunterPos,
      dogMotion: [this.liveDogMotion],
    });
    this.recordEvents(events);
    this.dogCurrX = this.simDog.pos.x;
    this.dogCurrY = this.simDog.pos.y;
    if (!this.dogSnapshotReady || snappedSpawn) {
      this.dogPrevX = this.dogCurrX;
      this.dogPrevY = this.dogCurrY;
      this.dogSnapshotReady = true;
    }
    this.hunt.dogsPos[0].x = this.simDog.pos.x;
    this.hunt.dogsPos[0].y = this.simDog.pos.y;

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
    if (this.simDog.state !== 'pointing' || this.simDog.pointedBirdId === null) return null;
    const birds = this.hunt.birds;
    let bird: (typeof birds)[number] | undefined;
    for (const b of birds) {
      if (b.id === this.simDog.pointedBirdId) {
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
      ctx.camera.position.x = (nx - this.simCx) * SIM_PX_TO_M;
      ctx.camera.position.z = (ny - this.simCy) * SIM_PX_TO_M;
      this.tick(ctx, 1000 / 30);
      if (this.lastFlush !== previousFlush) return this.lastFlush;
      if (this.simDog.state !== 'pointing' || bird.state !== 'hidden') return null;
    }
    if (dist(this.hunt.hunterPos, bird.pos) > FLUSH_RADIUS_PX) return null;
    const event = this.simulation.flushBird(bird.id, 'proximity', 0);
    if (event) this.recordEvents([event]);
    return this.lastFlush;
  }

  /** Resolve a 3D presentation outcome through the shared simulation. */
  resolveBird(birdId: number, outcome: 'downed' | 'escaped'): boolean {
    return this.simulation.resolveBird(birdId, outcome);
  }

  finishRise(): RiseResolution | null {
    return this.simulation.finishRise();
  }

  /** Persist one completed 3D career hunt through the shared result module. */
  settleCareer(): CareerHuntResult | null {
    if (this.careerSettled) return this.careerResult;
    this.careerSettled = true;
    if (!this.careerDogId) return null;
    const career = loadCareer();
    const dog = career.kennel.find((candidate) => candidate.id === this.careerDogId) ?? null;
    if (!dog) return null;
    this.careerResult = settleCareerHunt(career, this.hunt, [dog]);
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

  /** The sim dog — position/state/gait are truth for the dog renderer. */
  dog(): Dog {
    return this.simDog;
  }

  /** Every cover patch of the covert, in world meters (axis-aligned). */
  coverPatches(): readonly WorldPatch[] {
    return this.patchesW;
  }

  /** Sim px -> world meters. Writes x/z into `out`, returns it. */
  simToWorld<T extends { x: number; z: number }>(sx: number, sy: number, out: T): T {
    out.x = (sx - this.simCx) * SIM_PX_TO_M;
    out.z = (sy - this.simCy) * SIM_PX_TO_M;
    return out;
  }

  /** World meters -> sim px. Writes x/y into `out`, returns it. */
  worldToSim(wx: number, wz: number, out: Vec2): Vec2 {
    out.x = wx / SIM_PX_TO_M + this.simCx;
    out.y = wz / SIM_PX_TO_M + this.simCy;
    return out;
  }

  /** The sim dog's position in world meters. Writes into `out`. */
  dogWorld<T extends { x: number; z: number }>(out: T): T {
    return this.simToWorld(this.simDog.pos.x, this.simDog.pos.y, out);
  }

  /** Previous/current fixed snapshots interpolated for render presentation. */
  dogRenderWorld<T extends { x: number; z: number }>(alpha: number, out: T): T {
    const t = Math.max(0, Math.min(1, alpha));
    const sx = this.dogPrevX + (this.dogCurrX - this.dogPrevX) * t;
    const sy = this.dogPrevY + (this.dogCurrY - this.dogPrevY) * t;
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
