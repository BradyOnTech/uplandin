import * as THREE from 'three';
import type { SlopeApproach } from '../../game/fieldcraft';
import { isFalconryPractice, FALCONRY_PRACTICE } from '../../game/falconryPractice';
import { GoshawkFlight } from '../../game/falconry';
import { ShallowWater } from '../../game/shallowWater';
import { quailGroundPropObstacles } from './quailGroundProps';
import { getDropPoint, type AreaConfig, type DropPoint } from '../../game/areas';
import { playWhistle } from '../../audio';
import { circleBack } from '../../game/birds';
import { BREEDS, getBreed, type BreedMotion } from '../../game/breeds';
import { loadCareer, saveCareer } from '../../game/career';
import { Dog, type CommandResponse, type DogGait, type DogState, type HandlerCommand, type HandlerCommandKind } from '../../game/dog';
import { dogCommandFeedback, dogNoteFeedback } from '../dogFeedback';
import { conditionMults, type Condition } from '../../game/conditions';
import { createThreeHuntSetup } from '../../game/gameplayMode';
import type { HuntChallenge } from '../../game/huntChallenge';
import { REVIEW_HUNT_SEED, huntStreamSeed, parseHuntSeed } from '../../game/huntSeed';
import { settleCareerHunt, type CareerHuntResult } from '../../game/huntResults';
import {
  HuntSimulation,
  HUNT_SHOT_RANGE,
  isSpatialEncounterArea,
  type HuntDogMotion,
  type RiseResolution,
  type HuntSimulationEvent,
} from '../../game/huntSimulation';
import { dist, mulberry32 } from '../../game/math';
import { LandscapeModel, PROPERTY_PX_TO_M } from '../../game/landscape';
import type { HuntState } from '../../game/state';
import type { Vec2 } from '../../game/types';
import { endFieldSession, endHuntEarly } from '../../game/state';
import { windMults } from '../../game/wind';
import { huntingDoctrine } from '../../game/huntDoctrine';
import { getSpecies } from '../../game/species';
import type { Ctx, Subsystem } from '../engine';
import { huntPaceMultiplier } from '../dogs/huntMotion';
import type { BirdsSystem } from './birds';
import type { PlayerSystem } from './player';
import { deriveQuailParkingPose } from './quailEntrances';

/*
 * HUNT3D subsystem: the bridge that makes this world THE GAME's world.
 *
 * It owns exactly three things:
 *  1. The authoritative sim instance — createHunt on the selected property
 *     with a reproducible per-visit seed, consumed through the same call
 *     surfaces the 2D FieldScene used (createHunt, dog.update, updateBirds).
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
// The short 2D work clock must make the same transition as field travel.
// Otherwise a dog exhausts its entire reserve after only a small part of
// one property, then loses 40% of its search and retrieve pace at once.
const LIVE_DOG_EFFORT_SCALE = LIVE_DOG_MOVEMENT_SCALE;
/** Enough catch-up capacity to follow the player's 4.18 m/s dry sprint. */
const LIVE_DOG_HEEL_SCALE = 0.07;
/**
 * The 2D sim speed was authored in screen pixels. Held trots and
 * low scent work need separate world-space scales. An active cover-bound
 * cast is resolved below by intent, not the legacy "trot" label. Behavior
 * timing and the authoritative state machine remain unchanged.
 */
const LIVE_DOG_TROT_SCALE = 0.025;
/** A marked fetch needs purposeful travel, including the carried return. */
const LIVE_DOG_RETRIEVE_SCALE = 0.05;
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
  // A purposeful cast must gain on a sprinting handler. Treating the sim's
  // cast label as a gentle trot halved translation to about 3 m/s. The shared
  // CAST_SPEED_MULT now supplies its modest lead over controlled cover work;
  // renderers select canter/gallop from actual displacement, not this label.
  const base = state === 'heel' ? LIVE_DOG_HEEL_SCALE
    : state === 'retrieving' ? LIVE_DOG_RETRIEVE_SCALE : activelySearching ? LIVE_DOG_MOVEMENT_SCALE
    : state === 'tracking' && gait === 'track' ? LIVE_DOG_STALK_SCALE
    : liveMovementScaleForGait(gait);
  return base * huntPaceMultiplier(motion, pacePhase, activelySearching);
}

