import * as THREE from 'three';

/** Bark: faceted, vertex-tinted, fully rough. */
export function plainsWoodMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
}

/**
 * Leaf clumps: faceted and vertex-lit, with a slow sway that grows with
 * height so trunks stay planted. `userData.time` is the uniform to advance.
 * Works for single meshes and instanced crowns alike.
 */
export function plainsFoliageMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true,
    emissive: 0x6d5a2c, emissiveIntensity: .12 });
  const time = { value: 0 };
  material.userData.time = time;
  material.customProgramCacheKey = () => 'plains-foliage-sway-v1';
  material.onBeforeCompile = shader => {
    shader.uniforms.uTreeTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTreeTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 treeOrigin = vec3(0.0);
        #ifdef USE_INSTANCING
        treeOrigin = instanceMatrix[3].xyz;
        #endif
        treeOrigin += modelMatrix[3].xyz;
        float treePhase = treeOrigin.x * .21 + treeOrigin.z * .17;
        float treeSway = sin(uTreeTime * .9 + treePhase) * .6 + sin(uTreeTime * 2.3 + treePhase * 1.7 + position.x * 3.0) * .4;
        float treeReach = smoothstep(.35, 1.0, position.y);
        transformed.x += treeSway * treeReach * .012;
        transformed.z += treeSway * treeReach * .008;`);
  };
  return material;
}
