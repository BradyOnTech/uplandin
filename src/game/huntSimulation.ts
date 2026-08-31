import type { AreaConfig } from './areas';
import {
  birdsScentingDog,
  birdsSpookedBy,
  flushCovey,
  relightSurvivors,
  updateBirdNerve,
  updateBirds,
  type Bird,
} from './birds';
import { dogScentRadius } from './breeds';
import { conditionMults } from './conditions';
import { Dog, type DogEnv, type DogState } from './dog';
import {
  FLANK_NERVE_MULT,
  isFlanking,
  slopeApproach,
  slopeNerveMult,
  type SlopeApproach,
} from './fieldcraft';
import { dist } from './math';
import type { HuntState } from './state';
import type { RNG, Vec2 } from './types';
import { windMults } from './wind';

/** Shared field rules. Both renderers cross this seam. */
export const HUNT_FLUSH_RADIUS = 22;
export const HUNT_SHOT_RANGE = 40;
export const HUNT_SPRINT_SPOOK_RADIUS = 30;
export const HUNT_SPRINT_NERVE_MULT = 1.6;

export type FlushCause = 'proximity' | 'nerve' | 'bump' | 'scent' | 'spook';

export type HuntSimulationEvent =
  | { type: 'dog-pointed'; dogIndex: number; birdId: number }
  | { type: 'bird-retrieved'; dogIndex: number; count: number }
  | {
      type: 'covey-flushed';
      cause: FlushCause;
      birdId: number;
      birdIds: number[];
      hunterDistance: number;
      pointingSlot: number | null;
      pointCredit: boolean;
      slopeApproach: SlopeApproach | null;
    };

export interface HuntDogMotion {
  movementScale?: number;
  rangeRadius?: number;
  workAnchor?: Vec2;
}

export interface HuntSimulationInput {
  /** Hunter position after this tick's adapter-specific movement. */
  hunterPos: Vec2;
  hunterRunning?: boolean;
  recall?: boolean;
  whistleRange?: number;
  /** Presentation-scale movement overrides; gameplay rules stay internal. */
  dogMotion?: readonly HuntDogMotion[];
}

export interface HuntSimulationConfig {
  hunt: HuntState;
  dogs: Dog[];
  area: AreaConfig;
  rng?: RNG;
}

export interface RiseResolution {
  birdIds: number[];
  downedIds: number[];
  escapedIds: number[];
  relitIds: number[];
  double: boolean;
  pointingSlot: number | null;
}

/**
 * Presentation-independent hunt orchestration.
 *
 * The module owns ordering and outcomes: birds, dogs, pressure, proximity
 * and flush credit. Phaser and Three.js supply player intent and render the
 * returned domain events; neither adapter decides whether a covey rose.
 */
export class HuntSimulation {
  private readonly hunt: HuntState;
  private readonly dogs: Dog[];
  private readonly area: AreaConfig;
  private readonly rng: RNG;
  private readonly previousDogStates: DogState[];
  private activeRise: Extract<HuntSimulationEvent, { type: 'covey-flushed' }> | null = null;

  constructor(config: HuntSimulationConfig) {
    this.hunt = config.hunt;
    this.dogs = config.dogs;
    this.area = config.area;
    this.rng = config.rng ?? Math.random;
    this.previousDogStates = this.dogs.map((dog) => dog.state);
  }

