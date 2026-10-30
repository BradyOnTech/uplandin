import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { closestPass, fallLine, lineFamilyFor, PASS_CLEAR_M, planFlightLine, stepFlightLine, type FlightBody, type FlightLine } from '../src/game/flightLine';
import { landDrivenAnchors } from '../src/game/landHabitat';
import { LandscapeModel } from '../src/game/landscape';
import { mulberry32 } from '../src/game/math';
import { BELOW_CONTOUR, laneClearAngle, lanesClearOfTheGun, lanesOffTheHill, waveLanes } from '../src/game/riseScore';
import { getSpecies } from '../src/game/species';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const FAN = Math.PI / 2 - BELOW_CONTOUR;

describe('the fall line', () => {
  it('reads the bearing and grade of a plane', () => {
    for (const bearing of [0, 1, -2.2, 3]) {
      const plane = (x: number, z: number) => -.4 * (x * Math.cos(bearing) + z * Math.sin(bearing));
      const fall = fallLine(5, -7, plane)!;
      expect(wrap(fall.bearing - bearing)).toBeCloseTo(0, 6);
      expect(fall.grade).toBeCloseTo(.4, 6);
    }
    expect(fallLine(0, 0, () => 3)).toBeUndefined();
  });
});

describe('a downhill wave with the hunter below it', () => {
  it('turns the wave wide of a hunter straight below, none of it above the contour', () => {
    const uphill = -Math.PI / 2, down = Math.PI / 2;
    for (let seed = 1; seed < 80; seed++) {
      for (const range of [8, 14, 20, 30]) {
        for (const off of [0, .3, -.5]) {
          const gun = down + off;
          const escape = down + (seed % 3 - 1) * .4;
          const lanes = lanesClearOfTheGun(lanesOffTheHill(waveLanes(3, .5, mulberry32(seed)), escape, uphill), escape, uphill, gun, range, PASS_CLEAR_M, seed % 2 ? 1 : -1);
          const clear = Math.min(laneClearAngle(range, PASS_CLEAR_M), FAN - Math.abs(off) + .001);
          for (const lane of lanes) {
            const bearing = escape + lane.offset;
            // On or below the contour, and wide of the gun wherever the slope allows it.
            expect(Math.abs(wrap(bearing - down))).toBeLessThanOrEqual(FAN + 1e-9);
            if (laneClearAngle(range, PASS_CLEAR_M) + Math.abs(off) < FAN) expect(Math.abs(wrap(bearing - gun))).toBeGreaterThanOrEqual(clear - 1e-9);
          }
          // Still three lanes, in the same order.
          const order = (set: { offset: number }[]) => set.map((l, i) => [l.offset, i]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
          expect(order(lanes)).toEqual(order(waveLanes(3, .5, mulberry32(seed))));
        }
      }
    }
  });

  it('leaves a wave alone when the hunter is above or level', () => {
    const uphill = -Math.PI / 2, down = Math.PI / 2;
    for (let seed = 1; seed < 40; seed++) {
      const lanes = lanesOffTheHill(waveLanes(3, .5, mulberry32(seed)), down, uphill);
      expect(lanesClearOfTheGun(lanes, down, uphill, uphill, 18, PASS_CLEAR_M)).toEqual(lanes);
      expect(lanesClearOfTheGun(lanes, down, uphill, 0, 18, PASS_CLEAR_M)).toEqual(lanes);
    }
  });
});

describe('the line planner never brings a bird back past the gun', () => {
  it('bears a line aimed at the eye off it, inside its fan', () => {
    const flat = () => 0, eye = { x: 0, y: 1.62, z: 0 };
    for (let seed = 1; seed < 60; seed++) {
      const start = { x: 0, y: .2, z: 22 };
      const line = planFlightLine({ family: 'chukar', flight: getSpecies('chukar').flight, start, eye, bearing: -Math.PI / 2 + (seed % 5 - 2) * .05,
        ground: flat, rng: mulberry32(seed), mayLand: false, fan: { centre: -Math.PI / 2, half: FAN } });
      expect(closestPass(line, start, eye, flat)).toBeGreaterThanOrEqual(PASS_CLEAR_M - 1e-9);
      expect(Math.abs(wrap(line.bearing + Math.PI / 2))).toBeLessThanOrEqual(FAN + 1e-9);
    }
  });

  it('lets a bird that rose close only open the gap', () => {
    const flat = () => 0, eye = { x: 0, y: 1.62, z: 0 };
    for (let seed = 1; seed < 40; seed++) {
      const start = { x: 0, y: .2, z: 4 };
      const line = planFlightLine({ family: 'covey', flight: getSpecies('bobwhite').flight, start, eye, bearing: Math.PI / 2, ground: flat, rng: mulberry32(seed), mayLand: false });
      expect(closestPass(line, start, eye, flat)).toBeGreaterThan(Math.hypot(4, 1.42) - .5);
      expect(line.bearing).toBeCloseTo(Math.PI / 2, 9);
    }
  });
});

/**
 * Chukar Ridge, the canyon: coveys where the land puts them, the hunter 12-26 m
 * below, level with or above each one. The wave is planned as the birds
 * subsystem plans it (escape away from the gun bent down the fall line, the
 * lanes poured off the hill and swung wide of a hunter below, each line
 * planned in its fan), and flown.
 */
describe('chukar on the canyon', () => {
  const area = getArea('chukar-ridge'), land = new LandscapeModel(area);
  const ground = (x: number, z: number) => land.heightAtWorld(x, z);
  const coveys = [3, 11, 29].flatMap(seed => landDrivenAnchors(area, area.dropPoints[0], mulberry32(seed)).slice(0, 8))
    .map(p => land.propertyToWorld(p.x, p.y, { x: 0, z: 0 }));

  function fly(line: FlightLine, start: { x: number; y: number; z: number }, seconds: number) {
    const body: FlightBody = { ...start, airMs: 0, vxW: 0, vyW: 0, vzW: 0, gliding: false };
    const track: { x: number; y: number; z: number }[] = [];
    for (let i = 1; i <= seconds * 30; i++) {
      body.airMs = i * 1000 / 30;
      stepFlightLine(line, body, 1 / 30, ground);
      body.x += body.vxW / 30; body.y += body.vyW / 30; body.z += body.vzW / 30;
      body.y = Math.max(body.y, ground(body.x, body.z) + .25);
      track.push({ x: body.x, y: body.y, z: body.z });
    }
    return track;
  }

  it('pours every wave downhill and past no hunter nearer than the pass clearance', () => {
    const lines = { below: 0, level: 0, above: 0 }, poured = { below: 0, level: 0, above: 0 };
    for (const [c, covey] of coveys.entries()) {
      const fall = fallLine(covey.x, covey.z, ground) ?? fallLine(covey.x, covey.z, ground, [40, 70]);
      if (!fall) continue;
      const down = fall.bearing, uphill = down + Math.PI;
      for (const [approach, toHunter] of [['below', down], ['level', down + Math.PI / 2], ['above', uphill]] as const) {
        const range = 12 + (c * 7) % 15;
        const hunter = { x: covey.x + Math.cos(toHunter) * range, z: covey.z + Math.sin(toHunter) * range };
        const eye = { ...hunter, y: ground(hunter.x, hunter.z) + 1.62 };
        const away = Math.atan2(covey.z - hunter.z, covey.x - hunter.x);
        const ex = Math.cos(away) * .52 + Math.cos(down) * .48, ez = Math.sin(away) * .52 + Math.sin(down) * .48;
        const escape = Math.atan2(ez, ex), rng = mulberry32(c * 31 + approach.length);
        const lanes = lanesClearOfTheGun(lanesOffTheHill(waveLanes(3, .5, rng), escape, uphill), escape, uphill, toHunter, range, PASS_CLEAR_M, c % 2 ? 1 : -1);
        for (const [k, lane] of lanes.entries()) {
          const sx = covey.x + Math.cos(k * 2.1) * 1.5, sz = covey.z + Math.sin(k * 2.1) * 1.5;
          const start = { x: sx, y: ground(sx, sz) + .2, z: sz };
          const elevation = eye.y - 1.62 - ground(covey.x, covey.z), band = Math.max(1, range * .05);
          const line = planFlightLine({ family: lineFamilyFor('chukar'), flight: getSpecies('chukar').flight, start, eye,
            bearing: escape + lane.offset, ground, rng, mayLand: false, fan: { centre: down, half: FAN },
            slope: elevation > band ? 'above' : elevation < -band ? 'below' : 'level' });
          const need = Math.min(PASS_CLEAR_M, Math.hypot(start.x - eye.x, start.y - eye.y, start.z - eye.z) - .5);
          const track = fly(line, start, 4.5);
          const nearest = Math.min(...track.filter((_, i) => i >= 8).map(p => Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z)));
          expect(nearest, `${approach} covey ${c} lane ${k}`).toBeGreaterThan(need - .6);
          expect(Math.abs(wrap(line.bearing - down))).toBeLessThanOrEqual(FAN + 1e-9);
          lines[approach]++;
          if (ground(track[74].x, track[74].z) < start.y - 1) poured[approach]++;
        }
      }
    }
    expect(lines.below + lines.level + lines.above).toBeGreaterThan(150);
    // Chukar pour off the hill: by 2.5 s most lines are a metre or more below
    // where they rose. From below they swing across the slope, wide of the
    // gun, so fewer drop that far (65% of 150 lines, against 49% when they
    // poured on the ground's general slope and passed hunters at 3.6 m).
    expect(poured.above / lines.above).toBeGreaterThan(.85);
    expect(poured.level / lines.level).toBeGreaterThan(.6);
    expect(poured.below / lines.below).toBeGreaterThan(.5);
  });
});
