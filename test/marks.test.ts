import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { circleBack, relightSurvivors, type Bird } from '../src/game/birds';
import { lineFamilyFor, planFlightLine, stepFlightLine, type FlightBody, type FlightLine, type LineInput } from '../src/game/flightLine';
import { mulberry32 } from '../src/game/math';
import { getSpecies } from '../src/game/species';
import { BirdsSystem } from '../src/three/subsystems/birds';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ playThud: vi.fn(), playFall: vi.fn(), playBirdFlush: vi.fn(), playPheasantFlush: vi.fn(), playCoveyThunder: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const bird = (id: number, speciesId: string, extra: Partial<Bird> = {}): Bird => ({
  id, coveyId: 7, speciesId, pos: { x: 100, y: 100 }, state: 'escaped', runs: false, runEnergy: 0, restingMs: 0, nerveMs: 1000, ...extra,
});
const world = { x: 0, y: 0, w: 1000, h: 800 };
const patch = { x: 400, y: 400, w: 60, h: 60 };

describe('a miss that sets down is a single to hunt where it landed', () => {
  it('relights a chukar or sharptail on the open slope it set down on, a bobwhite only in cover', () => {
    const birds = [bird(1, 'chukar'), bird(2, 'sharptail'), bird(3, 'bobwhite'), bird(4, 'bobwhite')];
    const landings = new Map([[1, { x: 200, y: 150 }], [2, { x: 600, y: 200 }], [3, { x: 300, y: 300 }], [4, { x: 420, y: 430 }]]);
    const relit = relightSurvivors(birds, [1, 2, 3, 4], world, mulberry32(1), 1, [patch], landings).map(b => b.id);
    expect(relit.sort()).toEqual([1, 2, 4]);
    expect(birds[0].pos).toEqual({ x: 200, y: 150 }); expect(birds[3].pos).toEqual({ x: 420, y: 430 });
    // Out of bounds is never a single, open country or not.
    const lost = [bird(5, 'chukar')];
    expect(relightSurvivors(lost, [5], world, mulberry32(1), 1, [patch], new Map([[5, { x: 1200, y: 150 }]]))).toEqual([]);
  });

  it('remembers the covey a single was scattered from, so the singles call each other back', () => {
    const birds = [bird(1, 'bobwhite'), bird(2, 'bobwhite')];
    const landings = new Map([[1, { x: 410, y: 410 }], [2, { x: 440, y: 450 }]]);
    relightSurvivors(birds, [1, 2], world, mulberry32(1), 1, [patch], landings);
    expect(birds.map(b => [b.single, b.scatteredFrom, b.coveyId])).toEqual([[true, 7, -1], [true, 7, -2]]);
  });

  it('sets a Hun covey that flew its loop down where it landed, together, a covey again', () => {
    const covey = [bird(1, 'hun'), bird(2, 'hun'), bird(3, 'hun')];
    const landings = new Map([[1, { x: 300, y: 300 }], [2, { x: 303, y: 298 }], [3, { x: 299, y: 304 }]]);
    const back = circleBack(covey, [1, 2, 3], world, mulberry32(4), 1, { patches: [patch], landings });
    expect(back).toHaveLength(3);
    for (const b of covey) { expect(b.pos).toEqual(landings.get(b.id)); expect(b.state).toBe('hidden'); expect(b.circled).toBe(true); expect(b.single).toBeUndefined(); }
  });
});

const flat = () => 0;
const eye = { x: 0, y: 1.62, z: 0 };
function plan(speciesId: string, patch: Partial<LineInput> = {}, seed = 7): FlightLine {
  return planFlightLine({ family: lineFamilyFor(speciesId), flight: getSpecies(speciesId).flight,
    start: { x: 0, y: .2, z: 30 }, eye, bearing: Math.PI / 2, ground: flat, rng: mulberry32(seed), mayLand: true, ...patch });
}
function fly(line: FlightLine, seconds: number) {
  const body: FlightBody = { x: 0, y: .2, z: 30, airMs: 0, vxW: 0, vyW: 0, vzW: 0, gliding: false };
  const track: (FlightBody & { t: number })[] = [];
  for (let i = 1; i <= seconds * 30; i++) {
    body.airMs = i * 1000 / 30; stepFlightLine(line, body, 1 / 30, flat);
    body.x += body.vxW / 30; body.y += body.vyW / 30; body.z += body.vzW / 30; body.y = Math.max(body.y, .25);
    track.push({ ...body, t: body.airMs / 1000 });
  }
  return track;
}

