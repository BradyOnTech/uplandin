import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import type { Ctx, Quality } from '../src/three/engine';
import { buildQuailTrackGeometry, quailTrackNetwork } from '../src/three/subsystems/quailTracks';
import { applyQuailSurfaceDetail, buildQuailTerrainGeometry, QuailTerrain } from '../src/three/subsystems/quailTerrain';
import { applyQuailTrackGroundLod, groundQuailTrackGeometry, QUAIL_GROUND_DIVISIONS, quailGroundNearDistance, quailGroundTileAt, quailGroundUsesNear } from '../src/three/subsystems/quailGroundGeometry';

const area = getArea('quail-fields');
afterEach(() => vi.restoreAllMocks());
function terrainRays(landscape: LandscapeModel, divisions: number) {
  const meshes = new Map<string, THREE.Mesh>(); const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ray = new THREE.Raycaster();
  return {
    height(x: number, z: number): number {
      const property = landscape.worldToProperty(x, z, { x: 0, y: 0 });
      const tile = quailGroundTileAt(landscape, property.x, property.y); const key = `${tile.x},${tile.y}`;
      let mesh = meshes.get(key);
      if (!mesh) {
        mesh = new THREE.Mesh(buildQuailTerrainGeometry(landscape, tile.x, tile.y, tile.width, tile.depth, divisions), material);
        mesh.updateMatrixWorld(true); meshes.set(key, mesh);
      }
      ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0]; expect(hit, `Actual terrain must exist beneath ${x},${z}`).toBeDefined();
      return hit.point.y;
    },
    dispose() { for (const mesh of meshes.values()) mesh.geometry.dispose(); material.dispose(); },
  };
}

