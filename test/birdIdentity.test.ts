import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSpecies } from '../src/game/species';
import { ID_SPAN_PX, identityBoost, identityFloorPx, MAX_SHOWN_WING_HZ, shownWingHz } from '../src/three/birdIdentity';
import { pheasantWingPhase } from '../src/three/pheasantWingMotion';
import { sharptailWingPhase } from '../src/three/sharptailPresentation';
import { BirdsSystem } from '../src/three/subsystems/birds';
import type { Ctx } from '../src/three/engine';

vi.mock('../src/audio', () => ({ playThud: vi.fn(), playFall: vi.fn(), playBirdFlush: vi.fn(), playPheasantFlush: vi.fn(), playCoveyThunder: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const CORE = ['ringneck', 'sharptail', 'chukar', 'hun', 'bobwhite'] as const;

describe('wingbeats a 30 fps screen can show', () => {
  it('keeps every core species at four frames a beat or more, in their own order', () => {
    const shown = CORE.map(id => shownWingHz(getSpecies(id).flight.flapRate!));
    for (const hz of shown) expect(30 / hz).toBeGreaterThanOrEqual(4 - 1e-9);
    // Rooster slowest, bobwhite fastest, as their real rates go.
    expect([...shown].sort((a, b) => a - b)).toEqual(shown);
    expect(shown[0]).toBeLessThan(shown[shown.length - 1]);
  });

  it('never lets a phrased beat outrun the cap: the sharptail and the rooster at their fastest', () => {
    const rate = (phase: (t: number) => number, t: number) => (phase(t + 1e-4) - phase(t)) / 1e-4 / (2 * Math.PI);
    const sharp = shownWingHz(getSpecies('sharptail').flight.flapRate!), rooster = shownWingHz(getSpecies('ringneck').flight.flapRate!);
    for (const t of [0, .1, .3, 1, 2]) {
      expect(rate(s => sharptailWingPhase(s, sharp), t)).toBeLessThanOrEqual(MAX_SHOWN_WING_HZ + 1e-6);
      expect(rate(s => pheasantWingPhase(s, rooster), t)).toBeLessThanOrEqual(MAX_SHOWN_WING_HZ + 1e-6);
    }
  });
});

describe('no live bird within range is a dot', () => {
  const phone = 390, desk = 810, fov = 70;
  const px = (spanM: number, d: number, h: number) => spanM * h / (2 * Math.tan(fov * Math.PI / 360) * d);

  it('ramps in past 15 m, holds to 45 m, and eases off beyond so a bird flying away still shrinks', () => {
    expect(identityFloorPx(10)).toBe(0);
    expect(identityFloorPx(30)).toBeCloseTo(ID_SPAN_PX, 9);
    expect(identityFloorPx(45)).toBeCloseTo(ID_SPAN_PX, 9);
    let last = Infinity;
    for (let d = 46; d < 120; d += 2) { const f = identityFloorPx(d); expect(f).toBeLessThan(last); last = f; }
    // Gone well past the shot: a leaving bird shrinks away as it always did.
    expect(identityFloorPx(120)).toBe(0);
    expect(identityFloorPx(300)).toBe(0);
  });

  it('draws the bobwhite at the floor on a phone, and leaves a desktop alone at shotgun range', () => {
    const bobwhite = 1.02; // its span at the readable enlargement (m)
    for (const d of [30, 40, 55]) {
      const boost = identityBoost(d, bobwhite, phone, fov);
      expect(px(bobwhite * boost, d, phone)).toBeCloseTo(Math.max(identityFloorPx(d), px(bobwhite, d, phone)), 6);
    }
    expect(identityBoost(30, bobwhite, desk, fov)).toBe(1);
    expect(identityBoost(40, bobwhite, desk, fov)).toBe(1);
    // A mounted gun's narrower view already draws it larger: less boost.
    expect(identityBoost(40, bobwhite, phone, 52)).toBeLessThan(identityBoost(40, bobwhite, phone, 70));
  });

  it('in the birds subsystem, keeps every core bird readable on a phone and the rooster bigger than the quail', () => {
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('location', { search: '' });
    const birds = new BirdsSystem();
    const internal = birds as unknown as { mat: THREE.Material; listener: THREE.Camera; viewHeight: () => number;
      buildPool(ctx: Ctx): void; flightScale(id: string, at: { x: number; y: number; z: number }): number;
      speciesGeos: Map<string, { spanM: number }> };
    internal.mat = new THREE.MeshLambertMaterial();
    internal.buildPool({ scene: new THREE.Scene() } as unknown as Ctx);
    const camera = new THREE.PerspectiveCamera(fov, 844 / 390, .05, 2000);
    internal.listener = camera; internal.viewHeight = () => phone;
    const visual = (id: string) => Math.sqrt((getSpecies(id).size ?? .62) / .62);
    for (const d of [30, 40, 55]) {
      const spans = CORE.map(id => px(internal.speciesGeos.get(id)!.spanM * internal.flightScale(id, { x: 0, y: 0, z: d }) * visual(id), d, phone));
      for (const span of spans) expect(span).toBeGreaterThanOrEqual(identityFloorPx(d) - 1e-6);
      expect(spans[0]).toBeGreaterThan(spans[4]);
    }
    birds.dispose({ scene: new THREE.Scene() } as unknown as Ctx);
  });
});
