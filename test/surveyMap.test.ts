import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { buildSurveyRaster, constrainSurveyView, placeSurveyLabels, surveyContours, surveyPoint,
  surveyPosition, surveyTransform, zoomSurveyView, type SurveyRaster } from '../src/three/maps/surveyMap';

const world={x:50,y:80,w:1400,h:800};

describe('property atlas navigation',()=>{
  it('round trips real property positions through every map zoom and viewport',()=>{
    for(const [w,h] of [[1000,600],[350,430],[720,190]])for(const zoom of [1,2.4,5]){
      const t=surveyTransform(world,w,h,{zoom,center:{x:500,y:380}});
      for(const p of [{x:50,y:80},{x:700,y:450},{x:1450,y:880}]){
        const back=surveyPosition(t,surveyPoint(t,p));
        expect(back.x).toBeCloseTo(p.x,8);expect(back.y).toBeCloseTo(p.y,8);
      }
    }
  });
  it('keeps the ground beneath the zoom cursor fixed away from the map boundary',()=>{
    const view={zoom:2,center:{x:750,y:480}},cursor={x:470,y:230};
    const ground=surveyPosition(surveyTransform(world,1000,600,view),cursor);
    const zoomed=zoomSurveyView(world,1000,600,view,1.6,cursor);
    const screen=surveyPoint(surveyTransform(world,1000,600,zoomed),ground);
    expect(screen.x).toBeCloseTo(cursor.x,8);expect(screen.y).toBeCloseTo(cursor.y,8);
  });
  it('bounds extreme dragging and zooming so the property cannot be lost offscreen',()=>{
    for(const zoom of [.001,1,2,999]){
      const view=constrainSurveyView(world,350,430,{zoom,center:{x:-1e8,y:1e8}});
      expect(view.zoom).toBeGreaterThanOrEqual(1);expect(view.zoom).toBeLessThanOrEqual(5);
      const t=surveyTransform(world,350,430,view),a=surveyPoint(t,world),b=surveyPoint(t,{x:1450,y:880});
      expect(a.x).toBeLessThan(350);expect(a.y).toBeLessThan(430);
      expect(b.x).toBeGreaterThan(0);expect(b.y).toBeGreaterThan(0);
    }
  });
  it('places crowded entry labels without collisions or clipped text',()=>{
    const placed=placeSurveyLabels(['You · Dog · Truck','West Pothole','North Fence'].map((text,i)=>({
      id:String(i),text,point:{x:35+i*8,y:120+i*5},width:text.length*6+12,height:22,
    })),{x:10,y:10,w:330,h:240});
    expect(placed).toHaveLength(3);
    for(let i=0;i<placed.length;i++){
      const a=placed[i].box;expect(a.x).toBeGreaterThanOrEqual(10);expect(a.x+a.w).toBeLessThanOrEqual(340);
      for(let j=0;j<i;j++){
        const b=placed[j].box;
        expect(a.x>=b.x+b.w||a.x+a.w<=b.x||a.y>=b.y+b.h||a.y+a.h<=b.y).toBe(true);
      }
    }
  });
});

describe('atlas terrain truth',()=>{
  it.each(['pheasant-coverts','quail-fields','chukar-ridge'])('samples the actual %s landscape without editing geography',id=>{
    const area=getArea(id),before=JSON.stringify(area),raster=buildSurveyRaster(area,48),landscape=new LandscapeModel(area);
    expect(JSON.stringify(area)).toBe(before);
    for(const [x,y]of [[0,0],[raster.cols,raster.rows],[24,8]]){
      const actual=landscape.heightAtProperty(area.world.x+x/raster.cols*area.world.w,area.world.y+y/raster.rows*area.world.h);
      expect(raster.heights[y*(raster.cols+1)+x]).toBeCloseTo(actual,4);
    }
    expect(raster.pixels).toHaveLength(raster.cols*raster.rows*4);
    expect(raster.maxHeight).toBeGreaterThan(raster.minHeight);
    expect(new Set(raster.pixels).size).toBeGreaterThan(40);
  });
  it('interpolates contours at their measured height, not at cell boundaries',()=>{
    const raster:SurveyRaster={cols:2,rows:1,heights:new Float32Array([0,10,20,0,10,20]),
      pixels:new Uint8ClampedArray(),minHeight:0,maxHeight:20,contourStep:5};
    const segments=surveyContours(raster,7.5);
    expect(segments).toHaveLength(1);
    expect(segments[0][0]).toBeCloseTo(.375);expect(segments[0][2]).toBeCloseTo(.375);
    expect(new Set([segments[0][1],segments[0][3]])).toEqual(new Set([0,1]));
    expect(surveyContours(raster,25)).toEqual([]);
  });
});