  update(dtMs: number, input: HuntSimulationInput): HuntSimulationEvent[] {
    const events: HuntSimulationEvent[] = [];
    const leadDog = this.dogs[0];
    if (!leadDog) return events;

    updateBirds(dtMs, this.hunt.birds, leadDog.pos, {
      bounds: this.area.world,
      patches: this.area.patches,
      slopeAngle: this.area.slope,
    });

    const wind = windMults(this.hunt.windStrength);
    const weather = conditionMults(this.hunt.condition);
    for (let i = 0; i < this.dogs.length; i++) {
      const dog = this.dogs[i];
      const packmate = this.dogs.find((candidate, j) => j !== i && candidate.state === 'pointing');
      const retrievedBefore = this.hunt.birds.filter((bird) => bird.state === 'retrieved').length;
      const motion = input.dogMotion?.[i];
      const env: DogEnv = {
        hunterPos: this.hunt.hunterPos,
        windAngle: this.hunt.wind,
        scentMult: wind.scent * weather.scent,
        recall: input.recall ?? false,
        whistleRange: input.whistleRange,
        honorPoint: packmate?.pos,
        drainMult: weather.stamina,
        searchMult: weather.search,
        patches: this.area.patches,
        movementScale: motion?.movementScale,
        rangeRadius: motion?.rangeRadius,
        workAnchor: motion?.workAnchor,
      };
      dog.update(dtMs, this.hunt.birds, env);
      this.hunt.dogsPos[i] = { ...dog.pos };

      if (dog.state === 'pointing' && this.previousDogStates[i] !== 'pointing' && dog.pointedBirdId !== null) {
        events.push({ type: 'dog-pointed', dogIndex: i, birdId: dog.pointedBirdId });
      }
      this.previousDogStates[i] = dog.state;

      const retrievedNow = this.hunt.birds.filter((bird) => bird.state === 'retrieved').length;
      if (retrievedNow > retrievedBefore) {
        const count = retrievedNow - retrievedBefore;
        this.hunt.dogWork[i].retrieves += count;
        events.push({ type: 'bird-retrieved', dogIndex: i, count });
      }

      if (dog.bumpedBirdId !== null) {
        const bumpedId = dog.bumpedBirdId;
        dog.bumpedBirdId = null;
        const event = this.flushBird(bumpedId, 'bump', null);
        if (event) events.push(event);
        return events;
      }

      if (dog.state === 'quartering' || dog.state === 'tracking') {
        const scented = birdsScentingDog(
          this.hunt.birds,
          dog.pos,
          this.hunt.wind,
          dogScentRadius(dog.level) * wind.dogScent,
        );
        if (scented.length > 0) {
          const event = this.flushBird(scented[0].id, 'scent', null);
          if (event) events.push(event);
          return events;
        }
      }
    }

    // FieldScene historically moved the hunter after the dog tick. Preserve
    // that ordering while letting either adapter supply movement however it
    // likes (tap-to-walk in 2D, camera locomotion in 3D).
    this.hunt.hunterPos.x = input.hunterPos.x;
    this.hunt.hunterPos.y = input.hunterPos.y;

    if (input.hunterRunning) {
      const spooked = birdsSpookedBy(this.hunt.birds, this.hunt.hunterPos, HUNT_SPRINT_SPOOK_RADIUS);
      if (spooked.length > 0) {
        const event = this.flushBird(spooked[0].id, 'spook', null);
        if (event) events.push(event);
        return events;
      }
    }

    for (let i = 0; i < this.dogs.length; i++) {
      const dog = this.dogs[i];
      if (dog.state !== 'pointing') continue;
      let nerveMult = dog.pressure * (input.hunterRunning ? HUNT_SPRINT_NERVE_MULT : 1);
      const pointed = this.hunt.birds.find((bird) => bird.id === dog.pointedBirdId);
      if (pointed) {
        nerveMult *= slopeNerveMult(slopeApproach(this.area.slope, this.hunt.hunterPos, pointed.pos));
        if (isFlanking(this.hunt.hunterPos, dog.pos, pointed.pos)) nerveMult *= FLANK_NERVE_MULT;
      }
      const wild = updateBirdNerve(dtMs, this.hunt.birds, dog.pointedBirdId, nerveMult);
      if (wild) {
        const event = this.flushBird(wild.id, 'nerve', i);
        if (event) events.push(event);
        return events;
      }
    }

    for (let i = 0; i < this.dogs.length; i++) {
      const dog = this.dogs[i];
      if (dog.state !== 'pointing' || dog.pointedBirdId === null) continue;
      const bird = this.hunt.birds.find((candidate) => candidate.id === dog.pointedBirdId);
      if (bird?.state === 'hidden' && dist(this.hunt.hunterPos, bird.pos) <= HUNT_FLUSH_RADIUS) {
        const event = this.flushBird(bird.id, 'proximity', i);
        if (event) events.push(event);
        return events;
      }
    }

    return events;
  }

