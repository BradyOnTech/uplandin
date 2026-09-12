import { it, expect } from 'vitest';
import * as THREE from 'three';
import { GeneratedFieldMotion } from '../src/three/dogs/generatedFieldMotion';
it('only plants feet on the terrain while changing speed and entering point',()=>{
  for(const dt of [1/60,1/240]) {
    const motion=new GeneratedFieldMotion('lite',(x,z)=>.025*x+.018*z);let x=0,z=0;
    for(let f=0;f<12/dt;f++) {
      const t=f*dt,yaw=1.5*Math.sin(t*2),moving=t<10,speed=moving?1.5+Math.sin(t*4):0;
      x+=Math.sin(yaw)*speed*dt;z+=Math.cos(yaw)*speed*dt;
      motion.update(x,z,yaw,dt,moving,!moving);
      for(const foot of motion.contactSnapshot())if(foot.locked&&foot.step===0)
        expect(Math.abs(foot.groundGap)).toBeLessThan(.001);
    }
    motion.dispose();
  }
  for(const frames of [121,150,179])for(const speed of [.6,1.8,3.2,5.6,7.8]) {
    const motion=new GeneratedFieldMotion('lite',(x,z)=>.025*x+.018*z);let z=0;
    for(let f=0;f<frames+60;f++) {
      const moving=f<frames;if(moving)z+=speed/60;
      motion.update(0,z,0,1/60,moving,!moving);
      for(const foot of motion.contactSnapshot())if(foot.locked&&foot.step===0)
        expect(Math.abs(foot.groundGap)).toBeLessThan(.001);
    }
    motion.dispose();
  }
  const motion=new GeneratedFieldMotion('lite',(x,z)=>.025*x+.018*z);let z=0,plants=0;
  for(let f=0;f<600;f++) {
    const moving=f<420,speed=moving?Math.min(5.6,f/60*1.4):0;
    z+=speed/60;motion.update(0,z,.2*Math.sin(f/60),1/60,moving,!moving);
    for(const foot of motion.contactSnapshot())if(foot.locked&&foot.step===0) {
      expect(Math.abs(foot.groundGap)).toBeLessThan(.001);plants++;
    }
  }
  expect(plants).toBeGreaterThan(500);motion.dispose();
});
it.each([.3,.6,1])('repositions diagonal feet through a %s-second half turn on a slope without exceeding reach',duration=>{
  for(const direction of [-1,1]) {
    const motion=new GeneratedFieldMotion('lite',(x,z)=>.05*x+.03*z);
    for(let f=0;f<90;f++)motion.update(0,0,0,1/60,false,false);
    let paired=0;
    for(let f=0;f<120;f++) {
      motion.update(0,0,direction*Math.min(1,f/60/duration)*Math.PI,1/60,false,false);
      expect(motion.clamped).toBe(0);
      const stepping=motion.feet.flatMap((foot,i)=>foot.step>0?[i]:[]);
      expect(stepping.length).toBeLessThanOrEqual(2);
      if(stepping.length===2){expect(stepping[0]+stepping[1]).toBe(3);paired++;}
      motion.contactSnapshot().forEach(foot=>expect(foot.targetError).toBeLessThan(.0001));
    }
    expect(paired).toBeGreaterThan(0);motion.dispose();
  }
});
it.each([.6,1.8,3.2,5.6,7.8])('settles into point without a one-frame paw snap after moving at %s m/s',speed=>{
  for(const frames of [121,150,179]) {
    const motion=new GeneratedFieldMotion('lite',()=>0);let z=0;
    for(let f=0;f<frames;f++){z+=speed/60;motion.update(0,z,0,1/60,true,false);}
    let previous=motion.asset.paws.map(p=>p.getWorldPosition(new THREE.Vector3())),worst=0;
    for(let f=0;f<35;f++) {
      motion.update(0,z,0,1/60,false,true);
      const actual=motion.asset.paws.map(p=>p.getWorldPosition(new THREE.Vector3()));
      actual.forEach((p,i)=>{worst=Math.max(worst,p.distanceTo(previous[i]));});previous=actual;
      expect(motion.clamped).toBe(0);
    }
    expect(worst).toBeLessThan(.08);motion.dispose();
  }
});
it('steps out of point at walking speed without snapping the raised paw to the ground',()=>{
  const motion=new GeneratedFieldMotion('lite',()=>0);
  for(let f=0;f<90;f++)motion.update(0,0,0,1/60,false,true);
  let previous=motion.asset.paws.map(p=>p.getWorldPosition(new THREE.Vector3())),worst=0;
  for(let f=1;f<=30;f++) {
    motion.update(0,f*.01,0,1/60,true,false);
    const actual=motion.asset.paws.map(p=>p.getWorldPosition(new THREE.Vector3()));
    actual.forEach((p,i)=>{worst=Math.max(worst,p.distanceTo(previous[i]));});previous=actual;
    expect(motion.clamped).toBe(0);
  }
  expect(worst).toBeLessThan(.05);motion.dispose();
});
it('preserves the tucked airborne foreleg while solving the three grounded point supports',()=>{
  const motion=new GeneratedFieldMotion('high',(x,z)=>.025*x+.018*z);
  for(let i=0;i<90;i++)motion.update(0,0,.7,1/60,false,true);
  expect(motion.asset.joints['front-left'].rotation.x).toBeCloseTo(.40);
  expect(motion.asset.joints['front-left-lower'].rotation.x).toBeCloseTo(-1.60);
  const paw=motion.asset.paws[0];
  expect(new THREE.Vector3(0,1,0).applyQuaternion(paw.getWorldQuaternion(new THREE.Quaternion())).y).toBeLessThan(.9);
  motion.feet.forEach((foot,i)=>{
    expect(motion.asset.paws[i].getWorldPosition(new THREE.Vector3()).distanceTo(foot.target)).toBeLessThan(.0001);
    expect(foot.locked).toBe(i!==0);
  });
  expect(motion.clamped).toBe(0);motion.dispose();
});
it('acquires pointing presence over time while keeping supporting feet grounded',()=>{
  const motion=new GeneratedFieldMotion('lite',()=>0);
  motion.update(0,0,0,1/60,false,false);
  const supports=motion.feet.slice(1).map(f=>({target:f.target.clone(),step:f.step}));
  motion.update(0,0,0,1/60,false,true);
  expect(motion.asset.joints.neck.rotation.x).toBeGreaterThan(0);
  expect(motion.asset.joints.neck.rotation.x).toBeLessThan(.02);
  for(let i=0;i<30;i++) {
    motion.update(0,0,0,1/60,false,true);
    expect(motion.clamped).toBe(0);
    expect(motion.feet.filter(f=>f.step>0).length).toBeLessThanOrEqual(1);
    motion.feet.slice(1).forEach((f,j)=>{
      if(!f.step&&!supports[j].step)expect(f.target.distanceTo(supports[j].target)).toBeLessThan(.0001);
      if(!f.step)expect(f.target.y).toBeCloseTo(.023,4);
      supports[j].target.copy(f.target);supports[j].step=f.step;
    });
  }
  expect(motion.asset.joints.neck.rotation.x).toBeCloseTo(.16);
  expect(motion.asset.joints.tail.rotation.x).toBeCloseTo(.20);
  motion.update(0,0,0,1/60,false,false);
  expect(motion.asset.joints.neck.rotation.x).toBeGreaterThan(0);
  expect(motion.asset.joints.neck.rotation.x).toBeLessThan(.26);
  for(let i=0;i<30;i++)motion.update(0,0,0,1/60,false,false);
  expect(motion.asset.joints.neck.rotation.x).toBeCloseTo(0);
  motion.dispose();
});
it('lowers the raised pointing paw gradually and repositions supports by stepping',()=>{
  const motion=new GeneratedFieldMotion('lite',()=>0);
  for(let i=0;i<90;i++)motion.update(0,0,0,1/60,false,true);
  const supports=motion.feet.slice(1).map(f=>({target:f.target.clone(),step:f.step}));
  let previous=motion.feet[0].target.clone(),maxStep=0;
  expect(previous.y).toBeGreaterThan(.1);
  for(let i=0;i<30;i++){
    motion.update(0,0,0,1/60,false,false);
    const paw=motion.asset.paws[0].getWorldPosition(new THREE.Vector3());
    maxStep=Math.max(maxStep,paw.distanceTo(previous));previous.copy(paw);
    expect(motion.feet.filter(f=>f.step>0).length).toBeLessThanOrEqual(1);
    motion.feet.slice(1).forEach((f,j)=>{
      if(!f.step&&!supports[j].step)expect(f.target.distanceTo(supports[j].target)).toBeLessThan(.0001);
      if(!f.step)expect(f.target.y).toBeCloseTo(.023,4);
      supports[j].target.copy(f.target);supports[j].step=f.step;
    });
    expect(motion.clamped).toBe(0);
  }
  expect(maxStep).toBeLessThan(.04);expect(previous.y).toBeCloseTo(.023,3);
  expect(motion.feet[0].step).toBe(0);motion.dispose();
});
it('keeps locked contacts in world space through gentle turns on sloping ground',()=>{
  const ground=(x:number,z:number)=>.025*x+.018*z;
  const motion=new GeneratedFieldMotion('lite',ground),previous=motion.feet.map(()=>new THREE.Vector3());
  const wasLocked=[false,false,false,false];let worst=0,clamps=0,locks=0;
  for(let f=0;f<300;f++) {
    const t=f/60,angle=t*.15;
    motion.update(4*(1-Math.cos(angle)),4*Math.sin(angle),angle,1/60,true,false);
    clamps+=motion.clamped;
    motion.feet.forEach((foot,i)=>{
      const actual=motion.asset.paws[i].getWorldPosition(new THREE.Vector3());
      worst=Math.max(worst,actual.distanceTo(foot.target));
      if(foot.locked&&wasLocked[i]&&foot.step===0){expect(actual.distanceTo(previous[i])).toBeLessThan(.0001);locks++;}
      previous[i].copy(foot.target);wasLocked[i]=foot.locked&&foot.step===0;
    });
  }
  expect(locks).toBeGreaterThan(300);expect(clamps).toBe(0);expect(worst).toBeLessThan(.0001);
  motion.dispose();
});
it('settles from walking into a point with one corrective step at a time',()=>{
  const motion=new GeneratedFieldMotion('lite',()=>0);let clamps=0;
  for(let f=0;f<120;f++)motion.update(0,f*.01,0,1/60,true,false);
  for(let f=0;f<120;f++) {
    motion.update(0,1.19,0,1/60,false,true);clamps+=motion.clamped;
    expect(motion.feet.filter(foot=>foot.step>0).length).toBeLessThanOrEqual(1);
  }
  expect(clamps).toBe(0);
  expect(motion.asset.paws[0].getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(.10);
  expect(motion.feet.slice(1).every(foot=>foot.locked&&foot.step===0)).toBe(true);
  motion.dispose();
});
it('changes from walk through trot and canter to gallop while accelerating on a slope',()=>{
  const motion=new GeneratedFieldMotion('lite',(x,z)=>.02*x+.015*z),gaits=new Set<string>();let z=0,clamps=0;
  for(let f=0;f<360;f++) {
    const speed=Math.min(8.0,f/60*1.4);z+=speed/60;
    motion.update(.03*Math.sin(z*.1),z,0,1/60,true,false);gaits.add(motion.gait);clamps+=motion.clamped;
    expect(motion.asset.joints.body.position.y).toBeGreaterThanOrEqual(-.14);
    motion.feet.forEach((foot,i)=>expect(motion.asset.paws[i].getWorldPosition(new THREE.Vector3()).distanceTo(foot.target)).toBeLessThan(.0001));
  }
  expect([...gaits]).toEqual(['walk','trot','canter','gallop']);expect(clamps).toBe(0);motion.dispose();
});

it('releases ground contacts in deep water and restores them on shore',()=>{
  let depth=.75;
  const motion=new GeneratedFieldMotion('lite',()=>2,()=>depth);
  motion.update(0,0,0,1/30,true,false);
  expect(motion.swimming).toBe(true);
  expect(motion.asset.root.position.y).toBeCloseTo(2.35);
  expect(motion.contactSnapshot().every(foot=>!foot.locked)).toBe(true);
  depth=0;
  for(let i=0;i<20;i++)motion.update(0,0,0,1/30,false,false);
  expect(motion.swimming).toBe(false);
  expect(motion.asset.root.position.y).toBeCloseTo(2);
  expect(motion.contactSnapshot().every(foot=>Number.isFinite(foot.groundGap))).toBe(true);
  motion.dispose();
});

it('keeps the swimming torso steady and paddles without ground contacts across a full cycle',()=>{
  const motion=new GeneratedFieldMotion('lite',()=>0,()=>.75);
  let minPaw=Infinity,maxPaw=-Infinity;
  for(let i=0;i<120;i++){
    motion.update(0,0,0,1/120,false,false);
    expect(motion.clamped).toBe(0);
    expect(motion.asset.joints.body.position.y).toBeCloseTo(-.025);
    const feet=motion.contactSnapshot();
    expect(feet.every(foot=>!foot.locked)).toBe(true);
    minPaw=Math.min(minPaw,feet[0].actual[1]);maxPaw=Math.max(maxPaw,feet[0].actual[1]);
    expect(feet.every(foot=>foot.actual.every(Number.isFinite))).toBe(true);
  }
  expect(maxPaw-minPaw).toBeGreaterThan(.07);
  expect(maxPaw).toBeLessThan(.75);
  motion.dispose();
});
