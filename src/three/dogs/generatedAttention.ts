import * as THREE from 'three';
import type { createGeneratedGsp } from './generatedGsp';

/** Apply after the base pose/contact solve. Neck and head share a restrained
 * look offset; the root and feet remain under the movement controller. */
export class GeneratedAttention {
  yaw=0;
  pitch=0;
  private local=new THREE.Vector3();
  private head=new THREE.Vector3();
  update(asset:ReturnType<typeof createGeneratedGsp>,target:THREE.Vector3|null,dt:number) {
    let yaw=0,pitch=0;
    if(target) {
      asset.root.updateMatrixWorld(true);
      asset.joints.head.getWorldPosition(this.head);
      asset.root.worldToLocal(this.head);
      this.local.copy(target);asset.root.worldToLocal(this.local);this.local.sub(this.head);
      yaw=THREE.MathUtils.clamp(Math.atan2(this.local.x,this.local.z),-.65,.65);
      pitch=THREE.MathUtils.clamp(Math.atan2(this.local.y,Math.hypot(this.local.x,this.local.z)),-.35,.45);
    }
    const blend=1-Math.exp(-Math.max(0,dt)*7);
    this.yaw=THREE.MathUtils.lerp(this.yaw,yaw,blend);
    this.pitch=THREE.MathUtils.lerp(this.pitch,pitch,blend);
    asset.joints.neck.rotation.y+=this.yaw*.6;
    asset.joints.head.rotation.y+=this.yaw*.4;
    asset.joints.neck.rotation.x-=this.pitch*.45;
    asset.joints.head.rotation.x-=this.pitch*.55;
    asset.root.updateMatrixWorld(true);
  }
}
