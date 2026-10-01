import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import type { Bird } from '../src/game/birds';
import { getBreed } from '../src/game/breeds';
import { Dog } from '../src/game/dog';
import { HuntSimulation } from '../src/game/huntSimulation';
import { mulberry32 } from '../src/game/math';
import { createHunt } from '../src/game/state';
import { LandscapeModel } from '../src/game/landscape';
import { pheasantApproach } from '../src/game/pheasantApproach';
import { HUNT_CHALLENGES, type HuntChallenge } from '../src/game/huntChallenge';

function pointedSimulation(hunterDistance: number, continuousEncounter = false, areaId = 'quail-fields', speciesId = 'bobwhite', challenge: HuntChallenge = 'balanced') {
  const area = getArea(areaId);
  const hunt = createHunt(area, mulberry32(11), { wind: 'calm', condition: 'mild' });
  const bird: Bird = {
    id: 9001,
    coveyId: 77,
    speciesId,
    pos: { x: 300, y: 300 },
    state: 'hidden',
    runs: false,
    runEnergy: 2500,
    restingMs: 0,
    nerveMs: 10000,
  };
  hunt.birds = [bird];
  hunt.hunterPos = { x: bird.pos.x - hunterDistance, y: bird.pos.y };
  const dog = new Dog(
    { x: bird.pos.x - 12, y: bird.pos.y },
    { breed: getBreed('english-setter'), level: 8 },
    mulberry32(12),
    area.world,
  );
  dog.state = 'pointing';
  dog.gait = 'still';
  dog.pointedBirdId = bird.id;
  const simulation = new HuntSimulation({ hunt, dogs: [dog], area, rng: mulberry32(13), continuousEncounter, challenge });
  return { bird, dog, hunt, simulation };
}

