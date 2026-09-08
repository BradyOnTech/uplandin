import { expect, it } from 'vitest';
import * as THREE from 'three';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { WetBottomsSystem } from '../src/three/subsystems/wetBottoms';
import type { Ctx } from '../src/three/engine';

it('blocks shots through an actual alder stem but leaves shots above it open', () => {
  const system = new WetBottomsSystem(new LandscapeModel(getArea('woodcock-bottoms')));
  const ctx = { quality: 'lite', scene: new THREE.Scene(), camera:new THREE.PerspectiveCamera(), time:0 } as Ctx;
  system.init(ctx);
  const trunks = ctx.scene.getObjectByName('Alder Bottoms alder trunks') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4(); trunks.getMatrixAt(0, matrix);
  const center = new THREE.Vector3(-.18 - .24 * .12 ** 2, .12, .05 + .1 * .12 ** 2).applyMatrix4(matrix);
  const origin = center.clone().add(new THREE.Vector3(-1, 0, 0));
  const target = center.clone().add(new THREE.Vector3(1, 0, 0));
  expect(system.blocksShot(origin, target)).toBe(true);
  ctx.camera.position.set(5000,2,5000);
  system.update(ctx);
  expect(trunks.visible).toBe(false);
  expect(system.blocksShot(origin, target)).toBe(true);
  expect(system.blocksShot(origin, origin.clone().add(new THREE.Vector3(.1, 0, 0)))).toBe(false);
  expect(system.blocksShot(origin.clone().setY(100), target.clone().setY(100))).toBe(false);
  expect(system.collisionCircles()).toHaveLength(ctx.scene.children.filter(mesh=>mesh.name==='Alder Bottoms alder trunks').reduce((sum,mesh)=>sum+(mesh as THREE.InstancedMesh).count,0));
  system.dispose(ctx);
  expect(system.collisionCircles()).toHaveLength(0);
  expect(system.blocksShot(origin, target)).toBe(false);
});
