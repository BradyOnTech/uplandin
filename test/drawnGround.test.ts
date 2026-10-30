import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { CHUKAR_GROUND_DETAIL } from '../src/three/subsystems/chukarTerrain';
import { drawnQuailGroundHeight, quailGroundTileAt } from '../src/three/subsystems/quailGroundGeometry';
import { buildQuailTerrainGeometry } from '../src/three/subsystems/quailTerrain';

describe('the drawn ground a paw stands on', () => {
  it.each(['high', 'lite'] as const)('matches the %s Chukar tile triangles, near and far', quality => {
    const landscape = new LandscapeModel(getArea('chukar-ridge'));
    const detail = CHUKAR_GROUND_DETAIL[quality], material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const ray = new THREE.Raycaster(), random = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    let largest = 0;
    for (let n = 0; n < 24; n++) {
      // Points across the canyon wall, in world metres.
      const world = landscape.propertyToWorld(200 + random() * 1800, 150 + random() * 1100, { x: 0, z: 0 });
      const p = landscape.worldToProperty(world.x, world.z, { x: 0, y: 0 }), tile = quailGroundTileAt(landscape, p.x, p.y);
      const center = landscape.propertyToWorld(tile.x + tile.width / 2, tile.y + tile.depth / 2, { x: 0, z: 0 });
      for (const level of ['near', 'far'] as const) {
        const geometry = buildQuailTerrainGeometry(landscape, tile.x, tile.y, tile.width, tile.depth, detail[level]);
        const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld(true);
        ray.set(new THREE.Vector3(world.x, 2000, world.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(mesh)[0]; expect(hit).toBeDefined();
        // Seen from the tile's centre it draws near; from far off, its sunk far form.
        const view = level === 'near' ? center : { x: center.x + 5000, z: center.z };
        const drawn = drawnQuailGroundHeight(landscape, world.x, world.z, view.x, view.z, detail.range, () => detail, .15);
        expect(drawn).toBeCloseTo(hit.point.y - (level === 'far' ? .15 : 0), 3);
        if (level === 'near') largest = Math.max(largest, Math.abs(drawn - landscape.heightAtWorld(world.x, world.z)));
        geometry.dispose();
      }
    }
    // Why the dog needs it: on the canyon the drawn surface departs from the
    // smooth heightfield by more than a paw's thickness.
    expect(largest).toBeGreaterThan(.03);
  });
});
