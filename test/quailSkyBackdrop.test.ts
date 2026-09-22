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
  it.each<[string, Quality]>([['quail-fields', 'high'], ['quail-fields', 'lite'], ['chukar-ridge', 'high'], ['chukar-ridge', 'lite'], ['pheasant-coverts', 'high'], ['pheasant-coverts', 'lite'], ['sharptail-prairie', 'high'], ['sharptail-prairie', 'lite']])('draws the %s %s backdrop behind every opaque world surface', (area, quality) => {
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

  it('keeps the Sharptail skyline decorative from its elevated prairie shoulders', () => {
    const area = 'sharptail-prairie';
    const f = fixture(area);
    try {
      const worldPositions = f.world.map(mesh => mesh.position.clone());
      for (const elevation of [2, 12, 22]) {
        f.camera.position.set(120, elevation, -35); f.sky.update(f.ctx);
        for (const ridge of f.ridges) {
          expect(ridge.position.y).toBeCloseTo(elevation * .72);
          expect(ridge.renderOrder).toBeLessThan(f.world[1].renderOrder);
          expect((ridge.material as THREE.ShaderMaterial).depthTest).toBe(false);
        }
      }
      f.world.forEach((mesh, index) => expect(mesh.position.toArray()).toEqual(worldPositions[index].toArray()));
    } finally { f.dispose(); }
  });
});


describe('Chukar climbing shadow coverage',()=>{
  it('keeps nearby plants inside the evening shadow camera at the upper benches',()=>{
    const f=fixture('chukar-ridge'),landscape=new LandscapeModel(getArea('chukar-ridge'));
    try{
      f.ctx.events.dispatchEvent(new CustomEvent('tod',{detail:'evening'}));
      const sun=f.ctx.scene.children.find((o):o is THREE.DirectionalLight=>o instanceof THREE.DirectionalLight&&o.castShadow)!;
      for(const [x,y] of [[658,575],[859,437],[1010,250]]){
        const p=landscape.propertyToWorld(x,y,{x:0,z:0}),ground=landscape.heightAtProperty(x,y);
        f.camera.position.set(p.x,ground+1.62,p.z);f.camera.lookAt(p.x+50,ground+1.62,p.z-50);
        f.sky.update(f.ctx);f.ctx.scene.updateMatrixWorld(true);sun.shadow.updateMatrices(sun);
        for(const ahead of [0,8,16]){
          const px=p.x+ahead,pz=p.z-ahead,h=landscape.heightAtWorld(px,pz);
          const projected=new THREE.Vector3(px,h+.6,pz).project(sun.shadow.camera);
          expect(Math.abs(projected.x)).toBeLessThan(1);expect(Math.abs(projected.y)).toBeLessThan(1);
          expect(projected.z).toBeGreaterThan(-1);expect(projected.z).toBeLessThan(1);
        }
      }
    }finally{f.dispose();}
  });
});
