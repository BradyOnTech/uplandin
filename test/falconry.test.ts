import { describe, expect, it } from 'vitest';
import { GoshawkFlight, selectSlipTarget, sweptSeparation, type QuarryTarget } from '../src/game/falconry';
import { createThreeHuntSetup } from '../src/game/gameplayMode';
import { normalizeQuickConfig } from '../src/game/quick';
import { HuntSimulation } from '../src/game/huntSimulation';
import { Dog } from '../src/game/dog';
import { getArea } from '../src/game/areas';
import { getBreed } from '../src/game/breeds';
import { createHunt, endFieldSession, huntComplete } from '../src/game/state';
import { PROPERTY_PX_TO_M } from '../src/game/worldUnits';
import { mulberry32 } from '../src/game/math';

const fist={x:0,y:1.3,z:0},ground=()=>0;
function quarry(x=10,speed=12): QuarryTarget {return {id:1,x,y:1.5,z:0,vx:speed,vy:0,vz:0};}
function fly(hawk:GoshawkFlight,q:QuarryTarget,seconds=12){
  const events=[];
  for(let i=0;i<seconds*30;i++){
    q.x+=q.vx/30;q.y+=q.vy/30;q.z+=q.vz/30;
    events.push(...hawk.step(1/30,fist,[q],ground));
    if(hawk.phase==='on-quarry'||hawk.phase==='fist')break;
  }
  return events;
}
describe('goshawk flights',()=>{
  it('selects a visible forward slip and rejects hidden, behind or out-of-range quarry',()=>{
    const target=quarry();
    expect(selectSlipTarget(fist,{x:1,y:0,z:0},[target])).toBe(target);
    expect(selectSlipTarget(fist,{x:-1,y:0,z:0},[target])).toBeUndefined();
    expect(selectSlipTarget(fist,{x:1,y:0,z:0},[target],()=>false)).toBeUndefined();
    expect(selectSlipTarget(fist,{x:1,y:0,z:0},[quarry(70)])).toBeUndefined();
  });
  it('completes a geometric chase, binding, handler recovery and return without duplicate credit',()=>{
    const hawk=new GoshawkFlight(),q=quarry();
    expect(hawk.slip(fist,q)).toBe(true);
    expect(hawk.slip(fist,q)).toBe(false);
    const events=fly(hawk,q);
    expect(events.filter(e=>e.type==='bound')).toHaveLength(1);
    expect(hawk.phase).toBe('on-quarry');
    expect(hawk.recover(fist,true)).toBe(false);
    expect(hawk.recall()).toEqual([]);
    expect(hawk.phase).toBe('on-quarry');
    const handler={...hawk.position,y:1.3};
    expect(hawk.recover(handler,false)).toBe(false);
    expect(hawk.recover({...handler,x:handler.x+1.5},true)).toBe(false);
    expect(hawk.recover(handler,true)).toBe(true);
    expect(hawk.phase).toBe('picking-up');expect(hawk.recovered).toBe(0);expect(hawk.canEnd).toBe(false);
    expect(hawk.recover(handler,true)).toBe(false);expect(hawk.recall()).toEqual([]);
    const pickupEvents=[];
    for(let i=0;i<300;i++) {
      pickupEvents.push(...hawk.step(1/30,handler,[],ground));
      expect(hawk.phase).not.toBe('returning');
    }
    expect(pickupEvents.map(e=>e.type)).toEqual(['recovered']);
    expect(hawk.phase).toBe('fist');expect(hawk.recovered).toBe(1);expect(hawk.catches).toBe(1);
    expect(hawk.slip(handler,{...q,x:handler.x+8})).toBe(true);
  });
  it('lets faster quarry escape and returns the hawk without a phantom catch',()=>{
    const hawk=new GoshawkFlight(),q=quarry(32,27);hawk.slip(fist,q);
    fly(hawk,q,13);
    for(let i=0;i<1200;i++)hawk.step(1/30,fist,[],ground);
    expect(hawk.phase).toBe('fist');expect(hawk.catches).toBe(0);expect(hawk.misses).toBe(1);
  });
  it('ends pursuit when quarry reaches cover and can recall without counting a catch or automatic re-slip',()=>{
    const hawk=new GoshawkFlight();hawk.slip(fist,quarry());
    expect(hawk.step(1/30,fist,[],ground)).toEqual([{type:'missed'}]);
    for(let i=0;i<300;i++)hawk.step(1/30,fist,[],ground);
    hawk.slip(fist,quarry());
    expect(hawk.recall()).toEqual([{type:'recalled'}]);expect(hawk.recall()).toEqual([]);
    for(let i=0;i<300;i++)hawk.step(1/30,fist,[quarry()],ground);
    expect(hawk.phase).toBe('fist');expect(hawk.flights).toBe(2);expect(hawk.catches).toBe(0);expect(hawk.recalls).toBe(1);
  });
  it('lands on a moving glove while the handler turns to watch its return',()=>{
    const hawk=new GoshawkFlight(),q=quarry(10,16);hawk.slip(fist,q);
    for(let i=0;i<30;i++){q.x+=q.vx/30;hawk.step(1/30,fist,[q],ground);}
    hawk.recall();
    for(let i=0;i<900&&hawk.phase!=='fist';i++){
      // Glove stays left and forward of the camera as the handler tracks.
      const angle=Math.atan2(hawk.position.z,hawk.position.x);
      const hand={x:Math.cos(angle)*.9+Math.sin(angle)*.45,y:1.1,z:Math.sin(angle)*.9-Math.cos(angle)*.45};
      hawk.step(1/30,hand,[],ground);
    }
    expect(hawk.phase).toBe('fist');expect(hawk.recalls).toBe(1);
  });
  it('provides a detached flight subject and optional guidance without changing recall authority',()=>{
    const hawk=new GoshawkFlight(()=>({x:0,y:2,z:50}));hawk.slip(fist,quarry());
    const subject=hawk.flightSubject();subject.position.x=999;
    expect(hawk.position.x).toBe(0);
    hawk.step(1/30,fist,[quarry()],ground);
    expect(hawk.heading).toBeGreaterThan(0);
    hawk.recall();for(let i=0;i<300;i++)hawk.step(1/30,fist,[],ground);
    expect(hawk.phase).toBe('fist');expect(hawk.catches).toBe(0);
  });
  it('uses swept interception for a fast crossing and does not intersect a nearby parallel pass',()=>{
    expect(sweptSeparation({x:-2,y:0,z:0},{x:2,y:0,z:0})).toBe(0);
    expect(sweptSeparation({x:-2,y:1,z:0},{x:2,y:1,z:0})).toBe(1);
  });
});

