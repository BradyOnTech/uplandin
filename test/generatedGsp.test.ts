import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGeneratedGsp } from '../src/three/dogs/generatedGsp';
import { GSP_COAT_IDS } from '../src/three/dogs/germanShorthairedPointer';

describe('generated GSP asset contract', () => {
  for (const detail of ['high', 'lite'] as const) it(`${detail} remains a finite, bounded asset with grounded stance and a raised pointing paw`, () => {
    const dog = createGeneratedGsp(detail);
    expect(dog.stats.triangles).toBeLessThanOrEqual(detail === 'high' ? 2500 : 1500);
    expect(dog.stats.materials).toBe(1);
    expect(dog.stats.meshes).toBe(1);
    const weights = dog.skin.geometry.getAttribute('skinWeight');
    const indices = dog.skin.geometry.getAttribute('skinIndex');
    for (let i = 0; i < weights.count; i++) {
      expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1, 6);
      expect(indices.getX(i)).toBeGreaterThanOrEqual(0);
      expect(indices.getX(i)).toBeLessThan(dog.skeleton.bones.length);
      expect(indices.getY(i)).toBeLessThan(dog.skeleton.bones.length);
    }
    dog.root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const attribute of Object.values((node.geometry as THREE.BufferGeometry).attributes)) {
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      }
    });
    const standing = new THREE.Box3().setFromObject(dog.root);
    expect(standing.min.y).toBeGreaterThanOrEqual(0);
    expect(standing.min.y).toBeLessThan(.01);
    const support = dog.paws.slice(1).map(p => p.getWorldPosition(new THREE.Vector3()));
    dog.setPose('point');
    expect(new THREE.Box3().setFromObject(dog.root).min.y).toBeGreaterThanOrEqual(0);
    expect(dog.paws[0].getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(.10);
    expect(dog.paws[1].getWorldPosition(new THREE.Vector3()).distanceTo(support[0])).toBeLessThan(1e-8);
    dog.paws.slice(2).forEach((p,i)=>{
      const paw=p.getWorldPosition(new THREE.Vector3());
      expect(paw.z).toBeLessThan(support[i+1].z-.08);
      // Nominal pose extends the rear stance; the field solver grounds it.
      expect(paw.y).toBeLessThan(.06);
    });
    dog.setPose('stand');
    const reset = new THREE.Box3().setFromObject(dog.root);
    expect(reset.min.distanceTo(standing.min)).toBeLessThan(1e-8);
    expect(reset.max.distanceTo(standing.max)).toBeLessThan(1e-8);
    dog.dispose();
  });
  it('keeps the same articulation and scale at both detail levels', () => {
    const high = createGeneratedGsp('high'), lite = createGeneratedGsp('lite');
    expect(Object.keys(high.joints)).toEqual(Object.keys(lite.joints));
    for (const name of Object.keys(high.joints)) expect(high.joints[name].position.distanceTo(lite.joints[name].position)).toBe(0);
    const a = new THREE.Box3().setFromObject(high.root), b = new THREE.Box3().setFromObject(lite.root);
    expect(a.min.distanceTo(b.min)).toBeLessThan(.006);
    expect(a.max.distanceTo(b.max)).toBeLessThan(.006);
    high.dispose(); lite.dispose();
  });
  it('keeps the accepted anatomy and one-skin budget across all four GSP coats', () => {
    const reference = createGeneratedGsp('lite');
    for (const coat of GSP_COAT_IDS) {
      const dog = createGeneratedGsp('lite', false, coat);
      expect(dog.root.userData.coatId).toBe(coat);
      for (const attribute of ['position', 'skinIndex', 'skinWeight']) {
        expect(Array.from(dog.skin.geometry.getAttribute(attribute).array))
          .toEqual(Array.from(reference.skin.geometry.getAttribute(attribute).array));
      }
      expect(dog.stats).toEqual(reference.stats);
      dog.dispose();
    }
    reference.dispose();
  });
});

describe('generated GSP locomotion', () => {
  for (const gait of ['walk','trot','canter','gallop'] as const) it(`${gait} plants supporting feet without sliding on level ground`, () => {
    const dog=createGeneratedGsp('lite');
    const previous=new Map<number,{z:number;cycle:number}>();
    for(let frame=0;frame<120;frame++) {
      const cycle=frame/120,pose=dog.setLocomotion(gait,cycle);
      expect(pose.clamped).toBe(0);
      pose.feet.forEach((foot,i)=>{
        const p=dog.paws[i].getWorldPosition(new THREE.Vector3());
        expect(p.y).toBeCloseTo(.023+foot.lift,5);
        if(foot.contact==='stance') {
          const worldZ=p.z+cycle*pose.stride,last=previous.get(i);
          if(last && cycle-last.cycle<.01) expect(Math.abs(last.z-worldZ)).toBeLessThan(.00001);
          previous.set(i,{z:worldZ,cycle});
        } else previous.delete(i);
      });
      if(gait==='trot') {
        expect(pose.feet[0].phase).toBe(pose.feet[3].phase);
        expect(pose.feet[1].phase).toBe(pose.feet[2].phase);
      }
    }
    dog.dispose();
  });
});

it('solves translated and rotated world targets on a slope, including sole orientation', () => {
  const dog=createGeneratedGsp('lite');dog.root.position.set(3,1,5);dog.root.rotation.y=1.2;dog.setLocomotion('walk',.1);
  const targets=dog.paws.map(p=>{const v=p.getWorldPosition(new THREE.Vector3());v.y=1+.03*(v.x-3)+.02*(v.z-5)+.023;return v;});
  const normals=targets.map(()=>new THREE.Vector3(-.03,1,-.02).normalize());
  expect(dog.solveWorldFeet(targets,normals)).toBe(0);
  dog.paws.forEach((paw,i)=>{
    expect(paw.getWorldPosition(new THREE.Vector3()).distanceTo(targets[i])).toBeLessThan(.00001);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(paw.getWorldQuaternion(new THREE.Quaternion()));
    expect(up.dot(normals[i])).toBeGreaterThan(.99999);
  });dog.dispose();
});
it('uses four staggered gallop touchdowns and two airborne intervals per cycle',()=>{
  const dog=createGeneratedGsp('lite');let starts=0,wasAirborne=true;
  const touchdowns=Array.from({length:4},()=>[] as number[]),wasSupported=[false,false,false,false];
  for(let f=0;f<200;f++) {
    const sample=dog.setLocomotion('gallop',f/200),airborne=sample.feet.every(foot=>foot.contact==='swing');
    if(airborne&&!wasAirborne)starts++;wasAirborne=airborne;
    sample.feet.forEach((foot,i)=>{const supported=foot.contact!=='swing';if(supported&&!wasSupported[i])touchdowns[i].push(f/200);wasSupported[i]=supported;});
  }
  expect(starts).toBe(2);expect(touchdowns.map(v=>v.length)).toEqual([1,1,1,1]);
  expect(touchdowns[3][0]).toBe(0);expect(touchdowns[2][0]).toBeCloseTo(.08,2);expect(touchdowns[1][0]).toBeCloseTo(.5,2);expect(touchdowns[0][0]).toBeCloseTo(.58,2);dog.dispose();
});
