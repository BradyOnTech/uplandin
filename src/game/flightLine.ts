/**
 * World-space flight lines: one planner and one stepper for every species.
 *
 * A bird's whole line is planned the moment it leaves the cover, from its
 * species' family of segments: the jump, a rooster's hang, the acceleration
 * to cruise, a banking curl, the set wings, and then either a landing in
 * cover the hunter can see (so a miss can be marked) or a line that drives
 * on until it leaves the screen. The plan honours, at launch:
 * - its wave lane and lane height (game/riseScore.ts),
 * - terrain clearance, looking ahead along the line,
 * - the chukar slope rule (fieldcraft slopeFlightMult: 15.17 / 18.5 / 21.275
 *   m/s ceilings from above / level / below),
 * - an escape-cover landing chosen along the bird's own line,
 * - the sky behind it for its first second where the land allows, and
 * - the straightaway limit its wave gives it.
 * The stepper then flies that plan on the fixed tick, deterministically and
 * the same at any tick rate. Pure: callers pass the ground and cover.
 */
import { slopeFlightMult, type SlopeApproach } from './fieldcraft';
import { YOUNG_FLIGHT_MULT } from './birds';

export type LineFamilyId = 'covey' | 'rooster' | 'grouse' | 'partridge' | 'chukar' | 'timber' | 'woodcock';

type Range = readonly [number, number];

/** The shape a family's line takes out of the cover. Heights are metres
 * above the ground, times seconds, angles radians. */
export interface LineFamily {
  /** The jump out of the cover, reached at `burstS`. */
  burstHeight: Range;
  burstS: number;
  /** Share of cruise speed carried through the jump: a rooster claws almost straight up. */
  jumpCarry: number;
  /** A rooster's pause at the top of the jump before it levels off. */
  hangS: number;
  /** From the end of the jump to full cruise speed. */
  accelS: number;
  /** Height kept above the ground once lined out. */
  cruise: Range;
  /** When the wings set; Infinity keeps them beating. */
  glideAt: Range;
  /** Share of speed kept on set wings. */
  glideSpeed: number;
  /** The banking curl through the line: its size, when it starts, how long it takes. */
  curl: Range;
  curlStart: number;
  curlS: number;
  /** Chukar hold the altitude they launched at while the slope falls away, sinking this fast (m/s). */
  pourSink?: number;
  /** A miss sets down in cover this far off (m) with this chance; otherwise it drives off. */
  landChance: number;
  landRange: Range;
  /** Country where the whole slope or prairie is cover (sage and cheatgrass,
   * bunchgrass): with no patch along its line, a miss may set down on open
   * ground the hunter can see. */
  landsInOpen?: boolean;
  /** The most the line will lift (m) to keep the bird against the sky for its first second. */
  skyLift: number;
}

/** The families: bobwhite burst to head height, set wings and glide for
 * cover; a rooster jumps almost straight up, hangs, levels off and
 * accelerates, then sails a couple of hundred metres into cover; sharptails
 * climb in a popcorn rise and bank in long curls; Huns go low and curve as
 * a bunch; chukar pour off the slope and swing across the draw. */
