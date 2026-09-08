import type { AreaConfig } from './areas';
import {
  birdsScentingDog,
  birdsDisturbedByHunter,
  birdsSpookedBy,
  circleBack,
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
  slopeNerveMult,
  speciesSlopeApproach,
  type SlopeApproach,
} from './fieldcraft';
import { dist } from './math';
import type { HuntState } from './state';
import type { RNG, Vec2 } from './types';
import { windMults } from './wind';
import { quailPointApproach } from './quailApproach';
import { HUNT_CHALLENGES, type HuntChallenge } from './huntChallenge';
import { huntHabitatAffinity, huntingDoctrine } from './huntDoctrine';
import { LandscapeModel, type GroundSample } from './landscape';
import { getSpecies } from './species';
import { PROPERTY_PX_TO_M } from './worldUnits';

/** Shared field rules. Both renderers cross this seam. */
export const HUNT_FLUSH_RADIUS = 22;
export const HUNT_SHOT_RANGE = 40;
export const HUNT_SPRINT_SPOOK_RADIUS = 30;
export const HUNT_SPRINT_NERVE_MULT = 1.6;

/** Properties whose 3D presentation keeps birds in the authored world after a
 * flush. The renderer can show a flight and a landing, so the shared sim must
 * retain that landing for the next dog-led search instead of using the old
 * scene-cut relight rule. */
