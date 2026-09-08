import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BirdsSystem } from '../src/three/subsystems/birds';
import type { Bird } from '../src/game/birds';
import { getSpecies } from '../src/game/species';
import { getArea } from '../src/game/areas';
import { QuailFlushDebris } from '../src/three/quailFlushDebris';

// Exercise the actual fixed flight loop without allocating renderer geometry.
function fixture() {
  const birds: Bird[] = [];
  const finishRise = vi.fn();
  const system = new BirdsSystem();
  const runtime = system as unknown as {
    tickBirds(dt: number): void; slots: Array<Record<string, any>>;
    refinedQuail: boolean; spatialEncounter: boolean; frozen: boolean; hunt: unknown; terrain: unknown;
    applySpeciesAppearance: unknown; burstDebris: unknown; launchCover?: QuailFlushDebris;
  };
  runtime.refinedQuail = true; runtime.spatialEncounter = true; runtime.frozen = true;
  runtime.hunt = { areaConfig: () => getArea('quail-fields'), huntState: () => ({ birds, hunterPos: {x:0,y:0}, wind:0 }),
    simToWorld: (x:number,y:number,out:{x:number;z:number}) => Object.assign(out,{x,z:y}),
    coverPatches: () => [], lastFlushInfo: () => null, finishRise, resolveBird: vi.fn(), recordFallWorld: vi.fn() };
  runtime.terrain = { heightAt: () => 0 };
  runtime.applySpeciesAppearance = () => {}; runtime.burstDebris = () => {};
  runtime.slots = Array.from({length:14},()=>({status:'idle',root:new THREE.Group(),vel:{x:0,y:0},species:getSpecies('bobwhite')}));
  const add = (id:number,coveyId:number,x:number,y:number) => birds.push({id,coveyId,pos:{x,y},state:'flushed',speciesId:'bobwhite',runs:false,runEnergy:0,restingMs:0,nerveMs:0});
  return { runtime, birds, add, finishRise };
}

describe('continuous Quail coveys', () => {
  it('disturbs each actual launch once, including late birds, without changing flight or stagger at either quality', () => {
    const reference = fixture();
    const variants = [fixture(), fixture()];
    variants[0].runtime.launchCover = new QuailFlushDebris('high', () => 0);
    variants[1].runtime.launchCover = new QuailFlushDebris('lite', () => 0);
    for (const f of [reference, ...variants]) {
      for (let i = 0; i < 9; i++) f.add(i + 1, 1, 40 + i * .6, 20 - i);
      f.runtime.tickBirds(1000 / 30);
    }
    const snapshot = (f: ReturnType<typeof fixture>) => f.runtime.slots.map(s => ({
      state: s.status, x: s.x, y: s.y, z: s.z, delay: s.delayMs,
    }));
    for (const f of variants) expect(snapshot(f)).toEqual(snapshot(reference));
    expect(variants[0].runtime.launchCover!.audit().launches).toBeLessThan(9);
    for (let step = 0; step < 30; step++) for (const f of [reference, ...variants]) f.runtime.tickBirds(1000 / 30);
    for (const f of variants) {
      expect(snapshot(f)).toEqual(snapshot(reference));
      expect(f.runtime.launchCover!.audit().launches).toBe(9);
      f.runtime.launchCover!.dispose();
    }
  });
  it('hands the actual ground contact to the simulation, but gives no landing for a fly-away', () => {
    const f = fixture();
    const resolveBird = vi.fn((id: number, outcome: Bird['state']) => {
      f.birds.find(b => b.id === id)!.state = outcome;
    });
    (f.runtime.hunt as { resolveBird: unknown }).resolveBird = resolveBird;
    f.add(1, 1, 0, 0);
    f.add(2, 1, 0, 2);
    f.runtime.tickBirds(1000 / 30);
    const landing = f.runtime.slots.find(s => s.simId === 1)!;
    landing.spatialFlight.target = { x: 75, z: 12 };
    const leaving = f.runtime.slots.find(s => s.simId === 2)!;
    leaving.spatialFlight.target = undefined;
    for (let i = 0; i < 14 * 30; i++) f.runtime.tickBirds(1000 / 30);
    expect(resolveBird).toHaveBeenCalledWith(1, 'escaped', { x: landing.x, z: landing.z });
    expect(Math.hypot(landing.x - 75, landing.z - 12)).toBeLessThan(.5);
    expect(landing.y).toBeCloseTo(.25);
    expect(resolveBird).toHaveBeenCalledWith(2, 'escaped');
    expect(resolveBird).toHaveBeenCalledTimes(2);
  });
  it('launches a whole covey from its actual cover and keeps the encounter active on its first tick', () => {
    const f=fixture();
    for(let i=0;i<7;i++) f.add(i,1,30+i*3,12-i);
    f.runtime.tickBirds(1000/30);
    const active=f.runtime.slots.filter(s=>s.status!=='idle');
    expect(active).toHaveLength(7);
    for(const s of active){const b=f.birds.find(b=>b.id===s.simId)!;expect([s.x,s.z]).toEqual([b.pos.x,b.pos.y]);}
    expect(f.finishRise).not.toHaveBeenCalled();
  });
  it('does not redirect an airborne covey when another one flushes behind the hunter', () => {
    const f=fixture();f.add(1,1,40,0);f.runtime.tickBirds(1000/30);
    const first=f.runtime.slots[0], flight=first.flight;
    f.add(2,2,-40,0);f.runtime.tickBirds(1000/30);
    expect(first.flight).toBe(flight);expect(first.flight.escX).toBeGreaterThan(0);
    const second=f.runtime.slots.find(s=>s.simId===2)!;
    expect(second.flight.escX).toBeLessThan(0);
    expect(first.vxW).toBeGreaterThan(0);expect(second.vxW).toBeLessThan(0);
  });
  it('retains overflow birds until slots become free instead of dropping queued IDs', () => {
    const f=fixture();for(let i=0;i<20;i++) f.add(i,1,40,i);
    f.runtime.tickBirds(1000/30);
    const seen=new Set(f.runtime.slots.map(s=>s.simId));expect(seen.size).toBe(14);
    for(let i=0;i<6;i++) f.runtime.slots[i].status='done';
    f.runtime.tickBirds(1000/30);f.runtime.slots.forEach(s=>seen.add(s.simId));
    expect([...seen].sort((a,b)=>a-b)).toEqual(Array.from({length:20},(_,i)=>i));
    expect(f.finishRise).not.toHaveBeenCalled();
  });
});