export const LINE_FAMILIES: Readonly<Record<LineFamilyId, LineFamily>> = {
  covey: { burstHeight: [1.8, 2.6], burstS: .5, jumpCarry: .7, hangS: 0, accelS: .3, cruise: [2.2, 3.4],
    glideAt: [1, 1.6], glideSpeed: .86, curl: [0, .3], curlStart: .8, curlS: 2, landChance: .75, landRange: [40, 90], skyLift: 2 },
  rooster: { burstHeight: [3.2, 4.6], burstS: .7, jumpCarry: .2, hangS: .2, accelS: .6, cruise: [4, 6.5],
    glideAt: [3.6, 5.2], glideSpeed: .82, curl: [0, .4], curlStart: 1.5, curlS: 3, landChance: .7, landRange: [90, 170], skyLift: 2.5 },
  grouse: { burstHeight: [2.8, 4.2], burstS: .75, jumpCarry: .5, hangS: 0, accelS: .6, cruise: [4, 7],
    glideAt: [.8, 1.1], glideSpeed: .9, curl: [.45, 1], curlStart: .9, curlS: 2.5, landChance: .6, landRange: [100, 190], landsInOpen: true, skyLift: 3 },
  partridge: { burstHeight: [1.3, 1.9], burstS: .45, jumpCarry: .7, hangS: 0, accelS: .3, cruise: [1.5, 2.4],
    glideAt: [1.1, 1.5], glideSpeed: .86, curl: [.5, .9], curlStart: .7, curlS: 2.2, landChance: .7, landRange: [60, 140], skyLift: 1.5 },
  chukar: { burstHeight: [.9, 1.5], burstS: .4, jumpCarry: .7, hangS: 0, accelS: .35, cruise: [1.6, 2.6],
    glideAt: [1.2, 1.8], glideSpeed: .9, curl: [.4, .8], curlStart: .9, curlS: 2.2, pourSink: .9, landChance: .65, landRange: [60, 140], landsInOpen: true, skyLift: 1 },
  timber: { burstHeight: [2.5, 3.5], burstS: .6, jumpCarry: .5, hangS: 0, accelS: .5, cruise: [3, 5],
    glideAt: [Infinity, Infinity], glideSpeed: 1, curl: [.3, .7], curlStart: .6, curlS: 1.8, landChance: .6, landRange: [80, 160], skyLift: 2 },
  woodcock: { burstHeight: [4, 6], burstS: 1, jumpCarry: .25, hangS: 0, accelS: .6, cruise: [3, 5],
    glideAt: [Infinity, Infinity], glideSpeed: 1, curl: [.2, .6], curlStart: 1.2, curlS: 1.6, landChance: .7, landRange: [50, 110], skyLift: 2 },
};

export function lineFamilyFor(speciesId: string): LineFamilyId {
  switch (speciesId) {
    case 'ringneck': return 'rooster';
    case 'sharptail': case 'prairie-chicken': return 'grouse';
    case 'hun': return 'partridge';
    case 'chukar': return 'chukar';
    case 'ruffed-grouse': case 'blue-grouse': return 'timber';
    case 'woodcock': return 'woodcock';
    default: return 'covey';
  }
}

/** Species flight speed (FlightStyle px/s) to metres a second in the field. */
export const SPEED_PER_PX = .12;
/** A bird tops out near this over the ground; the chukar slope rule scales it. */
export const SPEED_CAP = 18.5;
/** Lines that drive off never sink below this over the ground. */
const EXIT_CLEARANCE = 1.2;
/** A miss holds its own line through the shot window and only then turns
 * for the cover it will set down in, so wave-mates stay apart in the shot. */
export const LAND_TURN_S = 1.6;
/** Landing cover lies within this cosine of the bird's own line (about 35 degrees). */
const LAND_CONE = .82;
/** Seconds of look-ahead along the line for rising ground. */
const LOOK_AHEAD_S = [.35, .8] as const;

export interface Vec3 { x: number; y: number; z: number }
export interface CoverPatch { cx: number; cz: number; hx: number; hz: number }

export interface FlightLine {
  family: LineFamilyId;
  /** Bearing it flies out on (world, atan2(z, x)), after the launch constraints. */
  bearing: number;
  /** The bearing it was asked for: its covey's line and its wave lane. */
  aim: number;
  curl: number; curlStart: number; curlS: number;
  /** Cruise speed over the ground, slope rule included. */
  speed: number;
  jumpCarry: number; burstS: number; hangS: number; accelS: number;
  burstHeight: number; cruise: number;
  glideAt: number; glideSpeed: number;
  pourSink?: number;
  launchY: number;
  /** Close-flush intensity: a bird sat on underfoot pops up before it lines out. */
  burst: number;
  /** The slope rule on the climb: from above a chukar stays lower. */
  climbMult: number;
  /** Where a miss sets down: inside cover the hunter can see. */
  target?: { x: number; z: number };
}