describe('landing lines keep to ground a dog can reach', () => {
  const cover = [{ cx: 0, cz: 100, hx: 30, hz: 30 }, { cx: 60, cz: 100, hx: 30, hz: 30 }];

  it('never sets down where the land says no: out of bounds, in rock or a tree, on a cliff, in water', () => {
    const allowed = (x: number) => x > 8;
    let landed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const line = plan('bobwhite', { cover, landable: allowed }, seed);
      if (!line.target) continue;
      landed++; expect(line.target.x).toBeGreaterThan(8);
    }
    expect(landed).toBeGreaterThan(5);
    for (let seed = 1; seed <= 20; seed++) expect(plan('chukar', { cover: [], landable: () => false }, seed).target).toBeUndefined();
  });

  it('flushes a marked single a little faster, jinking harder, and never lets it set down again', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const tame = plan('bobwhite', { mayLand: false }, seed), wild = plan('bobwhite', { mayLand: false, wild: true }, seed);
      expect(wild.speed).toBeGreaterThan(tame.speed);
      expect(Math.abs(wild.curl)).toBeGreaterThanOrEqual(Math.abs(tame.curl));
    }
  });

  it('flies a Hun covey that circles back round a visible loop and down again near where it rose', () => {
    const near = [{ cx: -25, cz: 40, hx: 18, hz: 18 }, { cx: 25, cz: 40, hx: 18, hz: 18 }];
    let loops = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const line = plan('hun', { cover: near, circleBack: true, curlSign: 1 }, seed);
      if (!line.target) continue;
      loops++;
      const track = fly(line, 12), end = track.at(-1)!;
      // It turned through more than a half circle on the way...
      let turned = 0;
      for (let i = 1; i < track.length; i++) {
        const a = Math.atan2(track[i - 1].vzW, track[i - 1].vxW), b = Math.atan2(track[i].vzW, track[i].vxW);
        if (Math.hypot(track[i].vxW, track[i].vzW) > 2) turned += Math.atan2(Math.sin(b - a), Math.cos(b - a));
      }
      expect(Math.abs(turned)).toBeGreaterThan(Math.PI);
      // ...and set down in its cover, not far from where it rose.
      expect(Math.hypot(end.x - line.target.x, end.z - line.target.z)).toBeLessThan(1);
      expect(Math.hypot(line.target.x - 0, line.target.z - 30)).toBeLessThan(80);
    }
    expect(loops).toBeGreaterThan(6);
    // With nowhere to set down near the turn it drives off on its line instead.
    expect(plan('hun', { cover: [], circleBack: true }, 3).target).toBeUndefined();
  });
});

describe('where the birds subsystem lets a miss set down', () => {
  function system(obstacles: { x: number; z: number; radius: number }[], height: (x: number, z: number) => number = () => 0) {
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
    const birds = new BirdsSystem();
    const internal = birds as unknown as { hunt: unknown; terrain: unknown; obstacleCtx: unknown; landable(x: number, z: number): boolean };
    internal.hunt = { areaConfig: () => ({ id: 'quail-fields', world: { x: 0, y: 0, w: 400, h: 300 }, landmarks: [] }),
      worldToSim: (x: number, z: number, out: { x: number; y: number }) => Object.assign(out, { x, y: z }),
      simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }),
      surfaceAtWorld: (_x: number, _z: number, out: object) => Object.assign(out, { moisture: .2, vegetation: .4 }) };
    internal.terrain = { heightAt: height };
    internal.obstacleCtx = { get: (id: string) => id === 'flora' ? { collisionCircles: () => obstacles } : {} } as unknown as Ctx;
    return internal;
  }

  it('keeps inside the property, clear of trees and rock, and off a cliff', () => {
    const s = system([{ x: 100, z: 100, radius: 3 }], (x) => x > 300 ? (x - 300) * 2 : 0);
    expect(s.landable(50, 50)).toBe(true);
    expect(s.landable(5, 50)).toBe(false);
    expect(s.landable(50, 295)).toBe(false);
    expect(s.landable(101, 100)).toBe(false);
    expect(s.landable(105, 100)).toBe(true);
    expect(s.landable(320, 50)).toBe(false);
    expect(new THREE.Vector2(1, 1).length()).toBeGreaterThan(1);
  });
});
