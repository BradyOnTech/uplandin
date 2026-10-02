import * as THREE from 'three';
import { GeneratedEarGravity } from './generatedEarGravity';
import { selectLocomotionGait, type LocomotionGait, type LocomotionSpeedThresholds } from './locomotion';
import { createGeneratedGsp, GENERATED_STRIDE, type GeneratedCoatId, type GeneratedLook } from './generatedGsp';
import { GeneratedScentMotion, fieldPerformance, type GeneratedFieldIntent } from './generatedScentMotion';
import { GeneratedBodySupport } from './generatedBodySupport';
import { GeneratedMouthMotion } from './generatedMouth';
import { GeneratedPickupReach } from './generatedPickupReach';
import { GeneratedPivotSteps } from './generatedPivotSteps';

// Retain the generated dog's established pace centers, but require a real
// acceleration/deceleration through a band before changing footfall law.
const GENERATED_GAIT_SPEEDS: LocomotionSpeedThresholds = {
  walkToTrot: 1.33, trotToWalk: .97,
  trotToCanter: 2.68, canterToTrot: 2.32,
  canterToGallop: 4.48, gallopToCanter: 4.12,
};

export interface GeneratedRetrievePose {
  stage: 'pickup' | 'carry' | 'deliver'; holdMs: number; speciesId?: string;
  /** Actual grounded bird centre; only the reserved fall may drive a reach. */
  target?: Readonly<{ x: number; y: number; z: number }>;
}