export interface FlightBody {
  x: number; y: number; z: number; airMs: number;
  vxW: number; vyW: number; vzW: number; gliding: boolean;
}

const smooth = (u: number) => { const t = Math.max(0, Math.min(1, u)); return t * t * (3 - 2 * t); };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The line's heading at `t` seconds, before any turn into its landing. */
export function lineHeadingAt(line: FlightLine, t: number): number {
  return line.bearing + line.curl * smooth((t - line.curlStart) / line.curlS);
}

/** Fly one tick of the plan: sets the body's velocity and glide state; the
 * caller moves it. */
export function stepFlightLine(line: FlightLine, body: FlightBody, dt: number, ground: (x: number, z: number) => number): void {
  const t = body.airMs / 1000;
  let heading = lineHeadingAt(line, t);
  // Speed: the jump, the hang, the acceleration to cruise, then set wings.
  const lined = line.burstS + line.hangS;
  let share = t < line.burstS ? line.jumpCarry : t < lined ? line.jumpCarry * .8
    : line.jumpCarry + (1 - line.jumpCarry) * smooth((t - lined) / line.accelS);
  if (t > line.glideAt) share *= 1 + (line.glideSpeed - 1) * smooth((t - line.glideAt) / .6);
  const pop = line.burst * Math.max(0, 1 - t / .7);
  let speed = line.speed * share * (1 - .35 * pop);
  let distance = Infinity;
  if (line.target) {
    const dx = line.target.x - body.x, dz = line.target.z - body.z;
    distance = Math.hypot(dx, dz);
    // Keep the bird's own line out of the cover, then ease into the landing.
    const blend = smooth((t - Math.max(LAND_TURN_S, line.curlStart)) / 1.4);
    heading += wrap(Math.atan2(dz, dx) - heading) * blend;
    speed = Math.min(speed, Math.max(3, distance * 1.8), distance / Math.max(dt, 1e-4));
  }
  body.vxW = Math.cos(heading) * speed;
  body.vzW = Math.sin(heading) * speed;
  body.gliding = t > line.glideAt;
  // Height: the jump to its burst height, then the cruise, lower on set
  // wings, down into the landing; ground ahead along the line counts.
  let ahead = ground(body.x, body.z);
  for (const s of LOOK_AHEAD_S) ahead = Math.max(ahead, ground(body.x + body.vxW * s, body.z + body.vzW * s));
  const jump = Math.min(1, t / line.burstS);
  let clearance = t < line.burstS
    ? .2 + (line.burstHeight - .2) * (1 - (1 - jump) * (1 - jump))
    : line.burstHeight + (line.cruise - line.burstHeight) * smooth((t - line.burstS) / .8);
  clearance += pop * 1.6;
  if (t > line.glideAt) clearance *= 1 - .3 * smooth((t - line.glideAt) / 2);
  // Into the landing: down over the last stretch, holding a hand's breadth
  // above the grass until the bird is over its spot.
  if (line.target) clearance = clearance * Math.min(1, distance / 22) + (distance > .4 ? .35 : 0);
  else if (t > line.burstS) clearance = Math.max(clearance, EXIT_CLEARANCE);
  let desired = ahead + clearance;
  if (line.pourSink !== undefined && t > line.burstS) {
    // Chukar hold their launch altitude over the falling slope, sinking
    // slowly, never closer to the ground than their cruise share allows.
    const held = line.launchY + line.burstHeight - line.pourSink * (t - line.burstS);
    desired = Math.max(held, ahead + clearance * .6);
    if (line.target) desired = Math.min(desired, ahead + clearance);
  }
  const climbMax = 5.5 + 3 * line.burst + (t < line.burstS ? 3 : 0);
  const want = Math.max(-3.5, Math.min(climbMax, (desired - body.y) * 3.2)) * (body.y < desired ? line.climbMult : 1);
  body.vyW += (want - body.vyW) * (1 - Math.exp(-dt * 9));
}

