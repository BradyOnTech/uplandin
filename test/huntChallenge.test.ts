import { expect, it } from 'vitest';
import { createThreeHuntSetup, resolveThreeHuntChallenge } from '../src/game/gameplayMode';
import { HUNT_CHALLENGE_KEY } from '../src/game/huntChallenge';
import { mulberry32 } from '../src/game/math';

it('changes opportunity and nerve while preserving the balanced baseline and dog profile',()=>{
  const setup=(challenge:string)=>createThreeHuntSetup('?area=quail-fields&challenge='+challenge,mulberry32(41),null);
  const normal=setup('balanced'),relaxed=setup('relaxed'),wild=setup('wild');
  const baseline=createThreeHuntSetup('?area=quail-fields',mulberry32(41),null);
  const withoutIds=(hunt:typeof normal.hunt)=>({...hunt,birds:hunt.birds.map(({id,...bird})=>bird)});
  expect(withoutIds(normal.hunt)).toEqual(withoutIds(baseline.hunt));
  expect(relaxed.hunt.birds.length).toBeGreaterThan(normal.hunt.birds.length);
  expect(wild.hunt.birds.length).toBeLessThan(normal.hunt.birds.length);
  expect(relaxed.hunt.birds[0].nerveMs).toBeCloseTo(normal.hunt.birds[0].nerveMs*1.35);
  expect(wild.hunt.birds[0].nerveMs).toBeCloseTo(normal.hunt.birds[0].nerveMs*.8);
  expect([relaxed.breed.id,relaxed.level,relaxed.gearTier]).toEqual([normal.breed.id,normal.level,normal.gearTier]);
  expect(relaxed.hunt.birds[0].pos).toEqual(normal.hunt.birds[0].pos);
});

it('honors an explicit choice before preferences and safely defaults on every property',()=>{
  const storage={getItem:(key:string)=>key===HUNT_CHALLENGE_KEY?'wild':null,setItem:()=>{throw Error('Setup must not mutate saves');}};
  expect(resolveThreeHuntChallenge('?area=quail-fields',storage)).toBe('wild');
  expect(resolveThreeHuntChallenge('?area=quail-fields&challenge=relaxed',storage)).toBe('relaxed');
  expect(resolveThreeHuntChallenge('?area=quail-fields&challenge=unknown',storage)).toBe('balanced');
  expect(resolveThreeHuntChallenge('?area=grouse-woods&challenge=wild',storage)).toBe('wild');
  expect(resolveThreeHuntChallenge('?area=quail-fields',{getItem:()=>{throw Error('Unavailable');},setItem:()=>{}})).toBe('balanced');
});

it('offers a Loaded field of close, steady coveys for quick hunts but never for a career',()=>{
  const storage=null;
  const loaded=createThreeHuntSetup('?area=sharptail-prairie&challenge=loaded&seed=5',mulberry32(3),storage);
  const balanced=createThreeHuntSetup('?area=sharptail-prairie&challenge=balanced&seed=5',mulberry32(3),storage);
  expect(loaded.challenge).toBe('loaded');
  expect(loaded.hunt.birds.length).toBeGreaterThan(balanced.hunt.birds.length*3);
  expect(new Set(loaded.hunt.birds.map(b=>b.coveyId)).size).toBeGreaterThan(new Set(balanced.hunt.birds.map(b=>b.coveyId)).size*2.5);
  expect(resolveThreeHuntChallenge('?play=career&area=sharptail-prairie&challenge=loaded',null)).toBe('balanced');
  expect(resolveThreeHuntChallenge('?play=quick&challenge=loaded',{getItem:()=>JSON.stringify({areaId:'quail-fields'}),setItem:()=>{}})).toBe('loaded');
});
