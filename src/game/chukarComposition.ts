/** Art-directed stands and drainage along the south climbing route.
 * Coordinates are property yards, shared by terrain paint and plant placement.
 * These describe scenery, not bird locations or new movement obstacles. */
export interface ChukarStand {
  id:string; x:number; y:number; rx:number; ry:number; angle:number;
  sage:number; grass:number; open:number;
}
export const CHUKAR_ROUTE_STANDS:readonly ChukarStand[]=[
  {id:'arrival-grass',x:615,y:735,rx:45,ry:23,angle:-.3,sage:.12,grass:1,open:0},
  {id:'first-turn-sage',x:649,y:684,rx:32,ry:17,angle:-.62,sage:.85,grass:.42,open:0},
  {id:'climbing-grass',x:686,y:633,rx:26,ry:16,angle:.5,sage:.25,grass:.95,open:0},
  {id:'sage-bench-west',x:658,y:556,rx:34,ry:19,angle:-.18,sage:1,grass:.35,open:0},
  {id:'sage-bench-east',x:709,y:569,rx:29,ry:15,angle:-.20,sage:.9,grass:.55,open:0},
  {id:'lower-brow-opening',x:762,y:617,rx:40,ry:23,angle:-.24,sage:0,grass:.1,open:1},
  {id:'contour-grass',x:780,y:538,rx:32,ry:15,angle:-.43,sage:.28,grass:1,open:0},
  {id:'split-sage',x:848,y:444,rx:29,ry:17,angle:.22,sage:1,grass:.45,open:0},
  {id:'split-shoulder-grass',x:883,y:402,rx:38,ry:20,angle:-.40,sage:.65,grass:.85,open:0},
  {id:'upper-bench-pocket',x:959,y:385,rx:40,ry:17,angle:-.14,sage:1,grass:.4,open:0},
  {id:'high-brow-opening',x:975,y:351,rx:40,ry:14,angle:-.28,sage:0,grass:.1,open:1},
  {id:'last-climb-grass',x:1030,y:315,rx:29,ry:16,angle:-1.05,sage:.2,grass:.9,open:0},
  {id:'overlook-shelter',x:1026,y:235,rx:33,ry:15,angle:.16,sage:.9,grass:.4,open:0},
  {id:'overlook-apron',x:1024,y:267,rx:38,ry:18,angle:.16,sage:0,grass:.15,open:.9},
];
const stands=CHUKAR_ROUTE_STANDS.map(s=>({...s,c:Math.cos(s.angle),s:Math.sin(s.angle)}));
export const CHUKAR_WASHES:readonly {points:readonly [number,number][];width:number}[]=[
  {points:[[621,646],[638,662],[650,689],[681,714]],width:3.1},
  {points:[[755,607],[774,625],[784,651],[817,684]],width:4.2},
  {points:[[847,494],[861,517],[887,542],[915,563]],width:3.3},
  {points:[[968,351],[990,380],[1008,407],[1052,438]],width:4.2},
  {points:[[1060,225],[1071,251],[1104,281],[1127,308]],width:3.6},
];
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
export interface ChukarComposition {sage:number;grass:number;open:number;wash:number}
export function chukarCompositionAt(x:number,y:number,out:ChukarComposition):ChukarComposition {
  out.sage=out.grass=out.open=out.wash=0;
  // The authored extents have broken, soft edges, without stamped ovals.
  const edge=Math.sin(x*.21+Math.sin(y*.13)*1.2)*.10+Math.sin(y*.31-x*.12)*.055;
  for(const p of stands){
    const dx=x-p.x,dy=y-p.y;if(Math.abs(dx)>p.rx+p.ry||Math.abs(dy)>p.rx+p.ry)continue;
    const u=(dx*p.c+dy*p.s)/p.rx,v=(-dx*p.s+dy*p.c)/p.ry;
    const influence=smooth((1.16-Math.hypot(u,v)-edge)/.48);
    out.sage=Math.max(out.sage,p.sage*influence);out.grass=Math.max(out.grass,p.grass*influence);out.open=Math.max(out.open,p.open*influence);
  }
  out.wash=chukarWashAt(x,y);
  return out;
}

const washSegments=CHUKAR_WASHES.flatMap(wash=>wash.points.slice(1).map((b,index)=>{
  const a=wash.points[index],dx=b[0]-a[0],dy=b[1]-a[1],margin=wash.width*2;
  return {a,dx,dy,length2:dx*dx+dy*dy,index,width:wash.width,count:wash.points.length-1,
    minX:Math.min(a[0],b[0])-margin,maxX:Math.max(a[0],b[0])+margin,minY:Math.min(a[1],b[1])-margin,maxY:Math.max(a[1],b[1])+margin};
}));
/** A shallow dry runnel, shared by height, sediment paint and vegetation. */
export function chukarWashAt(x:number,y:number):number {
  if(x<600||x>1150||y<200||y>740)return 0;
  let amount=0;
  for(const w of washSegments){
    if(x<w.minX||x>w.maxX||y<w.minY||y>w.maxY)continue;
    const t=clamp(((x-w.a[0])*w.dx+(y-w.a[1])*w.dy)/w.length2);
    const distance=Math.hypot(x-w.a[0]-w.dx*t,y-w.a[1]-w.dy*t),width=w.width*(.8+(w.index+t)*.30);
    const taper=smooth((w.index+t)*2)*smooth((w.count-(w.index+t))*1.4);
    amount=Math.max(amount,smooth(1-distance/width)*taper);
  }
  return amount;
}
