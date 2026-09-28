import { LandscapeModel } from '../../game/landscape';
import { ShallowWater } from '../../game/shallowWater';
import * as THREE from 'three';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';
import type { TerrainSystem } from './terrain';
import { GeneratedFieldMotion, type GeneratedRetrievePose } from '../dogs/generatedFieldMotion';
import { dogTorsoHeading } from '../dogs/riggedMotion';
import { GeneratedAttention } from '../dogs/generatedAttention';
import type { BirdsSystem } from './birds';
import type { GeneratedFieldIntent } from '../dogs/generatedScentMotion';
import type { GspCoatId } from '../dogs/germanShorthairedPointer';
import { dogRendererId } from '../dogs/rendererId';

type AuditScope = { __generatedDogAudit?: unknown; __generatedDogAudits?: Record<string, unknown> };

/** Shared GSP presentation for either brace member; the hunt retains
 * authority over breed behavior, movement and bird ownership. */
export class GeneratedDogSystem implements Subsystem {
  readonly id:string;
  constructor(private readonly coatId:GspCoatId='liver-white',private readonly slot=0){this.id=dogRendererId(slot);}
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
  private pickupTarget=new THREE.Vector3();
  private field:GeneratedFieldIntent={state:'quartering',scentStage:'none',scentProgress:0,waitingForHandler:false,intentYaw:0};
  private audit=()=>{
    if(!this.motion)return null;
    const mouth=new THREE.Vector3();this.mouthWorld(mouth);
    return {source:'generated-gsp',version:1,slot:this.slot,coatId:this.coatId,frame:this.auditFrame,state:this.hunt.dog(this.slot).state,moving:this.motion.moving,speed:this.speed,gait:this.motion.gait,
      field:{...this.field,performance:this.motion.scentMotion.performance},jawAngle:this.motion.mouthMotion.angle,
      swimming:this.motion.swimming,clamped:this.motion.clamped,stats:this.motion.asset.stats,root:this.motion.asset.root.position.toArray(),mouth:mouth.toArray(),feet:this.motion.contactSnapshot()};
  };
  init(ctx:Ctx){
    this.hunt=ctx.get<Hunt3DSystem>('hunt3d');const terrain=ctx.get<TerrainSystem>('terrain');
    const water=new ShallowWater(new LandscapeModel(this.hunt.areaConfig(),this.hunt.dropPoint().id));
    this.motion=new GeneratedFieldMotion(ctx.quality,(x,z)=>terrain.heightAt(x,z),(x,z)=>water.depthAtWorld(x,z),this.coatId);ctx.scene.add(this.motion.asset.root);
    const scope=window as unknown as AuditScope;
    (scope.__generatedDogAudits??={})[this.id]=this.audit;
    if(this.slot===0)scope.__generatedDogAudit=this.audit;
  }
  update(ctx:Ctx,dt:number){
    if(!this.motion)return;const dog=this.hunt.dog(this.slot);this.hunt.dogRenderWorld(ctx.fixedAlpha,this.position,this.slot);
    const distance=this.placed?Math.hypot(this.position.x-this.previous.x,this.position.z-this.previous.z):0;
    // The hunt snaps its first live placement away from the authored map
    // spawn. That relocation is not a traveled stride or a speed sample.
    if(!this.placed||distance>3)this.speed=0;
    else if(dt>0)this.speed=THREE.MathUtils.lerp(this.speed,distance/dt,1-Math.exp(-dt*12));
    const intentHeading=this.hunt.dogRenderHeading(ctx.fixedAlpha,this.slot);
    this.heading=dogTorsoHeading(dog,this.speed,this.hunt.dogRenderTravelHeading(ctx.fixedAlpha,this.slot),intentHeading,this.heading,dt,!this.placed||distance>3);
    this.field.state=dog.state;this.field.scentStage=dog.scentStage;this.field.scentProgress=dog.scentProgress??0;
    this.field.waitingForHandler=dog.waitingForHandler??false;
    // Model yaw is pi/2 minus the simulation heading, so intent relative to
    // the torso has the opposite sign. Wrap before clamping in the pose layer.
    this.field.intentYaw=Math.atan2(Math.sin(this.heading-intentHeading),Math.cos(this.heading-intentHeading));
    const point=dog.state==='pointing'||dog.state==='honoring';
    const retrieveId=dog.carryingBirdId??dog.reservedRetrieveId?.();
    const retrieve: GeneratedRetrievePose | undefined = dog.state === 'retrieving'
      ? { stage: dog.carryingBirdId !== null ? dog.gait === 'still' && dog.retrieveHoldTimeMs() > 0 ? 'deliver' : 'carry' : 'pickup',
          holdMs: dog.retrieveHoldTimeMs?.() ?? 0,
          speciesId: this.hunt.huntState?.().birds.find(bird=>bird.id===retrieveId)?.speciesId }
      : undefined;
    // Only settle into pickup once the simulation has reached the actual fall.
    const retrievePose = retrieve?.stage === 'pickup' && dog.gait !== 'still' ? undefined : retrieve;
    if(retrievePose?.stage==='pickup'&&retrieveId!=null&&ctx.get<BirdsSystem>('birds').groundedTarget?.(retrieveId,this.pickupTarget))
      retrievePose.target=this.pickupTarget;
    this.motion.update(this.position.x,this.position.z,Math.PI/2-this.heading,dt,dog.gait!=='still'&&this.speed>.06&&!point,point,retrievePose,this.field,this.speed);
    this.auditFrame++;
    const watching=dog.state==='marking' && ctx.get<BirdsSystem>('birds').markingTarget(dog.watchedBirdIds(),this.attentionTarget);
    this.attention.update(this.motion.asset,watching?this.attentionTarget:null,dt);
    this.previous.x=this.position.x;this.previous.z=this.position.z;this.placed=true;
  }
  partingPoint(out:{x:number;z:number;r:number}){out.x=this.position.x;out.z=this.position.z;out.r=.44;}
  mouthWorld(out:THREE.Vector3){if(!this.motion)return false;out.copy(this.motion.mouthMotion.grip);this.motion.asset.joints.head.localToWorld(out);return true;}
  dispose(){
    const scope=window as unknown as AuditScope;
    if(scope.__generatedDogAudit===this.audit)delete scope.__generatedDogAudit;
    if(scope.__generatedDogAudits?.[this.id]===this.audit)delete scope.__generatedDogAudits[this.id];
    if(scope.__generatedDogAudits&&Object.keys(scope.__generatedDogAudits).length===0)delete scope.__generatedDogAudits;
    this.motion?.dispose();this.motion=undefined;
  }
}
