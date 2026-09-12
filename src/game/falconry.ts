/** Engine-free goshawk pursuit. Positions and velocities are metres/seconds.
 * The handler offers a visible slip; this simulation owns pursuit, binding,
 * recall and recovery. No outcome dice or renderer collision decides a catch.
 */
export interface FlightPoint { x: number; y: number; z: number }
export interface QuarryTarget extends FlightPoint {
  id: number;
  vx: number; vy: number; vz: number;
}
export type GoshawkPhase = 'fist' | 'launching' | 'chasing' | 'settling' | 'on-quarry' | 'returning';
export type FalconryEvent = { type: 'bound' | 'recovered'; birdId: number; position: FlightPoint }
  | { type: 'missed' | 'recalled' | 'returned' };
export const GOSHAWK = {
  slipRange: 55, catchRadius: .65, recoveryRange: 2.6,
  launchSeconds: .42, maxPursuitSeconds: 12, speed: 23, acceleration: 13,
  turnRate: 2.5, returnSpeed: 15,
} as const;
const distance = (a: FlightPoint, b: FlightPoint) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const wrap = (a: number) => Math.atan2(Math.sin(a),Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo,Math.min(hi,v));

/** Only airborne, visible quarry in the handler's forward view can be offered.
 * The hawk commits to one bird and does not switch to an easier covey mate.
 */
export function selectSlipTarget(origin: FlightPoint, forward: FlightPoint, targets: readonly QuarryTarget[], visible: (q: QuarryTarget)=>boolean = ()=>true): QuarryTarget | undefined {
  let best: QuarryTarget | undefined, score = Infinity;
  for (const q of targets) {
    const d=distance(origin,q);
    const dot=((q.x-origin.x)*forward.x+(q.y-origin.y)*forward.y+(q.z-origin.z)*forward.z)/Math.max(.01,d);
    if (d>GOSHAWK.slipRange || dot<.55 || !visible(q)) continue;
    const cost=d+(1-dot)*30;
    if (cost<score) {score=cost;best=q;}
  }
  return best;
}

/** Closest relative separation during a tick; fast passes cannot tunnel. */
export function sweptSeparation(a: FlightPoint, b: FlightPoint): number {
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
  const t=clamp(-(a.x*dx+a.y*dy+a.z*dz)/(dx*dx+dy*dy+dz*dz || 1),0,1);
  return Math.hypot(a.x+dx*t,a.y+dy*t,a.z+dz*t);
}

export class GoshawkFlight {
  phase: GoshawkPhase = 'fist';
  position: FlightPoint = {x:0,y:0,z:0};
  velocity: FlightPoint = {x:0,y:0,z:0};
  heading = 0;
  targetId: number | null = null;
  flights = 0;
  catches = 0;
  recovered = 0;
  misses = 0;
  recalls = 0;
  elapsed = 0;
  readyIn = 0;
  private phaseSeconds = 0;
  private speed = 0;
  private previousQuarry: FlightPoint | null = null;

  get holdsDog(): boolean { return this.phase !== 'fist'; }
  get canEnd(): boolean { return this.phase === 'fist'; }

  slip(origin: FlightPoint, target: QuarryTarget): boolean {
    if (this.phase !== 'fist' || this.readyIn>0 || distance(origin,target)>GOSHAWK.slipRange) return false;
    this.position={...origin}; this.velocity={x:0,y:0,z:0};
    this.targetId=target.id; this.previousQuarry={...target};
    this.heading=Math.atan2(target.z-origin.z,target.x-origin.x);
    this.phase='launching'; this.phaseSeconds=0; this.elapsed=0; this.speed=5;
    this.flights++;
    return true;
  }

  recall(): FalconryEvent[] {
    if (this.phase !== 'launching' && this.phase !== 'chasing') return [];
    this.phase='returning'; this.phaseSeconds=0; this.targetId=null;
    this.recalls++;
    return [{type:'recalled'}];
  }

  recover(handler: FlightPoint, dogAtHeel: boolean): FalconryEvent[] {
    if (this.phase!=='on-quarry' || this.targetId===null || !dogAtHeel ||
      Math.hypot(handler.x-this.position.x,handler.z-this.position.z)>GOSHAWK.recoveryRange) return [];
    const event: FalconryEvent={type:'recovered',birdId:this.targetId,position:{...this.position}};
    this.recovered++; this.targetId=null; this.phase='returning'; this.phaseSeconds=0;
    return [event];
  }