describe('falconry hunt integration',()=>{
  it('takes a down stay beside the bound hawk and holds it while the handler walks in or whistles',()=>{
    const area=getArea('pheasant-coverts');
    const dog=new Dog({x:200,y:200},{breed:getBreed('gsp'),level:10},mulberry32(3),area.world);
    const guard={x:200+6/PROPERTY_PX_TO_M,y:200};
    for(let i=0;i<300;i++)dog.update(33,[],{guardRaptor:guard,holdForRaptor:true,hunterPos:{x:100,y:100},recall:true});
    expect(dog.raptorDuty).toBe('guarding');expect(dog.gait).toBe('still');
    expect(Math.hypot(dog.pos.x-guard.x,dog.pos.y-guard.y)*PROPERTY_PX_TO_M).toBeLessThan(.5);
    const settled={...dog.pos};
    for(let i=0;i<100;i++)dog.update(33,[],{guardRaptor:guard,hunterPos:{x:400,y:400},recall:true});
    expect(dog.pos).toEqual(settled);expect(dog.carryingBirdId).toBeNull();
    dog.update(33,[],{hunterPos:{...dog.pos}});dog.castOff();
    expect(dog.raptorDuty).toBeNull();expect(dog.state).toBe('quartering');
  });

  it('pins only the falconry Quick Hunt slice and never turns a career URL into falconry',()=>{
    const data:Record<string,string>={};const storage={getItem:(k:string)=>data[k]??null,setItem:(k:string,v:string)=>{data[k]=v;}};
    const setup=createThreeHuntSetup('?play=quick&method=goshawk&area=chukar-ridge',mulberry32(7),storage);
    expect(setup.area.id).toBe('pheasant-coverts');expect(setup.breed.id).toBe('gsp');expect(setup.level).toBe(10);expect(setup.brace).toBeNull();
    expect(setup.hunt.huntingMethod).toBe('goshawk');expect(data).toEqual({});
    const career=createThreeHuntSetup('?play=career&area=quail-fields&method=goshawk',mulberry32(7),storage);
    expect(career.hunt.huntingMethod).not.toBe('goshawk');
    expect(normalizeQuickConfig({huntingMethod:'shotgun',areaId:'chukar-ridge',level:3}).areaId).toBe('chukar-ridge');
  });
  it('keeps held quarry out of dog retrieval, blocks ending, and awards only one handler recovery',()=>{
    const area=getArea('pheasant-coverts'),hunt=createHunt(area,mulberry32(2));hunt.huntingMethod='goshawk';
    const bird=hunt.birds[0];hunt.birds=[bird];
    const dog=new Dog({...bird.pos},{breed:getBreed('gsp'),level:10},mulberry32(3),area.world);
    const sim=new HuntSimulation({hunt,dogs:[dog],area,continuousEncounter:true,rng:mulberry32(4)});
    dog.state='pointing';dog.pointedBirdId=bird.id;sim.flushBird(bird.id,'proximity',0);
    expect(sim.bindQuarry(bird.id,bird.pos)).toBe(true);expect(sim.bindQuarry(bird.id,bird.pos)).toBe(false);
    expect(bird.state).toBe('held');expect(endFieldSession(hunt)).toBe(false);expect(huntComplete(hunt)).toBe(false);
    const handler={...dog.pos};
    for(let i=0;i<30;i++)sim.update(33,{hunterPos:handler,holdDogs:true,recall:true});
    expect(dog.state).toBe('heel');expect(dog.carryingBirdId).toBeNull();expect(bird.state).toBe('held');
    sim.finishRise();expect(hunt.dogWork[0].downedOverPoint).toBe(1);expect(hunt.dogWork[0].retrieves).toBe(0);
    expect(sim.recoverQuarry(bird.id)).toBe(true);expect(sim.recoverQuarry(bird.id)).toBe(false);
    expect(huntComplete(hunt)).toBe(true);expect(hunt.downed).toBe(1);
  });
});
