/** World-space flight tuning for authored 3D properties (metres/seconds).
 * A covey shares an escape bearing; individual birds take continuous bearings,
 * not three screen lanes. Terrain look-ahead shapes clearance independently
 * of the hunter's screen position. BirdsSystem supplies species and doctrine
 * values when it creates this profile; the defaults remain the original
 * bobwhite tuning for compatibility with tooling and older callers.
 */
export interface QuailFlight {
  bearing: number;
  bend: number;
  speed: number;
  clearance: number;
  glideAt: number;
  target?: { x: number; z: number };
  /** Optional held departure and eased cover turn, in seconds. Profiles
   * without it retain the established steering law for other species. */
  coverTurn?: { startSeconds: number; durationSeconds: number };
  /** Close-flush intensity, 0..1: a covey sat on underfoot pops to head
   * height before it lines out (game/closeFlush.ts). */
  burst?: number;
}

/** Select another patch ahead of the flush, leaving room for a short flight.
 * Targets sit inside the patch rather than on its rectangular boundary.
 */
export function selectQuailEscapeCover(
  x: number, z: number, escapeX: number, escapeZ: number,
  patches: readonly {cx:number;cz:number;hx:number;hz:number}[], rng:()=>number,
): {x:number;z:number} | undefined {
  let best: {x:number;z:number;hx:number;hz:number} | undefined;
  let bestScore = Infinity;
  const directionLength = Math.hypot(escapeX, escapeZ) || 1;
  for (const patch of patches) {
    if (Math.abs(x-patch.cx)<=patch.hx && Math.abs(z-patch.cz)<=patch.hz) continue;
    // Aim down the escape bearing, then project into the patch's usable
    // interior. A wide patch can offer forward cover even when its center
    // is well off to the side of the covey.
    const insetX=Math.min(6,patch.hx*.5), insetZ=Math.min(6,patch.hz*.5);
    const tx=Math.max(patch.cx-patch.hx+insetX,Math.min(patch.cx+patch.hx-insetX,x+escapeX/directionLength*75));
    const tz=Math.max(patch.cz-patch.hz+insetZ,Math.min(patch.cz+patch.hz-insetZ,z+escapeZ/directionLength*75));
    const dx=tx-x, dz=tz-z, distance=Math.hypot(dx,dz);
    if (distance<35 || distance>120) continue;
    const alignment=(dx*escapeX+dz*escapeZ)/(distance*directionLength);
    if (alignment<.65) continue;
    const score=Math.abs(distance-75)+(1-alignment)*70;
    if (score<bestScore) { bestScore=score; best={x:tx,z:tz,hx:insetX,hz:insetZ}; }
  }
  if (!best) return undefined;
  return {x:best.x+(rng()-.5)*best.hx,z:best.z+(rng()-.5)*best.hz};
}
export function createQuailFlight(escapeX:number,escapeZ:number,rng:()=>number,young=false):QuailFlight {
  return {bearing:Math.atan2(escapeZ,escapeX)+(rng()-.5)*.82,bend:(rng()-.5)*.32,
    speed:(15.5+rng()*3)*(young?.9:1),clearance:2.7+rng()*1.8,glideAt:2.1+rng()*.65};
}
export function stepQuailFlight(flight:QuailFlight,body:{x:number;y:number;z:number;airMs:number;vxW:number;vyW:number;vzW:number;gliding:boolean},dt:number,heightAt:(x:number,z:number)=>number):void {
  const seconds=body.airMs/1000;
  const bend=Math.min(1,Math.max(0,(seconds-.5)/2));
  let heading=flight.bearing+flight.bend*bend*bend*(3-2*bend);
  let speed=flight.speed*(.62+.38*Math.min(1,seconds/1.1));
  let distance = Infinity;
  if (flight.target) {
    const dx=flight.target.x-body.x, dz=flight.target.z-body.z;
    distance=Math.hypot(dx,dz);
    const desiredHeading=Math.atan2(dz,dx);
    // Retain the individual burst, then converge toward cover without a snap.
    const turn=flight.coverTurn;
    const turnProgress=Math.min(1,Math.max(0,(seconds-(turn?.startSeconds??.25))/(turn?.durationSeconds??1.25)));
    const blend=turn ? turnProgress*turnProgress*(3-2*turnProgress) : turnProgress;
    heading+=Math.atan2(Math.sin(desiredHeading-heading),Math.cos(desiredHeading-heading))*blend;
    speed=Math.min(speed,Math.max(3,distance*1.8),distance/Math.max(dt,.0001));
  }
  const burst=Math.max(0,Math.min(1,flight.burst??0)),pop=burst*Math.max(0,1-seconds/.7);
  speed*=1-.35*pop;
  body.vxW=Math.cos(heading)*speed;body.vzW=Math.sin(heading)*speed;
  body.gliding=seconds>flight.glideAt;
  const climb=1-Math.exp(-seconds*(2.2+3*burst));
  const settle=Math.max(0,1-(seconds-flight.glideAt)/4.5);
  const clearance=.2+flight.clearance*climb*(flight.target ? Math.min(1,distance/22) : Math.min(1,settle))+pop*1.6;
  const ground=heightAt(body.x+body.vxW*.3,body.z+body.vzW*.3);
  const desired=Math.max(-3.5,Math.min(4.5+3*pop,(ground+clearance-body.y)*3));
  body.vyW+=(desired-body.vyW)*(1-Math.exp(-dt*8));
}
