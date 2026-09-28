import { expect, it } from 'vitest';
import * as THREE from 'three';
import { GeneratedFieldMotion } from '../src/three/dogs/generatedFieldMotion';

// Conservative envelopes from the authored GSP: 5.4 cm-wide paws and
// 6/4.2 cm lower-leg/distal diameters. Checking only paw centres misses
// toe overlap and two shins passing through one another above the feet.
function segmentDistance(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
  const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c);
  const aa=u.dot(u),bb=u.dot(v),cc=v.dot(v),dd=u.dot(w),ee=v.dot(w),den=aa*cc-bb*bb;
  let s=den>1e-12?THREE.MathUtils.clamp((bb*ee-cc*dd)/den,0,1):0;
  let t=(bb*s+ee)/cc;
  if(t<0){t=0;s=THREE.MathUtils.clamp(-dd/aa,0,1);}
  else if(t>1){t=1;s=THREE.MathUtils.clamp((bb-dd)/aa,0,1);}
  return a.clone().addScaledVector(u,s).distanceTo(c.clone().addScaledVector(v,t));
}
function clearance(motion: GeneratedFieldMotion) {
  let paw=Infinity,limb=Infinity;
  for(const [i,j] of [[0,1],[2,3]]) {
    const left=motion.asset.paws[i],right=motion.asset.paws[j];
    const a=left.localToWorld(new THREE.Vector3(0,0,-.006));
    const b=left.localToWorld(new THREE.Vector3(0,0,.044));
    const c=right.localToWorld(new THREE.Vector3(0,0,-.006));
    const d=right.localToWorld(new THREE.Vector3(0,0,.044));
    paw=Math.min(paw,segmentDistance(a,b,c,d)-.054);
    const nodes=[left.parent!.parent!,left.parent!,left];
    const others=[right.parent!.parent!,right.parent!,right];
    for(let k=0;k<2;k++)for(let l=0;l<2;l++) {
      const distance=segmentDistance(nodes[k].getWorldPosition(new THREE.Vector3()),nodes[k+1].getWorldPosition(new THREE.Vector3()),
        others[l].getWorldPosition(new THREE.Vector3()),others[l+1].getWorldPosition(new THREE.Vector3()));
      limb=Math.min(limb,distance-(k===0?.030:.021)-(l===0?.030:.021));
    }
  }
  return {paw,limb};
}

it.each([30,60])('keeps the paws and lower legs apart through turn, stop and reversal at %s Hz',fps=>{
  for(const direction of [-1,1])for(const slope of [-.15,0,.15])for(const rate of [1.2,3,4.83,6.3])for(const mode of ['turn','cancel','reverse']) {
    const motion=new GeneratedFieldMotion('lite',(x,z)=>slope*z+.045*x);
    for(let f=0;f<fps;f++)motion.update(0,0,0,1/fps,false,false);
    let previous=motion.contactSnapshot();
    const end=mode==='turn'?Math.PI/rate:mode==='cancel'?.19:.6;
    for(let f=0;f<=Math.ceil((end+.65)*fps);f++) {
      const t=f/fps;
      const yaw=direction*rate*(mode==='turn'?Math.min(Math.PI/rate,t):mode==='cancel'?Math.min(.19,t):t<.2?t:.4-Math.min(.6,t));
      motion.update(0,0,yaw,1/fps,false,false,{stage:'carry',holdMs:0,speciesId:'chukar'});
      const context=JSON.stringify({fps,direction,slope,rate,mode,t});
      expect(motion.clamped,context).toBe(0);
      const feet=motion.contactSnapshot(),swing=feet.filter(foot=>foot.step>0);
      expect(swing.length,context).toBeLessThanOrEqual(2);
      if(swing.length===2)expect(swing[0].i+swing[1].i,context).toBe(3);
      feet.forEach((foot,i)=>{
        expect(foot.targetError,context).toBeLessThan(.0001);
        if(foot.locked&&foot.step===0&&previous[i].step===0&&foot.plantId===previous[i].plantId) {
          expect(new THREE.Vector3(...foot.actual).distanceTo(new THREE.Vector3(...previous[i].actual)),context).toBeLessThan(.0001);
        }
      });
      const space=clearance(motion);
      expect(space.paw,context).toBeGreaterThan(0);
      expect(space.limb,context).toBeGreaterThan(0);
      previous=feet;
    }
    expect(motion.feet.every(f=>f.step===0)).toBe(true);
    motion.dispose();
  }
});

