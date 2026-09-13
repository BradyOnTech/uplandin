import * as THREE from 'three';
import { playHawkWingbeat, playWhistle, unlockAudio } from '../../audio';
import { selectSlipTarget, type FalconryEvent, type FlightPoint } from '../../game/falconry';
import { createFalconryGlove, createGoshawk } from '../assets/goshawk';
import type { Ctx, Subsystem } from '../engine';
import type { Hunt3DSystem } from './hunt3d';
import type { BirdsSystem } from './birds';
import type { TerrainSystem } from './terrain';
import type { PlayerSystem } from './player';

export class FalconrySystem implements Subsystem {
  readonly id='falconry';
  private hunt!: Hunt3DSystem;
  private birds!: BirdsSystem;
  private terrain!: TerrainSystem;
  private hawk?: ReturnType<typeof createGoshawk>;
  private glove?: ReturnType<typeof createFalconryGlove>;
  private abort=new AbortController();
  private frozen=false;
  private intent: 'slip' | 'recover' | 'recall' | null=null;
  private following=false;
  private time=0;
  private lastWingbeat=-1;
  private previousPhase='fist';
  private landingBlend=1;
  private landingFrom=new THREE.Vector3();
  private message='';
  private messageUntil=0;
  private panel?: HTMLElement;
  private status?: HTMLElement;
  private primary?: HTMLButtonElement;
  private recallButton?: HTMLButtonElement;
  private followButton?: HTMLButtonElement;
  private fist=new THREE.Vector3();
  private forward=new THREE.Vector3();
  private offset=new THREE.Vector3(-.43,-.48,-.88);
  private lastHandler=new THREE.Vector3();
  private movement=0;
  private pickupFrom=new THREE.Vector3();

  init(ctx:Ctx):void {
    this.hunt=ctx.get<Hunt3DSystem>('hunt3d');
    if(!this.hunt.falconry) return;
    this.birds=ctx.get<BirdsSystem>('birds');this.terrain=ctx.get<TerrainSystem>('terrain');
    this.frozen=new URLSearchParams(location.search).has('capture');
    this.hawk=createGoshawk();this.glove=createFalconryGlove();
    this.hawk.root.scale.setScalar(.78);
    ctx.scene.add(this.hawk.root,this.glove.root);
    document.body.classList.add('falconry-hunt');
    if(!this.frozen) this.createControls(ctx);
    const signal=this.abort.signal;
    ctx.events.addEventListener('pause',()=>{this.intent=null;},{signal});
    window.addEventListener('keydown',e=>{
      if(ctx.paused||this.frozen||e.repeat||e.ctrlKey||e.metaKey||e.altKey||
        (e.target as HTMLElement)?.closest?.('button,input,select,textarea,[contenteditable="true"]')) return;
      if(e.code==='Space') {e.preventDefault();this.intent='slip';}
      if(e.code==='KeyR') {e.preventDefault();this.intent='recall';}
      if(e.code==='KeyE') {e.preventDefault();this.intent='recover';}
      if(e.code==='KeyF') {e.preventDefault();this.following=!this.following;}
    },{signal});
  }