/** Choose cover to set down in, along the bird's own line, within the
 * family's landing range, and in sight of the hunter. */
export function selectLanding(
  from: { x: number; z: number }, heading: number, range: Range, cover: readonly CoverPatch[],
  rng: () => number, visible: (x: number, z: number) => boolean = () => true,
): { x: number; z: number } | undefined {
  const dirX = Math.cos(heading), dirZ = Math.sin(heading), prefer = (range[0] + range[1]) / 2;
  let best: { x: number; z: number; hx: number; hz: number } | undefined, bestScore = Infinity;
  for (const patch of cover) {
    if (Math.abs(from.x - patch.cx) <= patch.hx && Math.abs(from.z - patch.cz) <= patch.hz) continue;
    // Aim down the line at the preferred reach, then nearer and farther, each
    // projected into the patch's usable interior; the hunter must see it.
    const insetX = Math.min(6, patch.hx * .5), insetZ = Math.min(6, patch.hz * .5);
    for (const reach of [prefer, range[0] + (prefer - range[0]) * .4, range[1] - (range[1] - prefer) * .4]) {
      const x = Math.max(patch.cx - patch.hx + insetX, Math.min(patch.cx + patch.hx - insetX, from.x + dirX * reach));
      const z = Math.max(patch.cz - patch.hz + insetZ, Math.min(patch.cz + patch.hz - insetZ, from.z + dirZ * reach));
      const dx = x - from.x, dz = z - from.z, distance = Math.hypot(dx, dz);
      if (distance < range[0] || distance > range[1]) continue;
      const alignment = (dx * dirX + dz * dirZ) / distance;
      const score = Math.abs(distance - prefer) + (1 - alignment) * 70;
      if (alignment < LAND_CONE || score >= bestScore || !visible(x, z)) continue;
      bestScore = score; best = { x, z, hx: insetX, hz: insetZ };
    }
  }
  if (!best) return undefined;
  return { x: best.x + (rng() - .5) * best.hx, z: best.z + (rng() - .5) * best.hz };
}

/** Steepest grade a bird sets down on in the open (about 35 degrees). */
const OPEN_LANDING_GRADE = .7;

/** Choose open ground to set down on, along the bird's own line, within the
 * family's landing range, in sight of the hunter, and not too steep. */
export function selectOpenLanding(
  from: { x: number; z: number }, heading: number, range: Range, ground: (x: number, z: number) => number,
  rng: () => number, visible: (x: number, z: number) => boolean = () => true,
): { x: number; z: number } | undefined {
  const prefer = (range[0] + range[1]) / 2, jitter = (rng() - .5) * .3;
  for (const reach of [prefer, range[0] + (prefer - range[0]) * .4, range[1] - (range[1] - prefer) * .4]) {
    for (const turn of [jitter, jitter - .2, jitter + .2]) {
      const x = from.x + Math.cos(heading + turn) * reach, z = from.z + Math.sin(heading + turn) * reach;
      const grade = Math.hypot(ground(x + 1, z) - ground(x - 1, z), ground(x, z + 1) - ground(x, z - 1)) / 2;
      if (grade <= OPEN_LANDING_GRADE && visible(x, z)) return { x, z };
    }
  }
  return undefined;
}

/** Terrain never rises above the line of sight from `eye` beyond `at`. */
export function skyBehind(eye: Vec3, at: Vec3, ground: (x: number, z: number) => number, reach = 900): boolean {
  let dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z;
  const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  for (let s = .5; s < reach; s *= 1.2) if (ground(at.x + dx * s, at.z + dz * s) > at.y + dy * s) return false;
  return true;
}

