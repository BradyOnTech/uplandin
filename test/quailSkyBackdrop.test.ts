import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx, Quality } from '../src/three/engine';
import { SkySystem } from '../src/three/subsystems/sky';

function fixture(areaId: string, quality: Quality = 'high') {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 1, .05, 1600);
  const landscape = new LandscapeModel(getArea(areaId));
  const ctx = { scene, camera, quality, timeOfDay: 'noon', events: new EventTarget(),
    renderer: { toneMappingExposure: 1 } } as unknown as Ctx;
  // Both real-world surfaces use the default opaque ordering, regardless of
  // whether their distance lies inside or beyond a decorative ridge ring.
  const world = [100, 900].map(distance => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
    mesh.position.z = -distance; scene.add(mesh); return mesh;
  });
  const sky = new SkySystem(landscape); sky.init(ctx); sky.update(ctx);
  const meshes = scene.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
  const dome = meshes.find(mesh => mesh.geometry instanceof THREE.SphereGeometry)!;
  const ridges = meshes.filter(mesh => mesh.geometry.hasAttribute('aHaze'));
  return { dome, ridges, world, camera, sky, ctx, dispose: () => {
    sky.dispose(ctx);
    world.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
  } };
}

describe('Decorative skyline ordering', () => {
  it.each<[string, Quality]>([['quail-fields', 'high'], ['quail-fields', 'lite'], ['chukar-ridge', 'high'], ['chukar-ridge', 'lite'], ['pheasant-coverts', 'high'], ['pheasant-coverts', 'lite']])('draws the %s %s backdrop behind every opaque world surface', (area, quality) => {
    const f = fixture(area, quality);
    try {
      expect(f.ridges.length).toBeGreaterThan(1);
      const ordered = [...f.ridges].reverse(); // authored layers run near to far
      const all = [f.dome, ...ordered, ...f.world];
      expect([...all].sort((a, b) => a.renderOrder - b.renderOrder).map(mesh => mesh.id))
        .toEqual(all.map(mesh => mesh.id));
      for (const ridge of f.ridges) {
        expect(ridge.renderOrder).toBeGreaterThan(f.dome.renderOrder);
        expect(ridge.renderOrder).toBeLessThan(f.world[0].renderOrder);
        const material = ridge.material as THREE.ShaderMaterial;
        expect(material.transparent).toBe(false); // same opaque render queue
        expect(material.depthTest).toBe(false);
        expect(material.depthWrite).toBe(false); // cannot hide a distant trunk/base
      }
    } finally { f.dispose(); }
  });

  it('keeps the pheasant decorative horizon following elevated camera views without moving real terrain', () => {
    const f=fixture('pheasant-coverts');
    try {
      const worldPositions=f.world.map(mesh=>mesh.position.clone());
      f.camera.position.set(120,20,-35);f.sky.update(f.ctx);
      for(const ridge of f.ridges)expect(ridge.position.toArray()).toEqual([120,14,-35]);
      f.world.forEach((mesh,i)=>expect(mesh.position.toArray()).toEqual(worldPositions[i].toArray()));
      f.camera.position.y=40;f.sky.update(f.ctx);
      for(const ridge of f.ridges)expect(ridge.position.y).toBe(28);
    } finally {f.dispose();}
  });

  it.each(['sharptail-prairie'])('preserves %s ridge depth and ordering', area => {
    const f = fixture(area);
    try {
      expect(f.dome.renderOrder).toBe(-30);
      f.ridges.forEach((ridge, layer) => {
        expect(ridge.renderOrder).toBe(10 - layer);
        expect((ridge.material as THREE.ShaderMaterial).depthTest).toBe(true);
        expect((ridge.material as THREE.ShaderMaterial).depthWrite).toBe(false);
      });
    } finally { f.dispose(); }
  });
});
