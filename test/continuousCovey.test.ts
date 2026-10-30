import type { SlopeApproach } from '../src/game/fieldcraft';
import { buildPheasantBody } from '../src/three/assets/pheasant';
import * as audio from '../src/audio';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BirdsSystem, pickBirdAlongRay } from '../src/three/subsystems/birds';
import { countsAgainstCap, GUN_PATIENCE_MS, holdsSky, SLEEPER_MIN_MS } from '../src/game/riseScore';
import type { Bird } from '../src/game/birds';
import { getSpecies } from '../src/game/species';
import { getArea } from '../src/game/areas';
import { QuailFlushDebris } from '../src/three/quailFlushDebris';
import { CoverEruption } from '../src/three/coverEruption';
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

const IN_PLAY = ['waiting', 'flying', 'falling'];

/** Birds holding the sky against the next wave (riseScore holdsSky), from
 * the fixture's hunter at the origin. */
function holding(f: ReturnType<typeof fixture>) {
  const skyMs = (f.runtime as unknown as { skyMs: number }).skyMs;
  return f.runtime.slots.filter(s => holdsSky({ status: s.status, rangeM: Math.hypot(s.x, s.z),
    sinceLaunchMs: skyMs - (s.launchedSkyMs ?? -Infinity) }));
}

/** Run a rise until it settles, recording each bird's launch (a slot copy at
 * the tick it left the cover) and the most birds ever in the air. */
function flyOut(f: ReturnType<typeof fixture>, maxTicks = 30 * 150) {
  const launched = new Map<number, { tick: number; slot: Record<string, any> }>();
  let maxInPlay = 0;
  for (let tick = 0; tick < maxTicks && !f.finishRise.mock.calls.length; tick++) {
    f.runtime.tickBirds(1000 / 30);
    const inPlay = f.runtime.slots.filter(s => IN_PLAY.includes(s.status));
    maxInPlay = Math.max(maxInPlay, holding(f).length);
    for (const s of inPlay) {
      if (!launched.has(s.simId)) launched.set(s.simId, { tick, slot: { ...s, spatialFlight: s.spatialFlight && { ...s.spatialFlight } } });
    }
  }
  return { launched, maxInPlay };
}

