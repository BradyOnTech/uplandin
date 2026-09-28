import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { expect, it, vi } from 'vitest';
import { SolidShotGeometry } from '../src/three/solidShotGeometry';

it('keeps the visible opening between transformed solid branches shootable', () => {
  const left = new THREE.BoxGeometry(.3, 3, .3).translate(-1, 0, 0);
  const right = new THREE.BoxGeometry(.3, 3, .3).translate(1, 0, 0);
  const top = new THREE.BoxGeometry(2.3, .3, .3).translate(0, 1.5, 0);
  const geometry = mergeGeometries([left, right, top])!;
  const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
  const mesh = new THREE.Mesh(geometry, material), parent = new THREE.Group(); parent.add(mesh);
  const solids = new SolidShotGeometry(); solids.add(mesh);
  parent.visible = mesh.visible = false; parent.position.set(7, 4, -9); parent.rotation.y = .7;
  parent.scale.set(1.5, .8, 2);
  const ray = (x: number, endZ = -1) => {
    // No explicit matrix refresh here; hidden scene updates cannot be relied on.
    parent.updateMatrix(); const start = new THREE.Vector3(x, 0, 1).applyMatrix4(parent.matrix);
    const end = new THREE.Vector3(x, 0, endZ).applyMatrix4(parent.matrix);
    return solids.blocks(start, end);
  };
  expect(ray(0)).toBe(false); // inside the broad bounds, through the real opening
  expect(ray(-1)).toBe(true);
  expect(ray(-1, .5)).toBe(false); // target before timber
  expect(material.side).toBe(THREE.FrontSide);
  const disposeGeometry = vi.spyOn(geometry, 'dispose'), disposeMaterial = vi.spyOn(material, 'dispose');
  solids.dispose(); solids.dispose(); expect(ray(-1)).toBe(false);
  expect(disposeGeometry).not.toHaveBeenCalled(); expect(disposeMaterial).not.toHaveBeenCalled();
  for (const g of [left, right, top, geometry]) g.dispose(); material.dispose();
});

it('blocks exit from a closed solid and follows current instanced world transforms', () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2), material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 2), parent = new THREE.Group(); parent.add(mesh);
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-4, 0, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, 0, 0));
  const solids = new SolidShotGeometry(); solids.add(mesh);
  parent.position.set(12, 5, -3); parent.visible = false;
  expect(solids.blocks({x:16,y:5,z:-3},{x:16,y:5,z:-8})).toBe(true); // inside second solid
  expect(solids.blocks({x:12,y:5,z:1},{x:12,y:5,z:-8})).toBe(false); // inter-instance gap
  expect(solids.blocks({x:16,y:8,z:1},{x:16,y:8,z:-8})).toBe(false); // above geometry
  parent.position.x = 20;
  expect(solids.blocks({x:24,y:5,z:1},{x:24,y:5,z:-8})).toBe(true);
  expect(solids.blocks({x:16,y:5,z:1},{x:16,y:5,z:-8})).toBe(true); // other instance now here
  expect(solids.blocks({x:8,y:5,z:1},{x:8,y:5,z:-8})).toBe(false);
  solids.dispose(); mesh.dispose(); geometry.dispose(); material.dispose();
});
