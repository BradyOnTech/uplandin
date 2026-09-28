import * as THREE from 'three';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';

type GroundPaint = (landscape: LandscapeModel, x: number, y: number, out: THREE.Color) => THREE.Color;

function axis(start: number, end: number, divisions: number): number[] {
  return Array.from({ length: divisions + 1 }, (_, i) => i === divisions ? end : start + (end - start) * i / divisions);
}

/** Four exterior strips share complete edge samples, not just corner points.
 * The old unequal grids required vertical skirts along visible hillsides.
 * Matching those edges removes the ledge itself; no interior skirt is drawn.
 * Heights and paint remain the same authoritative property-space functions.
 */
export function buildSharptailHorizonGeometries(landscape: LandscapeModel, paint: GroundPaint): THREE.BufferGeometry[] {
  const bounds = landscape.area.world, margin = 1000;
  const west = axis(bounds.x - margin, bounds.x, 42);
  const middle = axis(bounds.x, bounds.x + bounds.w, 56);
  const east = axis(bounds.x + bounds.w, bounds.x + bounds.w + margin, 42);
  const across = [...west, ...middle.slice(1), ...east.slice(1)];
  const north = axis(bounds.y - margin, bounds.y, 42);
  const inside = axis(bounds.y, bounds.y + bounds.h, 32);
  const south = axis(bounds.y + bounds.h, bounds.y + bounds.h + margin, 42);
  const grids = [
    { side: 'north', x: across, y: north },
    { side: 'south', x: across, y: south },
    { side: 'west', x: west, y: inside },
    { side: 'east', x: east, y: inside },
  ];
  const world = { x: 0, z: 0 }, color = new THREE.Color();
  const normal = new THREE.Vector3();
  return grids.map(grid => {
    const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
    for (const y of grid.y) for (const x of grid.x) {
      landscape.propertyToWorld(x, y, world);
      positions.push(world.x, landscape.heightAtProperty(x, y), world.z);
      // A one-yard central difference has the same stencil on either side
      // of a mesh join. Mesh-local face averaging would leave a light seam.
      const dx = (landscape.heightAtProperty(x + .5, y) - landscape.heightAtProperty(x - .5, y)) / PROPERTY_PX_TO_M;
      const dz = (landscape.heightAtProperty(x, y + .5) - landscape.heightAtProperty(x, y - .5)) / PROPERTY_PX_TO_M;
      normal.set(-dx, 1, -dz).normalize(); normals.push(normal.x, normal.y, normal.z);
      paint(landscape, x, y, color); colors.push(color.r, color.g, color.b);
    }
    const columns = grid.x.length;
    for (let z = 0; z < grid.y.length - 1; z++) for (let x = 0; x < columns - 1; x++) {
      const a = z * columns + x, b = a + columns;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeBoundingSphere();
    geometry.name = `Sharptail ${grid.side} horizon`;
    return geometry;
  });
}
