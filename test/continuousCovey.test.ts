import type { SlopeApproach } from '../src/game/fieldcraft';
import { buildPheasantBody } from '../src/three/assets/pheasant';
import * as audio from '../src/audio';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BirdsSystem } from '../src/three/subsystems/birds';
import type { Bird } from '../src/game/birds';
import { getSpecies } from '../src/game/species';
import { getArea } from '../src/game/areas';
import { QuailFlushDebris } from '../src/three/quailFlushDebris';
import { createHitReaction } from '../src/three/hitReactions';
import { mulberry32 } from '../src/game/math';

// Exercise the actual fixed flight loop without allocating renderer geometry.
function fixture(areaId = 'quail-fields') {
  const birds: Bird[] = [];
  const finishRise = vi.fn();
  const slopes = new Map<number, SlopeApproach | null>();
  const system = new BirdsSystem();
  const runtime = system as unknown as {
    tickBirds(dt: number): void; downBird(id: number): boolean; slots: Array<Record<string, any>>;
    listener?: THREE.Camera; refinedQuail: boolean; spatialEncounter: boolean; frozen: boolean; hunt: unknown; terrain: unknown;
    applySpeciesAppearance: unknown; burstDebris: unknown; launchCover?: QuailFlushDebris; coverEvents?: EventTarget;
  };
  runtime.refinedQuail = true; runtime.spatialEncounter = true; runtime.frozen = true;
  runtime.hunt = { areaConfig: () => getArea(areaId), huntState: () => ({ birds, hunterPos: {x:0,y:0}, wind:0 }),
    simToWorld: (x:number,y:number,out:{x:number;z:number}) => Object.assign(out,{x,z:y}),
    coverPatches: () => [], riseSlopeApproach: (id: number) => slopes.get(id) ?? null, lastFlushInfo: () => null, finishRise, resolveBird: vi.fn(), recordFallWorld: vi.fn() };
  runtime.terrain = { heightAt: () => 0 };
  runtime.applySpeciesAppearance = (slot: { species: unknown }, species: unknown) => { slot.species = species; }; runtime.burstDebris = () => {};
  runtime.slots = Array.from({length:14},()=>({status:'idle',root:new THREE.Group(),vel:{x:0,y:0},species:getSpecies('bobwhite'),
    wingLMesh:{morphTargetInfluences:[0]},wingRMesh:{morphTargetInfluences:[0]}}));
  const add = (id:number,coveyId:number,x:number,y:number) => birds.push({id,coveyId,pos:{x,y},state:'flushed',speciesId:'bobwhite',runs:false,runEnergy:0,restingMs:0,nerveMs:0});
  return { runtime, birds, add, finishRise, slopes };
}

