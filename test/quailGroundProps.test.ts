import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { QUAIL_GROUND_PROPS, quailGroundPropObstacles } from '../src/three/subsystems/quailGroundProps';
import { quailTrackDistanceAt } from '../src/three/subsystems/quailTracks';

describe('authored Quail ground props', () => {
  it('keeps solid prop footprints clear of the walking track', () => {
    const area=getArea('quail-fields');
    for(const p of QUAIL_GROUND_PROPS) {
      expect(quailTrackDistanceAt(area,p.x,p.y),`${p.habit} at ${p.x},${p.y}`).toBeGreaterThan(3);
    }
  });
  it('anchors the same obstacles to either drop and excludes other maps', () => {
    const area=getArea('quail-fields');
    const a=new LandscapeModel(area,'south-gate'),b=new LandscapeModel(area,'west-track');
    const ca=quailGroundPropObstacles(a),cb=quailGroundPropObstacles(b);
    expect(ca).toHaveLength(QUAIL_GROUND_PROPS.length*5);
    ca.forEach((c,i)=>{
      const pa=a.worldToProperty(c.x,c.z,{x:0,y:0}),pb=b.worldToProperty(cb[i].x,cb[i].z,{x:0,y:0});
      expect(pa.x).toBeCloseTo(pb.x,8);expect(pa.y).toBeCloseTo(pb.y,8);expect(c.radius).toBe(cb[i].radius);
    });
    expect(quailGroundPropObstacles(new LandscapeModel(getArea('chukar-ridge')))).toEqual([]);
  });
});
