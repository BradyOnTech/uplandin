import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { sampleSharptailVegetationBands } from '../src/game/sharptailVegetationBands';
import type { Ctx } from '../src/three/engine';
import { SharptailMidSward, SHARPTAIL_MID_SWARD_BUDGET, sharptailMiddleBunchGeometry } from '../src/three/subsystems/sharptailMidSward';
import { buildSharptailHorizonGeometries } from '../src/three/subsystems/sharptailHorizonGeometry';
import { buildQuailTerrainGeometry } from '../src/three/subsystems/quailTerrain';
import { quailGroundTileAt, sampleQuailGroundHeights } from '../src/three/subsystems/quailGroundGeometry';
import { VegetationWind } from '../src/three/subsystems/vegetationWind';

function context(quality: 'high' | 'lite'): Ctx {
  return { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(70, 1440 / 810, .1, 1800), quality, time: 0 } as Ctx;
}
function roots(system: SharptailMidSward, landscape: LandscapeModel) {
  const result: { x: number; y: number; matrix: THREE.Matrix4; exterior: boolean }[] = [];
  const matrix = new THREE.Matrix4();
  for (const mesh of system.meshes) for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    const p = landscape.worldToProperty(matrix.elements[12], matrix.elements[14], { x: 0, y: 0 });
    result.push({ ...p, matrix: matrix.clone(), exterior: mesh.userData.exterior });
  }
  return result;
}

