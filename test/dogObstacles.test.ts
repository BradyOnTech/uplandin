import { Dog } from '../src/game/dog';
import { getBreed } from '../src/game/breeds';
import { createHunt } from '../src/game/state';
import { describe, expect, it } from 'vitest';
import { DogObstacleMotion } from '../src/game/dogObstacles';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { QUAIL_GROUND_PROPS, quailGroundPropObstacles } from '../src/three/subsystems/quailGroundProps';

describe('dog local prop detours', () => {
  it('does not accumulate quartering weave when every obstacle is far away', () => {
    const make = () => new Dog({x:500,y:500},{breed:getBreed('gsp'),level:10},()=>.5,{x:0,y:0,w:1200,h:1000});
    const clear = make(), distant = make();
    for (let i=0;i<900;i++) {
      const env = {hunterPos:{x:500+i*.04,y:500},rangeRadius:24,movementScale:.04};
      clear.update(1000/30,[],env);
      distant.update(1000/30,[],{...env,obstacles:[{x:20,y:20,radius:1}]});
      expect(distant.heading).toBeCloseTo(clear.heading,8);
      expect(distant.pos.x).toBeCloseTo(clear.pos.x,8);
      expect(distant.pos.y).toBeCloseTo(clear.pos.y,8);
    }
  });
  it.each([0,Math.PI/2,Math.PI,Math.PI*1.5])('reaches the far side of the actual log at heading %s without entering it', angle => {
    const landscape=new LandscapeModel(getArea('quail-fields'));
    const circles=quailGroundPropObstacles(landscape).map(o=>{const p=landscape.worldToProperty(o.x,o.z,{x:0,y:0});return {...p,radius:o.radius/.9144};});
    const log=QUAIL_GROUND_PROPS[1];
    const pos={x:log.x-Math.cos(angle)*4,y:log.y-Math.sin(angle)*4};
    const goal={x:log.x+Math.cos(angle)*4,y:log.y+Math.sin(angle)*4};
    const motion=new DogObstacleMotion();
    for(let i=0;i<500 && Math.hypot(goal.x-pos.x,goal.y-pos.y)>.1;i++) {
      motion.move(pos,Math.atan2(goal.y-pos.y,goal.x-pos.x),.08,circles);
      for(const o of circles)expect(Math.hypot(pos.x-o.x,pos.y-o.y)).toBeGreaterThanOrEqual(o.radius+.3-1e-7);
    }
    expect(Math.hypot(goal.x-pos.x,goal.y-pos.y)).toBeLessThan(.15);
  });
  it('keeps a retrieve and delivery objective while detouring through the real dog update', () => {
    const area=getArea('quail-fields'),landscape=new LandscapeModel(area);
    const log=QUAIL_GROUND_PROPS[1];
    const hunter={x:log.x-12,y:log.y};
    const dog=new Dog({...hunter},{breed:getBreed('gsp'),level:10},()=>.5,{x:0,y:0,w:area.world.w,h:area.world.h});
    const bird=createHunt(area,()=>.5).birds[0];bird.pos={x:log.x+12,y:log.y};bird.state='downed';
    const obstacles=quailGroundPropObstacles(landscape).map(o=>{const p=landscape.worldToProperty(o.x,o.z,{x:0,y:0});return {...p,radius:o.radius/.9144};});
    let carrying=false;
    const delivered=()=>bird.state==='retrieved';
    for(let i=0;i<2400 && !delivered();i++) {
      dog.update(1000/30,[bird],{hunterPos:hunter,movementScale:.08,obstacles});
      carrying ||= dog.carryingBirdId===bird.id;
      for(const o of obstacles)expect(Math.hypot(dog.pos.x-o.x,dog.pos.y-o.y)).toBeGreaterThanOrEqual(o.radius+.3-1e-7);
    }
    expect(carrying).toBe(true);expect(bird.state).toBe('retrieved');expect(dog.carryingBirdId).toBeNull();
  });

  it('cannot tunnel through a small prop during a long movement step', () => {
    const p={x:-2,y:0},motion=new DogObstacleMotion();
    motion.move(p,0,4,[{x:0,y:0,radius:.1}]);
    expect(Math.hypot(p.x,p.y)).toBeGreaterThanOrEqual(.4);
    expect(Math.abs(p.y)).toBeGreaterThan(.3);
  });
  it('preserves unobstructed movement exactly when the policy is absent', () => {
    const p={x:0,y:0};new DogObstacleMotion().move(p,.7,2,[]);
    expect(p).toEqual({x:Math.cos(.7)*2,y:Math.sin(.7)*2});
  });
});
