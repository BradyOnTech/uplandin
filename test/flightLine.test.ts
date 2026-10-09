import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/game/math';
import { getSpecies } from '../src/game/species';
import {
  inSight, LINE_FAMILIES, lineFamilyFor, planFlightLine, selectLanding, selectOpenLanding, skyBehind, SPEED_CAP, stepFlightLine,
  type FlightBody, type FlightLine, type LineInput,
} from '../src/game/flightLine';

const flat = () => 0;
const eye = { x: 0, y: 1.62, z: 0 };

function plan(speciesId: string, patch: Partial<LineInput> = {}, seed = 7): FlightLine {
  return planFlightLine({ family: lineFamilyFor(speciesId), flight: getSpecies(speciesId).flight,
    start: { x: 0, y: .2, z: 18 }, eye, bearing: Math.PI / 2, ground: flat, rng: mulberry32(seed), mayLand: false, ...patch });
}

/** Fly a line at a fixed rate, the way the birds subsystem does. */
function fly(line: FlightLine, seconds: number, ground: (x: number, z: number) => number = flat, fps = 30,
  start = { x: 0, y: .2, z: 18 }) {
  const body: FlightBody = { ...start, airMs: 0, vxW: 0, vyW: 0, vzW: 0, gliding: false };
  const track: (FlightBody & { t: number })[] = [];
  for (let i = 1; i <= seconds * fps; i++) {
    body.airMs = i * 1000 / fps;
    stepFlightLine(line, body, 1 / fps, ground);
    body.x += body.vxW / fps; body.y += body.vyW / fps; body.z += body.vzW / fps;
    body.y = Math.max(body.y, ground(body.x, body.z) + .25);
    track.push({ ...body, t: body.airMs / 1000 });
  }
  return track;
}
const at = (track: ReturnType<typeof fly>, t: number) => track.find(p => p.t >= t - 1e-9)!;
const height = (p: { x: number; y: number; z: number }, ground: (x: number, z: number) => number = flat) => p.y - ground(p.x, p.z);

describe('one flight system for every species', () => {
  it('maps the core species onto their families', () => {
    expect(['bobwhite', 'ringneck', 'sharptail', 'hun', 'chukar'].map(lineFamilyFor)).toEqual(['covey', 'rooster', 'grouse', 'partridge', 'chukar']);
    expect(lineFamilyFor('california-quail')).toBe('covey');
    expect(lineFamilyFor('ruffed-grouse')).toBe('timber');
  });

  it('bursts a bobwhite to head height, sets its wings, and never tops the speed cap', () => {
    for (let seed = 1; seed < 30; seed++) {
      const track = fly(plan('bobwhite', {}, seed), 4);
      expect(height(at(track, .6))).toBeGreaterThan(1.5);
      expect(height(at(track, .6))).toBeLessThan(4.5);
      const line = plan('bobwhite', {}, seed);
      expect(at(track, line.glideAt + .1).gliding).toBe(true);
      expect(at(track, .5).gliding).toBe(false);
      for (const p of track) expect(Math.hypot(p.vxW, p.vzW)).toBeLessThanOrEqual(SPEED_CAP + 1e-9);
      expect(Math.max(...track.map(p => height(p)))).toBeLessThan(6.5);
    }
  });

  it('jumps a rooster almost straight up, hangs, then levels off and accelerates', () => {
    const line = plan('ringneck'), track = fly(line, 3);
    const top = at(track, line.burstS);
    expect(height(top)).toBeGreaterThan(2.6);
    expect(Math.hypot(top.x - 0, top.z - 18)).toBeLessThan(height(top));
    expect(Math.hypot(at(track, line.burstS + line.hangS).vxW, at(track, line.burstS + line.hangS).vzW)).toBeLessThan(5);
    expect(Math.hypot(at(track, 3).vxW, at(track, 3).vzW)).toBeGreaterThan(13);
    // Flushed underfoot it towers higher still.
    const tower = plan('ringneck', { burst: 1 });
    expect(height(at(fly(tower, 1.2), tower.burstS))).toBeGreaterThan(height(top) + 1.5);
  });

  it('banks a sharptail through a long curl after a popcorn climb', () => {
    for (let seed = 1; seed < 20; seed++) {
      const line = plan('sharptail', {}, seed), track = fly(line, 4);
      const heading = (p: FlightBody) => Math.atan2(p.vzW, p.vxW);
      const turned = Math.abs(Math.atan2(Math.sin(heading(at(track, 3.8)) - heading(at(track, .6))), Math.cos(heading(at(track, 3.8)) - heading(at(track, .6)))));
      expect(turned).toBeGreaterThan(.35);
      expect(height(at(track, 1.2))).toBeGreaterThan(2.5);
    }
  });

  it('keeps a Hun low, and curls a wave together', () => {
    const left = [1, 2, 3].map(seed => plan('hun', { curlSign: -1 }, seed));
    expect(left.every(line => line.curl < 0)).toBe(true);
    const ceiling = LINE_FAMILIES.partridge.cruise[1] + LINE_FAMILIES.partridge.skyLift + .3;
    for (const line of left) expect(Math.max(...fly(line, 3).filter(p => p.t > .8).map(p => height(p)))).toBeLessThan(ceiling);
    expect(LINE_FAMILIES.partridge.cruise[1]).toBeLessThan(LINE_FAMILIES.covey.cruise[1]);
  });

  it('pours a chukar off the slope: it holds its altitude as the ground falls away', () => {
    // The ground falls away 0.35 m for every metre the bird flies.
    const falling = (x: number, z: number) => -.35 * (z - 18);
    const line = plan('chukar', { ground: falling, start: { x: 0, y: .2, z: 18 } }), track = fly(line, 3, falling);
    expect(height(at(track, 3), falling)).toBeGreaterThan(8);
    expect(at(track, 3).y).toBeGreaterThan(-2.5);
    // Never into the hill: clear of the ground through its whole line.
    for (const p of track.filter(p => p.t > .3)) expect(height(p, falling)).toBeGreaterThan(.5);
  });

  it('keeps the chukar slope rule: 0.82, 1 and 1.15 times the speed from above, level and below, and less climb from above', () => {
    // Seen from high above, every line is against the sky: no lift muddies the comparison.
    const lines = (['above', 'level', 'below'] as const).map(slope => plan('chukar', { slope, eye: { x: 0, y: 60, z: 0 } }));
    const tracks = lines.map(line => fly(line, 2.5));
    for (let i = 0; i < tracks[0].length; i++) {
      const speed = tracks.map(track => Math.hypot(track[i].vxW, track[i].vzW));
      expect(speed[0]).toBeCloseTo(speed[1] * .82, 9);
      expect(speed[2]).toBeCloseTo(speed[1] * 1.15, 9);
    }
    expect(lines.map(line => line.speed)).toEqual([SPEED_CAP * .82, SPEED_CAP, SPEED_CAP * 1.15].map(v => expect.closeTo(v, 9)));
    expect(height(at(tracks[0], .8))).toBeLessThan(height(at(tracks[1], .8)));
  });

  it('flies the same line at 20, 30 and 60 Hz as at 120', () => {
    const line = plan('bobwhite', {}, 17), slope = (x: number, z: number) => .015 * x + .008 * z;
    const reference = fly(line, 5, slope, 120).at(-1)!;
    for (const fps of [20, 30, 60]) {
      const result = fly(line, 5, slope, fps).at(-1)!;
      expect(Math.hypot(result.x - reference.x, result.z - reference.z)).toBeLessThan(.6);
      expect(Math.abs(result.y - reference.y)).toBeLessThan(.25);
      expect(result.gliding).toBe(reference.gliding);
    }
  });

  it('drives off above the grass when it has nowhere to land, never putting down on open ground', () => {
    for (const species of ['bobwhite', 'hun', 'sharptail', 'ringneck']) {
      const track = fly(plan(species), 8);
      for (const p of track.filter(p => p.t > 1.5)) expect(height(p)).toBeGreaterThan(1.1);
    }
  });
});