describe('Sharptail rooted middle-distance grass', () => {
  it('uses open curved basal leaves with actual height rather than a raised ground sheet', () => {
    const geometry = sharptailMiddleBunchGeometry();
    try {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
      expect(p.count / 3).toBe(SHARPTAIL_MID_SWARD_BUDGET.trianglesPerBunch);
      expect(geometry.boundingBox!.max.y).toBeGreaterThan(.65);
      expect(geometry.boundingBox!.max.y).toBeLessThan(.8);
      let grounded = 0;
      for (let i = 0; i < p.count; i++) {
        expect([p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)].every(Number.isFinite)).toBe(true);
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
        expect(n.getY(i)).toBe(1);
        expect(Math.hypot(p.getX(i), p.getZ(i))).toBeLessThan(.4);
        if (p.getY(i) === 0) {
          grounded++; expect(Math.hypot(p.getX(i), p.getZ(i))).toBeLessThan(.026);
        }
      }
      expect(grounded).toBeGreaterThanOrEqual(6);
      const color = geometry.getAttribute('color');
      const shades = Array.from({ length: color.count }, (_, i) => color.getX(i));
      expect(Math.max(...shades) / Math.min(...shades)).toBeLessThan(1.2);
      for (let i = 0; i < p.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
        const c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
        expect(b.sub(a).cross(c.sub(a)).length()).toBeGreaterThan(.001);
      }
    } finally { geometry.dispose(); }
  });

  it.each(['high', 'lite'] as const)('grounds %s exterior roots on the actual rendered triangle and retains interior contacts', quality => {
    const landscape = new LandscapeModel(getArea('sharptail-prairie'));
    const ctx = context(quality), system = new SharptailMidSward(landscape, ctx);
    const groundGeometries = buildSharptailHorizonGeometries(landscape, (_l, _x, _y, c) => c.set(0xffffff));
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const groundMeshes = groundGeometries.map(geometry => new THREE.Mesh(geometry, material));
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), foot = new THREE.Vector3();
    try {
      const all = roots(system, landscape), outside = all.filter(root => root.exterior), inside = all.filter(root => !root.exterior);
      expect(outside.length).toBeGreaterThan(400);
      expect(Math.min(...outside.map(root => root.x))).toBeLessThan(-390);
      expect(Math.max(...outside.map(root => root.y))).toBeGreaterThan(890);
      // Raycasting the builder's triangles independently guards against
      // repeating the analytic-height error that left shrubs above the mesh.
      for (let i = 0; i < outside.length; i += 23) {
        const root = outside[i], e = root.matrix.elements;
        ray.set(new THREE.Vector3(e[12], 500, e[14]), down);
        const hit = ray.intersectObjects(groundMeshes, false)[0];
        expect(hit).toBeDefined();
        expect(e[13] - hit.point.y).toBeCloseTo(-.01, 4);
        for (const localX of [-.025, .025]) {
          foot.set(localX, 0, 0).applyMatrix4(root.matrix);
          ray.set(new THREE.Vector3(foot.x, 500, foot.z), down);
          const support = ray.intersectObjects(groundMeshes, false)[0];
          expect(Math.abs(foot.y - support.point.y)).toBeLessThan(.016);
        }
      }
      for (let i = 0; i < inside.length; i += 79) {
        const root = inside[i];
        const projected = sampleQuailGroundHeights(landscape, root.x, root.y, undefined, { near: quality === 'lite' ? 24 : 48, far: 14 });
        const expected = Math.min(landscape.heightAtProperty(root.x, root.y), projected.nearY, projected.farY) - .01;
        expect(root.matrix.elements[13]).toBeCloseTo(expected, 3);
      }
      // Independently raycast actual near/far geometry at widely separated
      // interior roots, including the region that exposed the far-LOD hover.
      for (const [px, py] of [[1083, 243], [610, 560], [200, 420], [1320, 745]]) {
        const root = inside.reduce((best, current) => Math.hypot(current.x - px, current.y - py) < Math.hypot(best.x - px, best.y - py) ? current : best);
        const tile = quailGroundTileAt(landscape, root.x, root.y), e = root.matrix.elements;
        for (const divisions of [quality === 'lite' ? 24 : 48, 14]) {
          const geometry = buildQuailTerrainGeometry(landscape, tile.x, tile.y, tile.width, tile.depth, divisions);
          try {
            const mesh = new THREE.Mesh(geometry, material);
            ray.set(new THREE.Vector3(e[12], 500, e[14]), down);
            const hit = ray.intersectObject(mesh, false)[0];
            expect(hit).toBeDefined();
            expect(e[13] - hit.point.y).toBeLessThan(-.009);
            expect(hit.point.y - e[13]).toBeLessThan(.20);
          } finally { geometry.dispose(); }
        }
      }
      const triangles = all.length * SHARPTAIL_MID_SWARD_BUDGET.trianglesPerBunch;
      expect(triangles).toBeLessThanOrEqual(quality === 'high' ? SHARPTAIL_MID_SWARD_BUDGET.highTriangles : SHARPTAIL_MID_SWARD_BUDGET.liteTriangles);
      expect(new Set(system.meshes.map(mesh => mesh.geometry)).size).toBe(1);
      expect(new Set(system.meshes.map(mesh => mesh.material)).size).toBe(2);
      for (const mesh of system.meshes) {
        expect(mesh.castShadow || mesh.receiveShadow).toBe(false);
        expect((mesh.material as THREE.Material).transparent).toBe(false);
      }
      // One pass samples every bearing at representative positions. Count
      // submitted chunk triangles, including offscreen members of each chunk.
      let maximum = 0;
      const frustum = new THREE.Frustum(), projection = new THREE.Matrix4(), world = { x: 0, z: 0 };
      for (const [x, y] of [[135, 495], [26, 599], [650, 580], [985, 330], [1130, 470]]) {
        landscape.propertyToWorld(x, y, world);
        ctx.camera.position.set(world.x, landscape.heightAtProperty(x, y) + 1.7, world.z);
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
          ctx.camera.lookAt(world.x + Math.sin(angle) * 100, ctx.camera.position.y - 8, world.z + Math.cos(angle) * 100);
          ctx.camera.updateMatrixWorld(true); system.update(ctx);
          frustum.setFromProjectionMatrix(projection.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse));
          const submitted = system.meshes.filter(mesh => mesh.visible && frustum.intersectsObject(mesh))
            .reduce((sum, mesh) => sum + mesh.userData.triangles, 0);
          maximum = Math.max(maximum, submitted);
        }
      }
      expect(maximum).toBeLessThan(quality === 'lite' ? 104000 : 195000);
    } finally {
      system.dispose(ctx); groundGeometries.forEach(geometry => geometry.dispose()); material.dispose();
    }
    expect(ctx.scene.children).toHaveLength(0);
  }, 20000);

  it('keeps fixed roots across entry and tier and concentrates exterior grass into the shared bands', () => {
    const a = new LandscapeModel(getArea('sharptail-prairie'), 'south-gate');
    const b = new LandscapeModel(getArea('sharptail-prairie'), 'west-track');
    const highCtx = context('high'), liteCtx = context('lite');
    const high = new SharptailMidSward(a, highCtx), lite = new SharptailMidSward(b, liteCtx);
    try {
      const highRoots = roots(high, a), liteRoots = roots(lite, b);
      const key = (root: { x: number; y: number }) => `${root.x.toFixed(3)},${root.y.toFixed(3)}`;
      // Float32 local translations can differ by a fraction of a millimetre
      // between entries, so compare shared placement cells then coordinates.
      const step = SHARPTAIL_MID_SWARD_BUDGET.rootStepYards;
      const highCells = new Map<string, typeof highRoots>();
      for (const root of highRoots) {
        const cell = `${Math.floor(root.x / step)},${Math.floor(root.y / step)}`;
        const members = highCells.get(cell) ?? []; members.push(root); highCells.set(cell, members);
      }
      for (const root of liteRoots) {
        const other = highCells.get(`${Math.floor(root.x / step)},${Math.floor(root.y / step)}`)!
          .find(candidate => Math.hypot(root.x - candidate.x, root.y - candidate.y) < .0002)!;
        expect(other).toBeDefined();
        expect(Math.hypot(root.x - other.x, root.y - other.y)).toBeLessThan(.0002);
        // X/Z and plant identity remain fixed. Y may settle a little lower
        // on Lite because its coarser near mesh has a different surface.
        expect(Math.abs(root.matrix.elements[13] - other.matrix.elements[13])).toBeLessThan(.08);
      }
      expect(new Set(liteRoots.map(key)).size).toBe(liteRoots.length);
      const mask = { scrub: 0, grass: 0, litter: 0 };
      const sample = (x: number, y: number) => { sampleSharptailVegetationBands(x, y, mask); return mask.grass; };
      let bandArea = 0, openArea = 0;
      for (let y = 350; y < 900; y += 5) for (let x = -400; x < 0; x += 5) {
        if (sample(x + 2.5, y + 2.5) > .4) bandArea++; else if (sample(x + 2.5, y + 2.5) < .05) openArea++;
      }
      const outer = highRoots.filter(root => root.exterior);
      const bandDensity = outer.filter(root => sample(root.x, root.y) > .4).length / bandArea;
      const openDensity = outer.filter(root => sample(root.x, root.y) < .05).length / openArea;
      // A continuous background floor replaces the empty exterior, while
      // connected bands still carry materially denser grass.
      expect(bandDensity).toBeGreaterThan(openDensity * 6);
      for (const population of [highRoots, liteRoots]) {
        const band = population.filter(root => root.exterior && sample(root.x, root.y) > .68);
        const cells = new Map<string, number>();
        for (const root of band) {
          const cell = `${Math.floor(root.x / step)},${Math.floor(root.y / step)}`;
          cells.set(cell, (cells.get(cell) ?? 0) + 1);
        }
        // A grass band has several separately grounded crowns per occupied
        // cell. Making one isolated tuft larger cannot pass this condition.
        expect(band.length / cells.size).toBeGreaterThan(population === liteRoots ? 2.2 : 3.5);
        const localNeighbors = band.filter((_root, i) => i % 7 === 0).map(root => Math.min(...band
          .filter(other => other !== root && Math.abs(other.x - root.x) < step && Math.abs(other.y - root.y) < step)
          .map(other => Math.hypot(other.x - root.x, other.y - root.y) * .9144)));
        localNeighbors.sort((a, b) => a - b);
        expect(localNeighbors[Math.floor(localNeighbors.length / 2)]).toBeLessThan(1.5);
      }
    } finally { high.dispose(highCtx); lite.dispose(liteCtx); }
  }, 20000);

  it('shares live wind, collapses to grounded roots at both ranges, and releases owned GPU resources once', () => {
    const landscape = new LandscapeModel(getArea('sharptail-prairie')), ctx = context('lite'), wind = new VegetationWind();
    const clone = new THREE.MeshLambertMaterial(), texture = new THREE.Texture();
    clone.map = texture;
    const cloneDispose = vi.spyOn(clone, 'dispose'), textureDispose = vi.spyOn(texture, 'dispose');
    const system = new SharptailMidSward(landscape, ctx, wind, { material: clone, paint: (_x, _y, c) => c.set(0xffffff) });
    const geometryDispose = vi.spyOn(system.meshes[0].geometry, 'dispose');
    const materials = [...new Set(system.meshes.map(mesh => mesh.material as THREE.MeshLambertMaterial))];
    const disposes = materials.map(material => vi.spyOn(material, 'dispose'));
    const shaders = materials.map(material => {
      const shader = { vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, ctx.renderer); return shader;
    });
    const versions = system.meshes.map(mesh => mesh.instanceMatrix.version);
    for (const shader of shaders) {
      expect(shader.uniforms.uPrairieWind).toBe(wind.direction);
      expect(shader.uniforms.uPrairieWindStrength).toBe(wind.strength);
      expect(shader.vertexShader).toContain('prairieRoot + (position - prairieRoot) * prairieKeep');
      expect(shader.vertexShader).toContain('prairieBend * prairieKeep');
      expect(shader.fragmentShader).toContain('#include <opaque_fragment>');
      expect(shader.fragmentShader).not.toContain('discard');
      // The installed DoubleSide chunk flips a back face downward. As with
      // close grass, restore the sky-facing interpolated normal before light
      // evaluation so a thin blade cannot turn black when viewed from behind.
      expect(THREE.ShaderChunk.normal_fragment_begin).toContain('normal *= faceDirection');
      expect(shader.fragmentShader).toContain('#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
      expect(shader.fragmentShader.indexOf('normal = normalize(vNormal);')).toBeLessThan(shader.fragmentShader.indexOf('#include <lights_lambert_fragment>'));
    }
    ctx.camera.position.set(5000, 0, 5000); ctx.time = 11; system.update(ctx);
    expect(system.meshes.every(mesh => !mesh.visible)).toBe(true);
    expect(system.meshes.map(mesh => mesh.instanceMatrix.version)).toEqual(versions);
    expect(shaders.every(shader => shader.uniforms.uPrairieTime.value === 11)).toBe(true);
    system.dispose(ctx); system.dispose(ctx);
    expect(ctx.scene.children).toHaveLength(0);
    expect(cloneDispose).toHaveBeenCalledTimes(1); expect(geometryDispose).toHaveBeenCalledTimes(1);
    disposes.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1));
    expect(textureDispose).not.toHaveBeenCalled(); texture.dispose();
  }, 20000);
});