/** Can the hunter see a point on the ground (1 m above it)? */
export function inSight(eye: Vec3, x: number, z: number, ground: (x: number, z: number) => number): boolean {
  const y = ground(x, z) + 1, dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, length = Math.hypot(dx, dz);
  for (let s = 2; s < length - 2; s += Math.max(2, length / 40)) {
    const k = s / length;
    if (ground(eye.x + dx * k, eye.z + dz * k) > eye.y + dy * k) return false;
  }
  return true;
}

export interface LineInput {
  family: LineFamilyId;
  /** The species' flight data (game/species.ts FlightStyle). */
  flight: { speedMin: number; speedMax: number; climb: number; wobble: number };
  start: Vec3;
  /** The hunter's eye as the bird rises. */
  eye: Vec3;
  /** Launch bearing (world, atan2(z, x)), lane included. */
  bearing: number;
  /** The lane's share of the climb (riseScore laneLift). */
  lift?: number;
  /** Close-flush intensity, 0..1. */
  burst?: number;
  young?: boolean;
  /** The ground's flight character (huntDoctrine flight). */
  doctrine?: { carry: number; climb: number; wobble: number };
  /** Downhill fliers pass the rise's slope approach (the chukar slope rule). */
  slope?: SlopeApproach | null;
  /** A Hun wave curls together. */
  curlSign?: number;
  /** The least angle (radians) between the bird's line and the gun's line of
   * sight at 0.8 s: the straightaway limit its wave gives it. */
  minOffSight?: number;
  /** Which way (as a bearing turns, +1 or -1) to turn the line for that limit:
   * away from its wave-mates, so the turn never lays it over another's line.
   * Absent: the side the line already leans from the gun. */
  lean?: number;
  /** May this bird set down? A relit single's next escape is for good. */
  mayLand?: boolean;
  ground: (x: number, z: number) => number;
  cover?: readonly CoverPatch[];
  rng: () => number;
}

/** A few steps of the line from its launch, for checking it at planning. */
function sample(line: FlightLine, start: Vec3, ground: (x: number, z: number) => number, seconds: readonly number[]): (Vec3 & { vx: number; vz: number })[] {
  const body: FlightBody = { x: start.x, y: start.y, z: start.z, airMs: 0, vxW: 0, vyW: 0, vzW: 0, gliding: false };
  const out: (Vec3 & { vx: number; vz: number })[] = [], dt = 1 / 15;
  let next = 0;
  for (let t = 0; next < seconds.length && t < 6; t += dt) {
    body.airMs = (t + dt) * 1000;
    stepFlightLine(line, body, dt, ground);
    body.x += body.vxW * dt; body.y += body.vyW * dt; body.z += body.vzW * dt;
    body.y = Math.max(body.y, ground(body.x, body.z) + .05);
    if (t + dt >= seconds[next] - 1e-6) { out.push({ x: body.x, y: body.y, z: body.z, vx: body.vxW, vz: body.vzW }); next++; }
  }
  return out;
}

/** Angle between the line and the gun's line of sight to the bird, at a point of it. */
function offSight(eye: Vec3, at: Vec3 & { vx: number; vz: number }): number {
  const lx = at.x - eye.x, lz = at.z - eye.z, ll = Math.hypot(lx, lz) || 1, sp = Math.hypot(at.vx, at.vz) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (lx * at.vx + lz * at.vz) / (ll * sp))));
}

