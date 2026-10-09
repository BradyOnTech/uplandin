/**
 * The rise score: Duck Hunt rules the sky over a real covey.
 *
 * The simulation flushes a covey as a unit (birds.ts flushCovey): every bird
 * that rose is `flushed`, the dog marks them all, and the cover erupts and the
 * wing thunder is sized to all of them. The sky, though, holds at most
 * SKY_MAX live targets at once. The rest of the covey waits in the cover,
 * queued, and rises in waves when the sky clears in Duck Hunt terms (every
 * bird of the last wave is down, past effective range, or the wave has had
 * its few seconds), or when the gun has been fired dry and reloaded; never
 * into an empty gun except for the sleeper, which waits for exactly that.
 *
 * Bird states across a rise:
 * - queued: `flushed` in the simulation, still in the cover. Not drawn, not a
 *   target, never in the bag or the escaped tally. The dog stays marking.
 * - holding the sky (holdsSky): launching or flying, inside effective range
 *   of the hunter, within WAVE_MAX_GAP_MS of its wave's rise. All coveys share
 *   the one cap of SKY_MAX.
 * - leaving: still flying, but out of the shot; it drives off-screen or sets
 *   down in visible cover (game/flightLine.ts), and holds nothing back.
 * - settled: downed, or escaped when it leaves the shot or lands.
 * The rise settles (finishRise) only when nothing is queued or in the air.
 *
 * Pure and deterministic: callers supply the clock, the sky count, the gun
 * and a seeded stream.
 */

/** At most this many live targets hold the sky at once, across every covey. */
export const SKY_MAX = 3;
/** Effective range, metres from the hunter: a bird beyond it is out of the shot. */
export const RISE_RANGE_M = 40;
/** A wave holds the sky this long at most; then the next may rise. */
export const WAVE_MAX_GAP_MS = 2000;
/** A bird leaving the shot still counts against the cap until it is this far
 * from the hunter, metres, so the sky never shows six. */
export const LEAVING_RANGE_M = 55;

/** Is this bird a live target in the shot: launching or flying, inside
 * effective range? No more than SKY_MAX ever are, whatever their waves' clocks. */
export function inTheShot(bird: { status: string; rangeM: number }): boolean {
  return (bird.status === 'waiting' || bird.status === 'flying') && bird.rangeM <= RISE_RANGE_M;
}

/** Does this bird count against the cap: a live target in the shot, or a bird
 * leaving it (out of range, or already credited out and flying on) that is
 * not yet LEAVING_RANGE_M off? Never more than SKY_MAX do at once. */
export function countsAgainstCap(bird: { status: string; rangeM: number }): boolean {
  return (bird.status === 'waiting' || bird.status === 'flying' || bird.status === 'departing') && bird.rangeM <= LEAVING_RANGE_M;
}

/** Does this bird still hold the sky against the next wave? A bird that is
 * down (falling or on the ground), out past effective range, or whose wave
 * has had its time, does not. */
export function holdsSky(bird: { status: string; rangeM: number; sinceLaunchMs: number }): boolean {
  return inTheShot(bird) && bird.sinceLaunchMs < WAVE_MAX_GAP_MS;
}

/** How a species leaves the cover once it has been flushed. */
export interface RiseScore {
  /** Birds that break together in one wave. */
  waveSize: number;
  /** Popcorn rises (sharptail singles and pairs) lift the next small wave
   * while earlier birds are still up, as soon as it fits under the cap.
   * Covey rises wait for the sky to clear. */
  popcorn: boolean;
  /** Pause after the sky clears before the next wave, ms. */
  breathMs: readonly [number, number];
  /** Popcorn: least time between one wave and the next, ms. */
  popcornGapMs: readonly [number, number];
  /** Chance one bird sits tight through the waves and rises last. */
  sleeperChance: number;
  /** Bearing step between wave-mates' lanes, radians, before close-flush widening. */
  laneStep: number;
}

const COVEY: RiseScore = {
  waveSize: 3, popcorn: false, breathMs: [150, 350], popcornGapMs: [0, 0], sleeperChance: .18, laneStep: .55,
};