  flushBird(
    birdId: number,
    cause: FlushCause,
    pointingSlot: number | null,
  ): Extract<HuntSimulationEvent, { type: 'covey-flushed' }> | null {
    const bird = this.hunt.birds.find((candidate) => candidate.id === birdId);
    if (!bird || bird.state !== 'hidden') return null;
    const hunterDistance = dist(this.hunt.hunterPos, bird.pos);
    const pointCredit =
      pointingSlot !== null &&
      (cause === 'proximity' || cause === 'nerve') &&
      this.dogs[pointingSlot]?.pointedBirdId === bird.id;
    if (pointCredit) this.hunt.dogWork[pointingSlot].pointFlushes++;

    const flushed = flushCovey(this.hunt.birds, bird.id);
    for (const dog of this.dogs) dog.onFlush(this.rng, bird.pos);
    const event: Extract<HuntSimulationEvent, { type: 'covey-flushed' }> = {
      type: 'covey-flushed',
      cause,
      birdId: bird.id,
      birdIds: flushed.map((candidate) => candidate.id),
      hunterDistance,
      pointingSlot,
      pointCredit,
      slopeApproach: slopeApproach(this.area.slope, this.hunt.hunterPos, bird.pos),
    };
    this.activeRise = event;
    return event;
  }

  resolveBird(birdId: number, outcome: 'downed' | 'escaped'): boolean {
    const bird = this.hunt.birds.find((candidate) => candidate.id === birdId);
    if (!bird || bird.state !== 'flushed') return false;
    bird.state = outcome;
    if (outcome === 'downed') {
      this.hunt.downed++;
      if (bird.sex === 'hen') this.hunt.henDowns++;
    } else {
      this.hunt.escaped++;
    }
    return true;
  }

  /**
   * Record the authoritative place where a downed bird came to rest.
   *
   * Shooting adapters own flight and collision presentation, but the shared
   * simulation owns the fall that the dog retrieves. Keeping this handoff at
   * the simulation seam prevents a renderer-only carcass position from
   * disagreeing with Dog.update().
   */
  recordFall(birdId: number, position: Vec2): boolean {
    const bird = this.hunt.birds.find((candidate) => candidate.id === birdId);
    if (!bird || bird.state !== 'downed') return false;
    bird.pos = { ...position };
    return true;
  }

  /**
   * Close the current rise once its presentation has settled. Scoring and
   * relights belong here so both shooting adapters produce identical hunt
   * outcomes even though one is a scene cut and the other stays in-world.
   */
  finishRise(options: { relight?: boolean } = {}): RiseResolution | null {
    const rise = this.activeRise;
    if (!rise) return null;
    const downedIds: number[] = [];
    const escapedIds: number[] = [];
    for (const id of rise.birdIds) {
      const bird = this.hunt.birds.find((candidate) => candidate.id === id);
      if (bird?.state === 'downed' || bird?.state === 'carried' || bird?.state === 'retrieved') {
        downedIds.push(id);
      }
      else if (bird?.state === 'escaped') escapedIds.push(id);
    }

    if (rise.pointCredit && rise.pointingSlot !== null) {
      this.hunt.dogWork[rise.pointingSlot].downedOverPoint += downedIds.length;
    }
    const isDouble = downedIds.length >= 2;
    if (isDouble) this.hunt.doubles++;

    const relit = options.relight === false
      ? []
      : relightSurvivors(
          this.hunt.birds,
          escapedIds,
          this.area.world,
          this.rng,
          windMults(this.hunt.windStrength).nerve,
          this.area.patches,
        );
    this.hunt.escaped -= relit.length;
    this.activeRise = null;
    return {
      birdIds: [...rise.birdIds],
      downedIds,
      escapedIds,
      relitIds: relit.map((bird) => bird.id),
      double: isDouble,
      pointingSlot: rise.pointCredit ? rise.pointingSlot : null,
    };
  }

  bird(birdId: number): Bird | undefined {
    return this.hunt.birds.find((candidate) => candidate.id === birdId);
  }
}
