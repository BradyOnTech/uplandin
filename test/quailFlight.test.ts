import {expect,it} from 'vitest';
import {createQuailFlight,selectQuailEscapeCover,stepQuailFlight} from '../src/three/quailFlight';
import {mulberry32} from '../src/game/math';
it('selects different forward cover and refuses a destination behind the flush',()=>{
 const patches=[{cx:0,cz:0,hx:12,hz:12},{cx:-70,cz:0,hx:12,hz:12},{cx:75,cz:0,hx:12,hz:12}];
 const target=selectQuailEscapeCover(0,0,1,0,patches,()=>.5);
 expect(target).toEqual({x:75,z:0});
 expect(selectQuailEscapeCover(0,0,1,0,patches.slice(0,2),()=>.5)).toBeUndefined();
});
it('uses the forward interior of broad cover when its center is too far off the escape bearing',()=>{
 const patch={cx:68,cz:-45,hx:48,hz:26};
 for(const random of [0,.5,.999]){
  const target=selectQuailEscapeCover(0,-14,0,-1,[patch],()=>random)!;
  expect(target).toBeDefined();
  expect(target.x).toBeGreaterThan(patch.cx-patch.hx);
  expect(target.x).toBeLessThan(patch.cx+patch.hx);
  expect(target.z).toBeGreaterThan(patch.cz-patch.hz);
  expect(target.z).toBeLessThan(patch.cz+patch.hz);
  expect((target.z+14)/Math.hypot(target.x,target.z+14)).toBeLessThan(-.65);
 }
});
it('descends into selected cover without circling past the destination',()=>{
 const flight=createQuailFlight(1,0,()=>.5);flight.target={x:75,z:12};
 const body={x:0,y:.2,z:0,airMs:0,vxW:0,vyW:0,vzW:0,gliding:false};
 for(let i=1;i<=9*60;i++){
  body.airMs=i*1000/60;stepQuailFlight(flight,body,1/60,()=>0);
  body.x+=body.vxW/60;body.y+=body.vyW/60;body.z+=body.vzW/60;
 }
 expect(Math.hypot(body.x-75,body.z-12)).toBeLessThan(.1);
 expect(body.y).toBeLessThan(.25);
});
it('keeps a six-second escape consistent at desktop and lower frame rates',()=>{
 const flight=createQuailFlight(1,.4,mulberry32(17));
 const run=(fps:number)=>{
  const body={x:0,y:.2,z:0,airMs:0,vxW:0,vyW:0,vzW:0,gliding:false};
  for(let i=1;i<=6*fps;i++){
   body.airMs=i*1000/fps;
   stepQuailFlight(flight,body,1/fps,(x,z)=>.015*x+.008*z);
   body.x+=body.vxW/fps;body.y+=body.vyW/fps;body.z+=body.vzW/fps;
  }
  return body;
 };
 const reference=run(120);
 for(const fps of [20,30,60]){
  const result=run(fps);
  expect(Math.hypot(result.x-reference.x,result.z-reference.z)).toBeLessThan(.2);
  expect(Math.abs(result.y-reference.y)).toBeLessThan(.1);
  expect(result.gliding).toBe(reference.gliding);
 }
});
it('uses continuous individual bearings while preserving a shared escape direction',()=>{
 const rng=mulberry32(51),flights=Array.from({length:12},()=>createQuailFlight(1,0,rng));
 expect(new Set(flights.map(f=>f.bearing)).size).toBe(12);
 for(const f of flights){expect(Math.abs(f.bearing)).toBeLessThanOrEqual(.41);expect(f.speed).toBeLessThanOrEqual(18.5);}
 expect(createQuailFlight(0,-1,mulberry32(1))).toEqual(createQuailFlight(0,-1,mulberry32(1)));
});
it('climbs and glides smoothly over flat ground with bounded speed and climb',()=>{
 const flight=createQuailFlight(1,0,()=>.5),body={x:0,y:.2,z:0,airMs:0,vxW:0,vyW:0,vzW:0,gliding:false};
 let peak=0,glided=false;
 for(let i=0;i<360;i++){
  body.airMs+=1000/60;stepQuailFlight(flight,body,1/60,()=>0);
  expect(Math.hypot(body.vxW,body.vzW)).toBeLessThanOrEqual(18.5);expect(Math.abs(body.vyW)).toBeLessThanOrEqual(4.5);
  body.x+=body.vxW/60;body.y+=body.vyW/60;body.z+=body.vzW/60;peak=Math.max(peak,body.y);glided ||= body.gliding;
 }
 expect(glided).toBe(true);expect(peak).toBeGreaterThan(2);expect(peak).toBeLessThan(5);expect(body.y).toBeLessThan(peak-1);
});
it('responds to terrain ahead without changing its horizontal escape bearing',()=>{
 const f=createQuailFlight(1,0,()=>.5),a={x:0,y:3.5,z:0,airMs:1500,vxW:0,vyW:0,vzW:0,gliding:false},b={...a};
 stepQuailFlight(f,a,1/30,()=>0);stepQuailFlight(f,b,1/30,()=>5);
 expect(b.vyW).toBeGreaterThan(a.vyW);expect(b.vxW).toBe(a.vxW);expect(b.vzW).toBe(a.vzW);
});