/** Species scores. Bobwhite thunder out three at a time on three bearings;
 * Huns go in a lower, tighter bunch; chukar pour off the slope; sharptails
 * popcorn up in singles and pairs; a pheasant goes alone. */
export const RISE_SCORES: Readonly<Record<string, RiseScore>> = {
  bobwhite: COVEY,
  hun: { ...COVEY, laneStep: .4, sleeperChance: .14 },
  chukar: { ...COVEY, laneStep: .5, sleeperChance: .2 },
  sharptail: { waveSize: 2, popcorn: true, breathMs: [150, 350], popcornGapMs: [450, 950], sleeperChance: .22, laneStep: .55 },
  ringneck: { waveSize: 1, popcorn: true, breathMs: [150, 350], popcornGapMs: [700, 1300], sleeperChance: 0, laneStep: 0 },
};

export function riseScoreFor(speciesId: string): RiseScore {
  return RISE_SCORES[speciesId] ?? COVEY;
}

/** A sleeper never rises sooner than this after the last wave. */
export const SLEEPER_MIN_MS = 450;
/** With the gun never emptied, the sleeper gets up this long after the sky
 * has cleared of the last wave: the bird that waits until you relax. */
export const SLEEPER_LATE_MS: readonly [number, number] = [300, 700];
/** The covey does not wait on a gun the hunter never reloads: this long after
 * the sky clears (beyond the breath), the next wave rises anyway. */
export const GUN_PATIENCE_MS = 2400;

export interface RiseWave {
  /** Simulation ids, in launch order. */
  ids: number[];
  /** The bird that sat tight through the waves. */
  sleeper: boolean;
  /** Seeded breath (covey) or gap (popcorn) before this wave may rise, ms. */
  pauseMs: number;
}

/**
 * Order a flushed group into waves: nearest the hunter's boots first, in
 * waves of the species' size, with an occasional sleeper held to the end.
 * A sharptail group is cut into seeded singles and pairs.
 */
export function planRise(
  birds: readonly { id: number; distance: number }[],
  speciesId: string,
  rng: () => number,
): RiseWave[] {
  const score = riseScoreFor(speciesId);
  const order = [...birds].sort((a, b) => a.distance - b.distance || a.id - b.id).map(b => b.id);
  const waves: RiseWave[] = [];
  const pause = (range: readonly [number, number]) => range[0] + rng() * (range[1] - range[0]);
  // Always one draw, so a sleeper roll never shifts the rest of the stream.
  const sleeperRoll = rng();
  const sleeperAt = order.length >= 4 && sleeperRoll < score.sleeperChance
    ? Math.min(order.length - 1, score.waveSize) : -1;
  const sleeper = sleeperAt >= 0 ? order.splice(sleeperAt, 1)[0] : undefined;
  while (order.length > 0) {
    const size = score.popcorn && score.waveSize > 1
      ? (rng() < .55 ? Math.min(2, score.waveSize) : 1) : score.waveSize;
    waves.push({ ids: order.splice(0, Math.max(1, Math.min(size, SKY_MAX))), sleeper: false,
      pauseMs: pause(score.popcorn ? score.popcornGapMs : score.breathMs) });
  }
  if (sleeper !== undefined) waves.push({ ids: [sleeper], sleeper: true, pauseMs: pause(SLEEPER_LATE_MS) });
  return waves;
}

/** The hunter's gun as the sky reads it. Absent: always loaded. */
export interface RiseGun {
  loaded: number;
  capacity: number;
  reloading: boolean;
  /** The gun went empty (or a reload began) since the last wave rose. */
  emptiedSinceWave: boolean;
}

export interface SkyClock {
  /** Rise clock, ms. */
  nowMs: number;
  /** Birds holding the sky (holdsSky), across every covey: they set the clock. */
  inPlay: number;
  /** Birds counting against the cap (countsAgainstCap), across every covey:
   * live targets, and leaving birds not yet LEAVING_RANGE_M off, whatever
   * their waves' clocks. Absent: the same as `inPlay`. */
  inSky?: number;
  /** When the most recent wave of any covey rose (-Infinity before one). */
  lastWaveMs: number;
  /** When the sky last cleared (no bird holding it), or null while one does. */
  clearSinceMs: number | null;
  gun?: RiseGun;
}

