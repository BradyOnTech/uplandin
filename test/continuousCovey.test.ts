import { buildPheasantBody } from '../src/three/assets/pheasant';
import * as audio from '../src/audio';
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
    tickBirds(dt: number): void; downBird(id: number): boolean; slots: Array<Record<string, any>>;
    refinedQuail: boolean; spatialEncounter: boolean; frozen: boolean; hunt: unknown; terrain: unknown;
    applySpeciesAppearance: unknown; burstDebris: unknown; launchCover?: QuailFlushDebris; coverEvents?: EventTarget;
  };
  runtime.refinedQuail = true; runtime.spatialEncounter = true; runtime.frozen = true;
  runtime.hunt = { areaConfig: () => getArea('quail-fields'), huntState: () => ({ birds, hunterPos: {x:0,y:0}, wind:0 }),
    simToWorld: (x:number,y:number,out:{x:number;z:number}) => Object.assign(out,{x,z:y}),
    coverPatches: () => [], lastFlushInfo: () => null, finishRise, resolveBird: vi.fn(), recordFallWorld: vi.fn() };
  runtime.terrain = { heightAt: () => 0 };
  runtime.applySpeciesAppearance = (slot: { species: unknown }, species: unknown) => { slot.species = species; }; runtime.burstDebris = () => {};
  runtime.slots = Array.from({length:14},()=>({status:'idle',root:new THREE.Group(),vel:{x:0,y:0},species:getSpecies('bobwhite')}));
  const add = (id:number,coveyId:number,x:number,y:number) => birds.push({id,coveyId,pos:{x,y},state:'flushed',speciesId:'bobwhite',runs:false,runEnergy:0,restingMs:0,nerveMs:0});
  return { runtime, birds, add, finishRise };
}

