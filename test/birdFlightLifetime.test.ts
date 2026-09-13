import { expect, it } from 'vitest';
import { birdFlightExpired } from '../src/game/birdFlightLifetime';
import { GoshawkFlight, type QuarryTarget } from '../src/game/falconry';

it('lets a pursuing hawk finish a catch beyond the hunter shot range', () => {
  const hawk=new GoshawkFlight(),fist={x:0,y:1.3,z:0};
  const q:QuarryTarget={id:1,x:40,y:5,z:0,vx:18.5,vy:0,vz:0};
  hawk.slip(fist,q);
  let expired=false;
  for(let tick=0;tick<450&&!hawk.catches&&!hawk.misses;tick++) {
    q.x+=q.vx/30;
    const pursued=hawk.targetId===q.id&&(hawk.phase==='launching'||hawk.phase==='chasing');
    expired=birdFlightExpired(q.x*q.x,2800+tick*1000/30,false,pursued);
    hawk.step(1/30,fist,expired?[]:[q],()=>0);
  }
  expect(expired).toBe(false);
  expect(hawk.catches).toBe(1);
  expect(hawk.position.x).toBeGreaterThan(80);
});

it('retains ordinary flight limits and expires quarry when pursuit has ended',()=>{
  expect(birdFlightExpired(81**2,5000,false,false)).toBe(true);
  expect(birdFlightExpired(79**2,5000,false,false)).toBe(false);
  expect(birdFlightExpired(100**2,5000,true,false)).toBe(false);
  expect(birdFlightExpired(10**2,15001,true,false)).toBe(true);
  expect(birdFlightExpired(100**2,16000,false,true)).toBe(false);
});

it('still lets fast quarry escape through the hawk pursuit time limit',()=>{
  const hawk=new GoshawkFlight(),fist={x:0,y:1.3,z:0};
  const q:QuarryTarget={id:1,x:25,y:4,z:0,vx:27,vy:0,vz:0};hawk.slip(fist,q);
  for(let tick=0;tick<400&&!hawk.misses;tick++) {
    q.x+=q.vx/30;
    const pursued=hawk.targetId===q.id&&(hawk.phase==='launching'||hawk.phase==='chasing');
    const expired=birdFlightExpired(q.x*q.x,tick*1000/30,false,pursued);
    hawk.step(1/30,fist,expired?[]:[q],()=>0);
  }
  expect(hawk.catches).toBe(0);expect(hawk.misses).toBe(1);expect(hawk.phase).toBe('returning');
  expect(birdFlightExpired(q.x*q.x,13000,false,false)).toBe(true);
});
