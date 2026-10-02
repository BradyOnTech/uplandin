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
import { generatedBreedForCoat, type GeneratedCoatId, type GeneratedLook } from '../dogs/generatedGsp';
import { dogRendererId } from '../dogs/rendererId';
import type { HuntArrivalFrame } from '../huntArrival';
import { installDogReview } from '../dogs/dogReview';

type AuditScope = { __generatedDogAudit?: unknown; __generatedDogAudits?: Record<string, unknown> };

/** Shared GSP presentation for either brace member; the hunt retains
 * authority over breed behavior, movement and bird ownership. */
export class GeneratedDogSystem implements Subsystem {
  readonly id:string;
  constructor(private readonly coatId:GeneratedCoatId='liver-white',private readonly slot=0,private readonly look:GeneratedLook='smooth'){this.id=dogRendererId(slot);}
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
  private arrival: { pose: HuntArrivalFrame['dog']; elapsed: number; dt: number } | null = null;
  private arrivalFeet = Array.from({ length: 4 }, () => new THREE.Vector3());
  private arrivalNormals = Array.from({ length: 4 }, () => new THREE.Vector3(0, 1, 0));
  setArrivalPose(pose: HuntArrivalFrame['dog'] | null, elapsed = 0, dt = 0): void {
    this.arrival = pose ? { pose, elapsed, dt } : null;
    if (!pose) {
      this.placed = false; this.speed = 0;
      this.attention.yaw = 0; this.attention.pitch = 0;
      if (this.motion) {
        this.motion.cycle = 0; this.motion.scentMotion.reset(); this.motion.mouthMotion.reset();
        this.motion.feet.forEach(foot => { foot.locked = false; foot.initialized = false; foot.step = 0; });
        this.motion.asset.root.rotation.x = this.motion.asset.root.rotation.z = 0;
      }
    }
  }
  private field:GeneratedFieldIntent={state:'quartering',scentStage:'none',scentProgress:0,waitingForHandler:false,intentYaw:0,inCover:false};
  /** Under ?capture the hunt only moves by explicit ticks; poses follow that clock. */
  private capture=typeof location!=='undefined'&&new URLSearchParams(location.search).has('capture');
  private captureTicks=-1;
  /** Cover parted around the dog: wider once it stands on point. */
  private parting=.9;
  private audit=()=>{
    if(!this.motion)return null;
    const mouth=new THREE.Vector3();this.mouthWorld(mouth);
    return {source:'generated-gsp',version:1,slot:this.slot,breed:generatedBreedForCoat(this.coatId),coatId:this.coatId,frame:this.auditFrame,state:this.hunt.dog(this.slot).state,moving:this.motion.moving,speed:this.speed,gait:this.motion.gait,
      field:{...this.field,performance:this.motion.scentMotion.performance},jawAngle:this.motion.mouthMotion.angle,
      swimming:this.motion.swimming,clamped:this.motion.clamped,stats:this.motion.asset.stats,root:this.motion.asset.root.position.toArray(),mouth:mouth.toArray(),feet:this.motion.contactSnapshot()};
  };
  /** Read-only review snapshot of this renderer, independent of window registration. */
  snapshot(){return this.audit();}
  init(ctx:Ctx){
    this.hunt=ctx.get<Hunt3DSystem>('hunt3d');const terrain=ctx.get<TerrainSystem>('terrain');
    const water=new ShallowWater(new LandscapeModel(this.hunt.areaConfig(),this.hunt.dropPoint().id));
    this.motion=new GeneratedFieldMotion(ctx.quality,(x,z)=>terrain.heightAt(x,z),(x,z)=>water.depthAtWorld(x,z),this.coatId,this.look);ctx.scene.add(this.motion.asset.root);
    const scope=window as unknown as AuditScope;
    (scope.__generatedDogAudits??={})[this.id]=this.audit;
    if(this.slot===0)scope.__generatedDogAudit=this.audit;
    if(this.capture&&this.slot===0){
      const motion=this.motion;
      this.uninstallReview=installDogReview(ctx,{root:motion.asset.root,heightAt:(x,z)=>terrain.heightAt(x,z),coverAt:(x,z)=>this.coverHeightAt(ctx,x,z),state:()=>{
        const dog=this.hunt.dog(this.slot);
        return {state:dog.state,gait:dog.gait,breed:generatedBreedForCoat(this.coatId),scent:{stage:dog.scentStage,progress:dog.scentProgress},
          paws:motion.contactSnapshot().map(foot=>({i:foot.i,x:foot.actual[0],y:foot.actual[1],z:foot.actual[2],gap:foot.groundGap}))};
      }});
    }
  }
  private uninstallReview?:()=>void;
  update(ctx:Ctx,frameDt:number){
    if(!this.motion)return;
    if(this.arrival){this.updateArrival();return;}
    // A frozen capture renders with dt 0; advance the pose by the hunt
    // ticks stepped since the last render instead, so it settles honestly.
    let dt=frameDt;
    if(this.capture&&frameDt===0&&this.hunt.tickCount){
      const ticks=this.hunt.tickCount();
      dt=this.captureTicks<0?0:Math.min(2,(ticks-this.captureTicks)/30);
      this.captureTicks=ticks;
    }
    const dog=this.hunt.dog(this.slot);this.hunt.dogRenderWorld(ctx.fixedAlpha,this.position,this.slot);
    const distance=this.placed?Math.hypot(this.position.x-this.previous.x,this.position.z-this.previous.z):0;
    // The hunt snaps its first live placement away from the authored map
    // spawn. That relocation is not a traveled stride or a speed sample.
    if(!this.placed||distance>3)this.speed=0;
    else if(dt>0)this.speed=THREE.MathUtils.lerp(this.speed,distance/dt,1-Math.exp(-dt*12));
    const intentHeading=this.hunt.dogRenderHeading(ctx.fixedAlpha,this.slot);
    this.heading=dogTorsoHeading(dog,this.speed,this.hunt.dogRenderTravelHeading(ctx.fixedAlpha,this.slot),intentHeading,this.heading,dt,!this.placed||distance>3);
    this.field.state=dog.state;this.field.scentStage=dog.scentStage;this.field.scentProgress=dog.scentProgress??0;
    this.field.waitingForHandler=dog.waitingForHandler??false;
    this.field.slam=dog.slamProgress?.()??null;
    this.field.inCover=dog.state==='quartering'&&this.inCoverPatch();
    this.field.coverHeight=this.coverHeightAt(ctx,this.position.x,this.position.z);
    // Model yaw is pi/2 minus the simulation heading, so intent relative to
    // the torso has the opposite sign. Wrap before clamping in the pose layer.
    this.field.intentYaw=Math.atan2(Math.sin(this.heading-intentHeading),Math.cos(this.heading-intentHeading));
    const point=dog.state==='pointing'||dog.state==='honoring';
    this.parting+=((point?2:.9)-this.parting)*(1-Math.exp(-Math.max(0,dt)*(point?3:6)));
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
  private updateArrival(): void {
    const motion = this.motion!, { pose, elapsed } = this.arrival!, asset = motion.asset;
    const walking = pose.locomotion === 'walk', airborne = pose.locomotion === 'hop';
    const contacts = walking ? asset.setLocomotion('trot', Math.max(0, elapsed - 1.02) * 3.1 % 1) : undefined;
    if (!walking) asset.setPose('stand');
    asset.root.position.set(pose.x, pose.y, pose.z);
    asset.root.rotation.set(-pose.pitch, Math.PI / 2 - pose.heading, 0, 'YXZ');
    const joints = asset.joints;
    joints.body.position.y -= pose.bodyCompression * .12;
    joints.neck.rotation.x -= .075 * pose.excitement;
    joints.head.rotation.y += Math.sin(elapsed * 5) * .065 * pose.excitement;
    joints.tail.rotation.x = .16;
    joints.tail.rotation.y = Math.sin(elapsed * 19) * .25 * pose.excitement;
    joints['ear-left'].rotation.z += Math.sin(elapsed * 15 + .35) * .025 * pose.excitement;
    joints['ear-right'].rotation.z -= Math.sin(elapsed * 15 - .35) * .025 * pose.excitement;
    if (airborne) {
      const fold = Math.sin(Math.PI * THREE.MathUtils.clamp((elapsed - 1.52) / .64, 0, 1));
      for (const side of ['left', 'right']) {
        joints[`front-${side}`].rotation.x += .38 * fold;
        joints[`front-${side}-lower`].rotation.x -= 1.20 * fold;
        joints[`front-${side}-distal`].rotation.x += 1.15 * fold;
        joints[`front-${side}-paw`].rotation.x -= .33 * fold;
        joints[`hind-${side}`].rotation.x -= .28 * fold;
        joints[`hind-${side}-lower`].rotation.x += .72 * fold;
        joints[`hind-${side}-distal`].rotation.x -= .44 * fold;
      }
    } else {
      // During the box/ground beats, solve against the supplied platform,
      // never against terrain a metre underneath the transport box.
      asset.root.updateMatrixWorld(true);
      asset.paws.forEach((paw, i) => {
        paw.getWorldPosition(this.arrivalFeet[i]);
        this.arrivalFeet[i].y = pose.y + .023 + (contacts?.feet[i].lift ?? 0);
      });
      asset.solveWorldFeet(this.arrivalFeet, this.arrivalNormals);
    }
    asset.root.updateMatrixWorld(true); asset.skeleton.update();
    this.position.x = pose.x; this.position.z = pose.z; this.heading = pose.heading;
    this.previous.x = pose.x; this.previous.z = pose.z; this.speed = 0;
    motion.feet.forEach((foot, i) => {
      asset.paws[i].getWorldPosition(foot.target);
      foot.locked = false; foot.initialized = false; foot.step = 0;
    });
    this.auditFrame++;
  }
  partingPoint(out:{x:number;z:number;r:number}){out.x=this.position.x;out.z=this.position.z;out.r=this.parting;}
  /** Standing cover that reports its crown height (Cattail's stands); else none. */
  private cover?:{launchHeightAt?(x:number,z:number):number}|null;
  private coverHeightAt(ctx:Ctx,x:number,z:number):number{
    if(this.cover===undefined){try{this.cover=ctx.get<Subsystem&{launchHeightAt?(x:number,z:number):number}>('grass');}catch{this.cover=null;}}
    return this.cover?.launchHeightAt?.(x,z)??0;
  }
  private inCoverPatch():boolean{
    const patches=this.hunt.coverPatches?.()??[];
    for(const p of patches)if(Math.abs(this.position.x-p.cx)<p.hx&&Math.abs(this.position.z-p.cz)<p.hz)return true;
    return false;
  }
  mouthWorld(out:THREE.Vector3){if(!this.motion)return false;out.copy(this.motion.mouthMotion.grip);this.motion.asset.joints.head.localToWorld(out);return true;}
  dispose(){
    this.uninstallReview?.();this.uninstallReview=undefined;
    const scope=window as unknown as AuditScope;
    if(scope.__generatedDogAudit===this.audit)delete scope.__generatedDogAudit;
    if(scope.__generatedDogAudits?.[this.id]===this.audit)delete scope.__generatedDogAudits[this.id];
    if(scope.__generatedDogAudits&&Object.keys(scope.__generatedDogAudits).length===0)delete scope.__generatedDogAudits;
    this.motion?.dispose();this.motion=undefined;
    this.arrival=null;
  }
}
