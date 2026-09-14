import { chukarCompositionAt, chukarWashAt } from './chukarComposition';
import type { AreaConfig } from './areas';
import type { Rect } from './field';
import { PROPERTY_PX_TO_M } from './worldUnits';

/** Authored property coordinates. These brows, shelves and aprons survive a
 * different truck drop, renderer quality or encounter seed. */
export interface ChukarBrow { id:string; x:number; y:number; length:number; depth:number; height:number; angle:number; variant:number }
export const CHUKAR_BROWS: readonly ChukarBrow[] = [
  {id:'trailhead-shoulder',x:588,y:692,length:43,depth:13,height:10,angle:-.18,variant:0},
  {id:'climbing-shoulder',x:614,y:630,length:37,depth:13,height:12,angle:-.32,variant:2},
  {id:'lower-bench-brow',x:742,y:594,length:70,depth:15,height:13,angle:-.24,variant:1},
  {id:'split-shoulder',x:831,y:480,length:46,depth:13,height:14,angle:.28,variant:2},
  {id:'high-bench-brow',x:953,y:336,length:74,depth:18,height:17,angle:-.28,variant:1},
  {id:'overlook-crown',x:1053,y:208,length:82,depth:21,height:19,angle:.10,variant:0},
  {id:'west-sentinel',x:159,y:386,length:48,depth:14,height:13,angle:-.32,variant:2},
  {id:'western-mesa',x:410,y:283,length:106,depth:25,height:23,angle:-.20,variant:1},
  {id:'north-rim',x:700,y:146,length:125,depth:26,height:23,angle:.12,variant:0},
  {id:'east-spur',x:1224,y:429,length:65,depth:19,height:15,angle:-.45,variant:2},
];

const saturate=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(a:number,b:number,x:number)=>{const t=saturate((x-a)/(b-a));return t*t*(3-2*t);};
const orientedBrows=CHUKAR_BROWS.map(b=>({...b,c:Math.cos(b.angle),s:Math.sin(b.angle)}));

export function chukarBrows(area:Pick<AreaConfig,'world'>):ChukarBrow[]{
  return CHUKAR_BROWS.map(b=>({...b,x:area.world.x+b.x*area.world.w/1400,y:area.world.y+b.y*area.world.h/800}));
}

export function chukarBrowBlockers(area:Pick<AreaConfig,'world'>):{x:number;y:number;radius:number}[]{
  return chukarBrows(area).flatMap(b=>[-.4,-.2,0,.2,.4].map(u=>({
    x:b.x+Math.cos(b.angle)*u*b.length,y:b.y+Math.sin(b.angle)*u*b.length,radius:b.depth*.34,
  })));
}

/** Keep shelter cover on the real benches and exclude the solid rock feet
 * from both stocking and the survey. Existing outlying pockets remain. */
export function chukarCoverPatches(world:Rect,existing:Rect[]):Rect[]{
  const shelves=[[593,658,61,24],[660,545,113,26],[744,518,104,28],
    [863,384,116,26],[970,224,120,28],[1060,344,94,25]];
  let patches=[...existing,...shelves.map(([x,y,w,h])=>({x:world.x+x,y:world.y+y,w,h}))];
  for(const b of chukarBrows({world})){
    const rx=Math.abs(Math.cos(b.angle))*b.length*.5+Math.abs(Math.sin(b.angle))*b.depth/PROPERTY_PX_TO_M*.5+2;
    const ry=Math.abs(Math.sin(b.angle))*b.length*.5+Math.abs(Math.cos(b.angle))*b.depth/PROPERTY_PX_TO_M*.5+2;
    const cut={x:b.x-rx,y:b.y-ry,w:rx*2,h:ry*2};
    patches=patches.flatMap(p=>{
      const x=Math.max(p.x,cut.x),y=Math.max(p.y,cut.y),right=Math.min(p.x+p.w,cut.x+cut.w),bottom=Math.min(p.y+p.h,cut.y+cut.h);
      if(x>=right||y>=bottom)return[p];
      return [{x:p.x,y:p.y,w:p.w,h:y-p.y},{x:p.x,y:bottom,w:p.w,h:p.y+p.h-bottom},
        {x:p.x,y,w:x-p.x,h:bottom-y},{x:right,y,w:p.x+p.w-right,h:bottom-y}].filter(r=>r.w>=3&&r.h>=3);
    });
  }
  return patches;
}

/** Broad landforms first. The eastern drainage opens the views from the
 * climbing shoulder; shelves carry both walkable ground and planted cover. */