describe('continuous Quail coveys', () => {
  it('breaks a big bobwhite covey in waves whose birds take distinct bearings from their actual cover', () => {
    const launch = () => {
      const f = fixture();
      for (let id = 1; id <= 12; id++) f.add(id, 1, 15 + id * .2, (id % 3 - 1) * .3);
      return { f, ...flyOut(f) };
    };
    const run = launch(), repeated = launch();
    expect(run.launched.size).toBe(12);
    expect(run.maxInPlay).toBeLessThanOrEqual(3);
    const waves = new Map<number, number[]>();
    for (const [simId, launch] of run.launched) {
      const s = launch.slot;
      const away = Math.atan2(s.flight.escZ, s.flight.escX);
      const offset = Math.atan2(Math.sin(s.line.bearing - away), Math.cos(s.line.bearing - away));
      waves.set(launch.tick, [...waves.get(launch.tick) ?? [], offset]);
      const bird = run.f.birds.find(b => b.id === simId)!;
      expect([s.x, s.z]).toEqual([bird.pos.x, bird.pos.y]);
      expect(s.line).toEqual(repeated.launched.get(simId)!.slot.line);
      expect(s.line.speed).toBeGreaterThanOrEqual(115 * .12 * .92);
      expect(s.line.speed).toBeLessThanOrEqual(155 * .12 * .92);
      // Still a burst away from the gun: lanes either side of the line, the
      // outer ones turned further across the shooter's view.
      expect(Math.abs(offset)).toBeLessThan(Math.PI / 2);
    }
    // Waves of three (this stream holds a sleeper back to the end), each
    // wave-mate on its own lane, never a stream of nearly parallel departures.
    expect([...waves.values()].map(wave => wave.length)).toEqual([3, 3, 3, 2, 1]);
    for (const wave of waves.values()) {
      const sorted = [...wave].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(.25);
    }
  });

  it('holds a bobwhite departure before smoothly finding and landing in its actual escape cover', () => {
    const f = fixture(), free = fixture();
    for (const run of [f, free]) {
      // A broad stand of cover ahead, wide enough for every lane of the wave.
      (run.runtime.hunt as { coverPatches: () => unknown[] }).coverPatches = () => [{ cx: 70, cz: 0, hx: 20, hz: 60 }];
      for (let id = 1; id <= 9; id++) run.add(id, 1, 12 + id * .25, (id % 3 - 1) * .4);
      run.runtime.tickBirds(1000 / 30);
    }
    const slot = f.runtime.slots.find(s => s.line?.target)!;
    expect(slot).toBeDefined();
    const target = { ...slot.line.target };
    const freeSlot = free.runtime.slots.find(s => s.simId === slot.simId)!;
    freeSlot.line.target = undefined;
    let compared = 0, previousHeading: number | undefined, maxTurn = 0;
    for (let tick = 0; tick < 300 && slot.status !== 'done'; tick++) {
      f.runtime.tickBirds(1000 / 30); free.runtime.tickBirds(1000 / 30);
      if (slot.status !== 'flying') continue;
      if (slot.airMs <= 800) {
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
    const runtime=f.runtime as unknown as {updateBank(slot:unknown,dt:number):void;update(ctx:unknown,dt:number):void};
    const heading=(yaw:number)=>{slot.vxW=Math.sin(yaw)*10;slot.vzW=Math.cos(yaw)*10;runtime.updateBank(slot,1/30);};
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

  it('picks a hit reaction from the shot, and folds a bird hit without one', () => {
    // Two pheasants from separate pockets: a lone bird is its own wave.
    const f=fixture('pheasant-coverts');f.add(1,1,4,0);f.add(2,2,6,0);
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
  it('blows the cover out over every bird of the covey at the flush, sized to the covey, three in the air or not', () => {
    const throwFor = (birds: number) => {
      const f = fixture();
      const eruption = new CoverEruption('high', () => 0, 'quail-fields');
      (f.runtime as unknown as { eruption: CoverEruption }).eruption = eruption;
      for (let i = 0; i < birds; i++) f.add(i + 1, 1, 30 + (i % 4), (Math.floor(i / 4) - 1) * .9);
      f.runtime.tickBirds(1000 / 30);
      const audit = eruption.audit();
      // The shaking cover reaches over the whole covey, not just its middle.
      for (let i = 0; i < 9; i++) f.runtime.tickBirds(1000 / 30);
      const burst = { x: 0, z: 0, r: 0 }; (f.runtime as unknown as { burstPoint(out: typeof burst): void }).burstPoint(burst);
      eruption.dispose();
      return { ...audit, shake: burst.r };
    };
    const five = throwFor(5), twelve = throwFor(12);
    expect(five.bursts).toBe(1); expect(twelve.bursts).toBe(1);
    expect(twelve.puffs).toBe(CoverEruption.size(12, 'high').puffs);
    expect(twelve.puffs).toBeGreaterThan(five.puffs);
    expect(twelve.flakes).toBeGreaterThan(five.flakes);
    expect(twelve.shake).toBeGreaterThan(five.shake);
  });

  it('erupts across the whole covey at the flush, then disturbs each bird again as it rises, without changing flight at either quality', () => {
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
    const firstWave = new Set(reference.runtime.slots.filter(s => IN_PLAY.includes(s.status)).map(s => s.simId));
    expect(firstWave.size).toBe(3);
    const spot = (id: number) => { const bird = reference.birds.find(b => b.id === id)!; return { x: bird.pos.x, z: bird.pos.y }; };
    for (const [i, f] of variants.entries()) {
      expect(snapshot(f)).toEqual(snapshot(reference));
      // The six birds still in the cover blow it out where they sit, now.
      const held = reference.birds.filter(b => !firstWave.has(b.id)).map(b => spot(b.id));
      expect(disturbances[i].slice(0, 6)).toEqual(held);
      expect(f.runtime.launchCover!.audit().launches).toBeGreaterThanOrEqual(6);
    }
    for (const f of [reference, ...variants]) flyOut(f);
    for (const [i, f] of variants.entries()) {
      // Each held bird is disturbed twice (the eruption, then its own rise);
      // each first-wave bird once, as it goes.
      expect(disturbances[i]).toHaveLength(15);
      for (const bird of f.birds) {
        const count = disturbances[i].filter(d => d.x === bird.pos.x && d.z === bird.pos.y).length;
        expect(count).toBe(firstWave.has(bird.id) ? 1 : 2);
      }
      expect(snapshot(f)).toEqual(snapshot(reference));
      expect(f.runtime.launchCover!.audit().launches).toBe(15);
      f.runtime.launchCover!.dispose();
    }
  });
  it('towers a rooster flushed underfoot almost straight up, where a distant one carries away sooner', () => {
    const close = fixture(), far = fixture();
    close.add(1, 1, 3, 0); far.add(1, 1, 40, 0);
    for (const f of [close, far]) f.birds[0].speciesId = 'ringneck';
    const travel = (f: ReturnType<typeof fixture>, x0: number) => Math.hypot(f.runtime.slots[0].x - x0, f.runtime.slots[0].z);
    for (let i = 0; i < 18; i++) for (const f of [close, far]) f.runtime.tickBirds(1000 / 30);
    // Half a second out: the underfoot rooster is higher and has covered less ground.
    expect(close.runtime.slots[0].y).toBeGreaterThan(far.runtime.slots[0].y + 1);
    expect(travel(close, 3)).toBeLessThan(travel(far, 40));
    expect(travel(close, 3)).toBeLessThan(close.runtime.slots[0].y);
    for (let i = 0; i < 60; i++) for (const f of [close, far]) f.runtime.tickBirds(1000 / 30);
    // Then it levels off and drives away like any rooster.
    expect(Math.hypot(close.runtime.slots[0].vxW, close.runtime.slots[0].vzW)).toBeGreaterThan(12);
  });
  it('pops a covey sat on underfoot to head height, then lines it out like any other', () => {
    const close = fixture(), far = fixture();
    // Seen from high above, both lines stay against the sky: no sky lift
    // muddies the comparison of the pop itself.
    for (const f of [close, far]) { const eye = new THREE.PerspectiveCamera(); eye.position.set(0, 60, 0); f.runtime.listener = eye; }
    close.add(1, 1, 3, 0); far.add(1, 1, 40, 0);
    for (const f of [close, far]) f.birds[0].speciesId = 'bobwhite';
    for (let i = 0; i < 12; i++) for (const f of [close, far]) f.runtime.tickBirds(1000 / 30);
    expect(close.runtime.slots[0].y).toBeGreaterThan(far.runtime.slots[0].y + .4);
    for (let i = 0; i < 60; i++) for (const f of [close, far]) f.runtime.tickBirds(1000 / 30);
    expect(Math.abs(close.runtime.slots[0].y - far.runtime.slots[0].y)).toBeLessThan(1.2);
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
    landing.line.target = { x: 75, z: 12 };
    const leaving = f.runtime.slots.find(s => s.simId === 2)!;
    leaving.line.target = undefined;
    for (let i = 0; i < 14 * 30; i++) f.runtime.tickBirds(1000 / 30);
    expect(resolveBird).toHaveBeenCalledWith(1, 'escaped', { x: landing.x, z: landing.z });
    expect(Math.hypot(landing.x - 75, landing.z - 12)).toBeLessThan(.5);
    expect(landing.y).toBeCloseTo(.25);
    expect(resolveBird).toHaveBeenCalledWith(2, 'escaped');
    expect(resolveBird).toHaveBeenCalledTimes(2);
  });
  it('rises a covey in waves of at most three from its actual cover, and settles only when the last bird is out', () => {
    // Duck Hunt rules the sky (DESIGN.md): the whole covey flushes, three fly.
    const f=fixture();
    for(let i=0;i<7;i++) f.add(i,1,30+i*3,12-i);
    f.runtime.tickBirds(1000/30);
    const active=f.runtime.slots.filter(s=>s.status!=='idle');
    expect(active).toHaveLength(3);
    for(const s of active){const b=f.birds.find(b=>b.id===s.simId)!;expect([s.x,s.z]).toEqual([b.pos.x,b.pos.y]);}
    expect(f.finishRise).not.toHaveBeenCalled();
    const firstWave=new Set(active.map(s=>s.simId));
    const {launched,maxInPlay}=flyOut(f);
    expect(launched.size).toBe(7);expect(maxInPlay).toBeLessThanOrEqual(3);
    for(const [id,{slot}] of launched){
      if(firstWave.has(id))continue; // already on the wing when the record began
      const b=f.birds.find(b=>b.id===id)!;expect([slot.x,slot.z]).toEqual([b.pos.x,b.pos.y]);
    }
    expect(f.finishRise).toHaveBeenCalledOnce();
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
  it('keeps every queued bird of a covey bigger than the pool, and holds a wave together until the pool has room', () => {
    const f=fixture();for(let i=0;i<20;i++) f.add(i,1,40,i);
    // Twelve shot birds still lie in the grass: two free slots cannot take a wave of three.
    for(let i=0;i<12;i++){
      f.birds.push({id:100+i,coveyId:9,pos:{x:0,y:0},state:'downed',speciesId:'bobwhite',runs:false,runEnergy:0,restingMs:0,nerveMs:0});
      Object.assign(f.runtime.slots[i],{status:'grounded',simId:100+i});
    }
    f.runtime.tickBirds(1000/30);
    expect(f.runtime.slots.filter(s=>IN_PLAY.includes(s.status))).toHaveLength(0);
    expect(f.finishRise).not.toHaveBeenCalled();
    for(let i=0;i<6;i++) f.runtime.slots[i].status='done';
    const {launched,maxInPlay}=flyOut(f);
    expect([...launched.keys()].sort((a,b)=>a-b)).toEqual(Array.from({length:20},(_,i)=>i));
    expect(maxInPlay).toBeLessThanOrEqual(3);
    expect(f.finishRise).toHaveBeenCalledOnce();
  });
});


describe('Chukar launch slope in world flight', () => {
  const flight = (slope: SlopeApproach | null, species = 'chukar', area = 'chukar-ridge', drivesOff = true) => {
    const f = fixture(area);
    f.add(1, 1, 12, 4); f.birds[0].speciesId = species; f.slopes.set(1, slope);
    // A line that drives off: the slope rule scales the pace of one line (a
    // miss setting down eases its own speed into its spot).
    // (A relit single is the one bird that never sets down again, and flies a little wilder.)
    if (drivesOff) (f.birds[0] as { single?: boolean }).single = true;
    f.runtime.tickBirds(1000 / 30);
    return f;
  };
  const velocity = (f: ReturnType<typeof flight>) => {
    const s = f.runtime.slots[0]; return [s.vxW, s.vyW, s.vzW];
  };

  it.each(['chukar-ridge', 'quail-fields'])('flies the same Chukar line at the slope rule\'s pace on %s', area => {
    const above = flight('above', 'chukar', area), level = flight('level', 'chukar', area), below = flight('below', 'chukar', area), absent = flight(null, 'chukar', area);
    for (const f of [above, below, absent]) {
      expect([f.runtime.slots[0].x, f.runtime.slots[0].z, f.runtime.slots[0].delayMs]).toEqual([12, 4, level.runtime.slots[0].delayMs]);
      expect(f.runtime.slots[0].line.bearing).toBe(level.runtime.slots[0].line.bearing);
    }
    // Inside the shot: past 40 m every bird lines out at its leaving pace.
    const inShot = () => [above, level, below].every(f => Math.hypot(f.runtime.slots[0].x, f.runtime.slots[0].z) < 39);
    for (let tick = 1; tick <= 75 && inShot(); tick++) {
      for (const f of [above, level, below, absent]) f.runtime.tickBirds(1000 / 30);
      if (!inShot()) break;
      const a = velocity(above), l = velocity(level), b = velocity(below);
      expect(velocity(absent)).toEqual(l);
      for (const index of [0, 2]) { expect(a[index]).toBeCloseTo(l[index] * .82, 10); expect(b[index]).toBeCloseTo(l[index] * 1.15, 10); }
    }
    expect(Math.hypot(below.runtime.slots[0].x, below.runtime.slots[0].z)).toBeGreaterThan(30);
  });

  it('keeps the relative reward on the speed cap: 15.17, 18.5 and 21.275 m/s', () => {
    const variants = [flight('above', 'chukar', 'chukar-ridge', false), flight('level', 'chukar', 'chukar-ridge', false), flight('below', 'chukar', 'chukar-ridge', false)];
    variants.forEach((f, i) => expect(f.runtime.slots[0].line.speed).toBeCloseTo(18.5 * [.82, 1, 1.15][i], 10));
  });

  it.each(['hun', 'bobwhite', 'ringneck'])('leaves %s bycatch unchanged on Chukar Ridge', species => {
    const variants = [flight('above', species), flight(null, species), flight('below', species)];
    for (let tick = 0; tick < 60; tick++) {
      variants.forEach(f => f.runtime.tickBirds(1000 / 30));
      expect(velocity(variants[0])).toEqual(velocity(variants[1])); expect(velocity(variants[2])).toEqual(velocity(variants[1]));
    }
  });

  it('retains each overlapping rise through queue delay, camera changes, and slot reuse', () => {
    const f = fixture('chukar-ridge');
    for (let id = 1; id <= 15; id++) { f.add(id, id <= 14 ? 1 : 2, 15, id); f.birds.at(-1)!.speciesId = 'chukar'; f.slopes.set(id, id <= 14 ? 'above' : 'below'); }
    // A sibling Hun shares the rise, but not the Chukar flight payoff.
    f.birds[1].speciesId = 'hun';
    f.runtime.tickBirds(1000 / 30);
    const first = f.runtime.slots.filter(s => IN_PLAY.includes(s.status));
    expect(first.length).toBe(3);
    expect(first.every(s => s.flight.slopeApproach === 'above')).toBe(true);
    // Authority may settle later and the player may turn; a queued launch
    // must retain its own actual event, not query whichever rise is newest.
    f.slopes.clear(); f.runtime.listener = new THREE.PerspectiveCamera(); f.runtime.listener.position.y = 150;
    const { launched, maxInPlay } = flyOut(f);
    expect(maxInPlay).toBeLessThanOrEqual(3);
    expect(launched.size).toBe(15);
    for (const [id, { slot }] of launched) expect(slot.flight.slopeApproach).toBe(id <= 14 ? 'above' : 'below');
    expect(launched.get(2)!.slot.species.id).toBe('hun');
    f.add(16, 3, 16, 4); f.birds.at(-1)!.speciesId = 'chukar'; f.finishRise.mockClear(); f.runtime.tickBirds(1000 / 30);
    expect(f.runtime.slots.find(s => s.simId === 16 && IN_PLAY.includes(s.status))!.flight.slopeApproach).toBeNull();
  });
});

describe('Duck Hunt rules the sky', () => {
  /** A double the test fires and reloads by hand. */
  const gunFor = (f: ReturnType<typeof fixture>) => {
    const gun = { shells: 2, reloading: false, shellsRemaining() { return this.shells; }, shellCapacity() { return 2; }, isReloading() { return this.reloading; } };
    (f.runtime as unknown as { gunReadout: () => typeof gun }).gunReadout = () => gun;
    return gun;
  };
  const inPlay = (f: ReturnType<typeof fixture>) => f.runtime.slots.filter(s => IN_PLAY.includes(s.status));
  const rises = (f: ReturnType<typeof fixture>) => (f.runtime as unknown as { rises: { waves: { ids: number[]; sleeper: boolean }[]; next: number }[] }).rises;
  const tickUntil = (f: ReturnType<typeof fixture>, done: () => boolean, max = 30 * 30) => {
    let ticks = 0;
    while (!done() && ticks < max) { f.runtime.tickBirds(1000 / 30); ticks++; }
    return ticks;
  };

  it('never has more than three live targets holding the sky across overlapping coveys and species', () => {
    const f = fixture('sharptail-prairie');
    const flush = (from: number, n: number, covey: number, species: string, x: number, z: number) => {
      for (let i = 0; i < n; i++) { f.add(from + i, covey, x + (i % 3) * .7, z + Math.floor(i / 3) * .7); f.birds.at(-1)!.speciesId = species; }
    };
    flush(1, 9, 1, 'bobwhite', 20, 6);
    let most = 0;
    for (let tick = 0; tick < 30 * 240; tick++) {
      if (tick === 20) flush(20, 7, 2, 'chukar', -18, 10);
      if (tick === 80) flush(40, 6, 3, 'sharptail', 4, -22);
      if (tick === 95) { flush(60, 1, 4, 'ringneck', 9, 9); flush(61, 1, 5, 'ringneck', 11, 9); }
      f.runtime.tickBirds(1000 / 30);
      most = Math.max(most, holding(f).length);
      expect(holding(f).length).toBeLessThanOrEqual(3);
    }
    expect(most).toBe(3);
    expect(rises(f)).toHaveLength(0);
    expect(f.finishRise).toHaveBeenCalled();
  });

  it('gets a twelve-bird covey through its waves without a shot, never more than three in the sky, a sleeper soon after', () => {
    const f = fixture();
    for (let i = 0; i < 12; i++) f.add(i + 1, 1, 18 + (i % 4) * .6, (Math.floor(i / 4) - 1) * .8);
    let waves: number | null = null, over: number | null = null;
    for (let tick = 1; tick <= 30 * 20; tick++) {
      f.runtime.tickBirds(1000 / 30);
      expect(holding(f).length).toBeLessThanOrEqual(3);
      // Leaving birds count until they are 55 m off: the sky never shows six.
      expect(f.runtime.slots.filter(s => countsAgainstCap({ status: s.status, rangeM: Math.hypot(s.x, s.z) })).length).toBeLessThanOrEqual(3);
      const left = rises(f)[0]?.waves.slice(rises(f)[0].next) ?? [];
      const clear = holding(f).length === 0;
      if (waves === null && clear && left.every(wave => wave.sleeper)) waves = tick / 30;
      if (over === null && clear && left.length === 0) over = tick / 30;
    }
    expect(waves).not.toBeNull(); expect(over).not.toBeNull();
    // This fixture's flat-ground bobwhite fly about 15 m/s; the rise lab puts
    // 8-plus-bird rises on the real grounds at 9-10 s.
    expect(waves!).toBeLessThan(12.5);
    expect(over! - waves!).toBeLessThan(3);
  });

  it('keeps a queued bird out of the shot until its wave rises', () => {
    const f = fixture();
    for (let i = 1; i <= 9; i++) f.add(i, 1, 24 + (i % 3), (i % 4) - 1.5);
    for (let i = 0; i < 9; i++) f.runtime.tickBirds(1000 / 30);
    const up = new Set(inPlay(f).map(s => s.simId));
    const queued = f.birds.filter(b => !up.has(b.id));
    expect(queued).toHaveLength(6);
    const eye = { x: 0, y: 1.62, z: 0 };
    const targets = (f.runtime as unknown as { shotTargets(): readonly { simId: number; x: number; y: number; z: number; status: string }[] }).shotTargets();
    for (const bird of queued) {
      // Aimed straight at a queued bird's cover: nothing there to hit yet.
      const picked = pickBirdAlongRay(targets, eye, { x: bird.pos.x - eye.x, y: .2 - eye.y, z: bird.pos.y - eye.z }, .001);
      expect(picked === null || up.has(picked)).toBe(true);
    }
    const flying = inPlay(f).find(s => s.status === 'flying')!;
    expect(pickBirdAlongRay(targets, eye, { x: flying.x - eye.x, y: flying.y - eye.y, z: flying.z - eye.z }, .001)).toBe(flying.simId);
    // Nothing still in the cover is ever settled as escaped or downed.
    for (let i = 0; i < 60; i++) f.runtime.tickBirds(1000 / 30);
    const resolve = (f.runtime.hunt as { resolveBird: ReturnType<typeof vi.fn> }).resolveBird;
    for (const call of resolve.mock.calls) expect(up.has(call[0])).toBe(true);
  });

  it('holds the next wave for an empty gun, and lifts it as the gun comes back loaded', () => {
    const f = fixture(), gun = gunFor(f);
    for (let i = 1; i <= 6; i++) f.add(i, 1, 18 + i * .4, (i % 3) - 1);
    f.runtime.tickBirds(1000 / 30);
    expect(holding(f)).toHaveLength(3);
    gun.shells = 0; // Both barrels at the first wave.
    tickUntil(f, () => holding(f).length === 0);
    // Sky clear, gun empty: the covey sits on, though the breath alone would let it go.
    const waiting = rises(f)[0].next;
    for (let i = 0; i < 30; i++) { f.runtime.tickBirds(1000 / 30); expect(rises(f)[0].next).toBe(waiting); }
    gun.reloading = true; for (let i = 0; i < 20; i++) f.runtime.tickBirds(1000 / 30);
    expect(rises(f)[0].next).toBe(waiting);
    gun.reloading = false; gun.shells = 2;
    f.runtime.tickBirds(1000 / 30);
    expect(holding(f).length).toBeGreaterThan(0);
  });

  it('does not wait for ever on a hunter who never reloads', () => {
    const f = fixture(), gun = gunFor(f);
    for (let i = 1; i <= 6; i++) f.add(i, 1, 18 + i * .4, (i % 3) - 1);
    f.runtime.tickBirds(1000 / 30);
    gun.shells = 0;
    tickUntil(f, () => holding(f).length === 0);
    const waiting = rises(f)[0].next;
    const waited = tickUntil(f, () => rises(f).length === 0 || rises(f)[0].next > waiting) * 1000 / 30;
    expect(waited).toBeGreaterThan(GUN_PATIENCE_MS);
    expect(waited).toBeLessThan(GUN_PATIENCE_MS + 600);
  });

  it('lifts a wave that fits while earlier birds are still in the shot, once the gun is reloaded', () => {
    const f = fixture(), gun = gunFor(f);
    for (let i = 1; i <= 5; i++) f.add(i, 1, 18 + i * .4, (i % 3) - 1);
    f.runtime.tickBirds(1000 / 30);
    const next = rises(f)[0].waves[rises(f)[0].next];
    // Leave room for exactly the next wave: the others were shot and are down.
    for (const slot of holding(f).slice(0, next.ids.length)) slot.status = 'done';
    gun.shells = 0; for (let i = 0; i < 12; i++) f.runtime.tickBirds(1000 / 30);
    expect(holding(f).length).toBe(3 - next.ids.length);
    gun.shells = 2; f.runtime.tickBirds(1000 / 30);
    expect(holding(f).length).toBe(3);
  });

  it('opens a chukar wave around the fall line, never steering a lane into the hill above a hunter below', () => {
    const f = fixture('chukar-ridge');
    const slope = getArea('chukar-ridge').slope!, upX = Math.cos(slope), upZ = Math.sin(slope);
    const ground = (x: number, z: number) => .35 * (x * upX + z * upZ);
    f.runtime.terrain = { heightAt: ground };
    // The covey sits 18 m uphill of the hunter, spread across the slope.
    for (let i = 0; i < 6; i++) {
      const across = (i - 2.5) * 1.2;
      f.add(i + 1, 1, upX * 18 - upZ * across, upZ * 18 + upX * across);
      f.birds.at(-1)!.speciesId = 'chukar';
    }
    for (let tick = 0; tick < 30 * 40 && !f.finishRise.mock.calls.length; tick++) {
      f.runtime.tickBirds(1000 / 30);
      for (const s of inPlay(f)) {
        if (s.status === 'flying' && s.airMs > 300 && s.airMs < 2500) expect(s.y - ground(s.x, s.z)).toBeGreaterThan(.3);
      }
    }
    // Nobody puts down in the hill: a chukar that sets down does it well out
    // on the slope, where a miss is marked.
    const landings = (f.runtime.hunt as { resolveBird: ReturnType<typeof vi.fn> }).resolveBird.mock.calls.filter(call => call[2]);
    for (const [, , spot] of landings) expect(Math.hypot(spot.x - upX * 18, spot.z - upZ * 18)).toBeGreaterThan(45);
  });

  it('gets the sleeper up into an empty gun', () => {
    const f = fixture(), gun = gunFor(f);
    f.add(1, 1, 18, 0); f.add(2, 1, 19, 1);
    f.runtime.tickBirds(1000 / 30);
    expect(inPlay(f)).toHaveLength(2);
    // A third bird of the covey sat tight through the wave.
    f.add(3, 1, 18.5, .5); (f.runtime as unknown as { staged: Set<number> }).staged.add(3);
    rises(f).push({ waves: [{ ids: [], sleeper: false }, { ids: [3], sleeper: true, pauseMs: 1500 }], next: 1, speciesId: 'bobwhite' } as never);
    for (let i = 0; i < 20; i++) { f.runtime.tickBirds(1000 / 30); expect(inPlay(f).some(s => s.simId === 3)).toBe(false); }
    gun.shells = 0;
    const waited = tickUntil(f, () => inPlay(f).some(s => s.simId === 3)) * 1000 / 30;
    expect(waited).toBeLessThanOrEqual(1000 / 30 * 2);
    expect(21 * 1000 / 30 + waited).toBeGreaterThanOrEqual(SLEEPER_MIN_MS);
  });
});
