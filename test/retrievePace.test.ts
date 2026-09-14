import {expect,it} from 'vitest';
import {Dog} from '../src/game/dog';
import {getBreed} from '../src/game/breeds';
import {liveMovementScaleForDog} from '../src/three/subsystems/hunt3d';
import type {Bird} from '../src/game/birds';
it.each(['english-setter','gsp'])('completes a marked 40m retrieve promptly with %s',breedId=>{
 const breed=getBreed(breedId), hunter={x:500,y:500};
 const dog=new Dog({...hunter},{breed,level:8},()=>.5,{x:0,y:0,w:2000,h:2000});
 const bird={id:1,pos:{x:500+40/.9144,y:500},state:'downed',speciesId:'chukar'} as Bird;
 let elapsed=0,carryAt=0;
 for(let i=0;i<1800 && bird.state!=='retrieved';i++) {
  dog.update(1000/30,[bird],{hunterPos:hunter,pickupRange:.65/.9144,deliveryRange:1/.9144,retrieveTurnRate:5,movementScale:liveMovementScaleForDog(dog.gait,dog.state,breed.motion,0)});
  elapsed+=1/30;if(bird.state==='carried'&&!carryAt)carryAt=elapsed;
 }
 expect(carryAt).toBeLessThan(12);
 expect(bird.state).toBe('retrieved');expect(elapsed).toBeLessThan(23);
});

it('turns before carrying and settles at a close fall without oscillating on long frames',()=>{
 const breed=getBreed('english-setter'),hunter={x:500,y:500};
 const dog=new Dog({...hunter},{breed,level:8},()=>.5,{x:0,y:0,w:2000,h:2000});
 const bird={id:1,pos:{x:503,y:500},state:'downed',speciesId:'chukar'} as Bird;
 let turned=false,previousHeading=dog.heading;
 for(let i=0;i<120&&bird.state!=='retrieved';i++) {
  const before={...dog.pos};
  dog.update(250,[bird],{hunterPos:hunter,pickupRange:.65/.9144,deliveryRange:1/.9144,retrieveTurnRate:5,
   movementScale:liveMovementScaleForDog(dog.gait,dog.state,breed.motion,0)});
  if(dog.carryingBirdId!==null) {
   const turn=Math.atan2(Math.sin(dog.heading-previousHeading),Math.cos(dog.heading-previousHeading));
   expect(Math.abs(turn)).toBeLessThanOrEqual(1.25+1e-8);
   turned ||= Math.abs(turn)>.1;
   if(dog.gait==='still')expect(Math.hypot(dog.pos.x-before.x,dog.pos.y-before.y)).toBeLessThan(.001);
  }
  previousHeading=dog.heading;
 }
 expect(turned).toBe(true);expect(bird.state).toBe('retrieved');
});
