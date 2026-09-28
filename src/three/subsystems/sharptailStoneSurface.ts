import * as THREE from 'three';

/** One mipmapped mineral/lichen albedo shared by the prairie stones. Local
 * triplanar coordinates avoid UV seams on the irregular fracture planes.
 * Vertex colors and the real mesh lighting remain authoritative. */
export function createSharptailStoneSurface(base: THREE.MeshLambertMaterial): {
  material: THREE.MeshLambertMaterial; dispose(): void;
} {
  const material = base.clone();
  const albedo = { value: null as THREE.Texture | null }, ready = { value: 0 };
  let disposed = false;
  material.customProgramCacheKey = () => 'sharptail-granite-surface-v1';
  material.onBeforeCompile = shader => {
    shader.uniforms.uPrairieStone = albedo; shader.uniforms.uPrairieStoneReady = ready;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStonePosition; varying vec3 vStoneNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStonePosition = position; vStoneNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uPrairieStone; uniform float uPrairieStoneReady;
varying vec3 vStonePosition; varying vec3 vStoneNormal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 stoneWeights = pow(abs(normalize(vStoneNormal)), vec3(8.0));
stoneWeights /= max(dot(stoneWeights, vec3(1.0)), .001);
vec3 stoneP = vStonePosition / 3.8;
vec3 stoneAlbedo = texture2D(uPrairieStone, stoneP.zy).rgb * stoneWeights.x
  + texture2D(uPrairieStone, stoneP.xz).rgb * stoneWeights.y
  + texture2D(uPrairieStone, stoneP.xy).rgb * stoneWeights.z;
diffuseColor.rgb *= mix(vec3(1.0), clamp(stoneAlbedo / .2655183, vec3(.45), vec3(1.6)), .85 * uPrairieStoneReady);`);
  };
  // Geometry/collision construction is synchronous. The stone remains a
  // valid vertex-colored asset if a texture cannot load or this is headless.
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/terrain/sharptail-granite-v1.webp`, loaded => {
      if (disposed) return;
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.wrapS = loaded.wrapT = THREE.RepeatWrapping;
      loaded.minFilter = THREE.LinearMipmapLinearFilter; loaded.magFilter = THREE.LinearFilter;
      loaded.needsUpdate = true; ready.value = 1;
    }, undefined, () => { ready.value = 0; });
    albedo.value = texture;
  }
  return { material, dispose() {
    if (disposed) return;
    disposed = true; ready.value = 0;
    albedo.value?.dispose(); albedo.value = null; material.dispose();
  } };
}