describe('landing in cover the hunter can see', () => {
  const cover = [{ cx: 0, cz: 18, hx: 10, hz: 10 }, { cx: 0, cz: -60, hx: 12, hz: 12 }, { cx: 0, cz: 88, hx: 12, hz: 12 }];

  it('picks cover ahead on the bird\'s own line, never behind it or the cover it left', () => {
    const landing = selectLanding({ x: 0, z: 18 }, Math.PI / 2, [40, 90], cover, () => .5)!;
    expect(landing.x).toBeCloseTo(0, 9); expect(landing.z).toBeCloseTo(83, 9);
    expect(selectLanding({ x: 0, z: 18 }, -Math.PI / 2, [40, 70], cover.slice(0, 1), () => .5)).toBeUndefined();
  });

  it('refuses cover hidden behind a rise from the hunter', () => {
    const ridge = (x: number, z: number) => z > 40 && z < 50 ? 12 : 0;
    expect(inSight(eye, 0, 88, ridge)).toBe(false);
    expect(selectLanding({ x: 0, z: 18 }, Math.PI / 2, [40, 90], cover, () => .5, (x, z) => inSight(eye, x, z, ridge))).toBeUndefined();
  });

  it('flies a miss down into its cover without circling past it', () => {
    const line = plan('bobwhite', { mayLand: true, cover }, 3);
    expect(line.target).toBeDefined();
    const track = fly(line, 9);
    const end = track.at(-1)!;
    expect(Math.hypot(end.x - line.target!.x, end.z - line.target!.z)).toBeLessThan(.5);
    expect(height(end)).toBeLessThan(.3);
  });

  it('holds its own line through the shot window before it turns for its cover', () => {
    // Cover well off to the side of the line, still inside the landing cone.
    const side = [{ cx: 30, cz: 78, hx: 8, hz: 8 }];
    let landings = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const line = plan('bobwhite', { mayLand: true, cover: side }, seed);
      if (!line.target) continue;
      landings++;
      const free = { ...line, target: undefined };
      const landing = fly(line, 4), own = fly(free, 4);
      for (const t of [.5, 1, 1.5]) {
        expect(Math.hypot(at(landing, t).x - at(own, t).x, at(landing, t).z - at(own, t).z)).toBeLessThan(.05);
      }
    }
    expect(landings).toBeGreaterThan(8);
    // Cover far off its line is not a landing at all.
    expect(selectLanding({ x: 0, z: 18 }, Math.PI / 2, [40, 90], [{ cx: 45, cz: 60, hx: 6, hz: 6 }], () => .5)).toBeUndefined();
  });

  it('sets a chukar or a sharptail down on open slope or prairie it can see, never a bobwhite or a cliff', () => {
    let chukar = 0, sharptail = 0;
    for (let seed = 1; seed <= 20; seed++) {
      if (plan('chukar', { mayLand: true, cover: [] }, seed).target) chukar++;
      if (plan('sharptail', { mayLand: true, cover: [] }, seed).target) sharptail++;
      expect(plan('bobwhite', { mayLand: true, cover: [] }, seed).target).toBeUndefined();
    }
    expect(chukar).toBeGreaterThan(6); expect(sharptail).toBeGreaterThan(6);
    const cliff = (x: number, z: number) => z * 1.2;
    expect(selectOpenLanding({ x: 0, z: 18 }, Math.PI / 2, [60, 140], cliff, () => .5)).toBeUndefined();
    expect(selectOpenLanding({ x: 0, z: 18 }, Math.PI / 2, [60, 140], flat, () => .5, () => false)).toBeUndefined();
    const spot = selectOpenLanding({ x: 0, z: 18 }, Math.PI / 2, [60, 140], flat, () => .5)!;
    expect(Math.hypot(spot.x, spot.z - 18)).toBeCloseTo(100, 6);
  });

  it('gives a rooster, a chukar and a sharptail landing lines of their own reach', () => {
    for (const [species, far] of [['ringneck', 130], ['chukar', 100], ['sharptail', 145]] as const) {
      const patches = [{ cx: 0, cz: 18 + far, hx: 14, hz: 14 }];
      let landed = 0;
      for (let seed = 1; seed <= 20; seed++) if (plan(species, { mayLand: true, cover: patches, bearing: Math.PI / 2 }, seed).target) landed++;
      expect(landed).toBeGreaterThan(6);
      const range = LINE_FAMILIES[lineFamilyFor(species)].landRange;
      expect(far).toBeGreaterThanOrEqual(range[0]); expect(far).toBeLessThanOrEqual(range[1]);
    }
  });
});