  private createControls(ctx:Ctx):void {
    const panel=document.createElement('section');panel.id='falconry-controls';panel.setAttribute('aria-label','Goshawk controls');
    const label=document.createElement('div');label.className='falconry-label';label.textContent='GOSHAWK · FROM THE FIST';
    this.status=document.createElement('div');this.status.id='falconry-status';this.status.setAttribute('aria-live','polite');
    const actions=document.createElement('div');actions.className='falconry-actions';
    const button=(label:string,action:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>{if(ctx.paused)return;action();ctx.renderer.domElement.focus();},{signal:this.abort.signal});actions.append(b);return b;};
    this.primary=button('Slip · Space',()=>{this.intent=this.hunt.falconry!.phase==='on-quarry'?'recover':'slip';});
    this.recallButton=button('Recall hawk · R',()=>{this.intent='recall';});
    this.followButton=button('Watch hawk · F',()=>{this.following=!this.following;});
    panel.append(label,this.status,actions);document.body.append(panel);this.panel=panel;
  }

  private fistPosition(ctx:Ctx):THREE.Vector3 {
    return this.fist.copy(this.offset).applyQuaternion(ctx.camera.quaternion).add(ctx.camera.position);
  }
  private say(message:string):void {this.message=message;this.messageUntil=this.time+3;}
  private visible(from:FlightPoint,to:FlightPoint):boolean {
    const length=Math.hypot(to.x-from.x,to.z-from.z),steps=Math.max(1,Math.ceil(length));
    for(let i=1;i<steps;i++){const t=i/steps,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
      if(this.terrain.heightAt(x,z)>from.y+(to.y-from.y)*t-.1)return false;}
    return true;
  }
  private events(events:FalconryEvent[]):void {
    for(const event of events){
      if(event.type==='bound') {
        this.hunt.bindQuarryWorld(event.birdId,event.position.x,event.position.z);
        this.say('Bound. Your dog is going to the hawk. Walk in to pick up.');
      } else if(event.type==='recovered') {
        this.hunt.recoverQuarry(event.birdId);this.say('Hawk on fist, quarry recovered. Q sends the dog hunting again.');
      } else if(event.type==='missed') this.say('The flight is over. Your goshawk is returning.');
      else if(event.type==='recalled') { playWhistle(); this.say('Recall given. Your goshawk is returning.'); }
      else this.say('Back on the fist. Q sends the dog hunting again.');
    }
  }
  fixedUpdate(ctx:Ctx,dtMs:number):void {if(!this.frozen)this.step(ctx,dtMs);}
  /** Deterministic diagnostic stepping uses the same pursuit and input seam. */
  step(ctx:Ctx,dtMs:number):void {
    const hawk=this.hunt.falconry;if(!hawk)return;
    const dt=dtMs/1000;this.time+=dt;
    const fist=this.fistPosition(ctx),targets=this.birds.quarryTargets();
    if(this.intent==='slip') {
      ctx.camera.getWorldDirection(this.forward);
      const target=selectSlipTarget(fist,this.forward,targets,q=>this.visible(fist,q));
      if(target&&hawk.slip(fist,target)) { unlockAudio(); this.say('Away. Watch the flight.'); }
      else this.say(hawk.phase!=='fist'?'Your hawk is already away.':hawk.readyIn>0?'Let the hawk settle on the fist.':'Face a rising bird within 60 yards to offer a slip.');
    } else if(this.intent==='recall') {
      this.events(hawk.recall());
      if(['settling','on-quarry','picking-up'].includes(hawk.phase))this.say('Your hawk stays with the quarry. Walk in to pick it up.');
    }
    else if(this.intent==='recover') {
      const dog=this.hunt.dog(),dogWorld=this.hunt.dogWorld({x:0,z:0});
      const dogSettled=dog.raptorDuty==='guarding'&&Math.hypot(dogWorld.x-hawk.position.x,dogWorld.z-hawk.position.z)<3.5;
      hawk.recover(ctx.camera.position,dogSettled);
      if(hawk.phase==='picking-up') {this.pickupFrom.copy(hawk.position);this.following=false;this.say('Offer the glove. Your hawk steps up as you lift.');}
      else this.say(hawk.phase!=='on-quarry'?'Wait until your hawk settles with the quarry.':!dogSettled?'Let the dog settle beside the hawk.':'Come within arm’s reach, then pick up.');
    }
    this.intent=null;
    this.events(hawk.step(dt,fist,targets,(x,z)=>this.terrain.heightAt(x,z)));
    const beat=Math.floor(this.time*3.5);
    if(!this.frozen && ['launching','chasing','returning'].includes(hawk.phase) && beat!==this.lastWingbeat) {
      const d=Math.hypot(hawk.position.x-fist.x,hawk.position.y-fist.y,hawk.position.z-fist.z);
      playHawkWingbeat(.1/(1+d*d*.015)); this.lastWingbeat=beat;
    }
    if(hawk.targetId!==null&&(hawk.phase==='settling'||hawk.phase==='on-quarry')) this.birds.holdQuarry(hawk.targetId,hawk.position.x,hawk.position.y-.12,hawk.position.z);
  }
  update(ctx:Ctx,dt:number):void {
    const hawk=this.hunt.falconry;if(!hawk||!this.hawk||!this.glove)return;
    if(hawk.phase==='fist')this.following=false;
    if(this.following)ctx.get<PlayerSystem>('player').watchWorld(ctx,hawk.position,dt);
    const fist=this.fistPosition(ctx);
    const speed=this.lastHandler.lengthSq()===0?0:this.lastHandler.distanceTo(ctx.camera.position)/Math.max(.001,dt);
    this.movement=THREE.MathUtils.damp(this.movement,Math.min(1,speed/2.2),7,dt);this.lastHandler.copy(ctx.camera.position);
    this.glove.root.position.copy(fist);this.glove.root.quaternion.copy(ctx.camera.quaternion);
    this.glove.root.rotateY(-.35);
    const flying=['launching','chasing','returning'].includes(hawk.phase);
    if(hawk.phase==='fist'&&this.previousPhase!=='fist'&&this.previousPhase!=='picking-up') {this.landingFrom.copy(this.hawk.root.position);this.landingBlend=0;}
    this.landingBlend=Math.min(1,this.landingBlend+dt*4);
    this.hawk.root.position.copy(hawk.phase==='fist'?fist:hawk.position);
    if(hawk.phase==='fist'&&this.landingBlend<1)this.hawk.root.position.lerpVectors(this.landingFrom,fist,this.landingBlend*this.landingBlend*(3-2*this.landingBlend));
    this.previousPhase=hawk.phase;
    if(hawk.phase==='fist'){this.hawk.root.rotation.set(0,ctx.camera.rotation.y+Math.PI,0);}
    else {this.hawk.root.rotation.set(0,Math.PI/2-hawk.heading,0);}
    if(hawk.phase==='picking-up') {
      const progress=hawk.pickupProgress;
      const reach=THREE.MathUtils.smoothstep(progress,0,.38);
      const lift=THREE.MathUtils.smoothstep(progress,.38,1);
      this.glove.root.position.lerpVectors(fist,this.pickupFrom,reach*(1-lift));
      this.hawk.root.position.lerpVectors(this.pickupFrom,fist,lift);
      const turn=THREE.MathUtils.smoothstep(progress,.18,.85);
      const from=Math.PI/2-hawk.heading,to=ctx.camera.rotation.y+Math.PI;
      this.hawk.root.rotation.set(0,from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*turn,0);
      this.landingBlend=1;
    }
    this.hawk.pose(this.time,flying,hawk.phase==='settling'||hawk.phase==='on-quarry',hawk.phase==='fist'?this.movement:0,dt);
    if(this.frozen)return;
    const range=Math.round(Math.hypot(ctx.camera.position.x-hawk.position.x,ctx.camera.position.z-hawk.position.z)/.9144);
    const descriptions={
      fist:this.hunt.dog().state==='heel' ? 'Hawk on fist. Q sends the dog hunting along the cattails.' : 'Work the dog along the cattails. Walk in on the point, then slip at the flush.',
      launching:'Away from the fist. The dog is coming to heel.',
      chasing:'Your goshawk has committed. Watch the chase or call it off.',
      settling:'Bound. Your dog is going to lie beside the hawk. Walk in.',
      'on-quarry':`Hawk on quarry · ${range} yd. Your dog waits nearby. Walk in and pick up.`,
      'picking-up':'Picking up onto the fist. Your dog stays beside the quarry.',
      returning:`Returning to the glove · ${range} yd.`,
    };
    const text=this.time<this.messageUntil?this.message:descriptions[hawk.phase];
    if(this.status&&this.status.textContent!==text)this.status.textContent=text;
    if(this.primary){this.primary.textContent=hawk.phase==='on-quarry'?'Pick up · E':'Slip · Space';this.primary.disabled=!(hawk.phase==='fist'||hawk.phase==='on-quarry');}
    if(this.recallButton)this.recallButton.disabled=!['launching','chasing'].includes(hawk.phase);
    if(this.followButton){this.followButton.disabled=hawk.phase==='fist';this.followButton.setAttribute('aria-pressed',String(this.following));}
  }
  dispose(ctx:Ctx):void {this.abort.abort();this.panel?.remove();if(this.hawk){ctx.scene.remove(this.hawk.root);this.hawk.dispose();}if(this.glove){ctx.scene.remove(this.glove.root);this.glove.dispose();}document.body.classList.remove('falconry-hunt');}
}
