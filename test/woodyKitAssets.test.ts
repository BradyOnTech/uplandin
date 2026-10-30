import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** Bounds of each named mesh in a GLB the woody kit exported (y up). */
function glbMeshBounds(path: string): Record<string, { min: number[]; max: number[] }> {
  const file = readFileSync(path), length = file.readUInt32LE(12);
  const gltf = JSON.parse(file.subarray(20, 20 + length).toString('utf8'));
  const out: Record<string, { min: number[]; max: number[] }> = {};
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    const accessor = gltf.accessors[primitive.attributes.POSITION];
    out[mesh.name] = { min: accessor.min, max: accessor.max };
  }
  return out;
}

/** Bounds over every mesh whose name has `part` in it (foliage cards and
 * their cores, or wood). */
function partBounds(meshes: Record<string, { min: number[]; max: number[] }>, part: string): { min: number[]; max: number[] } {
  const parts = Object.entries(meshes).filter(([name]) => name.includes(part)).map(([, bounds]) => bounds);
  return { min: [0, 1, 2].map(k => Math.min(...parts.map(b => b.min[k]))), max: [0, 1, 2].map(k => Math.max(...parts.map(b => b.max[k]))) };
}

describe('the Red Plains woody kit', () => {
  const kit = (name: string) => glbMeshBounds(`public/models/woody-kit/${name}.glb`);
  it('grows sand plum open at ground level, closed above', () => {
    for (const detail of ['high', 'lite']) {
      const meshes = kit(`sand-plum-${detail}`);
      const foliage = partBounds(meshes, 'foliage');
      // Leaves start a fifth of the way up or more: the covey's shade beneath.
      expect(foliage.min[1] / foliage.max[1]).toBeGreaterThan(.18);
      // Rounded and spreading: wider than tall.
      expect(Math.max(foliage.max[0] - foliage.min[0], foliage.max[2] - foliage.min[2])).toBeGreaterThan(foliage.max[1] * 1.2);
    }
  });

  it('spreads mesquite wider than it is tall, on trunks leaning out from the ground', () => {
    for (const detail of ['high', 'lite', 'far']) {
      const meshes = kit(`mesquite-${detail}`);
      const foliage = partBounds(meshes, 'foliage');
      const wood = partBounds(meshes, 'wood');
      const spread = Math.max(foliage.max[0] - foliage.min[0], foliage.max[2] - foliage.min[2]);
      expect(spread).toBeGreaterThan(foliage.max[1] * 1.1);
      // The crown droops low at its edges instead of sitting on a pole.
      expect(foliage.min[1]).toBeLessThan(foliage.max[1] * .45);
      expect(wood.min[1]).toBeLessThan(.05);
    }
  });

  it('keeps every far thicket on the ground', () => {
    for (const name of ['sand-plum-far', 'shinnery-far', 'sand-sage-far']) {
      const lowest = Math.min(...Object.values(kit(name)).map(bounds => bounds.min[1]));
      expect(lowest).toBeLessThan(.08);
    }
  });
});
