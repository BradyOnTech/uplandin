/** Property-anchored surface rhythms shared by plants, their root beds and
 * the contour trail. These affect appearance only, never habitat or height. */
export function chukarPlantGroupAt(x:number,y:number):number {
  return .5+.30*Math.sin(x*.042+Math.sin(y*.018)*1.4)+.20*Math.cos(y*.055-x*.014);
}

export interface ChukarTrackSection { left:number; right:number; center:number; wear:number }
/** Metres from the mapped centerline. The narrow worn tread wanders inside
 * the existing clear walking corridor; its unequal shoulders are not ruts. */
export function chukarTrackSectionAt(x:number,y:number,out:ChukarTrackSection):ChukarTrackSection {
  const sweep=.5+.5*Math.sin(x*.18+y*.13+Math.sin(y*.075)*1.2);
  const erosion=.5+.5*Math.sin(y*.43-x*.17);
  out.center=Math.sin(x*.24-y*.19)*.09;
  out.left=.60+sweep*.15;
  out.right=.59+erosion*.16;
  out.wear=.34+.19*sweep;
  return out;
}