it.each([30,60])('keeps deliberate touchdown goals through a real pickup-to-carry half turn at %s Hz',fps=>{
  const ground=(x:number,z:number)=>.10*z+.045*x;
  const motion=new GeneratedFieldMotion('high',ground);
  const target={x:0,y:ground(0,.62)+.06,z:.62};
  for(let f=0;f<fps;f++)motion.update(0,-2,0,1/fps,false,false);
  let previous=motion.feet.map(f=>({step:f.step,id:f.plantId,goal:f.goal.clone()})),plants=0;
  for(let f=0;f<=Math.ceil(3.9*fps);f++) {
    const t=f/fps;
    if(t<2)motion.update(0,-2+t,0,1/fps,t>0,false);
    else if(t<2.7)motion.update(0,0,0,1/fps,false,false,{stage:'pickup',holdMs:(t-2)*1000,target,speciesId:'chukar'});
    else {
      const moving=t>=3.35;
      motion.update(0,moving?-(t-3.35)*1.6:0,Math.min(1,(t-2.7)/.65)*Math.PI,1/fps,moving,false,{stage:'carry',holdMs:0,speciesId:'chukar'});
      expect(motion.clamped).toBe(0);
      expect(clearance(motion).paw).toBeGreaterThan(0);
      expect(clearance(motion).limb).toBeGreaterThan(0);
      motion.feet.forEach((foot,i)=>{
        if(foot.plantId!==previous[i].id&&t<=3.35)plants++;
        if(!moving&&foot.step>0&&previous[i].step>0&&foot.plantId===previous[i].id)expect(foot.goal.distanceTo(previous[i].goal)).toBeLessThan(.00001);
        // Over-predicting the final pivot landing previously left a paw
        // 28 cm out to one side during the first carried travel stride.
        if(t>=3.4)expect(Math.abs(foot.target.x)).toBeLessThan(.23);
      });
    }
    previous=motion.feet.map(f=>({step:f.step,id:f.plantId,goal:f.goal.clone()}));
  }
  expect(plants).toBeLessThanOrEqual(14);
  expect(plants).toBeGreaterThanOrEqual(8);
  motion.dispose();
});

it.each(['point','walk','swim'] as const)('releases the turn planner cleanly into %s',mode=>{
  let depth=0;
  const motion=new GeneratedFieldMotion('lite',()=>0,()=>depth);
  for(let f=0;f<60;f++)motion.update(0,0,0,1/60,false,false);
  for(let f=1;f<=10;f++)motion.update(0,0,5*f/60,1/60,false,false);
  const yaw=5/6;
  let x=0,z=0;
  for(let f=0;f<60;f++){
    if(mode==='walk'){x+=Math.sin(yaw)/60;z+=Math.cos(yaw)/60;}
    if(mode==='swim')depth=.8;
    motion.update(x,z,yaw,1/60,mode==='walk',mode==='point');
    expect(motion.clamped).toBe(0);
  }
  if(mode==='point') {
    expect(motion.asset.joints['front-left'].rotation.x).toBeCloseTo(.4);
    expect(motion.feet[0].locked).toBe(false);
    motion.feet.slice(1).forEach(f=>expect(f.target.y).toBeCloseTo(.023,4));
  } else if(mode==='walk')expect(motion.moving).toBe(true);
  else expect(motion.swimming).toBe(true);
  motion.dispose();
});