/** Presentation-only ground contacts. The shared hunt remains the movement authority. */
export class GeneratedFieldMotion {
  readonly asset: ReturnType<typeof createGeneratedGsp>;
  readonly feet = Array.from({length:4},()=>({target:new THREE.Vector3(),normal:new THREE.Vector3(0,1,0),from:new THREE.Vector3(),goal:new THREE.Vector3(),locked:false,step:0,initialized:false,plantId:0}));
  private nextPlantId=1;
  cycle=0;
  gait: LocomotionGait='walk';
  clamped=0;
  private targets=this.feet.map(f=>f.target);
  private normals=this.feet.map(f=>f.normal);
  private placed=false;
  private last=new THREE.Vector3();
  private nominal=new THREE.Vector3();
  private pivotNominal=Array.from({length:4},()=>new THREE.Vector3());
  private pivotSteps=new GeneratedPivotSteps();
  private bodyHeight=0;
  private pointPresence=0;
  readonly scentMotion=new GeneratedScentMotion();
  private bodySupport=new GeneratedBodySupport();
  private earGravity=new GeneratedEarGravity();
  readonly mouthMotion=new GeneratedMouthMotion();
  private pickupReach=new GeneratedPickupReach();
  private pickupPresence=0;
  private tailStride=0;
  private pickupLean=0;
  private pickupHeadPitch=.30;
  private carryPresence=0;
  private deliverPresence=0;
  private presentClock=0;
  private wasMoving=false;
  private lastYaw=0;
  private transitionTime=.24;
  private transitionRaised=false;
  private transitionFree=[false,false,false,false];
  private pose: {node:THREE.Bone;previousPosition:THREE.Vector3;previousRotation:THREE.Quaternion;fromPosition:THREE.Vector3;fromRotation:THREE.Quaternion}[];
  private groundNormal(x:number,z:number,out:THREE.Vector3) {const e=.04;return out.set(this.ground(x-e,z)-this.ground(x+e,z),2*e,this.ground(x,z-e)-this.ground(x,z+e)).normalize();}
  swimming=false;
  constructor(detail:'high'|'lite',private ground:(x:number,z:number)=>number,private waterDepth:(x:number,z:number)=>number=()=>0,coatId:GeneratedCoatId='liver-white',look:GeneratedLook='smooth') {
    this.asset=createGeneratedGsp(detail,true,coatId,look);
    // Torso support has its own continuous response; blending its solved
    // position a second time would accumulate the ribcage pivot offset.
    this.pose=Object.values(this.asset.joints).filter(node=>node!==this.asset.joints.body).map(node=>({node,previousPosition:node.position.clone(),previousRotation:node.quaternion.clone(),fromPosition:node.position.clone(),fromRotation:node.quaternion.clone()}));
  }
  update(x:number,z:number,yaw:number,dt:number,moving:boolean,point:boolean,retrieve?:GeneratedRetrievePose,field?:GeneratedFieldIntent,presentationSpeed?:number) {
    const root=this.asset.root,ground=this.ground(x,z),distance=this.placed?Math.hypot(x-this.last.x,z-this.last.z):0;
    const depth=this.waterDepth(x,z);
    const wasSwimming=this.swimming;
    this.swimming=depth>(wasSwimming?.38:.48);
    if(this.swimming){
      this.cycle=(this.cycle+Math.max(0,dt)*1.25)%1;
      this.gait='walk';
      this.clamped=this.asset.setSwimming(this.cycle);
      // Keep the torso afloat while submerged paws paddle freely. Ground
      // contact solving would otherwise pin the body to the basin floor.
      root.position.set(x,ground+Math.max(0,depth-.4),z);root.rotation.set(0,yaw,0);
      root.updateMatrixWorld(true);
      this.feet.forEach((foot,i)=>{foot.locked=false;foot.initialized=false;this.asset.paws[i].getWorldPosition(foot.target);});
      this.pointPresence=0;this.pickupPresence=0;this.carryPresence=0;this.deliverPresence=0;this.wasMoving=true;
      this.scentMotion.reset();
      this.pickupReach.reset();
      this.pivotSteps.reset();
      this.mouthMotion.update(this.asset.joints.jaw,retrieve?.stage==='carry'?retrieve:undefined,dt);
      this.earGravity.update(this.asset.joints,dt,!this.placed||!wasSwimming||distance>3);
      root.updateMatrixWorld(true);
      this.last.set(x,ground,z);this.lastYaw=yaw;this.placed=true;
      this.pose.forEach(p=>{p.previousPosition.copy(p.node.position);p.previousRotation.copy(p.node.quaternion);});
      return;
    }
    const reset=!this.placed||distance>3||wasSwimming;
    const signedTurnRate=reset||dt<=0?0:Math.atan2(Math.sin(yaw-this.lastYaw),Math.cos(yaw-this.lastYaw))/dt;
    const turnRate=Math.abs(signedTurnRate);
    const pivoting=turnRate>1;
    const wasRaised=!this.wasMoving&&this.pointPresence>0;
    const locking=!retrieve&&fieldPerformance(field)==='locking';
    const pointTarget=moving?0:point?1:locking?THREE.MathUtils.clamp(field!.scentProgress,0,1):0;
    // Locking already has a shared, finite clock. Lift during that beat and
    // carry its progress into point instead of starting a second point entry.
    const pointStep=Math.max(0,dt)/(locking?.18:.28);
    this.pointPresence=reset?pointTarget:moving?0:this.pointPresence+THREE.MathUtils.clamp(pointTarget-this.pointPresence,-pointStep,pointStep);
    if(reset){this.feet.forEach(f=>{f.locked=false;f.initialized=false;f.step=0;});this.pivotSteps.reset();this.cycle=0;}
    root.position.set(x,ground,z);root.rotation.y=yaw;
    const speed=!reset&&dt>0?distance/dt:0;
    const action = point ? undefined : retrieve?.stage;
    const actionBlend = 1 - Math.exp(-Math.max(0, dt) * 12);
    this.pickupPresence = THREE.MathUtils.lerp(this.pickupPresence, action === 'pickup' ? THREE.MathUtils.smoothstep(retrieve!.holdMs, 0, 180) : 0, actionBlend);
    this.carryPresence = THREE.MathUtils.lerp(this.carryPresence, action === 'carry' ? 1 : 0, actionBlend);
    this.deliverPresence = THREE.MathUtils.lerp(this.deliverPresence, action === 'deliver' ? 1 : 0, actionBlend);
    if(action==='pickup'&&retrieve?.target){
      const forward=(retrieve.target.x-x)*Math.sin(yaw)+(retrieve.target.z-z)*Math.cos(yaw);
      this.pickupLean=THREE.MathUtils.clamp((forward-.36)*.55,.04,.16);
      // A real fall is gripped from above at a shallow enough angle that
      // the nose clears the ground beyond the bird on an uphill slope.
      this.groundNormal(retrieve.target.x,retrieve.target.z,this.nominal);
      const fallSlope=Math.atan2(-this.nominal.x*Math.sin(yaw)-this.nominal.z*Math.cos(yaw),this.nominal.y);
      this.pickupHeadPitch=THREE.MathUtils.clamp(-.10-fallSlope*.85,-.40,.18);
    } else if(this.pickupPresence<.001){this.pickupLean=0;this.pickupHeadPitch=.30;}
    const previousGait=this.gait;
    let contacts: ReturnType<GeneratedFieldMotion['asset']['setLocomotion']>|undefined;
    if(moving) {
      if(!this.wasMoving){this.gait=speed>4.3?'gallop':speed>2.5?'canter':speed>1.15?'trot':'walk';this.cycle=0;}
      const previous=this.cycle,stride=GENERATED_STRIDE[this.gait];
      this.cycle=(this.cycle+(reset?0:distance)/stride)%1;
      // Distance still advances the stride exactly. Only classification
      // uses the subsystem's filtered physical speed, at a stride boundary.
      if(reset||this.cycle<previous) {
        // Preserve the generated controller's ability to respond directly
        // to a large pace change, rather than inserting entire walk/trot
        // strides at running speed. Small variations settle in the band.
        for(let pass=0;pass<3;pass++) {
          const next=selectLocomotionGait(presentationSpeed??speed,this.gait,GENERATED_GAIT_SPEEDS);
          if(next===this.gait)break;
          this.gait=next;
        }
      }
      contacts=this.asset.setLocomotion(this.gait,this.cycle);
    } else {
      const t=this.pointPresence;
      this.asset.setPose(t>0?'point':'stand',t*t*(3-2*t));
    }
    if(reset)this.transitionTime=.24;
    else if(moving!==this.wasMoving||(moving&&this.gait!==previousGait)) {
      this.transitionTime=0;this.transitionRaised=wasRaised;
      this.transitionFree=this.feet.map(f=>!f.locked);
      this.pose.forEach(p=>{p.fromPosition.copy(p.previousPosition);p.fromRotation.copy(p.previousRotation);});
    }
    this.transitionTime=Math.min(.24,this.transitionTime+Math.max(0,dt));
    const blending=this.transitionTime<.24;
    if(blending) {
      const t=this.transitionTime/.24,blend=t*t*(3-2*t);
      this.pose.forEach(p=>{p.node.position.lerpVectors(p.fromPosition,p.node.position,blend);p.node.quaternion.slerp(p.fromRotation,1-blend);});
    }
    const desiredBody=this.asset.joints.body.position.y;
    this.bodyHeight=reset?desiredBody:THREE.MathUtils.lerp(this.bodyHeight,desiredBody,1-Math.exp(-dt*12));
    this.asset.joints.body.position.y=this.bodyHeight;
    const supportOffset=this.bodySupport.update(this.asset,this.ground,x,z,yaw,speed,signedTurnRate,dt,moving,reset);
    root.updateMatrixWorld(true);
    // An airborne pointing paw carries the authored bend through entry and
    // release. Ground IK would otherwise unfold it and force its sole level.
    let posedFoot=(!moving&&this.pointPresence>0)||(blending&&this.transitionRaised)?0:-1;
    if(posedFoot>=0&&(moving||pointTarget<this.pointPresence)) {
      this.asset.paws[posedFoot].getWorldPosition(this.nominal);
      // The release can touch down before the upper-body crossfade finishes.
      // Hand it back to ground IK at contact, rather than letting a bank or
      // load response push the formerly raised paw through the terrain.
      if(this.nominal.y<=this.ground(this.nominal.x,this.nominal.z)+.029) {
        this.transitionRaised=false;posedFoot=-1;
      }
    }
    const pivotEligible=!reset&&!moving&&!blending&&posedFoot<0&&action!=='pickup';
    if(pivotEligible)this.asset.paws.forEach((paw,i)=>paw.getWorldPosition(this.pivotNominal[i]));
    const plannedPivot=this.pivotSteps.update(this.feet,this.pivotNominal,x,z,yaw,signedTurnRate,dt,
      pivotEligible,this.ground,()=>this.nextPlantId++);
    this.feet.forEach((foot,i)=>{
      if(plannedPivot){this.groundNormal(foot.target.x,foot.target.z,foot.normal);return;}
      this.asset.paws[i].getWorldPosition(this.nominal);
      const raised=i===posedFoot;
      if(raised) {
        foot.target.copy(this.nominal);foot.locked=false;foot.step=0;foot.initialized=true;foot.plantId=0;
        this.groundNormal(foot.target.x,foot.target.z,foot.normal);return;
      }
      const lift=.023+(contacts?.feet[i].lift??0);
      const floor=this.ground(this.nominal.x,this.nominal.z)+.023;
      // A blended pose can still have an airborne paw when the new clip asks
      // for stance. Wait for touchdown before creating a world-space plant.
      const support=(!contacts||contacts.feet[i].contact!=='swing')&&!(blending&&this.transitionFree[i])
        &&(foot.locked||!blending||this.nominal.y<=floor+.001);
      this.nominal.y=blending?Math.max(floor,this.nominal.y):floor+lift-.023;
      if(!foot.initialized){foot.target.copy(this.nominal);foot.initialized=true;}
      if(!support) {
        foot.locked=false;foot.step=0;
        foot.target.copy(this.nominal);
      } else {
        if(!foot.locked){
          foot.target.copy(this.nominal);
          foot.target.y=floor;
          foot.locked=true;foot.plantId=this.nextPlantId++;
        }
        const gap=Math.hypot(foot.target.x-this.nominal.x,foot.target.z-this.nominal.z);
        const stepping=this.feet.findIndex(f=>f.step>0);
        const canStep=stepping<0||(pivoting&&posedFoot<0&&stepping===3-i&&this.feet.filter(f=>f.step>0).length<2);
        if(!foot.step&&gap>(pivoting?.07:moving?.22:.10)&&canStep) {foot.from.copy(foot.target);foot.goal.copy(this.nominal);foot.step=.000001;foot.plantId=this.nextPlantId++;}
        if(foot.step>0) {
          foot.goal.copy(this.nominal);
          foot.goal.y=floor;
          const duration=pivoting?.12/(1+turnRate*.10):.18;
          foot.step=Math.min(1,foot.step+dt/duration);const t=foot.step*foot.step*(3-2*foot.step);
          foot.target.lerpVectors(foot.from,foot.goal,t);foot.target.y+=Math.sin(foot.step*Math.PI)*.045;
          if(foot.step>=1)foot.step=0;
        }
      }
      this.groundNormal(foot.target.x,foot.target.z,foot.normal);
    });
    // Shift the supported chest toward the fall before solving the legs.
    // The already chosen ground contacts stay put, letting elbows flex
    // instead of stretching the entire neck into a long rigid stalk.
    this.asset.joints.body.position.z+=this.pickupLean*this.pickupPresence;
    this.asset.joints.body.rotation.x+=.10*(this.pickupLean/.16)*this.pickupPresence;
    this.bodyHeight=this.asset.fitBodyToFeet(this.targets,this.normals,posedFoot)-supportOffset;
    this.clamped=this.asset.solveWorldFeet(this.targets,this.normals,posedFoot);
    if(posedFoot>=0)this.asset.paws[posedFoot].getWorldPosition(this.feet[posedFoot].target);
    this.pose.forEach(p=>{p.previousPosition.copy(p.node.position);p.previousRotation.copy(p.node.quaternion);});
    this.bodySupport.stabilizeHead(this.asset,point||!!retrieve);
    this.scentMotion.update(this.asset,retrieve?undefined:field,moving,this.pointPresence,dt,reset);
    // Stride-coupled tail carriage: the tail counter-sways with each stride
    // and bounces with the trot's two-beat suspension. Only a travelling,
    // empty-mouthed dog; the point and carry keep their authored stillness.
    const strideWeight=moving&&!point&&!retrieve?1:0;
    this.tailStride=THREE.MathUtils.lerp(this.tailStride,strideWeight,reset?1:1-Math.exp(-Math.max(0,dt)*6));
    if(this.tailStride>.001){
      const setter=this.asset.root.userData.breedId==='english-setter';
      const sway={walk:.13,trot:.09,canter:.07,gallop:.045}[this.gait]*(setter?1.25:1);
      const phase=this.cycle*Math.PI*2;
      this.asset.joints.tail.rotation.y+=Math.sin(phase)*sway*this.tailStride;
      this.asset.joints.tail.rotation.x+=Math.cos(phase*2)*sway*.35*this.tailStride;
    }
    // Retrieval is an upper-body layer. Foot targets and locomotion remain
    // authoritative below; entering a pickup never slides the planted paws.
    const { neck, head } = this.asset.joints;
    neck.position.y -= .17 * this.pickupPresence;
    // Presenting lifts the head to the handler's hand, the tail going.
    neck.rotation.x += 1.25 * this.pickupPresence + .10 * this.carryPresence - .26 * this.deliverPresence;
    head.rotation.x += this.pickupHeadPitch * this.pickupPresence - .10 * this.carryPresence - .22 * this.deliverPresence;
    if (this.deliverPresence > .001) {
      this.presentClock += Math.max(0, dt);
      this.asset.joints.tail.rotation.y += Math.sin(this.presentClock * 9) * .30 * this.deliverPresence;
      this.asset.joints.tail.rotation.x -= .12 * this.deliverPresence;
    } else this.presentClock = 0;
    this.mouthMotion.update(this.asset.joints.jaw,point?undefined:retrieve,dt,reset);
    this.pickupReach.update(neck,head,this.mouthMotion.grip,
      action==='pickup'?retrieve?.target:undefined,retrieve?.holdMs??0,dt,reset);
    this.earGravity.update(this.asset.joints,dt,reset);
    root.updateMatrixWorld(true);
    this.wasMoving=moving;
    this.lastYaw=yaw;
    this.last.set(x,ground,z);this.placed=true;
  }
  contactSnapshot() {
    return this.feet.map((foot,i)=>{
      const actual=this.asset.paws[i].getWorldPosition(new THREE.Vector3());
      return {i,locked:foot.locked,step:foot.step,plantId:foot.plantId,target:foot.target.toArray(),actual:actual.toArray(),
        groundGap:actual.y-this.ground(actual.x,actual.z)-.023,targetError:actual.distanceTo(foot.target)};
    });
  }
  get moving(){return this.wasMoving;}
  dispose(){this.asset.dispose();}
}
