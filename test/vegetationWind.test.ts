import * as THREE from 'three';
import { describe,expect,it,vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel,PROPERTY_PX_TO_M } from '../src/game/landscape';
import type { WindStrength } from '../src/game/wind';
import type { Ctx,Subsystem } from '../src/three/engine';
import { VegetationWind,vegetationWindStrength } from '../src/three/subsystems/vegetationWind';
import { ChukarEnvironmentSystem } from '../src/three/subsystems/chukarEnvironment';
import { QuailEnvironmentSystem } from '../src/three/subsystems/quailEnvironment';
import { GrassSystem } from '../src/three/subsystems/grass';
import { PropertyHabitatSystem } from '../src/three/subsystems/propertyHabitat';

vi.mock('../src/three/assets/chukarKit',()=>({loadChukarKit:async()=>[0,1,2].map(()=>new THREE.IcosahedronGeometry(1,0))}));

describe('authoritative visual wind',()=>{
  it('uses the HUD/scent toward convention without replacing bound uniform objects',()=>{
    const state={wind:0,windStrength:'breezy' as WindStrength};
    const ctx={get:()=>({huntState:()=>state})} as unknown as Ctx;
    const wind=new VegetationWind(),direction=wind.direction,vector=direction.value,strength=wind.strength;
    wind.connect(ctx);
    for(const [angle,x,z] of [[0,1,0],[Math.PI/2,0,1],[Math.PI,-1,0],[Math.PI*1.5,0,-1]]){
      state.wind=angle;wind.update();expect(wind.direction.value.x).toBeCloseTo(x);expect(wind.direction.value.y).toBeCloseTo(z);
    }
    expect(wind.direction).toBe(direction);expect(wind.direction.value).toBe(vector);expect(wind.strength).toBe(strength);
    const levels=(['calm','breezy','strong'] as const).map(level=>{state.windStrength=level;wind.update();return wind.strength.value;});
    expect(levels[0]).toBeGreaterThan(0);expect(levels[1]).toBeGreaterThan(levels[0]);expect(levels[2]).toBeGreaterThan(levels[1]);
    expect(levels[2]).toBe(1);
  });

  it('does not invent wind for environment-only tools and recovers after an invalid snapshot',()=>{
    const wind=new VegetationWind();wind.connect({get:()=>{throw new Error('no simulation');}} as unknown as Ctx);
    expect(wind.strength.value).toBe(0);
    const state={wind:NaN,windStrength:'strong' as WindStrength};
    wind.connect({get:()=>({huntState:()=>state})} as unknown as Ctx);expect(wind.strength.value).toBe(0);
    state.wind=.72;wind.update();expect(wind.direction.value.length()).toBeCloseTo(1);expect(wind.strength.value).toBe(1);
  });
});

function fixture(areaId:string){
  const area=getArea(areaId),landscape=new LandscapeModel(area),state={areaId,wind:Math.PI/2,windStrength:'calm' as WindStrength};
  const hunt={huntState:()=>state,coverPatches:()=>area.patches.map(p=>{
    const center=landscape.propertyToWorld(p.x+p.w/2,p.y+p.h/2,{x:0,z:0});
    return {cx:center.x,cz:center.z,hx:p.w*PROPERTY_PX_TO_M/2,hz:p.h*PROPERTY_PX_TO_M/2};
  })};
  const terrain={heightAt:(x:number,z:number)=>landscape.heightAtWorld(x,z),paintSeed:()=>area.terrain.seed};
  const ctx={scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),quality:'lite',time:4,timeOfDay:'morning',events:new EventTarget(),
    get:(id:string)=>{if(id==='hunt3d')return hunt;if(id==='terrain')return terrain;throw new Error(id);}} as unknown as Ctx;
  return {landscape,state,ctx};
}

describe('vegetation material wiring',()=>{
  it.each(['quail','chukar','prairie-grass','prairie-habitat'])('updates %s materials from live wind without rebuilding scenery',async kind=>{
    const {landscape,state,ctx}=fixture(kind==='quail'?'quail-fields':kind==='chukar'?'chukar-ridge':'sharptail-prairie');
    const system:Subsystem=kind==='quail'?new QuailEnvironmentSystem(landscape):kind==='chukar'?new ChukarEnvironmentSystem(landscape)
      :kind==='prairie-grass'?new GrassSystem(landscape):new PropertyHabitatSystem(landscape);
    await system.init(ctx);
    try{
      const directionKey=kind==='quail'?'uQuailWindDirection':kind==='chukar'?'uChukarWindDirection':kind==='prairie-grass'?'uWindDir':'uHabitatWindDirection';
      const strengthKey=kind==='quail'?'uQuailWindStrength':kind==='chukar'?'uChukarWindStrength':kind==='prairie-grass'?'uWindAmp':'uHabitatWindStrength';
      const materials=new Set<THREE.Material>(),meshes:THREE.InstancedMesh[]=[];
      ctx.scene.traverse(object=>{if(object instanceof THREE.InstancedMesh){meshes.push(object);for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);}});
      const shaders:THREE.WebGLProgramParametersWithUniforms[]=[];
      for(const material of materials){
        const shader={vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader,uniforms:{}} as THREE.WebGLProgramParametersWithUniforms;
        material.onBeforeCompile(shader,ctx.renderer);if(shader.uniforms[directionKey])shaders.push(shader);
      }
      expect(shaders.length).toBeGreaterThan(0);
      const matrices=meshes.map(mesh=>mesh.instanceMatrix.version),counts=meshes.map(mesh=>mesh.count);
      const amplitudes=shaders.map(shader=>shader.uniforms[strengthKey].value as number);
      for(const shader of shaders){expect(shader.uniforms[directionKey].value.x).toBeCloseTo(0);expect(shader.uniforms[directionKey].value.y).toBeCloseTo(1);}
      state.wind=Math.PI;state.windStrength='strong';ctx.time=5;system.update!(ctx,1/60);
      shaders.forEach((shader,i)=>{
        expect(shader.uniforms[directionKey].value.x).toBeCloseTo(-1);expect(shader.uniforms[directionKey].value.y).toBeCloseTo(0);
        expect(shader.uniforms[strengthKey].value).toBeCloseTo(amplitudes[i]/vegetationWindStrength('calm'));
      });
      expect(meshes.map(mesh=>mesh.instanceMatrix.version)).toEqual(matrices);expect(meshes.map(mesh=>mesh.count)).toEqual(counts);
      if(kind==='chukar'){
        const depth=meshes.find(mesh=>mesh.customDepthMaterial)?.customDepthMaterial;expect(depth).toBeDefined();
        const shader={vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader,uniforms:{}} as THREE.WebGLProgramParametersWithUniforms;
        depth!.onBeforeCompile(shader,ctx.renderer);
        expect(shader.uniforms[directionKey]).toBe(shaders[0].uniforms[directionKey]);expect(shader.uniforms[strengthKey]).toBe(shaders[0].uniforms[strengthKey]);
      }
    }finally{system.dispose?.(ctx);}
  },30000);
});