describe('Quail road height follows rendered terrain LOD', () => {
  it.each(['south-gate', 'west-track'])('keeps real road vertices and branch interiors above both terrain meshes from %s', (drop) => {
    const landscape = new LandscapeModel(area, drop); const road = buildQuailTrackGeometry(landscape);
    const position = road.getAttribute('position'), far = road.getAttribute('quailFarGround'), colors = road.getAttribute('color');
    expect(far.count).toBe(position.count);
    const visible: number[] = [];
    for (let i = 0; i < position.count; i++) if (colors.getW(i) > .1) visible.push(i);
    const failure = landscape.propertyToWorld(763.934, 276.164, { x: 0, z: 0 });
    const failedVertex = visible.reduce((best, i) => Math.hypot(position.getX(i) - failure.x, position.getZ(i) - failure.z)
      < Math.hypot(position.getX(best) - failure.x, position.getZ(best) - failure.z) ? i : best, visible[0]);
    const sample = [failedVertex, ...visible.filter((_, n) => n % Math.max(1, Math.floor(visible.length / 75)) === 0)];
    for (const level of ['near', 'far'] as const) {
      const terrain = terrainRays(landscape, QUAIL_GROUND_DIVISIONS[level]);
      for (const i of sample) {
        const height = terrain.height(position.getX(i), position.getZ(i));
        const roadHeight = level === 'near' ? position.getY(i) : far.getX(i);
        expect(roadHeight - height).toBeCloseTo(.032, 4);
      }
      if (level === 'far') {
        const x = position.getX(failedVertex), z = position.getZ(failedVertex);
        // Reproduce the former bug against actual coarse triangle geometry.
        expect(landscape.heightAtWorld(x, z) + .032 - terrain.height(x, z)).toBeLessThan(-.06);
      }
      const geometry = road.clone(); const selected = geometry.getAttribute('position');
      if (level === 'far') for (let i = 0; i < selected.count; i++) selected.setY(i, far.getX(i));
      geometry.computeBoundingSphere(); const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld(true); const ray = new THREE.Raycaster();
      const bary = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      const points = [...quailTrackNetwork(area).branches.flatMap((p) => [{ x: p.x + .23, y: p.y + .31 }, { x: p.x - .41, y: p.y + .27 }]),
        { x: 763.934, y: 276.164 }, { x: 504, y: 678 }, { x: 22, y: 406 }, { x: 827.99, y: 226 }];
      for (const point of points) {
        const world = landscape.propertyToWorld(point.x, point.y, { x: 0, z: 0 });
        ray.set(new THREE.Vector3(world.x, 100, world.z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObject(mesh).filter((hit) => {
          const face = hit.face!; a.fromBufferAttribute(selected, face.a); b.fromBufferAttribute(selected, face.b); c.fromBufferAttribute(selected, face.c);
          THREE.Triangle.getBarycoord(hit.point, a, b, c, bary);
          return colors.getW(face.a) * bary.x + colors.getW(face.b) * bary.y + colors.getW(face.c) * bary.z > .1;
        });
        expect(hits.length).toBeGreaterThan(0);
        for (const hit of hits) {
          const clearance = hit.point.y - terrain.height(world.x, world.z);
          expect(clearance).toBeGreaterThan(.015);
          expect(clearance).toBeLessThan(.055);
        }
      }
      geometry.dispose(); material.dispose(); terrain.dispose();
    }
    road.dispose();
  });

  it.each<Quality>(['high', 'lite'])('switches actual terrain and road height at the same %s tile threshold', async (quality) => {
    // Image decoding belongs to the browser; exercise real terrain creation
    // and LOD selection with an already decoded texture at this boundary.
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockResolvedValue(new THREE.Texture());
    const landscape = new LandscapeModel(area); const terrain = new QuailTerrain(landscape);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const ctx = { scene, camera, quality } as Ctx; await terrain.init(ctx);
    const tile = quailGroundTileAt(landscape, 763.934, 276.164), threshold = quailGroundNearDistance(quality);
    const near = scene.getObjectByName(`Quail terrain ${tile.x},${tile.y} near`) as THREE.Mesh;
    const far = scene.getObjectByName(`Quail terrain ${tile.x},${tile.y} far`) as THREE.Mesh;
    expect(near.geometry.getAttribute('position').count).toBeGreaterThan(far.geometry.getAttribute('position').count);
    for (const offset of [-.01, 0, .01]) {
      camera.position.set(tile.centerX + threshold + offset, 1.7, tile.centerZ); terrain.update(ctx);
      const roadUsesNear = quailGroundUsesNear(tile.centerX, tile.centerZ, camera.position.x, camera.position.z, threshold);
      expect(near.visible).toBe(offset < 0); expect(far.visible).toBe(offset >= 0); expect(roadUsesNear).toBe(near.visible);
    }
    expect(near.receiveShadow).toBe(true); expect(far.receiveShadow).toBe(true);
    terrain.dispose(ctx);
  });

  it.each(['south-gate', 'west-track'])('keeps opaque road interiors above a realizable mixed-LOD seam from %s', (drop) => {
    const landscape = new LandscapeModel(area, drop), road = buildQuailTrackGeometry(landscape);
    const far = road.getAttribute('quailFarGround'), indices = road.index!;
    let mixedOwnerTriangles = 0;
    for (let n = 0; n < indices.count; n += 3) {
      const ids = [indices.getX(n), indices.getX(n + 1), indices.getX(n + 2)];
      if (ids.some((id) => far.getY(id) !== far.getY(ids[0]) || far.getZ(id) !== far.getZ(ids[0]))) mixedOwnerTriangles++;
    }
    expect(mixedOwnerTriangles).toBe(0);
    const nearTerrain = terrainRays(landscape, QUAIL_GROUND_DIVISIONS.near), farTerrain = terrainRays(landscape, QUAIL_GROUND_DIVISIONS.far);
    const right = quailGroundTileAt(landscape, 768.1, 268.677), left = quailGroundTileAt(landscape, 767.9, 268.677);
    for (const quality of ['high', 'lite'] as const) {
      const camera = { x: right.centerX + (quality === 'high' ? 40 : 0), z: right.centerZ }, distance = quailGroundNearDistance(quality);
      expect(quailGroundUsesNear(left.centerX, left.centerZ, camera.x, camera.z, distance)).toBe(false);
      expect(quailGroundUsesNear(right.centerX, right.centerZ, camera.x, camera.z, distance)).toBe(true);
      const geometry = road.clone(), p = geometry.getAttribute('position'), colors = geometry.getAttribute('color');
      for (let i = 0; i < p.count; i++) if (!quailGroundUsesNear(far.getY(i), far.getZ(i), camera.x, camera.z, distance)) p.setY(i, far.getX(i));
      geometry.computeBoundingSphere(); const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld(true); const ray = new THREE.Raycaster();
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), bary = new THREE.Vector3();
      for (const px of [767.988867, 767.96, 768.02, 768.06]) for (const py of [268.677127, 268.71]) {
        const world = landscape.propertyToWorld(px, py, { x: 0, z: 0 });
        ray.set(new THREE.Vector3(world.x, 100, world.z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObject(mesh).filter((hit) => {
          const f = hit.face!; a.fromBufferAttribute(p, f.a); b.fromBufferAttribute(p, f.b); c.fromBufferAttribute(p, f.c);
          THREE.Triangle.getBarycoord(hit.point, a, b, c, bary);
          return colors.getW(f.a) * bary.x + colors.getW(f.b) * bary.y + colors.getW(f.c) * bary.z > .1;
        });
        expect(hits.length).toBeGreaterThan(0);
        const terrainHeight = (px < 768 ? farTerrain : nearTerrain).height(world.x, world.z);
        for (const hit of hits) expect(hit.point.y - terrainHeight).toBeGreaterThan(.015);
      }
      geometry.dispose(); material.dispose();
    }
    nearTerrain.dispose(); farTerrain.dispose(); road.dispose();
  });

  it('splits seam crossings without changing their footprint, alpha interpolation or primitive order', () => {
    const landscape = new LandscapeModel(area), source = new THREE.BufferGeometry();
    const points = [[767.5, 268], [768.5, 268], [767.5, 270], [767.5, 268], [768.5, 268], [767.5, 270]];
    source.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(([x, y]) => {
      const p = landscape.propertyToWorld(x, y, { x: 0, z: 0 }); return [p.x, 0, p.z];
    }), 3));
    source.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, .7, 0, 1, 0, .7, 0, 1, 0, .7], 4));
    source.setIndex([0, 2, 1, 3, 5, 4]);
    const fitted = groundQuailTrackGeometry(landscape, source), p = fitted.getAttribute('position'), colors = fitted.getAttribute('color');
    const old = source.getAttribute('position'), index = fitted.index!;
    const originalArea = Math.abs((old.getX(1) - old.getX(0)) * (old.getZ(2) - old.getZ(0)));
    let areaSum = 0, greenStarted = false;
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      areaSum += Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) - (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a))) / 2;
      if (colors.getY(a) > .5) greenStarted = true; else expect(greenStarted).toBe(false);
    }
    expect(areaSum).toBeCloseTo(originalArea, 5);
    for (let i = 0; i < p.count; i++) if (colors.getX(i) > .5) {
      expect(colors.getW(i)).toBeCloseTo((p.getX(i) - old.getX(0)) / (old.getX(1) - old.getX(0)), 5);
    }
    source.dispose(); fitted.dispose();
  });

  it('composes height selection before standard projection and shadow coordinates without dropping surface detail', () => {
    const landscape = new LandscapeModel(area), material = new THREE.MeshLambertMaterial();
    applyQuailSurfaceDetail(material, landscape); applyQuailTrackGroundLod(material, 'lite');
    const shader = { vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
    expect((shader.uniforms as Record<string, { value: unknown }>).uQuailGroundNearDistance.value).toBe(105);
    expect(shader.fragmentShader).toContain('quailNoise'); expect(shader.vertexShader).toContain('vQuailGround =');
    const assignment = shader.vertexShader.indexOf('transformed.y = quailFarGround.x');
    expect(assignment).toBeGreaterThan(0);
    expect(assignment).toBeLessThan(shader.vertexShader.indexOf('#include <project_vertex>'));
    expect(assignment).toBeLessThan(shader.vertexShader.indexOf('#include <shadowmap_vertex>'));
    expect(shader.vertexShader).toContain('>= uQuailGroundNearDistance');
    expect(material.customProgramCacheKey()).toContain('quail-road-ground-lod-v1');
    material.dispose();
  });
});
