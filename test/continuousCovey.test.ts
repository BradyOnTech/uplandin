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
    listener?: THREE.Camera; refinedQuail: boolean; spatialEncounter: boolean; frozen: boolean; hunt: unknown; terrain: unknown;
    applySpeciesAppearance: unknown; burstDebris: unknown; launchCover?: QuailFlushDebris; coverEvents?: EventTarget;
  };
  runtime.refinedQuail = true; runtime.spatialEncounter = true; runtime.frozen = true;
  runtime.hunt = { areaConfig: () => getArea('quail-fields'), huntState: () => ({ birds, hunterPos: {x:0,y:0}, wind:0 }),
    simToWorld: (x:number,y:number,out:{x:number;z:number}) => Object.assign(out,{x,z:y}),
    coverPatches: () => [], lastFlushInfo: () => null, finishRise, resolveBird: vi.fn(), recordFallWorld: vi.fn() };
  runtime.terrain = { heightAt: () => 0 };
  runtime.applySpeciesAppearance = (slot: { species: unknown }, species: unknown) => { slot.species = species; }; runtime.burstDebris = () => {};
  runtime.slots = Array.from({length:14},()=>({status:'idle',root:new THREE.Group(),vel:{x:0,y:0},species:getSpecies('bobwhite'),
    wingLMesh:{morphTargetInfluences:[0]},wingRMesh:{morphTargetInfluences:[0]}}));
  const add = (id:number,coveyId:number,x:number,y:number) => birds.push({id,coveyId,pos:{x,y},state:'flushed',speciesId:'bobwhite',runs:false,runEnergy:0,restingMs:0,nerveMs:0});
  return { runtime, birds, add, finishRise };
}

describe('continuous Quail coveys', () => {
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
        expect(sound).toHaveBeenLastCalledWith(Math.hypot(4,.2),sex==='rooster',expect.objectContaining({x:4,y:.2,z:0}),expect.objectContaining({flapRate:9,phaseOffset:0,seed:expect.any(Number)}));
        for(let i=0;i<10;i++)f.runtime.tickBirds(1000/30);
      }
      expect(sound).toHaveBeenCalledTimes(2);
      expect(flutter).not.toHaveBeenCalled();
    } finally {sound.mockRestore();flutter.mockRestore();}
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
    for (let i = 0; i < 15; i++) {
      for (const f of [close, far]) f.runtime.tickBirds(1000 / 30);
      expect(close.runtime.slots[0].vyW / far.runtime.slots[0].vyW).toBeCloseTo(1.25 / .85);
    }
    expect((close.runtime.slots[0].y - .2) / (far.runtime.slots[0].y - .2)).toBeCloseTo(1.25 / .85);
  });
  it.each([
    { species: 'ringneck', spatial: false },
    { species: 'bobwhite', spatial: true },
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
