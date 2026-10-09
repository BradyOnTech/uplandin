import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { getSpecies } from '../src/game/species';
import { mulberry32 } from '../src/game/math';
import { BirdsSystem } from '../src/three/subsystems/birds';
import type { Ctx } from '../src/three/engine';

/** Real pooled mesh and species controller. The supplied bird has already
 * flushed; this fixture does not bypass gameplay to assert an encounter. */
function fixture(speciesId: string, areaId: string) {
  const system = new BirdsSystem();
  const internal = system as unknown as {
    mat: THREE.Material; hunt: unknown; terrain: unknown; frozen: boolean; riseRng: () => number;
    slots: { status: string; x: number; y: number; z: number; vxW: number; vyW: number; vzW: number;
      airMs: number; previousAirMs: number; wobblePh: number; gliding: boolean;
      wingR: THREE.Group; root: THREE.Group; line?: unknown }[];
    buildPool(ctx: Ctx): void; tickBirds(dtMs: number): void;
  };
  const area = getArea(areaId), scene = new THREE.Scene();
  const birds = [{ id: 1, coveyId: 1, speciesId, state: 'flushed', pos: { x: 20, y: 30 } }];
  internal.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  internal.hunt = { areaConfig: () => area, huntState: () => ({ birds, hunterPos: { x: 0, y: 0 }, wind: 0 }), riseSlopeApproach: () => null,
    simToWorld: (x: number, y: number, out: { x: number; z: number }) => Object.assign(out, { x, z: y }), coverPatches: () => [] };
  internal.terrain = { heightAt: () => 0 };
  internal.frozen = true; internal.riseRng = mulberry32(517);
  const ctx = { scene, fixedAlpha: 1, camera: new THREE.PerspectiveCamera() } as unknown as Ctx;
  internal.buildPool(ctx);
  internal.tickBirds(1000 / 30);
  internal.frozen = false;
  const slot = internal.slots.find(candidate => candidate.status === 'flying')!;
  return { system, internal, ctx, slot };
}

describe('authored world wing presentation', () => {
  it.each([['chukar', 'chukar-ridge'], ['bobwhite', 'quail-fields']])(
    'interpolates the %s wing inside a fixed tick without moving its shot center', (species, area) => {
      const { system, ctx, slot } = fixture(species, area);
      slot.airMs = 250; slot.previousAirMs = 250 - 1000 / 30;
      slot.wobblePh = .7;
      const physical = () => [slot.x, slot.y, slot.z, slot.vxW, slot.vyW, slot.vzW, slot.airMs, slot.previousAirMs, slot.wobblePh, slot.gliding];
      const before = physical(), poses: number[] = [];
      for (const alpha of [.1, .4, .8]) {
        ctx.fixedAlpha = alpha; system.update(ctx, 1 / 120); poses.push(slot.wingR.rotation.z);
        expect(physical()).toEqual(before);
        expect(slot.root.position.toArray()).toEqual([slot.x, slot.y, slot.z]);
      }
      expect(Math.max(...poses) - Math.min(...poses)).toBeGreaterThan(.15);
      system.dispose(ctx);
    },
  );

  it('gives a 30Hz Chukar more than three snapped poses and remains continuous across tick boundaries', () => {
    const { system, ctx, slot } = fixture('chukar', 'chukar-ridge');
    expect(slot.line).toBeDefined();
    expect(getSpecies('chukar').flight.flapRate).toBe(15);
    const poses = new Set<string>();
    for (let tick = 1; tick <= 24; tick++) {
      slot.airMs = tick * 1000 / 30; slot.previousAirMs = (tick - 1) * 1000 / 30;
      ctx.fixedAlpha = (tick * .37) % 1; // Render frames land anywhere inside a tick.
      system.update(ctx, 1 / 30); poses.add(slot.wingR.rotation.z.toFixed(4));
    }
    expect(poses.size).toBeGreaterThan(15);
    slot.airMs = 1000 / 3; slot.previousAirMs = 300;
    ctx.fixedAlpha = .999999; system.update(ctx, 1 / 120); const before = slot.wingR.rotation.z;
    slot.previousAirMs = slot.airMs; slot.airMs += 1000 / 30;
    ctx.fixedAlpha = 0; system.update(ctx, 1 / 120);
    expect(Math.abs(slot.wingR.rotation.z - before)).toBeLessThan(.00001);
    system.dispose(ctx);
  });

  it('retains glides and exact capture-time sampling', () => {
    const { system, internal, ctx, slot } = fixture('chukar', 'chukar-ridge');
    slot.airMs = 211; slot.previousAirMs = 190;
    slot.gliding = true; ctx.fixedAlpha = .4; system.update(ctx, 1 / 60);
    expect(slot.wingR.rotation.z).toBe(.16);
    slot.gliding = false; internal.frozen = true;
    ctx.fixedAlpha = .1; system.update(ctx, 1 / 60); const capture = slot.wingR.rotation.z;
    ctx.fixedAlpha = .9; system.update(ctx, 1 / 60);
    expect(slot.wingR.rotation.z).toBe(capture);
    internal.frozen = false; ctx.fixedAlpha = 1; system.update(ctx, 1 / 60);
    expect(slot.wingR.rotation.z).toBe(capture);
    system.dispose(ctx);
  });
});