export function chukarAuthoredHeight(x:number,y:number):number {
  const north=780-y;
  const grade=18+north*.075*(1-smooth(960,1450,x))+(x-580)*.012;
  const shelves=(15*smooth(650,582,y)+22*smooth(492,414,y)+24*smooth(330,255,y))*(1-smooth(1100,1430,x));
  const valley=-43*Math.exp(-Math.pow((x-1120-Math.sin(y*.006)*58)/185,2))*smooth(810,430,y);
  const westernShoulder=25*Math.exp(-Math.pow((x-365)/200,2)-Math.pow((y-330)/260,2));
  const folds=Math.sin(x*.013+y*.003)*3.8+Math.sin(y*.014-x*.006)*3;
  // Low, broad shoulders behind rock brows ground them in the hill. Avoid
  // narrow terrain spikes beneath individual stones.
  let shoulders=0;
  for(const b of orientedBrows){
    const dx=x-b.x,dy=y-b.y+13;if(Math.abs(dx)>b.length*2||Math.abs(dy)>150)continue;
    const along=dx*b.c+dy*b.s,across=-dx*b.s+dy*b.c;
    shoulders+=b.height*.32*Math.exp(-Math.pow(along/(b.length*.72),2)-Math.pow(across/34,2));
  }
  return grade+shelves+valley+westernShoulder+folds+shoulders+chukarDistantRelief(x,y)-chukarWashAt(x,y)*.38;
}

/** Eroded uplifts beyond the eastern parcel. Broad talus fans support a
 * broken cap; radial gullies cut into the face and continue across its rim.
 * A common heightfield keeps the silhouette stable between detail tiers. */
export function chukarDistantRelief(x:number,y:number):number {
  if(x<=1400)return 0;
  let height=0;
  const ramps=(a:number,b:number,r:number)=>saturate((b-r)/(b-a));
  for(const [cx,cy,rx,ry,peak,phase] of [[1830,260,365,310,108,.4],[1930,-620,480,360,150,2.1],[2040,1150,410,350,125,4.7]]){
    const dx=(x-cx+(y-cy)*.16)/rx,dy=(y-cy)/ry;
    const angle=Math.atan2(dy,dx),radius=Math.hypot(dx,dy);
    // Bays and projecting spurs have unequal spacing and depth.
    const scallop=Math.sin(angle*5+phase)*.075+Math.sin(angle*9-phase)*.045;
    const r=radius+scallop+Math.sin(x*.014+y*.009+phase)*.035;
    if(r>1.34)continue;
    const talus=ramps(.65,1.34,r)*.27;
    const wall=ramps(.65,.90,r)*.47;
    const cap=ramps(.12,.70,r)*.26;
    const channels=Math.pow(.5+.5*Math.sin(angle*13+phase+radius*1.7),12);
    const tributaries=Math.pow(.5+.5*Math.sin(angle*23-phase-radius*2.4),18);
    const erosion=(channels*.24+tributaries*.07)*smooth(.18,.68,r)*ramps(.86,1.28,r);
    const crest=(standNoise(x*.024+phase,y*.024)-.5)*.11*ramps(.64,.83,r);
    height+=peak*Math.max(0,talus+wall+cap-erosion+crest);
  }
  // No seam or changed navigation inside the playable parcel.
  return height*smooth(1400,1480,x);
}

/** Deposits and plant stands share the same formation footprint. */
export function chukarGroundZones(x:number,y:number,out:{talus:number;shelter:number}):typeof out {
  let talus=0,shelter=0;
  for(const b of orientedBrows){
    const dx=x-b.x,dy=y-b.y;if(Math.abs(dx)>b.length*2||Math.abs(dy)>150)continue;
    const along=dx*b.c+dy*b.s,across=-dx*b.s+dy*b.c;
    const length=Math.exp(-Math.pow(along/(b.length*.64),4));
    talus=Math.max(talus,length*Math.exp(-Math.pow((across-14)/19,2)));
    shelter=Math.max(shelter,length*Math.exp(-Math.pow((across+23)/27,2)));
  }
  out.talus=talus;out.shelter=shelter;return out;
}

export interface ChukarPlantStand { grass: number; sage: number }
const composition={sage:0,grass:0,open:0,wash:0};
const noiseHash=(x:number,y:number)=>{
  let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967295;
};
function standNoise(x:number,y:number):number {
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,tx=fx*fx*(3-2*fx),ty=fy*fy*(3-2*fy);
  const a=noiseHash(ix,iy),b=noiseHash(ix+1,iy),c=noiseHash(ix,iy+1),d=noiseHash(ix+1,iy+1);
  return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
}

/** Continuous stands drive ground color and plants together. Small-scale
 * irregularity breaks their edges; sheltered rock feet favor sage crowns. */
export function chukarPlantStandAt(x:number,y:number,talus:number,shelter:number,out:ChukarPlantStand):ChukarPlantStand {
  const broad=standNoise(x*.024,y*.024),edge=standNoise(x*.091+47,y*.091-19);
  const grasses=smooth(.23,.72,broad*.76+edge*.24);
  const shrubs=smooth(.39,.72,standNoise(x*.038+21,y*.038+15));
  chukarCompositionAt(x,y,composition);
  const bare=Math.max(composition.open*.86,composition.wash*.94);
  out.grass=saturate((grasses*.72+composition.grass*.75)*(1-talus*.72)+shelter*.14)*(1-bare);
  out.sage=saturate((shrubs*(.34+shelter*.50)+composition.sage*.95)*(1-talus*.8))*(1-bare);
  return out;
}
