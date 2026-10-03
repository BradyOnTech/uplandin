import { bagCount, bagRuleFor, limitsApply } from './bagLimits';
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
import { Dog, WHISTLE_RANGE, type CommandResponse, type DogEnv, type DogLogEvent, type DogState, type HandlerCommand, type HandlerCommandKind } from './dog';
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
import { bobwhiteApproachNerveScale, quailPointApproach } from './quailApproach';
import { coveyRoll, HELD_SINGLE_FLUSH_RADIUS, heldSingles, SECOND_BIRD, TIGHT_COVEY_NERVE_SCALE, tightCovey, tightCoveyRadius } from './closeFlush';
import { pheasantApproach } from './pheasantApproach';
import { openCountryPointRadius, pointWalkInAllowanceMs, usesOpenCountryWalkIn } from './openCountryApproach';
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

/** `startle`: a second pheasant breaking a beat after the first went up. */
export type FlushCause = 'proximity' | 'nerve' | 'bump' | 'scent' | 'spook' | 'startle';

/** Wounded birds run at a walking pace, slower than any dog. */
export const CRIPPLE_SPEED = 1.3 / PROPERTY_PX_TO_M;
export const CRIPPLE_RUN_MS = 7_000;
/** How far a dog can see a bird come down in open cover, and in cattails. */
const FALL_SIGHT = 45;
const FALL_SIGHT_HEAVY_COVER = 22;

export type HuntSimulationEvent =
  | { type: 'dog-pointed'; dogIndex: number; birdId: number }
  | { type: 'command'; kind: HandlerCommandKind; responses: CommandResponse[] }
  | { type: 'dog-note'; dogIndex: number; kind: DogLogEvent['kind']; birdId?: number }
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
  /** Convert the short-session work clock without changing scent/point clocks. */
  effortScale?: number;
  maxTravelSpeed?: number;
  retrieveTurnRate?: number;
  rangeRadius?: number;
  workAnchor?: Vec2;
}

export interface HuntSimulationInput {
  /** Hunter position after this tick's adapter-specific movement. */
  hunterPos: Vec2;
  /** Where a dog presents a retrieved bird: just in front of the hunter. */
  deliveryPos?: Vec2;
  hunterRunning?: boolean;
  recall?: boolean;
  whistleRange?: number;
  /** Hold the finished dog at heel while its hawk flies or holds quarry. */
  holdDogs?: boolean;
  guardRaptor?: Vec2;
  /** Presentation-scale movement overrides; gameplay rules stay internal. */
  dogMotion?: readonly HuntDogMotion[];
  /** Handler commands given this tick, in order. */
  commands?: readonly HandlerCommand[];
}