describe('continuous Quail coveys', () => {
  it('retains a hit pheasant momentum and records its moving fall on the actual terrain', () => {
    const f=fixture();f.add(1,1,4,0);f.birds[0].speciesId='ringneck';
    f.runtime.tickBirds(1000/30);
    const slot=f.runtime.slots[0];
    Object.assign(slot,{x:4,y:3,z:0,vxW:10,vyW:3,vzW:2});
    f.runtime.terrain={heightAt:(x:number,z:number)=>.02*x+.01*z};
    f.birds[0].state='downed';
    expect(f.runtime.downBird(1)).toBe(true);
    f.runtime.tickBirds(1000/30);
    expect(slot.x).toBeGreaterThan(4);expect(slot.z).toBeGreaterThan(0);
    expect(slot.y).toBeGreaterThan(3); // A hit during climb retains its upward momentum.
    expect(slot.vyW).toBeLessThan(3);expect(slot.vyW).toBeGreaterThan(0);
    expect(slot.vxW).toBeGreaterThan(0);expect(slot.vxW).toBeLessThan(10);
    for(let i=0;i<180&&slot.status!=='grounded';i++)f.runtime.tickBirds(1000/30);
    expect(slot.status).toBe('grounded');expect(slot.x).toBeGreaterThan(8);
    expect(slot.y).toBeCloseTo(.02*slot.x+.01*slot.z+.06);
    const record=(f.runtime.hunt as {recordFallWorld:ReturnType<typeof vi.fn>}).recordFallWorld;
    expect(record).toHaveBeenCalledExactlyOnceWith(1,slot.x,slot.z);
  });
  it('starts pheasant tumbling from the visible hit pose and settles after contact', () => {
    const f=fixture();f.add(1,1,4,0);f.birds[0].speciesId='ringneck';
    f.runtime.tickBirds(1000/30);
    const slot=f.runtime.slots[0];
    Object.assign(slot,{body:new THREE.Mesh(buildPheasantBody()),airMs:7000,y:3,wingL:new THREE.Group(),wingR:new THREE.Group(),visualScale:1});
    slot.root.rotation.set(-.3,.8,.1,'YXZ');const hit=slot.root.quaternion.clone();
    f.birds[0].state='downed';f.runtime.downBird(1);
    const render=()=> (f.runtime as unknown as {update(ctx:unknown,dt:number):void}).update({},0);
    render();expect(slot.root.quaternion.angleTo(hit)).toBeLessThan(.00001);
    expect(slot.body.morphTargetInfluences[0]).toBe(0);
    f.runtime.tickBirds(1000/30);render();
    expect(slot.root.quaternion.angleTo(hit)).toBeGreaterThan(.01);
    expect(slot.root.quaternion.angleTo(hit)).toBeLessThan(.2);
    slot.y=.061;slot.vyW=-1;
    f.runtime.tickBirds(1000/30);render();const contact=slot.root.quaternion.clone();
    expect(slot.status).toBe('grounded');
    f.runtime.tickBirds(1000/30);render();expect(slot.root.quaternion.angleTo(contact)).toBeLessThan(.2);
    for(let i=0;i<10;i++)f.runtime.tickBirds(1000/30);render();
    const rest=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,.8,1.2,'YXZ'));
    expect(slot.root.quaternion.angleTo(rest)).toBeLessThan(.00001);
    expect(slot.body.morphTargetInfluences[0]).toBe(1);slot.body.geometry.dispose();
  });

  it.each([{species:'bobwhite',spatial:true},{species:'ringneck',spatial:false}])(
    'preserves legacy falling for $species (spatial: $spatial)', ({species,spatial}) => {
      const f=fixture();f.add(1,1,4,0);f.birds[0].speciesId=species;
      f.runtime.tickBirds(1000/30);f.runtime.spatialEncounter=spatial;
      const slot=f.runtime.slots[0];Object.assign(slot,{x:4,y:10,z:2,vxW:10,vyW:3,vzW:2});
      f.birds[0].state='downed';f.runtime.downBird(1);f.runtime.tickBirds(1000/30);
      expect(slot.x).toBe(4);expect(slot.z).toBe(2);expect(slot.vyW).toBeLessThan(0);
      const velocity=slot.vyW;f.runtime.tickBirds(1000/30);expect(slot.vyW).toBe(velocity);
    });

  it('sounds each pheasant only on its actual launch and keeps hens silent of cackles', () => {
    const sound = vi.spyOn(audio, 'playPheasantFlush').mockImplementation(() => {});
    const flutter = vi.spyOn(audio, 'playFlush').mockImplementation(() => {});
    try {
      for (const sex of ['hen','rooster'] as const) {
        const f=fixture(); f.runtime.frozen=false;
        f.add(1,1,4,0); f.birds[0].speciesId='ringneck';f.birds[0].sex=sex;
        f.runtime.applySpeciesAppearance=(slot: any,species:any,sex:any)=>{slot.species=species;slot.sex=sex;};
        f.runtime.tickBirds(1000/30);
        expect(sound).toHaveBeenLastCalledWith(4,sex==='rooster');
        for(let i=0;i<10;i++)f.runtime.tickBirds(1000/30);
      }
      expect(sound).toHaveBeenCalledTimes(2);
      expect(flutter).not.toHaveBeenCalled();
    } finally {sound.mockRestore();flutter.mockRestore();}
  });
  it('disturbs each actual launch once, including late birds, without changing flight or stagger at either quality', () => {
    const reference = fixture();
    const variants = [fixture(), fixture()];
    const disturbances: Array<Array<{ x: number; z: number }>> = [[], []];
    variants.forEach((variant, i) => {
      variant.runtime.coverEvents = new EventTarget();
      variant.runtime.coverEvents.addEventListener('bird-cover-disturbance', event => {
        disturbances[i].push((event as CustomEvent).detail);
      });
    });
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
    for (const [i, f] of variants.entries()) {
      expect(disturbances[i]).toHaveLength(9);
      expect(disturbances[i]).toEqual(f.birds.map(bird => ({ x: bird.pos.x, z: bird.pos.y })));
      expect(snapshot(f)).toEqual(snapshot(reference));
      expect(f.runtime.launchCover!.audit().launches).toBe(9);
      f.runtime.launchCover!.dispose();
    }
  });
  it('gives an underfoot pheasant a stronger upward break than a distant bird', () => {
    const close = fixture(), far = fixture();
    close.add(1, 1, 3, 0); far.add(1, 1, 40, 0);
    for (const f of [close, far]) {
      f.birds[0].speciesId = 'ringneck';
      f.runtime.tickBirds(1000 / 30);
    }
    expect(close.runtime.slots[0].vyW).toBeGreaterThan(far.runtime.slots[0].vyW * 1.3);
  });
  it('lets pheasants punch above tall cover before leveling out without changing a low covey launch', () => {
    const pheasant = fixture(), quail = fixture();
    for (const f of [pheasant, quail]) f.add(1, 1, 40, 20);
    pheasant.birds[0].speciesId = 'ringneck';
    for (const f of [pheasant, quail]) f.runtime.tickBirds(1000 / 30);
    for (let i = 0; i < 18; i++) for (const f of [pheasant, quail]) f.runtime.tickBirds(1000 / 30);
    const cock = pheasant.runtime.slots[0], bobwhite = quail.runtime.slots[0];
    expect(cock.y).toBeGreaterThan(2);
    expect(cock.y).toBeGreaterThan(bobwhite.y);
    const launchClimb = cock.vyW;
    for (let i = 0; i < 60; i++) pheasant.runtime.tickBirds(1000 / 30);
    expect(cock.vyW).toBeLessThan(launchClimb * .5);
    expect(cock.status).toBe('flying');
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
