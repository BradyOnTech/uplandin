import type { AreaConfig } from '../../game/areas';
import type { Rect } from '../../game/field';
import { LandscapeModel, PROPERTY_PX_TO_M, type GroundSample } from '../../game/landscape';
import { pheasantHomesteadYard, pheasantWestFence } from '../../game/pheasantHabitat';
import type { Vec2 } from '../../game/types';
import { pheasantCoverFringeAt, pheasantFields, pheasantPonds, pheasantShelterbelts, samplePheasantHarvest } from '../subsystems/pheasantLandscape';

export interface SurveyView { center: Vec2; zoom: number }
export interface SurveyTransform { scale: number; x: number; y: number }
export const SURVEY_MAX_ZOOM = 5;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function surveyTransform(world: Rect, width: number, height: number, view: SurveyView): SurveyTransform {
  const scale = Math.max(.001, Math.min((width - 56) / world.w, (height - 56) / world.h)) * view.zoom;
  return { scale, x: width / 2 - view.center.x * scale, y: height / 2 - view.center.y * scale };
}
export function surveyPoint(t: SurveyTransform, p: Vec2): Vec2 { return { x: t.x + p.x * t.scale, y: t.y + p.y * t.scale }; }
export function surveyPosition(t: SurveyTransform, p: Vec2): Vec2 { return { x: (p.x - t.x) / t.scale, y: (p.y - t.y) / t.scale }; }

/** Keep the property in reach, even when the viewport is taller than the map. */
export function constrainSurveyView(world: Rect, width: number, height: number, view: SurveyView): SurveyView {
  const zoom = clamp(view.zoom, 1, SURVEY_MAX_ZOOM);
  const t = surveyTransform(world, width, height, { ...view, zoom });
  const hx = Math.min(world.w / 2, (width - 56) / t.scale / 2);
  const hy = Math.min(world.h / 2, (height - 56) / t.scale / 2);
  return { zoom, center: { x: clamp(view.center.x, world.x + hx, world.x + world.w - hx),
    y: clamp(view.center.y, world.y + hy, world.y + world.h - hy) } };
}

/** Zoom about the cursor/finger rather than jumping back to the map centre. */
export function zoomSurveyView(world: Rect, width: number, height: number, view: SurveyView, factor: number, at: Vec2): SurveyView {
  const before = surveyPosition(surveyTransform(world, width, height, view), at);
  const zoom = clamp(view.zoom * factor, 1, SURVEY_MAX_ZOOM);
  const after = surveyPosition(surveyTransform(world, width, height, { ...view, zoom }), at);
  return constrainSurveyView(world, width, height, { zoom, center: {
    x: view.center.x + before.x - after.x, y: view.center.y + before.y - after.y,
  } });
}

export interface SurveyLabel { id: string; text: string; point: Vec2; width: number; height: number }
export interface PlacedSurveyLabel extends SurveyLabel { box: Rect }
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/** Priority is input order. Never squeeze labels together to fit every name. */
export function placeSurveyLabels(labels: SurveyLabel[], bounds: Rect): PlacedSurveyLabel[] {
  const placed: PlacedSurveyLabel[] = [];
  for (const label of labels) {
    const { point: p, width: w, height: h } = label;
    const offsets = [[12,-h/2],[-w-12,-h/2],[-w/2,12],[-w/2,-h-12],
      [18,18],[-w-18,18],[18,-h-18],[-w-18,-h-18],[-w/2,32],[-w/2,-h-32]];
    for (const [dx,dy] of offsets) {
      const box = { x:p.x+dx, y:p.y+dy, w, h };
      if (box.x < bounds.x || box.y < bounds.y || box.x+w > bounds.x+bounds.w || box.y+h > bounds.y+bounds.h) continue;
      if (placed.some(other => intersects({ x:box.x-4,y:box.y-3,w:w+8,h:h+6 },other.box))) continue;
      placed.push({ ...label, box }); break;
    }
  }
  return placed;
}

export interface SurveyRaster {
  cols: number; rows: number; heights: Float32Array; pixels: Uint8ClampedArray;
  minHeight: number; maxHeight: number; contourStep: number;
}
type RGB = [number,number,number];
const blend = (a: RGB, b: RGB, amount: number): RGB => {
  const t=clamp(amount,0,1);return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
};
const inRect = (x:number,y:number,r:Rect) => x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;
const grain = (x:number,y:number) => { const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n); };

