import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { QuailFlushDebris } from '../src/three/quailFlushDebris';

it.each(['high', 'lite'] as const)('keeps %s covey disturbance bounded and releases its resources', quality => {
  const effect = new QuailFlushDebris(quality, () => 10);
  const scene = new THREE.Scene(); scene.add(effect.mesh);
  const position = effect.mesh.geometry.attributes.position.array;
  const disposeGeometry = vi.fn(), disposeMaterial = vi.fn();
  effect.mesh.geometry.addEventListener('dispose', disposeGeometry);
  effect.mesh.material.addEventListener('dispose', disposeMaterial);
  for (let bird = 0; bird < 40; bird++) effect.launch(bird % 10, 2, 1, 0, bird);
  effect.advance(300); effect.render();
  expect(effect.audit().visible).toBe(effect.capacity);
  expect(effect.mesh.geometry.drawRange.count).toBeLessThanOrEqual(effect.capacity * 6);
  expect(effect.mesh.geometry.groups).toHaveLength(0);
  expect(effect.mesh.geometry.attributes.position.array).toBe(position);
  expect(Array.from(position).every(Number.isFinite)).toBe(true);
  expect(effect.mesh.visible).toBe(true);
  effect.advance(1600); effect.render();
  expect(effect.mesh.visible).toBe(false);
  expect(effect.mesh.geometry.drawRange.count).toBe(0);
  effect.dispose();
  expect(scene.children).toHaveLength(0);
  expect(disposeGeometry).toHaveBeenCalledOnce(); expect(disposeMaterial).toHaveBeenCalledOnce();
});

it('leaves the first burst alive when a delayed bird kicks cover at its own position', () => {
  const effect = new QuailFlushDebris('high', () => 0);
  effect.launch(10, -8, 1, 0, 1);
  effect.advance(600);
  effect.launch(25, 12, 0, 1, 2);
  effect.render();
  expect(effect.audit()).toEqual({ launches: 2, visible: 16, capacity: 112 });
  const position = effect.mesh.geometry.attributes.position;
  for (let piece = 0; piece < 16; piece++) {
    const x = (position.getX(piece * 4) + position.getX(piece * 4 + 2)) / 2;
    const z = (position.getZ(piece * 4) + position.getZ(piece * 4 + 2)) / 2;
    expect(Math.hypot(x - (piece < 8 ? 10 : 25), z - (piece < 8 ? -8 : 12))).toBeLessThan(1.8);
  }
  effect.dispose();
});

it('plays the same cosmetic motion across frame subdivisions and settles on sloped terrain', () => {
  const ground = (x: number, z: number) => 10 + .1 * x + .02 * z;
  const a = new QuailFlushDebris('high', ground), b = new QuailFlushDebris('high', ground);
  a.launch(20, -10, 1, 0, 47); b.launch(20, -10, 1, 0, 47);
  a.advance(800);
  for (let i = 0; i < 24; i++) b.advance(1000 / 30);
  a.render(); b.render();
  const av = a.mesh.geometry.attributes.position, bv = b.mesh.geometry.attributes.position;
  expect(Array.from(av.array)).toEqual(Array.from(bv.array));
  for (let piece = 0; piece < 8; piece++) {
    const x = (av.getX(piece * 4) + av.getX(piece * 4 + 2)) / 2;
    const y = (av.getY(piece * 4) + av.getY(piece * 4 + 2)) / 2;
    const z = (av.getZ(piece * 4) + av.getZ(piece * 4 + 2)) / 2;
    expect(y).toBeGreaterThanOrEqual(ground(x, z) + .024);
  }
  a.dispose(); b.dispose();
});

it('uses correctly oriented finite normals for the long thin lit fragments', () => {
  const effect = new QuailFlushDebris('high', () => 0);
  effect.launch(0, 0, 1, 0, 51); effect.advance(200); effect.render();
  const { position, normal } = effect.mesh.geometry.attributes;
  for (let i = 0; i < 8; i++) {
    const a = new THREE.Vector3().fromBufferAttribute(position, i * 4);
    const b = new THREE.Vector3().fromBufferAttribute(position, i * 4 + 1);
    const c = new THREE.Vector3().fromBufferAttribute(position, i * 4 + 2);
    const geometric = b.sub(a).cross(c.sub(a)).normalize();
    const written = new THREE.Vector3().fromBufferAttribute(normal, i * 4);
    expect(written.length()).toBeCloseTo(1, 5);
    expect(written.dot(geometric)).toBeGreaterThan(.999);
    expect(a.distanceTo(new THREE.Vector3().fromBufferAttribute(position, i * 4 + 2))).toBeLessThan(.22);
  }
  effect.dispose();
});
