import type { Vec2 } from './types';

export interface DogObstacle { x: number; y: number; radius: number }

/** Local detours for isolated field props. Targets and behavior remain with Dog.
 * Segment checks prevent fast updates tunneling through small solid objects.
 */
export class DogObstacleMotion {
  private side = 1;
  private detouring = false;
  move(pos: Vec2, heading: number, distance: number, obstacles: readonly DogObstacle[], bodyRadius = .3): number {
    if (!obstacles.length || distance <= 0) {
      pos.x += Math.cos(heading)*distance; pos.y += Math.sin(heading)*distance; return heading;
    }
    const steps=Math.max(1,Math.ceil(distance/.18)),step=distance/steps;
    let travel=heading;
    const clear=(angle:number,length:number) => {
      const dx=Math.cos(angle)*length,dy=Math.sin(angle)*length;
      for(const o of obstacles) {
        const ox=pos.x-o.x,oy=pos.y-o.y,r=o.radius+bodyRadius;
        const before=ox*ox+oy*oy;
        if(before<r*r-1e-8) {
          // A source edit may place an obstacle around an existing dog.
          // Only permit an outward escape, never push/teleport the dog.
          if(ox*dx+oy*dy<0 || (ox+dx)**2+(oy+dy)**2<=before) return false;
          continue;
        }
        const t=Math.max(0,Math.min(1,-(ox*dx+oy*dy)/(length*length)));
        if((ox+dx*t)**2+(oy+dy*t)**2<r*r) return false;
      }
      return true;
    };
    for(let n=0;n<steps;n++) {
      const horizon=Math.max(step,.75);
      let selected:number|undefined;
      if(clear(heading,horizon)){selected=heading;this.detouring=false;}
      else {
        // Keep a chosen side while going around a prop, including head-on
        // approaches where two equally short detours would otherwise jitter.
        for(const reach of [horizon,step]) {
          for(let turn=1;turn<=12 && selected===undefined;turn++) {
            const angle=turn*Math.PI/12;
            for(const sign of [this.side,-this.side]) {
              const candidate=heading+sign*angle;
              if(clear(candidate,reach)) {selected=candidate;if(!this.detouring)this.side=sign;this.detouring=true;break;}
            }
          }
          if(selected!==undefined)break;
        }
      }
      if(selected===undefined)break;
      pos.x+=Math.cos(selected)*step;pos.y+=Math.sin(selected)*step;travel=selected;
    }
    return travel;
  }
}