/**
 * May this wave rise now? `first` is a covey's first wave, which goes with
 * the eruption whenever it fits under the cap.
 */
export function waveMayRise(wave: RiseWave, score: RiseScore, sky: SkyClock, first: boolean): boolean {
  if (Math.max(sky.inPlay, sky.inSky ?? 0) + wave.ids.length > SKY_MAX) return false;
  if (first) return true;
  const gun = sky.gun;
  const gunEmpty = !!gun && (gun.loaded <= 0 || gun.reloading);
  const sinceWave = sky.nowMs - sky.lastWaveMs;
  const clearMs = sky.clearSinceMs === null ? -1 : sky.nowMs - sky.clearSinceMs;
  if (wave.sleeper) {
    // It waits for the empty gun, or for the hunter to think it is over.
    return (gunEmpty && sinceWave >= SLEEPER_MIN_MS) || clearMs >= wave.pauseMs;
  }
  if (score.popcorn) return sinceWave >= wave.pauseMs && (!gunEmpty || clearMs >= GUN_PATIENCE_MS);
  const reloaded = !!gun && gun.emptiedSinceWave && !gun.reloading && gun.loaded >= gun.capacity;
  if (reloaded && sinceWave >= wave.pauseMs) return true;
  if (clearMs < wave.pauseMs) return false;
  return !gunEmpty || clearMs >= wave.pauseMs + GUN_PATIENCE_MS;
}

/** Lanes keep inside this sideways share of a bird's speed, seen from the gun
 * (about 76 degrees off the line of sight): none flies back past square. */
const LANE_SIDE_MAX = .97;
/** A popcorn single clears the line of sight by this much (radians), plus up
 * to LONE_REACH more, on the side away from the birds already up. */
const LONE_CLEAR = .3;
const LONE_REACH = .35;
/** A popcorn pair's near bird crosses at least this sideways share of its
 * speed clear of the line of sight, on the side away from the birds up. */
const PAIR_CLEAR = .15;

/**
 * Lane offsets for a wave's birds, as bearings off the covey's escape line.
 * Wave-mates take distinct lanes with seeded jitter inside each lane, so no
 * two rises repeat; the presentation hands them to the birds left to right
 * as the gun sees them, so lines open from the cover rather than cross.
 *
 * Lanes are spaced by how fast each bird crosses the shooter's view, not by
 * raw bearing: `escapeOffSight` is the escape line's angle off the line of
 * sight from the gun. Going straight away that is the same thing; a covey
 * breaking across the gun would otherwise put its side lanes one behind
 * another, so the wave slides toward the line of sight as far as it must
 * for its lanes to open on screen. `avoidSide` is the side of the line of
 * sight (as a bearing turns) that birds already in the shot are on.
 */
