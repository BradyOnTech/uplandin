import * as THREE from 'three';
import type { WindStrength } from '../../game/wind';
import type { Ctx } from '../engine';
import type { Hunt3DSystem } from './hunt3d';

/** Presentation response only. The strongest setting retains each plant's
 * existing maximum displacement; scent, flight and weather remain untouched. */
export function vegetationWindStrength(strength:WindStrength):number {
  return strength==='calm'?.25:strength==='strong'?1:.65;
}

/** Stable objects shared by visible/depth materials. Wind angles are TOWARD
 * in the hunt's X/Y plane, which maps directly onto world X/Z (also the HUD).
 * Read the live hunt snapshot, with trigonometry only when its angle changes. */
export class VegetationWind {
  readonly direction={value:new THREE.Vector2(1,0)};
  readonly strength={value:0};
  private hunt?:Hunt3DSystem;
  private lastAngle=NaN;
  private lastStrength?:WindStrength;

  connect(ctx:Ctx):void {
    // Standalone environment tools can omit the simulation. Such a view has
    // no authoritative wind, so it stays still rather than inventing weather.
    try {this.hunt=ctx.get<Hunt3DSystem>('hunt3d');} catch {this.hunt=undefined;}
    this.lastAngle=NaN;this.lastStrength=undefined;this.update();
  }

  update():void {
    if(!this.hunt){this.strength.value=0;return;}
    const hunt=this.hunt.huntState();
    if(!Number.isFinite(hunt.wind)){this.strength.value=0;this.lastStrength=undefined;return;}
    if(hunt.wind!==this.lastAngle){
      this.direction.value.set(Math.cos(hunt.wind),Math.sin(hunt.wind));this.lastAngle=hunt.wind;
    }
    if(hunt.windStrength!==this.lastStrength){
      this.strength.value=vegetationWindStrength(hunt.windStrength);this.lastStrength=hunt.windStrength;
    }
  }
}

/** Positive, bounded gusts establish the downwind lean. Unlike a centered
 * oscillation, the field never appears to reverse its prevailing wind. */
export const VEGETATION_GUST_GLSL=/* glsl */`
float vegetationGust(float time,vec2 root,vec2 toward) {
  float along=dot(root,toward);
  return .58+.26*sin(time*1.4-along*.22)+.16*sin(time*.63-along*.07);
}
`;

/** Undo rotation AND non-uniform scale for an exact horizontal world bend.
 * Instances are rotation/scale/translation without shear; dotting against
 * their orthogonal columns gives the inverse without a matrix inverse.
 * The minimum horizontal scale preserves the old displacement envelope. */
export const VEGETATION_INSTANCE_WIND_GLSL=/* glsl */`
#ifdef USE_INSTANCING
vec3 vegetationInstanceWind(vec2 toward) {
  vec3 a=instanceMatrix[0].xyz,b=instanceMatrix[1].xyz,c=instanceMatrix[2].xyz;
  vec3 world=vec3(toward.x,0.,toward.y);
  float aa=max(dot(a,a),.000001),bb=max(dot(b,b),.000001),cc=max(dot(c,c),.000001);
  return vec3(dot(a,world)/aa,dot(b,world)/bb,dot(c,world)/cc)*sqrt(min(aa,cc));
}
#endif
`;