/** Share of the legacy bird-winds-dog radius that applies in the open field. */
const FIELD_BIRD_WINDS_DOG_SCALE = .5;

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
  /** Covey-owned and never replenished by a re-point or a second dog. */
  private readonly pointWalkIns = new Map<number, { remainingMs: number; revision: number; protectedMs: number }>();
  private pointWalkInRevision = 0;
  /** Simulation clock, ms. */
  private clockMs = 0;
  /** Second pheasants that break a beat after the first (closeFlush.ts). */
  private readonly startles: { birdId: number; atMs: number }[] = [];

  constructor(config: HuntSimulationConfig) {
    this.hunt = config.hunt;
    this.dogs = config.dogs;
    this.area = config.area;
    this.rng = config.rng ?? Math.random;
    this.continuousEncounter = config.continuousEncounter ?? false;
    this.challenge = config.challenge ?? 'balanced';
    // A Loaded field is a preserve day on released birds: no daily limit.
    if (this.challenge === 'loaded') this.hunt.preserve = true;
    this.landscape = new LandscapeModel(this.area);
    this.previousDogStates = this.dogs.map((dog) => dog.state);
  }

  update(dtMs: number, input: HuntSimulationInput): HuntSimulationEvent[] {
    const events: HuntSimulationEvent[] = [];
    const leadDog = this.dogs[0];
    if (!leadDog) return events;
    this.pointWalkInRevision++;
    this.clockMs += Math.max(0, dtMs);
    // The input position is the hunter after this adapter's movement for the
    // tick. Keep this derived from the shared position seam so 2D tap-walk
    // and 3D camera locomotion get the same underfoot behavior without a new
    // control or renderer-specific rule.
    const hunterMoved = dist(input.hunterPos, this.hunt.hunterPos) > 0.01;
    const doctrine = huntingDoctrine(this.area.id);
    const spatialEncounter = this.continuousEncounter && doctrine.spatialEncounter;
    const huntStyle = doctrine.style;
    // The 2D scene handles cast-off itself. Continuous play uses the same
    // whistle once the pack is at heel, without immediately recalling it.
    const castOff = this.continuousEncounter && !input.holdDogs && !input.guardRaptor && input.recall && this.dogs.every(dog => dog.state === 'heel');
    if (castOff) for (const dog of this.dogs) dog.castOff();
    for (const command of input.commands ?? []) {
      const responses = this.dogs.map(dog => dog.command(command, this.hunt.birds, input.hunterPos, input.whistleRange ?? WHISTLE_RANGE));
      events.push({ type: 'command', kind: command.kind, responses });
    }
    if (spatialEncounter) this.stepCripples(dtMs, input.hunterPos);

    updateBirds(dtMs, this.hunt.birds, leadDog.pos, {
      worldScale: spatialEncounter,
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
      hunterPos: spatialEncounter ? input.hunterPos : undefined,
    });

    const wind = windMults(this.hunt.windStrength);
    const weather = conditionMults(this.hunt.condition);
    for (let i = 0; i < this.dogs.length; i++) {
      const dog = this.dogs[i];
      const packmate = this.dogs.find((candidate, j) => j !== i && candidate.state === 'pointing');
      const retrievedBefore = this.hunt.birds.filter((bird) => bird.state === 'retrieved').length;
      const motion = input.dogMotion?.[i];
      const env: DogEnv = {
        // Read current claims each dog tick so a newly chosen fall is already
        // reserved for later packmates in this same simulation update.
        reservedRetrieveIds: this.dogs.flatMap((other, index) => {
          const id = other.reservedRetrieveId();
          return index !== i && id !== null ? [id] : [];
        }),
        // The mouth sits forward of the dog root; leave room to settle at
        // the fall and beside the handler without demanding center overlap.
        pickupRange: spatialEncounter ? .65 / PROPERTY_PX_TO_M : undefined,
        // Presented in front of the hunter, the dog arrives on its spot; it
        // otherwise delivers anywhere within a metre of him.
        deliveryRange: spatialEncounter ? (input.deliveryPos ? .22 : 1) / PROPERTY_PX_TO_M : undefined,
        deliveryHoldMs: spatialEncounter ? 900 : undefined,
        deliveryPos: spatialEncounter ? input.deliveryPos : undefined,
        recallArriveRange: spatialEncounter ? 1.5 / PROPERTY_PX_TO_M : undefined,
        heelFollowRange: spatialEncounter ? 2 / PROPERTY_PX_TO_M : undefined,
        hunterPos: this.hunt.hunterPos,
        holdForRaptor: input.holdDogs,
        guardRaptor: input.guardRaptor,
        windAngle: this.hunt.wind,
        scentMult: wind.scent * weather.scent,
        recall: !castOff && (input.recall ?? false),
        whistleRange: input.whistleRange,
        honorPoint: packmate?.pos,
        drainMult: weather.stamina * (motion?.effortScale ?? 1),
        searchMult: weather.search,
        patches: this.area.patches,
        trails: this.area.trails,
        coverAffinity: (point) => this.coverAffinity(point),
        huntStyle,
        huntAreaId: this.area.id,
        slopeAngle: this.area.slope,
        movementScale: motion?.movementScale,
        maxTravelSpeed: motion?.maxTravelSpeed,
        retrieveTurnRate: motion?.retrieveTurnRate,
        rangeRadius: motion?.rangeRadius,
        // Leave room to road in on a runner, then wait for the handler.
        // Existing points can finish; concealed birds keep moving normally.
        trackingRange: spatialEncounter && huntStyle === 'pheasant' ? 48 / PROPERTY_PX_TO_M : undefined,
        // A few metres of relocation warrants observable re-establishment,
        // while tiny runner steps must not flicker an otherwise steady point.
        pointRelocationRange: spatialEncounter && huntStyle === 'pheasant' ? 3 / PROPERTY_PX_TO_M : undefined,
        workAnchor: motion?.workAnchor,
        obstacles: motion?.obstacles,
      };
      dog.update(dtMs, this.hunt.birds, env);
      this.hunt.dogsPos[i] = { ...dog.pos };
      this.readDogLog(i, events);

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
          // The open field's dogs wind birds at tens of yards, so they come
          // closer to sitting birds than the old long-reach dogs did; a
          // bird only catches a young dog's scent when it is nearly on it.
          dogScentRadius(dog.level) * wind.dogScent * (spatialEncounter ? FIELD_BIRD_WINDS_DOG_SCALE : 1),
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

    // A second pheasant breaks a beat after the first, while the gun is
    // still on the first bird.
    for (let i = 0; i < this.startles.length; i++) {
      const startle = this.startles[i];
      if (startle.atMs > this.clockMs) continue;
      this.startles.splice(i, 1);
      const event = this.flushBird(startle.birdId, 'startle', null);
      if (event) { events.push(event); return events; }
      i--;
    }

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
      if (spatialEncounter) {
        // Even a runner can sit at a cover end or during its recovery. A
        // hunter who reaches the actual bird can put it up without a point.
        disturbed.push(...this.hunt.birds.filter(bird => bird.state === 'hidden'
          && bird.speciesId === 'ringneck' && !pointedIds.includes(bird.id)
          && dist(bird.pos, this.hunt.hunterPos) <= Math.min(5.5,
            pheasantApproach(bird.id, 0, false, bird.approachRoll).flushRadius)
            * HUNT_CHALLENGES[this.challenge].approach));
        // A covey bird that held when the rest went up sits until the hunter
        // walks right up on it.
        disturbed.push(...this.hunt.birds.filter(bird => bird.state === 'hidden' && bird.heldSingle
          && !pointedIds.includes(bird.id)
          && dist(bird.pos, this.hunt.hunterPos) <= HELD_SINGLE_FLUSH_RADIUS * HUNT_CHALLENGES[this.challenge].approach));
        disturbed.sort((a, b) => dist(a.pos, this.hunt.hunterPos) - dist(b.pos, this.hunt.hunterPos) || a.id - b.id);
      }
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
        if (spatialEncounter && species.id === 'ringneck') {
          nerveMult *= pheasantApproach(pointed.id, dist(this.hunt.hunterPos, pointed.pos), !!input.hunterRunning, pointed.approachRoll).nerveScale;
        }
        const coveyApproach = spatialEncounter && species.coveyApproach === true;
        // A tight covey lets the hunter walk right in.
        if (spatialEncounter && !input.hunterRunning && tightCovey(species.id, coveyRoll(this.hunt.birds, pointed.coveyId))) nerveMult *= TIGHT_COVEY_NERVE_SCALE;
        if (coveyApproach) {
          nerveMult *= quailPointApproach(pointed.coveyId, dog.pressure, !!input.hunterRunning, this.challenge).nerveScale;
          // Bobwhite's close covey walk-in must account for field-scale
          // travel. Other covey species keep their own warier approach.
          if (species.id === 'bobwhite') nerveMult *= bobwhiteApproachNerveScale(
            dist(this.hunt.hunterPos, pointed.pos) * PROPERTY_PX_TO_M,
            !!input.hunterRunning,
            this.challenge,
          );
        }
        nerveMult *= slopeNerveMult(this.birdSlopeApproach(pointed));
        if (isFlanking(this.hunt.hunterPos, dog.pos, pointed.pos)) nerveMult *= FLANK_NERVE_MULT;
        if (spatialEncounter && usesOpenCountryWalkIn(species.id)) {
          let walkIn = this.pointWalkIns.get(pointed.coveyId);
          if (!walkIn) {
            const radius = openCountryPointRadius(species.id, doctrine.pointRadius * (species.pointRadiusMult ?? 1), this.challenge, false);
            walkIn = { remainingMs: pointWalkInAllowanceMs(dist(this.hunt.hunterPos, pointed.pos) * PROPERTY_PX_TO_M, radius, this.challenge), revision: -1, protectedMs: 0 };
            this.pointWalkIns.set(pointed.coveyId, walkIn);
          }
          // A world-space cast may leave several walking seconds between
          // handler and point. Spend its allowance once per simulation tick,
          // including while running; running still burns normal nerve.
          if (walkIn.revision !== this.pointWalkInRevision) {
            walkIn.protectedMs = Math.min(walkIn.remainingMs, Math.max(0, dtMs));
            walkIn.remainingMs -= walkIn.protectedMs;
            walkIn.revision = this.pointWalkInRevision;
          }
          if (!input.hunterRunning && dtMs > 0) nerveMult *= 1 - walkIn.protectedMs / dtMs;
        }
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
      const tight = !!bird && !!species && spatialEncounter && species.flushAsCovey !== false && !input.hunterRunning && tightCovey(species.id, coveyRoll(this.hunt.birds, bird.coveyId));
      const radius = tight
        ? tightCoveyRadius(species!.id, coveyRoll(this.hunt.birds, bird!.coveyId)) * HUNT_CHALLENGES[this.challenge].approach
        : bird && coveyApproach
        ? quailPointApproach(bird.coveyId, dog.pressure, !!input.hunterRunning).flushRadius * HUNT_CHALLENGES[this.challenge].approach * (species?.pointRadiusMult ?? 1)
        : bird && spatialEncounter && species?.id === 'ringneck'
          ? pheasantApproach(bird.id, dist(this.hunt.hunterPos, bird.pos), !!input.hunterRunning, bird.approachRoll).flushRadius * HUNT_CHALLENGES[this.challenge].approach
          : species && spatialEncounter && usesOpenCountryWalkIn(species.id)
            ? openCountryPointRadius(species.id, doctrine.pointRadius * (species.pointRadiusMult ?? 1), this.challenge, !!input.hunterRunning)
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
    const species = getSpecies(bird.speciesId);
    if (spatialEncounter && species.flushAsCovey !== false && !bird.heldSingle && flushed.length > 1) {
      // One or two birds of a covey may hold when the rest go up. They are
      // the farthest from the bird that broke, and stay where they sat.
      const roll = (Math.imul(bird.id + 1, 2246822519) >>> 0) / 0xffffffff;
      const held = heldSingles(species.id, flushed.length, roll, tightCovey(species.id, coveyRoll(this.hunt.birds, bird.coveyId)));
      const keep = flushed.filter(candidate => candidate.id !== bird.id)
        .sort((a, b) => dist(b.pos, bird.pos) - dist(a.pos, bird.pos) || a.id - b.id).slice(0, held);
      for (const single of keep) {
        single.state = 'hidden'; single.heldSingle = true;
        flushed.splice(flushed.indexOf(single), 1);
      }
    }
    if (spatialEncounter && species.id === 'ringneck') {
      // Another pheasant holding close by may break a beat later.
      const neighbour = this.hunt.birds.filter(candidate => candidate.state === 'hidden' && candidate.speciesId === 'ringneck'
        && !this.startles.some(startle => startle.birdId === candidate.id) && dist(candidate.pos, bird.pos) <= SECOND_BIRD.reach)
        .sort((a, b) => dist(a.pos, bird.pos) - dist(b.pos, bird.pos) || a.id - b.id)[0];
      const roll = (Math.imul(bird.id + 7, 3266489917) >>> 0) / 0xffffffff;
      if (neighbour && roll < SECOND_BIRD.chance) {
        this.startles.push({ birdId: neighbour.id, atMs: this.clockMs + SECOND_BIRD.minMs + roll / SECOND_BIRD.chance * (SECOND_BIRD.maxMs - SECOND_BIRD.minMs) });
      }
    }
    this.dogs.forEach((dog, index) => {
      dog.onFlush(this.rng, bird.pos, spatialEncounter ? flushed.map(b => b.id) : undefined);
      this.readDogLog(index);
    });
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

  /** Launch classification belongs to the actual rise, including wild
   * scent/spook rises. Keep it available while other coveys overlap. */
  riseSlopeApproach(birdId: number): SlopeApproach | null {
    for (const rise of this.activeRises.values()) {
      if (rise.birdIds.includes(birdId)) return rise.slopeApproach;
    }
    return null;
  }

  /** A bound quarry belongs to the hawk until the handler makes in. */
  bindQuarry(birdId: number, position: Vec2): boolean {
    const bird = this.bird(birdId);
    if (this.hunt.huntingMethod !== 'goshawk' || bird?.state !== 'flushed') return false;
    bird.state = 'held'; bird.pos = { ...position };
    this.hunt.downed++;
    return true;
  }

  recoverQuarry(birdId: number): boolean {
    const bird = this.bird(birdId);
    if (this.hunt.huntingMethod !== 'goshawk' || bird?.state !== 'held') return false;
    bird.state = 'retrieved';
    return true;
  }

  resolveBird(birdId: number, outcome: 'downed' | 'escaped', landing?: Vec2, options: { wounded?: boolean } = {}): boolean {
    const bird = this.hunt.birds.find((candidate) => candidate.id === birdId);
    if (!bird || bird.state !== 'flushed') return false;
    bird.state = outcome;
    if (outcome === 'downed') {
      if (options.wounded) { bird.wounded = true; bird.woundRunMs = CRIPPLE_RUN_MS; }
      this.hunt.downed++;
      if (bird.sex === 'hen') this.hunt.henDowns++;
      else if (limitsApply(this.hunt)) {
        // Past the limit is a violation, whatever happens to the bird next.
        const limit = bagRuleFor(this.hunt.areaId, bird.speciesId);
        if (limit && bagCount(this.hunt, limit) > limit.limit) this.hunt.overLimit = (this.hunt.overLimit ?? 0) + 1;
      }
    } else {
      this.hunt.escaped++;
      if (landing && this.continuousEncounter && huntingDoctrine(this.area.id).spatialEncounter) {
        this.escapeLandings.set(birdId, { ...landing });
      }
    }
    return true;
  }

  /**
   * A second shot into a bird already counted down, while it is still coming
   * down: a wing-tipped bird is anchored dead and will not run on landing.
   */
  anchorBird(birdId: number): boolean {
    const bird = this.hunt.birds.find((candidate) => candidate.id === birdId);
    if (!bird || bird.state !== 'downed' || !bird.fallPending) return false;
    bird.wounded = false;
    bird.woundRunMs = 0;
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
    bird.fallPos = { ...position };
    bird.fallPending = false;
    // In the continuous field a dog only knows a fall it saw: one it was
    // marking, or one that came down in view of a dog not busy chasing or
    // already fetching. Heavy cattail cover hides more of them.
    if (this.continuousEncounter && huntingDoctrine(this.area.id).spatialEncounter) {
      const sight = huntingDoctrine(this.area.id).style === 'pheasant' ? FALL_SIGHT_HEAVY_COVER : FALL_SIGHT;
      bird.marked = this.dogs.some(dog => dog.watchedBirdIds().includes(birdId)
        || (dog.state !== 'breaking' && dog.state !== 'retrieving' && dist(dog.pos, position) <= sight));
    }
    return true;
  }

  /** Wounded birds run from the nearest pursuer for a few seconds, then tuck in. */
  private stepCripples(dtMs: number, hunter: Vec2): void {
    for (const bird of this.hunt.birds) {
      if (bird.state !== 'downed' || !bird.wounded || bird.fallPending || !(bird.woundRunMs! > 0)) continue;
      bird.woundRunMs = Math.max(0, bird.woundRunMs! - dtMs);
      let threat = hunter, nearest = dist(bird.pos, hunter);
      for (const dog of this.dogs) {
        const d = dist(bird.pos, dog.pos);
        if (d < nearest) { nearest = d; threat = dog.pos; }
      }
      if (nearest < 1) { bird.woundRunMs = 0; continue; }
      const away = Math.atan2(bird.pos.y - threat.y, bird.pos.x - threat.x);
      const step = CRIPPLE_SPEED * dtMs / 1000;
      const w = this.area.world;
      bird.pos = {
        x: Math.max(w.x + 4, Math.min(w.x + w.w - 4, bird.pos.x + Math.cos(away) * step)),
        y: Math.max(w.y + 4, Math.min(w.y + w.h - 4, bird.pos.y + Math.sin(away) * step)),
      };
    }
  }

  /** Move a dog's reported work into the hunt tally; surface the notable moments. */
  private readDogLog(index: number, events?: HuntSimulationEvent[]): void {
    const dog = this.dogs[index], work = this.hunt.dogWork[index];
    if (!dog || !work) { dog?.log.splice(0); return; }
    for (const entry of dog.log.splice(0)) {
      const add = (key: keyof typeof work) => { (work[key] as number) = ((work[key] as number | undefined) ?? 0) + 1; };
      switch (entry.kind) {
        case 'point': add('points'); break;
        case 'back': add('backs'); break;
        case 'break': add('breaks'); break;
        case 'bump': add('bumps'); break;
        case 'creep': add('creeps'); break;
        case 'relocated': add('relocations'); break;
        case 'unproductive': add('unproductive'); break;
        case 'dead-found': add('deadFinds'); break;
        case 'dead-lost': add('deadMisses'); break;
        case 'command':
          if (entry.response === 'out-of-earshot') add('unheard');
          else if (entry.response !== 'busy') add('commands');
          if (entry.response === 'steadied') add('whoas');
          continue;
      }
      events?.push({ type: 'dog-note', dogIndex: index, kind: entry.kind, birdId: entry.birdId });
    }
  }

  /** The adapter judged a shot unsafe; it counts against the hunter. */
  recordShotSafety(kind: 'low' | 'dog-in-line'): void {
    this.hunt.safety ??= { lowShots: 0, dogInLine: 0 };
    if (kind === 'low') this.hunt.safety.lowShots++; else this.hunt.safety.dogInLine++;
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
      if (bird?.state === 'downed' || bird?.state === 'carried' || bird?.state === 'held' || bird?.state === 'retrieved') {
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