export function waveLanes(count: number, step: number, rng: () => number, escapeOffSight = 0, avoidSide = 0): WaveLane[] {
  // A lone bird (a sharptail single, a straggler) breaks to one side or the
  // other: away from the side birds already in the shot are on, if any.
  const lone = rng() < .5 ? -1 : 1, reach = .5 + rng() * .5;
  const base = count >= 3 ? [-1, 0, 1] : count === 2 ? [-.7, .7] : [(avoidSide ? -Math.sign(avoidSide) : lone) * reach];
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  const lanes = base.slice(0, Math.max(1, count)).map(lane => lane + (rng() - .5) * .35);
  const side = Math.sin(step), widest = Math.max(...lanes.map(Math.abs)) * side;
  const away = Math.cos(escapeOffSight) >= 0;
  if (count === 1 && avoidSide) {
    // A popcorn single crosses the gun on the other side of the line of
    // sight from the birds already in the shot, however its covey's escape
    // line runs; an escape already wider on that side is kept.
    const want = -Math.sign(avoidSide) * Math.min(LANE_SIDE_MAX, Math.sin(LONE_CLEAR + LONE_REACH * reach));
    const s = Math.sign(Math.sin(escapeOffSight)) === Math.sign(want) && Math.abs(Math.sin(escapeOffSight)) > Math.abs(want) ? Math.sin(escapeOffSight) : want;
    const offSight = away ? Math.asin(s) : Math.PI - Math.asin(s);
    return [{ offset: Math.atan2(Math.sin(offSight - escapeOffSight), Math.cos(offSight - escapeOffSight)), side: .6 }];
  }
  // The wave slides toward the sight line only as far as its outside lane
  // needs half its room (a crossing covey still crosses); the lanes on the
  // crowded side then close up evenly, in order, to fit.
  let centre = Math.max(-LANE_SIDE_MAX + widest / 2, Math.min(LANE_SIDE_MAX - widest / 2, Math.sin(escapeOffSight)));
  if (count === 2 && avoidSide) {
    // A popcorn pair rises on the far side of the line of sight from the
    // birds already in the shot: its near bird crosses at least PAIR_CLEAR
    // clear of it, and the pair keeps its spacing.
    const free = -Math.sign(avoidSide), near = Math.min(...lanes.map(lane => free * (centre + lane * side)));
    if (near < PAIR_CLEAR) centre = Math.max(-LANE_SIDE_MAX + widest / 2, Math.min(LANE_SIDE_MAX - widest / 2, centre + free * (PAIR_CLEAR - near)));
  }
  const raw = lanes.map(lane => centre + lane * side);
  const hi = Math.max(...raw), lo = Math.min(...raw);
  return lanes.map((lane, i) => {
    const v = raw[i];
    const s = v > centre && hi > LANE_SIDE_MAX ? centre + (v - centre) * (LANE_SIDE_MAX - centre) / (hi - centre)
      : v < centre && lo < -LANE_SIDE_MAX ? centre + (v - centre) * (-LANE_SIDE_MAX - centre) / (lo - centre) : v;
    const offSight = away ? Math.asin(s) : Math.PI - Math.asin(s);
    // A pair splits high and low; a lone bird climbs as it would anyway.
    const sideShare = count >= 3 ? Math.min(1, Math.abs(lane)) : count === 2 ? Number(lane > 0) : .6;
    return { offset: Math.atan2(Math.sin(offSight - escapeOffSight), Math.cos(offSight - escapeOffSight)), side: sideShare };
  });
}

/** A downhill flier's lanes keep at least this far below the contour
 * (radians), so the covey's shared break and a bird's jink cannot lift one
 * into the hill its low burst cannot clear. */
export const BELOW_CONTOUR = .3;

/**
 * A downhill flier's wave pours off the slope: turn its lanes, together, so
 * none climbs above a line BELOW_CONTOUR under the contour. `escape` and
 * `uphill` are world bearings; the wave turns away from the uphill side it
 * already leans from, keeping its spacing. Lanes already below are left alone.
 */
export function lanesOffTheHill(lanes: readonly WaveLane[], escape: number, uphill: number): WaveLane[] {
  const mean = lanes.reduce((sum, lane) => sum + lane.offset, 0) / Math.max(1, lanes.length);
  const centre = Math.atan2(Math.sin(escape + mean - uphill), Math.cos(escape + mean - uphill));
  const side = centre >= 0 ? 1 : -1;
  // Each lane's angle from straight uphill, measured toward the wave's side
  // from its centre (a wave never spans half a turn, so this never wraps).
  const fromUphill = lanes.map(lane => Math.abs(centre) + side * (lane.offset - mean));
  const turn = Math.max(0, Math.PI / 2 + BELOW_CONTOUR - Math.min(...fromUphill));
  return lanes.map(lane => ({ ...lane, offset: lane.offset + side * turn }));
}

export interface WaveLane {
  /** Bearing off the covey's escape line, radians. */
  offset: number;
  /** Its share of the side of the wave: 0 for the middle lane, 1 for a side
   * lane; a pair is 0 and 1 (high and low), a lone bird in between. */
  side: number;
}

/** Wave-mates also split in height: the middle lane climbs higher, the side
 * lanes stay lower, so birds lined up from the gun still read apart. */
export const LANE_LIFT: readonly [middle: number, side: number] = [1.3, .8];

export function laneLift(lane: WaveLane | undefined): number {
  return lane ? LANE_LIFT[0] + (LANE_LIFT[1] - LANE_LIFT[0]) * lane.side : 1;
}
