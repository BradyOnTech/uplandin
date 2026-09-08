import * as THREE from 'three';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';
import { GeneratedFieldMotion } from '../dogs/generatedFieldMotion';
import { dogTorsoHeading } from '../dogs/riggedMotion';
import { GeneratedAttention } from '../dogs/generatedAttention';
import type { BirdsSystem } from './birds';

/** Selectable prototype; fast-gait and full hunt-state polish remain in development. */
export class GeneratedDogSystem implements Subsystem {
  readonly id='dog';
  private motion?:GeneratedFieldMotion;
  private hunt!:Hunt3DSystem;
  private position={x:0,z:0};
  private previous={x:0,z:0};
  private placed=false;
  private heading=0;
  private speed=0;
  private auditFrame=0;
  private attention=new GeneratedAttention();
  private attentionTarget=new THREE.Vector3();
  private audit=()=>{
    if(!this.motion)return null;
    const mouth=new THREE.Vector3();this.mouthWorld(mouth);
    return {source:'generated-gsp',version:1,frame:this.auditFrame,state:this.hunt.dog().state,moving:this.motion.moving,speed:this.speed,gait:this.motion.gait,
      clamped:this.motion.clamped,stats:this.motion.asset.stats,root:this.motion.asset.root.position.toArray(),mouth:mouth.toArray(),feet:this.motion.contactSnapshot()};
  };
  init(ctx:Ctx){
    this.hunt=ctx.get<Hunt3DSystem>('hunt3d');const terrain=ctx.get<TerrainSystem>('terrain');
    this.motion=new GeneratedFieldMotion(ctx.quality,(x,z)=>terrain.heightAt(x,z));ctx.scene.add(this.motion.asset.root);
    (window as unknown as {__generatedDogAudit?:unknown}).__generatedDogAudit=this.audit;
  }
  update(ctx:Ctx,dt:number){
    if(!this.motion)return;const dog=this.hunt.dog();this.hunt.dogRenderWorld(ctx.fixedAlpha,this.position);
    const distance=this.placed?Math.hypot(this.position.x-this.previous.x,this.position.z-this.previous.z):0;
    // The hunt snaps its first live placement away from the authored map
    // spawn. That relocation is not a traveled stride or a speed sample.
    if(!this.placed||distance>3)this.speed=0;
    else if(dt>0)this.speed=THREE.MathUtils.lerp(this.speed,distance/dt,1-Math.exp(-dt*12));
    this.heading=dogTorsoHeading(dog,this.speed,this.hunt.dogRenderTravelHeading(ctx.fixedAlpha),this.hunt.dogRenderHeading(ctx.fixedAlpha),this.heading,dt,!this.placed||distance>3);
    const point=dog.state==='pointing'||dog.state==='honoring';
    this.motion.update(this.position.x,this.position.z,Math.PI/2-this.heading,dt,dog.gait!=='still'&&this.speed>.06&&!point,point);
    this.auditFrame++;
    const watching=dog.state==='marking' && ctx.get<BirdsSystem>('birds').markingTarget(dog.watchedBirdIds(),this.attentionTarget);
    this.attention.update(this.motion.asset,watching?this.attentionTarget:null,dt);
    this.previous.x=this.position.x;this.previous.z=this.position.z;this.placed=true;
  }
  partingPoint(out:{x:number;z:number;r:number}){out.x=this.position.x;out.z=this.position.z;out.r=.44;}
  mouthWorld(out:THREE.Vector3){if(!this.motion)return false;out.set(0,-.032,.158);this.motion.asset.joints.head.localToWorld(out);return true;}
  dispose(){const scope=window as unknown as {__generatedDogAudit?:unknown};if(scope.__generatedDogAudit===this.audit)delete scope.__generatedDogAudit;this.motion?.dispose();this.motion=undefined;}
}
