import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel } from '../src/game/landscape';
import { FAR_COUNTRY_M, horizonLand, TERRAIN_APRON_M } from '../src/three/horizon';
import { buildFarTerrain } from '../src/three/farTerrain';

const GROUNDS = ['quail-fields', 'sharptail-prairie', 'pheasant-coverts', 'chukar-ridge'];

/** A landscape whose world and landform can be resized and reshaped, as
 * the Landform lane's bigger grounds will be. */
function reshaped(area: string, scale: number, lift: number) {
  const real = new LandscapeModel(getArea(area)), b = real.worldBounds();
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  return {
    area: real.area,
    worldBounds: () => ({ minX: cx + (b.minX - cx) * scale, maxX: cx + (b.maxX - cx) * scale, minZ: cz + (b.minZ - cz) * scale, maxZ: cz + (b.maxZ - cz) * scale }),
    heightAtWorld: (x: number, z: number) => real.heightAtWorld(cx + (x - cx) / scale, cz + (z - cz) / scale) + lift,
  };
}

describe('the far country', () => {
  it.each(GROUNDS)('builds %s\'s far country in one draw within its triangle budget on each tier', area => {
    const landscape = new LandscapeModel(getArea(area)), land = horizonLand(landscape);
    for (const [quality, budget] of [['high', 6500], ['lite', 4000]] as const) {
      const far = buildFarTerrain(landscape, land, quality)!;
      try {
        expect(far.mesh).toBeInstanceOf(THREE.Mesh);
        expect(Array.isArray(far.mesh.material)).toBe(false);
        expect(far.triangles).toBeLessThanOrEqual(budget);
        expect(far.mesh.geometry.getAttribute('position').count).toBe(far.triangles * 3);
      } finally { far.dispose(); }
    }
  });

  it.each(GROUNDS)('lays %s\'s far country outside the property, from the apron\'s edge to the horizon', area => {
    const landscape = new LandscapeModel(getArea(area)), b = landscape.worldBounds();
    const far = buildFarTerrain(landscape, horizonLand(landscape), 'lite')!;
    try {
      const pos = far.mesh.geometry.getAttribute('position');
      let minX = Infinity, maxX = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        // Nothing of it stands on the property itself.
        expect(x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ).toBe(true);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      }
      expect(minX).toBeLessThanOrEqual(b.minX - TERRAIN_APRON_M - FAR_COUNTRY_M + 1);
      expect(maxX).toBeGreaterThanOrEqual(b.maxX + TERRAIN_APRON_M + FAR_COUNTRY_M - 1);
    } finally { far.dispose(); }
  });

  it.each(GROUNDS)('meets %s\'s terrain apron at the landform\'s own height, just beneath it', area => {
    const landscape = new LandscapeModel(getArea(area)), b = landscape.worldBounds(), m = TERRAIN_APRON_M;
    const far = buildFarTerrain(landscape, horizonLand(landscape), 'high')!;
    try {
      const pos = far.mesh.geometry.getAttribute('position'), widen = far.mesh.geometry.getAttribute('aWiden');
      let checked = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const onEdge = (Math.abs(x - (b.minX - m)) < .01 || Math.abs(x - (b.maxX + m)) < .01) && z >= b.minZ - m - .01 && z <= b.maxZ + m + .01
          || (Math.abs(z - (b.minZ - m)) < .01 || Math.abs(z - (b.maxZ + m)) < .01) && x >= b.minX - m - .01 && x <= b.maxX + m + .01;
        if (!onEdge || widen.getX(i) !== 0) continue;
        const ground = landscape.heightAtWorld(x, z);
        expect(pos.getY(i)).toBeLessThan(ground);
        expect(pos.getY(i)).toBeGreaterThan(ground - 2);
        checked++;
      }
      expect(checked).toBeGreaterThan(20);
    } finally { far.dispose(); }
  });

  it.each(GROUNDS)('follows %s when the ground is resized and reshaped, with nothing pinned to today\'s world', area => {
    const today = new LandscapeModel(getArea(area)), bigger = reshaped(area, 2.4, 30);
    const a = buildFarTerrain(today, horizonLand(today), 'lite')!, z = buildFarTerrain(bigger, horizonLand(bigger), 'lite')!;
    try {
      a.mesh.geometry.computeBoundingBox(); z.mesh.geometry.computeBoundingBox();
      const ba = a.mesh.geometry.boundingBox!, bz = z.mesh.geometry.boundingBox!;
      const grow = (bigger.worldBounds().maxX - bigger.worldBounds().minX) - (today.worldBounds().maxX - today.worldBounds().minX);
      expect((bz.max.x - bz.min.x) - (ba.max.x - ba.min.x)).toBeCloseTo(grow, 0);
      // The far country rides on the reshaped landform's datum.
      expect((bz.min.y + bz.max.y) / 2).toBeGreaterThan((ba.min.y + ba.max.y) / 2 + 20);
    } finally { a.dispose(); z.dispose(); }
  });

  it('keeps Cattail\'s section country flat, with its built things standing up from it', () => {
    const landscape = new LandscapeModel(getArea('pheasant-coverts')), land = horizonLand(landscape);
    const far = buildFarTerrain(landscape, land, 'high')!;
    try {
      const pos = far.mesh.geometry.getAttribute('position'), widen = far.mesh.geometry.getAttribute('aWiden');
      let tallest = -Infinity, poles = 0;
      for (let i = 0; i < pos.count; i++) {
        tallest = Math.max(tallest, pos.getY(i) - land.datum);
        if (widen.getX(i) !== 0 || widen.getZ(i) !== 0) poles++;
      }
      // A grain elevator stands well above the trees; poles keep a width floor.
      expect(tallest).toBeGreaterThan(40);
      expect(poles).toBeGreaterThan(40 * 6);
    } finally { far.dispose(); }
  });

  it('opens Chukar\'s far rims into the river\'s gorge where the land drains', () => {
    const landscape = new LandscapeModel(getArea('chukar-ridge')), land = horizonLand(landscape);
    const far = buildFarTerrain(landscape, land, 'high')!;
    try {
      const pos = far.mesh.geometry.getAttribute('position');
      let low = Infinity, high = -Infinity;
      for (let i = 0; i < pos.count; i++) { low = Math.min(low, pos.getY(i)); high = Math.max(high, pos.getY(i)); }
      expect(low).toBeLessThan(land.datum - 40);
      expect(high).toBeGreaterThan(land.datum + 150);
    } finally { far.dispose(); }
  });

  it('builds nothing for a ground without a region profile', () => {
    const landscape = new LandscapeModel(getArea('grouse-woods'));
    expect(buildFarTerrain(landscape, horizonLand(landscape), 'high')).toBeNull();
  });
});