describe('continuous Quail coveys', () => {
  it('keeps distinct bobwhite departure bearings through the actual covey launch loop', () => {
    const launch = () => {
      const f = fixture();
      for (let id = 1; id <= 12; id++) f.add(id, 1, 15 + id * .2, (id % 3 - 1) * .3);
      f.runtime.tickBirds(1000 / 30);
      return f;
    };
    const f = launch(), repeated = launch();
    const profiles = f.runtime.slots.filter(s => s.simId > 0);
    const offsets = profiles.map(s => Math.atan2(Math.sin(s.spatialFlight.bearing - Math.atan2(s.flight.escZ, s.flight.escX)), Math.cos(s.spatialFlight.bearing - Math.atan2(s.flight.escZ, s.flight.escX))));
    // A narrow stream of nearly parallel departures is not the authored
    // bobwhite burst. Exercise the species adapter, not just its helper.
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(.48);
    expect(Math.max(...offsets.map(Math.abs))).toBeLessThan(.42);
    for (const s of profiles) {
      const bird = f.birds.find(b => b.id === s.simId)!;
      expect([s.x, s.z]).toEqual([bird.pos.x, bird.pos.y]);
      expect(s.spatialFlight).toEqual(repeated.runtime.slots.find(r => r.simId === s.simId)!.spatialFlight);
      expect(s.spatialFlight.speed).toBeGreaterThanOrEqual(115 * .12 * .92);
      expect(s.spatialFlight.speed).toBeLessThanOrEqual(155 * .12 * .92);
    }
  });

  it('holds a bobwhite departure before smoothly finding and landing in its actual escape cover', () => {
    const f = fixture(), free = fixture();
    for (const run of [f, free]) {
      (run.runtime.hunt as { coverPatches: () => unknown[] }).coverPatches = () => [{ cx: 70, cz: 22, hx: 14, hz: 12 }];
      for (let id = 1; id <= 9; id++) run.add(id, 1, 12 + id * .25, (id % 3 - 1) * .4);
      run.runtime.tickBirds(1000 / 30);
    }
    const slot = f.runtime.slots.find(s => s.spatialFlight?.target)!;
    expect(slot).toBeDefined();
    const target = { ...slot.spatialFlight.target };
    const freeSlot = free.runtime.slots.find(s => s.simId === slot.simId)!;
    freeSlot.spatialFlight.target = undefined;
    let compared = 0, previousHeading: number | undefined, maxTurn = 0;
    for (let tick = 0; tick < 300 && slot.status !== 'done'; tick++) {
      f.runtime.tickBirds(1000 / 30); free.runtime.tickBirds(1000 / 30);
      if (slot.status !== 'flying') continue;
      if (slot.airMs <= 1000) {
        expect(slot.x).toBeCloseTo(freeSlot.x, 10);
        expect(slot.z).toBeCloseTo(freeSlot.z, 10);
        compared++;
      }
      const heading = Math.atan2(slot.vzW, slot.vxW);
      // The initial impulse has its own bearing; measure continuity of
      // the cover turn once fixed-loop flight has established departure.
      if (previousHeading !== undefined && slot.airMs > 100 && slot.airMs < 2800) maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading))));
      previousHeading = heading;
      expect([slot.x, slot.y, slot.z, slot.vxW, slot.vyW, slot.vzW].every(Number.isFinite)).toBe(true);
    }
    expect(compared).toBeGreaterThan(20);
    expect(maxTurn).toBeLessThan(.09);
    expect(Math.hypot(slot.x - target.x, slot.z - target.z)).toBeLessThan(.5);
    expect(slot.y).toBeCloseTo(.25);
    expect((f.runtime.hunt as { resolveBird: ReturnType<typeof vi.fn> }).resolveBird).toHaveBeenCalledWith(slot.simId, 'escaped', { x: slot.x, z: slot.z });
  });

  it('releases the recovery fold when a pheasant glides or falls', () => {
    const f=fixture();f.add(1,1,4,0);f.birds[0].speciesId='ringneck';f.runtime.tickBirds(1000/30);
    const slot=f.runtime.slots[0];
    Object.assign(slot,{body:new THREE.Mesh(),wingL:new THREE.Group(),wingR:new THREE.Group(),visualScale:1,airMs:80,wobblePh:2,gliding:false});
    const render=()=> (f.runtime as unknown as {update(ctx:unknown,dt:number):void}).update({},0);
    render();
    expect(slot.wingLMesh.morphTargetInfluences[0]).toBeGreaterThan(.99);
    expect(slot.wingRMesh.morphTargetInfluences[0]).toBe(slot.wingLMesh.morphTargetInfluences[0]);
    slot.gliding=true;render();
    expect(slot.wingLMesh.morphTargetInfluences[0]).toBe(0);
    expect(slot.wingRMesh.morphTargetInfluences[0]).toBe(0);
    slot.gliding=false;render();
    expect(slot.wingLMesh.morphTargetInfluences[0]).toBeGreaterThan(.99);
    slot.status='falling';render();
    expect(slot.wingLMesh.morphTargetInfluences[0]).toBe(0);
    expect(slot.wingRMesh.morphTargetInfluences[0]).toBe(0);
  });
  it('interpolates the live wing clock between ticks while capture holds the exact pose', () => {
    const f=fixture();f.add(1,1,4,0);f.birds[0].speciesId='ringneck';f.runtime.tickBirds(1000/30);
    const slot=f.runtime.slots[0];
    Object.assign(slot,{body:new THREE.Mesh(),wingL:new THREE.Group(),wingR:new THREE.Group(),visualScale:1,airMs:80,previousAirMs:80-1000/30,wobblePh:2,gliding:false});
    const render=(alpha:number)=> (f.runtime as unknown as {update(ctx:unknown,dt:number):void}).update({fixedAlpha:alpha},0);
    f.runtime.frozen=true;render(0);const exact=slot.wingR.rotation.z;
    f.runtime.frozen=false;render(0);const before=slot.wingR.rotation.z;
    render(.5);const middle=slot.wingR.rotation.z;
    render(1);const after=slot.wingR.rotation.z;
    expect(before).not.toBeCloseTo(middle,4);
    expect(middle).not.toBeCloseTo(after,4);
    expect(after).toBeCloseTo(exact,10);
    expect(slot.airMs).toBe(80);
    const position=slot.root.position.clone();render(.25);expect(slot.root.position.equals(position)).toBe(true);
    f.runtime.frozen=true;render(.5);expect(slot.wingR.rotation.z).toBeCloseTo(exact,10);
  });
  it('renders restrained fixed-clock pheasant banking through heading wrap and settles on straight flight', () => {
    const f=fixture();f.add(1,1,4,0);f.birds[0].speciesId='ringneck';f.runtime.tickBirds(1000/30);
    const slot=f.runtime.slots[0];Object.assign(slot,{body:new THREE.Mesh(),wingL:new THREE.Group(),wingR:new THREE.Group(),visualScale:1});
    const runtime=f.runtime as unknown as {updatePheasantBank(slot:unknown,dt:number):void;update(ctx:unknown,dt:number):void};
    const heading=(yaw:number)=>{slot.vxW=Math.sin(yaw)*10;slot.vzW=Math.cos(yaw)*10;runtime.updatePheasantBank(slot,1/30);};
    slot.bank=0;slot.bankYaw=Math.PI-.01;
    heading(-Math.PI+.01);runtime.update({},0);
    expect(slot.bank).toBeLessThan(0);expect(Math.abs(slot.bank)).toBeLessThan(.06);
    expect(slot.root.rotation.z).toBeCloseTo(slot.bank);
    const bank=slot.bank;for(let i=0;i<10;i++)runtime.update({},0);
    expect(slot.bank).toBe(bank);expect(slot.root.rotation.z).toBeCloseTo(bank);
    for(let i=1;i<=30;i++)heading(-Math.PI+.01+i*.02);
    expect(slot.bank).toBeLessThan(-.1);expect(slot.bank).toBeGreaterThanOrEqual(-.35);
    const yaw=slot.bankYaw;
    for(let i=0;i<60;i++)heading(yaw);
    runtime.update({},0);expect(Math.abs(slot.root.rotation.z)).toBeLessThan(.001);
    // A fresh pooled launch must not inherit a previous bird's turn.
    const fresh=fixture();fresh.add(1,1,4,0);fresh.birds[0].speciesId='ringneck';
    Object.assign(fresh.runtime.slots[0],{bank:.3,bankYaw:2});fresh.runtime.tickBirds(1000/30);
    expect(fresh.runtime.slots[0].bank).toBe(0);
  });

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

  it('preserves legacy falling for a non-spatial hunt', () => {
    const f=fixture();f.add(1,1,4,0);f.birds[0].speciesId='ringneck';
    f.runtime.tickBirds(1000/30);f.runtime.spatialEncounter=false;
    const slot=f.runtime.slots[0];Object.assign(slot,{x:4,y:10,z:2,vxW:10,vyW:3,vzW:2});
    f.birds[0].state='downed';f.runtime.downBird(1);f.runtime.tickBirds(1000/30);
    expect(slot.x).toBe(4);expect(slot.z).toBe(2);expect(slot.vyW).toBeLessThan(0);
    const velocity=slot.vyW;f.runtime.tickBirds(1000/30);expect(slot.vyW).toBe(velocity);
  });

  it('picks a hit reaction from the shot, and folds a bird hit without one', () => {
    const f=fixture('pheasant-coverts');f.add(1,1,4,0);f.add(2,1,6,0);
    for(const b of f.birds)b.speciesId='ringneck';
    f.runtime.tickBirds(1000/30);
    const [first,second]=f.runtime.slots;
    for(const slot of [first,second])Object.assign(slot,{status:'flying',y:6,vxW:12,vyW:2,vzW:1});
    const runtime=f.runtime as unknown as {downBird(id:number,impact?:unknown,shot?:unknown):boolean;hitReaction(id:number):string|undefined};
    for(const b of f.birds)b.state='downed';
    expect(runtime.downBird(1)).toBe(true);expect(runtime.hitReaction(1)).toBe('fold');
    expect(runtime.downBird(2,undefined,{offset:.95,wounded:true,rangeM:30})).toBe(true);
    expect(['spiral','sail']).toContain(runtime.hitReaction(2));
    expect(runtime.hitReaction(3)).toBeUndefined();
  });

  it('towers a rooster, folds it at the top and records the fall once', () => {
    const f=fixture('pheasant-coverts');f.add(1,1,4,0);f.birds[0].speciesId='ringneck';
    f.runtime.tickBirds(1000/30);
    const slot=f.runtime.slots[0];Object.assign(slot,{x:4,y:6,z:2,vxW:12,vyW:2,vzW:1});
    f.birds[0].state='downed';f.runtime.downBird(1);
    slot.reaction=createHitReaction('tower',slot.airMs,0,2,mulberry32(8));slot.fallPose=undefined;
    let top=slot.y,folded=false;
    for(let i=0;i<300&&slot.status!=='grounded';i++){
      f.runtime.tickBirds(1000/30);top=Math.max(top,slot.y);
      if(slot.reaction.collapsed&&!folded){folded=true;expect(slot.fallPose).toBeDefined();expect(slot.y).toBeGreaterThan(8.5);}
    }
    expect(folded).toBe(true);expect(top).toBeGreaterThan(9);
    expect(slot.status).toBe('grounded');expect(Math.hypot(slot.x-4,slot.z-2)).toBeLessThan(9);
    const record=(f.runtime.hunt as {recordFallWorld:ReturnType<typeof vi.fn>}).recordFallWorld;
    expect(record).toHaveBeenCalledExactlyOnceWith(1,slot.x,slot.z);
  });

  it('sails a hit bird on with its wings set before it comes down', () => {
    const fall=(kind:'sail'|'fold')=>{
      const f=fixture('pheasant-coverts');f.add(1,1,4,0);f.birds[0].speciesId='ringneck';
      f.runtime.tickBirds(1000/30);
      const slot=f.runtime.slots[0];Object.assign(slot,{x:4,y:6,z:2,vxW:12,vyW:0,vzW:1});
      f.birds[0].state='downed';f.runtime.downBird(1);
      slot.reaction=createHitReaction(kind,slot.airMs,0,0,mulberry32(8));slot.gliding=kind==='sail';
      let glided=0;
      for(let i=0;i<400&&slot.status!=='grounded';i++){f.runtime.tickBirds(1000/30);if(slot.gliding)glided++;}
      return {carry:Math.hypot(slot.x-4,slot.z-2),glided,gliding:slot.gliding};
    };
    const sail=fall('sail'),fold=fall('fold');
    expect(sail.carry).toBeGreaterThan(fold.carry+8);expect(sail.glided).toBeGreaterThan(20);
    expect(sail.gliding).toBe(false);expect(fold.glided).toBe(0);
  });

  it('spins a wing-tipped bird down with only its outside wing beating', () => {
    const f=fixture('pheasant-coverts');f.add(1,1,4,0);f.birds[0].speciesId='ringneck';
    f.runtime.tickBirds(1000/30);
    const slot=f.runtime.slots[0];
    Object.assign(slot,{body:new THREE.Mesh(buildPheasantBody()),wingL:new THREE.Group(),wingR:new THREE.Group(),visualScale:1,x:4,y:8,z:2,vxW:10,vyW:0,vzW:0});
    f.birds[0].state='downed';f.runtime.downBird(1);
    slot.reaction=createHitReaction('spiral',slot.airMs,0,0,mulberry32(8));
    const render=()=> (f.runtime as unknown as {update(ctx:unknown,dt:number):void}).update({},0);
    const turn=Math.sign(slot.reaction.spin);
    render();const yaw0=slot.root.rotation.y;
    expect(slot.root.rotation.z).toBeCloseTo(-turn*.7);
    const folded=(turn>0?slot.wingR:slot.wingL).rotation.clone(),beating=turn>0?slot.wingL:slot.wingR;
    const angles=new Set<number>();
    for(let i=0;i<6;i++){f.runtime.tickBirds(1000/30);render();angles.add(Math.round(beating.rotation.z*100));
      expect((turn>0?slot.wingR:slot.wingL).rotation.equals(folded)).toBe(true);}
    expect(angles.size).toBeGreaterThan(2);
    expect(Math.abs(slot.root.rotation.y-yaw0)).toBeGreaterThan(.8);
    expect(slot.status).toBe('falling');
  });

  it('folds a quail along its line, shedding speed faster than a pheasant', () => {
    const carry = (species: string) => {
      const f=fixture();f.add(1,1,4,0);f.birds[0].speciesId=species;f.runtime.tickBirds(1000/30);
      const slot=f.runtime.slots[0];Object.assign(slot,{x:4,y:10,z:2,vxW:10,vyW:3,vzW:2});
      f.birds[0].state='downed';f.runtime.downBird(1);
      for(let i=0;i<20;i++)f.runtime.tickBirds(1000/30);
      return { x: slot.x - 4, z: slot.z - 2, vx: slot.vxW };
    };
    const quail = carry('bobwhite'), pheasant = carry('ringneck');
    expect(quail.x).toBeGreaterThan(1); expect(quail.z).toBeGreaterThan(.2);
    expect(quail.x).toBeLessThan(pheasant.x); expect(quail.vx).toBeLessThan(pheasant.vx);
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
        expect(sound).toHaveBeenLastCalledWith(Math.hypot(4,.2),sex==='rooster',expect.objectContaining({x:4,y:.2,z:0}),expect.objectContaining({flapRate:9,phaseOffset:0,seed:expect.any(Number)}));
        for(let i=0;i<10;i++)f.runtime.tickBirds(1000/30);
      }
      expect(sound).toHaveBeenCalledTimes(2);
      expect(flutter).not.toHaveBeenCalled();
    } finally {sound.mockRestore();flutter.mockRestore();}
  });
  it.each(['bobwhite', 'chukar', 'sharptail'])('locates each actual %s launch without a global covey chirp', species => {
    const sound = vi.spyOn(audio, 'playBirdFlush').mockImplementation(() => undefined);
    const flutter = vi.spyOn(audio, 'playFlush').mockImplementation(() => {});
    try {
      const f = fixture(); f.runtime.frozen = false;
      f.add(1, 1, 4, 0); f.birds[0].speciesId = species;
      f.runtime.tickBirds(1000 / 30);
      expect(sound).toHaveBeenCalledOnce();
      expect(sound).toHaveBeenLastCalledWith(species, Math.hypot(4, .2), expect.objectContaining({ x: 4, y: .2, z: 0 }),
        expect.objectContaining({ flapRate: getSpecies(species).flight.flapRate, seed: expect.any(Number) }));
      expect(flutter).not.toHaveBeenCalled();
      // A held launch stays silent until its delay actually ends. Turning
      // before that launch must change its audible bearing immediately.
      const slot = f.runtime.slots[0];
      Object.assign(slot, { status: 'waiting', delayMs: 60, x: 4, y: .2, z: 0 });
      const camera = new THREE.PerspectiveCamera(); camera.position.set(12, 2, 0);
      f.runtime.listener = camera;
      f.runtime.tickBirds(1000 / 30); expect(sound).toHaveBeenCalledOnce();
      f.runtime.tickBirds(1000 / 30); expect(sound).toHaveBeenCalledTimes(2);
      expect(sound).toHaveBeenLastCalledWith(species, Math.hypot(8, 1.8), expect.objectContaining({ x: -8, y: -1.8, z: 0 }), expect.any(Object));
    } finally { sound.mockRestore(); flutter.mockRestore(); }
  });
  it('ends launch transients on pause, tab hiding and page departure and removes lifecycle listeners on disposal', () => {
    const doc = Object.assign(new EventTarget(), { hidden: false }), win = new EventTarget();
    vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('location', { search: '' });
    const system = new BirdsSystem();
    const runtime = system as unknown as { slots: Array<{ launchSound?: unknown }> };
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), events: new EventTarget(),
      quality: 'lite', timeOfDay: 'noon', get: (id: string) => id === 'hunt3d'
        ? { areaConfig: () => getArea('quail-fields'), huntState: () => ({ areaId: 'quail-fields' }) }
        : { heightAt: () => 0 } };
    try {
      system.init(ctx as any);
      const sound = () => { const handle = { stop: vi.fn() }; runtime.slots[0].launchSound = handle; return handle; };
      const paused = sound();
      ctx.events.dispatchEvent(new CustomEvent('pause', { detail: true }));
      expect(paused.stop).toHaveBeenCalledOnce(); expect(runtime.slots[0].launchSound).toBeUndefined();
      ctx.events.dispatchEvent(new CustomEvent('pause', { detail: false }));
      expect(paused.stop).toHaveBeenCalledOnce();
      const hidden = sound(); doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
      expect(hidden.stop).toHaveBeenCalledOnce();
      const departing = sound(); win.dispatchEvent(new Event('pagehide')); expect(departing.stop).toHaveBeenCalledOnce();
      const disposed = sound(); system.dispose(ctx as any); expect(disposed.stop).toHaveBeenCalledOnce();
      const orphan = { stop: vi.fn() }; runtime.slots.push({ launchSound: orphan });
      ctx.events.dispatchEvent(new CustomEvent('pause', { detail: true }));
      doc.dispatchEvent(new Event('visibilitychange')); win.dispatchEvent(new Event('pagehide'));
      expect(orphan.stop).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('updates a launched sound with moving bird and listener, then stops it on slot reuse', () => {
    const handle={active:true,updateSpatial:vi.fn((_distance:number,direction:any)=>({...direction})),updateCoverSpatial:vi.fn(),stop:vi.fn()};
    const sound=vi.spyOn(audio,'playPheasantFlush').mockReturnValue(handle);
    try {
      const f=fixture();f.runtime.frozen=false;f.add(1,1,4,0);f.birds[0].speciesId='ringneck';
      const camera=new THREE.PerspectiveCamera();f.runtime.listener=camera;
      f.runtime.tickBirds(1000/30);
      const slot=f.runtime.slots[0];Object.assign(slot,{body:new THREE.Mesh(),wingL:new THREE.Group(),wingR:new THREE.Group(),visualScale:1});
      const render=()=> (f.runtime as unknown as {update(ctx:unknown,dt:number):void}).update({camera},0);
      render();expect(handle.updateSpatial).toHaveBeenLastCalledWith(Math.hypot(4,.2),expect.objectContaining({x:4,y:.2,z:0}));
      camera.rotation.y=Math.PI;render();expect(handle.updateSpatial.mock.calls.at(-1)![1].x).toBeCloseTo(-4);
      slot.x=8;camera.position.x=2;render();expect(handle.updateCoverSpatial).toHaveBeenLastCalledWith(Math.hypot(2,.2),expect.objectContaining({x:-2,y:.2,z:expect.any(Number)}));expect(handle.updateSpatial.mock.calls.at(-1)![0]).toBe(Math.hypot(6,.2));expect(handle.updateSpatial.mock.calls.at(-1)![1].x).toBeCloseTo(-6);
      camera.position.set(0,0,0);camera.rotation.set(0,0,0);Object.assign(slot,{x:0,y:0,z:-4});
      render();expect(handle.updateSpatial.mock.calls.at(-1)![1].z).toBe(-4);
      camera.rotation.y=Math.PI;render();expect(handle.updateSpatial.mock.calls.at(-1)![1].z).toBeCloseTo(4);
      camera.rotation.set(Math.PI/2,0,0);render();expect(handle.updateSpatial.mock.calls.at(-1)![1].y).toBeCloseTo(-4);
      expect(sound).toHaveBeenCalledOnce();
      slot.status='done';f.add(2,2,9,0);f.birds[1].speciesId='ringneck';f.runtime.tickBirds(1000/30);
      expect(handle.stop).toHaveBeenCalledOnce();
      handle.active=false;render();expect(slot.launchSound).toBeUndefined();
    } finally {sound.mockRestore();}
  });
  it('ends airborne wing and call audio when the bird is hit', () => {
    const handle={active:true,updateSpatial:vi.fn(),stop:vi.fn()};
    const sound=vi.spyOn(audio,'playPheasantFlush').mockReturnValue(handle);
    try {
      const f=fixture();f.runtime.frozen=false;f.add(1,1,4,0);f.birds[0].speciesId='ringneck';
      f.runtime.tickBirds(1000/30);expect(sound).toHaveBeenCalledOnce();
      expect(f.runtime.downBird(1)).toBe(true);expect(handle.stop).toHaveBeenCalledOnce();
      expect(f.runtime.slots[0].launchSound).toBeUndefined();
      expect(f.runtime.downBird(1)).toBe(false);expect(handle.stop).toHaveBeenCalledOnce();
    } finally {sound.mockRestore();}
  });
  it('positions a delayed pheasant sound against the current listener rather than the original flush camera', () => {
    const sound=vi.spyOn(audio,'playPheasantFlush').mockImplementation(()=>{});
    try {
      const f=fixture();f.add(1,1,4,0);f.birds[0].speciesId='ringneck';
      f.runtime.tickBirds(1000/30); // Frozen first launch is silent.
      expect(sound).not.toHaveBeenCalled();
      const slot=f.runtime.slots[0];Object.assign(slot,{status:'waiting',delayMs:30,x:4,z:0});
      const camera=new THREE.PerspectiveCamera();camera.position.set(12,2,0);
      f.runtime.listener=camera;f.runtime.frozen=false;f.runtime.tickBirds(1000/30);
      expect(sound).toHaveBeenLastCalledWith(Math.hypot(8,1.8),false,expect.objectContaining({x:-8,y:-1.8,z:0}),expect.objectContaining({flapRate:9}));
      Object.assign(slot,{status:'waiting',delayMs:30});camera.rotation.y=Math.PI/2;
      f.runtime.tickBirds(1000/30);
      expect(sound.mock.calls.at(-1)![2]!.x).toBeCloseTo(0,6);
      expect(sound.mock.calls.at(-1)![2]!.z).toBeCloseTo(-8,6);
    } finally {sound.mockRestore();}
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
    // Launch alone only checks the displayed velocity; the controller must
    // retain that impulse when the first real flight tick moves the bird.
    // The underfoot bird also towers (closeFlush.ts): its climb never falls
    // below the distance law, and the extra push fades over the first beats.
    for (let i = 0; i < 15; i++) {
      for (const f of [close, far]) f.runtime.tickBirds(1000 / 30);
      expect(close.runtime.slots[0].vyW / far.runtime.slots[0].vyW).toBeGreaterThan(1.25 / .85 - .01);
    }
    expect((close.runtime.slots[0].y - .2) / (far.runtime.slots[0].y - .2)).toBeGreaterThan(1.25 / .85);
    // Nearly straight up at first: little ground covered in the first half second.
    expect(Math.hypot(close.runtime.slots[0].vxW, close.runtime.slots[0].vzW)).toBeLessThan(Math.hypot(far.runtime.slots[0].vxW, far.runtime.slots[0].vzW));
  });
  it('pops a covey sat on underfoot to head height, then lines it out like any other', () => {
    const close = fixture(), far = fixture();
    close.add(1, 1, 3, 0); far.add(1, 1, 40, 0);
    for (const f of [close, far]) { f.birds[0].speciesId = 'bobwhite'; f.runtime.spatialEncounter = true; }
    for (let i = 0; i < 12; i++) for (const f of [close, far]) f.runtime.tickBirds(1000 / 30);
    expect(close.runtime.slots[0].y).toBeGreaterThan(far.runtime.slots[0].y + .4);
    for (let i = 0; i < 60; i++) for (const f of [close, far]) f.runtime.tickBirds(1000 / 30);
    expect(Math.abs(close.runtime.slots[0].y - far.runtime.slots[0].y)).toBeLessThan(1);
  });
  it.each([
    { species: 'ringneck', spatial: false },
  ])('keeps distance-independent climb for $species with spatial=$spatial', ({ species, spatial }) => {
    const close = fixture(), far = fixture();
    close.add(1, 1, 3, 0); far.add(1, 1, 40, 0);
    for (const f of [close, far]) {
      f.birds[0].speciesId = species;
      f.runtime.spatialEncounter = spatial;
      f.runtime.tickBirds(1000 / 30);
    }
    for (let i = 0; i < 15; i++) {
      expect(close.runtime.slots[0].vyW).toBeCloseTo(far.runtime.slots[0].vyW);
      for (const f of [close, far]) f.runtime.tickBirds(1000 / 30);
    }
    expect(close.runtime.slots[0].y).toBeCloseTo(far.runtime.slots[0].y);
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


describe('Chukar launch slope in world flight', () => {
  const flight = (slope: SlopeApproach | null, species = 'chukar', area = 'chukar-ridge', spatial = true) => {
    const f = fixture(area); f.runtime.spatialEncounter = spatial;
    f.add(1, 1, 12, 4); f.birds[0].speciesId = species; f.slopes.set(1, slope);
    f.runtime.tickBirds(1000 / 30);
    return f;
  };
  const velocity = (f: ReturnType<typeof flight>) => {
    const s = f.runtime.slots[0]; return [s.vxW, s.vyW, s.vzW];
  };

  it.each(['chukar-ridge', 'quail-fields'])('applies the earned slope once to actual Chukar flight on %s', area => {
    const above = flight('above', 'chukar', area), level = flight('level', 'chukar', area), below = flight('below', 'chukar', area), absent = flight(null, 'chukar', area);
    for (const f of [above, below, absent]) {
      expect([f.runtime.slots[0].x, f.runtime.slots[0].z, f.runtime.slots[0].delayMs]).toEqual([12, 4, level.runtime.slots[0].delayMs]);
    }
    for (let tick = 1; tick <= 75; tick++) {
      for (const f of [above, level, below, absent]) f.runtime.tickBirds(1000 / 30);
      const a = velocity(above), l = velocity(level), b = velocity(below);
      expect(velocity(absent)).toEqual(l);
      for (const index of [0, 2]) { expect(a[index]).toBeCloseTo(l[index] * .82, 10); expect(b[index]).toBeCloseTo(l[index] * 1.15, 10); }
      expect(a[1]).toBeCloseTo(l[1] * .82 * .85, 10); expect(b[1]).toBeCloseTo(l[1] * 1.15, 10);
    }
    expect(above.runtime.slots[0].x - 12).toBeCloseTo((level.runtime.slots[0].x - 12) * .82, 10);
    expect(below.runtime.slots[0].z - 4).toBeCloseTo((level.runtime.slots[0].z - 4) * 1.15, 10);
  });

  it('keeps the relative reward after the base horizontal cap without compounding it', () => {
    const variants = [flight('above'), flight('level'), flight('below')];
    for (const f of variants) { f.runtime.slots[0].vel.x = 10000; f.runtime.slots[0].vel.y = -1000; }
    for (let tick = 0; tick < 15; tick++) {
      variants.forEach(f => f.runtime.tickBirds(1000 / 30));
      variants.forEach((f, i) => expect(Math.hypot(f.runtime.slots[0].vxW, f.runtime.slots[0].vzW)).toBeCloseTo(18.5 * [.82, 1, 1.15][i], 10));
    }
  });

  it.each(['hun', 'bobwhite', 'ringneck'])('leaves %s bycatch unchanged on Chukar Ridge', species => {
    const variants = [flight('above', species), flight(null, species), flight('below', species)];
    for (let tick = 0; tick < 60; tick++) {
      variants.forEach(f => f.runtime.tickBirds(1000 / 30));
      expect(velocity(variants[0])).toEqual(velocity(variants[1])); expect(velocity(variants[2])).toEqual(velocity(variants[1]));
    }
  });

  it('does not alter the legacy nonspatial 3D controller', () => {
    const variants = [flight('above', 'chukar', 'chukar-ridge', false), flight(null, 'chukar', 'chukar-ridge', false)];
    for (let tick = 0; tick < 60; tick++) { variants.forEach(f => f.runtime.tickBirds(1000 / 30)); expect(velocity(variants[0])).toEqual(velocity(variants[1])); }
  });

  it('retains each overlapping rise through queue delay, camera changes, and slot reuse', () => {
    const f = fixture('chukar-ridge');
    for (let id = 1; id <= 15; id++) { f.add(id, id <= 14 ? 1 : 2, 15, id); f.birds.at(-1)!.speciesId = 'chukar'; f.slopes.set(id, id <= 14 ? 'above' : 'below'); }
    // A sibling Hun shares the rise, but not the Chukar flight payoff.
    f.birds[1].speciesId = 'hun';
    f.runtime.tickBirds(1000 / 30);
    expect(f.runtime.slots.every(s => s.flight.slopeApproach === 'above')).toBe(true);
    expect(f.runtime.slots.find(s => s.simId === 2)!.species.id).toBe('hun');
    // Authority may settle later and the player may turn; the queued launch
    // must retain its own actual event, not query whichever rise is newest.
    f.slopes.clear(); f.runtime.listener = new THREE.PerspectiveCamera(); f.runtime.listener.position.y = 150;
    f.runtime.slots[0].status = 'done'; f.runtime.tickBirds(1000 / 30);
    const reused = f.runtime.slots.find(s => s.simId === 15)!; expect(reused.flight.slopeApproach).toBe('below');
    reused.status = 'done'; f.add(16, 3, 16, 4); f.birds.at(-1)!.speciesId = 'chukar'; f.runtime.tickBirds(1000 / 30);
    expect(f.runtime.slots.find(s => s.simId === 16)!.flight.slopeApproach).toBeNull();
  });
});