export function isSpatialEncounterArea(areaId: string): boolean {
  return huntingDoctrine(areaId).spatialEncounter;
}

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
  obstacles?: DogEnv['obstacles'];
  movementScale?: number;
  maxTravelSpeed?: number;
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
  challenge?: HuntChallenge;
  hunt: HuntState;
  dogs: Dog[];
  area: AreaConfig;
  rng?: RNG;
  /** Continuous scenes explicitly let a steady dog watch its covey's flight. */
  continuousEncounter?: boolean;
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
  private readonly continuousEncounter: boolean;
  private readonly challenge: HuntChallenge;
  /** One shared, renderer-neutral ground sampler for dog cover decisions. */
  private readonly landscape: LandscapeModel;
  private readonly dogSurface: GroundSample = {
    height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0,
  };
  private readonly escapeLandings = new Map<number, Vec2>();
  private readonly activeRises = new Map<number, Extract<HuntSimulationEvent, { type: 'covey-flushed' }>>();

  constructor(config: HuntSimulationConfig) {
    this.hunt = config.hunt;
    this.dogs = config.dogs;
    this.area = config.area;
    this.rng = config.rng ?? Math.random;
    this.continuousEncounter = config.continuousEncounter ?? false;
    this.challenge = config.challenge ?? 'balanced';
    this.landscape = new LandscapeModel(this.area);
    this.previousDogStates = this.dogs.map((dog) => dog.state);
  }

  update(dtMs: number, input: HuntSimulationInput): HuntSimulationEvent[] {
    const events: HuntSimulationEvent[] = [];
    const leadDog = this.dogs[0];
    if (!leadDog) return events;
    // The input position is the hunter after this adapter's movement for the
    // tick. Keep this derived from the shared position seam so 2D tap-walk
    // and 3D camera locomotion get the same underfoot behavior without a new
    // control or renderer-specific rule.
    const hunterMoved = dist(input.hunterPos, this.hunt.hunterPos) > 0.01;
    const doctrine = huntingDoctrine(this.area.id);
    const spatialEncounter = this.continuousEncounter && doctrine.spatialEncounter;
    const huntStyle = doctrine.style;

    updateBirds(dtMs, this.hunt.birds, leadDog.pos, {
      bounds: this.area.world,
      patches: this.area.patches,
      slopeAngle: this.area.slope,
      // Routes are part of the area’s hunting language, not a 3D-only
      // presentation detail. Keep runner birds on the same authored edge,
      // wash, bench, or timber line in both adapters.
      trails: this.area.trails,
      holdBobwhiteCoveys: this.continuousEncounter && doctrine.style === 'quail',
      holdCoveys: this.continuousEncounter,
      runnerStyle: doctrine.runnerStyle,
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
        trails: this.area.trails,
        coverAffinity: (point) => this.coverAffinity(point),
        huntStyle,
        huntAreaId: this.area.id,
        slopeAngle: this.area.slope,
        movementScale: motion?.movementScale,
        maxTravelSpeed: motion?.maxTravelSpeed,
        rangeRadius: motion?.rangeRadius,
        workAnchor: motion?.workAnchor,
        obstacles: motion?.obstacles,
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

    // Short-sighted timber birds can flush underfoot while the hunter is
    // walking, even when the dog has not yet made a point. A pointed bird is
    // left for the ordinary proximity/nerve path so the dog still earns the
    // flush credit. This is deliberately evaluated before point pressure and
    // only for a quiet walk; sprinting already uses the louder map-specific
    // spook radius below.
    if (hunterMoved && !input.hunterRunning) {
      const pointedIds = this.dogs
        .map((dog) => dog.pointedBirdId)
        .filter((id): id is number => id !== null);
      const disturbed = birdsDisturbedByHunter(this.hunt.birds, this.hunt.hunterPos, true, pointedIds);
      if (disturbed.length > 0) {
        const event = this.flushBird(disturbed[0].id, 'spook', null);
        if (event) events.push(event);
        return events;
      }
    }

    if (input.hunterRunning) {
      const spooked = birdsSpookedBy(
        this.hunt.birds,
        this.hunt.hunterPos,
        doctrine.hunterSpookRadius ?? HUNT_SPRINT_SPOOK_RADIUS,
      );
      if (spooked.length > 0) {
        const event = this.flushBird(spooked[0].id, 'spook', null);
        if (event) events.push(event);
        return events;
      }
    }

    for (let i = 0; i < this.dogs.length; i++) {
      const dog = this.dogs[i];
      if (dog.state !== 'pointing') continue;
      let nerveMult = dog.pressure * (input.hunterRunning ? doctrine.sprintNerveMult ?? HUNT_SPRINT_NERVE_MULT : 1);
      nerveMult *= doctrine.pointNerveMult;
      const pointed = this.hunt.birds.find((bird) => bird.id === dog.pointedBirdId);
      if (pointed) {
        const species = getSpecies(pointed.speciesId);
        nerveMult *= species.pointNerveMult ?? 1;
        const coveyApproach = spatialEncounter && species.coveyApproach === true;
        if (coveyApproach) {
          nerveMult *= quailPointApproach(pointed.coveyId, dog.pressure, !!input.hunterRunning).nerveScale;
        }
        nerveMult *= slopeNerveMult(this.birdSlopeApproach(pointed));
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
      const species = bird ? getSpecies(bird.speciesId) : undefined;
      const coveyApproach = spatialEncounter && species?.coveyApproach === true;
      const radius = bird && coveyApproach
        ? quailPointApproach(bird.coveyId, dog.pressure, !!input.hunterRunning).flushRadius * HUNT_CHALLENGES[this.challenge].approach * (species?.pointRadiusMult ?? 1)
        : doctrine.pointRadius * (species?.pointRadiusMult ?? 1);
      const trigger = bird && coveyApproach
        ? this.hunt.birds.filter(candidate => candidate.state === 'hidden' && candidate.coveyId === bird.coveyId)
          .sort((a,b)=>dist(this.hunt.hunterPos,a.pos)-dist(this.hunt.hunterPos,b.pos))[0]
        : bird;
      if (trigger?.state === 'hidden' && dist(this.hunt.hunterPos, trigger.pos) <= radius) {
        const event = this.flushBird(trigger.id, 'proximity', i);
        if (event) events.push(event);
        return events;
      }
    }

    return events;
  }

  private coverAffinity(point: Vec2): number {
    this.landscape.surfaceAtProperty(point.x, point.y, this.dogSurface);
    return huntHabitatAffinity(huntingDoctrine(this.area.id), this.dogSurface);
  }

  private birdSlopeApproach(bird: Bird): SlopeApproach | null {
    const species = getSpecies(bird.speciesId);
    if (!this.continuousEncounter) {
      return speciesSlopeApproach(species, this.area.slope, this.hunt.hunterPos, bird.pos);
    }
    if (species?.flightDirection !== 'downhill') return null;
    const hunter = this.hunt.hunterPos;
    const elevation = this.landscape.heightAtProperty(hunter.x, hunter.y)
      - this.landscape.heightAtProperty(bird.pos.x, bird.pos.y);
    // Ignore small surface undulations and near-level traverses. Elevations
    // are meters, while simulation positions are property units.
    const levelBand = Math.max(1, dist(hunter, bird.pos) * PROPERTY_PX_TO_M * .05);
    return elevation > levelBand ? 'above' : elevation < -levelBand ? 'below' : 'level';
  }

  flushBird(
    birdId: number,
    cause: FlushCause,
    pointingSlot: number | null,
  ): Extract<HuntSimulationEvent, { type: 'covey-flushed' }> | null {
    const bird = this.hunt.birds.find((candidate) => candidate.id === birdId);
    if (!bird || bird.state !== 'hidden') return null;
    const spatialEncounter = this.continuousEncounter && huntingDoctrine(this.area.id).spatialEncounter;
    const hunterDistance = dist(this.hunt.hunterPos, bird.pos);
    const pointed = pointingSlot !== null ? this.hunt.birds.find(candidate=>candidate.id===this.dogs[pointingSlot]?.pointedBirdId) : undefined;
    const pointCredit =
      pointingSlot !== null &&
      (cause === 'proximity' || cause === 'nerve') &&
      (pointed?.id === bird.id || (this.continuousEncounter && huntingDoctrine(this.area.id).spatialEncounter && pointed?.coveyId === bird.coveyId));
    if (pointCredit) this.hunt.dogWork[pointingSlot].pointFlushes++;

    const flushed = flushCovey(this.hunt.birds, bird.id);
    for (const dog of this.dogs) dog.onFlush(this.rng, bird.pos, spatialEncounter ? flushed.map(b => b.id) : undefined);
    const event: Extract<HuntSimulationEvent, { type: 'covey-flushed' }> = {
      type: 'covey-flushed',
      cause,
      birdId: bird.id,
      birdIds: flushed.map((candidate) => candidate.id),
      hunterDistance,
      pointingSlot,
      pointCredit,
      slopeApproach: this.birdSlopeApproach(bird),
    };
    this.activeRises.set(event.birdId, event);
    return event;
  }

  resolveBird(birdId: number, outcome: 'downed' | 'escaped', landing?: Vec2): boolean {
    const bird = this.hunt.birds.find((candidate) => candidate.id === birdId);
    if (!bird || bird.state !== 'flushed') return false;
    bird.state = outcome;
    if (outcome === 'downed') {
      this.hunt.downed++;
      if (bird.sex === 'hen') this.hunt.henDowns++;
    } else {
      this.hunt.escaped++;
      if (landing && this.continuousEncounter && huntingDoctrine(this.area.id).spatialEncounter) {
        this.escapeLandings.set(birdId, { ...landing });
      }
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
    bird.fallPending = false;
    return true;
  }

  /**
   * Close a rise once its presentation has settled. Scoring and
   * relights belong here so both shooting adapters produce identical hunt
   * outcomes even though one is a scene cut and the other stays in-world.
   */
  finishRise(options: { relight?: boolean; birdId?: number } = {}): RiseResolution | null {
    // The scene-cut adapter has one pending covey. A continuous adapter may
    // settle a later covey first; explicit identity must not consume another.
    const rise = options.birdId === undefined
      ? this.activeRises.values().next().value
      : [...this.activeRises.values()].find(candidate => candidate.birdIds.includes(options.birdId!));
    if (!rise) return null;
    const spatialEncounter = this.continuousEncounter && huntingDoctrine(this.area.id).spatialEncounter;
    const doctrine = huntingDoctrine(this.area.id);

    // A Hun rise is allowed to circle back only after its visible flight has
    // settled. Doing the reland here, at the simulation seam, keeps the rule
    // attached to the specific active rise even when two coveys overlap in
    // the presentation queue. Relanded birds were counted as escaped when
    // they touched down, so remove that temporary loss before scoring.
    let circledIds = new Set<number>();
    if (spatialEncounter && doctrine.circleBack && rise.hunterDistance > HUNT_SHOT_RANGE) {
      const relanded = circleBack(
        this.hunt.birds,
        rise.birdIds,
        this.area.world,
        this.rng,
        windMults(this.hunt.windStrength).nerve * conditionMults(this.hunt.condition).nerve,
        {
          returnTrail: this.area.trails.find((trail) => trail.id === 'circleback-return'),
          patches: this.area.patches,
        },
      );
      if (relanded.length > 0) {
        this.hunt.escaped = Math.max(0, this.hunt.escaped - relanded.length);
        circledIds = new Set(relanded.map((bird) => bird.id));
      }
    }

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

    const relit = options.relight === false || circledIds.size > 0
      ? []
      : relightSurvivors(
          this.hunt.birds,
          escapedIds,
          this.area.world,
          this.rng,
          windMults(this.hunt.windStrength).nerve * (spatialEncounter ? HUNT_CHALLENGES[this.challenge].nerve : 1),
          this.area.patches,
          spatialEncounter ? this.escapeLandings : undefined,
        );
    this.hunt.escaped -= relit.length;
    for (const id of rise.birdIds) this.escapeLandings.delete(id);
    this.activeRises.delete(rise.birdId);
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