/** Only authored geography enters this cache. It has no access to hunt/bird state. */
export function buildSurveyRaster(area: AreaConfig, cols = 224): SurveyRaster {
  const rows=Math.max(16,Math.round(cols*area.world.h/area.world.w)), stride=cols+1;
  const landscape=new LandscapeModel(area), heights=new Float32Array(stride*(rows+1));
  let minHeight=Infinity,maxHeight=-Infinity;
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
    const value=landscape.heightAtProperty(area.world.x+x/cols*area.world.w,area.world.y+y/rows*area.world.h);
    heights[y*stride+x]=value;minHeight=Math.min(minHeight,value);maxHeight=Math.max(maxHeight,value);
  }
  const pixels=new Uint8ClampedArray(cols*rows*4), span=Math.max(1,maxHeight-minHeight);
  const surface:GroundSample={height:0,slope:0,gradeX:0,gradeZ:0,rockiness:0,vegetation:0,moisture:0};
  const pheasant=area.id==='pheasant-coverts', fields=pheasant?pheasantFields(area):[];
  const harvest={amount:0,row:0,angle:0},yard=pheasant?pheasantHomesteadYard(area.landmarks):undefined;
  const woods=['woods','alpine'].includes(area.terrain.kind), desert=['desert','canyon','rimrock'].includes(area.terrain.kind);
  const low:RGB=woods?[168,181,150]:desert?[203,184,145]:[198,196,151];
  const high:RGB=woods?[219,217,183]:[232,220,183];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const px=area.world.x+(x+.5)/cols*area.world.w,py=area.world.y+(y+.5)/rows*area.world.h;
    landscape.surfaceAtProperty(px,py,surface);
    let color=blend(low,high,(surface.height-minHeight)/span);
    color=blend(color,[141,161,137],surface.moisture*(woods?.35:.6));
    color=blend(color,[157,150,132],surface.rockiness*.48);
    const cover=pheasant?pheasantCoverFringeAt(area,px,py):Number(area.patches.some(p=>inRect(px,py,p)));
    color=blend(color,woods?[91,125,99]:[136,151,98],cover*.72);
    if(pheasant){
      samplePheasantHarvest(area,px,py,fields,harvest);
      color=blend(color,[224,194,132],harvest.amount*.72);
      if(yard&&inRect(px,py,yard))color=blend(color,[235,220,184],.85);
    }
    const shade=clamp((surface.gradeX+surface.gradeZ)*-32,-15,15)+(grain(x,y)-.5)*2;
    const i=(y*cols+x)*4;
    pixels[i]=color[0]+shade;pixels[i+1]=color[1]+shade;pixels[i+2]=color[2]+shade;pixels[i+3]=255;
  }
  const contourStep=span>60?10:span>28?5:2;
  return {cols,rows,heights,pixels,minHeight,maxHeight,contourStep};
}

export type ContourSegment = [number,number,number,number];
/** Marching squares in normalized map coordinates. Saddles follow the centre height. */
export function surveyContours(raster:SurveyRaster,level:number):ContourSegment[]{
  const {cols,rows,heights}=raster,stride=cols+1,result:ContourSegment[]=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const v=[heights[y*stride+x],heights[y*stride+x+1],heights[(y+1)*stride+x+1],heights[(y+1)*stride+x]];
    const corners=[[x/cols,y/rows],[(x+1)/cols,y/rows],[(x+1)/cols,(y+1)/rows],[x/cols,(y+1)/rows]];
    const edges:Vec2[]=[];
    for(let e=0;e<4;e++){
      const n=(e+1)%4;if((v[e]>=level)===(v[n]>=level))continue;
      const t=(level-v[e])/(v[n]-v[e]);edges.push({x:corners[e][0]+(corners[n][0]-corners[e][0])*t,y:corners[e][1]+(corners[n][1]-corners[e][1])*t});
    }
    if(edges.length===4&&((v[0]+v[1]+v[2]+v[3])/4>=level)!==(v[0]>=level))edges.push(edges.shift()!);
    for(let i=0;i+1<edges.length;i+=2)result.push([edges[i].x,edges[i].y,edges[i+1].x,edges[i+1].y]);
  }return result;
}