describe('constraints solved at launch', () => {
  it('turns a bird off the gun\'s line of sight when its wave allows no straightaway', () => {
    for (let seed = 1; seed < 40; seed++) {
      // Straight away from the gun to start with.
      const line = plan('bobwhite', { bearing: Math.PI / 2, minOffSight: 28 * Math.PI / 180 }, seed);
      const p = at(fly(line, 1), .8);
      const sight = Math.atan2(p.z - eye.z, p.x - eye.x), heading = Math.atan2(p.vzW, p.vxW);
      expect(Math.abs(Math.atan2(Math.sin(heading - sight), Math.cos(heading - sight)))).toBeGreaterThan(25 * Math.PI / 180);
    }
  });

  it('turns it away from its wave-mates, never across onto another bird\'s line', () => {
    for (let seed = 1; seed < 40; seed++) {
      for (const lean of [-1, 1]) {
        // A lane just across the sight line from the side its wave-mates are
        // not on: it turns back across, away from them, not on toward them.
        const line = plan('bobwhite', { bearing: Math.PI / 2 - lean * .08, minOffSight: 28 * Math.PI / 180, lean }, seed);
        expect(Math.sign(line.bearing - line.aim)).toBe(lean);
        const p = at(fly(line, 1), .8);
        const off = Math.atan2(Math.sin(Math.atan2(p.vzW, p.vxW) - Math.atan2(p.z - eye.z, p.x - eye.x)), Math.cos(Math.atan2(p.vzW, p.vxW) - Math.atan2(p.z - eye.z, p.x - eye.x)));
        expect(Math.abs(off)).toBeGreaterThan(25 * Math.PI / 180);
      }
    }
  });

  it('lifts a bird to stay against the sky where a swell rises behind it, as far as its family allows', () => {
    const swell = (x: number, z: number) => Math.max(0, (z - 25) * .12);
    const open = plan('sharptail', { ground: flat }, 4), backed = plan('sharptail', { ground: swell }, 4);
    expect(backed.cruise).toBeGreaterThan(open.cruise);
    expect(backed.cruise - open.cruise).toBeLessThanOrEqual(LINE_FAMILIES.grouse.skyLift + 1e-9);
    const p = at(fly(backed, 1, swell), 1);
    expect(skyBehind(eye, p, swell)).toBe(true);
  });

  it('clears rising ground ahead in its first seconds', () => {
    const wall = (x: number, z: number) => Math.max(0, (z - 26) * .35);
    const line = plan('bobwhite', { ground: wall }, 2);
    for (const p of fly(line, 3, wall).filter(p => p.t > .4)) expect(height(p, wall)).toBeGreaterThan(.4);
  });
});
