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

it('honors an explicit choice before preferences, safely defaults, and scopes the setting to Quail Fields',()=>{
  const storage={getItem:(key:string)=>key===HUNT_CHALLENGE_KEY?'wild':null,setItem:()=>{throw Error('Setup must not mutate saves');}};
  expect(resolveThreeHuntChallenge('?area=quail-fields',storage)).toBe('wild');
  expect(resolveThreeHuntChallenge('?area=quail-fields&challenge=relaxed',storage)).toBe('relaxed');
  expect(resolveThreeHuntChallenge('?area=quail-fields&challenge=unknown',storage)).toBe('balanced');
  expect(resolveThreeHuntChallenge('?area=grouse-woods&challenge=wild',storage)).toBe('balanced');
  expect(resolveThreeHuntChallenge('?area=quail-fields',{getItem:()=>{throw Error('Unavailable');},setItem:()=>{}})).toBe('balanced');
});