/** A single bounded backing canvas. Resizing, panning and zooming never resample terrain. */
export function createSurveyAtlas(area:AreaConfig):{canvas:HTMLCanvasElement;contourStep:number}{
  const raster=buildSurveyRaster(area),canvas=document.createElement('canvas');
  canvas.width=1536;canvas.height=Math.round(canvas.width*area.world.h/area.world.w);
  const g=canvas.getContext('2d')!,small=document.createElement('canvas');small.width=raster.cols;small.height=raster.rows;
  const sg=small.getContext('2d')!,data=sg.createImageData(raster.cols,raster.rows);data.data.set(raster.pixels);sg.putImageData(data,0,0);
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(small,0,0,canvas.width,canvas.height);
  const sx=canvas.width/area.world.w,sy=canvas.height/area.world.h;
  const point=(x:number,y:number):[number,number]=>[(x-area.world.x)*sx,(y-area.world.y)*sy];
  // Actual relief, drawn faintly enough to leave the habitat and routes dominant.
  for(let level=Math.ceil(raster.minHeight/raster.contourStep)*raster.contourStep;level<raster.maxHeight;level+=raster.contourStep){
    g.strokeStyle=level%(raster.contourStep*5)===0?'#746b4c55':'#847b5940';g.lineWidth=level%(raster.contourStep*5)===0?1.25:.8;
    g.beginPath();for(const [x1,y1,x2,y2]of surveyContours(raster,level)){g.moveTo(x1*canvas.width,y1*canvas.height);g.lineTo(x2*canvas.width,y2*canvas.height);}g.stroke();
  }
  const pheasant=area.id==='pheasant-coverts',fields=pheasant?pheasantFields(area):[],sample={amount:0,row:0,angle:0};
  // Small cartographic marks follow the real habitat union; rectangle seams disappear.
  for(let y=5;y<area.world.h;y+=7)for(let x=5;x<area.world.w;x+=7){
    const px=area.world.x+x+(grain(x,y)-.5)*4,py=area.world.y+y+(grain(y,x)-.5)*4;
    const [cx,cy]=point(px,py);
    const cover=area.patches.some(p=>inRect(px,py,p));
    if(cover){
      g.strokeStyle='#61724265';g.lineWidth=.8;g.beginPath();
      g.moveTo(cx-2,cy+2);g.lineTo(cx-3,cy-2);g.moveTo(cx,cy+2);g.lineTo(cx,cy-3);g.moveTo(cx+2,cy+2);g.lineTo(cx+3,cy-1);g.stroke();
    }else if(pheasant&&samplePheasantHarvest(area,px,py,fields,sample).amount>.7){
      g.strokeStyle='#a18a4c32';g.lineWidth=.8;g.beginPath();g.moveTo(cx-2.5,cy+1);g.lineTo(cx+2.5,cy+1);g.stroke();
    }
  }
  if(pheasant){
    const landscape=new LandscapeModel(area);
    for(const pond of pheasantPonds(landscape)){
      const [x,y]=point(pond.x,pond.y),rx=pond.rx/PROPERTY_PX_TO_M*sx,ry=pond.ry/PROPERTY_PX_TO_M*sy;
      g.fillStyle='#92a077';g.beginPath();g.ellipse(x,y,rx*1.16,ry*1.16,0,0,Math.PI*2);g.fill();
      g.fillStyle='#8db0b2';g.strokeStyle='#5d8586';g.lineWidth=1.7;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();g.stroke();
      g.strokeStyle='#d5e0ce99';g.lineWidth=1;g.beginPath();g.ellipse(x,y,rx*.9,ry*.88,0,0,Math.PI*2);g.stroke();
      g.save();g.beginPath();g.ellipse(x,y,rx*.85,ry*.82,0,0,Math.PI*2);g.clip();
      for(let yy=y-ry;yy<y+ry;yy+=8){g.strokeStyle='#d5e0ce50';g.beginPath();g.moveTo(x-rx,yy);g.lineTo(x+rx,yy);g.stroke();}g.restore();
    }
    for(const belt of pheasantShelterbelts(area))for(let i=0;i<belt.count;i++){
      const along=(i/(belt.count-1)-.5)*belt.length;
      const [x,y]=point(belt.x+Math.cos(belt.angle)*along,belt.y+Math.sin(belt.angle)*along);
      const r=3+grain(i,belt.x)*2;g.fillStyle=i%3===0?'#738c65':'#7f956d';g.strokeStyle='#516e4d88';g.lineWidth=.75;
      g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();g.stroke();
    }
    const fence=pheasantWestFence(area.landmarks);g.strokeStyle='#777052';g.lineWidth=1.4;g.beginPath();
    fence.forEach((p,i)=>{const [x,y]=point(p.x,p.y);if(i)g.lineTo(x,y);else g.moveTo(x,y);});g.stroke();
    if(fence.length===2){const a=point(fence[0].x,fence[0].y),b=point(fence[1].x,fence[1].y);for(let t=0;t<=1;t+=.12){const x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;g.beginPath();g.moveTo(x,y-3);g.lineTo(x,y+3);g.stroke();}}
  }
  return {canvas,contourStep:raster.contourStep};
}
