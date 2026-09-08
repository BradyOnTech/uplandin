import * as THREE from 'three';
import { expect, it } from 'vitest';
import { QuailFoliageInstances } from '../src/three/subsystems/quailFoliage';

it('filters distant off-camera roots, preserves nearby shadow casters and restores compacted roots on a turn', () => {
  const geometry = new THREE.BoxGeometry(1, 2, 1), material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 4);
  const roots = [[0, 0, -100], [75, 0, -100], [-200, 0, -100], [0, 0, 100]];
  roots.forEach(([x,y,z], i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x,y,z)));
  mesh.computeBoundingSphere();
  const bounds = mesh.boundingSphere!.clone(), filter = new QuailFoliageInstances(mesh);
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 500), frustum = new THREE.Frustum();
  const turn = (z: number) => {
    camera.lookAt(0, 0, z); camera.updateMatrixWorld(true);
    frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    filter.update(frustum);
  };
  const positions = () => Array.from({ length: mesh.count }, (_, i) => {
    const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix);
    return new THREE.Vector3().setFromMatrixPosition(matrix).toArray();
  });
  try {
    turn(-100);
    // This root itself is outside the camera but can cast into the view.
    expect(frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(75,0,-100), 2))).toBe(false);
    expect(positions()).toEqual([roots[0], roots[1]]);
    const version = mesh.instanceMatrix.version;
    turn(-100); expect(mesh.instanceMatrix.version).toBe(version);
    turn(100); expect(positions()).toEqual([roots[3]]);
    turn(-100); expect(positions()).toEqual([roots[0], roots[1]]);
    expect(mesh.boundingSphere).toEqual(bounds);
    camera.position.set(1000,0,0); turn(100);
    // Point away from every root; then return after the empty batch.
    camera.lookAt(2000,0,0); camera.updateMatrixWorld(true);
    frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    filter.update(frustum); expect(mesh.count).toBe(0); expect(mesh.visible).toBe(false);
    camera.position.set(0,0,0); turn(-100);
    expect(mesh.visible).toBe(true); expect(positions()).toEqual([roots[0], roots[1]]);
  } finally { mesh.dispose(); geometry.dispose(); material.dispose(); }
});