export function liveDogBreedId(search: string): string {
  const requested = new URLSearchParams(search).get('breed');
  return requested && BREEDS.some((breed) => breed.id === requested) ? requested : DEFAULT_DOG_BREED;
}
/** Quarter around a point ahead of the player, not a huge circle behind them. */
const LIVE_DOG_ANCHOR_AHEAD_M = 14;
const LIVE_DOG_RANGE_M = 22;
/** "This way" sends the dog this far out along the hunter's facing. */
const CAST_DISTANCE_M = 30;
/** "Dead bird" reaches this far along the look ray. */
const DEAD_BIRD_REACH_M = 70;
const shortBreedName = (id: string) => ({ gsp: 'GSP', 'english-setter': 'Setter' } as Record<string, string>)[id] ?? getBreed(id).name;
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
  private lookDirection = new THREE.Vector3();
  /** Adapter-only pace/range mapping passed through the shared sim seam. */
  private liveDogMotions: HuntDogMotion[] = [];
  private dogWater?: ShallowWater;
  private waterPosition = { x: 0, z: 0 };
  private dogObstaclesSynced = false;
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
    prevHeading: number;
    prevTravelHeading: number;
    currX: number;
    currY: number;
    currHeading: number;
    currTravelHeading: number;
    ready: boolean;
  }> = [];
  /** Slow deterministic acceleration/deceleration while actively searching. */
  private pacePhases: number[] = [];
  /** Career settlement is idempotent even if the HUD renders many frames. */
  private careerDogIds: Array<string | null> = [];
  private careerResult: CareerHuntResult | null = null;
  private careerSettled = false;
  private gearTier = 0;
  private pointRevisions: number[] = [];
  private seedValue?: number;
  private activeChallenge: HuntChallenge = 'balanced';
  falconry: GoshawkFlight | null = null;
  /** Call names for feedback; career dogs by name, Quick dogs by breed. */
  private dogNames: string[] = [];
  private ctxRef: Ctx | null = null;

  constructor(private readonly landscape: LandscapeModel) {}

  /** Pause can change the next hunt's URL without changing this simulation. */
  getActiveChallenge(): HuntChallenge { return this.activeChallenge; }

  init(ctx: Ctx): void {
    this.pointRevisions = [];
    this.frozen = new URLSearchParams(location.search).has('capture');

    const search = new URLSearchParams(location.search);
    if (this.landscape.area.id === 'quail-fields' && parseHuntSeed(search.toString()) === undefined) search.set('seed', String(REVIEW_HUNT_SEED));
    const setup = createThreeHuntSetup(search.toString(), mulberry32(REVIEW_HUNT_SEED));
    this.activeChallenge = setup.challenge;
    this.seedValue = setup.seed;
    this.flushRng = mulberry32(setup.seed === undefined ? FLUSH_SEED : huntStreamSeed(setup.seed, FLUSH_SEED));
    this.gearTier = setup.gearTier;
    this.ctxRef = ctx;
    this.dogNames = [setup.kennelDog?.name ?? shortBreedName(setup.breed.id), ...(setup.brace ? [setup.brace.kennelDog?.name ?? shortBreedName(setup.brace.breedId)] : [])];
    this.careerDogIds = setup.launch?.kind === 'career'
      ? [setup.kennelDog?.id ?? null, setup.brace?.kennelDog?.id ?? null]
      : [];
    this.area = setup.area;
    this.hunt = setup.hunt;
    this.falconry = this.hunt.huntingMethod === 'goshawk' ? new GoshawkFlight() : null;
    const drop = getDropPoint(this.area, this.hunt.dropPointId);
    if (this.landscape.area.id !== this.area.id || this.landscape.dropPoint.id !== drop.id) {
      throw new Error(
        `hunt3d landscape mismatch: expected ${this.area.id}/${drop.id}, got `
        + `${this.landscape.area.id}/${this.landscape.dropPoint.id}`,
      );
    }
    ctx.get<PlayerSystem>('player').setHuntHeading(ctx, drop.heading);
    if (isFalconryPractice(location.search)) {
      const { hunter, quarry } = FALCONRY_PRACTICE;
      ctx.get<PlayerSystem>('player').setPose(ctx, hunter.x, hunter.z, Math.atan2(hunter.x-quarry.x, hunter.z-quarry.z)*180/Math.PI, -8);
    }
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
      prevHeading: dog.heading,
      prevTravelHeading: dog.heading,
      currX: dog.pos.x,
      currY: dog.pos.y,
      currHeading: dog.heading,
      currTravelHeading: dog.heading,
      ready: false,
    }));
    this.pacePhases = this.simDogs.map(() => 0);
    const propObstacles = quailGroundPropObstacles(this.landscape).map(o => {
      const p = this.landscape.worldToProperty(o.x,o.z,{x:0,y:0});
      return {x:p.x,y:p.y,radius:o.radius / PROPERTY_PX_TO_M};
    });
    this.dogWater = new ShallowWater(this.landscape);
    this.liveDogMotions = this.simDogs.map((dog) => ({
      obstacles: propObstacles,
      retrieveTurnRate: 5,
      effortScale: LIVE_DOG_EFFORT_SCALE,
      movementScale: liveMovementScaleForGait(dog.gait),
      rangeRadius: LIVE_DOG_RANGE_M / PROPERTY_PX_TO_M,
      workAnchor: this.liveDogAnchor,
    }));
    this.dogObstaclesSynced = false;
    this.simulation = new HuntSimulation({
      challenge: setup.challenge,
      continuousEncounter: isSpatialEncounterArea(this.area.id),
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
    this.advance(ctx, dtMs);
  }

  private advance(ctx: Ctx, dtMs: number): void {
    if (this.hunt.fieldSessionEnded) return;
    // The 2D scene cut held field time while the rise played. In open-world
    // 3D we keep the camera free but hold the dog/scent simulation so the
    // point does not dissolve into a new search under airborne birds.
    if (
      !isSpatialEncounterArea(this.area.id) && this.lastFlush &&
      ctx.get<BirdsSystem>('birds').isRiseActive()
    ) {
      this.worldToSim(ctx.camera.position.x, ctx.camera.position.z, this.hunt.hunterPos);
      return;
    }
    this.tick(ctx, dtMs);
  }

  /** Capture harness: advance the frozen sim by exact 30 Hz ticks. */
  step(ctx: Ctx, ticks: number): void {
    for (let i = 0; i < ticks; i++) this.advance(ctx, 1000 / 30);
  }

  /** The arrival presentation hands grounded dogs back before the first live
   * tick. Snap both interpolation endpoints; never run the hunt during release. */
  releaseFromTruck(ctx: Ctx, positions: readonly { x: number; z: number; heading: number }[]): boolean {
    if (this.liveSpawnSynced || this.frozen || positions.length !== this.simDogs.length) return false;
    if (positions.some(p => !Number.isFinite(p.x + p.z + p.heading))) return false;
    this.worldToSim(ctx.camera.position.x, ctx.camera.position.z, this.hunt.hunterPos);
    this.liveIntroHunter.x = this.hunt.hunterPos.x;
    this.liveIntroHunter.y = this.hunt.hunterPos.y;
    this.simDogs.forEach((dog, slot) => {
      this.worldToSim(positions[slot].x, positions[slot].z, dog.pos);
      dog.state = 'heel'; dog.gait = 'still'; dog.heading = positions[slot].heading;
      const snapshot = this.dogSnapshots[slot];
      snapshot.prevX = snapshot.currX = dog.pos.x;
      snapshot.prevY = snapshot.currY = dog.pos.y;
      snapshot.prevHeading = snapshot.currHeading = dog.heading;
      snapshot.prevTravelHeading = snapshot.currTravelHeading = dog.heading;
      snapshot.ready = true;
      this.hunt.dogsPos[slot].x = dog.pos.x;
      this.hunt.dogsPos[slot].y = dog.pos.y;
    });
    this.liveSpawnSynced = true;
    this.liveIntroHolding = true;
    return true;
  }

  private tick(ctx: Ctx, dtMs: number): void {
    const t0 = performance.now();
    this.syncDogObstacles(ctx);
    // Keep the previous authoritative hunter position until the simulation
    // consumes this movement. Aliasing it here disables walking disturbances.
    const hunterPos = this.worldToSim(ctx.camera.position.x, ctx.camera.position.z, { x: 0, y: 0 });
    const yaw = ctx.camera.rotation.y;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    this.liveDogAnchor.x =
      hunterPos.x + (forwardX * LIVE_DOG_ANCHOR_AHEAD_M) / PROPERTY_PX_TO_M;
    this.liveDogAnchor.y =
      hunterPos.y + (forwardZ * LIVE_DOG_ANCHOR_AHEAD_M) / PROPERTY_PX_TO_M;

    // The 2D area's hunter/dog spawn lives near its bottom edge, while the
    // 3D player deliberately starts near the field center. Without this
    // one-time bridge the dog begins ~250 m away: technically in the
    // camera frustum, but sub-pixel and buried in grass. Place it five
    // meters ahead and two meters screen-left on the first LIVE tick.
    // The explicit practice drill starts it 16 meters ahead, already in scent.
    // Recording uses the same placement. Only its clock is controlled by
    // the harness; hidden alternative mechanics invalidate gameplay evidence.
    let snappedSpawn = false;
    if (!this.liveSpawnSynced) {
      const ahead = isFalconryPractice(location.search) ? 16 : LIVE_DOG_AHEAD_M;
      const leftX = -Math.cos(yaw);
      const leftZ = Math.sin(yaw);
      for (let slot = 0; slot < this.simDogs.length; slot++) {
        const dog = this.simDogs[slot];
        const side = slot === 0 ? 1 : -1;
        dog.pos.x = hunterPos.x +
          (forwardX * ahead + leftX * LIVE_DOG_LEFT_M * side) / PROPERTY_PX_TO_M;
        dog.pos.y = hunterPos.y +
          (forwardZ * ahead + leftZ * LIVE_DOG_LEFT_M * side) / PROPERTY_PX_TO_M;
        dog.state = 'heel';
        dog.gait = 'still';
        // Stand three-quarter at heel so the marked head/ear is readable,
        // rather than presenting a featureless white rump to the player.
        dog.heading = Math.atan2(forwardZ, forwardX) + LIVE_DOG_INTRO_ANGLE * side;
      }
      this.liveIntroHolding = !isFalconryPractice(location.search);
      if (!this.liveIntroHolding) for (const dog of this.simDogs) dog.castOff();
      this.liveIntroHunter.x = hunterPos.x;
      this.liveIntroHunter.y = hunterPos.y;
      this.liveSpawnSynced = true;
      snappedSpawn = true;
    }
    if (this.liveIntroHolding) {
      const playerStartedWalking =
        dist(hunterPos, this.liveIntroHunter) >= LIVE_DOG_RELEASE_MOVE_PX;
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
        snapshot.prevHeading = snapshot.currHeading;
        snapshot.prevTravelHeading = snapshot.currTravelHeading;
      }
    }

    // Exactly the FieldScene consumption order: birds move, then the dog.
    // The breed's gameplay speed is already inside Dog; this low-frequency
    // multiplier supplies acceleration/deceleration within a cast rather
    // than making a hunting dog run at one mechanical velocity forever.
    for (let slot = 0; slot < this.simDogs.length; slot++) {
      const dog = this.simDogs[slot];
      this.landscape.propertyToWorld(dog.pos.x, dog.pos.y, this.waterPosition);
      const depth = this.dogWater?.depthAtWorld(this.waterPosition.x, this.waterPosition.z) ?? 0;
      const wet = Math.max(0, Math.min(1, (depth - .08) / .4));
      this.liveDogMotions[slot].maxTravelSpeed = depth > .08
        ? (4.5 - 3.1 * wet * wet * (3 - 2 * wet)) / PROPERTY_PX_TO_M : undefined;
      this.pacePhases[slot] += (dtMs / 1000) * Math.PI * 2 * dog.profile.breed.motion.surgeHz;
      this.liveDogMotions[slot].movementScale = liveMovementScaleForDog(
        dog.gait,
        dog.state,
        dog.profile.breed.motion,
        this.pacePhases[slot],
      );
    }
    const player = ctx.get<PlayerSystem>('player');
    const recall = player.consumeRecall();
    if (recall) playWhistle();
    const commands = this.falconry ? [] : (player.consumeCommands?.() ?? []).map(kind => this.commandFor(ctx, kind));
    const guard = this.falconry?.guardPoint();
    const events = this.simulation.update(dtMs, {
      hunterPos: hunterPos,
      hunterRunning: player.isRunning(),
      recall,
      holdDogs: this.falconry?.holdsDog,
      guardRaptor: guard ? this.worldToSim(guard.x,guard.z,{x:0,y:0}) : undefined,
      whistleRange: this.gearTier >= 3 ? Infinity : undefined,
      dogMotion: this.liveDogMotions,
      commands,
    });
    this.recordEvents(events);
    for (let slot = 0; slot < this.simDogs.length; slot++) {
      const dog = this.simDogs[slot];
      const snapshot = this.dogSnapshots[slot];
      const dx = dog.pos.x - snapshot.currX, dy = dog.pos.y - snapshot.currY;
      if (!snapshot.ready || snappedSpawn) snapshot.currTravelHeading = dog.heading;
      else if (dx * dx + dy * dy > 0.000001) snapshot.currTravelHeading = Math.atan2(dy, dx);
      snapshot.currX = dog.pos.x;
      snapshot.currY = dog.pos.y;
      snapshot.currHeading = dog.heading;
      if (!snapshot.ready || snappedSpawn) {
        snapshot.prevX = snapshot.currX;
        snapshot.prevY = snapshot.currY;
        snapshot.prevHeading = snapshot.currHeading;
        snapshot.prevTravelHeading = snapshot.currTravelHeading;
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

  /**
   * Visual property systems initialize after the hunt bridge, so their
   * collision circles are not available when the dog motion arrays are first
   * created. Pull the finished world obstacles once before the first live
   * tick and convert them into the simulation's property-pixel space. This
   * keeps a Chukar dog from pathing through the same rocks the hunter cannot
   * walk through, without coupling Dog to a renderer subsystem.
   */
  private syncDogObstacles(ctx: Ctx): void {
    if (this.dogObstaclesSynced) return;
    const converted: { x: number; y: number; radius: number }[] = [];
    const base = this.liveDogMotions[0]?.obstacles ?? [];
    for (const obstacle of base) converted.push({ ...obstacle });
    for (const id of ['chukar-environment', 'property-habitat', 'woodcock-wet-bottoms', 'landmarks', 'flora']) {
      let provider: { collisionCircles?: () => readonly { x: number; z: number; radius: number }[] };
      try { provider = ctx.get(id) as typeof provider; } catch { continue; }
      for (const circle of provider.collisionCircles?.() ?? []) {
        const property = this.worldToSim(circle.x, circle.z, { x: 0, y: 0 });
        converted.push({ x: property.x, y: property.y, radius: circle.radius / PROPERTY_PX_TO_M });
      }
    }
    for (const motion of this.liveDogMotions) motion.obstacles = converted;
    this.dogObstaclesSynced = true;
  }

  /** A command's target: where the hunter faces (cast) or looks (dead bird). */
  private commandFor(ctx: Ctx, kind: HandlerCommandKind): HandlerCommand {
    if (kind === 'whoa' || kind === 'release') return { kind };
    const cam = ctx.camera.position, dir = ctx.camera.getWorldDirection(this.lookDirection);
    let x = cam.x, z = cam.z;
    if (kind === 'cast') {
      const flat = Math.hypot(dir.x, dir.z) || 1;
      x += dir.x / flat * CAST_DISTANCE_M; z += dir.z / flat * CAST_DISTANCE_M;
    } else {
      // March the look ray until it meets the ground; looking up sends the
      // dog a fair distance out along the line instead.
      let hit = false;
      const terrain = ctx.get<Subsystem & { heightAt(x: number, z: number): number }>('terrain');
      for (let t = 2; t <= DEAD_BIRD_REACH_M; t += .5) {
        const px = cam.x + dir.x * t, py = cam.y + dir.y * t, pz = cam.z + dir.z * t;
        if (py <= terrain.heightAt(px, pz)) { x = px; z = pz; hit = true; break; }
      }
      if (!hit) { const flat = Math.hypot(dir.x, dir.z) || 1; x += dir.x / flat * 20; z += dir.z / flat * 20; }
    }
    return { kind, target: this.worldToSim(x, z, { x: 0, y: 0 }) };
  }

  private say(text: string): void {
    this.ctxRef?.events.dispatchEvent(new CustomEvent('dog-feedback', { detail: text }));
  }

  private recordEvents(events: readonly HuntSimulationEvent[]): void {
    for (const event of events) {
      if (event.type === 'command') {
        this.say(dogCommandFeedback(event.kind, event.responses as CommandResponse[], this.simDogs.map(dog => dog.state), this.dogNames));
        continue;
      }
      if (event.type === 'dog-note') {
        const text = dogNoteFeedback(event.kind, this.dogNames[event.dogIndex] ?? 'Dog');
        if (text) this.say(text);
        continue;
      }
      if (event.type === 'dog-pointed') {
        this.pointRevisions[event.dogIndex] = (this.pointRevisions[event.dogIndex] ?? 0) + 1;
        continue;
      }
      if (event.type !== 'covey-flushed') continue;
      const doctrine = huntingDoctrine(this.area.id);
      // Continuous world rises must stay visible before a circle-back is
      // resolved. The scene-cut adapter can settle one immediately, while a
      // spatial property hands the event to finishRise() after the flight.
      if (!isSpatialEncounterArea(this.area.id) && doctrine.circleBack && event.hunterDistance > HUNT_SHOT_RANGE) {
        const relanded = circleBack(
          this.hunt.birds,
          event.birdIds,
          this.area.world,
          this.flushRng,
          windMults(this.hunt.windStrength).nerve * conditionMults(this.hunt.condition).nerve,
          {
            returnTrail: this.area.trails.find((trail) => trail.id === 'circleback-return'),
            patches: this.area.patches,
          },
        );
        if (relanded.length === 0) {
          for (const birdId of event.birdIds) this.simulation.resolveBird(birdId, 'escaped');
        }
        this.simulation.finishRise({ relight: false, birdId: event.birdId });
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
  resolveBird(birdId: number, outcome: 'downed' | 'escaped', landing?: { x: number; z: number }, options: { wounded?: boolean } = {}): boolean {
    const position = landing ? this.worldToSim(landing.x, landing.z, { x: 0, y: 0 }) : undefined;
    const resolved = this.simulation.resolveBird(birdId, outcome, position, options);
    if (resolved && outcome === 'downed' && isSpatialEncounterArea(this.area.id)) this.simulation.bird(birdId)!.fallPending = true;
    return resolved;
  }

  bindQuarryWorld(id: number, x: number, z: number): boolean {
    return this.simulation.bindQuarry(id, this.worldToSim(x,z,{x:0,y:0}));
  }

  recoverQuarry(id: number): boolean { return this.simulation.recoverQuarry(id); }

  /** Convert a presentation-space ground contact into the shared fall. */
  recordFallWorld(birdId: number, worldX: number, worldZ: number): boolean {
    const position = this.worldToSim(worldX, worldZ, { x: 0, y: 0 });
    const recorded = this.simulation.recordFall(birdId, position);
    const bird = this.simulation.bird(birdId);
    if (recorded && bird?.marked === false) this.say(`Fall not marked · send ${this.dogNames[0] ?? 'the dog'} with Dead bird`);
    else if (recorded && bird?.wounded) this.say('Wounded bird down · it will run');
    return recorded;
  }

  /** An unsafe shot counts against the hunter; the gun judges it. */
  recordShotSafety(kind: 'low' | 'dog-in-line'): void {
    this.simulation.recordShotSafety(kind);
  }

  finishRise(): RiseResolution | null {
    // The simulation owns per-rise settlement, including the Hun circle-back
    // rule. Drain every active rise because the spatial presentation may have
    // staged a second covey before the first one left the sky.
    let result: RiseResolution | null = null;
    for (let next = this.simulation.finishRise(); next; next = this.simulation.finishRise()) result = next;
    if (result) this.lastFlush = null;
    return result;
  }

  /** Close a world-space field session without inventing escapes from untouched cover. */
  endHunt(): number {
    if (this.falconry && !this.falconry.canEnd) return 0;
    if (isSpatialEncounterArea(this.area.id)) {
      // Ending with birds still down loses them; they count in the report.
      endFieldSession(this.hunt, { abandonDowned: true });
      return 0;
    }
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

  /** Per-bird launch metadata survives a newer overlapping covey rise. */
  riseSlopeApproach(birdId: number): SlopeApproach | null {
    return this.simulation.riseSlopeApproach(birdId);
  }

  /** The most recent rise (birds subsystem feeds flushBias from this). */
  lastFlushInfo(): { ids: number[]; distPx: number } | null {
    return this.lastFlush;
  }

  /**
   * A species-aware rise label keeps the hunt language honest in the HUD.
   * A pheasant or grouse is a single-bird flush even if setup placed another
   * bird in the same pocket; quail, Huns, and chukar announce the covey break
   * that the player should read and shoot through.
   */
  riseLabel(): string | null {
    const info = this.lastFlush;
    if (!info || info.ids.length === 0) return null;
    const bird = info.ids
      .map((id) => this.hunt.birds.find((candidate) => candidate.id === id))
      .find((candidate) => candidate !== undefined);
    if (!bird) return null;
    const species = getSpecies(bird.speciesId);
    const hensOnly = info.ids.every(id => {
      const candidate = this.hunt.birds.find(entry => entry.id === id);
      return candidate?.speciesId === 'ringneck' && candidate.sex === 'hen';
    });
    if (hensOnly) return 'HEN FLUSH · HOLD FIRE';
    const shortName = species.id === 'ringneck'
      ? bird.sex === 'hen' ? 'HEN' : 'ROOSTER'
      : species.name.toUpperCase();
    return species.flushAsCovey && info.ids.length > 1
      ? `${shortName} COVEY RISE`
      : `${shortName} FLUSH`;
  }

  /* ------------------------- read-only surface ------------------------- */

  /** The authoritative hunt. Presentation reads it; only the sim writes. */
  huntState(): HuntState {
    return this.hunt;
  }

  seed(): number | undefined { return this.seedValue; }

  /** Selected tracking gear, shared by field presentation and recall rules. */
  trackingGearTier(): number { return this.gearTier; }

  /** Point and flush can occur between rendered frames. Monotonic per-dog
   * revisions preserve that observed state transition without a bird marker. */
  dogPointRevision(slot = 0): number { return this.pointRevisions[slot] ?? 0; }

  areaConfig(): AreaConfig {
    return this.area;
  }

  condition(): Condition {
    return this.hunt.condition;
  }

  dropPoint(): DropPoint {
    return getDropPoint(this.area, this.hunt.dropPointId);
  }

  /** Presentation target shared by the parked truck and HUD; no sim anchor moves. */
  truckWorld<T extends { x: number; z: number }>(out: T): T {
    const drop = this.dropPoint();
    const parking = deriveQuailParkingPose(this.area, drop.id);
    if (parking) return this.simToWorld(parking.position.x, parking.position.y, out);
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

  /** Career dogs by name; Quick dogs by breed. */
  dogName(slot = 0): string { return this.dogNames[slot] ?? 'Dog'; }

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

  /** Heading shares position's fixed snapshots; wrap through the shorter turn. */
  dogRenderHeading(alpha: number, slot = 0): number {
    const snapshot = this.dogSnapshots[slot];
    if (!snapshot) throw new Error(`hunt3d: dog snapshot ${slot} is not active`);
    const delta = Math.atan2(Math.sin(snapshot.currHeading - snapshot.prevHeading), Math.cos(snapshot.currHeading - snapshot.prevHeading));
    return snapshot.prevHeading + delta * Math.max(0, Math.min(1, alpha));
  }

  /** Actual movement includes the weave around the dog's base scent heading. */
  dogRenderTravelHeading(alpha: number, slot = 0): number {
    const snapshot = this.dogSnapshots[slot];
    if (!snapshot) throw new Error(`hunt3d: dog snapshot ${slot} is not active`);
    const delta = Math.atan2(Math.sin(snapshot.currTravelHeading - snapshot.prevTravelHeading), Math.cos(snapshot.currTravelHeading - snapshot.prevTravelHeading));
    return snapshot.prevTravelHeading + delta * Math.max(0, Math.min(1, alpha));
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