describe('HuntSimulation shared orchestration', () => {
  it('retains authoritative slope per active rise and clears only the settled covey', () => {
    const f = pointedSimulation(30, true, 'chukar-ridge', 'chukar');
    const other = { ...f.bird, id: 9002, coveyId: 78, pos: { x: 600, y: 200 } };
    f.hunt.birds.push(other);
    const terrain = new LandscapeModel(getArea('chukar-ridge'));
    const slopeSide = (bird: Bird, above: boolean) => Array.from({ length: 72 }, (_, i) => ({
      x: bird.pos.x + Math.cos(i * Math.PI / 36) * 40,
      y: bird.pos.y + Math.sin(i * Math.PI / 36) * 40,
    })).sort((a, b) => (above ? -1 : 1) * (terrain.heightAtProperty(a.x, a.y) - terrain.heightAtProperty(b.x, b.y)))[0];
    f.hunt.hunterPos = slopeSide(f.bird, true);
    const first = f.simulation.flushBird(f.bird.id, 'nerve', 0)!;
    f.hunt.hunterPos = slopeSide(other, false);
    const second = f.simulation.flushBird(other.id, 'scent', null)!;
    expect(first.slopeApproach).toBe('above'); expect(second.slopeApproach).toBe('below');
    expect(f.simulation.riseSlopeApproach(f.bird.id)).toBe(first.slopeApproach);
    expect(f.simulation.riseSlopeApproach(other.id)).toBe(second.slopeApproach);
    expect(f.simulation.riseSlopeApproach(9999)).toBeNull();
    f.simulation.resolveBird(other.id, 'escaped');
    f.simulation.finishRise({ birdId: other.id, relight: false });
    expect(f.simulation.riseSlopeApproach(other.id)).toBeNull();
    expect(f.simulation.riseSlopeApproach(f.bird.id)).toBe(first.slopeApproach);
    f.simulation.resolveBird(f.bird.id, 'escaped');
    f.simulation.finishRise({ birdId: f.bird.id, relight: false });
    expect(f.simulation.riseSlopeApproach(f.bird.id)).toBeNull();
  });
  it('keeps a spatial retrieve carried through the handoff pause before awarding the bag', () => {
    const f = pointedSimulation(20, true, 'pheasant-coverts', 'ringneck');
    f.bird.state = 'downed'; f.bird.pos = {...f.dog.pos};
    f.dog.state = 'quartering'; f.dog.pointedBirdId = null;
    for (let i=0;i<100 && f.dog.carryingBirdId===null;i++)
      f.simulation.update(50,{hunterPos:{...f.hunt.hunterPos}});
    expect(f.dog.carryingBirdId).toBe(f.bird.id);
    const handler = {...f.dog.pos};
    f.simulation.update(0,{hunterPos:handler});
    const early = f.simulation.update(850,{hunterPos:handler});
    expect(f.bird.state).toBe('carried');
    expect(f.dog.gait).toBe('still');
    expect(early.some(e=>e.type==='bird-retrieved')).toBe(false);
    const delivered = f.simulation.update(50,{hunterPos:handler});
    expect(f.bird.state).toBe('retrieved');
    expect(delivered.filter(e=>e.type==='bird-retrieved')).toHaveLength(1);
    expect(f.dog.carryingBirdId).toBeNull();
  });
  it('recalls a continuous dog to the handler and casts it hunting on the next whistle', () => {
    const f = pointedSimulation(30, true, 'pheasant-coverts', 'ringneck');
    f.hunt.birds = [];
    f.dog.state = 'quartering'; f.dog.pointedBirdId = null;
    const input = { hunterPos: { ...f.hunt.hunterPos }, dogMotion: [{ movementScale: .04 }] };
    f.simulation.update(50, { ...input, recall: true });
    expect(f.dog.state).toBe('recalled');
    for (let i = 0; i < 300; i++) f.simulation.update(50, input);
    expect(f.dog.state).toBe('heel');
    expect(Math.hypot(f.dog.pos.x-input.hunterPos.x, f.dog.pos.y-input.hunterPos.y)*.9144).toBeLessThanOrEqual(1.5);
    f.simulation.update(1000, input);
    expect(f.dog.state).toBe('heel');
    f.simulation.update(50, { ...input, recall: true });
    expect(f.dog.state).toBe('quartering');
    f.simulation.update(50, input);
    expect(f.dog.state).toBe('quartering');
  });

  it('does not cast a heeled packmate while another dog is still holding a point', () => {
    const f = pointedSimulation(40, true, 'pheasant-coverts', 'ringneck');
    const heeled = new Dog({...f.hunt.hunterPos}, {breed:getBreed('english-setter'),level:8}, mulberry32(20), getArea('pheasant-coverts').world);
    heeled.state = 'heel';
    const sim = new HuntSimulation({hunt:f.hunt,dogs:[f.dog,heeled],area:getArea('pheasant-coverts'),continuousEncounter:true,rng:mulberry32(22)});
    sim.update(50, {hunterPos:{...f.hunt.hunterPos},recall:true});
    expect(f.dog.state).toBe('pointing');
    expect(heeled.state).toBe('heel');
  });

  it('preserves a steady point when a separate neighboring bird flushes', () => {
    const f=pointedSimulation(20,true,'pheasant-coverts','ringneck');
    const neighbor: Bird={...f.bird,id:9002,coveyId:78,pos:{x:275,y:290}};
    f.hunt.birds.push(neighbor);
    const sim=new HuntSimulation({hunt:f.hunt,dogs:[f.dog],area:getArea('pheasant-coverts'),rng:()=>.999,continuousEncounter:true});
    const rise=sim.flushBird(neighbor.id,'spook',null);
    expect(rise?.pointCredit).toBe(false);expect(f.hunt.dogWork[0].pointFlushes).toBe(0);
    expect(neighbor.state).toBe('flushed');expect(f.bird.state).toBe('hidden');
    expect(f.dog.state).toBe('pointing');expect(f.dog.pointedBirdId).toBe(f.bird.id);
    const ownRise=sim.flushBird(f.bird.id,'proximity',0);
    expect(ownRise?.pointCredit).toBe(true);expect(f.hunt.dogWork[0].pointFlushes).toBe(1);
    expect(f.dog.state).toBe('marking');expect(f.dog.watchedBirdIds()).toEqual([f.bird.id]);
  });
  it('assigns separate falls and credits two physical handoffs to their actual carriers', () => {
    const f=pointedSimulation(20,true,'pheasant-coverts','ringneck');
    const a=f.dog; a.pos={x:300,y:300};a.state='quartering';a.pointedBirdId=null;
    const b=new Dog({x:301,y:300},{breed:getBreed('english-setter'),level:8},mulberry32(19),getArea('pheasant-coverts').world);
    f.bird.state='downed';f.bird.pos={x:300,y:300};
    const second: Bird={...f.bird,id:9002,pos:{x:306,y:300}};f.hunt.birds.push(second);
    f.hunt.hunterPos={x:290,y:300};
    const sim=new HuntSimulation({hunt:f.hunt,dogs:[a,b],area:getArea('pheasant-coverts'),rng:mulberry32(20),continuousEncounter:true});
    const events:any[]=[];const carried=new Set<number>();
    for(let i=0;i<1200 && f.hunt.birds.some(bird=>bird.state!=='retrieved');i++) {
      events.push(...sim.update(50,{hunterPos:{...f.hunt.hunterPos},dogMotion:[{movementScale:.04,maxTravelSpeed:3},{movementScale:.04,maxTravelSpeed:3}]}));
      if(i===0){expect(a.reservedRetrieveId()).toBe(9001);expect(b.reservedRetrieveId()).toBe(9002);}
      for(const bird of f.hunt.birds)if(bird.state==='carried'){
        const owners=[a,b].filter(dog=>dog.carryingBirdId===bird.id);
        expect(owners).toHaveLength(1);expect(bird.pos).toEqual(owners[0].pos);carried.add(bird.id);
      }
      for(const event of events.splice(0))if(event.type==='bird-retrieved') {
        const dog=[a,b][event.dogIndex];
        expect(Math.hypot(dog.pos.x-f.hunt.hunterPos.x,dog.pos.y-f.hunt.hunterPos.y)*.9144).toBeLessThanOrEqual(1);
      }
    }
    expect([...carried].sort()).toEqual([9001,9002]);
    expect(f.hunt.birds.every(bird=>bird.state==='retrieved')).toBe(true);
    expect(f.hunt.dogWork.map(work=>work.retrieves)).toEqual([1,1]);
    expect(a.reservedRetrieveId()).toBeNull();expect(b.reservedRetrieveId()).toBeNull();
    expect(a.carryingBirdId).toBeNull();expect(b.carryingBirdId).toBeNull();
  });

  it('holds a distant dog on scent only in continuous pheasant country and resumes when the handler closes', () => {
    for (const [area,species,continuous,holds] of [
      ['pheasant-coverts','ringneck',true,true],
      ['pheasant-coverts','ringneck',false,false],
      ['quail-fields','bobwhite',true,false],
    ] as const) {
      const f=pointedSimulation(100,continuous,area,species);
      f.dog.pos={x:280,y:300};f.dog.state='quartering';f.dog.pointedBirdId=null;
      const position={...f.dog.pos};
      f.simulation.update(1000/30,{hunterPos:{...f.hunt.hunterPos},dogMotion:[{movementScale:.04}]});
      expect(f.dog.state).toBe('tracking');expect(f.dog.waitingForHandler).toBe(holds);
      if(holds) {
        for(let i=0;i<60;i++)f.simulation.update(1000/30,{hunterPos:{...f.hunt.hunterPos},dogMotion:[{movementScale:.04}]});
        expect(f.dog.pos).toEqual(position);expect(f.bird.state).toBe('hidden');
        // Movement is consumed after the dog tick; the next tick observes it.
        const closer={x:position.x-30,y:position.y};
        for(let i=0;i<2;i++)f.simulation.update(1000/30,{hunterPos:closer,dogMotion:[{movementScale:.04}]});
        expect(f.dog.waitingForHandler).toBe(false);expect(f.dog.state).toBe('tracking');
      }
    }
  });

  it('keeps seeded pheasant temperament stable across hunts with different runtime IDs', () => {
    const area = getArea('pheasant-coverts');
    const a = createHunt(area, mulberry32(1));
    const b = createHunt(area, mulberry32(1));
    expect(a.birds[0].id).not.toBe(b.birds[0].id);
    expect(a.birds.map(bird => pheasantApproach(bird.id, 20, false, bird.approachRoll)))
      .toEqual(b.birds.map(bird => pheasantApproach(bird.id, 20, false, bird.approachRoll)));
    expect(a.birds.every(bird => bird.approachRoll !== undefined)).toBe(true);
  });

  it.each(['relaxed', 'balanced', 'wild'] as const)('uses the %s quiet approach distance for pointed pheasants', challenge => {
    const f = pointedSimulation(30, true, 'pheasant-coverts', 'ringneck', challenge);
    f.bird.approachRoll = .6;
    const radius = pheasantApproach(f.bird.id, 30, false, .6).flushRadius * HUNT_CHALLENGES[challenge].approach;
    expect(f.simulation.update(16, { hunterPos: { x: 300 - radius - .1, y: 300 } })
      .some(event => event.type === 'covey-flushed')).toBe(false);
    expect(f.simulation.update(16, { hunterPos: { x: 300 - radius + .1, y: 300 } }))
      .toContainEqual(expect.objectContaining({ type: 'covey-flushed', cause: 'proximity', pointCredit: true }));
  });

  it('allows a tight pheasant to hold through a quiet walk and flush at the actual boots with point credit', () => {
    const f = pointedSimulation(40, true, 'pheasant-coverts', 'ringneck');
    const id = Array.from({length: 100}, (_, i) => i + 1).find(id => pheasantApproach(id, 40, false).kind === 'tight')!;
    f.bird.id = id; f.dog.pointedBirdId = id; f.bird.nerveMs = 5000;
    for (let distance = 40; distance >= 6; distance -= .1) {
      const events = f.simulation.update(40, {hunterPos: {x: 300 - distance, y: 300}});
      expect(events.some(e => e.type === 'covey-flushed')).toBe(false);
    }
    const radius = pheasantApproach(id, 0, false).flushRadius;
    const events = f.simulation.update(16, {hunterPos: {x: 300 - radius + .1, y: 300}});
    expect(events).toContainEqual(expect.objectContaining({type:'covey-flushed', cause:'proximity', pointCredit:true}));
  });
  it('keeps wary pheasants and sprinting approaches capable of a distant break', () => {
    for (const running of [false, true]) {
      const f = pointedSimulation(20, true, 'pheasant-coverts', 'ringneck');
      const id = Array.from({length: 100}, (_, i) => i + 1).find(id => pheasantApproach(id, 20, false).flushRadius > 22)!;
      f.bird.id = id; f.dog.pointedBirdId = id;
      const events = f.simulation.update(16, {hunterPos:f.hunt.hunterPos, hunterRunning:running});
      expect(events).toContainEqual(expect.objectContaining({type:'covey-flushed', cause:running ? 'spook' : 'proximity', pointCredit:!running}));
    }
  });
  it('flushes an unpointed resting pheasant underfoot without awarding a point', () => {
    const f = pointedSimulation(7, true, 'pheasant-coverts', 'ringneck');
    f.dog.pos = {x: 600, y: 600}; f.dog.state = 'quartering'; f.dog.pointedBirdId = null;
    f.bird.runs = true; f.bird.restingMs = 2000;
    const events = f.simulation.update(16, {hunterPos:{x:299, y:300}});
    expect(events).toContainEqual(expect.objectContaining({type:'covey-flushed', cause:'spook', pointCredit:false}));
  });

  it('uses the actual Chukar cross-slope elevation for continuous encounters', () => {
    const area = getArea('chukar-ridge');
    const land = new LandscapeModel(area, 'south-gate');
    // The authored eastern shoulder falls across the compass slope. The
    // legacy north-facing model calls this same-y approach level, although
    // the hunter is more than eight metres below the bird on real terrain.
    const birdPos = {x:1010,y:400};
    const hunterPos = {x:1042,y:400};
    expect(land.heightAtProperty(birdPos.x, birdPos.y)
      - land.heightAtProperty(hunterPos.x, hunterPos.y)).toBeGreaterThan(5);
    const fixture = (continuousEncounter: boolean, speciesId = 'chukar') => {
      const hunt = createHunt(area, mulberry32(11));
      const bird: Bird = { id: 9001, coveyId: 77, speciesId, pos: { ...birdPos },
        state: 'hidden', runs: false, runEnergy: 2500, restingMs: 0, nerveMs: 10000 };
      hunt.birds = [bird]; hunt.hunterPos = { ...hunterPos };
      const dog = new Dog({ x: birdPos.x + 12, y: birdPos.y },
        { breed: getBreed('english-setter'), level: 8 }, mulberry32(12), area.world);
      dog.state = 'pointing'; dog.gait = 'still'; dog.pointedBirdId = bird.id;
      const simulation = new HuntSimulation({ hunt, dogs: [dog], area, rng: mulberry32(13), continuousEncounter });
      return { hunt, bird, simulation };
    };
    const spatial = fixture(true), legacy = fixture(false);
    // Running bypasses the finite quiet walk-in allowance, so this compares
    // the actual slope pressure immediately without waiting for its expiry.
    spatial.simulation.update(16, { hunterPos, hunterRunning: true });
    legacy.simulation.update(16, { hunterPos, hunterRunning: true });
    expect(10000 - spatial.bird.nerveMs).toBeCloseTo((10000 - legacy.bird.nerveMs) * 1.4, 5);
    expect(spatial.simulation.flushBird(9001, 'nerve', 0)?.slopeApproach).toBe('below');
    expect(legacy.simulation.flushBird(9001, 'nerve', 0)?.slopeApproach).toBe('level');
    const nonMountain = fixture(true, 'bobwhite');
    expect(nonMountain.simulation.flushBird(9001, 'proximity', 0)?.slopeApproach).toBeNull();
    for (const [x, y, expected] of [[978, 400, 'above'], [1010, 399, 'level']] as const) {
      const f = fixture(true);
      f.hunt.hunterPos = {x,y};
      expect(f.simulation.flushBird(9001, 'proximity', 0)?.slopeApproach).toBe(expected);
    }
  });
  it('settles a continuous covey at its observed landings and permits one follow-up single', () => {
    const f = pointedSimulation(10, true);
    const departed = { ...f.bird, id: 9002, pos: { ...f.bird.pos } };
    f.hunt.birds.push(departed);
    const patch = getArea('quail-fields').patches[0];
    const landing = { x: patch.x + patch.w / 2, y: patch.y + patch.h / 2 };
    f.simulation.flushBird(f.bird.id, 'proximity', 0);
    f.simulation.resolveBird(f.bird.id, 'escaped', landing);
    f.simulation.resolveBird(departed.id, 'escaped');
    const result = f.simulation.finishRise();
    expect(result?.relitIds).toEqual([f.bird.id]);
    expect(f.bird.pos).toEqual(landing);
    expect(f.bird.state).toBe('hidden');
    expect(f.hunt.escaped).toBe(1);
    expect(f.simulation.finishRise()).toBeNull();
    f.simulation.flushBird(f.bird.id, 'bump', null);
    f.simulation.resolveBird(f.bird.id, 'escaped', landing);
    expect(f.simulation.finishRise()?.relitIds).toEqual([]);
    expect(f.hunt.escaped).toBe(2);
  });
  it('flushes the nearby member of a pointed covey and preserves the earned point credit', () => {
    const f=pointedSimulation(40,true);
    const nearby={...f.bird,id:9002,pos:{x:f.hunt.hunterPos.x+7,y:f.hunt.hunterPos.y}};
    f.hunt.birds.push(nearby);
    const events=f.simulation.update(16,{hunterPos:f.hunt.hunterPos});
    expect(events).toContainEqual(expect.objectContaining({type:'covey-flushed',birdId:9002,pointCredit:true,hunterDistance:7}));
    expect(f.hunt.dogWork[0].pointFlushes).toBe(1);
    expect(f.hunt.birds.every(b=>b.state==='flushed')).toBe(true);
  });
  it('keeps a bobwhite runner with its hidden covey in a continuous Quail hunt', () => {
    const f=pointedSimulation(40,true);
    f.bird.runs=true;
    f.hunt.birds.push({...f.bird,id:9002,pos:{x:302,y:300},runs:false});
    const before={...f.bird.pos};
    f.simulation.update(500,{hunterPos:f.hunt.hunterPos});
    expect(f.bird.pos).toEqual(before);
  });
  it('lets a quiet 3D approach pass the legacy flush distance, then rises close', () => {
    const f = pointedSimulation(20, true);
    expect(f.simulation.update(16, {hunterPos:f.hunt.hunterPos}).some(e=>e.type==='covey-flushed')).toBe(false);
    expect(f.bird.state).toBe('hidden');
    const events=f.simulation.update(16,{hunterPos:{x:f.bird.pos.x-7,y:f.bird.pos.y}});
    expect(events).toContainEqual(expect.objectContaining({type:'covey-flushed',cause:'proximity',pointCredit:true}));
  });
  it('still flushes a close pointed covey wild when the hunter sprints in', () => {
    const f = pointedSimulation(20, true);
    const events=f.simulation.update(16,{hunterPos:f.hunt.hunterPos,hunterRunning:true});
    expect(events).toContainEqual(expect.objectContaining({type:'covey-flushed',cause:'spook',pointCredit:false}));
  });
  it('keeps nerve expiry as a risk during a quiet 3D approach', () => {
    // An ordinary covey (approach roll .5 is not one that sits tight).
    const f = pointedSimulation(40, true); f.bird.nerveMs=1; f.bird.approachRoll=.5;
    const events=f.simulation.update(16,{hunterPos:f.hunt.hunterPos});
    expect(events).toContainEqual(expect.objectContaining({type:'covey-flushed',cause:'nerve'}));
  });
  it('waits for a 3D fall to land before the dog can select it for retrieval', () => {
    const { bird, dog, hunt, simulation } = pointedSimulation(10);
    bird.state = 'downed'; bird.fallPending = true;
    bird.pos = { ...dog.pos }; dog.state = 'quartering'; dog.pointedBirdId = null;
    for (let i=0;i<90;i++) simulation.update(1000/30,{hunterPos:hunt.hunterPos});
    expect(bird.state).toBe('downed'); expect(dog.state).not.toBe('retrieving');
    expect(simulation.recordFall(bird.id,{...dog.pos})).toBe(true);
    expect(bird.fallPending).toBe(false);
    simulation.update(1000/30,{hunterPos:hunt.hunterPos});
    expect(dog.state).toBe('retrieving');
  });

  it('settles overlapping coveys independently without losing point credit or counting a cross-covey double', () => {
    const { bird, dog, hunt, simulation } = pointedSimulation(10);
    const later = { ...bird, id: 9101, coveyId: 88, pos: { x: 330, y: 300 } };
    hunt.birds.push(later);
    simulation.flushBird(bird.id, 'proximity', 0);
    dog.pointedBirdId = later.id;
    simulation.flushBird(later.id, 'proximity', 0);
    simulation.resolveBird(bird.id, 'downed');
    simulation.resolveBird(later.id, 'downed');
    expect(simulation.finishRise({ birdId: -1, relight: false })).toBeNull();
    expect(simulation.finishRise({ birdId: later.id, relight: false })).toMatchObject({
      birdIds: [later.id], downedIds: [later.id], double: false, pointingSlot: 0,
    });
    expect(simulation.finishRise({ birdId: later.id, relight: false })).toBeNull();
    expect(hunt.dogWork[0].downedOverPoint).toBe(1);
    expect(simulation.finishRise({ relight: false })).toMatchObject({
      birdIds: [bird.id], downedIds: [bird.id], double: false, pointingSlot: 0,
    });
    expect(hunt.dogWork[0].downedOverPoint).toBe(2);
    expect(hunt.doubles).toBe(0);
    expect(simulation.finishRise()).toBeNull();
  });

  it('owns proximity flush, point credit, and dog steadiness for both adapters', () => {
    const { bird, hunt, simulation } = pointedSimulation(10);
    const events = simulation.update(1000 / 30, { hunterPos: { ...hunt.hunterPos } });
    const flush = events.find((event) => event.type === 'covey-flushed');

    expect(flush).toMatchObject({
      type: 'covey-flushed',
      cause: 'proximity',
      birdId: bird.id,
      pointCredit: true,
      pointingSlot: 0,
    });
    expect(bird.state).toBe('flushed');
    expect(hunt.dogWork[0].pointFlushes).toBe(1);
  });

  it('keeps a distant pointed covey hidden and resolves shot outcomes centrally', () => {
    const { bird, hunt, simulation } = pointedSimulation(30);
    expect(simulation.update(1000 / 30, { hunterPos: { ...hunt.hunterPos } })).not.toContainEqual(
      expect.objectContaining({ type: 'covey-flushed' }),
    );
    expect(bird.state).toBe('hidden');

    const flush = simulation.flushBird(bird.id, 'nerve', 0);
    expect(flush).not.toBeNull();
    expect(simulation.resolveBird(bird.id, 'downed')).toBe(true);
    expect(bird.state).toBe('downed');
    expect(hunt.downed).toBe(1);
  });

  it('finalizes doubles and downed-over-point credit once per rise', () => {
    const { bird, hunt, simulation } = pointedSimulation(10);
    hunt.birds.push(
      { ...bird, id: 9002, pos: { x: 302, y: 300 } },
      { ...bird, id: 9003, pos: { x: 298, y: 301 } },
    );
    const events = simulation.update(1000 / 30, { hunterPos: { ...hunt.hunterPos } });
    const flush = events.find((event) => event.type === 'covey-flushed');
    expect(flush?.type === 'covey-flushed' ? flush.birdIds : []).toHaveLength(3);

    expect(simulation.resolveBird(9001, 'downed')).toBe(true);
    expect(simulation.resolveBird(9002, 'downed')).toBe(true);
    expect(simulation.resolveBird(9003, 'escaped')).toBe(true);
    const resolution = simulation.finishRise({ relight: false });

    expect(resolution).toMatchObject({
      downedIds: [9001, 9002],
      escapedIds: [9003],
      double: true,
      pointingSlot: 0,
    });
    expect(hunt.doubles).toBe(1);
    expect(hunt.dogWork[0].downedOverPoint).toBe(2);
    expect(simulation.finishRise()).toBeNull();
  });

  it('records the landed fall as the retrieve target only for a downed bird', () => {
    const { bird, simulation } = pointedSimulation(10);
    simulation.update(1000 / 30, { hunterPos: { x: 290, y: 300 } });
    expect(simulation.recordFall(bird.id, { x: 420, y: 360 })).toBe(false);

    expect(simulation.resolveBird(bird.id, 'downed')).toBe(true);
    expect(simulation.recordFall(bird.id, { x: 420, y: 360 })).toBe(true);
    expect(bird.pos).toEqual({ x: 420, y: 360 });
  });
});