  step(dt: number, fist: FlightPoint, targets: readonly QuarryTarget[], ground: (x:number,z:number)=>number): FalconryEvent[] {
    if (!(dt>0)) return [];
    this.readyIn=Math.max(0,this.readyIn-dt);
    this.phaseSeconds+=dt;
    if (this.phase==='fist') {this.position={...fist}; return [];}
    if (this.phase==='on-quarry') return [];
    if (this.phase==='settling') {
      const floor=ground(this.position.x,this.position.z)+.22;
      this.position.y=Math.max(floor,this.position.y-3*dt);
      if (this.position.y<=floor+.01) {this.phase='on-quarry';this.velocity={x:0,y:0,z:0};}
      return [];
    }
    const returning=this.phase==='returning';
    const quarry=returning ? undefined : targets.find(q=>q.id===this.targetId);
    this.elapsed+=dt;
    if (!returning && (!quarry || this.elapsed>GOSHAWK.maxPursuitSeconds)) {
      this.phase='returning';this.targetId=null;this.misses++;this.phaseSeconds=0;
      return [{type:'missed'}];
    }
    const destination=quarry ?? fist;
    // At the glove, flare and reach for the hand rather than continuing a
    // banked turn. The hand moves as the handler watches the approaching hawk;
    // a minimum-speed pursuit here can orbit that moving target indefinitely.
    if (returning && distance(this.position,fist)<2.4) {
      const blend=1-Math.exp(-dt*9),before={...this.position};
      this.position={x:before.x+(fist.x-before.x)*blend,y:before.y+(fist.y-before.y)*blend,z:before.z+(fist.z-before.z)*blend};
      this.velocity={x:(this.position.x-before.x)/dt,y:(this.position.y-before.y)/dt,z:(this.position.z-before.z)/dt};
      // The handler reaches to meet the feet during the final flare.
      if (distance(this.position,fist)<.65) {
        this.phase='fist';this.position={...fist};this.velocity={x:0,y:0,z:0};this.readyIn=.8;
        return [{type:'returned'}];
      }
      return [];
    }
    const before={...this.position};
    const lead=quarry ? clamp(distance(before,quarry)/55,.06,.38) : 0;
    const tx=destination.x+(quarry?.vx ?? 0)*lead;
    const tz=destination.z+(quarry?.vz ?? 0)*lead;
    const desired=Math.atan2(tz-before.z,tx-before.x);
    const turn=clamp(wrap(desired-this.heading),-GOSHAWK.turnRate*dt,GOSHAWK.turnRate*dt);
    this.heading+=turn;
    const turnCost=1-.23*Math.min(1,Math.abs(turn)/Math.max(.001,GOSHAWK.turnRate*dt));
    let maxSpeed=(returning ? GOSHAWK.returnSpeed : GOSHAWK.speed)*turnCost;
    if (returning) maxSpeed=Math.min(maxSpeed,Math.max(1,distance(before,fist)*2))*Math.max(.15,Math.cos(wrap(desired-this.heading)));
    this.speed+=clamp(maxSpeed-this.speed,-18*dt,GOSHAWK.acceleration*dt);
    const nx=before.x+Math.cos(this.heading)*this.speed*dt;
    const nz=before.z+Math.sin(this.heading)*this.speed*dt;
    const desiredY=Math.max(ground(nx,nz)+.25,destination.y+(quarry?.vy ?? 0)*lead);
    const ny=before.y+clamp(desiredY-before.y,-6*dt,7*dt);
    this.position={x:nx,y:Math.max(ground(nx,nz)+.2,ny),z:nz};
    this.velocity={x:(nx-before.x)/dt,y:(this.position.y-before.y)/dt,z:(nz-before.z)/dt};
    if (this.phase==='launching' && this.phaseSeconds>=GOSHAWK.launchSeconds) this.phase='chasing';
    if (quarry && this.phase==='chasing') {
      const prev=this.previousQuarry ?? quarry;
      const a={x:before.x-prev.x,y:before.y-prev.y,z:before.z-prev.z};
      const b={x:nx-quarry.x,y:this.position.y-quarry.y,z:nz-quarry.z};
      if (sweptSeparation(a,b)<=GOSHAWK.catchRadius) {
        this.position={x:quarry.x,y:quarry.y,z:quarry.z};this.phase='settling';this.catches++;
        this.velocity={x:0,y:-3,z:0};
        return [{type:'bound',birdId:quarry.id,position:{...this.position}}];
      }
      this.previousQuarry={...quarry};
    }
    return [];
  }
}

/** Threatened quarry jinks sideways. Cover remains its escape destination.
 * This changes flight geometry, so both the hawk and the player see the miss.
 */
export function evadeGoshawk(body: FlightPoint & {vxW:number;vzW:number;airMs:number}, id:number, hawk: FlightPoint): void {
  const d=distance(body,hawk);
  if (d>11 || d<.01) return;
  const sign=id%2 ? 1 : -1;
  const angle=sign*.55*(1-d/11)*Math.sin(body.airMs/1000*5.5);
  const vx=body.vxW,vz=body.vzW;
  body.vxW=vx*Math.cos(angle)-vz*Math.sin(angle);
  body.vzW=vx*Math.sin(angle)+vz*Math.cos(angle);
}
