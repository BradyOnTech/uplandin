import * as THREE from 'three';

/** Leaf masses scatter some incoming light across their shaded shoulders.
 * Keep scene lights, cast shadows and time-of-day color authoritative: this
 * softens the Lambert terminator without adding an emissive glow. */
export function applyQuailFoliageLight(material: THREE.MeshLambertMaterial): void {
  material.onBeforeCompile = shader => {
    const lambert = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
      'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
      'float dotNL = saturate( (dot(geometryNormal, directLight.direction) + 0.40) / 1.40 );',
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_lambert_pars_fragment>', lambert);
  };
  material.customProgramCacheKey = () => 'quail-foliage-wrap-v1';
}

/** Reuse the six shared kit buffers while filtering individual roots. A
 * conservative 40 m shadow margin exceeds the kit's low-sun shadow reach;
 * shrubs just outside the view can still cast into it. */
export class QuailFoliageInstances {
  private matrices: THREE.Matrix4[] = [];
  private spheres: THREE.Sphere[] = [];
  private visible: number[] = [];
  constructor(readonly mesh: THREE.InstancedMesh) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.geometry.computeBoundingSphere();
    for (let i = 0; i < mesh.count; i++) {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); this.matrices.push(matrix);
      const sphere = mesh.geometry.boundingSphere!.clone().applyMatrix4(matrix);
      sphere.radius += 40; this.spheres.push(sphere); this.visible.push(i);
    }
  }
  update(frustum: THREE.Frustum): void {
    const visible: number[] = [];
    for (let i = 0; i < this.spheres.length; i++) if (frustum.intersectsSphere(this.spheres[i])) visible.push(i);
    if (visible.length === this.visible.length && visible.every((id, i) => id === this.visible[i])) return;
    this.visible = visible;
    visible.forEach((id, i) => this.mesh.setMatrixAt(i, this.matrices[id]));
    this.mesh.count = visible.length; this.mesh.visible = visible.length > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    // Retain the original enclosing sphere: compacting cannot make it too
    // small when a previously hidden root returns on a later camera turn.
  }
}