/** Plan a bird's whole line at launch. */
export function planFlightLine(input: LineInput): FlightLine {
  const fam = LINE_FAMILIES[input.family], rng = input.rng;
  const pick = (range: Range) => range[0] + rng() * (range[1] - range[0]);
  const doctrine = input.doctrine ?? { carry: 1, climb: 1, wobble: 1 };
  const burst = Math.max(0, Math.min(1, input.burst ?? 0));
  const slopeMult = slopeFlightMult(input.slope ?? null);
  const climb = Math.max(.6, Math.min(1.4, doctrine.climb)) * (input.lift ?? 1);
  // The line is planned at the level speed; the slope rule then scales the
  // speed of that same line, so from above or below only its pace changes.
  const speed = Math.min(SPEED_CAP, pick([input.flight.speedMin, input.flight.speedMax]) * SPEED_PER_PX * doctrine.carry
    * (input.young ? YOUNG_FLIGHT_MULT : 1));
  // A bird sat on underfoot pops to head height; a rooster towers.
  const tower = input.family === 'rooster' ? burst : 0;
  const curlSign = input.curlSign ?? (rng() < .5 ? -1 : 1);
  const line: FlightLine = {
    family: input.family, bearing: input.bearing, aim: input.bearing,
    curl: pick(fam.curl) * Math.max(.5, Math.min(1.5, doctrine.wobble)) * curlSign,
    curlStart: fam.curlStart, curlS: fam.curlS, speed,
    jumpCarry: fam.jumpCarry * (1 - .5 * tower), burstS: fam.burstS * (1 + .2 * tower), hangS: fam.hangS * (1 + tower), accelS: fam.accelS,
    burstHeight: pick(fam.burstHeight) * climb + tower * 2.5, cruise: pick(fam.cruise) * climb,
    glideAt: pick(fam.glideAt), glideSpeed: fam.glideSpeed, pourSink: fam.pourSink,
    launchY: input.start.y, burst, climbMult: slopeMult * (input.slope === 'above' ? .85 : 1),
  };
  const landRoll = rng(), landJitter = rng;
  const ground = input.ground;
  // The straightaway limit: turn the line off the gun's line of sight, away
  // from its wave-mates (or to the side it already leans), until it crosses
  // the view at least this much.
  if (input.minOffSight) {
    const at = () => sample(line, input.start, ground, [.8])[0];
    let point = at();
    const lean = Math.sign(input.lean ?? 0)
      || Math.sign((point.x - input.eye.x) * point.vz - (point.z - input.eye.z) * point.vx) || curlSign;
    for (let turned = 0; turned < .8 && offSight(input.eye, point) < input.minOffSight; turned += .1) {
      line.bearing += .1 * lean;
      point = at();
    }
  }
  // Clearance: lift a line that would brush rising ground in its first seconds.
  for (let lift = 0; lift < 3; lift += .6) {
    const low = sample(line, input.start, ground, [.5, 1, 1.5, 2, 2.5, 3]).some(p => p.y - ground(p.x, p.z) < .4);
    if (!low) break;
    line.burstHeight += .6; line.cruise += .6;
  }
  // Sky behind it for its first second, where the land allows: lift the
  // jump and the cruise together, up to the family's limit, keeping the
  // lowest lift (in half metres) that shows the most sky.
  const base = [line.burstHeight, line.cruise];
  const backed = (lift: number) => {
    line.burstHeight = base[0] + lift; line.cruise = base[1] + lift;
    return sample(line, input.start, ground, [.4, .7, 1]).filter(p => skyBehind(input.eye, p, ground)).length;
  };
  let bestLift = 0;
  const none = backed(0);
  if (none < 3 && fam.skyLift > 0) {
    const most = backed(fam.skyLift);
    if (most > none) {
      let low = 0, high = Math.round(fam.skyLift / .5);
      while (high - low > 1) { const mid = (low + high) >> 1; if (backed(mid * .5) >= most) high = mid; else low = mid; }
      bestLift = high * .5;
    }
  }
  line.burstHeight = base[0] + bestLift; line.cruise = base[1] + bestLift;
  // A miss sets down in cover it can see from the hunter, along its own line.
  if (input.mayLand !== false && landRoll < fam.landChance && (input.cover?.length || fam.landsInOpen)) {
    const heading = line.bearing + line.curl / 2, seen = (x: number, z: number) => inSight(input.eye, x, z, ground);
    line.target = selectLanding(input.start, heading, fam.landRange, input.cover ?? [], landJitter, seen)
      ?? (fam.landsInOpen ? selectOpenLanding(input.start, heading, fam.landRange, ground, landJitter, seen) : undefined);
  }
  line.speed *= slopeMult;
  return line;
}
