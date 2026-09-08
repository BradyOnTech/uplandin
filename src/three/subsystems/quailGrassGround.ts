import * as THREE from 'three';

/**
 * A batch owns only its instance ground values. Leaf/index/morph buffers remain
 * shared with the source, while mutable bounds and draw groups are independent.
 * grounds contains (farY - nearY, tile center world X, tile center world Z).
 */
export function createQuailGrassGroundGeometry(source: THREE.BufferGeometry, grounds: Float32Array): THREE.BufferGeometry {
  if (grounds.length % 3 !== 0) throw new Error('Quail grass ground data needs three floats per instance.');
  const geometry = new THREE.BufferGeometry();
  geometry.name = source.name;
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(source.index);
  geometry.morphAttributes = { ...source.morphAttributes };
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  geometry.groups = source.groups.map((group) => ({ ...group }));
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  geometry.userData = { ...source.userData };
  geometry.setAttribute('quailInstanceGround', new THREE.InstancedBufferAttribute(grounds, 3));
  return geometry;
}

/**
 * Call after leaf variation/wind edits. Terrain chooses near only below the
 * tile-center cutoff; equality selects far. Grass batches have identity model
 * transforms, with world placement/scale/slope held in instanceMatrix. Applying
 * the vertical offset after that matrix avoids rotating or scaling the offset.
 * Both projection and standard receiver-shadow coordinates use the same shift.
 */
export function applyQuailGrassGroundLod(shader: THREE.WebGLProgramParametersWithUniforms, nearDistance: number): void {
  shader.uniforms.uQuailGrassGroundNearDistance = { value: nearDistance };
  const project = THREE.ShaderChunk.project_vertex.replace(
    'mvPosition = modelViewMatrix * mvPosition;',
    `#ifdef USE_INSTANCING
  mvPosition.y += quailGrassGroundShift;
#endif
mvPosition = modelViewMatrix * mvPosition;`,
  );
  const world = THREE.ShaderChunk.worldpos_vertex.replace(
    'worldPosition = modelMatrix * worldPosition;',
    `#ifdef USE_INSTANCING
  worldPosition.y += quailGrassGroundShift;
#endif
worldPosition = modelMatrix * worldPosition;`,
  );
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
#ifdef USE_INSTANCING
  attribute vec3 quailInstanceGround;
  uniform float uQuailGrassGroundNearDistance;
#endif`)
    .replace('#include <project_vertex>', `#ifdef USE_INSTANCING
  float quailGrassGroundShift = 0.0;
  if (length(quailInstanceGround.yz - cameraPosition.xz) >= uQuailGrassGroundNearDistance) {
    quailGrassGroundShift = quailInstanceGround.x;
  }
#endif
${project}`)
    .replace('#include <worldpos_vertex>', world);
}
