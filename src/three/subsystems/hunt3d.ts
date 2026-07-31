import { getArea, type AreaConfig } from '../../game/areas';
import { flushCovey, updateBirds } from '../../game/birds';
import { getBreed } from '../../game/breeds';
import { conditionMults } from '../../game/conditions';
import { Dog, type DogEnv } from '../../game/dog';
import { dist, mulberry32 } from '../../game/math';
import { createHunt, type HuntState } from '../../game/state';
import type { Vec2 } from '../../game/types';
import { windMults } from '../../game/wind';
import type { Ctx, Subsystem } from '../engine';

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

/** The one sim dog this phase: a finished English Setter, level 8. */
const DOG_BREED = 'english-setter';
const DOG_LEVEL = 8;

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
  /** Preallocated env — same object every tick, hunterPos aliased into it. */
  private dogEnv!: DogEnv;
  private simMsLast = 0;
  private simMsMax = 0;
  private simMsTotal = 0;
  private simTicks = 0;
  private budgetWarned = false;
  /** Flush dice (Dog.onFlush steadiness roll) — own deterministic stream. */
  private flushRng: () => number = mulberry32(FLUSH_SEED);
  /** The most recent covey rise: ids + the walk-in distance that earned it. */
  private lastFlush: { ids: number[]; distPx: number } | null = null;

  init(ctx: Ctx): void {
    this.frozen = new URLSearchParams(location.search).has('capture');

    this.area = getArea('quail-fields');
    this.simCx = this.area.world.x + this.area.world.w / 2;
    this.simCy = this.area.world.y + this.area.world.h / 2;

    // Fixed-seed hunt. Wind/condition pinned too: the capture light rig and
    // the critics' verdicts must not re-roll under a sim tweak upstream.
    this.hunt = createHunt(this.area, mulberry32(HUNT_SEED), {
      wind: 'breezy',
      condition: 'frost', // frost mornings are the good days
    });
    this.simDog = new Dog(
      { ...this.hunt.dogsPos[0] },
      { breed: getBreed(DOG_BREED), level: DOG_LEVEL },
      mulberry32(DOG_SEED),
      this.area.world,
    );

    // Static env pieces (wind and weather are constant for a hunt).
    const wind = windMults(this.hunt.windStrength);
    const weather = conditionMults(this.hunt.condition);
    this.dogEnv = {
      hunterPos: this.hunt.hunterPos, // aliased: tick() writes it in place
      windAngle: this.hunt.wind,
      scentMult: wind.scent * weather.scent,
      recall: false,
      honorPoint: undefined,
      drainMult: weather.stamina,
      searchMult: weather.search,
      patches: this.area.patches,
    };

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

    // Exactly the FieldScene consumption order: birds move, then the dog.
    updateBirds(dtMs, this.hunt.birds, this.simDog.pos, {
      bounds: this.area.world,
      patches: this.area.patches,
      slopeAngle: this.area.slope,
    });
    this.simDog.update(dtMs, this.hunt.birds, this.dogEnv);
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
      if (this.simDog.state !== 'pointing' || bird.state !== 'hidden') return null;
    }
    if (dist(this.hunt.hunterPos, bird.pos) > FLUSH_RADIUS_PX) return null;

    const distPx = dist(this.hunt.hunterPos, bird.pos);
    const flushed = flushCovey(birds, bird.id);
    // Steady dogs stand through the rise; soft ones break — sim's call.
    this.simDog.onFlush(this.flushRng, bird.pos);
    this.lastFlush = { ids: flushed.map((b) => b.id), distPx };
    return this.lastFlush;
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

  /** Sim tick cost (ms): last / worst / mean. Capture prints these. */
  simMs(): { last: number; max: number; avg: number } {
    return {
      last: this.simMsLast,
      max: this.simMsMax,
      avg: this.simTicks > 0 ? this.simMsTotal / this.simTicks : 0,
    };
  }
}
